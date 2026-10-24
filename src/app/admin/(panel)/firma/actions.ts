"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormResult } from "@/components/admin/action-form";
import { normalizeRoPhone } from "@/lib/validation/phone";
import { removeTenantLogo, saveTenantImage, updateTenantProfile } from "@/server/admin/tenant-profile";
import { auditActor, requireAdmin } from "@/server/auth/session";
import { withTenant } from "@/server/tenant";

const required = (label: string, max = 200) => z.string().trim().min(1, `Completează: ${label}.`).max(max);
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v));

const profileSchema = z.object({
  displayName: required("numele afișat", 80),
  legalName: required("denumirea firmei"),
  cui: required("CUI", 20),
  regCom: required("nr. Registrul Comerțului", 40),
  registeredAddress: optional(300),
  workAddress: required("adresa punctului de lucru", 300),
  publicPhone: z
    .string()
    .trim()
    .transform((value, ctx) => {
      const phone = normalizeRoPhone(value);
      if (!phone) {
        ctx.addIssue({ code: "custom", message: "Telefon invalid." });
        return z.NEVER;
      }
      return phone;
    }),
  email: optional(200).refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Email invalid."),
  retentionMonths: z.coerce.number().int().min(6, "Minim 6 luni.").max(120, "Maxim 120 de luni."),
});

export async function updateProfileAction(_previous: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await requireAdmin();
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Date invalide." };
  await withTenant(ctx.tenantId, (t) => updateTenantProfile(t, auditActor(ctx), parsed.data));
  refresh();
  return { error: null, ok: true };
}

export async function uploadFacadeAction(_previous: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await requireAdmin();
  const file = formData.get("poza");
  if (!(file instanceof File) || file.size === 0) return { error: "Alege o poză." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await withTenant(ctx.tenantId, (t) => saveTenantImage(t, auditActor(ctx), "facade", bytes));
  if (!result.ok) return { error: result.error };
  refresh();
  return { error: null, ok: true, message: "Poza a fost salvată. Apare sus pe pagina de programare." };
}

export async function uploadLogoAction(_previous: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await requireAdmin();
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return { error: "Alege logo-ul." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await withTenant(ctx.tenantId, (t) => saveTenantImage(t, auditActor(ctx), "logo", bytes));
  if (!result.ok) return { error: result.error };
  refresh();
  return { error: null, ok: true, message: "Logo-ul a fost salvat. Apare sus pe pagina de programare, în locul numelui." };
}

export async function removeLogoAction(): Promise<FormResult> {
  const ctx = await requireAdmin();
  await withTenant(ctx.tenantId, (t) => removeTenantLogo(t, auditActor(ctx)));
  refresh();
  return { error: null, ok: true, message: "Logo-ul a fost scos. Pagina afișează din nou numele." };
}
