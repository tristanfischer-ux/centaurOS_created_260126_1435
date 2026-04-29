-- Migration: 20260429500000_schema_preflight_rpc.sql
--
-- Adds server-side RPC functions that the application preflight check calls at
-- startup to assert that the database schema matches what the codebase expects.
--
-- Two functions are provided:
--   schema_preflight_get_latest_migration()
--     Returns the most recently applied migration version from the Supabase
--     internal migration-tracking table.
--
--   schema_preflight_check_columns(checks jsonb)
--     Accepts a JSON array of {table_name, column_name} objects and returns
--     which ones are missing from the public schema. An empty array means all
--     columns are present.
--
-- Both functions are SECURITY DEFINER with a fixed search_path so they run
-- with the privileges of the owner (service_role) regardless of the caller.
-- They are granted to service_role only — the anon/authenticated keys cannot
-- invoke them.
--
-- Rationale: The Supabase JS client uses PostgREST which cannot directly
-- query schemas other than public (e.g. supabase_migrations) or
-- information_schema through the standard table API. Custom RPC functions are
-- the idiomatic way to expose privileged cross-schema queries through the
-- PostgREST interface.

-- -------------------------------------------------------------------------
-- 1. schema_preflight_get_latest_migration()
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.schema_preflight_get_latest_migration()
RETURNS TABLE (version text, total_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, supabase_migrations
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sm.version::text AS version,
    COUNT(*) OVER ()::bigint AS total_count
  FROM supabase_migrations.schema_migrations sm
  ORDER BY sm.version DESC
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.schema_preflight_get_latest_migration() IS
  'Returns the latest applied migration version and total migration count '
  'for schema preflight assertions at application startup.';

-- -------------------------------------------------------------------------
-- 2. schema_preflight_check_columns(checks jsonb)
-- -------------------------------------------------------------------------
-- Input JSON shape: [{"table_name": "parts", "column_name": "cost_provenance"}, ...]
-- Output: rows for every input pair where the column does NOT exist.
--   An empty result set means every column was found — the preflight passes.

CREATE OR REPLACE FUNCTION public.schema_preflight_check_columns(
  checks jsonb
)
RETURNS TABLE (table_name text, column_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, information_schema
AS $$
DECLARE
  check_item jsonb;
  t_name text;
  c_name text;
  col_exists boolean;
BEGIN
  FOR check_item IN SELECT jsonb_array_elements(checks)
  LOOP
    t_name := check_item->>'table_name';
    c_name := check_item->>'column_name';

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns ic
      WHERE ic.table_schema = 'public'
        AND ic.table_name   = t_name
        AND ic.column_name  = c_name
    ) INTO col_exists;

    IF NOT col_exists THEN
      table_name  := t_name;
      column_name := c_name;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.schema_preflight_check_columns(jsonb) IS
  'Given a JSON array of {table_name, column_name} pairs, returns the subset '
  'whose columns do not exist in the public schema. '
  'Empty result = all columns present = preflight passes.';

-- -------------------------------------------------------------------------
-- Permissions: service_role only
-- -------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.schema_preflight_get_latest_migration() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.schema_preflight_check_columns(jsonb)   FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.schema_preflight_get_latest_migration() TO service_role;
GRANT EXECUTE ON FUNCTION public.schema_preflight_check_columns(jsonb)   TO service_role;
