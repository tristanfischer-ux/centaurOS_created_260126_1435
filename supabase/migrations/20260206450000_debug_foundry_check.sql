-- Diagnostic function: check if foundry row exists (bypasses RLS)
-- DELETE THIS AFTER DEBUGGING
CREATE OR REPLACE FUNCTION debug_check_foundry(p_foundry_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_row RECORD;
    v_count INT;
BEGIN
    -- Count all foundries
    SELECT count(*) INTO v_count FROM foundries;
    
    -- Try to find the specific foundry
    SELECT id, name, purpose_data IS NOT NULL as has_purpose
    INTO v_row
    FROM foundries
    WHERE id = p_foundry_id;
    
    IF v_row IS NULL THEN
        -- Row doesn't exist - try to insert it
        INSERT INTO foundries (id, name) VALUES (p_foundry_id, 'Forge Foundry');
        
        RETURN jsonb_build_object(
            'exists', false,
            'total_foundries', v_count,
            'action', 'inserted',
            'message', 'Row was missing - created it now'
        );
    ELSE
        RETURN jsonb_build_object(
            'exists', true,
            'id', v_row.id,
            'name', v_row.name,
            'has_purpose', v_row.has_purpose,
            'total_foundries', v_count
        );
    END IF;
END;
$$;
