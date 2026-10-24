// Panoul de administrare (CLAUDE.md §4, §6): funcțiile de admin și izolarea dintre service-uri.
// Fiecare funcție primește tranzacția unui tenant (ca în aplicație, după requireAdmin()).
import { rm } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isSlotAvailable } from "@/domain/availability";
import { listAudit, type Actor } from "@/server/admin/audit";
import { changeBookingStatus, createManualBooking, listBookings } from "@/server/admin/bookings";
import {
  getServiceForEdit,
  updateServiceDetails,
  updateServicePrices,
  updateSurcharge,
} from "@/server/admin/catalog";
import { createClosure, deleteClosure } from "@/server/admin/closures";
import { endSupportSession, startSupportSession } from "@/server/admin/platform";
import { markReviewed } from "@/server/admin/review";
import { saveWeeklyHours } from "@/server/admin/schedule";
import { readTenantImage, saveTenantImage } from "@/server/admin/tenant-profile";
import { createUserWithTemporaryPassword } from "@/server/auth/users";
import { reserveOnlineBooking } from "@/server/booking/reserve";
import { closeDb } from "@/server/db/client";
import {
  bookingSettings,
  bookings,
  closures,
  servicePrices,
  services,
  supportSessions,
  surchargeServices,
  tenants,
} from "@/server/db/schema";
import { loadBookingSettings, loadScheduleContext } from "@/server/repos/booking-data";
import { resolveAdminTenant, resolveSupportTenant, withTenant, type TenantId } from "@/server/tenant";
import { bookingRequest, catalogIds, FRIDAY_8, HOUR, NOW, seedFreshTenant } from "./booking-helpers";
import { closeOwnerDb, ownerDb } from "./owner-db";

const TZ = "Europe/Bucharest";
let tenantA: TenantId;
let tenantB: TenantId;
let idsA: Awaited<ReturnType<typeof catalogIds>>;
let idsB: Awaited<ReturnType<typeof catalogIds>>;
let ownerA: Actor;
let bookingOfB: string;

beforeAll(async () => {
  tenantA = await seedFreshTenant("admin-a");
  tenantB = await seedFreshTenant("admin-b");
  idsA = await catalogIds(tenantA);
  idsB = await catalogIds(tenantB);
  const { userId } = await createUserWithTemporaryPassword({
    phone: "0712 000 001",
    name: "Patron A",
    membership: { tenantId: tenantA, role: "owner" },
  });
  ownerA = { actorUserId: userId, actorKind: "owner" };

  const reserved = await reserveOnlineBooking(tenantB, bookingRequest(idsB), { now: NOW });
  if (!reserved.ok) throw new Error("rezervarea în B a eșuat");
  bookingOfB = reserved.bookingId;
});

afterAll(async () => {
  await rm(path.join(process.cwd(), "storage", tenantA), { recursive: true, force: true });
  await rm(path.join(process.cwd(), "storage", tenantB), { recursive: true, force: true });
  await closeDb();
  await closeOwnerDb();
});

const asA = <T,>(fn: Parameters<typeof withTenant<T>>[1]) => withTenant(tenantA, fn);

