// Clienți, acorduri GDPR, programări și liniile lor.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  BOOKING_ITEM_KINDS,
  BOOKING_SOURCES,
  BOOKING_STATUSES,
  CANCELLED_BY,
  CONSENT_PURPOSES,
  CONSENT_SOURCES,
  ITEM_PRICE_STATUSES,
} from "@/domain/enums";
import { createdAtColumn, idColumn, inList, timestamps } from "./_shared";
import { rimSizes, rimTypes, services, surcharges, vehicleTypes } from "./catalog";
import { tenantIdColumn } from "./platform";

/**
 * Clienții finali. Ștergerea GDPR = anonimizare pe loc: numele și telefonul devin null,
 * iar programările rămân pentru statistici.
 */
export const customers = pgTable(
  "customers",
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    fullName: text("full_name"),
    phoneE164: text("phone_e164"),
    marketingSmsOptIn: boolean("marketing_sms_opt_in").notNull().default(false),
    internalNote: text("internal_note"),
    lastBookingAt: timestamp("last_booking_at", { withTimezone: true }),
    anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    unique("customers_tenant_id_uq").on(t.tenantId, t.id),
    // NULL-urile (clienți anonimizați) nu intră în conflict între ele.
    unique("customers_phone_uq").on(t.tenantId, t.phoneE164),
    check("customers_name_ck", sql`${t.fullName} is null or length(${t.fullName}) between 2 and 80`),
    check("customers_phone_ck", sql`${t.phoneE164} is null or ${t.phoneE164} ~ '^\\+[1-9][0-9]{7,14}$'`),
    check(
      "customers_anonymized_ck",
      sql`(${t.anonymizedAt} is null) = (${t.fullName} is not null and ${t.phoneE164} is not null)`,
    ),
  ],
);

/** Istoricul acordurilor (doar adăugare): ce text a acceptat clientul și când. */
export const customerConsents = pgTable(
  "customer_consents",
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    customerId: uuid("customer_id").notNull(),
    purpose: text("purpose", { enum: CONSENT_PURPOSES }).notNull(),
    granted: boolean("granted").notNull(),
    textVersion: text("text_version").notNull(),
    textSnapshot: text("text_snapshot").notNull(),
    source: text("source", { enum: CONSENT_SOURCES }).notNull(),
    /** Programarea la care s-a dat acordul (informativ, fără cheie străină). */
    bookingId: uuid("booking_id"),
    createdAt: createdAtColumn(),
  },
  (t) => [
    unique("customer_consents_tenant_id_uq").on(t.tenantId, t.id),
    foreignKey({
      name: "customer_consents_customer_fk",
      columns: [t.tenantId, t.customerId],
      foreignColumns: [customers.tenantId, customers.id],
    }).onDelete("cascade"),
    index("customer_consents_customer_idx").on(t.tenantId, t.customerId),
    check("customer_consents_purpose_ck", inList(t.purpose, CONSENT_PURPOSES)),
    check("customer_consents_source_ck", inList(t.source, CONSENT_SOURCES)),
  ],
);

