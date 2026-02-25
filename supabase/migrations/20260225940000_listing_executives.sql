-- ============================================================================
-- Migration: listing_executives
-- Description: Adds a table for fractional executives linked to marketplace
--              listings. Claimed listing owners can add executives to showcase
--              their available fractional talent.
-- ============================================================================

-- ── Table ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.listing_executives (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    listing_id      UUID NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
    full_name       TEXT NOT NULL,
    title           TEXT,
    email           TEXT,
    linkedin_url    TEXT,
    bio             TEXT,
    specializations TEXT[] DEFAULT '{}',
    availability    TEXT DEFAULT 'part_time'
                    CHECK (availability IN ('full_time', 'part_time', 'advisory', 'project_based')),
    provider_profile_id UUID REFERENCES public.provider_profiles(id) ON DELETE SET NULL,
    status          TEXT DEFAULT 'active'
                    CHECK (status IN ('pending', 'active', 'inactive', 'removed')),
    added_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_listing_executives_listing_id
    ON public.listing_executives(listing_id);

CREATE INDEX IF NOT EXISTS idx_listing_executives_status
    ON public.listing_executives(status);

CREATE INDEX IF NOT EXISTS idx_listing_executives_provider
    ON public.listing_executives(provider_profile_id)
    WHERE provider_profile_id IS NOT NULL;

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.listing_executives ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read active executives
CREATE POLICY listing_executives_select ON public.listing_executives
    FOR SELECT TO authenticated
    USING (status = 'active');

-- Claimant (listing owner) can manage their executives
CREATE POLICY listing_executives_insert ON public.listing_executives
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.listing_claim_tokens
            WHERE listing_id = listing_executives.listing_id
              AND claimed_by = auth.uid()
              AND status = 'claimed'
        )
    );

CREATE POLICY listing_executives_update ON public.listing_executives
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.listing_claim_tokens
            WHERE listing_id = listing_executives.listing_id
              AND claimed_by = auth.uid()
              AND status = 'claimed'
        )
    );

CREATE POLICY listing_executives_delete ON public.listing_executives
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.listing_claim_tokens
            WHERE listing_id = listing_executives.listing_id
              AND claimed_by = auth.uid()
              AND status = 'claimed'
        )
    );

-- ── RPCs ────────────────────────────────────────────────────────────────────

-- Get executives for a listing (public-safe, only active)
CREATE OR REPLACE FUNCTION public.get_listing_executives(p_listing_id UUID)
RETURNS TABLE (
    id UUID,
    full_name TEXT,
    title TEXT,
    bio TEXT,
    linkedin_url TEXT,
    specializations TEXT[],
    availability TEXT,
    provider_profile_id UUID
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
        le.provider_profile_id
    FROM listing_executives le
    WHERE le.listing_id = p_listing_id
      AND le.status = 'active'
    ORDER BY le.created_at;
$$;

-- Get executives for the current user's claimed listing
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
    created_at TIMESTAMPTZ
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
        le.created_at
    FROM listing_executives le
    INNER JOIN listing_claim_tokens lct
        ON lct.listing_id = le.listing_id
        AND lct.claimed_by = auth.uid()
        AND lct.status = 'claimed'
    ORDER BY le.created_at;
$$;

-- Add an executive (claimant only)
CREATE OR REPLACE FUNCTION public.add_listing_executive(
    p_listing_id UUID,
    p_full_name TEXT,
    p_title TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_linkedin_url TEXT DEFAULT NULL,
    p_bio TEXT DEFAULT NULL,
    p_specializations TEXT[] DEFAULT '{}',
    p_availability TEXT DEFAULT 'part_time'
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
        bio, specializations, availability, added_by
    ) VALUES (
        p_listing_id, p_full_name, p_title, p_email, p_linkedin_url,
        p_bio, p_specializations, p_availability, auth.uid()
    )
    RETURNING id INTO v_exec_id;

    RETURN v_exec_id;
END;
$$;

-- Update an executive (claimant only)
CREATE OR REPLACE FUNCTION public.update_listing_executive(
    p_exec_id UUID,
    p_full_name TEXT DEFAULT NULL,
    p_title TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_linkedin_url TEXT DEFAULT NULL,
    p_bio TEXT DEFAULT NULL,
    p_specializations TEXT[] DEFAULT NULL,
    p_availability TEXT DEFAULT NULL,
    p_status TEXT DEFAULT NULL
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
        updated_at      = now()
    WHERE id = p_exec_id;

    RETURN TRUE;
END;
$$;

-- Remove an executive (soft delete, claimant only)
CREATE OR REPLACE FUNCTION public.remove_listing_executive(p_exec_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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

    UPDATE listing_executives
    SET status = 'removed', updated_at = now()
    WHERE id = p_exec_id;

    RETURN TRUE;
END;
$$;
