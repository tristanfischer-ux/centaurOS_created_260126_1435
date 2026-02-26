-- Migration: Add increment_sync_version RPC and widen sheet_tab_gid to text
--
-- INTENT: The current incrementSyncVersion in sync-engine.ts is a read-modify-write
-- in application code, which is racy under concurrent sync. This RPC uses SELECT ... FOR UPDATE
-- to provide an atomic increment. Widening sheet_tab_gid to text supports Excel Online's
-- string-based worksheet IDs natively.

-- ============================================================
-- 1. Atomic sync version increment RPC
-- ============================================================

CREATE OR REPLACE FUNCTION increment_sync_version(
    p_foundry_id uuid,
    p_service_type text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_config jsonb;
    v_current integer;
    v_new integer;
BEGIN
    -- SECURITY: Row-level lock prevents concurrent increments
    SELECT config INTO v_config
    FROM foundry_integrations
    WHERE foundry_id = p_foundry_id
      AND service_type = p_service_type
    FOR UPDATE;

    IF v_config IS NULL THEN
        RAISE EXCEPTION 'No integration found for foundry % / %', p_foundry_id, p_service_type;
    END IF;

    v_current := COALESCE((v_config ->> 'sync_version')::integer, 0);
    v_new := v_current + 1;

    UPDATE foundry_integrations
    SET config = jsonb_set(v_config, '{sync_version}', to_jsonb(v_new))
    WHERE foundry_id = p_foundry_id
      AND service_type = p_service_type;

    RETURN v_new;
END;
$$;

-- ============================================================
-- 2. Widen sheet_tab_gid from integer to text
-- ============================================================

ALTER TABLE sheets_row_map
    ALTER COLUMN sheet_tab_gid TYPE text USING sheet_tab_gid::text;