describe("patronul A nu poate citi sau modifica nimic din B", () => {
  it("contul patronului A duce doar la service-ul A", async () => {
    expect(await resolveAdminTenant(ownerA.actorUserId)).toMatchObject({ id: tenantA, role: "owner" });
  });

  it("listele lui A nu conțin programări sau istoric din B", async () => {
    const list = await asA((t) => listBookings(t, { from: new Date(FRIDAY_8 - 24 * HOUR), to: new Date(FRIDAY_8 + 24 * HOUR) }));
    expect(list.map((b) => b.id)).not.toContain(bookingOfB);
    const audit = await asA((t) => listAudit(t, { limit: 100, offset: 0 }));
    expect(audit.every((entry) => entry.tenantId === tenantA)).toBe(true);
    expect(audit.some((entry) => entry.entityId === bookingOfB)).toBe(false);
  });

  it("A nu poate schimba statusul unei programări din B", async () => {
    expect(await asA((t) => changeBookingStatus(t, ownerA, { bookingId: bookingOfB, next: "cancelled", now: new Date() }))).toEqual({
      ok: false,
      error: "not_found",
    });
    const [after] = await ownerDb().select().from(bookings).where(eq(bookings.id, bookingOfB));
    expect(after?.status).toBe("confirmed");
  });

  it("A nu poate deschide, modifica sau re-prețui un serviciu din B", async () => {
    const serviceOfB = idsB.service("geometrie_punte_fata");
    expect(await asA((t) => getServiceForEdit(t, serviceOfB))).toBeNull();
    expect(
      await asA((t) =>
        updateServiceDetails(t, ownerA, serviceOfB, {
          name: "Furat",
          description: null,
          includes: null,
          customerExplainer: null,
          categoryId: idsA.service("pachet_complet"),
          unit: "service",
          baseDurationMin: 15,
          perUnitDurationMin: 0,
          bookableOnline: true,
          active: true,
          maxQuantity: 1,
        }),
      ),
    ).toMatchObject({ ok: false });
    expect(
      await asA((t) =>
        updateServicePrices(t, ownerA, serviceOfB, { mode: "fixed", byVehicle: false, byRimSize: false, byRimType: false, cells: [{ vehicleTypeId: null, rimSizeId: null, rimTypeId: null, text: "1" }] }),
      ),
    ).toMatchObject({ ok: false });

    const [after] = await ownerDb().select().from(services).where(eq(services.id, serviceOfB));
    expect(after?.name).toBe("Geometrie punte față");
    const prices = await ownerDb().select().from(servicePrices).where(eq(servicePrices.serviceId, serviceOfB));
    expect(prices).toHaveLength(3);
  });

  it("A nu poate folosi în prețurile lui tipuri de mașini din B", async () => {
    const result = await asA((t) =>
      updateServicePrices(t, ownerA, idsA.service("geometrie_punte_fata"), {
        mode: "matrix",
        byVehicle: true,
        byRimSize: false,
        byRimType: false,
        cells: [{ vehicleTypeId: idsB.vehicle("suv"), rimSizeId: null, rimTypeId: null, text: "1" }],
      }),
    );
    expect(result).toMatchObject({ ok: false });
  });

  it("A nu poate lega suprataxa lui de servicii din B", async () => {
    const runflatA = idsA.surcharge("runflat");
    await asA((t) =>
      updateSurcharge(t, ownerA, runflatA, {
        name: "Anvelope Runflat",
        description: null,
        priceText: "10",
        unit: "per_wheel",
        stacking: "once_per_wheel",
        customerSelectable: true,
        active: true,
        serviceIds: [idsA.service("pachet_complet"), idsB.service("pachet_complet")],
      }),
    );
    const links = await ownerDb().select().from(surchargeServices).where(eq(surchargeServices.surchargeId, runflatA));
    expect(links.map((l) => l.serviceId)).toEqual([idsA.service("pachet_complet")]);
  });

  it("A nu poate șterge o zi liberă a lui B", async () => {
    const closureOfB = await withTenant(tenantB, (t) =>
      createClosure(t, { actorUserId: "b", actorKind: "owner" }, { type: "days", kind: "closed", dateFrom: "2026-12-24", dateTo: "2026-12-26", note: null }),
    );
    expect(await asA((t) => deleteClosure(t, ownerA, closureOfB))).toBe(false);
    expect(await ownerDb().select().from(closures).where(eq(closures.id, closureOfB))).toHaveLength(1);
  });

  it("poza fațadei și logo-ul lui A nu se văd prin contextul lui B", async () => {
    // O imagine PNG reală, 1x1 pixel.
    const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC", "base64"));
    for (const kind of ["facade", "logo"] as const) {
      expect(await asA((t) => saveTenantImage(t, ownerA, kind, png))).toEqual({ ok: true });
      // Salvată ca WebP (micșorată, fără metadate).
      expect((await asA((t) => readTenantImage(t, kind)))?.contentType).toBe("image/webp");
      expect(await withTenant(tenantB, (t) => readTenantImage(t, kind))).toBeNull();
    }
    // Un fișier care doar începe ca PNG, dar nu e o imagine, e refuzat.
    const fake = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    expect(await asA((t) => saveTenantImage(t, ownerA, "logo", fake))).toMatchObject({ ok: false });
  });
});

