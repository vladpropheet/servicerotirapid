import { and, count, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import {
  auditLog,
  bookingAccessTokens,
  bookingItems,
  bookingSettings,
  bookings,
  customerConsents,
  customers,
} from "@/server/db/schema";
import { cancelBookingByToken, loadBookingSummary } from "@/server/booking/manage";
import { reserveOnlineBooking } from "@/server/booking/reserve";
import type { TenantId } from "@/server/tenant";
import { bookingRequest, catalogIds, FRIDAY_8, HOUR, NOW, seedFreshTenant } from "./booking-helpers";

let tenantId: TenantId;
let ids: Awaited<ReturnType<typeof catalogIds>>;

beforeAll(async () => {
  tenantId = await seedFreshTenant("rezervare-test");
  ids = await catalogIds(tenantId);
});

afterAll(() => closeDb());

const countBookingsAt = async (tenant: string, startsAt: number) => {
  const [row] = await getDb()
    .select({ n: count() })
    .from(bookings)
    .where(and(eq(bookings.tenantId, tenant), eq(bookings.startsAt, new Date(startsAt))));
  return row?.n ?? 0;
};

describe("rezervarea online", () => {
  it("salvează programarea cu prețul și durata calculate pe server", async () => {
    const request = bookingRequest(ids, {
      startsAt: FRIDAY_8 + 2 * HOUR, // 10:00
      selection: {
        vehicleTypeId: ids.vehicle("suv"),
        rimSizeId: null,
        rimTypeId: null,
        wheelCount: 4,
        surchargeIds: [ids.surcharge("runflat")],
        items: [{ serviceId: ids.service("pachet_complet") }, { serviceId: ids.service("geometrie_fata_spate") }],
      },
    });

    const result = await reserveOnlineBooking(tenantId, request, { now: NOW });
    expect(result).toMatchObject({ ok: true, status: "confirmed", reused: false });
    if (!result.ok) return;
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(result.publicRef).toMatch(/^[A-Z2-9]{6}$/);

    const [booking] = await getDb().select().from(bookings).where(eq(bookings.id, result.bookingId));
    expect(booking).toMatchObject({
      tenantId,
      status: "confirmed",
      source: "online",
      usesOnlineCapacity: true,
      estimateMinBani: 51000,
      estimateMaxBani: 67000,
      workDurationMin: 103,
      vehicleTypeLabel: "SUV / Jeep",
      rimSizeId: null,
      plate: "AG12ABC",
    });
    expect(booking!.endsAt.getTime() - booking!.startsAt.getTime()).toBe(105 * 60_000);

    const items = await getDb().select().from(bookingItems).where(eq(bookingItems.bookingId, result.bookingId));
    expect(items.map((i) => [i.kind, i.codeSnapshot, i.lineMinBani])).toEqual(
      expect.arrayContaining([
        ["service", "pachet_complet", 20000],
        ["service", "geometrie_fata_spate", 27000],
        ["surcharge", "runflat", 4000],
      ]),
    );

    const [token] = await getDb()
      .select()
      .from(bookingAccessTokens)
      .where(eq(bookingAccessTokens.bookingId, result.bookingId));
    expect(token?.lookupHash).toBe(createHash("sha256").update(result.token).digest("hex"));

    const consents = await getDb().select().from(customerConsents).where(eq(customerConsents.bookingId, result.bookingId));
    expect(consents.map((c) => c.purpose)).toEqual(["privacy_notice"]);

    const audit = await getDb().select().from(auditLog).where(eq(auditLog.entityId, result.bookingId));
    expect(audit[0]).toMatchObject({ action: "booking.create", actorKind: "customer" });
    expect(JSON.stringify(audit[0]?.after)).not.toContain("Popescu");
  });

  it("același formular trimis de două ori creează o singură programare", async () => {
    const request = bookingRequest(ids, { startsAt: FRIDAY_8 + 6 * HOUR }); // 14:00
    const first = await reserveOnlineBooking(tenantId, request, { now: NOW });
    const second = await reserveOnlineBooking(tenantId, request, { now: NOW });

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second).toMatchObject({ bookingId: first.bookingId, token: first.token, reused: true });
    expect(await countBookingsAt(tenantId, FRIDAY_8 + 6 * HOUR)).toBe(1);
  });

  it("refuză un interval deja ocupat și propune altele", async () => {
    const startsAt = FRIDAY_8 + 4 * HOUR; // 12:00
    expect((await reserveOnlineBooking(tenantId, bookingRequest(ids, { startsAt }), { now: NOW })).ok).toBe(true);

    const taken = await reserveOnlineBooking(tenantId, bookingRequest(ids, { startsAt }), { now: NOW });
    expect(taken).toMatchObject({ ok: false, error: "slot_taken" });
    if (taken.ok || taken.error !== "slot_taken") return;
    expect(taken.alternatives).toHaveLength(3);
    expect(taken.alternatives[0]!.startsAt).toBeGreaterThanOrEqual(startsAt + 15 * 60_000);
  });

  it("refuză ore din afara programului, din trecut sau prea devreme", async () => {
    const sunday = Date.parse("2026-10-25T08:00:00Z");
    const tooSoon = NOW + 30 * 60_000;
    const offGrid = FRIDAY_8 + 7 * 60_000;
    for (const startsAt of [sunday, tooSoon, offGrid, NOW - HOUR]) {
      const result = await reserveOnlineBooking(tenantId, bookingRequest(ids, { startsAt }), { now: NOW });
      expect(result, new Date(startsAt).toISOString()).toMatchObject({ ok: false, error: "slot_taken" });
    }
  });

  it("refuză serviciile care nu se programează online", async () => {
    const request = bookingRequest(ids, { startsAt: FRIDAY_8 + 8 * HOUR });
    request.selection.items = [{ serviceId: ids.service("snur") }];
    const result = await reserveOnlineBooking(tenantId, request, { now: NOW });
    expect(result).toMatchObject({ ok: false, error: "invalid_selection", detail: { code: "not_bookable_online" } });
  });

  it("limitează programările active pe același telefon", async () => {
    const phone = "+40733000111";
    const make = (hours: number) =>
      reserveOnlineBooking(
        tenantId,
        bookingRequest(ids, {
          startsAt: Date.parse("2026-10-26T06:00:00Z") + hours * HOUR, // luni 08:00 + ore
          customer: { fullName: "Maria Ionescu", phoneE164: phone, plate: null },
        }),
        { now: NOW },
      );
    expect((await make(0)).ok).toBe(true);
    expect((await make(1)).ok).toBe(true);
    expect(await make(2)).toMatchObject({ ok: false, error: "too_many_bookings" });

    const [customer] = await getDb()
      .select()
      .from(customers)
      .where(and(eq(customers.tenantId, tenantId), eq(customers.phoneE164, phone)));
    expect(customer?.fullName).toBe("Maria Ionescu");
  });

  it("păstrează acordul de marketing dat anterior", async () => {
    const phone = "+40744000222";
    const base = { fullName: "Dan Pop", phoneE164: phone, plate: null };
    const day = Date.parse("2026-10-27T06:00:00Z"); // marți 08:00
    await reserveOnlineBooking(tenantId, bookingRequest(ids, { startsAt: day, customer: base, marketingOptIn: true }), { now: NOW });
    await reserveOnlineBooking(tenantId, bookingRequest(ids, { startsAt: day + HOUR, customer: base, marketingOptIn: false }), { now: NOW });

    const [customer] = await getDb()
      .select()
      .from(customers)
      .where(and(eq(customers.tenantId, tenantId), eq(customers.phoneE164, phone)));
    expect(customer?.marketingSmsOptIn).toBe(true);
    const consents = await getDb().select().from(customerConsents).where(eq(customerConsents.customerId, customer!.id));
    expect(consents.filter((c) => c.purpose === "marketing_sms")).toHaveLength(1);
  });
});

