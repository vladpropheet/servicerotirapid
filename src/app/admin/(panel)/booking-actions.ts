"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { BOOKING_STATUSES } from "@/domain/enums";
import { changeBookingStatus } from "@/server/admin/bookings";
import { auditActor, requireAdmin } from "@/server/auth/session";
import { withTenant } from "@/server/tenant";

const statusSchema = z.object({ bookingId: z.uuid(), next: z.enum(BOOKING_STATUSES) });

export type StatusActionState = { error: string | null };

/** Confirmă / anulează / finalizată / nu a venit. Tenantul vine din sesiune, nu din formular. */
export async function changeStatusAction(_previous: StatusActionState, formData: FormData): Promise<StatusActionState> {
  const ctx = await requireAdmin();
  const parsed = statusSchema.safeParse({ bookingId: formData.get("bookingId"), next: formData.get("next") });
  if (!parsed.success) return { error: "Cerere invalidă." };

  const result = await withTenant(ctx.tenantId, (t) =>
    changeBookingStatus(t, auditActor(ctx), { ...parsed.data, now: new Date() }),
  );
  if (!result.ok) {
    return { error: result.error === "not_found" ? "Programarea nu există." : "Statusul nu se mai poate schimba așa." };
  }
  refresh();
  return { error: null };
}
