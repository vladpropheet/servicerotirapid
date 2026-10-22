import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { tenants } from "@/server/db/schema";
import { toTenantId, type TenantId } from "./with-tenant";

const slugSchema = z
  .string()
  .min(3)
  .max(48)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

export type PublicTenant = {
  id: TenantId;
  slug: string;
  displayName: string;
};

/**
 * Găsește un service după slug-ul din URL (ex. `roti-rapid`).
 * Întoarce null dacă slug-ul e invalid, nu există sau service-ul e suspendat.
 */
export async function resolvePublicTenant(slug: string): Promise<PublicTenant | null> {
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) {
    return null;
  }

  const [row] = await getDb()
    .select({ id: tenants.id, slug: tenants.slug, displayName: tenants.displayName })
    .from(tenants)
    .where(and(eq(tenants.slug, parsed.data), eq(tenants.status, "active")))
    .limit(1);

  if (!row) {
    return null;
  }
  return { id: toTenantId(row.id), slug: row.slug, displayName: row.displayName };
}
