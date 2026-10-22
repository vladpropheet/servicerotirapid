import "server-only";
import { and, asc, eq, gt, gte, inArray, isNotNull, isNull, lt, ne, or } from "drizzle-orm";
import type { AvailabilityInput, Closure } from "@/domain/availability";
import type { PricingCatalog } from "@/domain/pricing";
import type { EpochMs } from "@/domain/time";
import type { PublicCatalog } from "@/lib/public-catalog";
import {
  bookingSettings,
  bookings,
  businessHours,
  closures,
  rimSizes,
  rimTypes,
  serviceCategories,
  serviceConflicts,
  servicePrices,
  services,
  surchargeServices,
  surcharges,
  tenants,
  vehicleTypes,
} from "@/server/db/schema";
import type { TenantTx } from "@/server/tenant";

// Datele pe care se bazează programarea online, încărcate pentru un singur tenant.
// Toate interogările filtrează după `t.tenantId`.

export type PublicTenantInfo = {
  slug: string;
  displayName: string;
  legalName: string;
  cui: string;
  regCom: string;
  registeredAddress: string | null;
  workAddress: string;
  publicPhone: string;
  email: string | null;
  timezone: string;
  retentionMonths: number;
};

export async function loadTenantInfo(t: TenantTx): Promise<PublicTenantInfo> {
  const [row] = await t.tx
    .select({
      slug: tenants.slug,
      displayName: tenants.displayName,
      legalName: tenants.legalName,
      cui: tenants.cui,
      regCom: tenants.regCom,
      registeredAddress: tenants.registeredAddress,
      workAddress: tenants.workAddress,
      publicPhone: tenants.publicPhone,
      email: tenants.email,
      timezone: tenants.timezone,
      retentionMonths: tenants.retentionMonths,
    })
    .from(tenants)
    .where(eq(tenants.id, t.tenantId))
    .limit(1);
  if (!row) throw new Error("Tenantul nu există.");
  return row;
}

export type CatalogBundle = { pricing: PricingCatalog; display: PublicCatalog };

// Interogările dintr-o tranzacție rulează pe aceeași conexiune, deci una după alta (nu cu Promise.all).
export async function loadCatalog(t: TenantTx): Promise<CatalogBundle> {
  const tenantId = t.tenantId;

  const vehicleRows = await t.tx
    .select()
    .from(vehicleTypes)
    .where(eq(vehicleTypes.tenantId, tenantId))
    .orderBy(asc(vehicleTypes.sortOrder));
  const rimSizeRows = await t.tx
    .select()
    .from(rimSizes)
    .where(eq(rimSizes.tenantId, tenantId))
    .orderBy(asc(rimSizes.sortOrder));
  const rimTypeRows = await t.tx
    .select()
    .from(rimTypes)
    .where(eq(rimTypes.tenantId, tenantId))
    .orderBy(asc(rimTypes.sortOrder));
  const categoryRows = await t.tx
    .select()
    .from(serviceCategories)
    .where(and(eq(serviceCategories.tenantId, tenantId), eq(serviceCategories.active, true)))
    .orderBy(asc(serviceCategories.sortOrder));
  const serviceRows = await t.tx
    .select()
    .from(services)
    .where(and(eq(services.tenantId, tenantId), eq(services.active, true), isNull(services.archivedAt)))
    .orderBy(asc(services.sortOrder));

  const serviceIds = serviceRows.map((s) => s.id);
  const priceRows =
    serviceIds.length === 0
      ? []
      : await t.tx
          .select()
          .from(servicePrices)
          .where(and(eq(servicePrices.tenantId, tenantId), inArray(servicePrices.serviceId, serviceIds)));
  const surchargeRows = await t.tx
    .select()
    .from(surcharges)
    .where(and(eq(surcharges.tenantId, tenantId), eq(surcharges.active, true)))
    .orderBy(asc(surcharges.sortOrder));
  const linkRows = await t.tx.select().from(surchargeServices).where(eq(surchargeServices.tenantId, tenantId));
  const conflictRows = await t.tx.select().from(serviceConflicts).where(eq(serviceConflicts.tenantId, tenantId));

  const activeVehicles = vehicleRows.filter((v) => v.active);
  const activeRimSizes = rimSizeRows.filter((r) => r.active);
  const activeRimTypes = rimTypeRows.filter((r) => r.active);
  const activeCategoryIds = new Set(categoryRows.map((c) => c.id));
  const visibleServices = serviceRows.filter((s) => activeCategoryIds.has(s.categoryId));

  const pricing: PricingCatalog = {
    services: visibleServices.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      unit: s.unit,
      pricingMode: s.pricingMode,
      byVehicle: s.byVehicle,
      byRimSize: s.byRimSize,
      byRimType: s.byRimType,
      baseDurationMin: s.baseDurationMin,
      perUnitDurationMin: s.perUnitDurationMin,
      bookableOnline: s.bookableOnline,
      active: s.active,
      defaultQuantity: s.defaultQuantity,
      maxQuantity: s.maxQuantity,
      prices: priceRows
        .filter((p) => p.serviceId === s.id)
        .map((p) => ({
          id: p.id,
          vehicleTypeId: p.vehicleTypeId,
          rimSizeId: p.rimSizeId,
          rimTypeId: p.rimTypeId,
          status: p.status,
          minBani: p.minBani,
          maxBani: p.maxBani,
          priceIsMinimum: p.priceIsMinimum,
        })),
    })),
    surcharges: surchargeRows.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      unit: s.unit,
      minBani: s.minBani,
      maxBani: s.maxBani,
      priceIsMinimum: s.priceIsMinimum,
      stacking: s.stacking,
      customerSelectable: s.customerSelectable,
      active: s.active,
      serviceIds: linkRows.filter((l) => l.surchargeId === s.id).map((l) => l.serviceId),
    })),
    activeVehicleTypeIds: activeVehicles.map((v) => v.id),
    activeRimSizeIds: activeRimSizes.map((r) => r.id),
    activeRimTypeIds: activeRimTypes.map((r) => r.id),
    conflicts: conflictRows.map((c) => [c.serviceAId, c.serviceBId]),
  };

  const display: PublicCatalog = {
    vehicleTypes: activeVehicles.map((v) => ({ id: v.id, label: v.label })),
    rimSizes: activeRimSizes.map((r) => ({ id: r.id, label: r.label })),
    rimTypes: activeRimTypes.map((r) => ({ id: r.id, label: r.label })),
    categories: categoryRows
      .map((c) => ({
        id: c.id,
        name: c.name,
        services: visibleServices
          .filter((s) => s.categoryId === c.id)
          .map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            includes: s.includes,
            customerExplainer: s.customerExplainer,
            unit: s.unit,
            bookableOnline: s.bookableOnline,
          })),
      }))
      .filter((c) => c.services.length > 0),
    surcharges: surchargeRows
      .filter((s) => s.customerSelectable)
      .map((s) => ({ id: s.id, name: s.name, description: s.description })),
  };

  return { pricing, display };
}

