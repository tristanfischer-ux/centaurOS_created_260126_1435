-- ============================================================
-- ForgeOS: RPC function to update foundry sector
-- Migration: 20260212400003_update_foundry_sector_rpc
-- ============================================================
-- SECURITY DEFINER function so authenticated users can update
-- their own foundry's sector without needing broad UPDATE on foundries.
-- Validates: auth, foundry ownership, Founder role, sector value.

CREATE OR REPLACE FUNCTION update_foundry_sector(
  p_foundry_id UUID,
  p_sector TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_user_foundry_id UUID;
BEGIN
  -- AUTH: Get the current authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- AUTH: Verify user is a Founder in the target foundry
  SELECT role, foundry_id INTO v_user_role, v_user_foundry_id
  FROM profiles
  WHERE id = v_user_id;

  IF v_user_foundry_id IS DISTINCT FROM p_foundry_id THEN
    RAISE EXCEPTION 'Cannot update sector for a different foundry';
  END IF;

  IF v_user_role != 'Founder' THEN
    RAISE EXCEPTION 'Only founders can update sector';
  END IF;

  -- VALIDATION: sector must be NULL or a valid value (constraint on column handles this)
  UPDATE foundries
  SET sector = p_sector
  WHERE id = p_foundry_id;
END;
$$;
