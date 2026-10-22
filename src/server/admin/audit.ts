import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { auditLog } from "@/server/db/schema";
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