describe("statusul programărilor", () => {
  it("confirmată → finalizată → redeschisă; anulată rămâne anulată", async () => {
    const reserved = await reserveOnlineBooking(tenantA, bookingRequest(idsA, { startsAt: FRIDAY_8 + 3 * HOUR }), { now: NOW });
    if (!reserved.ok) throw new Error("rezervare eșuată");
    const change = (next: "completed" | "confirmed" | "cancelled" | "no_show") =>
      asA((t) => changeBookingStatus(t, ownerA, { bookingId: reserved.bookingId, next, now: new Date() }));

    expect(await change("completed")).toEqual({ ok: true });
    expect(await change("confirmed")).toEqual({ ok: true });
    expect(await change("cancelled")).toEqual({ ok: true });
    expect(await change("confirmed")).toEqual({ ok: false, error: "invalid_transition" });

    const [row] = await ownerDb().select().from(bookings).where(eq(bookings.id, reserved.bookingId));
    expect(row).toMatchObject({ status: "cancelled", cancelledBy: "shop" });
    const audit = await asA((t) => listAudit(t, { limit: 20, offset: 0, entityType: "booking" }));
    expect(audit.filter((a) => a.entityId === reserved.bookingId && a.action === "booking.status")).toHaveLength(3);
  });
});

describe("programări adăugate de patron", () => {
  const base = () => ({
    selection: {
      vehicleTypeId: idsA.vehicle("autoturism"),
      rimSizeId: null,
      rimTypeId: null,
      wheelCount: 4,
      surchargeIds: [],
      items: [{ serviceId: idsA.service("snur") }],
    },
    durationMin: 20,
    customer: { fullName: "Client Telefon", phoneE164: "+40248123456", plate: null },
    note: "a sunat dimineața",
    timeZone: TZ,
    now: new Date(NOW),
  });

  it("avertizează la suprapuneri și salvează doar după confirmare", async () => {
    const taken = await reserveOnlineBooking(tenantA, bookingRequest(idsA, { startsAt: FRIDAY_8 + 5 * HOUR }), { now: NOW });
    if (!taken.ok) throw new Error("rezervare eșuată");

    const first = await asA((t) => createManualBooking(t, ownerA, { ...base(), startsAt: FRIDAY_8 + 5 * HOUR, force: false }));
    expect(first).toMatchObject({ ok: false, error: "needs_confirmation" });
    if (first.ok || first.error !== "needs_confirmation") return;
    expect(first.warnings.join(" ")).toContain("Se suprapune");

    const forced = await asA((t) => createManualBooking(t, ownerA, { ...base(), startsAt: FRIDAY_8 + 5 * HOUR, force: true }));
    expect(forced).toMatchObject({ ok: true });
  });

  it("un serviciu fără durată cere durata", async () => {
    const result = await asA((t) => createManualBooking(t, ownerA, { ...base(), durationMin: null, startsAt: FRIDAY_8 + 8 * HOUR, force: true }));
    expect(result).toEqual({ ok: false, error: "duration_required" });
  });

  it("implicit nu ocupă locul online; cu setarea activă, îl ocupă", async () => {
    const at = Date.parse("2026-10-27T07:00:00Z"); // marți 10:00
    const saved = await asA((t) => createManualBooking(t, ownerA, { ...base(), startsAt: at, force: true }));
    expect(saved.ok).toBe(true);
    const free = async () =>
      asA(async (t) => {
        const settings = await loadBookingSettings(t);
        const context = await loadScheduleContext(t, TZ, settings, { from: at - 24 * HOUR, to: at + 24 * HOUR, fromDate: "2026-10-27" });
        return isSlotAvailable({ ...context, now: NOW, durationMin: 15 }, at);
      });
    expect(await free()).toBe(true);

    await ownerDb().update(bookingSettings).set({ manualBookingsUseCapacity: true }).where(eq(bookingSettings.tenantId, tenantA));
    const at2 = at + HOUR;
    await asA((t) => createManualBooking(t, ownerA, { ...base(), startsAt: at2, force: true }));
    const blocked = await asA(async (t) => {
      const settings = await loadBookingSettings(t);
      const context = await loadScheduleContext(t, TZ, settings, { from: at2 - 24 * HOUR, to: at2 + 24 * HOUR, fromDate: "2026-10-27" });
      return isSlotAvailable({ ...context, now: NOW, durationMin: 15 }, at2);
    });
    expect(blocked).toBe(false);
    await ownerDb().update(bookingSettings).set({ manualBookingsUseCapacity: false }).where(eq(bookingSettings.tenantId, tenantA));
  });
});

