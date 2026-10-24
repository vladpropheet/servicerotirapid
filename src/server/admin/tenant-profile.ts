import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { media, tenants } from "@/server/db/schema";
import type { TenantTx } from "@/server/tenant";
import { writeAudit, type Actor } from "./audit";
import type { SaveResult } from "./catalog";

// Datele firmei (apar în subsol și în politica de confidențialitate), poza fațadei și logo-ul.

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
// Imaginile încărcate de patron: poza fațadei și logo-ul
// ---------------------------------------------------------------------------

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type TenantImageKind = "facade" | "logo";

/**
 * Cum se pregătește fiecare imagine înainte de salvare: micșorată (pagina se încarcă repede și pe telefoane vechi),
 * rotită după orientarea din telefon, convertită în WebP și fără metadate (fără locația GPS din poze).
 */
const IMAGE_RULES: Record<TenantImageKind, { maxWidth: number; maxHeight: number; quality: number; label: string }> = {
  facade: { maxWidth: 1600, maxHeight: 1200, quality: 80, label: "Poza" },
  logo: { maxWidth: 1200, maxHeight: 600, quality: 90, label: "Logo-ul" },
};

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

/** Logo-urile vin des cu mult spațiu gol în jur: îl tăiem, ca desenul să apară mare pe pagină. */
async function trimBorder(bytes: Uint8Array): Promise<Uint8Array | Buffer> {
  try {
    // Culoarea marginii = pixelul din colțul stânga-sus (alb sau transparent).
    return await sharp(bytes, { limitInputPixels: 50_000_000 }).rotate().trim({ threshold: 25 }).toBuffer();
  } catch {
    return bytes; // imagine de o singură culoare: nu e nimic de tăiat
  }
}

/** Micșorează și convertește imaginea. null = fișierul nu e o imagine validă. */
async function prepareImage(bytes: Uint8Array, kind: TenantImageKind) {
  const rule = IMAGE_RULES[kind];
  try {
    const source = kind === "logo" ? await trimBorder(bytes) : bytes;
    const { data, info } = await sharp(source, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: rule.maxWidth, height: rule.maxHeight, fit: "inside", withoutEnlargement: true })
      .webp({ quality: rule.quality })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    return null;
  }
}

const IMAGE_COLUMN = { facade: "facadeMediaId", logo: "logoMediaId" } as const;

export async function saveTenantImage(t: TenantTx, actor: Actor, kind: TenantImageKind, bytes: Uint8Array): Promise<SaveResult> {
  const rule = IMAGE_RULES[kind];
  if (bytes.length === 0) return { ok: false, error: `Alege ${kind === "logo" ? "logo-ul" : "o poză"}.` };
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, error: `${rule.label} e prea mare (maxim 5 MB).` };
  if (!detectImageType(bytes)) return { ok: false, error: `${rule.label} trebuie să fie JPG, PNG sau WEBP.` };
  const image = await prepareImage(bytes, kind);
  if (!image) return { ok: false, error: `${rule.label} nu a putut fi citit(ă). Încearcă alt fișier.` };

  // Calea o alege serverul: id-ul tenantului + un id aleator. Nimic din numele fișierului trimis.
  const storageKey = `${t.tenantId}/${randomUUID()}.webp`;
  const target = storagePath(storageKey);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, image.data);

  const column = IMAGE_COLUMN[kind];
  const before = await getTenantProfile(t);
  const [row] = await t.tx
    .insert(media)
    .values({
      tenantId: t.tenantId,
      kind,
      storageKey,
      contentType: "image/webp",
      bytes: image.data.length,
      width: image.width,
      height: image.height,
    })
    .returning({ id: media.id });
  if (!row) throw new Error("Imaginea nu a putut fi salvată.");
  await t.tx.update(tenants).set({ [column]: row.id }).where(eq(tenants.id, t.tenantId));

  const previous = before[column];
  if (previous) {
    const [old] = await t.tx
      .delete(media)
      .where(and(eq(media.tenantId, t.tenantId), eq(media.id, previous)))
      .returning({ storageKey: media.storageKey });
    if (old) await rm(storagePath(old.storageKey), { force: true });
  }
  await writeAudit(t, actor, {
    action: `${kind}.update`,
    entityType: "tenant",
    entityId: t.tenantId,
    before: { [column]: previous },
    after: { [column]: row.id, bytes: image.data.length, width: image.width, height: image.height },
  });
  return { ok: true };
}

/** Logo-ul se poate și scoate (pagina revine la numele scris ca text). */
export async function removeTenantLogo(t: TenantTx, actor: Actor): Promise<void> {
  const before = await getTenantProfile(t);
  if (!before.logoMediaId) return;
  await t.tx.update(tenants).set({ logoMediaId: null }).where(eq(tenants.id, t.tenantId));
  const [old] = await t.tx
    .delete(media)
    .where(and(eq(media.tenantId, t.tenantId), eq(media.id, before.logoMediaId)))
    .returning({ storageKey: media.storageKey });
  if (old) await rm(storagePath(old.storageKey), { force: true });
  await writeAudit(t, actor, {
    action: "logo.update",
    entityType: "tenant",
    entityId: t.tenantId,
    before: { logoMediaId: before.logoMediaId },
    after: { logoMediaId: null },
  });
}

/** Imaginea pentru pagina publică (sau null). */
export async function readTenantImage(
  t: TenantTx,
  kind: TenantImageKind,
): Promise<{ bytes: Buffer; contentType: string; id: string } | null> {
  const column = kind === "logo" ? tenants.logoMediaId : tenants.facadeMediaId;
  const [row] = await t.tx
    .select({ id: media.id, storageKey: media.storageKey, contentType: media.contentType })
    .from(media)
    .innerJoin(tenants, eq(column, media.id))
    .where(and(eq(media.tenantId, t.tenantId), eq(tenants.id, t.tenantId), eq(media.kind, kind)))
    .limit(1);
  if (!row) return null;
  try {
    const bytes = await readFile(storagePath(row.storageKey));
    return { bytes, contentType: row.contentType, id: row.id };
  } catch {
    return null;
  }
}
