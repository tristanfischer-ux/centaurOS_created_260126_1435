/**
 * Migration: Add repair_user_profile RPC + drop stale profiles policy
 *
 * Purpose:
 * 1) Drop the leftover "users_can_view_shared_foundry_profiles" SELECT policy
 *    that was never cleaned up. It calls can_access_profile() which queries
 *    foundry_memberships — potentially causing errors for users without
 *    memberships. The canonical "profiles_select_authenticated" policy already
 *    grants all authenticated users SELECT access, so this leftover is
 *    unnecessary and harmful.
 *
 * 2) Create a SECURITY DEFINER function that repairs a user's profile when
 *    their foundry_id is missing. This is called via .rpc() from the regular
 *    client and bypasses all RLS — necessary because the admin/service_role
 *    key is currently disabled (legacy key).
 *
 * Security:
 * - repair_user_profile() verifies auth.uid() matches the target user.
 * - SECURITY DEFINER bypasses RLS but the function enforces its own guards.
 * - Only modifies the authenticated user's own profile.
 *
 * Rollback:
 * - DROP FUNCTION IF EXISTS public.repair_user_profile();
 * - Recreate the dropped policy if needed (not recommended).
 */

-- 1) Clean up the leftover policy that was never dropped
DROP POLICY IF EXISTS "users_can_view_shared_foundry_profiles" ON public.profiles;

-- Also drop the insert/update policies from the same migration that were
-- superseded by the 20260216300000 policies
DROP POLICY IF EXISTS "users_can_insert_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "users_can_update_own_profile" ON public.profiles;

-- 2) Create the repair function
CREATE OR REPLACE FUNCTION public.repair_user_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_profile record;
  v_role text;
  v_display_name text;
  v_foundry_id text;
  v_foundry_exists boolean;
BEGIN
  -- AUTH: Only the authenticated user can repair their own profile
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  -- Read current profile (bypasses RLS via SECURITY DEFINER)
  SELECT id, foundry_id, role, full_name, email, account_type
  INTO v_profile
  FROM public.profiles
  WHERE id = v_user_id;

  -- If no profile exists, create one
  IF NOT FOUND THEN
    -- Get role from auth metadata
    v_role := COALESCE(
      (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = v_user_id),
      'Apprentice'
    );
    v_display_name := COALESCE(
      (SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = v_user_id),
      (SELECT email FROM auth.users WHERE id = v_user_id),
      'User'
    );

    -- Create foundry based on role
    IF v_role = 'Founder' THEN
      v_foundry_id := 'foundry-' || substr(v_user_id::text, 1, 8) || '-' || extract(epoch from now())::bigint::text;
      INSERT INTO public.foundries (id, name, slug, owner_id)
      VALUES (v_foundry_id, v_display_name || '''s Foundry', v_foundry_id, v_user_id)
      ON CONFLICT (id) DO NOTHING;
    ELSE
      v_foundry_id := 'forge-guild';
      INSERT INTO public.foundries (id, name, slug, owner_id)
      VALUES (v_foundry_id, 'ForgeOS Guild', v_foundry_id, v_user_id)
      ON CONFLICT (id) DO NOTHING;
    END IF;

    -- Create profile
    INSERT INTO public.profiles (id, email, full_name, role, foundry_id, active_foundry_id, account_type)
    VALUES (
      v_user_id,
      COALESCE((SELECT email FROM auth.users WHERE id = v_user_id), ''),
      v_display_name,
      v_role,
      v_foundry_id,
      v_foundry_id,
      'team_builder'
    );

    -- Create membership
    INSERT INTO public.foundry_memberships (user_id, foundry_id, role, is_primary, joined_at)
    VALUES (v_user_id, v_foundry_id, v_role, true, now())
    ON CONFLICT (user_id, foundry_id) DO NOTHING;

    RETURN jsonb_build_object('success', true, 'foundry_id', v_foundry_id, 'action', 'created');
  END IF;

  -- Profile exists but check if foundry_id is valid
  IF v_profile.foundry_id IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM public.foundries WHERE id = v_profile.foundry_id)
    INTO v_foundry_exists;

    IF v_foundry_exists THEN
      -- Foundry exists, just ensure membership
      INSERT INTO public.foundry_memberships (user_id, foundry_id, role, is_primary, joined_at)
      VALUES (v_user_id, v_profile.foundry_id, COALESCE(v_profile.role, 'Apprentice'), true, now())
      ON CONFLICT (user_id, foundry_id) DO NOTHING;

      RETURN jsonb_build_object('success', true, 'foundry_id', v_profile.foundry_id, 'action', 'verified');
    END IF;
  END IF;

  -- foundry_id is null or points to non-existent foundry — assign one
  v_role := COALESCE(v_profile.role, 'Apprentice');
  v_display_name := COALESCE(v_profile.full_name, 'My Company');

  IF v_role = 'Founder' THEN
    v_foundry_id := 'foundry-' || substr(v_user_id::text, 1, 8) || '-' || extract(epoch from now())::bigint::text;
    INSERT INTO public.foundries (id, name, slug, owner_id)
    VALUES (v_foundry_id, v_display_name || '''s Foundry', v_foundry_id, v_user_id)
    ON CONFLICT (id) DO NOTHING;
  ELSE
    v_foundry_id := 'forge-guild';
    INSERT INTO public.foundries (id, name, slug, owner_id)
    VALUES (v_foundry_id, 'ForgeOS Guild', v_foundry_id, v_user_id)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Update profile with the valid foundry
  UPDATE public.profiles
  SET foundry_id = v_foundry_id,
      active_foundry_id = v_foundry_id,
      updated_at = now()
  WHERE id = v_user_id;

  -- Ensure membership
  INSERT INTO public.foundry_memberships (user_id, foundry_id, role, is_primary, joined_at)
  VALUES (v_user_id, v_foundry_id, v_role, true, now())
  ON CONFLICT (user_id, foundry_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'foundry_id', v_foundry_id, 'action', 'repaired');
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.repair_user_profile() TO authenticated;

COMMENT ON FUNCTION public.repair_user_profile()
IS 'Self-service profile repair. Assigns or creates a valid foundry for the authenticated user when foundry_id is missing or invalid.';
