-- Fix: foundry IDs are TEXT not UUID (e.g. "test-foundry-001")
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

    UPDATE foundries
    SET purpose_data = p_purpose_data
    WHERE id = p_foundry_id;

    SELECT purpose_data INTO v_result
    FROM foundries
    WHERE id = p_foundry_id;

    RETURN v_result;
END;
$$;
