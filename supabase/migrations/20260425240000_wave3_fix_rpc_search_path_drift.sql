/**
 * Wave 3 cleanup: re-apply correct search_path = public on 3 drifted RPCs.
 *
 * Problem: deployed function bodies had search_path='' (set by security advisor
 * migration 20260218140000), but the bodies reference unqualified table names
 * ('profiles', 'foundries'). With empty search_path Postgres raises
 * "relation 'profiles' does not exist" on every call.
 *
 * Root cause: a later migration (20260219230000_fix_all_rpc_search_paths.sql)
 * blanket-set search_path='' on all public functions, overwriting the correct
 * search_path=public that 20260218190001 had set.
 *
 * Fix: re-apply the three functions from 20260218190001 with search_path=public
 * and fully-qualified public.profiles / public.foundries references.
 *
 * Functions fixed:
 *   - ensure_foundry_exists(TEXT)
 *   - update_foundry_purpose(TEXT, JSONB)
 *   - update_company_profile(TEXT, JSONB)
 *
 * Applied to production via Supabase MCP (Wave 3 cleanup, 2026-04-25).
 * Idempotent: CREATE OR REPLACE is safe to re-run.
 */

-- =============================================================================
-- 1. update_foundry_purpose(TEXT, JSONB)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_foundry_purpose(
    p_foundry_id TEXT,
    p_purpose_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    FROM public.profiles
    WHERE id = v_user_id
      AND foundry_id = p_foundry_id
      AND role = 'Founder'
      AND is_active = true;

    IF v_profile.id IS NULL THEN
        RAISE EXCEPTION 'Only active founders can update company purpose';
    END IF;

    -- Ensure the foundry row exists (some foundries are referenced but have no row)
    INSERT INTO public.foundries (id, name)
    VALUES (p_foundry_id, COALESCE(v_profile.full_name || '''s Foundry', 'My Foundry'))
    ON CONFLICT (id) DO NOTHING;

    -- Now update purpose_data
    UPDATE public.foundries
    SET purpose_data = p_purpose_data
    WHERE id = p_foundry_id;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count = 0 THEN
        RAISE EXCEPTION 'Failed to update foundry %', p_foundry_id;
    END IF;

    SELECT purpose_data INTO v_result
    FROM public.foundries
    WHERE id = p_foundry_id;

    RETURN v_result;
END;
$$;

-- =============================================================================
-- 2. ensure_foundry_exists(TEXT)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.ensure_foundry_exists(p_foundry_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    FROM public.profiles
    WHERE id = v_user_id
      AND foundry_id = p_foundry_id
      AND is_active = true;

    IF v_profile.id IS NULL THEN
        RAISE EXCEPTION 'User does not belong to this foundry';
    END IF;

    INSERT INTO public.foundries (id, name)
    VALUES (p_foundry_id, COALESCE(v_profile.full_name || '''s Foundry', 'My Foundry'))
    ON CONFLICT (id) DO NOTHING;

    SELECT id, name, purpose_data, company_profile INTO v_foundry
    FROM public.foundries
    WHERE id = p_foundry_id;

    RETURN jsonb_build_object(
        'id', v_foundry.id,
        'name', v_foundry.name,
        'purpose_data', v_foundry.purpose_data,
        'company_profile', v_foundry.company_profile
    );
END;
$$;

-- =============================================================================
-- 3. update_company_profile(TEXT, JSONB)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_company_profile(
    p_foundry_id TEXT,
    p_company_profile JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    FROM public.profiles
    WHERE id = v_user_id
      AND foundry_id = p_foundry_id
      AND role = 'Founder'
      AND is_active = true;

    IF v_profile.id IS NULL THEN
        RAISE EXCEPTION 'Only active founders can update company profile';
    END IF;

    -- Ensure the foundry row exists
    INSERT INTO public.foundries (id, name)
    VALUES (p_foundry_id, COALESCE(v_profile.full_name || '''s Foundry', 'My Foundry'))
    ON CONFLICT (id) DO NOTHING;

    -- Update company_profile
    UPDATE public.foundries
    SET company_profile = p_company_profile
    WHERE id = p_foundry_id;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count = 0 THEN
        RAISE EXCEPTION 'Failed to update foundry %', p_foundry_id;
    END IF;

    SELECT company_profile INTO v_result
    FROM public.foundries
    WHERE id = p_foundry_id;

    RETURN v_result;
END;
$$;
