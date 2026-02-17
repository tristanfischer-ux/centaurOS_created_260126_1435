-- ═══════════════════════════════════════════════════════════════════════
-- Migration: Public Directory Access
--
-- Purpose: Enables unauthenticated (anon) read access to public expert
-- profiles for the /experts directory. This is the SEO-facing surface
-- area — Google and unauthenticated visitors can browse the directory.
--
-- Security:
--   - Only public-safe fields are exposed (no email, no stripe data)
--   - Only profiles where is_public = true AND is_active = true
--   - Read-only: anon can only SELECT, never INSERT/UPDATE/DELETE
--   - Service role continues to have full access
--   - Authenticated users retain existing policies unchanged
--
-- Related:
--   - src/actions/directory.ts — Server actions for directory queries
--   - src/app/(directory)/experts/ — Public directory pages
--   - supabase/migrations/20260130300000_executive_journey_features.sql
--
-- Rollback:
--   DROP POLICY IF EXISTS "Public read for directory experts" ON provider_profiles;
--   DROP POLICY IF EXISTS "Public read for directory profiles" ON profiles;
--   DROP POLICY IF EXISTS "Public read for directory ratings" ON provider_ratings;
--   DROP POLICY IF EXISTS "Public read for directory case studies" ON case_studies;
--   DROP POLICY IF EXISTS "Public read for directory certifications" ON provider_certifications;
--   DROP POLICY IF EXISTS "Public read for directory badges" ON provider_badges;
--   DROP FUNCTION IF EXISTS get_directory_experts;
--   DROP FUNCTION IF EXISTS get_directory_expert_by_slug;
--   DROP FUNCTION IF EXISTS get_directory_roles;
--   DROP FUNCTION IF EXISTS get_directory_locations;
-- ═══════════════════════════════════════════════════════════════════════