export const bookings = pgTable(
  "bookings",
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    /** Cod scurt pentru telefon (ex. „K7P2QX”). Nu e secret și nu dă acces la nimic. */
    publicRef: text("public_ref").notNull(),
    customerId: uuid("customer_id").notNull(),
    status: text("status", { enum: BOOKING_STATUSES }).notNull(),
    source: text("source", { enum: BOOKING_SOURCES }).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    /** Fixat la creare: programarea ocupă capacitatea online? */
    usesOnlineCapacity: boolean("uses_online_capacity").notNull(),
    /** Patronul a salvat-o deși depășea capacitatea. */
    overCapacity: boolean("over_capacity").notNull().default(false),
    vehicleTypeId: uuid("vehicle_type_id"),
    vehicleTypeLabel: text("vehicle_type_label").notNull(),
    /** null = clientul a ales „nu știu”. */
    rimSizeId: uuid("rim_size_id"),
    rimSizeLabel: text("rim_size_label"),
    rimTypeId: uuid("rim_type_id"),
    rimTypeLabel: text("rim_type_label"),
    wheelCount: smallint("wheel_count").notNull().default(4),
    /** Nr. de înmatriculare, normalizat (majuscule, fără spații). Pe programare, nu pe client. */
    plate: text("plate"),
    customerNote: text("customer_note"),
    estimateMinBani: integer("estimate_min_bani").notNull(),
    estimateMaxBani: integer("estimate_max_bani").notNull(),
    /** Cel puțin o linie are „preț stabilit în service”. */
    estimateHasUnpriced: boolean("estimate_has_unpriced").notNull(),
    /** Durata de lucru calculată, înainte de rotunjirea la pasul intervalelor. */
    workDurationMin: smallint("work_duration_min").notNull(),
    finalPriceBani: integer("final_price_bani"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: text("cancelled_by", { enum: CANCELLED_BY }),
    cancelReason: text("cancel_reason"),
    /** Protecție la dublu-click: aceeași cheie = aceeași programare. */
    idempotencyKey: uuid("idempotency_key"),
    createdByUserId: text("created_by_user_id"),
    /** Crește când linkul din SMS trebuie invalidat. */
    tokenVersion: smallint("token_version").notNull().default(1),
    ...timestamps(),
  },
  (t) => [
    unique("bookings_tenant_id_uq").on(t.tenantId, t.id),
    unique("bookings_public_ref_uq").on(t.tenantId, t.publicRef),
    unique("bookings_idempotency_uq").on(t.tenantId, t.idempotencyKey),
    foreignKey({
      name: "bookings_customer_fk",
      columns: [t.tenantId, t.customerId],
      foreignColumns: [customers.tenantId, customers.id],
    }),
    foreignKey({
      name: "bookings_vehicle_type_fk",
      columns: [t.tenantId, t.vehicleTypeId],
      foreignColumns: [vehicleTypes.tenantId, vehicleTypes.id],
    }),
    foreignKey({
      name: "bookings_rim_size_fk",
      columns: [t.tenantId, t.rimSizeId],
      foreignColumns: [rimSizes.tenantId, rimSizes.id],
    }),
    foreignKey({
      name: "bookings_rim_type_fk",
      columns: [t.tenantId, t.rimTypeId],
      foreignColumns: [rimTypes.tenantId, rimTypes.id],
    }),
    index("bookings_starts_idx").on(t.tenantId, t.startsAt),
    index("bookings_active_starts_idx")
      .on(t.tenantId, t.startsAt)
      .where(sql`${t.status} <> 'cancelled'`),
    index("bookings_customer_idx").on(t.tenantId, t.customerId),
    check("bookings_status_ck", inList(t.status, BOOKING_STATUSES)),
    check("bookings_source_ck", inList(t.source, BOOKING_SOURCES)),
    check("bookings_interval_ck", sql`${t.endsAt} > ${t.startsAt}`),
    check("bookings_wheels_ck", sql`${t.wheelCount} between 1 and 10`),
    check("bookings_plate_ck", sql`${t.plate} is null or ${t.plate} ~ '^[A-Z0-9]{2,10}$'`),
    check("bookings_note_ck", sql`${t.customerNote} is null or length(${t.customerNote}) <= 500`),
    check(
      "bookings_estimate_ck",
      sql`${t.estimateMinBani} >= 0 and ${t.estimateMaxBani} >= ${t.estimateMinBani}`,
    ),
    check("bookings_duration_ck", sql`${t.workDurationMin} > 0`),
    check(
      "bookings_cancelled_ck",
      sql`(${t.status} = 'cancelled') = (${t.cancelledAt} is not null)`,
    ),
    check(
      "bookings_cancelled_by_ck",
      sql`${t.cancelledBy} is null or ${inList(t.cancelledBy, CANCELLED_BY)}`,
    ),
  ],
);

/**
 * Liniile unei programări (servicii și suprataxe), cu copii ale numelui, prețului și duratei
 * de la momentul rezervării. Istoricul citește doar aceste copii.
 */
