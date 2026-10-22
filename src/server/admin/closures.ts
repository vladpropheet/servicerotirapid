import "server-only";
import { and, asc, eq, gt, gte, isNotNull, or } from "drizzle-orm";
import type { ClosureKind } from "@/domain/enums";
import { closures } from "@/server/db/schema";
import type { TenantTx } from "@/server/tenant";
import { writeAudit, type Actor } from "./audit";

// Zile libere, concedii și intervale blocate („azi nu mai iau programări după 15:00”).

export async function listUpcomingClosures(t: TenantTx, today: string, now: Date) {
  return t.tx
    .select()
    .from(closures)
    .where(
      and(
        eq(closures.tenantId, t.tenantId),
        or(
          and(isNotNull(closures.dateTo), gte(closures.dateTo, today)),
          and(isNotNull(closures.endsAt), gt(closures.endsAt, now)),
        ),
      ),
    )
    .orderBy(asc(closures.dateFrom), asc(closures.startsAt));
}

export type NewClosure =
  | { type: "days"; kind: ClosureKind; dateFrom: string; dateTo: string; note: string | null }
  | { type: "interval"; kind: ClosureKind; startsAt: Date; endsAt: Date; note: string | null };

export async function createClosure(t: TenantTx, actor: Actor, input: NewClosure): Promise<string> {
  const values =
    input.type === "days"
      ? { dateFrom: input.dateFrom, dateTo: input.dateTo }
      : { startsAt: input.startsAt, endsAt: input.endsAt };
  const [row] = await t.tx
    .insert(closures)
    .values({
      tenantId: t.tenantId,
      kind: input.kind,
      ...values,
      internalNote: input.note,
      createdByUserId: actor.actorUserId,
    })
    .returning({ id: closures.id });
  if (!row) throw new Error("Blocarea nu a putut fi salvată.");
  await writeAudit(t, actor, {
    action: "closure.create",
    entityType: "closure",
    entityId: row.id,
    after: { kind: input.kind, ...serializable(values), note: input.note },
  });
  return row.id;
}

export async function deleteClosure(t: TenantTx, actor: Actor, closureId: string): Promise<boolean> {
  const [removed] = await t.tx
    .delete(closures)
    .where(and(eq(closures.tenantId, t.tenantId), eq(closures.id, closureId)))
    .returning();
  if (!removed) return false;
  await writeAudit(t, actor, {
    action: "closure.delete",
    entityType: "closure",
    entityId: closureId,
    before: {
      kind: removed.kind,
      dateFrom: removed.dateFrom,
      dateTo: removed.dateTo,
      startsAt: removed.startsAt?.toISOString() ?? null,
      endsAt: removed.endsAt?.toISOString() ?? null,
      note: removed.internalNote,
    },
  });
  return true;
}

function serializable(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v]));
}
