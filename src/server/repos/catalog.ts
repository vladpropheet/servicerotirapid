import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { serviceCategories, servicePrices, services } from "@/server/db/schema";
import type { TenantTx } from "@/server/tenant";

// Regula pentru toate repo-urile: fiecare interogare filtrează după `t.tenantId`.
// Un id venit din formular e doar un candidat; dacă aparține altui tenant, nu se găsește nimic.

export async function listCategories(t: TenantTx) {
  return t.tx
    .select()
    .from(serviceCategories)
    .where(eq(serviceCategories.tenantId, t.tenantId))
    .orderBy(asc(serviceCategories.sortOrder));
}

/** Serviciile active (nearhivate), în ordinea de afișare. */
export async function listActiveServices(t: TenantTx) {
  return t.tx
    .select()
    .from(services)
    .where(
      and(eq(services.tenantId, t.tenantId), eq(services.active, true), isNull(services.archivedAt)),
    )
    .orderBy(asc(services.sortOrder));
}

export async function getServiceById(t: TenantTx, serviceId: string) {
  const [row] = await t.tx
    .select()
    .from(services)
    .where(and(eq(services.tenantId, t.tenantId), eq(services.id, serviceId)))
    .limit(1);
  return row ?? null;
}

export async function listPricesForService(t: TenantTx, serviceId: string) {
  return t.tx
    .select()
    .from(servicePrices)
    .where(and(eq(servicePrices.tenantId, t.tenantId), eq(servicePrices.serviceId, serviceId)));
}

/** Schimbă numele unui serviciu. Întoarce false dacă serviciul nu aparține tenantului. */
export async function renameService(t: TenantTx, serviceId: string, name: string): Promise<boolean> {
  const updated = await t.tx
    .update(services)
    .set({ name })
    .where(and(eq(services.tenantId, t.tenantId), eq(services.id, serviceId)))
    .returning({ id: services.id });
  return updated.length > 0;
}
