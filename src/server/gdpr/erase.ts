import "server-only";
import { and, count, desc, eq, gt, ilike, inArray, isNull, max, or, sql } from "drizzle-orm";
import { normalizeRoPhone } from "@/lib/validation/phone";
import { writeAudit, type Actor } from "@/server/admin/audit";
import { lockTenantBookings } from "@/server/booking/persist";
import { bookingAccessTokens, bookings, customers, notificationsLog } from "@/server/db/schema";
import type { TenantTx } from "@/server/tenant";

// Ștergerea datelor unui client la cererea lui (dreptul la ștergere, GDPR art. 17).
// Ștergerea = anonimizare: numele, telefonul, nr. de înmatriculare și observațiile dispar definitiv,
// iar programările rămân fără date personale, ca statisticile să fie corecte.

export type CustomerMatch = {
  id: string;
  fullName: string;
  phoneE164: string;
  bookings: number;
  lastStartsAt: Date | null;
};

/** Caracterele speciale din LIKE se caută ca text obișnuit. */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Caută clienții (neanonimizați) după telefon, nume sau nr. de înmatriculare. */
export async function findCustomers(t: TenantTx, query: string, limit = 20): Promise<CustomerMatch[]> {
  const text = query.trim();
  if (text.length < 3) return [];

  const conditions = [ilike(customers.fullName, `%${escapeLike(text)}%`)];
  const phone = normalizeRoPhone(text);
  if (phone) conditions.push(eq(customers.phoneE164, phone));
  const digits = text.replace(/\D/g, "");
  if (digits.length >= 4 && digits.length === text.replace(/[\s().+-]/g, "").length) {
    conditions.push(sql`${customers.phoneE164} like ${`%${digits.replace(/^0/, "")}%`}`);
  }
  const plate = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (plate.length >= 3) {
    conditions.push(
      sql`exists (select 1 from ${bookings} where ${bookings.tenantId} = ${customers.tenantId}
        and ${bookings.customerId} = ${customers.id} and ${bookings.plate} like ${`%${plate}%`})`,
    );
  }

  const rows = await t.tx
    .select({
      id: customers.id,
      fullName: customers.fullName,
      phoneE164: customers.phoneE164,
      bookings: count(bookings.id),
      lastStartsAt: max(bookings.startsAt),
    })
    .from(customers)
    .leftJoin(bookings, and(eq(bookings.tenantId, customers.tenantId), eq(bookings.customerId, customers.id)))
    .where(and(eq(customers.tenantId, t.tenantId), isNull(customers.anonymizedAt), or(...conditions)))
    .groupBy(customers.id)
    .orderBy(desc(max(bookings.startsAt)), customers.id)
    .limit(limit);

  return rows.flatMap((row) =>
    row.fullName !== null && row.phoneE164 !== null
      ? [{ ...row, fullName: row.fullName, phoneE164: row.phoneE164 }]
      : [],
  );
}

export async function getCustomerForErase(t: TenantTx, customerId: string, now: Date) {
  const [customer] = await t.tx
    .select({ id: customers.id, fullName: customers.fullName, phoneE164: customers.phoneE164 })
    .from(customers)
    .where(and(eq(customers.tenantId, t.tenantId), eq(customers.id, customerId), isNull(customers.anonymizedAt)))
    .limit(1);
  if (!customer?.fullName || !customer.phoneE164) return null;
  const [stats] = await t.tx
    .select({
      total: count(),
      upcoming: sql<number>`count(*) filter (where ${bookings.startsAt} > ${now} and ${bookings.status} in ('pending', 'confirmed'))`.mapWith(Number),
    })
    .from(bookings)
    .where(and(eq(bookings.tenantId, t.tenantId), eq(bookings.customerId, customer.id)));
  return {
    id: customer.id,
    fullName: customer.fullName,
    phoneE164: customer.phoneE164,
    bookings: stats?.total ?? 0,
    upcoming: stats?.upcoming ?? 0,
  };
}

export type EraseResult =
  | { ok: true; bookings: number; cancelledUpcoming: number }
  | { ok: false; error: "not_found" };

/**
 * Anonimizează clientul. Programările lui viitoare se anulează (nu mai avem cum să-l contactăm),
 * iar linkurile „vezi / anulează” nu mai merg. Nu se poate anula.
 */
export async function eraseCustomer(t: TenantTx, actor: Actor, customerId: string, now: Date): Promise<EraseResult> {
  await lockTenantBookings(t);
  const [customer] = await t.tx
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.tenantId, t.tenantId), eq(customers.id, customerId), isNull(customers.anonymizedAt)))
    .limit(1);
  if (!customer) return { ok: false, error: "not_found" };

  const ofCustomer = and(eq(bookings.tenantId, t.tenantId), eq(bookings.customerId, customer.id));
  const cancelled = await t.tx
    .update(bookings)
    .set({ status: "cancelled", cancelledAt: now, cancelledBy: "shop" })
    .where(and(ofCustomer, inArray(bookings.status, ["pending", "confirmed"]), gt(bookings.startsAt, now)))
    .returning({ id: bookings.id });
  const touched = await t.tx
    .update(bookings)
    .set({ plate: null, customerNote: null, cancelReason: null, tokenVersion: sql`${bookings.tokenVersion} + 1` })
    .where(ofCustomer)
    .returning({ id: bookings.id });
  const bookingIds = touched.map((row) => row.id);

  if (bookingIds.length > 0) {
    await t.tx
      .delete(bookingAccessTokens)
      .where(and(eq(bookingAccessTokens.tenantId, t.tenantId), inArray(bookingAccessTokens.bookingId, bookingIds)));
    await t.tx
      .update(notificationsLog)
      .set({ recipientMasked: null })
      .where(and(eq(notificationsLog.tenantId, t.tenantId), inArray(notificationsLog.bookingId, bookingIds)));
  }

  await t.tx
    .update(customers)
    .set({ fullName: null, phoneE164: null, internalNote: null, marketingSmsOptIn: false, anonymizedAt: now })
    .where(and(eq(customers.tenantId, t.tenantId), eq(customers.id, customer.id)));

  await writeAudit(t, actor, {
    action: "customer.erase",
    entityType: "customer",
    entityId: customer.id,
    after: { bookings: bookingIds.length, cancelledUpcoming: cancelled.length },
  });
  return { ok: true, bookings: bookingIds.length, cancelledUpcoming: cancelled.length };
}
