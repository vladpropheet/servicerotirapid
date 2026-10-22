import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { MINUTE_MS, type EpochMs } from "@/domain/time";
import { auditLog, bookingItems, bookings, customers } from "@/server/db/schema";
import { loadBookingSettings, loadTenantInfo, type PublicTenantInfo } from "@/server/repos/booking-data";
import { resolveBookingToken, withTenant, type BookingTokenTarget } from "@/server/tenant";
import { hashBookingToken, TOKEN_PATTERN } from "./token";

// Pagina din linkul „vezi / anulează programarea”: rezumatul programării și anularea de către client.

export type BookingSummary = {
  tenant: Pick<PublicTenantInfo, "slug" | "displayName" | "publicPhone" | "workAddress" | "timezone">;
  publicRef: string;
  status: "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
  startsAt: EpochMs;
  endsAt: EpochMs;
  /** Doar prenumele: cine are linkul nu trebuie să vadă mai mult decât e nevoie. */
  firstName: string | null;
  vehicleTypeLabel: string;
  rimSizeLabel: string | null;
  rimTypeLabel: string | null;
  wheelCount: number;
  plate: string | null;
  estimateMinBani: number;
  estimateMaxBani: number;
  estimateHasUnpriced: boolean;
  items: {
    kind: "service" | "surcharge" | "adjustment";
    name: string;
    quantity: number;
    lineMinBani: number | null;
    lineMaxBani: number | null;
    priceIsMinimum: boolean;
  }[];
  /** Până când poate anula clientul (null = nu mai poate). */
  cancelDeadline: EpochMs | null;
};

async function targetFor(token: string, now: EpochMs): Promise<BookingTokenTarget | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  return resolveBookingToken(hashBookingToken(token), new Date(now));
}

export async function loadBookingSummary(
  token: string,
  now: EpochMs = Date.now(),
): Promise<BookingSummary | null> {
  const target = await targetFor(token, now);
  if (!target) return null;

  return withTenant(target.tenantId, async (t) => {
    const [row] = await t.tx
      .select({ booking: bookings, fullName: customers.fullName })
      .from(bookings)
      .innerJoin(customers, and(eq(customers.tenantId, bookings.tenantId), eq(customers.id, bookings.customerId)))
      .where(and(eq(bookings.tenantId, t.tenantId), eq(bookings.id, target.bookingId)))
      .limit(1);
    if (!row || row.booking.tokenVersion !== target.tokenVersion) return null;

    const tenant = await loadTenantInfo(t);
    const settings = await loadBookingSettings(t);
    const items = await t.tx
      .select()
      .from(bookingItems)
      .where(and(eq(bookingItems.tenantId, t.tenantId), eq(bookingItems.bookingId, row.booking.id)))
      .orderBy(asc(bookingItems.position));

    const b = row.booking;
    const deadline = b.startsAt.getTime() - settings.customerCancelCutoffMin * MINUTE_MS;
    const cancellable = (b.status === "pending" || b.status === "confirmed") && now < deadline;

    return {
      tenant: {
        slug: tenant.slug,
        displayName: tenant.displayName,
        publicPhone: tenant.publicPhone,
        workAddress: tenant.workAddress,
        timezone: tenant.timezone,
      },
      publicRef: b.publicRef,
      status: b.status,
      startsAt: b.startsAt.getTime(),
      endsAt: b.endsAt.getTime(),
      firstName: row.fullName?.trim().split(/\s+/)[0] ?? null,
      vehicleTypeLabel: b.vehicleTypeLabel,
      rimSizeLabel: b.rimSizeLabel,
      rimTypeLabel: b.rimTypeLabel,
      wheelCount: b.wheelCount,
      plate: b.plate,
      estimateMinBani: b.estimateMinBani,
      estimateMaxBani: b.estimateMaxBani,
      estimateHasUnpriced: b.estimateHasUnpriced,
      items: items.map((item) => ({
        kind: item.kind,
        name: item.nameSnapshot,
        quantity: item.quantity,
        lineMinBani: item.lineMinBani,
        lineMaxBani: item.lineMaxBani,
        priceIsMinimum: item.priceIsMinimum,
      })),
      cancelDeadline: cancellable ? deadline : null,
    };
  });
}

export type CancelResult =
  | { ok: true; alreadyCancelled: boolean }
  | { ok: false; error: "invalid_link" | "too_late" | "not_cancellable" };

/** Anularea de către client, din link. Doar prin POST (formular), niciodată la simpla deschidere a linkului. */
export async function cancelBookingByToken(token: string, now: EpochMs): Promise<CancelResult> {
  const target = await targetFor(token, now);
  if (!target) return { ok: false, error: "invalid_link" };

  return withTenant(target.tenantId, async (t) => {
    // Aceeași blocare ca la rezervare: anularea și o rezervare nouă nu se încurcă.
    await t.tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`booking:${t.tenantId}`}, 0))`);

    const [booking] = await t.tx
      .select()
      .from(bookings)
      .where(and(eq(bookings.tenantId, t.tenantId), eq(bookings.id, target.bookingId)))
      .limit(1);
    if (!booking || booking.tokenVersion !== target.tokenVersion) return { ok: false, error: "invalid_link" };
    if (booking.status === "cancelled") return { ok: true, alreadyCancelled: true };
    if (booking.status !== "pending" && booking.status !== "confirmed") {
      return { ok: false, error: "not_cancellable" };
    }

    const settings = await loadBookingSettings(t);
    if (now >= booking.startsAt.getTime() - settings.customerCancelCutoffMin * MINUTE_MS) {
      return { ok: false, error: "too_late" };
    }

    const cancelledAt = new Date(now);
    await t.tx
      .update(bookings)
      .set({ status: "cancelled", cancelledAt, cancelledBy: "customer" })
      .where(and(eq(bookings.tenantId, t.tenantId), eq(bookings.id, booking.id)));
    await t.tx.insert(auditLog).values({
      tenantId: t.tenantId,
      actorKind: "customer",
      action: "booking.cancel",
      entityType: "booking",
      entityId: booking.id,
      before: { status: booking.status },
      after: { status: "cancelled", cancelledBy: "customer", cancelledAt: cancelledAt.toISOString() },
    });
    return { ok: true, alreadyCancelled: false };
  });
}
