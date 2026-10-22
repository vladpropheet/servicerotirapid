"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormResult } from "@/components/admin/action-form";
import { CLOSURE_KINDS } from "@/domain/enums";
import { localDateTimeToEpochMs, todayIn } from "@/domain/time";
import { createClosure, deleteClosure } from "@/server/admin/closures";
import { auditActor, requireAdmin } from "@/server/auth/session";
import { withTenant } from "@/server/tenant";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Alege data.");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Alege ora.");
const note = z.string().trim().max(200).transform((v) => (v === "" ? null : v));

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

/** Zile libere sau concediu (zile întregi). */
export async function createDaysClosureAction(_previous: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await requireAdmin();
  const parsed = z
    .object({ dateFrom: date, dateTo: date.or(z.literal("")), kind: z.enum(CLOSURE_KINDS), note })
    .safeParse({ dateFrom: text(formData, "dateFrom"), dateTo: text(formData, "dateTo"), kind: text(formData, "kind"), note: text(formData, "note") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Date invalide." };
  const dateTo = parsed.data.dateTo || parsed.data.dateFrom;
  if (dateTo < parsed.data.dateFrom) return { error: "Ultima zi e înaintea primei zile." };

  await withTenant(ctx.tenantId, (t) =>
    createClosure(t, auditActor(ctx), { type: "days", kind: parsed.data.kind, dateFrom: parsed.data.dateFrom, dateTo, note: parsed.data.note }),
  );
  refresh();
  return { error: null, ok: true, message: "Zilele au fost blocate." };
}

/** Un interval dintr-o zi (ex. 12:00–14:00). */
export async function createIntervalClosureAction(_previous: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await requireAdmin();
  const parsed = z
    .object({ date, from: time, to: time, kind: z.enum(CLOSURE_KINDS), note })
    .safeParse({ date: text(formData, "date"), from: text(formData, "from"), to: text(formData, "to"), kind: text(formData, "kind"), note: text(formData, "note") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Date invalide." };
  if (parsed.data.to <= parsed.data.from) return { error: "Ora de sfârșit trebuie să fie după ora de început." };

  const startsAt = new Date(localDateTimeToEpochMs(parsed.data.date, parsed.data.from, ctx.timeZone));
  const endsAt = new Date(localDateTimeToEpochMs(parsed.data.date, parsed.data.to, ctx.timeZone));
  await withTenant(ctx.tenantId, (t) =>
    createClosure(t, auditActor(ctx), { type: "interval", kind: parsed.data.kind, startsAt, endsAt, note: parsed.data.note }),
  );
  refresh();
  return { error: null, ok: true, message: "Intervalul a fost blocat." };
}

/** „Azi nu mai iau programări online după ora X”: blochează online de la X până la miezul nopții. */
export async function stopOnlineTodayAction(_previous: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await requireAdmin();
  const parsed = time.safeParse(text(formData, "from"));
  if (!parsed.success) return { error: "Alege ora." };
  const today = todayIn(ctx.timeZone);
  const startsAt = new Date(localDateTimeToEpochMs(today.toString(), parsed.data, ctx.timeZone));
  const endsAt = new Date(localDateTimeToEpochMs(today.add({ days: 1 }).toString(), "00:00", ctx.timeZone));
  if (endsAt <= startsAt) return { error: "Ora e prea târzie." };

  await withTenant(ctx.tenantId, (t) =>
    createClosure(t, auditActor(ctx), { type: "interval", kind: "online_block", startsAt, endsAt, note: `Azi fără programări online după ${parsed.data}` }),
  );
  refresh();
  return { error: null, ok: true, message: `Gata: azi nu mai primești programări online după ${parsed.data}.` };
}

export async function deleteClosureAction(_previous: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await requireAdmin();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Cerere invalidă." };
  const removed = await withTenant(ctx.tenantId, (t) => deleteClosure(t, auditActor(ctx), id.data));
  if (!removed) return { error: "Blocarea nu mai există." };
  refresh();
  return { error: null, ok: true, message: "Blocarea a fost ștearsă." };
}

