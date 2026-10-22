// Programul de lucru, închiderile, setările de programare și textele SMS ale unui service.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { CLOSURE_KINDS, CONFIRMATION_MODES, SMS_TEMPLATE_KINDS } from "@/domain/enums";
import { idColumn, inList, timestamps } from "./_shared";
import { tenants, tenantIdColumn } from "./platform";

/**
 * Programul săptămânal, în ora locală a service-ului.
 * Mai multe rânduri în aceeași zi = pauză între ele. Zi fără rânduri = închis.
 */
export const businessHours = pgTable(
  "business_hours",
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    /** 1 = luni … 7 = duminică (ca în standardul ISO și în Temporal). */
    weekday: smallint("weekday").notNull(),
    opensAt: time("opens_at").notNull(),
    closesAt: time("closes_at").notNull(),
    needsReview: boolean("needs_review").notNull().default(false),
    reviewNote: text("review_note"),
    ...timestamps(),
  },
  (t) => [
    unique("business_hours_tenant_id_uq").on(t.tenantId, t.id),
    unique("business_hours_slot_uq").on(t.tenantId, t.weekday, t.opensAt),
    check("business_hours_weekday_ck", sql`${t.weekday} between 1 and 7`),
    check("business_hours_order_ck", sql`${t.closesAt} > ${t.opensAt}`),
  ],
);

/**
 * Zile libere, concedii și intervale blocate.
 * Fie zile întregi (date_from–date_to, ora locală), fie un interval exact (starts_at–ends_at).
 */
export const closures = pgTable(
  "closures",
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    kind: text("kind", { enum: CLOSURE_KINDS }).notNull(),
    dateFrom: date("date_from", { mode: "string" }),
    dateTo: date("date_to", { mode: "string" }),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    internalNote: text("internal_note"),
    publicNote: text("public_note"),
    createdByUserId: text("created_by_user_id"),
    ...timestamps(),
  },
  (t) => [
    unique("closures_tenant_id_uq").on(t.tenantId, t.id),
    index("closures_dates_idx").on(t.tenantId, t.dateTo),
    index("closures_instants_idx").on(t.tenantId, t.endsAt),
    check("closures_kind_ck", inList(t.kind, CLOSURE_KINDS)),
    check(
      "closures_form_ck",
      sql`(${t.dateFrom} is not null and ${t.dateTo} >= ${t.dateFrom} and ${t.startsAt} is null and ${t.endsAt} is null)
        or (${t.dateFrom} is null and ${t.dateTo} is null and ${t.startsAt} is not null and ${t.endsAt} > ${t.startsAt})`,
    ),
  ],
);

/** Setările de programare: un rând per service. */
export const bookingSettings = pgTable(
  "booking_settings",
  {
    tenantId: uuid("tenant_id")
      .primaryKey()
      .references(() => tenants.id),
    /** Câte programări online pot avea loc în același timp. 0 = programările online sunt oprite. */
    onlineCapacity: smallint("online_capacity").notNull().default(1),
    slotStepMin: smallint("slot_step_min").notNull().default(15),
    minLeadMin: integer("min_lead_min").notNull().default(120),
    maxDaysAhead: smallint("max_days_ahead").notNull().default(30),
    confirmationMode: text("confirmation_mode", { enum: CONFIRMATION_MODES })
      .notNull()
      .default("auto"),
    /** Programările adăugate manual ocupă capacitatea online? (decizia lui Vlad: implicit nu) */
    manualBookingsUseCapacity: boolean("manual_bookings_use_capacity").notNull().default(false),
    /** null = reamintirile sunt oprite. */
    reminderHoursBefore: smallint("reminder_hours_before").default(24),
    customerCancelCutoffMin: integer("customer_cancel_cutoff_min").notNull().default(60),
    maxActiveBookingsPerPhone: smallint("max_active_bookings_per_phone").notNull().default(2),
    smsQuietFrom: time("sms_quiet_from").notNull().default("21:00"),
    smsQuietTo: time("sms_quiet_to").notNull().default("08:00"),
    ownerNotifyChannels: text("owner_notify_channels")
      .array()
      .notNull()
      .default(sql`'{push}'::text[]`),
    ...timestamps(),
  },
  (t) => [
    check("booking_settings_capacity_ck", sql`${t.onlineCapacity} between 0 and 50`),
    check("booking_settings_step_ck", sql`${t.slotStepMin} in (5, 10, 15, 20, 30, 60)`),
    check("booking_settings_lead_ck", sql`${t.minLeadMin} between 0 and 20160`),
    check("booking_settings_days_ck", sql`${t.maxDaysAhead} between 0 and 365`),
    check("booking_settings_confirmation_ck", inList(t.confirmationMode, CONFIRMATION_MODES)),
    check(
      "booking_settings_reminder_ck",
      sql`${t.reminderHoursBefore} is null or ${t.reminderHoursBefore} between 1 and 168`,
    ),
    check("booking_settings_cancel_cutoff_ck", sql`${t.customerCancelCutoffMin} >= 0`),
    check("booking_settings_per_phone_ck", sql`${t.maxActiveBookingsPerPhone} between 1 and 20`),
  ],
);

/** Textele SMS editabile de patron. Variabile: {nume}, {data}, {ora}, {servicii}, {service}, {link}, {telefon}. */
export const smsTemplates = pgTable(
  "sms_templates",
  {
    tenantId: tenantIdColumn(),
    kind: text("kind", { enum: SMS_TEMPLATE_KINDS }).notNull(),
    body: text("body").notNull(),
    active: boolean("active").notNull().default(true),
    needsReview: boolean("needs_review").notNull().default(true),
    reviewNote: text("review_note"),
    ...timestamps(),
  },
  (t) => [
    primaryKey({ name: "sms_templates_pk", columns: [t.tenantId, t.kind] }),
    check("sms_templates_kind_ck", inList(t.kind, SMS_TEMPLATE_KINDS)),
    check("sms_templates_body_ck", sql`length(${t.body}) between 1 and 480`),
  ],
);
