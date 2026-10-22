// GDPR (CLAUDE.md §6): exportul datelor, ștergerea datelor unui client și ștergerea automată,
// fiecare limitată la service-ul (tenantul) care o cere.
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listAudit, type Actor } from "@/server/admin/audit";
import { createUserWithTemporaryPassword } from "@/server/auth/users";
import { hashBookingToken } from "@/server/booking/token";
import { reserveOnlineBooking } from "@/server/booking/reserve";
import { closeDb } from "@/server/db/client";
import { bookingAccessTokens, bookings, customerConsents, customers } from "@/server/db/schema";
import { eraseCustomer, findCustomers } from "@/server/gdpr/erase";
import { bookingsCsv, customersCsv, exportForAdmin } from "@/server/gdpr/export";
import { purgeGlobalData, purgeTenantData, retentionCutoff } from "@/server/gdpr/retention";
import { hitRateLimit } from "@/server/security/rate-limit";
import { resolveBookingToken, withTenant, type TenantId } from "@/server/tenant";
import { bookingRequest, catalogIds, FRIDAY_8, HOUR, NOW, seedFreshTenant } from "./booking-helpers";
import { closeOwnerDb, ownerDb } from "./owner-db";

const TZ = "Europe/Bucharest";
const DAY = 24 * HOUR;
const PHONE = "+40721555001";

let tenantA: TenantId;
let tenantB: TenantId;
let ownerA: Actor;
let ionId: string;
let ionFutureToken: string;
let ionPastBooking: string;
let mariaId: string;

async function customerByPhone(tenantId: string, phone: string) {
  const [row] = await ownerDb()
    .select()
    .from(customers)
    .where(and(eq(customers.tenantId, tenantId), eq(customers.phoneE164, phone)));
  return row;
}

beforeAll(async () => {
  tenantA = await seedFreshTenant("gdpr-a");
  tenantB = await seedFreshTenant("gdpr-b");
  const idsA = await catalogIds(tenantA);
  const idsB = await catalogIds(tenantB);
  const { userId } = await createUserWithTemporaryPassword({
    phone: "0712 000 077",
    name: "Patron GDPR",
    membership: { tenantId: tenantA, role: "owner" },
  });
  ownerA = { actorUserId: userId, actorKind: "owner" };

  // Ion: două programări în A (una devine „din trecut”), plus un client cu același telefon în B.
  const ion = { fullName: "Ion Popescu", phoneE164: PHONE, plate: "AG12XYZ" };
  const future = await reserveOnlineBooking(tenantA, bookingRequest(idsA, { customer: ion }), { now: NOW });
  const past = await reserveOnlineBooking(tenantA, bookingRequest(idsA, { customer: ion, startsAt: FRIDAY_8 + 2 * HOUR }), { now: NOW });
  const inB = await reserveOnlineBooking(tenantB, bookingRequest(idsB, { customer: { ...ion, fullName: "Ion din B" } }), { now: NOW });
  const maria = await reserveOnlineBooking(
    tenantB,
    bookingRequest(idsB, { customer: { fullName: "Maria Ionescu", phoneE164: "+40721555002", plate: null }, startsAt: FRIDAY_8 + 2 * HOUR }),
    { now: NOW },
  );
  const hack = await reserveOnlineBooking(
    tenantA,
    bookingRequest(idsA, { customer: { fullName: "=1+2 Hack", phoneE164: "+40721555003", plate: null }, startsAt: FRIDAY_8 + 4 * HOUR }),
    { now: NOW },
  );
  if (!future.ok || !past.ok || !inB.ok || !maria.ok || !hack.ok) throw new Error("rezervările de pregătire au eșuat");
  ionFutureToken = future.token;
  ionPastBooking = past.bookingId;
  await ownerDb()
    .update(bookings)
    .set({ startsAt: new Date(NOW - 30 * DAY), endsAt: new Date(NOW - 30 * DAY + HOUR / 4), status: "completed" })
    .where(eq(bookings.id, past.bookingId));

  ionId = (await customerByPhone(tenantA, PHONE))!.id;
  mariaId = (await customerByPhone(tenantB, "+40721555002"))!.id;
});

afterAll(async () => {
  await closeDb();
  await closeOwnerDb();
});

const asA = <T,>(fn: Parameters<typeof withTenant<T>>[1]) => withTenant(tenantA, fn);

