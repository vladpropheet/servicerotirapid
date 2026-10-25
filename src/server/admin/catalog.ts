import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { PricingMode, ServiceUnit, SurchargeStacking, SurchargeUnit } from "@/domain/enums";
import { cellText, parseCellText } from "@/domain/pricing/cell-text";
import { slugifyCode } from "@/lib/slug";
import {
  rimSizes,
  rimTypes,
  serviceCategories,
  servicePrices,
  services,
  surchargeServices,
  surcharges,
  vehicleTypes,
} from "@/server/db/schema";
import type { TenantTx } from "@/server/tenant";
import { writeAudit, type Actor } from "./audit";

// Editarea catalogului din panou: servicii, prețuri (fix / interval / matrice), suprataxe, dimensiuni.
// Fiecare modificare se scrie în istoric, cu valoarea veche și cea nouă.

// ---------------------------------------------------------------------------
// Servicii
// ---------------------------------------------------------------------------

export async function listServicesForAdmin(t: TenantTx) {
  const categories = await t.tx
    .select()
    .from(serviceCategories)
    .where(eq(serviceCategories.tenantId, t.tenantId))
    .orderBy(asc(serviceCategories.sortOrder));
  const rows = await t.tx
    .select()
    .from(services)
    .where(and(eq(services.tenantId, t.tenantId), isNull(services.archivedAt)))
    .orderBy(asc(services.sortOrder));
  return categories.map((category) => ({ ...category, services: rows.filter((s) => s.categoryId === category.id) }));
}

export async function loadDimensions(t: TenantTx) {
  const vehicles = await t.tx.select().from(vehicleTypes).where(eq(vehicleTypes.tenantId, t.tenantId)).orderBy(asc(vehicleTypes.sortOrder));
  const sizes = await t.tx.select().from(rimSizes).where(eq(rimSizes.tenantId, t.tenantId)).orderBy(asc(rimSizes.sortOrder));
  const types = await t.tx.select().from(rimTypes).where(eq(rimTypes.tenantId, t.tenantId)).orderBy(asc(rimTypes.sortOrder));
  return { vehicles, sizes, types };
}

export async function getServiceForEdit(t: TenantTx, serviceId: string) {
  const [service] = await t.tx
    .select()
    .from(services)
    .where(and(eq(services.tenantId, t.tenantId), eq(services.id, serviceId)))
    .limit(1);
  if (!service) return null;
  const prices = await t.tx
    .select()
    .from(servicePrices)
    .where(and(eq(servicePrices.tenantId, t.tenantId), eq(servicePrices.serviceId, serviceId)));
  const categories = await t.tx
    .select({ id: serviceCategories.id, name: serviceCategories.name })
    .from(serviceCategories)
    .where(eq(serviceCategories.tenantId, t.tenantId))
    .orderBy(asc(serviceCategories.sortOrder));
  return { service, prices, categories, dimensions: await loadDimensions(t) };
}

export type ServiceDetailsInput = {
  name: string;
  description: string | null;
  includes: string | null;
  customerExplainer: string | null;
  categoryId: string;
  unit: ServiceUnit;
  baseDurationMin: number | null;
  perUnitDurationMin: number;
  bookableOnline: boolean;
  active: boolean;
  maxQuantity: number;
};

export type SaveResult = { ok: true } | { ok: false; error: string };

