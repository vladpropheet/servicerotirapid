// Scrie un plan de seed în baza de date, într-o singură tranzacție (totul sau nimic).
import { eq, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import {
  bookingSettings,
  businessHours,
  rimSizes,
  rimTypes,
  serviceCategories,
  servicePrices,
  services,
  smsTemplates,
  surchargeServices,
  surcharges,
  tenants,
  vehicleTypes,
} from "@/server/db/schema";
import type { SeedPlan } from "./map-catalog";

export type SeedResult =
  | { created: false; tenantId: string }
  | {
      created: true;
      tenantId: string;
      counts: { services: number; prices: number; surcharges: number; businessHours: number };
    };

/**
 * Creează tenantul și toate datele lui de pornire.
 * Dacă un tenant cu același slug există deja, nu face nimic: seed-ul nu suprascrie
 * niciodată modificările făcute de patron din admin.
 */
export async function seedTenant(db: Database, plan: SeedPlan): Promise<SeedResult> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, plan.tenant.slug))
      .limit(1);
    if (existing) {
      return { created: false, tenantId: existing.id };
    }

    const [tenant] = await tx.insert(tenants).values(plan.tenant).returning({ id: tenants.id });
    if (!tenant) {
      throw new Error("Tenantul nu a putut fi creat.");
    }
    const tenantId = tenant.id;
    // La fel ca withTenant(): pregătit pentru Row-Level Security (Faza 4).
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);

    const codeMap = (rows: { id: string; code: string }[]) =>
      new Map(rows.map((row) => [row.code, row.id]));
    const lookup = (map: Map<string, string>, code: string | null, what: string) => {
      if (code === null) return null;
      const id = map.get(code);
      if (!id) throw new Error(`${what} necunoscut: ${code}`);
      return id;
    };

    const vehicleIds = codeMap(
      await tx
        .insert(vehicleTypes)
        .values(plan.vehicleTypes.map((v) => ({ ...v, tenantId })))
        .returning({ id: vehicleTypes.id, code: vehicleTypes.code }),
    );
    const rimSizeIds = codeMap(
      await tx
        .insert(rimSizes)
        .values(plan.rimSizes.map((r) => ({ ...r, tenantId })))
        .returning({ id: rimSizes.id, code: rimSizes.code }),
    );
    const rimTypeIds = codeMap(
      await tx
        .insert(rimTypes)
        .values(plan.rimTypes.map((r) => ({ ...r, tenantId })))
        .returning({ id: rimTypes.id, code: rimTypes.code }),
    );
    const categoryIds = codeMap(
      await tx
        .insert(serviceCategories)
        .values(plan.categories.map((c) => ({ ...c, tenantId })))
        .returning({ id: serviceCategories.id, code: serviceCategories.code }),
    );
    const serviceIds = codeMap(
      await tx
        .insert(services)
        .values(
          plan.services.map(({ categoryCode, ...service }) => ({
            ...service,
            tenantId,
            categoryId: lookup(categoryIds, categoryCode, "Categorie") as string,
          })),
        )
        .returning({ id: services.id, code: services.code }),
    );

    if (plan.prices.length > 0) {
      await tx.insert(servicePrices).values(
        plan.prices.map(({ serviceCode, vehicleTypeCode, rimSizeCode, rimTypeCode, ...price }) => ({
          ...price,
          tenantId,
          serviceId: lookup(serviceIds, serviceCode, "Serviciu") as string,
          vehicleTypeId: lookup(vehicleIds, vehicleTypeCode, "Tip vehicul"),
          rimSizeId: lookup(rimSizeIds, rimSizeCode, "Mărime jantă"),
          rimTypeId: lookup(rimTypeIds, rimTypeCode, "Tip jantă"),
        })),
      );
    }

    const surchargeIds = codeMap(
      plan.surcharges.length === 0
        ? []
        : await tx
            .insert(surcharges)
            .values(plan.surcharges.map((s) => ({ ...s, tenantId })))
            .returning({ id: surcharges.id, code: surcharges.code }),
    );
    if (plan.surchargeServices.length > 0) {
      await tx.insert(surchargeServices).values(
        plan.surchargeServices.map((link) => ({
          tenantId,
          surchargeId: lookup(surchargeIds, link.surchargeCode, "Suprataxă") as string,
          serviceId: lookup(serviceIds, link.serviceCode, "Serviciu") as string,
        })),
      );
    }

    if (plan.businessHours.length > 0) {
      await tx.insert(businessHours).values(plan.businessHours.map((h) => ({ ...h, tenantId })));
    }
    await tx.insert(bookingSettings).values({ ...plan.settings, tenantId });
    await tx.insert(smsTemplates).values(plan.smsTemplates.map((t) => ({ ...t, tenantId })));

    return {
      created: true,
      tenantId,
      counts: {
        services: plan.services.length,
        prices: plan.prices.length,
        surcharges: plan.surcharges.length,
        businessHours: plan.businessHours.length,
      },
    };
  });
}
