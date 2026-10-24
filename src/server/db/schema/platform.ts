// Tabele globale ale platformei (fără tenant_id obligatoriu; nu primesc RLS în Faza 4).
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { TENANT_STATUSES } from "@/domain/enums";
import { createdAtColumn, idColumn, inList, timestamps } from "./_shared";

/** Culorile unui service. Valorile sunt hex (#rrggbb), validate cu Zod la scriere. */
export type TenantBrand = {
  background?: string;
  text?: string;
  accent?: string;
  label?: string;
};

export const tenants = pgTable(
  "tenants",
  {
    id: idColumn(),
    slug: text("slug").notNull().unique("tenants_slug_uq"),
    displayName: text("display_name").notNull(),
    legalName: text("legal_name").notNull(),
    cui: text("cui").notNull(),
    regCom: text("reg_com").notNull(),
    registeredAddress: text("registered_address"),
    workAddress: text("work_address").notNull(),
    publicPhone: text("public_phone").notNull(),
    email: text("email"),
    timezone: text("timezone").notNull().default("Europe/Bucharest"),
    brand: jsonb("brand").$type<TenantBrand>().notNull().default({}),
    /** Poza fațadei (tabelul `media`), încărcată de patron din admin. */
    facadeMediaId: uuid("facade_media_id"),
    /** Logo-ul service-ului (opțional). Fără logo, pagina publică afișează numele ca text. */
    logoMediaId: uuid("logo_media_id"),
    status: text("status", { enum: TENANT_STATUSES }).notNull().default("active"),
    smsMonthlyLimit: integer("sms_monthly_limit").notNull().default(200),
    retentionMonths: smallint("retention_months").notNull().default(24),
    /** Câmpurile firmei marcate „de verificat” în admin (ex. registered_address). */
    reviewFields: text("review_fields")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    ...timestamps(),
  },
  (t) => [
    check(
      "tenants_slug_ck",
      sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(${t.slug}) between 3 and 48`,
    ),
    check("tenants_status_ck", inList(t.status, TENANT_STATUSES)),
    check("tenants_sms_limit_ck", sql`${t.smsMonthlyLimit} >= 0`),
    check("tenants_retention_ck", sql`${t.retentionMonths} between 6 and 120`),
  ],
);

/** Coloana tenant_id pentru tabelele unui service. */
export const tenantIdColumn = () =>
  uuid("tenant_id")
    .notNull()
    .references(() => tenants.id);

/** Acțiunile super-adminului: tenanți creați/suspendați, accese de suport, resetări de parolă. */
export const platformAuditLog = pgTable("platform_audit_log", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  actorUserId: text("actor_user_id"),
  action: text("action").notNull(),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  details: jsonb("details"),
  createdAt: createdAtColumn(),
});

/** Contoare anti-spam pentru formularul public. Cheia e un hash (IP sau telefon), niciodată valoarea brută. */
export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull(),
  },
  (t) => [primaryKey({ name: "rate_limit_buckets_pk", columns: [t.key, t.windowStart] })],
);
