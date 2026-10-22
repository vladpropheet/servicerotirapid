// Valorile permise pentru coloanele de tip „status” din baza de date.
// Sunt folosite atât de schema Drizzle (constrângeri CHECK), cât și de logica pură din src/domain.

export const TENANT_STATUSES = ["active", "suspended"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

/** Unitatea de măsură a unui serviciu: pe roată, pe bucată sau o singură dată. */
export const SERVICE_UNITS = ["wheel", "piece", "service"] as const;
export type ServiceUnit = (typeof SERVICE_UNITS)[number];

export const PRICING_MODES = ["fixed", "range", "matrix", "on_request"] as const;
export type PricingMode = (typeof PRICING_MODES)[number];

/** priced = are preț; on_request = „preț stabilit în service”; not_offered = „nu facem”. */
export const PRICE_STATUSES = ["priced", "on_request", "not_offered"] as const;
export type PriceStatus = (typeof PRICE_STATUSES)[number];

export const SURCHARGE_UNITS = ["per_wheel", "per_booking"] as const;
export type SurchargeUnit = (typeof SURCHARGE_UNITS)[number];

/** once_per_wheel = o dată pe roată per programare; per_item = la fiecare serviciu căruia i se aplică. */
export const SURCHARGE_STACKING = ["once_per_wheel", "per_item"] as const;
export type SurchargeStacking = (typeof SURCHARGE_STACKING)[number];

/** closed = service închis; online_block = deschis, dar fără programări online. */
export const CLOSURE_KINDS = ["closed", "online_block"] as const;
export type ClosureKind = (typeof CLOSURE_KINDS)[number];

export const CONFIRMATION_MODES = ["auto", "manual"] as const;
export type ConfirmationMode = (typeof CONFIRMATION_MODES)[number];

export const SMS_TEMPLATE_KINDS = [
  "customer_confirmed",
  "customer_pending",
  "customer_reminder",
  "customer_cancelled",
  "owner_new_booking",
  "owner_cancelled",
] as const;
export type SmsTemplateKind = (typeof SMS_TEMPLATE_KINDS)[number];

export const BOOKING_STATUSES = ["pending", "confirmed", "cancelled", "completed", "no_show"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_SOURCES = ["online", "manual"] as const;
export type BookingSource = (typeof BOOKING_SOURCES)[number];

export const CANCELLED_BY = ["customer", "shop", "system"] as const;
export type CancelledBy = (typeof CANCELLED_BY)[number];

export const BOOKING_ITEM_KINDS = ["service", "surcharge", "adjustment"] as const;
export type BookingItemKind = (typeof BOOKING_ITEM_KINDS)[number];

export const ITEM_PRICE_STATUSES = ["priced", "on_request"] as const;
export type ItemPriceStatus = (typeof ITEM_PRICE_STATUSES)[number];

export const CONSENT_PURPOSES = ["privacy_notice", "marketing_sms"] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export const CONSENT_SOURCES = ["online_form", "admin", "sms_link"] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];

export const NOTIFICATION_CHANNELS = ["sms", "push"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_AUDIENCES = ["customer", "owner"] as const;
export type NotificationAudience = (typeof NOTIFICATION_AUDIENCES)[number];

export const NOTIFICATION_STATUSES = ["scheduled", "sending", "sent", "failed", "unknown", "skipped"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const SMS_ENCODINGS = ["gsm7", "ucs2"] as const;
export type SmsEncoding = (typeof SMS_ENCODINGS)[number];

export const AUDIT_ACTOR_KINDS = ["owner", "staff", "superadmin", "customer", "system"] as const;
export type AuditActorKind = (typeof AUDIT_ACTOR_KINDS)[number];