describe("editorul de prețuri", () => {
  it("salvează celula schimbată, păstrează marcajul „de verificat” al celor neschimbate și scrie istoricul", async () => {
    const serviceId = idsA.service("pachet_complet");
    const before = await asA((t) => getServiceForEdit(t, serviceId));
    if (!before) throw new Error("serviciu lipsă");
    const key = (p: { vehicleTypeId: string | null; rimSizeId: string | null; rimTypeId: string | null }) =>
      `${p.vehicleTypeId}|${p.rimSizeId}|${p.rimTypeId}`;
    const target = before.prices.find(
      (p) => p.vehicleTypeId === idsA.vehicle("autoturism") && p.rimSizeId === idsA.rimSize("17") && p.rimTypeId === idsA.rimType("aliaj"),
    )!;
    const reviewed = before.prices.find((p) => p.needsReview)!;

    const cells = before.prices.map((p) => ({
      vehicleTypeId: p.vehicleTypeId,
      rimSizeId: p.rimSizeId,
      rimTypeId: p.rimTypeId,
      text: key(p) === key(target) ? "57,5" : p.status === "on_request" ? "?" : p.minBani === p.maxBani ? String(p.minBani! / 100) : `${p.minBani! / 100}-${p.maxBani! / 100}`,
    }));
    const result = await asA((t) =>
      updateServicePrices(t, ownerA, serviceId, { mode: "matrix", byVehicle: true, byRimSize: true, byRimType: true, cells }),
    );
    expect(result).toEqual({ ok: true });

    const after = await ownerDb().select().from(servicePrices).where(eq(servicePrices.serviceId, serviceId));
    expect(after).toHaveLength(before.prices.length);
    expect(after.find((p) => key(p) === key(target))).toMatchObject({ minBani: 5750, maxBani: 5750, needsReview: false });
    expect(after.find((p) => key(p) === key(reviewed))?.needsReview).toBe(true);

    const [entry] = await asA((t) => listAudit(t, { limit: 1, offset: 0, entityType: "service" }));
    expect(entry?.action).toBe("price_matrix.update");
    expect(JSON.stringify(entry?.before)).toContain("autoturism / 17 / aliaj");
    expect(JSON.stringify(entry?.after)).toContain("57,5");
  });

  it("refuză un preț scris greșit, fără să schimbe nimic", async () => {
    const serviceId = idsA.service("geometrie_off_road");
    const result = await asA((t) =>
      updateServicePrices(t, ownerA, serviceId, { mode: "fixed", byVehicle: false, byRimSize: false, byRimType: false, cells: [{ vehicleTypeId: null, rimSizeId: null, rimTypeId: null, text: "o sută" }] }),
    );
    expect(result).toMatchObject({ ok: false });
    const prices = await ownerDb().select().from(servicePrices).where(eq(servicePrices.serviceId, serviceId));
    expect(prices[0]).toMatchObject({ minBani: 18000 });
  });
});

describe("program și „De verificat”", () => {
  it("refuză intervale suprapuse și salvează un program cu pauză de prânz", async () => {
    const overlap = await asA((t) =>
      saveWeeklyHours(t, ownerA, [
        { weekday: 1, opensAt: "08:00", closesAt: "13:00" },
        { weekday: 1, opensAt: "12:00", closesAt: "18:00" },
      ]),
    );
    expect(overlap).toMatchObject({ ok: false });
    expect(
      await asA((t) =>
        saveWeeklyHours(t, ownerA, [
          { weekday: 1, opensAt: "08:00", closesAt: "12:00" },
          { weekday: 1, opensAt: "13:00", closesAt: "18:00" },
        ]),
      ),
    ).toEqual({ ok: true });
  });

  it("„E corect” scoate un câmp al firmei din lista de verificat", async () => {
    await asA((t) => markReviewed(t, ownerA, { type: "tenant", field: "email" }));
    const [tenant] = await ownerDb().select().from(tenants).where(eq(tenants.id, tenantA));
    expect(tenant?.reviewFields).not.toContain("email");
    expect(tenant?.reviewFields).toContain("registered_address");
  });
});

describe("modul suport al super-adminului", () => {
  it("intră doar cu motiv, într-un singur service, până iese sau expiră", async () => {
    const { userId } = await createUserWithTemporaryPassword({ phone: "0799 000 002", name: "Super", platformRole: "superadmin" });
    expect(await resolveSupportTenant(userId)).toBeNull();

    await startSupportSession(userId, tenantB, "Ajutor la prețuri");
    expect(await resolveSupportTenant(userId)).toMatchObject({ id: tenantB });

    await endSupportSession(userId);
    expect(await resolveSupportTenant(userId)).toBeNull();

    await startSupportSession(userId, tenantA, "Verificare program");
    await ownerDb()
      .update(supportSessions)
      .set({ expiresAt: new Date(Date.now() - 1000), startedAt: new Date(Date.now() - 2000) })
      .where(and(eq(supportSessions.superadminUserId, userId), eq(supportSessions.tenantId, tenantA)));
    expect(await resolveSupportTenant(userId)).toBeNull();
  });
});
