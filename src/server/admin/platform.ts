import "server-only";
import { readFile } from "node:fs/promises";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { createUserWithTemporaryPassword, resetToTemporaryPassword } from "@/server/auth/users";
import { getDb } from "@/server/db/client";
import { authUser, platformAuditLog, supportSessions, tenantMemberships, tenants } from "@/server/db/schema";
import { mapCatalog } from "@/server/seed/map-catalog";
import { seedTenant } from "@/server/seed/write-seed";

// Zona super-adminului (Propheet AIgency): tenanți, conturi de patron, acces de suport.
// Tabele globale; datele clienților finali NU se citesc de aici (doar prin sesiune de suport).

export async function listTenantsWithOwners() {
  const rows = await getDb().select().from(tenants).orderBy(asc(tenants.createdAt));
  const owners = await getDb()
    .select({ tenantId: tenantMemberships.tenantId, userId: authUser.id, name: authUser.name, username: authUser.username })
    .from(tenantMemberships)
    .innerJoin(authUser, eq(authUser.id, tenantMemberships.userId));
  return rows.map((tenant) => ({ ...tenant, owners: owners.filter((o) => o.tenantId === tenant.id) }));
}

export type NewTenantInput = {
  slug: string;
  displayName: string;
  legalName: string;
  cui: string;
  regCom: string;
  workAddress: string;
  publicPhone: string;
  ownerName: string;
  ownerPhone: string;
};

/**
 * Service nou, pornind de la catalogul standard (servicii, prețuri, program, setări),
 * cu datele firmei noi. Patronul primește o parolă temporară.
 */
export async function createTenant(input: NewTenantInput, actorUserId: string) {
  const [taken] = await getDb().select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, input.slug));
  if (taken) return { ok: false as const, error: "Există deja un service cu această adresă." };

  const catalog: unknown = JSON.parse(await readFile("data/seed/catalog-servicii.json", "utf8"));
  const plan = mapCatalog(catalog, { slug: input.slug });
  plan.tenant = {
    ...plan.tenant,
    displayName: input.displayName,
    legalName: input.legalName,
    cui: input.cui,
    regCom: input.regCom,
    registeredAddress: null,
    workAddress: input.workAddress,
    publicPhone: input.publicPhone,
    email: null,
    reviewFields: ["registered_address", "email", "retention_months", "sms_monthly_limit"],
  };
  const result = await seedTenant(getDb(), plan);
  const owner = await createUserWithTemporaryPassword({
    phone: input.ownerPhone,
    name: input.ownerName,
    membership: { tenantId: result.tenantId, role: "owner" },
    actorUserId,
  });
  await getDb().insert(platformAuditLog).values({ actorUserId, action: "tenant.create", tenantId: result.tenantId, details: { slug: input.slug } });
  return { ok: true as const, tenantId: result.tenantId, temporaryPassword: owner.temporaryPassword };
}

export async function setTenantStatus(tenantId: string, status: "active" | "suspended", actorUserId: string): Promise<void> {
  await getDb().update(tenants).set({ status }).where(eq(tenants.id, tenantId));
  await getDb().insert(platformAuditLog).values({ actorUserId, action: `tenant.${status}`, tenantId });
}

export async function addOwner(tenantId: string, input: { name: string; phone: string }, actorUserId: string) {
  return createUserWithTemporaryPassword({ ...input, membership: { tenantId, role: "owner" }, actorUserId });
}

/** Resetarea parolei unui patron (fără SMS). Doar pentru un utilizator care chiar aparține service-ului. */
export async function resetOwnerPassword(tenantId: string, userId: string, actorUserId: string): Promise<string | null> {
  const [membership] = await getDb()
    .select({ userId: tenantMemberships.userId })
    .from(tenantMemberships)
    .where(and(eq(tenantMemberships.tenantId, tenantId), eq(tenantMemberships.userId, userId)));
  if (!membership) return null;
  return resetToTemporaryPassword(userId, actorUserId);
}

export const SUPPORT_MINUTES = 60;

/** Intrarea în panoul unui service, pentru suport: cu motiv scris, pe timp limitat, jurnalizată. */
export async function startSupportSession(superadminUserId: string, tenantId: string, reason: string): Promise<void> {
  const now = new Date();
  await getDb().transaction(async (tx) => {
    await tx
      .update(supportSessions)
      .set({ endedAt: now })
      .where(and(eq(supportSessions.superadminUserId, superadminUserId), isNull(supportSessions.endedAt)));
    await tx.insert(supportSessions).values({
      superadminUserId,
      tenantId,
      reason,
      startedAt: now,
      expiresAt: new Date(now.getTime() + SUPPORT_MINUTES * 60_000),
    });
    await tx.insert(platformAuditLog).values({ actorUserId: superadminUserId, action: "support.start", tenantId, details: { reason } });
  });
}

export async function endSupportSession(superadminUserId: string): Promise<void> {
  const ended = await getDb()
    .update(supportSessions)
    .set({ endedAt: new Date() })
    .where(
      and(
        eq(supportSessions.superadminUserId, superadminUserId),
        isNull(supportSessions.endedAt),
        gt(supportSessions.expiresAt, new Date()),
      ),
    )
    .returning({ tenantId: supportSessions.tenantId });
  for (const row of ended) {
    await getDb().insert(platformAuditLog).values({ actorUserId: superadminUserId, action: "support.end", tenantId: row.tenantId });
  }
}
