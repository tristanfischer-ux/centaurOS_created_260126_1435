/**
 * Repair migration: Re-add company_profile column
 *
 * The original migration 20260207100000_add_company_profile was recorded
 * as applied but the SQL never executed. This repair migration re-applies
 * the schema change using IF NOT EXISTS to be idempotent.
 */

-- Add company_profile JSONB column to foundries table
ALTER TABLE foundries
ADD COLUMN IF NOT EXISTS company_profile JSONB DEFAULT NULL;

COMMENT ON COLUMN foundries.company_profile IS 'Structured company context for AI recommendations. Schema: { employee_count, revenue_range, funding_status, seeking_funding, founded_year, location, website, business_model, updatedAt, updatedBy }';

-- RPC function to update company profile (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION update_company_profile(
    p_foundry_id TEXT,
    p_company_profile JSONB
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
        RAISE EXCEPTION 'Only active founders can update company profile';
    END IF;

    -- Ensure the foundry row exists
    INSERT INTO foundries (id, name)
    VALUES (p_foundry_id, COALESCE(v_profile.full_name || '''s Foundry', 'My Foundry'))
    ON CONFLICT (id) DO NOTHING;

    -- Update company_profile
    UPDATE foundries
    SET company_profile = p_company_profile
    WHERE id = p_foundry_id;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count = 0 THEN
        RAISE EXCEPTION 'Failed to update foundry %', p_foundry_id;
    END IF;

    SELECT company_profile INTO v_result
    FROM foundries
    WHERE id = p_foundry_id;

    RETURN v_result;
END;
$$;

-- Update ensure_foundry_exists to also return company_profile
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

    SELECT id, full_name, foundry_id INTO v_profile
    FROM profiles
    WHERE id = v_user_id
      AND foundry_id = p_foundry_id
      AND is_active = true;

    IF v_profile.id IS NULL THEN
        RAISE EXCEPTION 'User does not belong to this foundry';
    END IF;

    INSERT INTO foundries (id, name)
    VALUES (p_foundry_id, COALESCE(v_profile.full_name || '''s Foundry', 'My Foundry'))
    ON CONFLICT (id) DO NOTHING;

    SELECT id, name, purpose_data, company_profile INTO v_foundry
    FROM foundries
    WHERE id = p_foundry_id;

    RETURN jsonb_build_object(
        'id', v_foundry.id,
        'name', v_foundry.name,
        'purpose_data', v_foundry.purpose_data,
        'company_profile', v_foundry.company_profile
    );
END;
$$;
