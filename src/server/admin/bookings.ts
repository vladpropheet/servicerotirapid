import "server-only";
import { and, asc, eq, gt, inArray, lt, ne } from "drizzle-orm";
import { maxConcurrent } from "@/domain/availability";
import type { BookingStatus } from "@/domain/enums";
import { estimate, type EstimateErrorCode, type PricingSelection } from "@/domain/pricing";
import { localDateOf, localTimeLabel, MINUTE_MS, type EpochMs } from "@/domain/time";
import { lockTenantBookings, persistBooking, upsertCustomer } from "@/server/booking/persist";
import { bookingItems, bookings, customers } from "@/server/db/schema";
import { loadBookingSettings, loadCatalog, loadScheduleContext } from "@/server/repos/booking-data";
import type { TenantTx } from "@/server/tenant";
import { writeAudit, type Actor } from "./audit";

// Programările, din panoul patronului: liste pe zile, schimbarea statusului, programări adăugate manual.

export type AdminBooking = {
  id: string;
  publicRef: string;
  status: BookingStatus;
  source: "online" | "manual";
  startsAt: Date;
  endsAt: Date;
  customerName: string | null;
  customerPhone: string | null;
  plate: string | null;
  vehicle: string;
  wheelCount: number;
  estimateMinBani: number;
  estimateMaxBani: number;
  estimateHasUnpriced: boolean;
  overCapacity: boolean;
  customerNote: string | null;
  items: { name: string; quantity: number; kind: string }[];
};

/** Programările care încep în intervalul [from, to), în ordinea orei. */
export async function listBookings(t: TenantTx, range: { from: Date; to: Date }): Promise<AdminBooking[]> {
  const rows = await t.tx
    .select({ booking: bookings, customerName: customers.fullName, customerPhone: customers.phoneE164 })
    .from(bookings)
    .innerJoin(customers, and(eq(customers.tenantId, bookings.tenantId), eq(customers.id, bookings.customerId)))
    .where(and(eq(bookings.tenantId, t.tenantId), gt(bookings.startsAt, new Date(range.from.getTime() - 1)), lt(bookings.startsAt, range.to)))
    .orderBy(asc(bookings.startsAt));
  if (rows.length === 0) return [];

  const items = await t.tx
    .select({
      bookingId: bookingItems.bookingId,
      name: bookingItems.nameSnapshot,
      quantity: bookingItems.quantity,
      kind: bookingItems.kind,
    })
    .from(bookingItems)
    .where(and(eq(bookingItems.tenantId, t.tenantId), inArray(bookingItems.bookingId, rows.map((r) => r.booking.id))))
    .orderBy(asc(bookingItems.position));

  return rows.map(({ booking: b, customerName, customerPhone }) => ({
    id: b.id,
    publicRef: b.publicRef,
    status: b.status,
    source: b.source,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    customerName,
    customerPhone,
    plate: b.plate,
    vehicle: [b.vehicleTypeLabel, b.rimSizeLabel, b.rimTypeLabel?.toLowerCase()].filter(Boolean).join(" · "),
    wheelCount: b.wheelCount,
    estimateMinBani: b.estimateMinBani,
    estimateMaxBani: b.estimateMaxBani,
    estimateHasUnpriced: b.estimateHasUnpriced,
    overCapacity: b.overCapacity,
    customerNote: b.customerNote,
    items: items.filter((i) => i.bookingId === b.id).map(({ name, quantity, kind }) => ({ name, quantity, kind })),
  }));
}

/** Schimbările de status permise din panou. O programare anulată nu se mai reactivează (se face una nouă). */
const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["cancelled", "completed", "no_show"],
  completed: ["confirmed"],
  no_show: ["confirmed"],
  cancelled: [],
};

export function allowedTransitions(status: BookingStatus): BookingStatus[] {
  return TRANSITIONS[status];
}

export type StatusChangeResult = { ok: true } | { ok: false; error: "not_found" | "invalid_transition" };

export async function changeBookingStatus(
  t: TenantTx,
  actor: Actor,
  input: { bookingId: string; next: BookingStatus; now: Date },
): Promise<StatusChangeResult> {
  await lockTenantBookings(t);
  const [booking] = await t.tx
    .select({ id: bookings.id, status: bookings.status })
    .from(bookings)
    .where(and(eq(bookings.tenantId, t.tenantId), eq(bookings.id, input.bookingId)))
    .limit(1);
  if (!booking) return { ok: false, error: "not_found" };
  if (!TRANSITIONS[booking.status].includes(input.next)) return { ok: false, error: "invalid_transition" };

  await t.tx
    .update(bookings)
    .set({
      status: input.next,
      ...(input.next === "confirmed" ? { confirmedAt: input.now, completedAt: null } : {}),
      ...(input.next === "completed" ? { completedAt: input.now } : {}),
      ...(input.next === "cancelled" ? { cancelledAt: input.now, cancelledBy: "shop" as const } : {}),
    })
    .where(and(eq(bookings.tenantId, t.tenantId), eq(bookings.id, booking.id)));
  await writeAudit(t, actor, {
    action: "booking.status",
    entityType: "booking",
    entityId: booking.id,
    before: { status: booking.status },
    after: { status: input.next },
  });
  return { ok: true };
}

export type ManualBookingInput = {
  selection: PricingSelection;
  startsAt: EpochMs;
  /** Durata în minute, dacă patronul vrea alta decât cea calculată (obligatorie pentru serviciile fără durată). */
  durationMin: number | null;
  customer: { fullName: string; phoneE164: string; plate: string | null };
  note: string | null;
  /** Patronul a văzut avertismentele și salvează oricum. */
  force: boolean;
  timeZone: string;
  now: Date;
};

