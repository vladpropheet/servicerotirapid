"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormResult } from "@/components/admin/action-form";
import { isUniqueViolation } from "@/lib/db-errors";
import { normalizeRoPhone } from "@/lib/validation/phone";
import {
  addOwner,
  createTenant,
  endSupportSession,
  resetOwnerPassword,
  setTenantStatus,
  startSupportSession,
} from "@/server/admin/platform";
import { requireSuperadmin } from "@/server/auth/session";

const phone = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const normalized = normalizeRoPhone(value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Telefon invalid." });
      return z.NEVER;
    }
    return normalized;
  });
const required = (max = 200) => z.string().trim().min(1, "Completează toate câmpurile.").max(max);

export async function createTenantAction(_previous: FormResult, formData: FormData): Promise<FormResult> {
  const user = await requireSuperadmin();
  const parsed = z
    .object({
      slug: z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Adresa: doar litere mici, cifre și cratimă (ex. vulcanizare-pitesti).")
        .min(3)
        .max(48)
        .refine((s) => !["admin", "api", "superadmin", "login", "static", "public"].includes(s), "Adresă rezervată."),
      displayName: required(80),
      legalName: required(),
      cui: required(20),
      regCom: required(40),
      workAddress: required(300),
      publicPhone: phone,
      ownerName: required(80),
      ownerPhone: phone,
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Date invalide." };
  try {
    const result = await createTenant(parsed.data, user.id);
    if (!result.ok) return { error: result.error };
    refresh();
    return {
      error: null,
      ok: true,
      message: `Service creat. Parola temporară a patronului (se afișează o singură dată): ${result.temporaryPassword}`,
    };
  } catch (error) {
    if (isUniqueViolation(error, "auth_user_username_uq")) return { error: "Există deja un cont cu telefonul patronului." };
    throw error;
  }
}

export async function setTenantStatusAction(_previous: FormResult, formData: FormData): Promise<FormResult> {
  const user = await requireSuperadmin();
  const parsed = z.object({ tenantId: z.uuid(), status: z.enum(["active", "suspended"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Cerere invalidă." };
  await setTenantStatus(parsed.data.tenantId, parsed.data.status, user.id);
  refresh();
  return { error: null, ok: true, message: parsed.data.status === "active" ? "Service activat." : "Service suspendat: pagina publică e oprită." };
}

export async function resetOwnerPasswordAction(_previous: FormResult, formData: FormData): Promise<FormResult> {
  const user = await requireSuperadmin();
  const parsed = z.object({ tenantId: z.uuid(), userId: z.string().min(1).max(64) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Cerere invalidă." };
  const password = await resetOwnerPassword(parsed.data.tenantId, parsed.data.userId, user.id);
  if (!password) return { error: "Utilizatorul nu aparține acestui service." };
  return {
    error: null,
    ok: true,
    message: `Parolă temporară nouă (se afișează o singură dată): ${password}. Toate sesiunile patronului au fost închise.`,
  };
}

export async function addOwnerAction(_previous: FormResult, formData: FormData): Promise<FormResult> {
  const user = await requireSuperadmin();
  const parsed = z.object({ tenantId: z.uuid(), name: required(80), phone }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Date invalide." };
  try {
    const result = await addOwner(parsed.data.tenantId, { name: parsed.data.name, phone: parsed.data.phone }, user.id);
    refresh();
    return { error: null, ok: true, message: `Cont creat. Parola temporară (o singură dată): ${result.temporaryPassword}` };
  } catch (error) {
    if (isUniqueViolation(error, "auth_user_username_uq")) return { error: "Există deja un cont cu acest telefon." };
    throw error;
  }
}

export async function startSupportAction(_previous: FormResult, formData: FormData): Promise<FormResult> {
  const user = await requireSuperadmin();
  const parsed = z
    .object({ tenantId: z.uuid(), reason: z.string().trim().min(5, "Scrie motivul (cel puțin 5 caractere).").max(500) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Date invalide." };
  await startSupportSession(user.id, parsed.data.tenantId, parsed.data.reason);
  redirect("/admin");
}

export async function endSupportAction(): Promise<void> {
  const user = await requireSuperadmin();
  await endSupportSession(user.id);
  refresh();
}
