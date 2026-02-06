-- Fix: ensure the foundry row exists before updating purpose_data
-- Some foundries are referenced by profiles but have no row in the foundries table
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

    SELECT id, role, foundry_id, full_name INTO v_profile
    FROM profiles
    WHERE id = v_user_id
      AND foundry_id = p_foundry_id
      AND role = 'Founder'
      AND is_active = true;

    IF v_profile.id IS NULL THEN
        RAISE EXCEPTION 'Only active founders can update company purpose';
    END IF;

    -- Ensure the foundry row exists (some foundries are referenced but have no row)
    INSERT INTO foundries (id, name)
    VALUES (p_foundry_id, COALESCE(v_profile.full_name || '''s Foundry', 'My Foundry'))
    ON CONFLICT (id) DO NOTHING;

    -- Now update purpose_data
    UPDATE foundries
    SET purpose_data = p_purpose_data
    WHERE id = p_foundry_id;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count = 0 THEN
        RAISE EXCEPTION 'Failed to update foundry %', p_foundry_id;
    END IF;

    SELECT purpose_data INTO v_result
    FROM foundries
    WHERE id = p_foundry_id;

    RETURN v_result;
END;
$$;

-- Also create a simple function to ensure a foundry exists (for page loads)
CREATE OR REPLACE FUNCTION ensure_foundry_exists(p_foundry_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_profile RECORD;
    v_foundry RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Verify caller belongs to this foundry
    SELECT id, full_name, foundry_id INTO v_profile
    FROM profiles
    WHERE id = v_user_id
      AND foundry_id = p_foundry_id
      AND is_active = true;

    IF v_profile.id IS NULL THEN
        RAISE EXCEPTION 'User does not belong to this foundry';
    END IF;

    -- Ensure foundry row exists
    INSERT INTO foundries (id, name)
    VALUES (p_foundry_id, COALESCE(v_profile.full_name || '''s Foundry', 'My Foundry'))
    ON CONFLICT (id) DO NOTHING;

    -- Return the foundry data
    SELECT id, name, purpose_data INTO v_foundry
    FROM foundries
    WHERE id = p_foundry_id;

    RETURN jsonb_build_object(
        'id', v_foundry.id,
        'name', v_foundry.name,
        'purpose_data', v_foundry.purpose_data
    );
END;
$$;