describe("confirmarea manuală", () => {
  it("programarea rămâne „în așteptare” și ocupă totuși locul", async () => {
    const manualTenant = await seedFreshTenant("rezervare-manuala");
    const manualIds = await catalogIds(manualTenant);
    await getDb()
      .update(bookingSettings)
      .set({ confirmationMode: "manual" })
      .where(eq(bookingSettings.tenantId, manualTenant));

    const first = await reserveOnlineBooking(manualTenant, bookingRequest(manualIds), { now: NOW });
    expect(first).toMatchObject({ ok: true, status: "pending" });
    const second = await reserveOnlineBooking(manualTenant, bookingRequest(manualIds), { now: NOW });
    expect(second).toMatchObject({ ok: false, error: "slot_taken" });
  });
});

describe("linkul „vezi / anulează”", () => {
  it("arată rezumatul, anulează și eliberează intervalul", async () => {
    const startsAt = Date.parse("2026-10-28T06:00:00Z"); // miercuri 08:00
    const reserved = await reserveOnlineBooking(tenantId, bookingRequest(ids, { startsAt }), { now: NOW });
    if (!reserved.ok) throw new Error("rezervare eșuată");

    const summary = await loadBookingSummary(reserved.token, NOW);
    expect(summary).toMatchObject({
      status: "confirmed",
      firstName: "Ion",
      tenant: { slug: "rezervare-test" },
      items: [{ name: "Geometrie punte față", lineMinBani: 14000 }],
    });
    expect(summary?.cancelDeadline).toBe(startsAt - 60 * 60_000);
    expect(JSON.stringify(summary)).not.toContain("+4072");

    expect(await cancelBookingByToken(reserved.token, NOW)).toEqual({ ok: true, alreadyCancelled: false });
    expect(await cancelBookingByToken(reserved.token, NOW)).toEqual({ ok: true, alreadyCancelled: true });
    expect((await loadBookingSummary(reserved.token, NOW))?.status).toBe("cancelled");

    const again = await reserveOnlineBooking(tenantId, bookingRequest(ids, { startsAt }), { now: NOW });
    expect(again.ok).toBe(true);
  });

  it("nu mai permite anularea cu mai puțin de o oră înainte", async () => {
    const startsAt = Date.parse("2026-10-29T06:00:00Z"); // joi 08:00
    const reserved = await reserveOnlineBooking(tenantId, bookingRequest(ids, { startsAt }), { now: NOW });
    if (!reserved.ok) throw new Error("rezervare eșuată");

    const late = startsAt - 30 * 60_000;
    expect((await loadBookingSummary(reserved.token, late))?.cancelDeadline).toBeNull();
    expect(await cancelBookingByToken(reserved.token, late)).toEqual({ ok: false, error: "too_late" });
  });

  it("refuză linkurile false sau modificate", async () => {
    expect(await loadBookingSummary("nu-e-un-token", NOW)).toBeNull();
    expect(await loadBookingSummary("A".repeat(22), NOW)).toBeNull();
    expect(await cancelBookingByToken("A".repeat(22), NOW)).toEqual({ ok: false, error: "invalid_link" });
  });
});
