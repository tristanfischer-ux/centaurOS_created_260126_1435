/**
 * Migration: Add RPC function for updating foundry purpose
 * 
 * Purpose: Provides a SECURITY DEFINER function that bypasses RLS to update
 * the purpose_data column on foundries. This avoids the need for a service role
 * key (admin client) in server actions. The function verifies that the caller
 * owns the foundry and has the Founder role before updating.
 * 
 * Security:
 * - Checks auth.uid() matches a profile that belongs to the target foundry
 * - Checks that the caller has 'Founder' role
 * - SECURITY DEFINER runs as the function owner (bypasses RLS safely)
 * 
 * Related:
 * - Action: src/actions/foundry.ts (updateFoundryPurpose)
 * - Migration: 20260205120000_add_foundry_purpose.sql (adds column)
 * 
 * Rollback: DROP FUNCTION IF EXISTS update_foundry_purpose(UUID, JSONB);
 */

CREATE OR REPLACE FUNCTION update_foundry_purpose(
    p_foundry_id UUID,
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
    -- AUTH: Get the authenticated user
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- AUTH: Verify caller belongs to this foundry and is a Founder
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

    -- Return the updated purpose_data
    SELECT purpose_data INTO v_result
    FROM foundries
    WHERE id = p_foundry_id;

    RETURN v_result;
END;
$$;
