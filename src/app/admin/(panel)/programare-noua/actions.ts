"use server";

import { localDateTimeToEpochMs } from "@/domain/time";
import { manualBookingSchema } from "@/lib/validation/booking";
import { createManualBooking } from "@/server/admin/bookings";
import { auditActor, requireAdmin } from "@/server/auth/session";
import { withTenant } from "@/server/tenant";

export type ManualBookingActionResult =
  | { ok: true; date: string }
  | { ok: false; fieldErrors: Record<string, string> }
  | { ok: false; warnings: string[]; durationMin: number }
  | { ok: false; message: string };

const ESTIMATE_MESSAGES: Record<string, string> = {
  not_offered: "Unul dintre servicii e marcat „nu facem” pentru această mașină.",
  conflict: "Două dintre servicii nu se pot alege împreună.",
  invalid_quantity: "Cantitatea aleasă nu e permisă.",
  service_inactive: "Un serviciu ales nu mai e activ.",
};

export async function createManualBookingAction(input: unknown): Promise<ManualBookingActionResult> {
  const ctx = await requireAdmin();
  const parsed = manualBookingSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
    return { ok: false, fieldErrors };
  }
  const data = parsed.data;
  let startsAt: number;
  try {
    startsAt = localDateTimeToEpochMs(data.date, data.time, ctx.timeZone);
  } catch {
    return { ok: false, fieldErrors: { date: "Data sau ora nu sunt valide." } };
  }

  const result = await withTenant(ctx.tenantId, (t) =>
    createManualBooking(t, auditActor(ctx), {
      selection: data.selection,
      startsAt,
      durationMin: data.durationMin,
      customer: { fullName: data.customer.fullName, phoneE164: data.customer.phone, plate: data.customer.plate },
      note: data.note,
      force: data.force,
      timeZone: ctx.timeZone,
      now: new Date(),
    }),
  );

  if (result.ok) return { ok: true, date: data.date };
  switch (result.error) {
    case "needs_confirmation":
      return { ok: false, warnings: result.warnings, durationMin: result.durationMin };
    case "duration_required":
      return { ok: false, fieldErrors: { durationMin: "Serviciile alese nu au durată: scrie câte minute durează." } };
    case "invalid_selection":
      return { ok: false, message: ESTIMATE_MESSAGES[result.code] ?? "Serviciile alese nu se pot salva împreună." };
  }
}