export async function updateServiceDetails(
  t: TenantTx,
  actor: Actor,
  serviceId: string,
  input: ServiceDetailsInput,
): Promise<SaveResult> {
  const [before] = await t.tx
    .select()
    .from(services)
    .where(and(eq(services.tenantId, t.tenantId), eq(services.id, serviceId)))
    .limit(1);
  if (!before) return { ok: false, error: "Serviciul nu există." };
  if (input.bookableOnline && (input.baseDurationMin === null || input.baseDurationMin + input.perUnitDurationMin <= 0)) {
    return { ok: false, error: "Ca să se poată programa online, serviciul are nevoie de o durată." };
  }
  const [category] = await t.tx
    .select({ id: serviceCategories.id })
    .from(serviceCategories)
    .where(and(eq(serviceCategories.tenantId, t.tenantId), eq(serviceCategories.id, input.categoryId)));
  if (!category) return { ok: false, error: "Categoria nu există." };

  const durationChanged =
    before.baseDurationMin !== input.baseDurationMin || before.perUnitDurationMin !== input.perUnitDurationMin;
  await t.tx
    .update(services)
    .set({
      ...input,
      defaultQuantity: input.unit === "piece" ? (before.defaultQuantity ?? 1) : null,
      // Patronul a scris el durata: nu mai e o estimare „de verificat”.
      ...(durationChanged ? { durationNeedsReview: false } : {}),
    })
    .where(and(eq(services.tenantId, t.tenantId), eq(services.id, serviceId)));

  const pick = (s: typeof before | ServiceDetailsInput) => ({
    name: s.name,
    description: s.description,
    includes: s.includes,
    customerExplainer: s.customerExplainer,
    categoryId: s.categoryId,
    unit: s.unit,
    baseDurationMin: s.baseDurationMin,
    perUnitDurationMin: s.perUnitDurationMin,
    bookableOnline: s.bookableOnline,
    active: s.active,
    maxQuantity: s.maxQuantity,
  });
  await writeAudit(t, actor, {
    action: "service.update",
    entityType: "service",
    entityId: serviceId,
    before: pick(before),
    after: pick(input),
  });
  return { ok: true };
}

export async function createService(
  t: TenantTx,
  actor: Actor,
  input: { name: string; categoryId: string; unit: ServiceUnit },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const [category] = await t.tx
    .select({ id: serviceCategories.id })
    .from(serviceCategories)
    .where(and(eq(serviceCategories.tenantId, t.tenantId), eq(serviceCategories.id, input.categoryId)));
  if (!category) return { ok: false, error: "Categoria nu există." };

  const existing = await t.tx.select({ code: services.code, sortOrder: services.sortOrder }).from(services).where(eq(services.tenantId, t.tenantId));
  const code = uniqueCode(slugifyCode(input.name) || "serviciu", new Set(existing.map((s) => s.code)));
  const sortOrder = Math.max(0, ...existing.map((s) => s.sortOrder)) + 10;
  const [row] = await t.tx
    .insert(services)
    .values({
      tenantId: t.tenantId,
      categoryId: input.categoryId,
      code,
      name: input.name,
      unit: input.unit,
      pricingMode: "on_request",
      bookableOnline: false,
      active: false,
      sortOrder,
      defaultQuantity: input.unit === "piece" ? 1 : null,
    })
    .returning({ id: services.id });
  if (!row) throw new Error("Serviciul nu a putut fi creat.");
  await writeAudit(t, actor, { action: "service.create", entityType: "service", entityId: row.id, after: { code, ...input } });
  return { ok: true, id: row.id };
}

/** Mută serviciul cu o poziție mai sus sau mai jos în categoria lui. */
export async function moveService(t: TenantTx, actor: Actor, serviceId: string, direction: "up" | "down"): Promise<void> {
  const [service] = await t.tx
    .select()
    .from(services)
    .where(and(eq(services.tenantId, t.tenantId), eq(services.id, serviceId)))
    .limit(1);
  if (!service) return;
  const siblings = await t.tx
    .select({ id: services.id, sortOrder: services.sortOrder })
    .from(services)
    .where(and(eq(services.tenantId, t.tenantId), eq(services.categoryId, service.categoryId), isNull(services.archivedAt)))
    .orderBy(asc(services.sortOrder), asc(services.name));
  const index = siblings.findIndex((s) => s.id === serviceId);
  const other = siblings[direction === "up" ? index - 1 : index + 1];
  if (!other) return;

  // Renumerotăm categoria (pași de 10), apoi schimbăm cele două poziții între ele.
  const ordered = [...siblings];
  ordered[index] = other;
  ordered[direction === "up" ? index - 1 : index + 1] = siblings[index]!;
  for (const [position, item] of ordered.entries()) {
    await t.tx
      .update(services)
      .set({ sortOrder: (position + 1) * 10 })
      .where(and(eq(services.tenantId, t.tenantId), eq(services.id, item.id)));
  }
  await writeAudit(t, actor, {
    action: "service.reorder",
    entityType: "service",
    entityId: serviceId,
    before: { position: index + 1 },
    after: { position: direction === "up" ? index : index + 2 },
  });
}

