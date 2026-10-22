import "server-only";
import { and, asc, eq } from "drizzle-orm";
import type { ConfirmationMode, SmsTemplateKind } from "@/domain/enums";
import { bookingSettings, businessHours, smsTemplates } from "@/server/db/schema";
import type { TenantTx } from "@/server/tenant";
import { writeAudit, type Actor } from "./audit";
import type { SaveResult } from "./catalog";

// Programul de lucru, setările de programare și textele SMS.

export type HoursInterval = { weekday: number; opensAt: string; closesAt: string };

export async function getWeeklyHours(t: TenantTx) {
  return t.tx
    .select()
    .from(businessHours)
    .where(eq(businessHours.tenantId, t.tenantId))
    .orderBy(asc(businessHours.weekday), asc(businessHours.opensAt));
}

const short = (time: string) => time.slice(0, 5);
const describeHours = (list: HoursInterval[]) =>
  [...list]
    .sort((a, b) => a.weekday - b.weekday || a.opensAt.localeCompare(b.opensAt))
    .map((h) => `${h.weekday}: ${short(h.opensAt)}-${short(h.closesAt)}`);

/** Înlocuiește tot programul săptămânii. Intervalele unei zile nu se pot suprapune. */
export async function saveWeeklyHours(t: TenantTx, actor: Actor, intervals: HoursInterval[]): Promise<SaveResult> {
  for (let weekday = 1; weekday <= 7; weekday++) {
    const day = intervals.filter((h) => h.weekday === weekday).sort((a, b) => a.opensAt.localeCompare(b.opensAt));
    for (const [index, interval] of day.entries()) {
      if (interval.closesAt <= interval.opensAt) {
        return { ok: false, error: "Ora de închidere trebuie să fie după ora de deschidere." };
      }
      const next = day[index + 1];
      if (next && next.opensAt < interval.closesAt) {
        return { ok: false, error: "Două intervale din aceeași zi se suprapun." };
      }
    }
  }

  const before = await getWeeklyHours(t);
  const unchanged = JSON.stringify(describeHours(before)) === JSON.stringify(describeHours(intervals));
  if (unchanged) return { ok: true };

  await t.tx.delete(businessHours).where(eq(businessHours.tenantId, t.tenantId));
  if (intervals.length > 0) {
    await t.tx.insert(businessHours).values(intervals.map((h) => ({ tenantId: t.tenantId, ...h, needsReview: false })));
  }
  await writeAudit(t, actor, {
    action: "business_hours.update",
    entityType: "business_hours",
    before: describeHours(before),
    after: describeHours(intervals),
  });
  return { ok: true };
}

export type SettingsInput = {
  onlineCapacity: number;
  slotStepMin: number;
  minLeadMin: number;
  maxDaysAhead: number;
  confirmationMode: ConfirmationMode;
  manualBookingsUseCapacity: boolean;
  reminderHoursBefore: number | null;
  customerCancelCutoffMin: number;
  maxActiveBookingsPerPhone: number;
};

export async function getSettings(t: TenantTx) {
  const [row] = await t.tx.select().from(bookingSettings).where(eq(bookingSettings.tenantId, t.tenantId));
  if (!row) throw new Error("Lipsesc setările de programare.");
  return row;
}

export async function updateSettings(t: TenantTx, actor: Actor, input: SettingsInput): Promise<SaveResult> {
  const before = await getSettings(t);
  await t.tx.update(bookingSettings).set(input).where(eq(bookingSettings.tenantId, t.tenantId));
  const pick = (s: SettingsInput) => ({
    onlineCapacity: s.onlineCapacity,
    slotStepMin: s.slotStepMin,
    minLeadMin: s.minLeadMin,
    maxDaysAhead: s.maxDaysAhead,
    confirmationMode: s.confirmationMode,
    manualBookingsUseCapacity: s.manualBookingsUseCapacity,
    reminderHoursBefore: s.reminderHoursBefore,
    customerCancelCutoffMin: s.customerCancelCutoffMin,
    maxActiveBookingsPerPhone: s.maxActiveBookingsPerPhone,
  });
  await writeAudit(t, actor, { action: "settings.update", entityType: "booking_settings", before: pick(before), after: pick(input) });
  return { ok: true };
}

export const SMS_VARIABLES = ["{nume}", "{data}", "{ora}", "{servicii}", "{service}", "{link}", "{telefon}", "{telefon_client}"];

export async function getSmsTemplates(t: TenantTx) {
  return t.tx.select().from(smsTemplates).where(eq(smsTemplates.tenantId, t.tenantId)).orderBy(asc(smsTemplates.kind));
}

export async function updateSmsTemplate(
  t: TenantTx,
  actor: Actor,
  kind: SmsTemplateKind,
  input: { body: string; active: boolean },
): Promise<SaveResult> {
  const unknown = (input.body.match(/\{[^}]*\}/g) ?? []).filter((v) => !SMS_VARIABLES.includes(v));
  if (unknown.length > 0) return { ok: false, error: `Variabilă necunoscută: ${unknown.join(", ")}.` };
  const [before] = await t.tx
    .select()
    .from(smsTemplates)
    .where(and(eq(smsTemplates.tenantId, t.tenantId), eq(smsTemplates.kind, kind)));
  if (!before) return { ok: false, error: "Textul nu există." };
  await t.tx
    .update(smsTemplates)
    .set({ ...input, needsReview: before.body === input.body ? before.needsReview : false })
    .where(and(eq(smsTemplates.tenantId, t.tenantId), eq(smsTemplates.kind, kind)));
  await writeAudit(t, actor, {
    action: "sms_template.update",
    entityType: "sms_template",
    entityId: kind,
    before: { body: before.body, active: before.active },
    after: input,
  });
  return { ok: true };
}
