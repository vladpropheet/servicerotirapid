import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { auditLog, bookings } from "@/server/db/schema";
import type { TenantTx } from "@/server/tenant";

// Istoricul modificărilor (CLAUDE.md §4): cine a schimbat ce și când, cu valoarea veche și cea nouă.
// Fără date personale ale clienților în `before` / `after`.

export type Actor = { actorUserId: string; actorKind: "owner" | "staff" | "superadmin" };

/** Jobul automat (de ex. ștergerea datelor vechi): fără utilizator. */
export const SYSTEM_ACTOR = { actorUserId: null, actorKind: "system" } as const;

export type AuditEntry = {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
};

export async function writeAudit(t: TenantTx, actor: Actor | typeof SYSTEM_ACTOR, entry: AuditEntry): Promise<void> {
  await t.tx.insert(auditLog).values({
    tenantId: t.tenantId,
    actorUserId: actor.actorUserId,
    actorKind: actor.actorKind,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}

export async function listAudit(t: TenantTx, options: { limit: number; offset: number; entityType?: string }) {
  return t.tx
    .select()
    .from(auditLog)
    .where(
      options.entityType
        ? and(eq(auditLog.tenantId, t.tenantId), eq(auditLog.entityType, options.entityType))
        : eq(auditLog.tenantId, t.tenantId),
    )
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(options.limit)
    .offset(options.offset);
}

/**
 * Jurnalul programărilor pentru patron: doar evenimentele programărilor (nouă, status schimbat, anulată de client),
 * cu ora programării. Fără prețuri, setări sau date personale.
 */
export async function listBookingJournal(t: TenantTx, options: { limit: number; offset: number }) {
  return t.tx
    .select({
      id: auditLog.id,
      action: auditLog.action,
      actorKind: auditLog.actorKind,
      before: auditLog.before,
      after: auditLog.after,
      createdAt: auditLog.createdAt,
      bookingStartsAt: bookings.startsAt,
    })
    .from(auditLog)
    .leftJoin(bookings, and(eq(bookings.tenantId, auditLog.tenantId), sql`${bookings.id}::text = ${auditLog.entityId}`))
    .where(and(eq(auditLog.tenantId, t.tenantId), eq(auditLog.entityType, "booking")))
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(options.limit)
    .offset(options.offset);
}