export const bookingItems = pgTable(
  "booking_items",
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    bookingId: uuid("booking_id").notNull(),
    position: smallint("position").notNull(),
    kind: text("kind", { enum: BOOKING_ITEM_KINDS }).notNull(),
    serviceId: uuid("service_id"),
    surchargeId: uuid("surcharge_id"),
    codeSnapshot: text("code_snapshot").notNull(),
    nameSnapshot: text("name_snapshot").notNull(),
    unitSnapshot: text("unit_snapshot").notNull(),
    quantity: smallint("quantity").notNull(),
    priceStatus: text("price_status", { enum: ITEM_PRICE_STATUSES }).notNull(),
    unitMinBani: integer("unit_min_bani"),
    unitMaxBani: integer("unit_max_bani"),
    priceIsMinimum: boolean("price_is_minimum").notNull().default(false),
    lineMinBani: integer("line_min_bani"),
    lineMaxBani: integer("line_max_bani"),
    durationMin: smallint("duration_min").notNull().default(0),
    /** Ce celule de preț s-au folosit și ce a ales clientul („nu știu” etc.). */
    pricingBasis: jsonb("pricing_basis").notNull().default({}),
    ...timestamps(),
  },
  (t) => [
    unique("booking_items_tenant_id_uq").on(t.tenantId, t.id),
    unique("booking_items_position_uq").on(t.tenantId, t.bookingId, t.position),
    foreignKey({
      name: "booking_items_booking_fk",
      columns: [t.tenantId, t.bookingId],
      foreignColumns: [bookings.tenantId, bookings.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "booking_items_service_fk",
      columns: [t.tenantId, t.serviceId],
      foreignColumns: [services.tenantId, services.id],
    }),
    foreignKey({
      name: "booking_items_surcharge_fk",
      columns: [t.tenantId, t.surchargeId],
      foreignColumns: [surcharges.tenantId, surcharges.id],
    }),
    check("booking_items_kind_ck", inList(t.kind, BOOKING_ITEM_KINDS)),
    check("booking_items_service_ck", sql`(${t.kind} = 'service') = (${t.serviceId} is not null)`),
    check(
      "booking_items_surcharge_ck",
      sql`(${t.kind} = 'surcharge') = (${t.surchargeId} is not null)`,
    ),
    check("booking_items_quantity_ck", sql`${t.quantity} between 1 and 50`),
    check("booking_items_price_status_ck", inList(t.priceStatus, ITEM_PRICE_STATUSES)),
    check(
      "booking_items_price_ck",
      sql`(${t.priceStatus} = 'priced') = (${t.unitMinBani} is not null and ${t.lineMinBani} is not null)`,
    ),
    check("booking_items_duration_ck", sql`${t.durationMin} >= 0`),
  ],
);

/**
 * Linkurile din SMS (vezi / anulează). Doar hash-ul SHA-256 al tokenului, niciodată tokenul.
 * Tabel global (căutare după hash), fără date personale.
 */
export const bookingAccessTokens = pgTable(
  "booking_access_tokens",
  {
    lookupHash: text("lookup_hash").primaryKey(),
    tenantId: tenantIdColumn(),
    bookingId: uuid("booking_id").notNull(),
    tokenVersion: smallint("token_version").notNull(),
    /** Ce cheie secretă a generat tokenul (pentru schimbarea cheii pe viitor). */
    keyId: smallint("key_id").notNull().default(1),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAtColumn(),
  },
  (t) => [
    foreignKey({
      name: "booking_access_tokens_booking_fk",
      columns: [t.tenantId, t.bookingId],
      foreignColumns: [bookings.tenantId, bookings.id],
    }).onDelete("cascade"),
    index("booking_access_tokens_booking_idx").on(t.tenantId, t.bookingId),
    check("booking_access_tokens_hash_ck", sql`${t.lookupHash} ~ '^[0-9a-f]{64}$'`),
  ],
);