-- ═══ RPC: get_directory_experts ═══════════════════════════════════════
-- Returns public expert profiles for the directory browse page.
-- Runs as SECURITY DEFINER to bypass RLS — only returns safe fields.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_directory_experts(
    p_role TEXT DEFAULT NULL,
    p_location TEXT DEFAULT NULL,
    p_search TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    profile_slug TEXT,
    username TEXT,
    headline TEXT,
    bio TEXT,
    location TEXT,
    years_experience INTEGER,
    day_rate NUMERIC,
    hourly_rate NUMERIC,
    currency TEXT,
    tier TEXT,
    specializations TEXT[],
    industries TEXT[],
    company_stages TEXT[],
    is_verified BOOLEAN,
    profile_completeness INTEGER,
    user_name TEXT,
    user_avatar TEXT,
    average_rating NUMERIC,
    total_reviews INTEGER,
    total_transactions INTEGER,
    featured_until TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        pp.id,
        pp.profile_slug,
        pp.username,
        pp.headline,
        LEFT(pp.bio, 300) AS bio,
        pp.location,
        pp.years_experience,
        pp.day_rate,
        pp.hourly_rate,
        pp.currency,
        pp.tier::TEXT,
        pp.specializations,
        pp.industries,
        pp.company_stages,
        COALESCE(pp.tier IN ('verified', 'premium'), FALSE) AS is_verified,
        pp.profile_completeness,
        p.full_name AS user_name,
        p.avatar_url AS user_avatar,
        pr.average_rating,
        COALESCE(pr.total_reviews, 0)::INTEGER AS total_reviews,
        COALESCE(pr.total_transactions, 0)::INTEGER AS total_transactions,
        pp.featured_until
    FROM provider_profiles pp
    LEFT JOIN profiles p ON p.id = pp.user_id
    LEFT JOIN provider_ratings pr ON pr.provider_id = pp.id
    WHERE pp.is_public = TRUE
      AND pp.is_active = TRUE
      -- Role filter: match against headline or specializations
      AND (
          p_role IS NULL
          OR pp.headline ILIKE '%' || p_role || '%'
          OR EXISTS (
              SELECT 1 FROM unnest(pp.specializations) AS s
              WHERE s ILIKE '%' || p_role || '%'
          )
      )
      -- Location filter: match against location field
      AND (
          p_location IS NULL
          OR pp.location ILIKE '%' || p_location || '%'
      )
      -- Search filter: match against name, headline, bio, specializations
      AND (
          p_search IS NULL
          OR p.full_name ILIKE '%' || p_search || '%'
          OR pp.headline ILIKE '%' || p_search || '%'
          OR pp.bio ILIKE '%' || p_search || '%'
          OR EXISTS (
              SELECT 1 FROM unnest(pp.specializations) AS s
              WHERE s ILIKE '%' || p_search || '%'
          )
      )
    ORDER BY
        -- Featured profiles first (active featured_until)
        CASE WHEN pp.featured_until > NOW() THEN 0 ELSE 1 END,
        -- Then verified/premium tier
        CASE pp.tier
            WHEN 'premium' THEN 0
            WHEN 'verified' THEN 1
            WHEN 'standard' THEN 2
            ELSE 3
        END,
        -- Then by rating
        COALESCE(pr.average_rating, 0) DESC,
        -- Then by profile completeness
        COALESCE(pp.profile_completeness, 0) DESC,
        -- Finally by recency
        pp.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Grant execute to anon and authenticated
GRANT EXECUTE ON FUNCTION public.get_directory_experts TO anon;
GRANT EXECUTE ON FUNCTION public.get_directory_experts TO authenticated;


-- ═══ RPC: get_directory_expert_by_slug ════════════════════════════════
-- Returns a single expert's full public profile by slug.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_directory_expert_by_slug(
    p_slug TEXT
)
RETURNS TABLE (
    id UUID,
    profile_slug TEXT,
    username TEXT,
    headline TEXT,
    bio TEXT,
    video_url TEXT,
    video_thumbnail_url TEXT,
    linkedin_url TEXT,
    website_url TEXT,
    location TEXT,
    years_experience INTEGER,
    day_rate NUMERIC,
    hourly_rate NUMERIC,
    currency TEXT,
    timezone TEXT,
    tier TEXT,
    specializations TEXT[],
    industries TEXT[],
    company_stages TEXT[],
    is_verified BOOLEAN,
    profile_completeness INTEGER,
    accepts_trial BOOLEAN,
    trial_rate_discount INTEGER,
    minimum_engagement_hours INTEGER,
    user_name TEXT,
    user_avatar TEXT,
    average_rating NUMERIC,
    total_reviews INTEGER,
    total_transactions INTEGER,
    featured_until TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        pp.id,
        pp.profile_slug,
        pp.username,
        pp.headline,
        pp.bio,
        pp.video_url,
        pp.video_thumbnail_url,
        pp.linkedin_url,
        pp.website_url,
        pp.location,
        pp.years_experience,
        pp.day_rate,
        pp.hourly_rate,
        pp.currency,
        pp.timezone,
        pp.tier::TEXT,
        pp.specializations,
        pp.industries,
        pp.company_stages,
        COALESCE(pp.tier IN ('verified', 'premium'), FALSE) AS is_verified,
        pp.profile_completeness,
        pp.accepts_trial,
        pp.trial_rate_discount,
        pp.minimum_engagement_hours,
        p.full_name AS user_name,
        p.avatar_url AS user_avatar,
        pr.average_rating,
        COALESCE(pr.total_reviews, 0)::INTEGER AS total_reviews,
        COALESCE(pr.total_transactions, 0)::INTEGER AS total_transactions,
        pp.featured_until
    FROM provider_profiles pp
    LEFT JOIN profiles p ON p.id = pp.user_id
    LEFT JOIN provider_ratings pr ON pr.provider_id = pp.id
    WHERE pp.is_public = TRUE
      AND pp.is_active = TRUE
      AND (pp.profile_slug = p_slug OR pp.username = p_slug);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_directory_expert_by_slug TO anon;
GRANT EXECUTE ON FUNCTION public.get_directory_expert_by_slug TO authenticated;


-- ═══ RPC: get_directory_expert_case_studies ═══════════════════════════
-- Returns public case studies for a given expert.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_directory_expert_case_studies(
    p_provider_id UUID
)
RETURNS TABLE (
    id UUID,
    title TEXT,
    client_name TEXT,
    client_industry TEXT,
    company_stage TEXT,
    challenge TEXT,
    approach TEXT,
    outcome TEXT,
    metrics JSONB,
    testimonial_quote TEXT,
    testimonial_author TEXT,
    testimonial_role TEXT,
    engagement_type TEXT,
    hours_per_week INTEGER,
    is_featured BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        cs.id,
        cs.title,
        cs.client_name,
        cs.client_industry,
        cs.company_stage,
        cs.challenge,
        cs.approach,
        cs.outcome,
        cs.metrics,
        cs.testimonial_quote,
        cs.testimonial_author,
        cs.testimonial_role,
        cs.engagement_type,
        cs.hours_per_week,
        cs.is_featured
    FROM case_studies cs
    JOIN provider_profiles pp ON pp.id = cs.provider_id
    WHERE cs.provider_id = p_provider_id
      AND cs.is_public = TRUE
      AND pp.is_public = TRUE
      AND pp.is_active = TRUE
    ORDER BY cs.is_featured DESC, cs.display_order ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_directory_expert_case_studies TO anon;
GRANT EXECUTE ON FUNCTION public.get_directory_expert_case_studies TO authenticated;


-- ═══ RPC: get_directory_roles ═════════════════════════════════════════
-- Returns distinct role categories from active public profiles,
-- used to generate category pages and sitemap entries.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_directory_roles()
RETURNS TABLE (
    role_name TEXT,
    expert_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        LOWER(TRIM(s)) AS role_name,
        COUNT(DISTINCT pp.id) AS expert_count
    FROM provider_profiles pp,
         unnest(pp.specializations) AS s
    WHERE pp.is_public = TRUE
      AND pp.is_active = TRUE
      AND TRIM(s) <> ''
    GROUP BY LOWER(TRIM(s))
    HAVING COUNT(DISTINCT pp.id) >= 1
    ORDER BY expert_count DESC, role_name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_directory_roles TO anon;
GRANT EXECUTE ON FUNCTION public.get_directory_roles TO authenticated;


-- ═══ RPC: get_directory_locations ═════════════════════════════════════
-- Returns distinct locations from active public profiles,
-- used to generate long-tail pages and sitemap entries.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_directory_locations()
RETURNS TABLE (
    location_name TEXT,
    expert_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        LOWER(TRIM(pp.location)) AS location_name,
        COUNT(DISTINCT pp.id) AS expert_count
    FROM provider_profiles pp
    WHERE pp.is_public = TRUE
      AND pp.is_active = TRUE
      AND pp.location IS NOT NULL
      AND TRIM(pp.location) <> ''
    GROUP BY LOWER(TRIM(pp.location))
    HAVING COUNT(DISTINCT pp.id) >= 1
    ORDER BY expert_count DESC, location_name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_directory_locations TO anon;
GRANT EXECUTE ON FUNCTION public.get_directory_locations TO authenticated;


-- ═══ RPC: get_directory_expert_count ══════════════════════════════════
-- Returns total count of public experts (for pagination).
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_directory_expert_count(
    p_role TEXT DEFAULT NULL,
    p_location TEXT DEFAULT NULL,
    p_search TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(DISTINCT pp.id)::INTEGER INTO v_count
    FROM provider_profiles pp
    LEFT JOIN profiles p ON p.id = pp.user_id
    WHERE pp.is_public = TRUE
      AND pp.is_active = TRUE
      AND (
          p_role IS NULL
          OR pp.headline ILIKE '%' || p_role || '%'
          OR EXISTS (
              SELECT 1 FROM unnest(pp.specializations) AS s
              WHERE s ILIKE '%' || p_role || '%'
          )
      )
      AND (
          p_location IS NULL
          OR pp.location ILIKE '%' || p_location || '%'
      )
      AND (
          p_search IS NULL
          OR p.full_name ILIKE '%' || p_search || '%'
          OR pp.headline ILIKE '%' || p_search || '%'
          OR pp.bio ILIKE '%' || p_search || '%'
          OR EXISTS (
              SELECT 1 FROM unnest(pp.specializations) AS s
              WHERE s ILIKE '%' || p_search || '%'
          )
      );

    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_directory_expert_count TO anon;
GRANT EXECUTE ON FUNCTION public.get_directory_expert_count TO authenticated;
