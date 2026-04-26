-- =============================================================================
-- Forge Ambassador Lane
-- Tier 5 step 23 — RED-TEAM-PIVOT-PLAN.md
--
-- Founders with 10 or more active paid referrals get unlimited investor
-- searches as long as their referrals stay paid (Starter or above). If
-- the count drops below 10, they revert to their tier's normal cap.
--
-- Changes:
--   1. profiles.forge_ambassador_since  — when they first crossed 10 referrals
--   2. profiles.forge_ambassador_count  — cached count for display (refreshed
--                                          on any referral conversion event)
--   3. get_active_paid_referral_count() — SQL function: counts referral_signups
--                                          rows where status='converted' AND
--                                          the invitee is still on a paid tier
--   4. update_forge_ambassador_status() — call on any conversion event to keep
--                                          the cache columns in sync
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add ambassador columns to profiles
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS forge_ambassador_since  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS forge_ambassador_count  INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profiles.forge_ambassador_since
    IS 'Timestamp when this founder first crossed the 10-active-paid-referrals threshold. NULL = not yet an ambassador.';

COMMENT ON COLUMN public.profiles.forge_ambassador_count
    IS 'Cached count of active paid referrals. Refreshed on every referral conversion event via update_forge_ambassador_status().';

-- ---------------------------------------------------------------------------
-- 2. get_active_paid_referral_count(inviter_user_id uuid) → integer
--
-- Counts referral_signups rows where:
--   • the caller is the inviter
--   • status = 'converted'  (invitee upgraded to a paid tier)
--   • the invitee STILL has an active paid subscription (Starter or above)
--     — a churn means the row stays 'converted' but the tier check fails,
--       so the count drops below 10 and ambassador status is withdrawn
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_active_paid_referral_count(
    p_inviter_user_id UUID
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COUNT(*)::INTEGER
    FROM public.referral_signups rs
    JOIN public.user_subscriptions us
        ON us.user_id  = rs.invitee_user_id
        AND us.status  IN ('active', 'trialing')
        AND us.tier    NOT IN ('free')
    WHERE rs.inviter_user_id = p_inviter_user_id
      AND rs.status          = 'converted';
$$;

COMMENT ON FUNCTION public.get_active_paid_referral_count(UUID)
    IS 'Returns the number of referrals that are CURRENTLY on an active paid subscription. Used per-request for the ambassador cap check; also called by update_forge_ambassador_status() to refresh the cache.';

-- ---------------------------------------------------------------------------
-- 3. update_forge_ambassador_status(inviter_user_id uuid) → void
--
-- Refreshes profiles.forge_ambassador_count for the given user and, if the
-- count just crossed 10 for the first time, sets forge_ambassador_since.
-- Call this from the referral conversion webhook path so the cache stays warm.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_forge_ambassador_status(
    p_inviter_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count     INTEGER;
    v_was_null  BOOLEAN;
BEGIN
    v_count := public.get_active_paid_referral_count(p_inviter_user_id);

    SELECT (forge_ambassador_since IS NULL)
    INTO   v_was_null
    FROM   public.profiles
    WHERE  id = p_inviter_user_id;

    IF v_count >= 10 AND (v_was_null IS TRUE) THEN
        -- First time crossing the threshold — record when they earned it
        UPDATE public.profiles
        SET    forge_ambassador_count = v_count,
               forge_ambassador_since = NOW()
        WHERE  id = p_inviter_user_id;
    ELSE
        UPDATE public.profiles
        SET    forge_ambassador_count = v_count
        WHERE  id = p_inviter_user_id;
    END IF;
END;
$$;

COMMENT ON FUNCTION public.update_forge_ambassador_status(UUID)
    IS 'Refreshes the forge_ambassador_count cache and sets forge_ambassador_since on the first crossing of the 10-referral threshold.';

-- ---------------------------------------------------------------------------
-- 4. Security: ensure the two new columns follow RLS on profiles
--    (existing profile RLS already covers this — no new policies needed)
-- ---------------------------------------------------------------------------
-- The guard_profile_security_columns trigger (migration 20260410400000)
-- blocks non-service-role writes to security columns. ambassador columns
-- are NOT in the blocked list, so the SECURITY DEFINER functions above
-- can update them freely while the trigger stays in place.
