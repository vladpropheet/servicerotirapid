// Fișiere încărcate de patron (deocamdată doar poza fațadei).
import { sql } from "drizzle-orm";
import { check, integer, pgTable, smallint, text, unique } from "drizzle-orm/pg-core";
import { createdAtColumn, idColumn } from "./_shared";
import { tenantIdColumn } from "./platform";

export const MEDIA_KINDS = ["facade"] as const;
export const MEDIA_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const media = pgTable(
  "media",
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    kind: text("kind", { enum: MEDIA_KINDS }).notNull(),
    /** Calea fișierului în folderul de stocare (STORAGE_DIR), generată de server, fără date de la client. */
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type", { enum: MEDIA_CONTENT_TYPES }).notNull(),
    bytes: integer("bytes").notNull(),
    width: smallint("width"),
    height: smallint("height"),
    createdAt: createdAtColumn(),
  },
  (t) => [
    unique("media_tenant_id_uq").on(t.tenantId, t.id),
    check("media_kind_ck", sql`${t.kind} in ('facade')`),
    check("media_type_ck", sql`${t.contentType} in ('image/jpeg', 'image/png', 'image/webp')`),
    check("media_bytes_ck", sql`${t.bytes} between 1 and 10485760`),
  ],
);
