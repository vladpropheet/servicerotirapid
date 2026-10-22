"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormResult } from "@/components/admin/action-form";
import { SURCHARGE_STACKING, SURCHARGE_UNITS } from "@/domain/enums";
import { updateSurcharge } from "@/server/admin/catalog";
import { auditActor, requireAdmin } from "@/server/auth/session";
import { withTenant } from "@/server/tenant";

const schema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(2, "Scrie numele suprataxei.").max(120),
  description: z
    .string()
    .trim()
    .max(300)
    .transform((v) => (v === "" ? null : v)),
  priceText: z.string().max(30),
  unit: z.enum(SURCHARGE_UNITS),
  stacking: z.enum(SURCHARGE_STACKING),
  customerSelectable: z.boolean(),
  active: z.boolean(),
  serviceIds: z.array(z.uuid()).max(200),
});

export async function updateSurchargeAction(_previous: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await requireAdmin();
  const parsed = schema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    priceText: formData.get("priceText"),
    unit: formData.get("unit"),
    stacking: formData.get("stacking"),
    customerSelectable: formData.get("customerSelectable") === "on",
    active: formData.get("active") === "on",
    serviceIds: formData.getAll("serviceIds"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Date invalide." };
  const { id, ...input } = parsed.data;
  const result = await withTenant(ctx.tenantId, (t) => updateSurcharge(t, auditActor(ctx), id, input));
  if (!result.ok) return { error: result.error };
  refresh();
  return { error: null, ok: true };
}
