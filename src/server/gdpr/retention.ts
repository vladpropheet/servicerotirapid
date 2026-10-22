import "server-only";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { SYSTEM_ACTOR, writeAudit } from "@/server/admin/audit";
import { lockTenantBookings } from "@/server/booking/persist";
import { getDb } from "@/server/db/client";
import {
  authLoginGuard,
  authSession,
  authVerification,
  bookingAccessTokens,
  bookings,
  customers,
} from "@/server/db/schema";
import { purgeOldRateLimits } from "@/server/security/rate-limit";
import { listTenantsForMaintenance, withTenant, type TenantTx } from "@/server/tenant";

// Ștergerea automată a datelor vechi (CLAUDE.md §6, GDPR: păstrare limitată).
// Rulează zilnic (task programat în Coolify, Faza 7): `npm run gdpr:retention`.
// Se poate rula de mai multe ori: a doua rulare nu mai găsește nimic de șters.

/** Momentul de dinainte căruia se șterg programările: acum minus `months` luni calendaristice. */
export function retentionCutoff(now: Date, months: number): Date {
  const zoned = Temporal.Instant.fromEpochMilliseconds(now.getTime()).toZonedDateTimeISO("UTC");
  return new Date(zoned.subtract({ months }).epochMilliseconds);
}

export type TenantPurge = { bookings: number; customers: number };

/**
 * Șterge programările terminate înainte de limită (cu liniile și linkurile lor) și clienții
 * care nu mai au nicio programare (cu istoricul acordurilor lor).
 */
export async function purgeTenantData(t: TenantTx, retentionMonths: number, now: Date): Promise<TenantPurge> {
  await lockTenantBookings(t);
  const cutoff = retentionCutoff(now, retentionMonths);
  const removedBookings = await t.tx
    .delete(bookings)
    .where(and(eq(bookings.tenantId, t.tenantId), lt(bookings.endsAt, cutoff)))
    .returning({ id: bookings.id });
  const removedCustomers = await t.tx
    .delete(customers)
    .where(
      and(
        eq(customers.tenantId, t.tenantId),
        sql`not exists (select 1 from ${bookings} where ${bookings.tenantId} = ${customers.tenantId} and ${bookings.customerId} = ${customers.id})`,
      ),
    )
    .returning({ id: customers.id });

  const result = { bookings: removedBookings.length, customers: removedCustomers.length };
  if (result.bookings > 0 || result.customers > 0) {
    await writeAudit(t, SYSTEM_ACTOR, {
      action: "retention.purge",
      entityType: "retention",
      after: { ...result, retentionMonths, before: cutoff.toISOString() },
    });
  }
  return result;
}

export type GlobalPurge = {
  rateLimits: number;
  sessions: number;
  verifications: number;
  bookingLinks: number;
  loginGuards: number;
};

/** Tabelele globale: limite de cereri, sesiuni expirate, linkuri expirate, blocări de logare vechi. */
export async function purgeGlobalData(now: Date): Promise<GlobalPurge> {
  const db = getDb();
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const rateLimits = await purgeOldRateLimits(now);
  const sessions = await db.delete(authSession).where(lt(authSession.expiresAt, now)).returning({ id: authSession.id });
  const verifications = await db
    .delete(authVerification)
    .where(lt(authVerification.expiresAt, now))
    .returning({ id: authVerification.id });
  const bookingLinks = await db
    .delete(bookingAccessTokens)
    .where(lt(bookingAccessTokens.expiresAt, now))
    .returning({ hash: bookingAccessTokens.lookupHash });
  const loginGuards = await db
    .delete(authLoginGuard)
    .where(
      and(
        lt(authLoginGuard.windowStartedAt, twoDaysAgo),
        or(isNull(authLoginGuard.lockedUntil), lt(authLoginGuard.lockedUntil, now)),
      ),
    )
    .returning({ key: authLoginGuard.identifierHash });
  return {
    rateLimits,
    sessions: sessions.length,
    verifications: verifications.length,
    bookingLinks: bookingLinks.length,
    loginGuards: loginGuards.length,
  };
}

export type RetentionReport = { tenants: number } & TenantPurge & GlobalPurge;

export async function runRetention(now: Date = new Date()): Promise<RetentionReport> {
  const totals: TenantPurge = { bookings: 0, customers: 0 };
  const list = await listTenantsForMaintenance();
  for (const tenant of list) {
    const purge = await withTenant(tenant.id, (t) => purgeTenantData(t, tenant.retentionMonths, now));
    totals.bookings += purge.bookings;
    totals.customers += purge.customers;
  }
  const global = await purgeGlobalData(now);
  return { tenants: list.length, ...totals, ...global };
}
