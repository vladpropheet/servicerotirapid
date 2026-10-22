"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormResult } from "@/components/admin/action-form";
import { CONFIRMATION_MODES, SMS_TEMPLATE_KINDS } from "@/domain/enums";
import { FEATURES } from "@/lib/features";
import { updateSettings, updateSmsTemplate } from "@/server/admin/schedule";
import { auditActor, requireAdmin } from "@/server/auth/session";
import { withTenant } from "@/server/tenant";

const int = (min: number, max: number, message: string) => z.coerce.number({ error: message }).int(message).min(min, message).max(max, message);

const settingsSchema = z.object({
  onlineCapacity: int(0, 50, "Capacitatea: între 0 și 50."),
  slotStepMin: z.coerce.number().refine((v) => [5, 10, 15, 20, 30, 60].includes(v), "Pas invalid."),
  minLeadHours: z.coerce.number({ error: "Timpul minim: în ore." }).min(0).max(336),
  maxDaysAhead: int(0, 365, "Câte zile înainte: între 0 și 365."),
  confirmationMode: z.enum(CONFIRMATION_MODES),
  manualBookingsUseCapacity: z.boolean(),
  reminderEnabled: z.boolean(),
  // Lipsește din formular cât timp SMS-urile sunt oprite: atunci valoarea salvată rămâne neschimbată.
  reminderHoursBefore: int(1, 168, "Reamintirea: între 1 și 168 de ore.").optional(),
  customerCancelCutoffHours: z.coerce.number({ error: "Anularea: în ore." }).min(0).max(168),
  maxActiveBookingsPerPhone: int(1, 20, "Programări active pe telefon: între 1 și 20."),
});

export async function updateSettingsAction(_previous: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await requireAdmin();
  const parsed = settingsSchema.safeParse({
    ...Object.fromEntries(formData),
    manualBookingsUseCapacity: formData.get("manualBookingsUseCapacity") === "on",
    reminderEnabled: formData.get("reminderEnabled") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Date invalide." };
  const s = parsed.data;
  const result = await withTenant(ctx.tenantId, (t) =>
    updateSettings(t, auditActor(ctx), {
      onlineCapacity: s.onlineCapacity,
      slotStepMin: s.slotStepMin,
      minLeadMin: Math.round(s.minLeadHours * 60),
      maxDaysAhead: s.maxDaysAhead,
      confirmationMode: s.confirmationMode,
      manualBookingsUseCapacity: s.manualBookingsUseCapacity,
      ...(FEATURES.smsNotifications ? { reminderHoursBefore: s.reminderEnabled ? (s.reminderHoursBefore ?? 24) : null } : {}),
      customerCancelCutoffMin: Math.round(s.customerCancelCutoffHours * 60),
      maxActiveBookingsPerPhone: s.maxActiveBookingsPerPhone,
    }),
  );
  if (!result.ok) return { error: result.error };
  refresh();
  return { error: null, ok: true };
}

export async function updateSmsTemplateAction(_previous: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await requireAdmin();
  if (!FEATURES.smsNotifications) return { error: "SMS-urile nu sunt active pentru acest service." };
  const parsed = z
    .object({
      kind: z.enum(SMS_TEMPLATE_KINDS),
      body: z.string().trim().min(1, "Textul nu poate fi gol.").max(480, "Maxim 480 de caractere."),
      active: z.boolean(),
    })
    .safeParse({ kind: formData.get("kind"), body: formData.get("body"), active: formData.get("active") === "on" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Date invalide." };
  const { kind, ...input } = parsed.data;
  const result = await withTenant(ctx.tenantId, (t) => updateSmsTemplate(t, auditActor(ctx), kind, input));
  if (!result.ok) return { error: result.error };
  refresh();
  return { error: null, ok: true };
}
