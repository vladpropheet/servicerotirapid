// Catalogul unui service: dimensiuni (vehicul, jantă), categorii, servicii, prețuri, suprataxe.
// Toate cheile străine între tabelele unui service includ tenant_id, ca baza de date
// să nu poată lega date din service-uri diferite.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  PRICE_STATUSES,
  PRICING_MODES,
  SERVICE_UNITS,
  SURCHARGE_STACKING,
  SURCHARGE_UNITS,
} from "@/domain/enums";
import { codeCheck, idColumn, inList, timestamps } from "./_shared";
import { tenantIdColumn } from "./platform";

/** Coloanele „de verificat”: valori neconfirmate de patron, afișate ca listă în admin. */
const reviewColumns = () => ({
  needsReview: boolean("needs_review").notNull().default(false),
  reviewNote: text("review_note"),
});

export const vehicleTypes = pgTable(
  "vehicle_types",
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    code: text("code").notNull(),
    label: text("label").notNull(),
    sortOrder: smallint("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    unique("vehicle_types_tenant_id_uq").on(t.tenantId, t.id),
    unique("vehicle_types_code_uq").on(t.tenantId, t.code),
    check("vehicle_types_code_ck", codeCheck(t.code)),
  ],
);

/** Mărimi de jantă ca „găleți”: `12-16` acoperă 12–16 inch, `17` doar 17 inch. */
export const rimSizes = pgTable(
  "rim_sizes",
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    code: text("code").notNull(),
    label: text("label").notNull(),
    inchMin: smallint("inch_min").notNull(),
    inchMax: smallint("inch_max").notNull(),
    sortOrder: smallint("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    unique("rim_sizes_tenant_id_uq").on(t.tenantId, t.id),
    unique("rim_sizes_code_uq").on(t.tenantId, t.code),
    check("rim_sizes_code_ck", codeCheck(t.code)),
    check(
      "rim_sizes_inch_ck",
      sql`${t.inchMin} between 10 and 30 and ${t.inchMax} between ${t.inchMin} and 30`,
    ),
  ],
);

export const rimTypes = pgTable(
  "rim_types",
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    code: text("code").notNull(),
    label: text("label").notNull(),
    sortOrder: smallint("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    unique("rim_types_tenant_id_uq").on(t.tenantId, t.id),
    unique("rim_types_code_uq").on(t.tenantId, t.code),
    check("rim_types_code_ck", codeCheck(t.code)),
  ],
);

export const serviceCategories = pgTable(
  "service_categories",
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    sortOrder: smallint("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    unique("service_categories_tenant_id_uq").on(t.tenantId, t.id),
    unique("service_categories_code_uq").on(t.tenantId, t.code),
    check("service_categories_code_ck", codeCheck(t.code)),
  ],
);

export const services = pgTable(
  "services",
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    categoryId: uuid("category_id").notNull(),
    /** Codul din catalogul de pornire (ex. `pachet_complet`). Stabil, folosit de seed. */
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    includes: text("includes"),
    /** Textul care explică clientului diferența față de servicii asemănătoare. */
    customerExplainer: text("customer_explainer"),
    unit: text("unit", { enum: SERVICE_UNITS }).notNull(),
    pricingMode: text("pricing_mode", { enum: PRICING_MODES }).notNull(),
    byVehicle: boolean("by_vehicle").notNull().default(false),
    byRimSize: boolean("by_rim_size").notNull().default(false),
    byRimType: boolean("by_rim_type").notNull().default(false),
    baseDurationMin: smallint("base_duration_min"),
    perUnitDurationMin: smallint("per_unit_duration_min").notNull().default(0),
    durationNeedsReview: boolean("duration_needs_review").notNull().default(false),
    /** false = serviciul apare cu preț și butonul „Sună acum”, fără programare online. */
    bookableOnline: boolean("bookable_online").notNull().default(false),
    /** null = pentru `wheel` se folosește numărul de roți ales; altfel 1. */
    defaultQuantity: smallint("default_quantity"),
    maxQuantity: smallint("max_quantity").notNull().default(10),
    active: boolean("active").notNull().default(true),
    /** Ștergere doar logică: programările vechi păstrează legătura. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    sortOrder: smallint("sort_order").notNull().default(0),
    /** Rezervat pentru capacitate separată pe categorie (nefolosit în v1). */
    capacityGroup: text("capacity_group"),
    ...reviewColumns(),
    ...timestamps(),
  },
  (t) => [
    unique("services_tenant_id_uq").on(t.tenantId, t.id),
    unique("services_code_uq").on(t.tenantId, t.code),
    foreignKey({
      name: "services_category_fk",
      columns: [t.tenantId, t.categoryId],
      foreignColumns: [serviceCategories.tenantId, serviceCategories.id],
    }),
    index("services_category_idx").on(t.tenantId, t.categoryId, t.sortOrder),
    check("services_code_ck", codeCheck(t.code)),
    check("services_unit_ck", inList(t.unit, SERVICE_UNITS)),
    check("services_pricing_mode_ck", inList(t.pricingMode, PRICING_MODES)),
    check(
      "services_matrix_dims_ck",
      sql`(${t.pricingMode} = 'matrix') = (${t.byVehicle} or ${t.byRimSize} or ${t.byRimType})`,
    ),
    check(
      "services_duration_ck",
      sql`(${t.baseDurationMin} is null or ${t.baseDurationMin} >= 0) and ${t.perUnitDurationMin} >= 0`,
    ),
    check(
      "services_bookable_duration_ck",
      sql`not ${t.bookableOnline} or (${t.baseDurationMin} is not null and ${t.baseDurationMin} + ${t.perUnitDurationMin} > 0)`,
    ),
    check(
      "services_quantity_ck",
      sql`(${t.defaultQuantity} is null or ${t.defaultQuantity} > 0) and ${t.maxQuantity} > 0`,
    ),
  ],
);

