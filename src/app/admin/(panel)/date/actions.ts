"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormResult } from "@/components/admin/action-form";
import { auditActor, requireAdmin } from "@/server/auth/session";
import { eraseCustomer } from "@/server/gdpr/erase";
import { withTenant } from "@/server/tenant";

const eraseSchema = z.object({
  customerId: z.uuid(),
  confirm: z.literal("on", { error: "Bifează că persoana a cerut ștergerea datelor." }),
});

/** Ștergerea datelor unui client, la cererea lui. Nu se poate anula. */
export async function eraseCustomerAction(_previous: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await requireAdmin();
  const parsed = eraseSchema.safeParse({ customerId: formData.get("customerId"), confirm: formData.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Date invalide." };

  const result = await withTenant(ctx.tenantId, (t) => eraseCustomer(t, auditActor(ctx), parsed.data.customerId, new Date()));
  if (!result.ok) return { error: "Clientul nu mai există sau datele lui au fost deja șterse." };
  redirect(`/admin/date?sters=${result.bookings}-${result.cancelledUpcoming}`);
}
