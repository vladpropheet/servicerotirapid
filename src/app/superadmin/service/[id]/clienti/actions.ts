"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormResult } from "@/components/admin/action-form";
import { requireSuperadminTenant, superadminActor } from "@/server/auth/session";
import { eraseCustomer } from "@/server/gdpr/erase";
import { withTenant } from "@/server/tenant";

const eraseSchema = z.object({
  tenantId: z.uuid(),
  customerId: z.uuid(),
  confirm: z.literal("on", { error: "Bifează că persoana a cerut ștergerea datelor." }),
});

/** Ștergerea datelor unui client, la cererea lui (doar super-admin). Nu se poate anula. */
export async function eraseCustomerAction(_previous: FormResult, formData: FormData): Promise<FormResult> {
  const parsed = eraseSchema.safeParse({
    tenantId: formData.get("tenantId"),
    customerId: formData.get("customerId"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Date invalide." };
  const ctx = await requireSuperadminTenant(parsed.data.tenantId);

  const result = await withTenant(ctx.tenantId, (t) => eraseCustomer(t, superadminActor(ctx), parsed.data.customerId, new Date()));
  if (!result.ok) return { error: "Clientul nu mai există sau datele lui au fost deja șterse." };
  redirect(`/superadmin/service/${ctx.tenantId}/clienti?sters=${result.bookings}-${result.cancelledUpcoming}`);
}