describe("căutarea clienților pentru ștergere", () => {
  it("găsește după telefon (scris oricum), nume parțial sau nr. de înmatriculare", async () => {
    for (const query of ["0721 555 001", "+40 721 555 001", "555001", "popes", "ag 12 xyz"]) {
      const found = await asA((t) => findCustomers(t, query));
      expect(found.map((c) => c.id), query).toContain(ionId);
    }
  });

  it("nu găsește clienții altui service și nu tratează % ca „orice”", async () => {
    expect(await asA((t) => findCustomers(t, "Maria"))).toEqual([]);
    expect(await asA((t) => findCustomers(t, "%%%"))).toEqual([]);
    expect(await asA((t) => findCustomers(t, "ab"))).toEqual([]); // prea scurt
  });
});

describe("exportul CSV", () => {
  it("programările lui A, fără nimic din B, cu formulele neutralizate", async () => {
    const { csv, rows } = await asA((t) => bookingsCsv(t, TZ));
    expect(rows).toBe(3);
    expect(csv.startsWith("﻿Cod;Data;Ora;")).toBe(true);
    expect(csv).toContain("Ion Popescu;0721 555 001;AG12XYZ");
    expect(csv).toContain("Geometrie punte față");
    expect(csv).toContain(";'=1+2 Hack;");
    expect(csv).not.toContain("Maria");
    expect(csv).not.toContain("Ion din B");
  });

  it("clienții lui A, cu data acordului pentru prelucrarea datelor", async () => {
    const { csv, rows } = await asA((t) => customersCsv(t, TZ));
    expect(rows).toBe(2);
    expect(csv).toMatch(/Ion Popescu;0721 555 001;2;\d{4}-\d{2}-\d{2};\d{4}-\d{2}-\d{2};\d{4}-\d{2}-\d{2} \d{2}:\d{2};/);
    expect(csv).not.toContain("Maria");
  });

  it("fiecare export se notează în istoric, fără date personale", async () => {
    await asA((t) => exportForAdmin(t, ownerA, "clienti", TZ));
    const [entry] = await asA((t) => listAudit(t, { limit: 1, offset: 0 }));
    expect(entry).toMatchObject({ action: "gdpr.export", after: { kind: "clienti", rows: 2 } });
    expect(JSON.stringify(entry)).not.toContain("Popescu");
  });
});

describe("ștergerea datelor unui client", () => {
  it("A nu poate șterge un client din B", async () => {
    expect(await asA((t) => eraseCustomer(t, ownerA, mariaId, new Date(NOW)))).toEqual({ ok: false, error: "not_found" });
    expect((await customerByPhone(tenantB, "+40721555002"))?.fullName).toBe("Maria Ionescu");
  });

  it("anonimizează clientul, anulează programările viitoare și oprește linkurile", async () => {
    expect(await resolveBookingToken(hashBookingToken(ionFutureToken), new Date(NOW))).not.toBeNull();

    const result = await asA((t) => eraseCustomer(t, ownerA, ionId, new Date(NOW)));
    expect(result).toEqual({ ok: true, bookings: 2, cancelledUpcoming: 1 });

    const [customer] = await ownerDb().select().from(customers).where(eq(customers.id, ionId));
    expect(customer).toMatchObject({ fullName: null, phoneE164: null, internalNote: null });
    expect(customer?.anonymizedAt).toBeInstanceOf(Date);

    const rows = await ownerDb().select().from(bookings).where(eq(bookings.customerId, ionId));
    expect(rows.map((b) => b.plate)).toEqual([null, null]);
    expect(rows.find((b) => b.id === ionPastBooking)?.status).toBe("completed");
    expect(rows.find((b) => b.id !== ionPastBooking)).toMatchObject({ status: "cancelled", cancelledBy: "shop" });

    const tokens = await ownerDb()
      .select()
      .from(bookingAccessTokens)
      .where(and(eq(bookingAccessTokens.tenantId, tenantA), eq(bookingAccessTokens.bookingId, rows[0]!.id)));
    expect(tokens).toEqual([]);
    expect(await resolveBookingToken(hashBookingToken(ionFutureToken), new Date(NOW))).toBeNull();

    // Clientul cu același telefon din B rămâne neatins.
    expect((await customerByPhone(tenantB, PHONE))?.fullName).toBe("Ion din B");
  });

  it("se notează în istoric fără nume și nu mai apare la căutare sau în exportul de clienți", async () => {
    const [entry] = await asA((t) => listAudit(t, { limit: 1, offset: 0 }));
    expect(entry).toMatchObject({ action: "customer.erase", entityId: ionId, after: { bookings: 2, cancelledUpcoming: 1 } });
    expect(JSON.stringify(entry)).not.toMatch(/Popescu|555001/);
    expect(await asA((t) => findCustomers(t, "popes"))).toEqual([]);
    expect((await asA((t) => customersCsv(t, TZ))).csv).not.toContain("Popescu");
    expect(await asA((t) => eraseCustomer(t, ownerA, ionId, new Date(NOW)))).toEqual({ ok: false, error: "not_found" });
  });
});