export type ManualBookingResult =
  | { ok: true; bookingId: string; publicRef: string }
  | { ok: false; error: "invalid_selection"; code: EstimateErrorCode }
  | { ok: false; error: "duration_required" }
  | { ok: false; error: "needs_confirmation"; warnings: string[]; durationMin: number };

/**
 * Programare adăugată de patron (clienți care sună). Nu e restricționată de programul online,
 * dar patronul e avertizat la suprapuneri, ore din afara programului sau intervale blocate.
 */
export async function createManualBooking(t: TenantTx, actor: Actor, input: ManualBookingInput): Promise<ManualBookingResult> {
  await lockTenantBookings(t);
  const settings = await loadBookingSettings(t);
  const catalog = await loadCatalog(t);

  const priced = estimate(catalog.pricing, input.selection, { flow: "admin", slotStepMin: settings.slotStepMin });
  if (!priced.ok) return { ok: false, error: "invalid_selection", code: priced.error.code };
  const durationMin = input.durationMin ?? priced.estimate.bookedDurationMin;
  if (!durationMin || durationMin <= 0) return { ok: false, error: "duration_required" };

  const startsAt = input.startsAt;
  const endsAt = startsAt + durationMin * MINUTE_MS;
  const warnings = await manualBookingWarnings(t, input.timeZone, settings, { startsAt, endsAt, now: input.now.getTime() });
  if (warnings.length > 0 && !input.force) {
    return { ok: false, error: "needs_confirmation", warnings, durationMin };
  }

  const usesOnlineCapacity = settings.manualBookingsUseCapacity;
  const context = await loadScheduleContext(t, input.timeZone, settings, {
    from: startsAt - MINUTE_MS,
    to: endsAt + MINUTE_MS,
    fromDate: localDateOf(startsAt, input.timeZone).toString(),
  });
  const overCapacity =
    usesOnlineCapacity && maxConcurrent(context.holds, startsAt, endsAt) >= settings.onlineCapacity;

  const customerId = await upsertCustomer(t, input.customer, input.now, false);
  const booking = await persistBooking(t, {
    customerId,
    status: "confirmed",
    source: "manual",
    startsAt,
    endsAt,
    usesOnlineCapacity,
    overCapacity,
    selection: input.selection,
    display: catalog.display,
    estimate: { ...priced.estimate, workDurationMin: priced.estimate.workDurationMin || durationMin },
    plate: input.customer.plate,
    customerNote: input.note,
    idempotencyKey: null,
    createdByUserId: actor.actorUserId,
    now: input.now,
  });
  await writeAudit(t, actor, {
    action: "booking.create",
    entityType: "booking",
    entityId: booking.id,
    after: {
      source: "manual",
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      services: priced.estimate.lines.map((line) => line.code),
      warningsAccepted: warnings.length > 0 ? warnings : undefined,
    },
  });
  return { ok: true, bookingId: booking.id, publicRef: booking.publicRef };
}

async function manualBookingWarnings(
  t: TenantTx,
  timeZone: string,
  settings: Awaited<ReturnType<typeof loadBookingSettings>>,
  range: { startsAt: EpochMs; endsAt: EpochMs; now: EpochMs },
): Promise<string[]> {
  const warnings: string[] = [];
  const time = (ms: EpochMs) => localTimeLabel(ms, timeZone);

  if (range.startsAt < range.now) warnings.push("Ora aleasă e în trecut.");

  const overlapping = await t.tx
    .select({ startsAt: bookings.startsAt, endsAt: bookings.endsAt, name: customers.fullName })
    .from(bookings)
    .innerJoin(customers, and(eq(customers.tenantId, bookings.tenantId), eq(customers.id, bookings.customerId)))
    .where(
      and(
        eq(bookings.tenantId, t.tenantId),
        ne(bookings.status, "cancelled"),
        lt(bookings.startsAt, new Date(range.endsAt)),
        gt(bookings.endsAt, new Date(range.startsAt)),
      ),
    )
    .orderBy(asc(bookings.startsAt));
  for (const other of overlapping) {
    warnings.push(
      `Se suprapune cu programarea ${time(other.startsAt.getTime())}–${time(other.endsAt.getTime())}${other.name ? ` (${other.name})` : ""}.`,
    );
  }

  const context = await loadScheduleContext(t, timeZone, settings, {
    from: range.startsAt - MINUTE_MS,
    to: range.endsAt + MINUTE_MS,
    fromDate: localDateOf(range.startsAt, timeZone).toString(),
  });
  const day = localDateOf(range.startsAt, timeZone);
  const dayText = day.toString();
  const blocked = context.closures.some((c) =>
    "dateFrom" in c
      ? c.dateFrom <= dayText && dayText <= c.dateTo
      : c.startsAt < range.endsAt && c.endsAt > range.startsAt,
  );
  if (blocked) warnings.push("Intervalul e într-o zi liberă sau într-un interval blocat.");

  const open = context.businessHours.some((h) => {
    if (h.weekday !== day.dayOfWeek) return false;
    const start = time(range.startsAt);
    const end = time(range.endsAt);
    return h.opensAt.slice(0, 5) <= start && end <= h.closesAt.slice(0, 5) && localDateOf(range.endsAt, timeZone).equals(day);
  });
  if (!open) warnings.push("Ora aleasă e în afara programului de lucru.");

  return warnings;
}
