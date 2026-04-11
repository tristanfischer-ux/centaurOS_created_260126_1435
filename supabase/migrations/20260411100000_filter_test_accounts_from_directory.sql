-- ═══════════════════════════════════════════════════════════════════════
-- Migration: Filter test/demo accounts from public directory
--
-- Purpose: Prevent test accounts (e.g. "E2E Test Executive",
-- "Tristan fjscher qa") from appearing in the public experts directory.
-- Adds WHERE clauses to exclude profiles whose full_name matches
-- common test patterns: %test%, %e2e%, ' qa', 'qa '.
-- ═══════════════════════════════════════════════════════════════════════


-- ═══ Filter get_directory_experts ══════════════════════════════════════

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
        COALESCE(pp.tier IN ('verified_partner', 'approved'), FALSE) AS is_verified,
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
      -- SECURITY: Filter out test/demo/QA accounts from public directory
      AND p.full_name NOT ILIKE '%test%'
      AND p.full_name NOT ILIKE '%e2e%'
      AND p.full_name NOT ILIKE '% qa%'
      AND p.full_name NOT ILIKE '%qa %'
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
      )
    ORDER BY
        CASE WHEN pp.featured_until > NOW() THEN 0 ELSE 1 END,
        CASE pp.tier
            WHEN 'verified_partner' THEN 0
            WHEN 'approved' THEN 1
            WHEN 'pending' THEN 2
            ELSE 3
        END,
        COALESCE(pr.average_rating, 0) DESC,
        COALESCE(pp.profile_completeness, 0) DESC,
        pp.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;


-- ═══ Filter get_directory_expert_by_slug ═══════════════════════════════

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
        COALESCE(pp.tier IN ('verified_partner', 'approved'), FALSE) AS is_verified,
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
      AND (pp.profile_slug = p_slug OR pp.username = p_slug)
      -- SECURITY: Filter out test/demo/QA accounts from public directory
      AND p.full_name NOT ILIKE '%test%'
      AND p.full_name NOT ILIKE '%e2e%'
      AND p.full_name NOT ILIKE '% qa%'
      AND p.full_name NOT ILIKE '%qa %';
END;
$$;
