-- ============================================================================
-- Migration: listing_executives_day_rate
-- Description: Adds day_rate (numeric) and currency (text, default 'GBP')
--              columns to listing_executives. Updates RPCs to handle
--              the new fields.
-- ============================================================================

-- ── Columns ───────────────────────────────────────────────────────────────

ALTER TABLE public.listing_executives
    ADD COLUMN IF NOT EXISTS day_rate NUMERIC,
    ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'GBP';

-- ── Update RPCs ───────────────────────────────────────────────────────────

-- DROP functions whose return types are changing (Postgres requires this)
DROP FUNCTION IF EXISTS public.get_listing_executives(UUID);
DROP FUNCTION IF EXISTS public.get_my_listing_executives();
-- DROP add/update too since their signatures (param lists) are changing
DROP FUNCTION IF EXISTS public.add_listing_executive(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT);
DROP FUNCTION IF EXISTS public.update_listing_executive(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT);

-- Get executives for a listing (public-safe, only active) — add day_rate + currency
CREATE OR REPLACE FUNCTION public.get_listing_executives(p_listing_id UUID)
RETURNS TABLE (
    id UUID,
    full_name TEXT,
    title TEXT,
    bio TEXT,
    linkedin_url TEXT,
    specializations TEXT[],
    availability TEXT,
    provider_profile_id UUID,
    day_rate NUMERIC,
    currency TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        le.id,
        le.full_name,
        le.title,
        le.bio,
        le.linkedin_url,
        le.specializations,
        le.availability,
        le.provider_profile_id,
        le.day_rate,
        le.currency
    FROM listing_executives le
    WHERE le.listing_id = p_listing_id
      AND le.status = 'active'
    ORDER BY le.created_at;
$$;

-- Get executives for the current user's claimed listing — add day_rate + currency
CREATE OR REPLACE FUNCTION public.get_my_listing_executives()
RETURNS TABLE (
    id UUID,
    listing_id UUID,
    full_name TEXT,
    title TEXT,
    email TEXT,
    linkedin_url TEXT,
    bio TEXT,
    specializations TEXT[],
    availability TEXT,
    provider_profile_id UUID,
    status TEXT,
    created_at TIMESTAMPTZ,
    day_rate NUMERIC,
    currency TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        le.id,
        le.listing_id,
        le.full_name,
        le.title,
        le.email,
        le.linkedin_url,
        le.bio,
        le.specializations,
        le.availability,
        le.provider_profile_id,
        le.status,
        le.created_at,
        le.day_rate,
        le.currency
    FROM listing_executives le
    INNER JOIN listing_claim_tokens lct
        ON lct.listing_id = le.listing_id
        AND lct.claimed_by = auth.uid()
        AND lct.status = 'claimed'
    ORDER BY le.created_at;
$$;

-- Add an executive (claimant only) — accept day_rate + currency
CREATE OR REPLACE FUNCTION public.add_listing_executive(
    p_listing_id UUID,
    p_full_name TEXT,
    p_title TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_linkedin_url TEXT DEFAULT NULL,
    p_bio TEXT DEFAULT NULL,
    p_specializations TEXT[] DEFAULT '{}',
    p_availability TEXT DEFAULT 'part_time',
    p_day_rate NUMERIC DEFAULT NULL,
    p_currency TEXT DEFAULT 'GBP'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_exec_id UUID;
BEGIN
    -- Verify caller is the claimant
    IF NOT EXISTS (
        SELECT 1 FROM listing_claim_tokens
        WHERE listing_id = p_listing_id
          AND claimed_by = auth.uid()
          AND status = 'claimed'
    ) THEN
        RETURN NULL;
    END IF;

    INSERT INTO listing_executives (
        listing_id, full_name, title, email, linkedin_url,
        bio, specializations, availability, added_by,
        day_rate, currency
    ) VALUES (
        p_listing_id, p_full_name, p_title, p_email, p_linkedin_url,
        p_bio, p_specializations, p_availability, auth.uid(),
        p_day_rate, p_currency
    )
    RETURNING id INTO v_exec_id;

    RETURN v_exec_id;
END;
$$;

-- Update an executive (claimant only) — accept day_rate + currency
CREATE OR REPLACE FUNCTION public.update_listing_executive(
    p_exec_id UUID,
    p_full_name TEXT DEFAULT NULL,
    p_title TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_linkedin_url TEXT DEFAULT NULL,
    p_bio TEXT DEFAULT NULL,
    p_specializations TEXT[] DEFAULT NULL,
    p_availability TEXT DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_day_rate NUMERIC DEFAULT NULL,
    p_currency TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Verify caller is the claimant for this exec's listing
    IF NOT EXISTS (
        SELECT 1
        FROM listing_executives le
        INNER JOIN listing_claim_tokens lct
            ON lct.listing_id = le.listing_id
            AND lct.claimed_by = auth.uid()
            AND lct.status = 'claimed'
        WHERE le.id = p_exec_id
    ) THEN
        RETURN FALSE;
    END IF;

    UPDATE listing_executives SET
        full_name       = COALESCE(p_full_name, full_name),
        title           = COALESCE(p_title, title),
        email           = COALESCE(p_email, email),
        linkedin_url    = COALESCE(p_linkedin_url, linkedin_url),
        bio             = COALESCE(p_bio, bio),
        specializations = COALESCE(p_specializations, specializations),
        availability    = COALESCE(p_availability, availability),
        status          = COALESCE(p_status, status),
        day_rate        = COALESCE(p_day_rate, day_rate),
        currency        = COALESCE(p_currency, currency),
        updated_at      = now()
    WHERE id = p_exec_id;

    RETURN TRUE;
END;
$$;
