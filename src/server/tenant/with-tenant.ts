import { sql } from "drizzle-orm";
import { getDb, type Database } from "@/server/db/client";

/**
 * Id-ul unui tenant verificat. Se creează DOAR în src/server/tenant/
 * (din slug-ul public, din sesiunea adminului sau dintr-o sesiune de suport).
 * Un string oarecare venit din formular nu poate fi folosit ca TenantId fără conversie explicită.
 */
export type TenantId = string & { readonly __brand: "TenantId" };

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Tranzacția unui tenant: tot ce trece prin repo-uri primește acest obiect. */
export type TenantTx = {
  readonly tx: Transaction;
  readonly tenantId: TenantId;
};

/** Doar pentru codul din src/server/tenant/, după ce tenantul a fost verificat. */
export function toTenantId(id: string): TenantId {
  return id as TenantId;
}

/**
 * Rulează `fn` într-o tranzacție legată de un tenant.
 * Setează `app.tenant_id` doar pentru această tranzacție (`set_config(..., true)`),
 * ca Row-Level Security din Faza 4 să poată filtra și în baza de date.
 */
export async function withTenant<T>(
  tenantId: TenantId,
  fn: (t: TenantTx) => Promise<T>,
): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn({ tx, tenantId });
  });
}