describe("ștergerea automată a datelor vechi", () => {
  it("limita se calculează în luni calendaristice", () => {
    expect(retentionCutoff(new Date("2026-10-22T07:00:00Z"), 24).toISOString()).toBe("2024-10-22T07:00:00.000Z");
    expect(retentionCutoff(new Date("2026-03-31T10:00:00Z"), 1).toISOString()).toBe("2026-02-28T10:00:00.000Z");
  });

  it("șterge programările mai vechi decât perioada și clienții rămași fără programări, doar în A", async () => {
    // Programarea lui Ion „din trecut” devine veche de 25 de luni; la fel una din B.
    const old = { startsAt: new Date(NOW - 762 * DAY), endsAt: new Date(NOW - 762 * DAY + HOUR / 4) };
    await ownerDb().update(bookings).set(old).where(eq(bookings.id, ionPastBooking));
    await ownerDb().update(bookings).set(old).where(eq(bookings.customerId, mariaId));

    const purge = await asA((t) => purgeTenantData(t, 24, new Date(NOW)));
    expect(purge).toEqual({ bookings: 1, customers: 0 }); // Ion mai are programarea anulată

    const remaining = await ownerDb().select({ id: bookings.id }).from(bookings).where(eq(bookings.tenantId, tenantA));
    expect(remaining.map((b) => b.id)).not.toContain(ionPastBooking);
    expect(remaining).toHaveLength(2);
    // B nu e atins de rularea pentru A.
    expect(await ownerDb().select().from(bookings).where(eq(bookings.customerId, mariaId))).toHaveLength(1);

    // Când și ultima programare a lui Ion e veche, dispare și clientul (cu istoricul acordurilor).
    await ownerDb().update(bookings).set(old).where(eq(bookings.customerId, ionId));
    expect(await asA((t) => purgeTenantData(t, 24, new Date(NOW)))).toEqual({ bookings: 1, customers: 1 });
    expect(await ownerDb().select().from(customers).where(eq(customers.id, ionId))).toEqual([]);
    expect(await ownerDb().select().from(customerConsents).where(eq(customerConsents.customerId, ionId))).toEqual([]);

    // A doua rulare nu mai găsește nimic.
    expect(await asA((t) => purgeTenantData(t, 24, new Date(NOW)))).toEqual({ bookings: 0, customers: 0 });
    const [entry] = await asA((t) => listAudit(t, { limit: 1, offset: 0 }));
    expect(entry).toMatchObject({ action: "retention.purge", actorKind: "system", actorUserId: null });
  });

  it("curăță tabelele globale: linkuri expirate și limite de cereri vechi", async () => {
    const now = new Date(NOW);
    await hitRateLimit("test-veche", "1.2.3.4", { limit: 5, windowSeconds: 60 }, new Date(NOW - 3 * DAY));
    await hitRateLimit("test-noua", "1.2.3.4", { limit: 5, windowSeconds: 60 }, now);
    const [link] = await ownerDb()
      .update(bookingAccessTokens)
      .set({ expiresAt: new Date(NOW - DAY) })
      .where(eq(bookingAccessTokens.tenantId, tenantA))
      .returning({ hash: bookingAccessTokens.lookupHash });
    expect(link).toBeDefined();

    const purge = await purgeGlobalData(now);
    expect(purge.rateLimits).toBeGreaterThanOrEqual(1);
    expect(purge.bookingLinks).toBeGreaterThanOrEqual(1);
    expect(await ownerDb().select().from(bookingAccessTokens).where(eq(bookingAccessTokens.lookupHash, link!.hash))).toEqual([]);
    expect((await hitRateLimit("test-noua", "1.2.3.4", { limit: 5, windowSeconds: 60 }, now)).allowed).toBe(true);
  });
});