/**
 * Un singur tabel pentru toate modurile de preț:
 * - fix / interval: un rând fără dimensiuni;
 * - matrice: un rând pe combinație. Rând lipsă = combinația nu există.
 */
export const servicePrices = pgTable(
  "service_prices",
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    serviceId: uuid("service_id").notNull(),
    vehicleTypeId: uuid("vehicle_type_id"),
    rimSizeId: uuid("rim_size_id"),
    rimTypeId: uuid("rim_type_id"),
    status: text("status", { enum: PRICE_STATUSES }).notNull().default("priced"),
    minBani: integer("min_bani"),
    maxBani: integer("max_bani"),
    /** Afișat ca „de la X lei”. */
    priceIsMinimum: boolean("price_is_minimum").notNull().default(false),
    /** De unde vine valoarea (ex. „afiș: 13–16"”). */
    sourceNote: text("source_note"),
    ...reviewColumns(),
    ...timestamps(),
  },
  (t) => [
    unique("service_prices_tenant_id_uq").on(t.tenantId, t.id),
    unique("service_prices_cell_uq")
      .on(t.tenantId, t.serviceId, t.vehicleTypeId, t.rimSizeId, t.rimTypeId)
      .nullsNotDistinct(),
    foreignKey({
      name: "service_prices_service_fk",
      columns: [t.tenantId, t.serviceId],
      foreignColumns: [services.tenantId, services.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "service_prices_vehicle_type_fk",
      columns: [t.tenantId, t.vehicleTypeId],
      foreignColumns: [vehicleTypes.tenantId, vehicleTypes.id],
    }),
    foreignKey({
      name: "service_prices_rim_size_fk",
      columns: [t.tenantId, t.rimSizeId],
      foreignColumns: [rimSizes.tenantId, rimSizes.id],
    }),
    foreignKey({
      name: "service_prices_rim_type_fk",
      columns: [t.tenantId, t.rimTypeId],
      foreignColumns: [rimTypes.tenantId, rimTypes.id],
    }),
    check("service_prices_status_ck", inList(t.status, PRICE_STATUSES)),
    check(
      "service_prices_amount_ck",
      sql`(${t.status} = 'priced') = (${t.minBani} is not null and ${t.maxBani} is not null)`,
    ),
    check(
      "service_prices_range_ck",
      sql`${t.minBani} is null or (${t.minBani} >= 0 and ${t.maxBani} >= ${t.minBani})`,
    ),
  ],
);

export const surcharges = pgTable(
  "surcharges",
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    unit: text("unit", { enum: SURCHARGE_UNITS }).notNull(),
    minBani: integer("min_bani").notNull(),
    maxBani: integer("max_bani").notNull(),
    priceIsMinimum: boolean("price_is_minimum").notNull().default(false),
    stacking: text("stacking", { enum: SURCHARGE_STACKING }).notNull().default("once_per_wheel"),
    /** Apare ca bifă în formularul public. */
    customerSelectable: boolean("customer_selectable").notNull().default(true),
    active: boolean("active").notNull().default(true),
    sortOrder: smallint("sort_order").notNull().default(0),
    ...reviewColumns(),
    ...timestamps(),
  },
  (t) => [
    unique("surcharges_tenant_id_uq").on(t.tenantId, t.id),
    unique("surcharges_code_uq").on(t.tenantId, t.code),
    check("surcharges_code_ck", codeCheck(t.code)),
    check("surcharges_unit_ck", inList(t.unit, SURCHARGE_UNITS)),
    check("surcharges_stacking_ck", inList(t.stacking, SURCHARGE_STACKING)),
    check(
      "surcharges_amount_ck",
      sql`${t.minBani} >= 0 and ${t.maxBani} >= ${t.minBani}`,
    ),
  ],
);

/** La ce servicii se aplică fiecare suprataxă. */
export const surchargeServices = pgTable(
  "surcharge_services",
  {
    tenantId: tenantIdColumn(),
    surchargeId: uuid("surcharge_id").notNull(),
    serviceId: uuid("service_id").notNull(),
  },
  (t) => [
    primaryKey({
      name: "surcharge_services_pk",
      columns: [t.tenantId, t.surchargeId, t.serviceId],
    }),
    foreignKey({
      name: "surcharge_services_surcharge_fk",
      columns: [t.tenantId, t.surchargeId],
      foreignColumns: [surcharges.tenantId, surcharges.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "surcharge_services_service_fk",
      columns: [t.tenantId, t.serviceId],
      foreignColumns: [services.tenantId, services.id],
    }).onDelete("cascade"),
  ],
);

/** Combinații de servicii care nu au sens împreună (ex. pachet complet + echilibrat). */
export const serviceConflicts = pgTable(
  "service_conflicts",
  {
    tenantId: tenantIdColumn(),
    serviceAId: uuid("service_a_id").notNull(),
    serviceBId: uuid("service_b_id").notNull(),
  },
  (t) => [
    primaryKey({
      name: "service_conflicts_pk",
      columns: [t.tenantId, t.serviceAId, t.serviceBId],
    }),
    foreignKey({
      name: "service_conflicts_a_fk",
      columns: [t.tenantId, t.serviceAId],
      foreignColumns: [services.tenantId, services.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "service_conflicts_b_fk",
      columns: [t.tenantId, t.serviceBId],
      foreignColumns: [services.tenantId, services.id],
    }).onDelete("cascade"),
    check("service_conflicts_order_ck", sql`${t.serviceAId} < ${t.serviceBId}`),
  ],
);
