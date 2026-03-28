/**
 * Migration: Fix repair_user_profile RPC type mismatch (42804)
 *
 * The RPC inserts 'team_builder' as a text literal into the account_type
 * enum column. PostgreSQL 42804 error occurs when the implicit text→enum
 * cast fails. Fix: explicitly cast to the account_type enum.
 *
 * Also handles the case where the profile already exists but foundry_id
 * points to the dummy 'delete-...' foundry from a soft-deleted user.
 */

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

    -- Create profile — explicit enum cast to avoid 42804
    INSERT INTO public.profiles (id, email, full_name, role, foundry_id, active_foundry_id, account_type)
    VALUES (
      v_user_id,
      COALESCE((SELECT email FROM auth.users WHERE id = v_user_id), ''),
      v_display_name,
      v_role,
      v_foundry_id,
      v_foundry_id,
      'team_builder'::account_type
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
