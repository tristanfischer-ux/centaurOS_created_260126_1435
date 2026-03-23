-- EMERGENCY: Fix PostgREST PGRST002 schema cache failure
-- PostgREST can't introspect the schema. This forces a clean state.

-- Re-create the postgrest role's permissions on information_schema
GRANT USAGE ON SCHEMA information_schema TO authenticator;
GRANT SELECT ON ALL TABLES IN SCHEMA information_schema TO authenticator;

-- Ensure pg_catalog access
GRANT USAGE ON SCHEMA pg_catalog TO authenticator;

-- Ensure extensions schema access
GRANT USAGE ON SCHEMA extensions TO authenticator;

-- Refresh PostgREST schema cache
SELECT pg_notify('pgrst', 'reload schema');
SELECT pg_notify('pgrst', 'reload config');
