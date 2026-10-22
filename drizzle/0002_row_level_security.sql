-- Row-Level Security: a doua barieră între service-uri (tenanți).
--
-- Fiecare tabel cu date ale unui service vede doar rândurile tenantului setat în tranzacție
-- prin set_config('app.tenant_id', ..., true) (vezi withTenant() în src/server/tenant).
-- Fără tenant setat: zero rânduri (se închide în caz de greșeală).
--
-- Regulile se aplică rolului aplicației (`app_user`). Proprietarul tabelelor (cel care rulează
-- migrările) nu e afectat, ca migrările să poată lucra pe toate datele.
--
-- Tabele FĂRĂ RLS (globale prin natura lor, fără date ale clienților finali):
-- tenants, platform_audit_log, rate_limit_buckets, booking_access_tokens,
-- auth_*, tenant_memberships, support_sessions, auth_login_guard.

-- nullif: pe o conexiune refolosită, valoarea apare ca text gol, nu ca null.
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'vehicle_types', 'rim_sizes', 'rim_types', 'service_categories', 'services',
    'service_prices', 'surcharges', 'surcharge_services', 'service_conflicts',
    'business_hours', 'closures', 'booking_settings', 'sms_templates',
    'customers', 'customer_consents', 'bookings', 'booking_items',
    'notifications_log', 'audit_log', 'media'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant())',
      t
    );
  END LOOP;
END $$;
