import "server-only";
import { and, count, eq, gt, inArray } from "drizzle-orm";
import { availableSlots, isSlotAvailable, type Slot } from "@/domain/availability";
import { estimate, type EstimateError, type PricingSelection } from "@/domain/pricing";
import { localDateOf, MINUTE_MS, type EpochMs } from "@/domain/time";
import { CONSENT_TEXT_VERSION, MARKETING_CONSENT_TEXT, PRIVACY_CONSENT_TEXT } from "@/lib/consent-texts";
import { auditLog, bookings, customerConsents, customers } from "@/server/db/schema";
import {
  loadBookingSettings,
  loadCatalog,
  loadScheduleContext,
  loadTenantInfo,
} from "@/server/repos/booking-data";
import { withTenant, type TenantId, type TenantTx } from "@/server/tenant";
import { lockTenantBookings, persistBooking, upsertCustomer } from "./persist";
import { deriveBookingToken } from "./token";

// Rezervarea atomică a unei programări online (planul Fazei 0, „Rezervarea atomică”).
//
// 1. Tranzacție READ COMMITTED + blocare pe tenant (pg_advisory_xact_lock), ca instrucțiune separată,
//    ÎNAINTE de orice citire. Două cereri pentru același service trec pe rând; fiecare citire de după
//    blocare vede tot ce a salvat cererea dinainte.
// 2. Prețul, durata și disponibilitatea se recalculează pe server, din baza de date.
// 3. Totul se salvează în aceeași tranzacție: client, programare, linii, acorduri, link, istoric.

const DAY_MS = 24 * 60 * MINUTE_MS;

export type ReserveRequest = {
  selection: PricingSelection;
  startsAt: EpochMs;
  customer: { fullName: string; phoneE164: string; plate: string | null };
  marketingOptIn: boolean;
  /** Generat de browser o dată per formular: același formular trimis de două ori = aceeași programare. */
  idempotencyKey: string;
};

export type ReserveResult =
  | { ok: true; bookingId: string; token: string; publicRef: string; status: "pending" | "confirmed"; reused: boolean }
  | { ok: false; error: "slot_taken"; alternatives: Slot[] }
  | { ok: false; error: "invalid_selection"; detail: EstimateError | null }
  | { ok: false; error: "too_many_bookings" };

export async function reserveOnlineBooking(
  tenantId: TenantId,
  request: ReserveRequest,
  options: { now: EpochMs },
): Promise<ReserveResult> {
  return withTenant(tenantId, async (t) => {
    await lockTenantBookings(t);

    const existing = await findByIdempotencyKey(t, request.idempotencyKey);
    if (existing) {
      return {
        ok: true,
        bookingId: existing.id,
        token: deriveBookingToken(existing.id, existing.tokenVersion),
        publicRef: existing.publicRef,
        status: existing.status === "pending" ? "pending" : "confirmed",
        reused: true,
      };
    }

    const tenant = await loadTenantInfo(t);
    const settings = await loadBookingSettings(t);
    const catalog = await loadCatalog(t);

    const priced = estimate(catalog.pricing, request.selection, {
      flow: "online",
      slotStepMin: settings.slotStepMin,
    });
    if (!priced.ok) return { ok: false, error: "invalid_selection", detail: priced.error };
    const { bookedDurationMin } = priced.estimate;
    if (bookedDurationMin <= 0) return { ok: false, error: "invalid_selection", detail: null };

    const startsAt = request.startsAt;
    const endsAt = startsAt + bookedDurationMin * MINUTE_MS;
    const dayContext = await loadScheduleContext(t, tenant.timezone, settings, {
      from: startsAt - DAY_MS,
      to: endsAt + DAY_MS,
      fromDate: localDateOf(startsAt, tenant.timezone).toString(),
    });
    const free = isSlotAvailable(
      { ...dayContext, now: options.now, durationMin: bookedDurationMin },
      startsAt,
    );
    if (!free) {
      const horizon = await loadScheduleContext(t, tenant.timezone, settings, {
        from: options.now,
        to: options.now + (settings.maxDaysAhead + 2) * DAY_MS,
        fromDate: localDateOf(options.now, tenant.timezone).toString(),
      });
      const alternatives = availableSlots({ ...horizon, now: options.now, durationMin: bookedDurationMin })
        .filter((slot) => slot.startsAt >= startsAt)
        .slice(0, 3);
      return { ok: false, error: "slot_taken", alternatives };
    }

    const activeForPhone = await countActiveBookingsForPhone(t, request.customer.phoneE164, options.now);
    if (activeForPhone >= settings.maxActiveBookingsPerPhone) {
      return { ok: false, error: "too_many_bookings" };
    }

    const now = new Date(options.now);
    const customerId = await upsertCustomer(t, request.customer, now, request.marketingOptIn);
    const status = settings.confirmationMode === "auto" ? "confirmed" : "pending";
    const booking = await persistBooking(t, {
      customerId,
      status,
      source: "online",
      startsAt,
      endsAt,
      usesOnlineCapacity: true,
      overCapacity: false,
      selection: request.selection,
      display: catalog.display,
      estimate: priced.estimate,
      plate: request.customer.plate,
      customerNote: null,
      idempotencyKey: request.idempotencyKey,
      createdByUserId: null,
      now,
    });

    await t.tx.insert(customerConsents).values([
      {
        tenantId,
        customerId,
        purpose: "privacy_notice",
        granted: true,
        textVersion: CONSENT_TEXT_VERSION,
        textSnapshot: PRIVACY_CONSENT_TEXT,
        source: "online_form",
        bookingId: booking.id,
      },
      ...(request.marketingOptIn
        ? [
            {
              tenantId,
              customerId,
              purpose: "marketing_sms" as const,
              granted: true,
              textVersion: CONSENT_TEXT_VERSION,
              textSnapshot: MARKETING_CONSENT_TEXT,
              source: "online_form" as const,
              bookingId: booking.id,
            },
          ]
        : []),
    ]);

    await t.tx.insert(auditLog).values({
      tenantId,
      actorKind: "customer",
      action: "booking.create",
      entityType: "booking",
      entityId: booking.id,
      after: {
        source: "online",
        status,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        services: priced.estimate.lines.map((line) => line.code),
      },
    });

    return { ok: true, bookingId: booking.id, token: booking.token, publicRef: booking.publicRef, status, reused: false };
  });
}

async function findByIdempotencyKey(t: TenantTx, key: string) {
  const [row] = await t.tx
    .select({
      id: bookings.id,
      publicRef: bookings.publicRef,
      status: bookings.status,
      tokenVersion: bookings.tokenVersion,
    })
    .from(bookings)
    .where(and(eq(bookings.tenantId, t.tenantId), eq(bookings.idempotencyKey, key)))
    .limit(1);
  return row ?? null;
}

async function countActiveBookingsForPhone(t: TenantTx, phoneE164: string, now: EpochMs): Promise<number> {
  const [row] = await t.tx
    .select({ n: count() })
    .from(bookings)
    .innerJoin(customers, and(eq(customers.tenantId, bookings.tenantId), eq(customers.id, bookings.customerId)))
    .where(
      and(
        eq(bookings.tenantId, t.tenantId),
        eq(customers.phoneE164, phoneE164),
        inArray(bookings.status, ["pending", "confirmed"]),
        gt(bookings.endsAt, new Date(now)),
      ),
    );
  return row?.n ?? 0;
}
