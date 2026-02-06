-- Fix: add verification that the update actually affected a row
CREATE OR REPLACE FUNCTION update_foundry_purpose(
    p_foundry_id TEXT,
    p_purpose_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_profile RECORD;
    v_result JSONB;
    v_row_count INT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT id, role, foundry_id INTO v_profile
    FROM profiles
    WHERE id = v_user_id
      AND foundry_id = p_foundry_id
      AND role = 'Founder'
      AND is_active = true;

    IF v_profile.id IS NULL THEN
        RAISE EXCEPTION 'Only active founders can update company purpose';
    END IF;

    -- Perform the update
    UPDATE foundries
    SET purpose_data = p_purpose_data
    WHERE id = p_foundry_id;

    -- Check if the update actually affected a row
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count = 0 THEN
        RAISE EXCEPTION 'Foundry % not found in foundries table', p_foundry_id;
    END IF;

    -- Verify the data was persisted
    SELECT purpose_data INTO v_result
    FROM foundries
    WHERE id = p_foundry_id;

    IF v_result IS NULL THEN
        RAISE EXCEPTION 'Update succeeded but purpose_data is still null for foundry %', p_foundry_id;
    END IF;

    RETURN v_result;
END;
$$;
