-- =============================================================================
-- Referral Conversion Engine
-- Tier 5 step 22 — RED-TEAM-PIVOT-PLAN.md
--
-- Tracks referral signups end-to-end and grants investor-search credits
-- immediately on paid-tier conversion. Works alongside the existing
-- referral_rewards_pending vesting mechanism (which grants AI-task credits
-- after a 30-day vesting window).
--
-- Quality guard: only PAID conversion (Starter or above) triggers credits.
-- Free-tier signups do NOT grant credits.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. referral_signups — one row per referral signup event
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.referral_signups (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    inviter_user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    invitee_user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    signup_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    converted_to_paid_at TIMESTAMPTZ,
    paid_tier           TEXT,
    -- signed_up: invitee created an account but is still on free tier
    -- converted: invitee upgraded to a paid tier, credits granted
    -- reverted: invitee cancelled before vesting (for future use)
    -- rejected: duplicate or self-referral guard fired
    status              TEXT        NOT NULL DEFAULT 'signed_up'
                            CHECK (status IN ('signed_up', 'converted', 'reverted', 'rejected')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Prevents the same invitee from being credited twice
    CONSTRAINT referral_signups_unique_invitee UNIQUE (invitee_user_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_signups_inviter
    ON public.referral_signups(inviter_user_id, status);

CREATE INDEX IF NOT EXISTS idx_referral_signups_invitee
    ON public.referral_signups(invitee_user_id);

ALTER TABLE public.referral_signups ENABLE ROW LEVEL SECURITY;

-- Users can see signups where they are the inviter OR the invitee
CREATE POLICY "Users can view own referral signups"
    ON public.referral_signups FOR SELECT
    USING (
        inviter_user_id = auth.uid()
        OR invitee_user_id = auth.uid()
    );

-- Service role manages all inserts and updates
CREATE POLICY "Service role manages referral signups"
    ON public.referral_signups FOR ALL
    USING (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 2. Extend bonus_feature_credits reason values to include paid-conversion
--    investor search grants (no structural change needed — reason is free-text)
-- ---------------------------------------------------------------------------
-- No schema change required. bonus_feature_credits.reason is free-text.
-- New reason values used by this engine:
--   'paid_referral_inviter'  — +100 granted to inviter on invitee paid upgrade
--   'paid_referral_invitee'  — +50 granted to invitee on their own first paid upgrade

-- ---------------------------------------------------------------------------
-- 3. grant_referral_credits_on_paid_conversion
--
-- Called from the Stripe webhook handler (via grantReferralUpgradeReward in
-- process-upgrade.ts) when an invitee upgrades to a paid tier.
--
-- Grants:
--   Inviter: +100 investor-search credits (bonus_feature_credits, expires 30 days)
--            Capped at 500 credits granted to this inviter in the current month.
--            If the cap is already reached, the conversion is recorded but no
--            credits are granted for that inviter.
--   Invitee: +50 investor-search credits (bonus_feature_credits, expires 30 days)
--            Only on first paid conversion; idempotent on re-fire.
--
-- Idempotency: if referral_signups already has status='converted' for this
-- invitee, the function is a no-op (returns without inserting credits).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_referral_credits_on_paid_conversion(
    p_invitee_user_id UUID,
    p_paid_tier TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_signup            RECORD;
    v_inviter_profile   RECORD;
    v_invitee_profile   RECORD;
    v_month_start       TIMESTAMPTZ;
    v_inviter_granted   INTEGER;
    v_cap               INTEGER := 500;
    v_inviter_grant     INTEGER := 100;
    v_invitee_grant     INTEGER := 50;
    v_expires_at        TIMESTAMPTZ;
    v_inviter_capped    BOOLEAN := FALSE;
BEGIN
    -- IDEMPOTENCY: bail if this invitee has already been converted
    SELECT *
    INTO v_signup
    FROM public.referral_signups
    WHERE invitee_user_id = p_invitee_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        -- No referral signup row — this user was not referred via the engine
        RETURN jsonb_build_object('status', 'no_referral_signup');
    END IF;

    IF v_signup.status = 'converted' THEN
        -- Already processed; idempotent no-op
        RETURN jsonb_build_object('status', 'already_converted', 'signup_id', v_signup.id);
    END IF;

    -- Look up inviter foundry (needed for bonus_feature_credits insert)
    SELECT id, foundry_id
    INTO v_inviter_profile
    FROM public.profiles
    WHERE id = v_signup.inviter_user_id;

    IF NOT FOUND OR v_inviter_profile.foundry_id IS NULL THEN
        -- Inviter account no longer exists — mark rejected, no credits
        UPDATE public.referral_signups
        SET status = 'rejected'
        WHERE id = v_signup.id;
        RETURN jsonb_build_object('status', 'inviter_not_found');
    END IF;

    -- Look up invitee foundry
    SELECT id, foundry_id
    INTO v_invitee_profile
    FROM public.profiles
    WHERE id = p_invitee_user_id;

    IF NOT FOUND OR v_invitee_profile.foundry_id IS NULL THEN
        UPDATE public.referral_signups
        SET status = 'rejected'
        WHERE id = v_signup.id;
        RETURN jsonb_build_object('status', 'invitee_not_found');
    END IF;

    -- Mark conversion on the signup row
    UPDATE public.referral_signups
    SET
        status               = 'converted',
        converted_to_paid_at = NOW(),
        paid_tier            = p_paid_tier
    WHERE id = v_signup.id;

    -- INVITER CAP: count investor-search credits already granted to this inviter
    -- via paid referrals in the current calendar month
    v_month_start := date_trunc('month', NOW());
    v_expires_at  := NOW() + INTERVAL '30 days';

    SELECT COALESCE(SUM(amount), 0)
    INTO v_inviter_granted
    FROM public.bonus_feature_credits
    WHERE granted_to = v_signup.inviter_user_id
      AND feature = 'investor_monthly_views'
      AND reason = 'paid_referral_inviter'
      AND created_at >= v_month_start;

    IF v_inviter_granted < v_cap THEN
        -- Grant up to the cap; truncate if the remaining headroom is less than v_inviter_grant
        DECLARE
            v_headroom INTEGER := LEAST(v_inviter_grant, v_cap - v_inviter_granted);
        BEGIN
            INSERT INTO public.bonus_feature_credits (
                foundry_id, granted_to, feature, amount, consumed, reason, expires_at
            ) VALUES (
                v_inviter_profile.foundry_id,
                v_signup.inviter_user_id,
                'investor_monthly_views',
                v_headroom,
                0,
                'paid_referral_inviter',
                v_expires_at
            );
        END;
    ELSE
        v_inviter_capped := TRUE;
    END IF;

    -- INVITEE WELCOME BONUS: +50 investor searches (once only, already guaranteed
    -- by the idempotency check above — converted rows are skipped)
    INSERT INTO public.bonus_feature_credits (
        foundry_id, granted_to, feature, amount, consumed, reason, expires_at
    ) VALUES (
        v_invitee_profile.foundry_id,
        p_invitee_user_id,
        'investor_monthly_views',
        v_invitee_grant,
        0,
        'paid_referral_invitee',
        v_expires_at
    );

    RETURN jsonb_build_object(
        'status',          'ok',
        'signup_id',       v_signup.id,
        'inviter_granted', CASE WHEN v_inviter_capped THEN 0 ELSE v_inviter_grant END,
        'invitee_granted', v_invitee_grant,
        'inviter_capped',  v_inviter_capped,
        'paid_tier',       p_paid_tier
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Helper: get_inviter_monthly_referral_credits
--    Returns how many paid-referral investor-search credits have been
--    granted to a user in the current calendar month (for cap enforcement
--    display in the sidebar — Tier 5 step 22 UI follow-up).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_inviter_monthly_referral_credits(
    p_user_id UUID
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(SUM(amount), 0)::INTEGER
    FROM public.bonus_feature_credits
    WHERE granted_to = p_user_id
      AND feature    = 'investor_monthly_views'
      AND reason     = 'paid_referral_inviter'
      AND created_at >= date_trunc('month', NOW());
$$;

-- ---------------------------------------------------------------------------
-- 5. RLS: service role can INSERT into bonus_feature_credits
--    (SELECT policy already exists from 20260416100000_seed_tier_viral_referrals.sql)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = 'bonus_feature_credits'
          AND policyname = 'Service role manages bonus feature credits'
    ) THEN
        CREATE POLICY "Service role manages bonus feature credits"
            ON public.bonus_feature_credits FOR ALL
            USING (auth.role() = 'service_role');
    END IF;
END;
$$;
