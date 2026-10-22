// Tabelele pentru conturi și sesiuni (Better Auth) + legătura utilizator ↔ service.
// Numele câmpurilor din obiecte (ex. `emailVerified`) sunt cele pe care le așteaptă Better Auth 1.7;
// coloanele din baza de date sunt cu `_`. Prefixul `auth_` evită cuvântul rezervat `user`.
// Fără RLS: aceste tabele sunt necesare înainte să știm tenantul.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAtColumn, idColumn } from "./_shared";
import { tenants } from "./platform";

const timestampTz = (name: string) => timestamp(name, { withTimezone: true });

export const PLATFORM_ROLES = ["superadmin"] as const;
export const MEMBERSHIP_ROLES = ["owner", "staff"] as const;

export const authUser = pgTable("auth_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Better Auth cere email; patronii se loghează cu telefonul, deci aici e o adresă internă `@users.invalid`. */
  email: text("email").notNull().unique("auth_user_email_uq"),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestampTz("created_at").notNull().defaultNow(),
  updatedAt: timestampTz("updated_at").notNull().defaultNow(),
  /** Telefonul normalizat, fără „+” (ex. `40766777130`). Cu el se face logarea. */
  username: text("username").unique("auth_user_username_uq"),
  displayUsername: text("display_username"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  /** `superadmin` pentru Propheet AIgency; null pentru patroni. */
  platformRole: text("platform_role", { enum: PLATFORM_ROLES }),
  /** Parola temporară trebuie schimbată la prima logare. */
  mustChangePassword: boolean("must_change_password").notNull().default(false),
});

export const authSession = pgTable(
  "auth_session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestampTz("expires_at").notNull(),
    token: text("token").notNull().unique("auth_session_token_uq"),
    createdAt: timestampTz("created_at").notNull().defaultNow(),
    updatedAt: timestampTz("updated_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
  },
  (t) => [index("auth_session_user_idx").on(t.userId)],
);

export const authAccount = pgTable(
  "auth_account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestampTz("access_token_expires_at"),
    refreshTokenExpiresAt: timestampTz("refresh_token_expires_at"),
    scope: text("scope"),
    /** Hash-ul parolei (argon2id). Niciodată parola în clar. */
    password: text("password"),
    createdAt: timestampTz("created_at").notNull().defaultNow(),
    updatedAt: timestampTz("updated_at").notNull(),
  },
  (t) => [index("auth_account_user_idx").on(t.userId)],
);

export const authVerification = pgTable(
  "auth_verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestampTz("expires_at").notNull(),
    createdAt: timestampTz("created_at").notNull().defaultNow(),
    updatedAt: timestampTz("updated_at").notNull().defaultNow(),
  },
  (t) => [index("auth_verification_identifier_idx").on(t.identifier)],
);

/** Autentificarea în doi pași (TOTP), obligatorie pentru super-admin. */
export const authTwoFactor = pgTable(
  "auth_two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(true),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: timestampTz("locked_until"),
  },
  (t) => [index("auth_two_factor_secret_idx").on(t.secret), index("auth_two_factor_user_idx").on(t.userId)],
);

/** Ce service administrează fiecare utilizator și cu ce rol. Super-adminul nu are rânduri aici. */
export const tenantMemberships = pgTable(
  "tenant_memberships",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    role: text("role", { enum: MEMBERSHIP_ROLES }).notNull(),
    createdAt: createdAtColumn(),
  },
  (t) => [
    primaryKey({ name: "tenant_memberships_pk", columns: [t.tenantId, t.userId] }),
    index("tenant_memberships_user_idx").on(t.userId),
    check("tenant_memberships_role_ck", sql`${t.role} in ('owner', 'staff')`),
  ],
);

/**
 * Accesul super-adminului la un service, pentru suport: doar cu motiv scris și pe timp limitat.
 * Cerință GDPR: persoana împuternicită nu vede datele clienților fără motiv.
 */
export const supportSessions = pgTable(
  "support_sessions",
  {
    id: idColumn(),
    superadminUserId: text("superadmin_user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    startedAt: timestampTz("started_at").notNull().defaultNow(),
    expiresAt: timestampTz("expires_at").notNull(),
    endedAt: timestampTz("ended_at"),
  },
  (t) => [
    index("support_sessions_user_idx").on(t.superadminUserId),
    check("support_sessions_reason_ck", sql`length(${t.reason}) between 5 and 500`),
    check("support_sessions_expiry_ck", sql`${t.expiresAt} > ${t.startedAt}`),
  ],
);

/** Blocarea temporară după încercări greșite de logare, per cont (hash-ul telefonului). */
export const authLoginGuard = pgTable("auth_login_guard", {
  identifierHash: text("identifier_hash").primaryKey(),
  failedCount: smallint("failed_count").notNull().default(0),
  windowStartedAt: timestampTz("window_started_at").notNull(),
  lockedUntil: timestampTz("locked_until"),
});
