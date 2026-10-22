"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormResult } from "@/components/admin/action-form";
import { addDimension, updateDimension } from "@/server/admin/catalog";
import { auditActor, requireAdmin } from "@/server/auth/session";
import { withTenant } from "@/server/tenant";

const kind = z.enum(["vehicle", "size", "type"]);
const label = z.string().trim().min(1, "Scrie denumirea.").max(40);

export async function addDimensionAction(_previous: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await requireAdmin();
  const parsed = z.object({ kind, label, inches: z.string().trim().max(10).optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Date invalide." };

  let inchMin: number | undefined;
  let inchMax: number | undefined;
  if (parsed.data.kind === "size") {
    const match = /^(\d{2})(?:\s*-\s*(\d{2}))?$/.exec(parsed.data.inches ?? "");
    if (!match) return { error: "Scrie mărimea în inch: de ex. 23 sau 12-16." };
    inchMin = Number(match[1]);
    inchMax = Number(match[2] ?? match[1]);
    if (inchMin < 10 || inchMax > 30 || inchMin > inchMax) return { error: "Mărime între 10 și 30 inch." };
  }
  const result = await withTenant(ctx.tenantId, (t) =>
    addDimension(t, auditActor(ctx), parsed.data.kind, { label: parsed.data.label, inchMin, inchMax }),
  );
  if (!result.ok) return { error: result.error };
  refresh();
  return { error: null, ok: true, message: "Adăugat. Completează prețurile la serviciile care depind de el." };
}

export async function updateDimensionAction(_previous: FormResult, formData: FormData): Promise<FormResult> {
  const ctx = await requireAdmin();
  const parsed = z
    .object({ kind, id: z.uuid(), label, active: z.boolean() })
    .safeParse({ ...Object.fromEntries(formData), active: formData.get("active") === "on" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Date invalide." };
  const { kind: k, id, ...input } = parsed.data;
  const result = await withTenant(ctx.tenantId, (t) => updateDimension(t, auditActor(ctx), k, id, input));
  if (!result.ok) return { error: result.error };
  refresh();
  return { error: null, ok: true };
}
