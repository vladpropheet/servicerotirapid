import { and, asc, desc, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { bookingAccessTokens, supportSessions, tenantMemberships, tenants } from "@/server/db/schema";
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

export type AdminTenant = {
  id: TenantId;
  slug: string;
  displayName: string;
  timezone: string;
  status: "active" | "suspended";
  role: "owner" | "staff";
};

/**
 * Service-ul administrat de un utilizator (din tabelul de membership).
 * Un service suspendat rămâne accesibil patronului (poate vedea datele), dar pagina publică e oprită.
 */
export async function resolveAdminTenant(userId: string): Promise<AdminTenant | null> {
  const [row] = await getDb()
    .select({
      id: tenants.id,
      slug: tenants.slug,
      displayName: tenants.displayName,
      timezone: tenants.timezone,
      status: tenants.status,
      role: tenantMemberships.role,
    })
    .from(tenantMemberships)
    .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
    .where(eq(tenantMemberships.userId, userId))
    .orderBy(asc(tenantMemberships.createdAt))
    .limit(1);
  return row ? { ...row, id: toTenantId(row.id) } : null;
}

export type SupportTenant = {
  id: TenantId;
  slug: string;
  displayName: string;
  timezone: string;
  status: "active" | "suspended";
  supportSessionId: string;
  expiresAt: Date;
};

/** Service-ul în care super-adminul are o sesiune de suport activă (cu motiv și termen). */
export async function resolveSupportTenant(superadminUserId: string, now: Date = new Date()): Promise<SupportTenant | null> {
  const [row] = await getDb()
    .select({
      id: tenants.id,
      slug: tenants.slug,
      displayName: tenants.displayName,
      timezone: tenants.timezone,
      status: tenants.status,
      supportSessionId: supportSessions.id,
      expiresAt: supportSessions.expiresAt,
    })
    .from(supportSessions)
    .innerJoin(tenants, eq(tenants.id, supportSessions.tenantId))
    .where(
      and(
        eq(supportSessions.superadminUserId, superadminUserId),
        isNull(supportSessions.endedAt),
        gt(supportSessions.expiresAt, now),
      ),
    )
    .orderBy(desc(supportSessions.startedAt))
    .limit(1);
  return row ? { ...row, id: toTenantId(row.id) } : null;
}

export type MaintenanceTenant = { id: TenantId; slug: string; retentionMonths: number };

/** Jobul zilnic de păstrare a datelor: toți tenanții (și cei suspendați), apoi `withTenant` pe rând. */
export async function listTenantsForMaintenance(): Promise<MaintenanceTenant[]> {
  const rows = await getDb()
    .select({ id: tenants.id, slug: tenants.slug, retentionMonths: tenants.retentionMonths })
    .from(tenants)
    .orderBy(asc(tenants.slug));
  return rows.map((row) => ({ ...row, id: toTenantId(row.id) }));
}

export type SuperadminTenant = { id: TenantId; slug: string; displayName: string; timezone: string };

/**
 * Service-ul deschis de super-admin din panoul lui (datele firmei, clienți, istoric, statistici).
 * Cine apelează trebuie să fi verificat deja că utilizatorul e super-admin (requireSuperadmin).
 */
export async function resolveTenantForSuperadmin(id: string): Promise<SuperadminTenant | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const [row] = await getDb()
    .select({ id: tenants.id, slug: tenants.slug, displayName: tenants.displayName, timezone: tenants.timezone })
    .from(tenants)
    .where(eq(tenants.id, id))
    .limit(1);
  return row ? { ...row, id: toTenantId(row.id) } : null;
}
