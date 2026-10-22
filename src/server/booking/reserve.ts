import "server-only";
import { randomInt } from "node:crypto";
import { and, count, eq, gt, inArray, sql } from "drizzle-orm";
import { availableSlots, isSlotAvailable, type Slot } from "@/domain/availability";
import { estimate, type EstimateError, type PricingSelection } from "@/domain/pricing";
import { localDateOf, MINUTE_MS, type EpochMs } from "@/domain/time";
import { CONSENT_TEXT_VERSION, MARKETING_CONSENT_TEXT, PRIVACY_CONSENT_TEXT } from "@/lib/consent-texts";
import {
  auditLog,
  bookingAccessTokens,
  bookingItems,
  bookings,
  customerConsents,
  customers,
} from "@/server/db/schema";
import {
  loadBookingSettings,
  loadCatalog,
  loadScheduleContext,
  loadTenantInfo,
} from "@/server/repos/booking-data";
import { withTenant, type TenantId, type TenantTx } from "@/server/tenant";
import { deriveBookingToken, hashBookingToken, TOKEN_KEY_ID } from "./token";

// Rezervarea atomică a unei programări online (planul Fazei 0, „Rezervarea atomică”).
//
// 1. Tranzacție READ COMMITTED + blocare pe tenant (pg_advisory_xact_lock), ca instrucțiune separată,
//    ÎNAINTE de orice citire. Două cereri pentru același service trec pe rând; fiecare citire de după
//    blocare vede tot ce a salvat cererea dinainte.
// 2. Prețul, durata și disponibilitatea se recalculează pe server, din baza de date.
// 3. Totul se salvează în aceeași tranzacție: client, programare, linii, acorduri, link, istoric.

const DAY_MS = 24 * 60 * MINUTE_MS;
/** Linkul „vezi programarea” mai merge o săptămână după programare. */
const TOKEN_VALID_AFTER_START_MS = 7 * DAY_MS;
const PUBLIC_REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

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
    await t.tx.execute(sql`set local lock_timeout = '5s'`);
    await t.tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`booking:${tenantId}`}, 0))`);

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
    const [customer] = await t.tx
      .insert(customers)
      .values({
        tenantId,
        fullName: request.customer.fullName,
        phoneE164: request.customer.phoneE164,
        marketingSmsOptIn: request.marketingOptIn,
        lastBookingAt: now,
      })
      .onConflictDoUpdate({
        target: [customers.tenantId, customers.phoneE164],
        set: {
          fullName: request.customer.fullName,
          lastBookingAt: now,
          // O bifă nebifată acum nu retrage un acord dat înainte; retragerea se face explicit.
          ...(request.marketingOptIn ? { marketingSmsOptIn: true } : {}),
        },
      })
      .returning({ id: customers.id });
    if (!customer) throw new Error("Clientul nu a putut fi salvat.");

    const label = (list: { id: string; label: string }[], id: string | null) =>
      id === null ? null : (list.find((item) => item.id === id)?.label ?? null);
    const status = settings.confirmationMode === "auto" ? "confirmed" : "pending";

    const [booking] = await t.tx
      .insert(bookings)
      .values({
        tenantId,
        publicRef: await newPublicRef(t),
        customerId: customer.id,
        status,
        source: "online",
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        usesOnlineCapacity: true,
        vehicleTypeId: request.selection.vehicleTypeId,
        vehicleTypeLabel: label(catalog.display.vehicleTypes, request.selection.vehicleTypeId) ?? "",
        rimSizeId: request.selection.rimSizeId,
        rimSizeLabel: label(catalog.display.rimSizes, request.selection.rimSizeId),
        rimTypeId: request.selection.rimTypeId,
        rimTypeLabel: label(catalog.display.rimTypes, request.selection.rimTypeId),
        wheelCount: request.selection.wheelCount,
        plate: request.customer.plate,
        estimateMinBani: priced.estimate.totalMinBani,
        estimateMaxBani: priced.estimate.totalMaxBani,
        estimateHasUnpriced: priced.estimate.hasUnpriced,
        workDurationMin: priced.estimate.workDurationMin,
        confirmedAt: status === "confirmed" ? now : null,
        idempotencyKey: request.idempotencyKey,
      })
      .returning({ id: bookings.id, publicRef: bookings.publicRef, tokenVersion: bookings.tokenVersion });
    if (!booking) throw new Error("Programarea nu a putut fi salvată.");

    await t.tx.insert(bookingItems).values(
      priced.estimate.lines.map((line, index) => ({
        tenantId,
        bookingId: booking.id,
        position: index + 1,
        kind: line.kind,
        serviceId: line.kind === "service" ? line.refId : null,
        surchargeId: line.kind === "surcharge" ? line.refId : null,
        codeSnapshot: line.code,
        nameSnapshot: line.name,
        unitSnapshot: line.unit,
        quantity: line.quantity,
        priceStatus: line.priceStatus,
        unitMinBani: line.unitMinBani,
        unitMaxBani: line.unitMaxBani,
        priceIsMinimum: line.priceIsMinimum,
        lineMinBani: line.lineMinBani,
        lineMaxBani: line.lineMaxBani,
        durationMin: line.durationMin,
        pricingBasis: {
          matchedCellIds: line.matchedCellIds,
          partlyOnRequest: line.partlyOnRequest,
          rimSizeUnknown: priced.estimate.rimSizeUnknown,
          rimTypeUnknown: priced.estimate.rimTypeUnknown,
        },
      })),
    );

    await t.tx.insert(customerConsents).values([
      {
        tenantId,
        customerId: customer.id,
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
              customerId: customer.id,
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

    const token = deriveBookingToken(booking.id, booking.tokenVersion);
    await t.tx.insert(bookingAccessTokens).values({
      lookupHash: hashBookingToken(token),
      tenantId,
      bookingId: booking.id,
      tokenVersion: booking.tokenVersion,
      keyId: TOKEN_KEY_ID,
      expiresAt: new Date(startsAt + TOKEN_VALID_AFTER_START_MS),
    });

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

    return { ok: true, bookingId: booking.id, token, publicRef: booking.publicRef, status, reused: false };
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

/** Cod scurt de 6 caractere, fără litere ușor de confundat (O/0, I/1). Unic per tenant. */
async function newPublicRef(t: TenantTx): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const ref = Array.from({ length: 6 }, () => PUBLIC_REF_ALPHABET[randomInt(PUBLIC_REF_ALPHABET.length)]).join("");
    const [taken] = await t.tx
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.tenantId, t.tenantId), eq(bookings.publicRef, ref)))
      .limit(1);
    if (!taken) return ref;
  }
  throw new Error("Nu am putut genera un cod de programare unic.");
}
