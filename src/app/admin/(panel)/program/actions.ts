"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormResult } from "@/components/admin/action-form";
import { saveWeeklyHours } from "@/server/admin/schedule";
import { auditActor, requireAdmin } from "@/server/auth/session";
import { withTenant } from "@/server/tenant";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Oră invalidă.");
const schema = z
  .array(z.object({ weekday: z.number().int().min(1).max(7), opensAt: time, closesAt: time }))
  .max(28);

export async function saveHoursAction(input: unknown): Promise<FormResult> {
  const ctx = await requireAdmin();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Program invalid." };
  const result = await withTenant(ctx.tenantId, (t) => saveWeeklyHours(t, auditActor(ctx), parsed.data));
  if (!result.ok) return { error: result.error };
  refresh();
  return { error: null, ok: true, message: "Programul a fost salvat." };
}
