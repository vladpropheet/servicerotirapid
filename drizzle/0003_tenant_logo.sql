-- Logo-ul service-ului (opțional), încărcat de patron din „Datele firmei”, ca poza fațadei. Doar adaugă.
ALTER TABLE "media" DROP CONSTRAINT "media_kind_ck";--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "logo_media_id" uuid;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_kind_ck" CHECK ("media"."kind" in ('facade', 'logo'));