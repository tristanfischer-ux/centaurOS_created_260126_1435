/**
 * Migration: Debug policies helper + Phase 2 profile RPCs
 *
 * Purpose:
 * The profiles table REST endpoint is broken (42P17 infinite recursion)
 * despite having non-recursive USING (true) policies. This appears to be
 * a persistent PostgREST/Supabase cache issue that NOTIFY pgrst reload
 * does not fix.
 *
 * Instead of fighting the cache, we bypass the REST endpoint entirely:
 * 1. get_own_profile() - SECURITY DEFINER RPC that returns the
 *    authenticated user's profile. Replaces all SELECT queries.
 * 2. update_own_profile(data jsonb) - SECURITY DEFINER RPC that updates
 *    the authenticated user's profile. Replaces all UPDATE queries.
 * 3. debug_profiles_policies() - Diagnostic function to verify policies.
 *
 * Security:
 * - Both RPCs verify auth.uid() matches the profile being accessed
 * - SECURITY DEFINER bypasses the broken RLS path
 * - Same access control as the original policies, just enforced in SQL
 *
 * Rollback:
 * - DROP FUNCTION IF EXISTS public.get_own_profile();
 * - DROP FUNCTION IF EXISTS public.update_own_profile(jsonb);
 * - DROP FUNCTION IF EXISTS public.debug_profiles_policies();
 */

-- =====================================================================
-- 1. Diagnostic: see what policies are active
-- =====================================================================

CREATE OR REPLACE FUNCTION public.debug_profiles_policies()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', policyname,
    'cmd', cmd,
    'qual', qual,
    'with_check', with_check
  )), '[]'::jsonb)
  FROM pg_policies
  WHERE tablename = 'profiles' AND schemaname = 'public';
$$;

GRANT EXECUTE ON FUNCTION public.debug_profiles_policies() TO authenticated;

-- =====================================================================
-- 2. get_own_profile() - Read the authenticated user's profile
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_own_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_result jsonb;
BEGIN
  -- AUTH: Only the authenticated user can read their own profile
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  SELECT jsonb_build_object(
    'id', p.id,
    'email', p.email,
    'full_name', p.full_name,
    'role', p.role,
    'foundry_id', p.foundry_id,
    'active_foundry_id', p.active_foundry_id,
    'account_type', p.account_type,
    'onboarding_data', p.onboarding_data,
    'avatar_url', p.avatar_url,
    'bio', p.bio,
    'phone', p.phone,
    'location', p.location,
    'expertise', p.expertise,
    'linkedin_url', p.linkedin_url,
    'website_url', p.website_url,
    'created_at', p.created_at,
    'updated_at', p.updated_at
  )
  INTO v_result
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF v_result IS NULL THEN
    RETURN jsonb_build_object('error', 'Profile not found');
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_own_profile() TO authenticated;

COMMENT ON FUNCTION public.get_own_profile()
IS 'Returns the authenticated user''s profile as JSONB. Bypasses RLS via SECURITY DEFINER.';

-- =====================================================================
-- 3. update_own_profile(data jsonb) - Update the authenticated user's profile
-- =====================================================================

CREATE OR REPLACE FUNCTION public.update_own_profile(data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_updated_count int;
BEGIN
  -- AUTH: Only the authenticated user can update their own profile
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  -- SECURITY: Only allow updating specific safe fields
  -- Never allow changing: id, email, role, foundry_id, account_type
  UPDATE public.profiles
  SET
    full_name          = COALESCE(data->>'full_name', full_name),
    bio                = COALESCE(data->>'bio', bio),
    phone              = COALESCE(data->>'phone', phone),
    location           = COALESCE(data->>'location', location),
    expertise          = COALESCE(data->>'expertise', expertise),
    linkedin_url       = COALESCE(data->>'linkedin_url', linkedin_url),
    website_url        = COALESCE(data->>'website_url', website_url),
    avatar_url         = COALESCE(data->>'avatar_url', avatar_url),
    onboarding_data    = CASE WHEN data ? 'onboarding_data' THEN data->'onboarding_data' ELSE onboarding_data END,
    updated_at         = now()
  WHERE id = v_user_id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count = 0 THEN
    RETURN jsonb_build_object('error', 'Profile not found');
  END IF;

  -- Return the updated profile
  RETURN (SELECT public.get_own_profile());
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_own_profile(jsonb) TO authenticated;

COMMENT ON FUNCTION public.update_own_profile(jsonb)
IS 'Updates the authenticated user''s profile with provided fields. Only safe fields can be changed. Returns the updated profile.';

-- =====================================================================
-- 4. get_profile_by_id(target_id uuid) - Read any profile (for team views)
-- Equivalent to the SELECT USING (true) policy
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_profile_by_id(target_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_result jsonb;
BEGIN
  -- AUTH: Must be authenticated
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  SELECT jsonb_build_object(
    'id', p.id,
    'email', p.email,
    'full_name', p.full_name,
    'role', p.role,
    'foundry_id', p.foundry_id,
    'active_foundry_id', p.active_foundry_id,
    'account_type', p.account_type,
    'avatar_url', p.avatar_url,
    'bio', p.bio,
    'phone', p.phone,
    'location', p.location,
    'expertise', p.expertise,
    'linkedin_url', p.linkedin_url,
    'website_url', p.website_url,
    'created_at', p.created_at,
    'updated_at', p.updated_at
  )
  INTO v_result
  FROM public.profiles p
  WHERE p.id = target_id;

  IF v_result IS NULL THEN
    RETURN jsonb_build_object('error', 'Profile not found');
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_profile_by_id(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_profile_by_id(uuid)
IS 'Returns any profile by user ID. Requires authentication. Bypasses broken RLS on profiles table.';

-- =====================================================================
-- 5. get_profiles_by_foundry(target_foundry_id text) - Team views
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_profiles_by_foundry(target_foundry_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_result jsonb;
BEGIN
  -- AUTH: Must be authenticated
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'email', p.email,
    'full_name', p.full_name,
    'role', p.role,
    'foundry_id', p.foundry_id,
    'active_foundry_id', p.active_foundry_id,
    'account_type', p.account_type,
    'avatar_url', p.avatar_url,
    'bio', p.bio,
    'location', p.location,
    'expertise', p.expertise,
    'created_at', p.created_at,
    'updated_at', p.updated_at
  )), '[]'::jsonb)
  INTO v_result
  FROM public.profiles p
  WHERE p.foundry_id = target_foundry_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_profiles_by_foundry(text) TO authenticated;

COMMENT ON FUNCTION public.get_profiles_by_foundry(text)
IS 'Returns all profiles for a given foundry. Requires authentication. Bypasses broken RLS on profiles table.';
