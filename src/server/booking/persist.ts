import "server-only";
import { randomInt } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { Estimate, PricingSelection } from "@/domain/pricing";
import { MINUTE_MS, type EpochMs } from "@/domain/time";
import type { PublicCatalog } from "@/lib/public-catalog";
import { bookingAccessTokens, bookingItems, bookings, customers } from "@/server/db/schema";
import type { TenantTx } from "@/server/tenant";
import { deriveBookingToken, hashBookingToken, TOKEN_KEY_ID } from "./token";

// Pașii comuni pentru salvarea unei programări, folosiți de rezervarea online și de cea adăugată de patron.

/** Linkul „vezi programarea” mai merge o săptămână după programare. */
const TOKEN_VALID_AFTER_START_MS = 7 * 24 * 60 * MINUTE_MS;
const PUBLIC_REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Blocarea pe tenant: două operații care schimbă programările aceluiași service trec pe rând.
 * Trebuie să fie prima instrucțiune din tranzacție, înainte de orice citire.
 */
export async function lockTenantBookings(t: TenantTx): Promise<void> {
  await t.tx.execute(sql`set local lock_timeout = '5s'`);
  await t.tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`booking:${t.tenantId}`}, 0))`);
}

export async function upsertCustomer(
  t: TenantTx,
  customer: { fullName: string; phoneE164: string },
  now: Date,
  marketingOptIn: boolean,
): Promise<string> {
  const [row] = await t.tx
    .insert(customers)
    .values({
      tenantId: t.tenantId,
      fullName: customer.fullName,
      phoneE164: customer.phoneE164,
      marketingSmsOptIn: marketingOptIn,
      lastBookingAt: now,
    })
    .onConflictDoUpdate({
      target: [customers.tenantId, customers.phoneE164],
      set: {
        fullName: customer.fullName,
        lastBookingAt: now,
        // O bifă nebifată acum nu retrage un acord dat înainte; retragerea se face explicit.
        ...(marketingOptIn ? { marketingSmsOptIn: true } : {}),
      },
    })
    .returning({ id: customers.id });
  if (!row) throw new Error("Clientul nu a putut fi salvat.");
  return row.id;
}

export type NewBooking = {
  customerId: string;
  status: "pending" | "confirmed";
  source: "online" | "manual";
  startsAt: EpochMs;
  endsAt: EpochMs;
  usesOnlineCapacity: boolean;
  overCapacity: boolean;
  selection: PricingSelection;
  display: PublicCatalog;
  estimate: Estimate;
  plate: string | null;
  customerNote: string | null;
  idempotencyKey: string | null;
  createdByUserId: string | null;
  now: Date;
};

/** Salvează programarea, liniile ei (copii ale prețurilor de acum) și linkul „vezi / anulează”. */
export async function persistBooking(
  t: TenantTx,
  input: NewBooking,
): Promise<{ id: string; publicRef: string; token: string }> {
  const label = (list: { id: string; label: string }[], id: string | null) =>
    id === null ? null : (list.find((item) => item.id === id)?.label ?? null);

  const [booking] = await t.tx
    .insert(bookings)
    .values({
      tenantId: t.tenantId,
      publicRef: await newPublicRef(t),
      customerId: input.customerId,
      status: input.status,
      source: input.source,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      usesOnlineCapacity: input.usesOnlineCapacity,
      overCapacity: input.overCapacity,
      vehicleTypeId: input.selection.vehicleTypeId,
      vehicleTypeLabel: label(input.display.vehicleTypes, input.selection.vehicleTypeId) ?? "",
      rimSizeId: input.selection.rimSizeId,
      rimSizeLabel: label(input.display.rimSizes, input.selection.rimSizeId),
      rimTypeId: input.selection.rimTypeId,
      rimTypeLabel: label(input.display.rimTypes, input.selection.rimTypeId),
      wheelCount: input.selection.wheelCount,
      plate: input.plate,
      customerNote: input.customerNote,
      estimateMinBani: input.estimate.totalMinBani,
      estimateMaxBani: input.estimate.totalMaxBani,
      estimateHasUnpriced: input.estimate.hasUnpriced,
      workDurationMin: Math.max(1, input.estimate.workDurationMin),
      confirmedAt: input.status === "confirmed" ? input.now : null,
      idempotencyKey: input.idempotencyKey,
      createdByUserId: input.createdByUserId,
    })
    .returning({ id: bookings.id, publicRef: bookings.publicRef, tokenVersion: bookings.tokenVersion });
  if (!booking) throw new Error("Programarea nu a putut fi salvată.");

  await t.tx.insert(bookingItems).values(
    input.estimate.lines.map((line, index) => ({
      tenantId: t.tenantId,
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
        rimSizeUnknown: input.estimate.rimSizeUnknown,
        rimTypeUnknown: input.estimate.rimTypeUnknown,
      },
    })),
  );

  const token = deriveBookingToken(booking.id, booking.tokenVersion);
  await t.tx.insert(bookingAccessTokens).values({
    lookupHash: hashBookingToken(token),
    tenantId: t.tenantId,
    bookingId: booking.id,
    tokenVersion: booking.tokenVersion,
    keyId: TOKEN_KEY_ID,
    expiresAt: new Date(input.startsAt + TOKEN_VALID_AFTER_START_MS),
  });

  return { id: booking.id, publicRef: booking.publicRef, token };
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
