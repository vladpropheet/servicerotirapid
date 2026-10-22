import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { ownerDb } from "./owner-db";
import { rimSizes, rimTypes, services, surcharges, vehicleTypes } from "@/server/db/schema";
import { mapCatalog } from "@/server/seed/map-catalog";
import { seedTenant } from "@/server/seed/write-seed";
import type { ReserveRequest } from "@/server/booking/reserve";
import { resolvePublicTenant, type TenantId } from "@/server/tenant";
import { loadCatalog as loadCatalogFile } from "../helpers/catalog";

/** Joi, 22.10.2026, 10:07 la București. „Acum” fix, ca testele să nu depindă de ziua rulării. */
export const NOW = Date.parse("2026-10-22T07:07:00Z");
/** Vineri, 23.10.2026, 08:00 la București. */
export const FRIDAY_8 = Date.parse("2026-10-23T05:00:00Z");
export const HOUR = 60 * 60_000;

export async function seedFreshTenant(slug: string): Promise<TenantId> {
  await seedTenant(getDb(), mapCatalog(loadCatalogFile(), { slug }));
  const tenant = await resolvePublicTenant(slug);
  if (!tenant) throw new Error(`Tenantul ${slug} nu a fost creat.`);
  return tenant.id;
}

type CodeMap = Record<string, string>;

/** Id-urile reale din baza de date, după cod (ex. ids.service.pachet_complet). */
export async function catalogIds(tenantId: string) {
  const toMap = (rows: { id: string; code: string }[]): CodeMap =>
    Object.fromEntries(rows.map((r) => [r.code, r.id]));
  const db = ownerDb();
  const [vehicle, rimSize, rimType, service, surcharge] = await Promise.all([
    db.select({ id: vehicleTypes.id, code: vehicleTypes.code }).from(vehicleTypes).where(eq(vehicleTypes.tenantId, tenantId)),
    db.select({ id: rimSizes.id, code: rimSizes.code }).from(rimSizes).where(eq(rimSizes.tenantId, tenantId)),
    db.select({ id: rimTypes.id, code: rimTypes.code }).from(rimTypes).where(eq(rimTypes.tenantId, tenantId)),
    db.select({ id: services.id, code: services.code }).from(services).where(eq(services.tenantId, tenantId)),
    db.select({ id: surcharges.id, code: surcharges.code }).from(surcharges).where(eq(surcharges.tenantId, tenantId)),
  ]);
  const pick = (map: CodeMap, code: string) => {
    const id = map[code];
    if (!id) throw new Error(`Cod necunoscut: ${code}`);
    return id;
  };
  return {
    vehicle: (code: string) => pick(toMap(vehicle), code),
    rimSize: (code: string) => pick(toMap(rimSize), code),
    rimType: (code: string) => pick(toMap(rimType), code),
    service: (code: string) => pick(toMap(service), code),
    surcharge: (code: string) => pick(toMap(surcharge), code),
  };
}

let counter = 0;

/** O cerere de programare validă: geometrie punte față (15 min), autoturism, telefon unic. */
export function bookingRequest(
  ids: Awaited<ReturnType<typeof catalogIds>>,
  overrides: Partial<ReserveRequest> = {},
): ReserveRequest {
  counter += 1;
  return {
    selection: {
      vehicleTypeId: ids.vehicle("autoturism"),
      rimSizeId: null,
      rimTypeId: null,
      wheelCount: 4,
      surchargeIds: [],
      items: [{ serviceId: ids.service("geometrie_punte_fata") }],
    },
    startsAt: FRIDAY_8,
    customer: {
      fullName: "Ion Popescu",
      phoneE164: `+4072${String(1_000_000 + counter).padStart(7, "0")}`,
      plate: "AG12ABC",
    },
    marketingOptIn: false,
    idempotencyKey: crypto.randomUUID(),
    ...overrides,
  };
}
