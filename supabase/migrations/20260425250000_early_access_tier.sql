-- =============================================================================
-- Early-Access Tier
-- 2026-04-25
--
-- Grants Starter-level limits to the first 100 sign-ups for free for 30 days.
-- Two columns are added to profiles:
--   early_access_until        — timestamptz, null when not in cohort
--   early_access_user_number  — integer, sequential 1..100 position in cohort
--
-- A trigger on INSERT to profiles auto-grants early access if the cohort is
-- not yet full (< 100 profiles total). After 100 sign-ups the trigger
-- no longer fires.
--
-- The effective-tier resolution function is: when early_access_until > now()
-- the caller should treat the user as if they are on starter_v2 limits.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add columns to profiles
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS early_access_until        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS early_access_user_number  INTEGER;

-- Index for efficient "is this user in early access?" checks
CREATE INDEX IF NOT EXISTS idx_profiles_early_access_until
    ON public.profiles(early_access_until)
    WHERE early_access_until IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Helper: get_early_access_cohort_count
--    Returns how many profiles have been granted early access so far.
--    Used by the trigger and by application code that wants to display
--    "X of 100 early-access spots taken."
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_early_access_cohort_count()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COUNT(*)::INTEGER
    FROM public.profiles
    WHERE early_access_user_number IS NOT NULL;
$$;

-- ---------------------------------------------------------------------------
-- 3. Trigger function: auto_grant_early_access
--    Fires AFTER INSERT on profiles. If the cohort is not full (< 100),
--    sets early_access_until and early_access_user_number on the new profile.
--
--    Uses pg_advisory_xact_lock on a fixed key (987654321) to serialise
--    concurrent sign-ups at the boundary and prevent two inserts from both
--    landing on position 100 (TOCTOU race). The lock is transaction-scoped
--    and released automatically at commit.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_grant_early_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cohort_size   INTEGER := 100;
    v_current_count INTEGER;
    v_user_number   INTEGER;
BEGIN
    -- Serialise concurrent inserts at the count-and-assign step
    PERFORM pg_advisory_xact_lock(987654321);

    SELECT COUNT(*)::INTEGER
    INTO v_current_count
    FROM public.profiles
    WHERE early_access_user_number IS NOT NULL;

    IF v_current_count >= v_cohort_size THEN
        -- Cohort is full; do nothing
        RETURN NEW;
    END IF;

    v_user_number := v_current_count + 1;

    UPDATE public.profiles
    SET
        early_access_until       = NOW() + INTERVAL '30 days',
        early_access_user_number = v_user_number
    WHERE id = NEW.id;

    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Attach trigger
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_auto_grant_early_access ON public.profiles;

CREATE TRIGGER trg_auto_grant_early_access
    AFTER INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_grant_early_access();

-- ---------------------------------------------------------------------------
-- 5. Helper: is_early_access_active(p_user_id UUID)
--    Returns TRUE when the user is currently within their early-access window.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_early_access_active(
    p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = p_user_id
          AND early_access_until IS NOT NULL
          AND early_access_until > NOW()
    );
$$;

-- ---------------------------------------------------------------------------
-- 6. Helper: get_early_access_profile(p_user_id UUID)
--    Returns early_access_until and early_access_user_number for a user.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_early_access_profile(
    p_user_id UUID
)
RETURNS TABLE (
    early_access_until        TIMESTAMPTZ,
    early_access_user_number  INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT early_access_until, early_access_user_number
    FROM public.profiles
    WHERE id = p_user_id;
$$;