// ---------------------------------------------------------------------------
// Prețuri
// ---------------------------------------------------------------------------

export type PriceEditInput = {
  mode: PricingMode;
  byVehicle: boolean;
  byRimSize: boolean;
  byRimType: boolean;
  /** Pentru fix / interval: o singură celulă fără dimensiuni. Pentru matrice: o celulă pe combinație. */
  cells: { vehicleTypeId: string | null; rimSizeId: string | null; rimTypeId: string | null; text: string }[];
};

const cellKey = (c: { vehicleTypeId: string | null; rimSizeId: string | null; rimTypeId: string | null }) =>
  `${c.vehicleTypeId ?? "-"}|${c.rimSizeId ?? "-"}|${c.rimTypeId ?? "-"}`;

export async function updateServicePrices(
  t: TenantTx,
  actor: Actor,
  serviceId: string,
  input: PriceEditInput,
): Promise<SaveResult> {
  const [service] = await t.tx
    .select()
    .from(services)
    .where(and(eq(services.tenantId, t.tenantId), eq(services.id, serviceId)))
    .limit(1);
  if (!service) return { ok: false, error: "Serviciul nu există." };

  const matrix = input.mode === "matrix";
  const dims = matrix
    ? { byVehicle: input.byVehicle, byRimSize: input.byRimSize, byRimType: input.byRimType }
    : { byVehicle: false, byRimSize: false, byRimType: false };
  if (matrix && !dims.byVehicle && !dims.byRimSize && !dims.byRimType) {
    return { ok: false, error: "Tabelul de prețuri are nevoie de cel puțin un criteriu (mașină, mărime sau tip jantă)." };
  }

  // Doar valori care aparțin acestui service (id-urile din formular sunt doar candidați).
  const { vehicles, sizes, types } = await loadDimensions(t);
  const known = {
    vehicle: new Set(vehicles.map((v) => v.id)),
    size: new Set(sizes.map((s) => s.id)),
    type: new Set(types.map((r) => r.id)),
  };

  const before = await t.tx
    .select()
    .from(servicePrices)
    .where(and(eq(servicePrices.tenantId, t.tenantId), eq(servicePrices.serviceId, serviceId)));
  const beforeByKey = new Map(before.map((row) => [cellKey(row), row]));

  const rows: (typeof servicePrices.$inferInsert)[] = [];
  const seen = new Set<string>();
  for (const cell of input.cells) {
    const coords = {
      vehicleTypeId: dims.byVehicle ? cell.vehicleTypeId : null,
      rimSizeId: dims.byRimSize ? cell.rimSizeId : null,
      rimTypeId: dims.byRimType ? cell.rimTypeId : null,
    };
    if (
      (coords.vehicleTypeId && !known.vehicle.has(coords.vehicleTypeId)) ||
      (coords.rimSizeId && !known.size.has(coords.rimSizeId)) ||
      (coords.rimTypeId && !known.type.has(coords.rimTypeId)) ||
      (dims.byVehicle && !coords.vehicleTypeId) ||
      (dims.byRimSize && !coords.rimSizeId) ||
      (dims.byRimType && !coords.rimTypeId)
    ) {
      return { ok: false, error: "Tabelul de prețuri nu se potrivește cu tipurile de mașini și jante. Reîncarcă pagina." };
    }
    const key = cellKey(coords);
    if (seen.has(key)) continue;
    seen.add(key);

    const parsed = parseCellText(cell.text);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    if (parsed.value.kind === "empty") continue;

    const previous = beforeByKey.get(key);
    const unchanged = previous !== undefined && cellText(previous) === cellText(parsed.value);
    rows.push({
      tenantId: t.tenantId,
      serviceId,
      ...coords,
      status: parsed.value.status,
      minBani: parsed.value.minBani,
      maxBani: parsed.value.maxBani,
      priceIsMinimum: parsed.value.priceIsMinimum,
      // O valoare neschimbată își păstrează nota; una scrisă de patron nu mai e „de verificat”.
      sourceNote: unchanged ? previous.sourceNote : null,
      needsReview: unchanged ? previous.needsReview : false,
      reviewNote: unchanged ? previous.reviewNote : null,
    });
  }

  if (!matrix && input.mode !== "on_request" && rows.length === 0) {
    return { ok: false, error: "Scrie prețul." };
  }
  const mode: PricingMode = !matrix && rows.length === 0 ? "on_request" : input.mode;

  await t.tx.delete(servicePrices).where(and(eq(servicePrices.tenantId, t.tenantId), eq(servicePrices.serviceId, serviceId)));
  if (mode !== "on_request" && rows.length > 0) await t.tx.insert(servicePrices).values(rows);
  await t.tx
    .update(services)
    .set({ pricingMode: mode, ...dims })
    .where(and(eq(services.tenantId, t.tenantId), eq(services.id, serviceId)));

  const label = (row: { vehicleTypeId: string | null; rimSizeId: string | null; rimTypeId: string | null }) =>
    [
      vehicles.find((v) => v.id === row.vehicleTypeId)?.code,
      sizes.find((s) => s.id === row.rimSizeId)?.code,
      types.find((r) => r.id === row.rimTypeId)?.code,
    ]
      .filter(Boolean)
      .join(" / ") || "preț";
  const describe = (list: (typeof before)[number][] | typeof rows) =>
    Object.fromEntries(
      list.map((row) => [
        label({ vehicleTypeId: row.vehicleTypeId ?? null, rimSizeId: row.rimSizeId ?? null, rimTypeId: row.rimTypeId ?? null }),
        cellText({
          status: row.status ?? "priced",
          minBani: row.minBani ?? null,
          maxBani: row.maxBani ?? null,
          priceIsMinimum: row.priceIsMinimum ?? false,
        }),
      ]),
    );
  await writeAudit(t, actor, {
    action: "price_matrix.update",
    entityType: "service",
    entityId: serviceId,
    before: { mode: service.pricingMode, prices: describe(before) },
    after: { mode, prices: describe(rows) },
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Suprataxe
// ---------------------------------------------------------------------------

export async function listSurchargesForAdmin(t: TenantTx) {
  const rows = await t.tx.select().from(surcharges).where(eq(surcharges.tenantId, t.tenantId)).orderBy(asc(surcharges.sortOrder));
  const links = await t.tx.select().from(surchargeServices).where(eq(surchargeServices.tenantId, t.tenantId));
  return rows.map((row) => ({ ...row, serviceIds: links.filter((l) => l.surchargeId === row.id).map((l) => l.serviceId) }));
}

export type SurchargeInput = {
  name: string;
  description: string | null;
  priceText: string;
  unit: SurchargeUnit;
  stacking: SurchargeStacking;
  customerSelectable: boolean;
  active: boolean;
  serviceIds: string[];
};

export async function updateSurcharge(t: TenantTx, actor: Actor, surchargeId: string, input: SurchargeInput): Promise<SaveResult> {
  const [before] = (await listSurchargesForAdmin(t)).filter((s) => s.id === surchargeId);
  if (!before) return { ok: false, error: "Suprataxa nu există." };
  const parsed = parseCellText(input.priceText);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  if (parsed.value.kind !== "cell" || parsed.value.status !== "priced" || parsed.value.minBani === null || parsed.value.maxBani === null) {
    return { ok: false, error: "Suprataxa are nevoie de un preț (ex. 10, 10-20 sau 20+)." };
  }
  const ownServices = await t.tx
    .select({ id: services.id })
    .from(services)
    .where(and(eq(services.tenantId, t.tenantId), inArray(services.id, input.serviceIds.length ? input.serviceIds : ["00000000-0000-0000-0000-000000000000"])));
  const serviceIds = ownServices.map((s) => s.id);

  const beforePrice = cellText({ ...before, status: "priced" });
  const priceChanged = beforePrice !== cellText(parsed.value);
  await t.tx
    .update(surcharges)
    .set({
      name: input.name,
      description: input.description,
      unit: input.unit,
      stacking: input.stacking,
      customerSelectable: input.customerSelectable,
      active: input.active,
      minBani: parsed.value.minBani,
      maxBani: parsed.value.maxBani,
      priceIsMinimum: parsed.value.priceIsMinimum,
      ...(priceChanged ? { needsReview: false } : {}),
    })
    .where(and(eq(surcharges.tenantId, t.tenantId), eq(surcharges.id, surchargeId)));
  await t.tx.delete(surchargeServices).where(and(eq(surchargeServices.tenantId, t.tenantId), eq(surchargeServices.surchargeId, surchargeId)));
  if (serviceIds.length > 0) {
    await t.tx.insert(surchargeServices).values(serviceIds.map((serviceId) => ({ tenantId: t.tenantId, surchargeId, serviceId })));
  }
  await writeAudit(t, actor, {
    action: "surcharge.update",
    entityType: "surcharge",
    entityId: surchargeId,
    before: { name: before.name, price: beforePrice, unit: before.unit, stacking: before.stacking, customerSelectable: before.customerSelectable, active: before.active, services: before.serviceIds.length },
    after: { name: input.name, price: cellText(parsed.value), unit: input.unit, stacking: input.stacking, customerSelectable: input.customerSelectable, active: input.active, services: serviceIds.length },
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Dimensiuni: tipuri de vehicul, mărimi și tipuri de jantă
// ---------------------------------------------------------------------------

export type DimensionKind = "vehicle" | "size" | "type";

export async function addDimension(
  t: TenantTx,
  actor: Actor,
  kind: DimensionKind,
  input: { label: string; inchMin?: number; inchMax?: number },
): Promise<SaveResult> {
  const { vehicles, sizes, types } = await loadDimensions(t);
  const list = kind === "vehicle" ? vehicles : kind === "size" ? sizes : types;
  const code = uniqueCode(slugifyCode(input.label) || kind, new Set(list.map((d) => d.code)));
  const sortOrder = Math.max(0, ...list.map((d) => d.sortOrder)) + 10;
  const base = { tenantId: t.tenantId, code, label: input.label, sortOrder };

  if (kind === "size") {
    if (!input.inchMin || !input.inchMax || input.inchMin > input.inchMax) return { ok: false, error: "Scrie mărimea în inch (ex. 23 sau 12-16)." };
    await t.tx.insert(rimSizes).values({ ...base, inchMin: input.inchMin, inchMax: input.inchMax });
  } else {
    await t.tx.insert(kind === "vehicle" ? vehicleTypes : rimTypes).values(base);
  }
  await writeAudit(t, actor, { action: "dimension.create", entityType: kind, entityId: code, after: { label: input.label } });
  return { ok: true };
}

export async function updateDimension(
  t: TenantTx,
  actor: Actor,
  kind: DimensionKind,
  id: string,
  input: { label: string; active: boolean },
): Promise<SaveResult> {
  const table = kind === "vehicle" ? vehicleTypes : kind === "size" ? rimSizes : rimTypes;
  const [before] = await t.tx
    .select({ label: table.label, active: table.active })
    .from(table)
    .where(and(eq(table.tenantId, t.tenantId), eq(table.id, id)));
  if (!before) return { ok: false, error: "Nu există." };
  await t.tx.update(table).set(input).where(and(eq(table.tenantId, t.tenantId), eq(table.id, id)));
  await writeAudit(t, actor, { action: "dimension.update", entityType: kind, entityId: id, before, after: input });
  return { ok: true };
}

function uniqueCode(base: string, taken: Set<string>): string {
  const trimmed = base.slice(0, 40);
  if (!taken.has(trimmed)) return trimmed;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${trimmed}_${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error("Nu am putut genera un cod unic.");
}