export type BookingSettingsRow = typeof bookingSettings.$inferSelect;

export async function loadBookingSettings(t: TenantTx): Promise<BookingSettingsRow> {
  const [row] = await t.tx
    .select()
    .from(bookingSettings)
    .where(eq(bookingSettings.tenantId, t.tenantId))
    .limit(1);
  if (!row) throw new Error("Lipsesc setările de programare ale tenantului.");
  return row;
}

/** Tot ce trebuie pentru calculul intervalelor libere între `from` și `to`, în afară de „acum” și durată. */
export type ScheduleContext = Omit<AvailabilityInput, "now" | "durationMin" | "onlyDate">;

export async function loadScheduleContext(
  t: TenantTx,
  timeZone: string,
  settings: BookingSettingsRow,
  range: { from: EpochMs; to: EpochMs; fromDate: string },
): Promise<ScheduleContext> {
  const from = new Date(range.from);
  const to = new Date(range.to);

  const hourRows = await t.tx.select().from(businessHours).where(eq(businessHours.tenantId, t.tenantId));
  const closureRows = await t.tx
    .select()
    .from(closures)
    .where(
      and(
        eq(closures.tenantId, t.tenantId),
        or(
          and(isNotNull(closures.dateTo), gte(closures.dateTo, range.fromDate)),
          and(isNotNull(closures.endsAt), gt(closures.endsAt, from), lt(closures.startsAt, to)),
        ),
      ),
    );
  const holdRows = await t.tx
    .select({ startsAt: bookings.startsAt, endsAt: bookings.endsAt })
    .from(bookings)
    .where(
      and(
        eq(bookings.tenantId, t.tenantId),
        ne(bookings.status, "cancelled"),
        eq(bookings.usesOnlineCapacity, true),
        lt(bookings.startsAt, to),
        gt(bookings.endsAt, from),
      ),
    );

  return {
    timeZone,
    onlineCapacity: settings.onlineCapacity,
    slotStepMin: settings.slotStepMin,
    minLeadMin: settings.minLeadMin,
    maxDaysAhead: settings.maxDaysAhead,
    businessHours: hourRows.map((h) => ({ weekday: h.weekday, opensAt: h.opensAt, closesAt: h.closesAt })),
    closures: closureRows.map((c): Closure =>
      c.dateFrom !== null && c.dateTo !== null
        ? { kind: c.kind, dateFrom: c.dateFrom, dateTo: c.dateTo }
        : { kind: c.kind, startsAt: c.startsAt!.getTime(), endsAt: c.endsAt!.getTime() },
    ),
    holds: holdRows.map((b) => ({ startsAt: b.startsAt.getTime(), endsAt: b.endsAt.getTime() })),
  };
}
