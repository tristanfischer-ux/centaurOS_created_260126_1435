/**
 * Migration: Fix repair_user_profile RPC — cast role text to member_role enum.
 *
 * The prior migration (20260325400000) cast account_type but not role.
 * profiles.role and foundry_memberships.role are both member_role enum,
 * so text values ('Founder','Executive','Apprentice') from auth metadata
 * raise 42804 (datatype_mismatch). Fix: explicit ::member_role casts.
 *
 * Observed error from a freshly-signed-up user calling repairProfile():
 *   code=42804 msg=column "role" is of type member_role but expression is of type text
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
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  SELECT id, foundry_id, role, full_name, email, account_type
  INTO v_profile
  FROM public.profiles
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    v_role := COALESCE(
      (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = v_user_id),
      'Apprentice'
    );
    v_display_name := COALESCE(
      (SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = v_user_id),
      (SELECT email FROM auth.users WHERE id = v_user_id),
      'User'
    );

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

    INSERT INTO public.profiles (id, email, full_name, role, foundry_id, active_foundry_id, account_type)
    VALUES (
      v_user_id,
      COALESCE((SELECT email FROM auth.users WHERE id = v_user_id), ''),
      v_display_name,
      v_role::member_role,
      v_foundry_id,
      v_foundry_id,
      'team_builder'::account_type
    );

    INSERT INTO public.foundry_memberships (user_id, foundry_id, role, is_primary, joined_at)
    VALUES (v_user_id, v_foundry_id, v_role::member_role, true, now())
    ON CONFLICT (user_id, foundry_id) DO NOTHING;

    RETURN jsonb_build_object('success', true, 'foundry_id', v_foundry_id, 'action', 'created');
  END IF;

  IF v_profile.foundry_id IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM public.foundries WHERE id = v_profile.foundry_id)
    INTO v_foundry_exists;

    IF v_foundry_exists THEN
      INSERT INTO public.foundry_memberships (user_id, foundry_id, role, is_primary, joined_at)
      VALUES (v_user_id, v_profile.foundry_id, COALESCE(v_profile.role::text, 'Apprentice')::member_role, true, now())
      ON CONFLICT (user_id, foundry_id) DO NOTHING;

      RETURN jsonb_build_object('success', true, 'foundry_id', v_profile.foundry_id, 'action', 'verified');
    END IF;
  END IF;

  v_role := COALESCE(v_profile.role::text, 'Apprentice');
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

  UPDATE public.profiles
  SET foundry_id = v_foundry_id,
      active_foundry_id = v_foundry_id,
      updated_at = now()
  WHERE id = v_user_id;

  INSERT INTO public.foundry_memberships (user_id, foundry_id, role, is_primary, joined_at)
  VALUES (v_user_id, v_foundry_id, v_role::member_role, true, now())
  ON CONFLICT (user_id, foundry_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'foundry_id', v_foundry_id, 'action', 'repaired');
END;
$$;
