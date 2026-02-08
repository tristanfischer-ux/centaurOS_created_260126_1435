/**
 * Migration: Allow users to create their own foundry from within the platform
 * 
 * Purpose: Enables Apprentices and Executives to start their own business
 * without re-registering. They keep their Guild membership (dual membership)
 * and gain a new foundry where they are the Founder.
 * 
 * Security:
 * - Only authenticated users can create foundries
 * - Users must provide a non-empty company name
 * - Slug uniqueness enforced via UNIQUE constraint on foundries.slug
 * - Rate limited: users can own at most 3 foundries
 * 
 * Related:
 * - src/actions/foundry.ts - createFoundry() server action
 * - src/components/foundry/create-foundry-dialog.tsx - UI wizard
 * - supabase/migrations/20260206400000_multi_foundry_support.sql - Multi-foundry infra
 * 
 * Rollback: DROP FUNCTION IF EXISTS create_user_foundry(uuid, text, text, text);
 */

-- RPC function: Create a new foundry for an authenticated user
-- Returns the created foundry's ID and slug
CREATE OR REPLACE FUNCTION create_user_foundry(
  p_user_id UUID,
  p_company_name TEXT,
  p_industry TEXT DEFAULT NULL,
  p_stage TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_foundry_id UUID;
  v_slug TEXT;
  v_base_slug TEXT;
  v_owned_count INT;
BEGIN
  -- AUTH: Verify the caller is the user (prevents IDOR)
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: can only create foundry for yourself';
  END IF;

  -- VALIDATION: Company name is required and must be non-empty
  IF p_company_name IS NULL OR trim(p_company_name) = '' THEN
    RAISE EXCEPTION 'Company name is required';
  END IF;

  -- SECURITY: Rate limit - users can own at most 3 foundries
  SELECT COUNT(*) INTO v_owned_count
  FROM foundries
  WHERE owner_id = p_user_id;

  IF v_owned_count >= 3 THEN
    RAISE EXCEPTION 'You can own a maximum of 3 businesses';
  END IF;

  -- Generate UUID for the new foundry
  v_foundry_id := gen_random_uuid();

  -- Generate slug from company name
  v_base_slug := lower(regexp_replace(trim(p_company_name), '[^a-z0-9]+', '-', 'gi'));
  v_base_slug := trim(BOTH '-' FROM v_base_slug);
  v_base_slug := left(v_base_slug, 50);
  v_slug := v_base_slug || '-' || left(v_foundry_id::text, 6);

  -- 1. Create the foundry record
  INSERT INTO foundries (id, name, slug, industry, stage, owner_id, created_at, updated_at)
  VALUES (
    v_foundry_id::text,
    trim(p_company_name),
    v_slug,
    p_industry,
    p_stage,
    p_user_id,
    now(),
    now()
  );

  -- 2. Create foundry_membership with role 'Founder'
  INSERT INTO foundry_memberships (user_id, foundry_id, role, is_primary, joined_at)
  VALUES (
    p_user_id,
    v_foundry_id::text,
    'Founder',
    false,  -- Keep existing primary foundry unchanged
    now()
  );

  -- 3. Switch user's active foundry to the new one
  UPDATE profiles
  SET active_foundry_id = v_foundry_id::text,
      updated_at = now()
  WHERE id = p_user_id;

  -- AUDIT: Log the foundry creation
  RAISE NOTICE 'Foundry created: id=%, name=%, owner=%', v_foundry_id, p_company_name, p_user_id;

  RETURN jsonb_build_object(
    'foundry_id', v_foundry_id::text,
    'slug', v_slug,
    'name', trim(p_company_name)
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION create_user_foundry(UUID, TEXT, TEXT, TEXT) TO authenticated;
