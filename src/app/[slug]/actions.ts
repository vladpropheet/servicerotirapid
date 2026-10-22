"use server";

// Acțiunile paginii publice de programare. Sunt endpoint-uri publice (POST):
// tot ce vine din browser se validează cu Zod, iar tenantul se ia doar din slug.
import { availableSlots, groupSlotsByDay } from "@/domain/availability";
import { estimate, type EstimateErrorCode } from "@/domain/pricing";
import { localDateOf, MINUTE_MS } from "@/domain/time";
import { FEATURES } from "@/lib/features";
import { bookingRequestSchema, selectionSchema } from "@/lib/validation/booking";
import { reserveOnlineBooking } from "@/server/booking/reserve";
import {
  loadBookingSettings,
  loadCatalog,
  loadScheduleContext,
  loadTenantInfo,
} from "@/server/repos/booking-data";
import { clientIp } from "@/server/security/client-ip";
import { hitRateLimit, RATE_RULES } from "@/server/security/rate-limit";
import { verifyTurnstile } from "@/server/security/turnstile";
import { resolvePublicTenant, withTenant } from "@/server/tenant";

const DAY_MS = 24 * 60 * MINUTE_MS;

export type SlotOption = { startsAt: number; localTime: string; repeatedLocalTime: boolean };
export type SlotDay = { localDate: string; slots: SlotOption[] };

export type SlotsResult =
  | { ok: true; durationMin: number; days: SlotDay[] }
  | { ok: false; error: "not_found" | "invalid" | "server" | "rate_limited" }
  | { ok: false; error: "invalid_selection"; code: EstimateErrorCode | null };

/** Pasul 2: intervalele libere pentru serviciile alese. */
export async function getSlotsAction(slug: string, input: unknown): Promise<SlotsResult> {
  const parsed = selectionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  try {
    if (!(await hitRateLimit("slots", await clientIp(), RATE_RULES.slotsPerIp)).allowed) {
      return { ok: false, error: "rate_limited" };
    }
    const tenant = await resolvePublicTenant(slug);
    if (!tenant) return { ok: false, error: "not_found" };

    const now = Date.now();
    return await withTenant(tenant.id, async (t) => {
      const info = await loadTenantInfo(t);
      const settings = await loadBookingSettings(t);
      const catalog = await loadCatalog(t);

      const priced = estimate(catalog.pricing, parsed.data, { flow: "online", slotStepMin: settings.slotStepMin });
      if (!priced.ok) return { ok: false, error: "invalid_selection", code: priced.error.code } as const;
      const durationMin = priced.estimate.bookedDurationMin;
      if (durationMin <= 0) return { ok: false, error: "invalid_selection", code: null } as const;

      const context = await loadScheduleContext(t, info.timezone, settings, {
        from: now,
        to: now + (settings.maxDaysAhead + 2) * DAY_MS,
        fromDate: localDateOf(now, info.timezone).toString(),
      });
      const slots = availableSlots({ ...context, now, durationMin });
      return {
        ok: true,
        durationMin,
        days: groupSlotsByDay(slots).map((day) => ({
          localDate: day.localDate,
          slots: day.slots.map((s) => ({
            startsAt: s.startsAt,
            localTime: s.localTime,
            repeatedLocalTime: s.repeatedLocalTime,
          })),
        })),
      } as const;
    });
  } catch (error) {
    logFailure("Intervalele nu au putut fi calculate", error);
    return { ok: false, error: "server" };
  }
}

export type CreateBookingResult =
  | { ok: true; token: string }
  | { ok: false; error: "validation"; fieldErrors: Record<string, string> }
  | { ok: false; error: "slot_taken"; alternatives: SlotOption[] }
  | { ok: false; error: "invalid_selection" | "too_many_bookings" | "not_found" | "server" | "rate_limited" | "captcha" };

/** Pasul 3: confirmarea programării. Totul se reverifică pe server. */
export async function createBookingAction(slug: string, input: unknown): Promise<CreateBookingResult> {
  const parsed = bookingRequestSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      fieldErrors[key] ??= issue.message;
    }
    return { ok: false, error: "validation", fieldErrors };
  }

  try {
    // Anti-spam (CLAUDE.md §8): limite pe IP și pe telefon, apoi Cloudflare Turnstile.
    const ip = await clientIp();
    if (
      !(await hitRateLimit("booking-ip", ip, RATE_RULES.bookingsPerIp)).allowed ||
      !(await hitRateLimit("booking-phone", parsed.data.customer.phone, RATE_RULES.bookingsPerPhone)).allowed
    ) {
      return { ok: false, error: "rate_limited" };
    }
    if (!(await verifyTurnstile(parsed.data.turnstileToken))) return { ok: false, error: "captcha" };

    const tenant = await resolvePublicTenant(slug);
    if (!tenant) return { ok: false, error: "not_found" };

    const { selection, startsAt, customer, marketingOptIn, idempotencyKey } = parsed.data;
    const result = await reserveOnlineBooking(
      tenant.id,
      {
        selection,
        startsAt,
        customer: { fullName: customer.fullName, phoneE164: customer.phone, plate: customer.plate },
        // Fără bifă în formular, serverul nu înregistrează niciun acord de marketing (chiar dacă cererea l-ar conține).
        marketingOptIn: FEATURES.marketingSms && marketingOptIn,
        idempotencyKey,
      },
      { now: Date.now() },
    );

    if (result.ok) return { ok: true, token: result.token };
    if (result.error === "slot_taken") {
      return {
        ok: false,
        error: "slot_taken",
        alternatives: result.alternatives.map((s) => ({
          startsAt: s.startsAt,
          localTime: s.localTime,
          repeatedLocalTime: s.repeatedLocalTime,
        })),
      };
    }
    return { ok: false, error: result.error };
  } catch (error) {
    logFailure("Programarea nu a putut fi salvată", error);
    return { ok: false, error: "server" };
  }
}

/** Fără mesajul erorii: erorile bazei de date pot conține datele clientului (nume, telefon). */
function logFailure(what: string, error: unknown): void {
  const name = error instanceof Error ? error.name : "unknown";
  const code = (error as { cause?: { code?: string } } | null)?.cause?.code ?? "";
  console.error(`${what}: ${name} ${code}`.trim());
}
