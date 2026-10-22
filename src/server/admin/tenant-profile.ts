import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { media, tenants } from "@/server/db/schema";
import type { TenantTx } from "@/server/tenant";
import { writeAudit, type Actor } from "./audit";
import type { SaveResult } from "./catalog";

// Datele firmei (apar în subsol și în politica de confidențialitate) și poza fațadei.

export async function getTenantProfile(t: TenantTx) {
  const [tenant] = await t.tx.select().from(tenants).where(eq(tenants.id, t.tenantId));
  if (!tenant) throw new Error("Tenantul nu există.");
  return tenant;
}

export type ProfileInput = {
  displayName: string;
  legalName: string;
  cui: string;
  regCom: string;
  registeredAddress: string | null;
  workAddress: string;
  publicPhone: string;
  email: string | null;
  retentionMonths: number;
};

const FIELD_COLUMNS: Record<keyof ProfileInput, string> = {
  displayName: "display_name",
  legalName: "legal_name",
  cui: "cui",
  regCom: "reg_com",
  registeredAddress: "registered_address",
  workAddress: "work_address",
  publicPhone: "public_phone",
  email: "email",
  retentionMonths: "retention_months",
};

export async function updateTenantProfile(t: TenantTx, actor: Actor, input: ProfileInput): Promise<SaveResult> {
  const before = await getTenantProfile(t);
  const changed = (Object.keys(input) as (keyof ProfileInput)[]).filter((key) => before[key] !== input[key]);
  // Un câmp completat sau schimbat de patron nu mai e „de verificat”.
  const reviewFields = before.reviewFields.filter(
    (field) => !changed.some((key) => FIELD_COLUMNS[key] === field) || (field === "registered_address" && !input.registeredAddress),
  );
  await t.tx.update(tenants).set({ ...input, reviewFields }).where(eq(tenants.id, t.tenantId));
  await writeAudit(t, actor, {
    action: "tenant.update",
    entityType: "tenant",
    entityId: t.tenantId,
    before: Object.fromEntries(changed.map((key) => [key, before[key]])),
    after: Object.fromEntries(changed.map((key) => [key, input[key]])),
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Poza fațadei
// ---------------------------------------------------------------------------

export const MAX_FACADE_BYTES = 5 * 1024 * 1024;

const STORAGE_KEY = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

/**
 * Fișierele încărcate stau în folderul „storage” al aplicației (în producție: un volum Docker inclus în backup).
 * Calea e fixă (process.cwd()/storage), ca build-ul să nu includă tot proiectul în server.
 */
function storagePath(storageKey: string): string {
  if (!STORAGE_KEY.test(storageKey)) throw new Error("Cale de fișier invalidă.");
  return path.join(process.cwd(), "storage", storageKey);
}

/** Tipul imaginii după primii octeți (nu după numele fișierului sau ce declară browserul). */
export function detectImageType(bytes: Uint8Array): { contentType: "image/jpeg" | "image/png" | "image/webp"; ext: string } | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { contentType: "image/jpeg", ext: "jpg" };
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { contentType: "image/png", ext: "png" };
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { contentType: "image/webp", ext: "webp" };
  return null;
}

export async function saveFacade(t: TenantTx, actor: Actor, bytes: Uint8Array): Promise<SaveResult> {
  if (bytes.length === 0) return { ok: false, error: "Alege o poză." };
  if (bytes.length > MAX_FACADE_BYTES) return { ok: false, error: "Poza e prea mare (maxim 5 MB)." };
  const type = detectImageType(bytes);
  if (!type) return { ok: false, error: "Poza trebuie să fie JPG, PNG sau WEBP." };

  // Calea o alege serverul: id-ul tenantului + un id aleator. Nimic din numele fișierului trimis.
  const storageKey = `${t.tenantId}/${randomUUID()}.${type.ext}`;
  const target = storagePath(storageKey);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);

  const before = await getTenantProfile(t);
  const [row] = await t.tx
    .insert(media)
    .values({ tenantId: t.tenantId, kind: "facade", storageKey, contentType: type.contentType, bytes: bytes.length })
    .returning({ id: media.id });
  if (!row) throw new Error("Poza nu a putut fi salvată.");
  await t.tx.update(tenants).set({ facadeMediaId: row.id }).where(eq(tenants.id, t.tenantId));

  if (before.facadeMediaId) {
    const [old] = await t.tx
      .delete(media)
      .where(and(eq(media.tenantId, t.tenantId), eq(media.id, before.facadeMediaId)))
      .returning({ storageKey: media.storageKey });
    if (old) await rm(storagePath(old.storageKey), { force: true });
  }
  await writeAudit(t, actor, {
    action: "facade.update",
    entityType: "tenant",
    entityId: t.tenantId,
    before: { facadeMediaId: before.facadeMediaId },
    after: { facadeMediaId: row.id, bytes: bytes.length, contentType: type.contentType },
  });
  return { ok: true };
}

/** Poza fațadei pentru pagina publică (sau null). */
export async function readFacade(t: TenantTx): Promise<{ bytes: Buffer; contentType: string; id: string } | null> {
  const [row] = await t.tx
    .select({ id: media.id, storageKey: media.storageKey, contentType: media.contentType })
    .from(media)
    .innerJoin(tenants, eq(tenants.facadeMediaId, media.id))
    .where(and(eq(media.tenantId, t.tenantId), eq(tenants.id, t.tenantId), sql`${media.kind} = 'facade'`))
    .limit(1);
  if (!row) return null;
  try {
    const bytes = await readFile(storagePath(row.storageKey));
    return { bytes, contentType: row.contentType, id: row.id };
  } catch {
    return null;
  }
}
