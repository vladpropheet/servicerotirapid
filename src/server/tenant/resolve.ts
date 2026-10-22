import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { bookingAccessTokens, tenants } from "@/server/db/schema";
import { toTenantId, type TenantId } from "./with-tenant";

/** Adrese folosite de aplicație, care nu pot fi slug-ul unui service. */
const RESERVED_SLUGS = new Set(["admin", "api", "superadmin", "login", "static", "public"]);

const slugSchema = z
  .string()
  .min(3)
  .max(48)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  .refine((slug) => !RESERVED_SLUGS.has(slug));

const tokenHashSchema = z.string().regex(/^[0-9a-f]{64}$/);

export type BookingTokenTarget = { tenantId: TenantId; bookingId: string; tokenVersion: number };

/**
 * Găsește programarea din spatele unui link „vezi / anulează” (după hash-ul tokenului).
 * Întoarce null dacă linkul nu există, a expirat sau a fost revocat.
 */
export async function resolveBookingToken(
  tokenHash: string,
  now: Date,
): Promise<BookingTokenTarget | null> {
  if (!tokenHashSchema.safeParse(tokenHash).success) {
    return null;
  }
  const [row] = await getDb()
    .select({
      tenantId: bookingAccessTokens.tenantId,
      bookingId: bookingAccessTokens.bookingId,
      tokenVersion: bookingAccessTokens.tokenVersion,
    })
    .from(bookingAccessTokens)
    .where(
      and(
        eq(bookingAccessTokens.lookupHash, tokenHash),
        isNull(bookingAccessTokens.revokedAt),
        gt(bookingAccessTokens.expiresAt, now),
      ),
    )
    .limit(1);
  if (!row) {
    return null;
  }
  return { tenantId: toTenantId(row.tenantId), bookingId: row.bookingId, tokenVersion: row.tokenVersion };
}

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
