CREATE TABLE "platform_audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "platform_audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_user_id" text,
	"action" text NOT NULL,
	"tenant_id" uuid,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "rate_limit_buckets_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"legal_name" text NOT NULL,
	"cui" text NOT NULL,
	"reg_com" text NOT NULL,
	"registered_address" text,
	"work_address" text NOT NULL,
	"public_phone" text NOT NULL,
	"email" text,
	"timezone" text DEFAULT 'Europe/Bucharest' NOT NULL,
	"brand" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"sms_monthly_limit" integer DEFAULT 200 NOT NULL,
	"retention_months" smallint DEFAULT 24 NOT NULL,
	"review_fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_uq" UNIQUE("slug"),
	CONSTRAINT "tenants_slug_ck" CHECK ("tenants"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length("tenants"."slug") between 3 and 48),
	CONSTRAINT "tenants_status_ck" CHECK ("tenants"."status" in ('active', 'suspended')),
	CONSTRAINT "tenants_sms_limit_ck" CHECK ("tenants"."sms_monthly_limit" >= 0),
	CONSTRAINT "tenants_retention_ck" CHECK ("tenants"."retention_months" between 6 and 120)
);
--> statement-breakpoint
CREATE TABLE "rim_sizes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"inch_min" smallint NOT NULL,
	"inch_max" smallint NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rim_sizes_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "rim_sizes_code_uq" UNIQUE("tenant_id","code"),
	CONSTRAINT "rim_sizes_code_ck" CHECK ("rim_sizes"."code" ~ '^[a-z0-9_-]{1,48}$'),
	CONSTRAINT "rim_sizes_inch_ck" CHECK ("rim_sizes"."inch_min" between 10 and 30 and "rim_sizes"."inch_max" between "rim_sizes"."inch_min" and 30)
);
--> statement-breakpoint
CREATE TABLE "rim_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rim_types_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "rim_types_code_uq" UNIQUE("tenant_id","code"),
	CONSTRAINT "rim_types_code_ck" CHECK ("rim_types"."code" ~ '^[a-z0-9_-]{1,48}$')
);
--> statement-breakpoint
CREATE TABLE "service_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_categories_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "service_categories_code_uq" UNIQUE("tenant_id","code"),
	CONSTRAINT "service_categories_code_ck" CHECK ("service_categories"."code" ~ '^[a-z0-9_-]{1,48}$')
);
--> statement-breakpoint
CREATE TABLE "service_conflicts" (
	"tenant_id" uuid NOT NULL,
	"service_a_id" uuid NOT NULL,
	"service_b_id" uuid NOT NULL,
	CONSTRAINT "service_conflicts_pk" PRIMARY KEY("tenant_id","service_a_id","service_b_id"),
	CONSTRAINT "service_conflicts_order_ck" CHECK ("service_conflicts"."service_a_id" < "service_conflicts"."service_b_id")
);
--> statement-breakpoint
CREATE TABLE "service_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"vehicle_type_id" uuid,
	"rim_size_id" uuid,
	"rim_type_id" uuid,
	"status" text DEFAULT 'priced' NOT NULL,
	"min_bani" integer,
	"max_bani" integer,
	"price_is_minimum" boolean DEFAULT false NOT NULL,
	"source_note" text,
	"needs_review" boolean DEFAULT false NOT NULL,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_prices_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "service_prices_cell_uq" UNIQUE NULLS NOT DISTINCT("tenant_id","service_id","vehicle_type_id","rim_size_id","rim_type_id"),
	CONSTRAINT "service_prices_status_ck" CHECK ("service_prices"."status" in ('priced', 'on_request', 'not_offered')),
	CONSTRAINT "service_prices_amount_ck" CHECK (("service_prices"."status" = 'priced') = ("service_prices"."min_bani" is not null and "service_prices"."max_bani" is not null)),
	CONSTRAINT "service_prices_range_ck" CHECK ("service_prices"."min_bani" is null or ("service_prices"."min_bani" >= 0 and "service_prices"."max_bani" >= "service_prices"."min_bani"))
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"includes" text,
	"customer_explainer" text,
	"unit" text NOT NULL,
	"pricing_mode" text NOT NULL,
	"by_vehicle" boolean DEFAULT false NOT NULL,
	"by_rim_size" boolean DEFAULT false NOT NULL,
	"by_rim_type" boolean DEFAULT false NOT NULL,
	"base_duration_min" smallint,
	"per_unit_duration_min" smallint DEFAULT 0 NOT NULL,
	"duration_needs_review" boolean DEFAULT false NOT NULL,
	"bookable_online" boolean DEFAULT false NOT NULL,
	"default_quantity" smallint,
	"max_quantity" smallint DEFAULT 10 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"capacity_group" text,
	"needs_review" boolean DEFAULT false NOT NULL,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "services_code_uq" UNIQUE("tenant_id","code"),
	CONSTRAINT "services_code_ck" CHECK ("services"."code" ~ '^[a-z0-9_-]{1,48}$'),
	CONSTRAINT "services_unit_ck" CHECK ("services"."unit" in ('wheel', 'piece', 'service')),
	CONSTRAINT "services_pricing_mode_ck" CHECK ("services"."pricing_mode" in ('fixed', 'range', 'matrix', 'on_request')),
	CONSTRAINT "services_matrix_dims_ck" CHECK (("services"."pricing_mode" = 'matrix') = ("services"."by_vehicle" or "services"."by_rim_size" or "services"."by_rim_type")),
	CONSTRAINT "services_duration_ck" CHECK (("services"."base_duration_min" is null or "services"."base_duration_min" >= 0) and "services"."per_unit_duration_min" >= 0),
	CONSTRAINT "services_bookable_duration_ck" CHECK (not "services"."bookable_online" or ("services"."base_duration_min" is not null and "services"."base_duration_min" + "services"."per_unit_duration_min" > 0)),
	CONSTRAINT "services_quantity_ck" CHECK (("services"."default_quantity" is null or "services"."default_quantity" > 0) and "services"."max_quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "surcharge_services" (
	"tenant_id" uuid NOT NULL,
	"surcharge_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	CONSTRAINT "surcharge_services_pk" PRIMARY KEY("tenant_id","surcharge_id","service_id")
);
--> statement-breakpoint
CREATE TABLE "surcharges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"unit" text NOT NULL,
	"min_bani" integer NOT NULL,
	"max_bani" integer NOT NULL,
	"price_is_minimum" boolean DEFAULT false NOT NULL,
	"stacking" text DEFAULT 'once_per_wheel' NOT NULL,
	"customer_selectable" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "surcharges_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "surcharges_code_uq" UNIQUE("tenant_id","code"),
	CONSTRAINT "surcharges_code_ck" CHECK ("surcharges"."code" ~ '^[a-z0-9_-]{1,48}$'),
	CONSTRAINT "surcharges_unit_ck" CHECK ("surcharges"."unit" in ('per_wheel', 'per_booking')),
	CONSTRAINT "surcharges_stacking_ck" CHECK ("surcharges"."stacking" in ('once_per_wheel', 'per_item')),
	CONSTRAINT "surcharges_amount_ck" CHECK ("surcharges"."min_bani" >= 0 and "surcharges"."max_bani" >= "surcharges"."min_bani")
);
--> statement-breakpoint
CREATE TABLE "vehicle_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_types_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "vehicle_types_code_uq" UNIQUE("tenant_id","code"),
	CONSTRAINT "vehicle_types_code_ck" CHECK ("vehicle_types"."code" ~ '^[a-z0-9_-]{1,48}$')
);
--> statement-breakpoint
CREATE TABLE "booking_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"online_capacity" smallint DEFAULT 1 NOT NULL,
	"slot_step_min" smallint DEFAULT 15 NOT NULL,
	"min_lead_min" integer DEFAULT 120 NOT NULL,
	"max_days_ahead" smallint DEFAULT 30 NOT NULL,
	"confirmation_mode" text DEFAULT 'auto' NOT NULL,
	"manual_bookings_use_capacity" boolean DEFAULT false NOT NULL,
	"reminder_hours_before" smallint DEFAULT 24,
	"customer_cancel_cutoff_min" integer DEFAULT 60 NOT NULL,
	"max_active_bookings_per_phone" smallint DEFAULT 2 NOT NULL,
	"sms_quiet_from" time DEFAULT '21:00' NOT NULL,
	"sms_quiet_to" time DEFAULT '08:00' NOT NULL,
	"owner_notify_channels" text[] DEFAULT '{push}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_settings_capacity_ck" CHECK ("booking_settings"."online_capacity" between 0 and 50),
	CONSTRAINT "booking_settings_step_ck" CHECK ("booking_settings"."slot_step_min" in (5, 10, 15, 20, 30, 60)),
	CONSTRAINT "booking_settings_lead_ck" CHECK ("booking_settings"."min_lead_min" between 0 and 20160),
	CONSTRAINT "booking_settings_days_ck" CHECK ("booking_settings"."max_days_ahead" between 0 and 365),
	CONSTRAINT "booking_settings_confirmation_ck" CHECK ("booking_settings"."confirmation_mode" in ('auto', 'manual')),
	CONSTRAINT "booking_settings_reminder_ck" CHECK ("booking_settings"."reminder_hours_before" is null or "booking_settings"."reminder_hours_before" between 1 and 168),
	CONSTRAINT "booking_settings_cancel_cutoff_ck" CHECK ("booking_settings"."customer_cancel_cutoff_min" >= 0),
	CONSTRAINT "booking_settings_per_phone_ck" CHECK ("booking_settings"."max_active_bookings_per_phone" between 1 and 20)
);
--> statement-breakpoint
CREATE TABLE "business_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"opens_at" time NOT NULL,
	"closes_at" time NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_hours_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "business_hours_slot_uq" UNIQUE("tenant_id","weekday","opens_at"),
	CONSTRAINT "business_hours_weekday_ck" CHECK ("business_hours"."weekday" between 1 and 7),
	CONSTRAINT "business_hours_order_ck" CHECK ("business_hours"."closes_at" > "business_hours"."opens_at")
);
--> statement-breakpoint
CREATE TABLE "closures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"date_from" date,
	"date_to" date,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"internal_note" text,
	"public_note" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "closures_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "closures_kind_ck" CHECK ("closures"."kind" in ('closed', 'online_block')),
	CONSTRAINT "closures_form_ck" CHECK (("closures"."date_from" is not null and "closures"."date_to" >= "closures"."date_from" and "closures"."starts_at" is null and "closures"."ends_at" is null)
        or ("closures"."date_from" is null and "closures"."date_to" is null and "closures"."starts_at" is not null and "closures"."ends_at" > "closures"."starts_at"))
);
--> statement-breakpoint
CREATE TABLE "sms_templates" (
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"needs_review" boolean DEFAULT true NOT NULL,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sms_templates_pk" PRIMARY KEY("tenant_id","kind"),
	CONSTRAINT "sms_templates_kind_ck" CHECK ("sms_templates"."kind" in ('customer_confirmed', 'customer_pending', 'customer_reminder', 'customer_cancelled', 'owner_new_booking', 'owner_cancelled')),
	CONSTRAINT "sms_templates_body_ck" CHECK (length("sms_templates"."body") between 1 and 480)
);
--> statement-breakpoint
CREATE TABLE "booking_access_tokens" (
	"lookup_hash" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"token_version" smallint NOT NULL,
	"key_id" smallint DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_access_tokens_hash_ck" CHECK ("booking_access_tokens"."lookup_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "booking_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"kind" text NOT NULL,
	"service_id" uuid,
	"surcharge_id" uuid,
	"code_snapshot" text NOT NULL,
	"name_snapshot" text NOT NULL,
	"unit_snapshot" text NOT NULL,
	"quantity" smallint NOT NULL,
	"price_status" text NOT NULL,
	"unit_min_bani" integer,
	"unit_max_bani" integer,
	"price_is_minimum" boolean DEFAULT false NOT NULL,
	"line_min_bani" integer,
	"line_max_bani" integer,
	"duration_min" smallint DEFAULT 0 NOT NULL,
	"pricing_basis" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_items_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "booking_items_position_uq" UNIQUE("tenant_id","booking_id","position"),
	CONSTRAINT "booking_items_kind_ck" CHECK ("booking_items"."kind" in ('service', 'surcharge', 'adjustment')),
	CONSTRAINT "booking_items_service_ck" CHECK (("booking_items"."kind" = 'service') = ("booking_items"."service_id" is not null)),
	CONSTRAINT "booking_items_surcharge_ck" CHECK (("booking_items"."kind" = 'surcharge') = ("booking_items"."surcharge_id" is not null)),
	CONSTRAINT "booking_items_quantity_ck" CHECK ("booking_items"."quantity" between 1 and 50),
	CONSTRAINT "booking_items_price_status_ck" CHECK ("booking_items"."price_status" in ('priced', 'on_request')),
	CONSTRAINT "booking_items_price_ck" CHECK (("booking_items"."price_status" = 'priced') = ("booking_items"."unit_min_bani" is not null and "booking_items"."line_min_bani" is not null)),
	CONSTRAINT "booking_items_duration_ck" CHECK ("booking_items"."duration_min" >= 0)
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"public_ref" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"uses_online_capacity" boolean NOT NULL,
	"over_capacity" boolean DEFAULT false NOT NULL,
	"vehicle_type_id" uuid,
	"vehicle_type_label" text NOT NULL,
	"rim_size_id" uuid,
	"rim_size_label" text,
	"rim_type_id" uuid,
	"rim_type_label" text,
	"wheel_count" smallint DEFAULT 4 NOT NULL,
	"plate" text,
	"customer_note" text,
	"estimate_min_bani" integer NOT NULL,
	"estimate_max_bani" integer NOT NULL,
	"estimate_has_unpriced" boolean NOT NULL,
	"work_duration_min" smallint NOT NULL,
	"final_price_bani" integer,
	"confirmed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" text,
	"cancel_reason" text,
	"idempotency_key" uuid,
	"created_by_user_id" text,
	"token_version" smallint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "bookings_public_ref_uq" UNIQUE("tenant_id","public_ref"),
	CONSTRAINT "bookings_idempotency_uq" UNIQUE("tenant_id","idempotency_key"),
	CONSTRAINT "bookings_status_ck" CHECK ("bookings"."status" in ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
	CONSTRAINT "bookings_source_ck" CHECK ("bookings"."source" in ('online', 'manual')),
	CONSTRAINT "bookings_interval_ck" CHECK ("bookings"."ends_at" > "bookings"."starts_at"),
	CONSTRAINT "bookings_wheels_ck" CHECK ("bookings"."wheel_count" between 1 and 10),
	CONSTRAINT "bookings_plate_ck" CHECK ("bookings"."plate" is null or "bookings"."plate" ~ '^[A-Z0-9]{2,10}$'),
	CONSTRAINT "bookings_note_ck" CHECK ("bookings"."customer_note" is null or length("bookings"."customer_note") <= 500),
	CONSTRAINT "bookings_estimate_ck" CHECK ("bookings"."estimate_min_bani" >= 0 and "bookings"."estimate_max_bani" >= "bookings"."estimate_min_bani"),
	CONSTRAINT "bookings_duration_ck" CHECK ("bookings"."work_duration_min" > 0),
	CONSTRAINT "bookings_cancelled_ck" CHECK (("bookings"."status" = 'cancelled') = ("bookings"."cancelled_at" is not null)),
	CONSTRAINT "bookings_cancelled_by_ck" CHECK ("bookings"."cancelled_by" is null or "bookings"."cancelled_by" in ('customer', 'shop', 'system'))
);
--> statement-breakpoint
CREATE TABLE "customer_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"granted" boolean NOT NULL,
	"text_version" text NOT NULL,
	"text_snapshot" text NOT NULL,
	"source" text NOT NULL,
	"booking_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_consents_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "customer_consents_purpose_ck" CHECK ("customer_consents"."purpose" in ('privacy_notice', 'marketing_sms')),
	CONSTRAINT "customer_consents_source_ck" CHECK ("customer_consents"."source" in ('online_form', 'admin', 'sms_link'))
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"full_name" text,
	"phone_e164" text,
	"marketing_sms_opt_in" boolean DEFAULT false NOT NULL,
	"internal_note" text,
	"last_booking_at" timestamp with time zone,
	"anonymized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "customers_phone_uq" UNIQUE("tenant_id","phone_e164"),
	CONSTRAINT "customers_name_ck" CHECK ("customers"."full_name" is null or length("customers"."full_name") between 2 and 80),
	CONSTRAINT "customers_phone_ck" CHECK ("customers"."phone_e164" is null or "customers"."phone_e164" ~ '^\+[1-9][0-9]{7,14}$'),
	CONSTRAINT "customers_anonymized_ck" CHECK (("customers"."anonymized_at" is null) = ("customers"."full_name" is not null and "customers"."phone_e164" is not null))
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tenant_id" uuid NOT NULL,
	"actor_user_id" text,
	"actor_kind" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_actor_kind_ck" CHECK ("audit_log"."actor_kind" in ('owner', 'staff', 'superadmin', 'customer', 'system'))
);
--> statement-breakpoint
CREATE TABLE "notifications_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"booking_id" uuid,
	"channel" text NOT NULL,
	"kind" text NOT NULL,
	"audience" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" text NOT NULL,
	"skip_reason" text,
	"scheduled_for" timestamp with time zone NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"recipient_masked" text,
	"provider" text,
	"provider_msg_id" text,
	"encoding" text,
	"segments" smallint,
	"cost_estimate_bani" integer,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_log_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "notifications_log_dedupe_uq" UNIQUE("tenant_id","dedupe_key"),
	CONSTRAINT "notifications_log_channel_ck" CHECK ("notifications_log"."channel" in ('sms', 'push')),
	CONSTRAINT "notifications_log_audience_ck" CHECK ("notifications_log"."audience" in ('customer', 'owner')),
	CONSTRAINT "notifications_log_status_ck" CHECK ("notifications_log"."status" in ('scheduled', 'sending', 'sent', 'failed', 'unknown', 'skipped')),
	CONSTRAINT "notifications_log_encoding_ck" CHECK ("notifications_log"."encoding" is null or "notifications_log"."encoding" in ('gsm7', 'ucs2'))
);
--> statement-breakpoint
ALTER TABLE "platform_audit_log" ADD CONSTRAINT "platform_audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rim_sizes" ADD CONSTRAINT "rim_sizes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rim_types" ADD CONSTRAINT "rim_types_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_conflicts" ADD CONSTRAINT "service_conflicts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_conflicts" ADD CONSTRAINT "service_conflicts_a_fk" FOREIGN KEY ("tenant_id","service_a_id") REFERENCES "public"."services"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_conflicts" ADD CONSTRAINT "service_conflicts_b_fk" FOREIGN KEY ("tenant_id","service_b_id") REFERENCES "public"."services"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_prices" ADD CONSTRAINT "service_prices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_prices" ADD CONSTRAINT "service_prices_service_fk" FOREIGN KEY ("tenant_id","service_id") REFERENCES "public"."services"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_prices" ADD CONSTRAINT "service_prices_vehicle_type_fk" FOREIGN KEY ("tenant_id","vehicle_type_id") REFERENCES "public"."vehicle_types"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_prices" ADD CONSTRAINT "service_prices_rim_size_fk" FOREIGN KEY ("tenant_id","rim_size_id") REFERENCES "public"."rim_sizes"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_prices" ADD CONSTRAINT "service_prices_rim_type_fk" FOREIGN KEY ("tenant_id","rim_type_id") REFERENCES "public"."rim_types"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_category_fk" FOREIGN KEY ("tenant_id","category_id") REFERENCES "public"."service_categories"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surcharge_services" ADD CONSTRAINT "surcharge_services_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surcharge_services" ADD CONSTRAINT "surcharge_services_surcharge_fk" FOREIGN KEY ("tenant_id","surcharge_id") REFERENCES "public"."surcharges"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surcharge_services" ADD CONSTRAINT "surcharge_services_service_fk" FOREIGN KEY ("tenant_id","service_id") REFERENCES "public"."services"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surcharges" ADD CONSTRAINT "surcharges_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_types" ADD CONSTRAINT "vehicle_types_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_settings" ADD CONSTRAINT "booking_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closures" ADD CONSTRAINT "closures_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_templates" ADD CONSTRAINT "sms_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_access_tokens" ADD CONSTRAINT "booking_access_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_access_tokens" ADD CONSTRAINT "booking_access_tokens_booking_fk" FOREIGN KEY ("tenant_id","booking_id") REFERENCES "public"."bookings"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_booking_fk" FOREIGN KEY ("tenant_id","booking_id") REFERENCES "public"."bookings"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_service_fk" FOREIGN KEY ("tenant_id","service_id") REFERENCES "public"."services"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_surcharge_fk" FOREIGN KEY ("tenant_id","surcharge_id") REFERENCES "public"."surcharges"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "public"."customers"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_vehicle_type_fk" FOREIGN KEY ("tenant_id","vehicle_type_id") REFERENCES "public"."vehicle_types"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_rim_size_fk" FOREIGN KEY ("tenant_id","rim_size_id") REFERENCES "public"."rim_sizes"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_rim_type_fk" FOREIGN KEY ("tenant_id","rim_type_id") REFERENCES "public"."rim_types"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_consents" ADD CONSTRAINT "customer_consents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_consents" ADD CONSTRAINT "customer_consents_customer_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "public"."customers"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications_log" ADD CONSTRAINT "notifications_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications_log" ADD CONSTRAINT "notifications_log_booking_fk" FOREIGN KEY ("tenant_id","booking_id") REFERENCES "public"."bookings"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "services_category_idx" ON "services" USING btree ("tenant_id","category_id","sort_order");--> statement-breakpoint
CREATE INDEX "closures_dates_idx" ON "closures" USING btree ("tenant_id","date_to");--> statement-breakpoint
CREATE INDEX "closures_instants_idx" ON "closures" USING btree ("tenant_id","ends_at");--> statement-breakpoint
CREATE INDEX "booking_access_tokens_booking_idx" ON "booking_access_tokens" USING btree ("tenant_id","booking_id");--> statement-breakpoint
CREATE INDEX "bookings_starts_idx" ON "bookings" USING btree ("tenant_id","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_active_starts_idx" ON "bookings" USING btree ("tenant_id","starts_at") WHERE "bookings"."status" <> 'cancelled';--> statement-breakpoint
CREATE INDEX "bookings_customer_idx" ON "bookings" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE INDEX "customer_consents_customer_idx" ON "customer_consents" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE INDEX "audit_log_recent_idx" ON "audit_log" USING btree ("tenant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("tenant_id","entity_type","entity_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_log_due_idx" ON "notifications_log" USING btree ("tenant_id","scheduled_for") WHERE "notifications_log"."status" = 'scheduled';--> statement-breakpoint
CREATE INDEX "notifications_log_sent_idx" ON "notifications_log" USING btree ("tenant_id","sent_at");