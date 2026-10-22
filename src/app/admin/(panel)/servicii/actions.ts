"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormResult } from "@/components/admin/action-form";
import { PRICING_MODES, SERVICE_UNITS } from "@/domain/enums";
import {
  createService,
  moveService,
  updateServiceDetails,
  updateServicePrices,
} from "@/server/admin/catalog";
import { markReviewed } from "@/server/admin/review";
import { auditActor, requireAdmin } from "@/server/auth/session";
import { withTenant } from "@/server/tenant";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v));
const optionalMinutes = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === "") return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 600) {
      ctx.addIssue({ code: "custom", message: "Durata trebuie să fie un număr de minute între 0 și 600." });
      return z.NEVER;
    }
    return n;
  });

const detailsSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(2, "Scrie numele serviciului.").max(120),
  description: optionalText(500),
  includes: optionalText(500),
  customerExplainer: optionalText(600),
  categoryId: z.uuid(),
  unit: z.enum(SERVICE_UNITS),
  baseDurationMin: optionalMinutes,
  perUnitDurationMin: optionalMinutes,
  bookableOnline: z.boolean(),
  active: z.boolean(),
  maxQuantity: z.coerce.number().int().min(1).max(50),
});

export async function updateServiceDetailsAction(_previous: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await requireAdmin();
  const parsed = detailsSchema.safeParse({
    ...Object.fromEntries(formData),
    bookableOnline: formData.get("bookableOnline") === "on",
    active: formData.get("active") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Date invalide." };
  const { id, ...input } = parsed.data;
  const result = await withTenant(ctx.tenantId, (t) =>
    updateServiceDetails(t, auditActor(ctx), id, { ...input, perUnitDurationMin: input.perUnitDurationMin ?? 0 }),
  );
  if (!result.ok) return { error: result.error };
  refresh();
  return { error: null, ok: true };
}

const pricesSchema = z.object({
  serviceId: z.uuid(),
  mode: z.enum(PRICING_MODES),
  byVehicle: z.boolean(),
  byRimSize: z.boolean(),
  byRimType: z.boolean(),
  cells: z
    .array(
      z.object({
        vehicleTypeId: z.uuid().nullable(),
        rimSizeId: z.uuid().nullable(),
        rimTypeId: z.uuid().nullable(),
        text: z.string().max(30),
      }),
    )
    .max(2000),
});

export async function updateServicePricesAction(input: unknown): Promise<FormResult> {
  const ctx = await requireAdmin();
  const parsed = pricesSchema.safeParse(input);
  if (!parsed.success) return { error: "Date invalide. Reîncarcă pagina." };
  const { serviceId, ...prices } = parsed.data;
  const result = await withTenant(ctx.tenantId, (t) => updateServicePrices(t, auditActor(ctx), serviceId, prices));
  if (!result.ok) return { error: result.error };
  refresh();
  return { error: null, ok: true, message: "Prețurile au fost salvate." };
}

export async function createServiceAction(_previous: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await requireAdmin();
  const parsed = z
    .object({ name: z.string().trim().min(2, "Scrie numele serviciului.").max(120), categoryId: z.uuid(), unit: z.enum(SERVICE_UNITS) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Date invalide." };
  const result = await withTenant(ctx.tenantId, (t) => createService(t, auditActor(ctx), parsed.data));
  if (!result.ok) return { error: result.error };
  redirect(`/admin/servicii/${result.id}`);
}

export async function moveServiceAction(formData: FormData): Promise<void> {
  const ctx = await requireAdmin();
  const parsed = z.object({ id: z.uuid(), direction: z.enum(["up", "down"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await withTenant(ctx.tenantId, (t) => moveService(t, auditActor(ctx), parsed.data.id, parsed.data.direction));
  refresh();
}

const reviewTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("service"), id: z.uuid() }),
  z.object({ type: z.literal("duration"), id: z.uuid() }),
  z.object({ type: z.literal("price"), id: z.uuid() }),
  z.object({ type: z.literal("surcharge"), id: z.uuid() }),
  z.object({ type: z.literal("hours") }),
  z.object({ type: z.literal("sms"), kind: z.string().max(40) }),
  z.object({ type: z.literal("tenant"), field: z.enum(["display_name", "registered_address", "email", "retention_months", "sms_monthly_limit"]) }),
]);

/** „E corect”: valoarea de pornire e confirmată de patron. */
export async function markReviewedAction(_previous: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await requireAdmin();
  let target: unknown;
  try {
    target = JSON.parse(String(formData.get("target") ?? ""));
  } catch {
    return { error: "Cerere invalidă." };
  }
  const parsed = reviewTargetSchema.safeParse(target);
  if (!parsed.success) return { error: "Cerere invalidă." };
  await withTenant(ctx.tenantId, (t) => markReviewed(t, auditActor(ctx), parsed.data));
  refresh();
  return { error: null, ok: true, message: "Confirmat." };
}
