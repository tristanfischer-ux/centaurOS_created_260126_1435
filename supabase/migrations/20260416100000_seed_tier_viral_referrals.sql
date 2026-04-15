-- =============================================
-- SEED TIER + VIRAL REFERRAL ENHANCEMENTS
-- =============================================
-- Adds the Seed tier (£19.99/mo) between Free and Starter,
-- bonus feature credits for non-AI-task rewards (investor views),
-- and a vesting mechanism for paid-upgrade referral rewards.

-- 1. Update user_subscriptions tier CHECK to include 'seed'
ALTER TABLE public.user_subscriptions
  DROP CONSTRAINT IF EXISTS user_subscriptions_tier_check;
ALTER TABLE public.user_subscriptions
  ADD CONSTRAINT user_subscriptions_tier_check
  CHECK (tier IN ('free', 'seed', 'starter', 'professional', 'enterprise'));

-- 2. Update referral_credits reason CHECK to add paid-upgrade reason
ALTER TABLE public.referral_credits
  DROP CONSTRAINT IF EXISTS referral_credits_reason_check;
ALTER TABLE public.referral_credits
  ADD CONSTRAINT referral_credits_reason_check
  CHECK (reason IN (
    'referral_made', 'referral_received', 'founding_member', 'manual',
    'referral_paid_upgrade'
  ));

-- 3. Create bonus_feature_credits table
-- Stores per-feature bonus credits (e.g., investor detail views from referrals).
-- Separate from referral_credits which tracks AI task bonuses.
CREATE TABLE IF NOT EXISTS public.bonus_feature_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    granted_to UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    feature TEXT NOT NULL,
    amount INTEGER NOT NULL DEFAULT 3,
    consumed INTEGER NOT NULL DEFAULT 0,
    reason TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT bfc_positive_amount CHECK (amount > 0),
    CONSTRAINT bfc_consumed_within_amount CHECK (consumed >= 0 AND consumed <= amount)
);

CREATE INDEX IF NOT EXISTS idx_bonus_feature_credits_lookup
    ON public.bonus_feature_credits(foundry_id, feature, expires_at)
    WHERE consumed < amount;

ALTER TABLE public.bonus_feature_credits ENABLE ROW LEVEL SECURITY;

-- Users can view their own credits
CREATE POLICY "Users can view own bonus feature credits"
    ON public.bonus_feature_credits FOR SELECT
    USING (granted_to = auth.uid());

-- 4. Create referral_rewards_pending table (vesting mechanism)
-- Paid-upgrade referral rewards vest after 30 days to prevent gaming.
CREATE TABLE IF NOT EXISTS public.referral_rewards_pending (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    referrer_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    referred_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    referred_tier TEXT NOT NULL,
    task_reward INTEGER NOT NULL DEFAULT 0,
    investor_view_reward INTEGER NOT NULL DEFAULT 0,
    vests_at TIMESTAMPTZ NOT NULL,
    vested BOOLEAN NOT NULL DEFAULT FALSE,
    vested_at TIMESTAMPTZ,
    -- If the referred user cancels before vesting, reward is forfeited
    forfeited BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_pending_vest
    ON public.referral_rewards_pending(vests_at)
    WHERE vested = FALSE AND forfeited = FALSE;

ALTER TABLE public.referral_rewards_pending ENABLE ROW LEVEL SECURITY;

-- Users can view their own pending rewards
CREATE POLICY "Users can view own pending rewards"
    ON public.referral_rewards_pending FOR SELECT
    USING (referrer_user_id = auth.uid());

-- 5. RPC: Get bonus feature credits for a foundry
CREATE OR REPLACE FUNCTION public.get_bonus_feature_credits(
    p_foundry_id TEXT,
    p_feature TEXT
)
RETURNS INTEGER AS $$
BEGIN
    RETURN COALESCE(
        (SELECT SUM(amount - consumed)
         FROM public.bonus_feature_credits
         WHERE foundry_id = p_foundry_id
           AND feature = p_feature
           AND consumed < amount
           AND expires_at > NOW()),
        0
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RPC: Consume one bonus feature credit (atomic FIFO)
CREATE OR REPLACE FUNCTION public.consume_bonus_feature_credit(
    p_foundry_id TEXT,
    p_feature TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_credit_id UUID;
BEGIN
    -- FIFO: consume oldest non-expired, non-exhausted credit first
    SELECT id INTO v_credit_id
    FROM public.bonus_feature_credits
    WHERE foundry_id = p_foundry_id
      AND feature = p_feature
      AND consumed < amount
      AND expires_at > NOW()
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_credit_id IS NULL THEN
        RETURN FALSE;
    END IF;

    UPDATE public.bonus_feature_credits
    SET consumed = consumed + 1
    WHERE id = v_credit_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. RPC: Count referral signup rewards in last 30 days (rate limit)
CREATE OR REPLACE FUNCTION public.count_recent_referral_rewards(
    p_foundry_id TEXT
)
RETURNS INTEGER AS $$
BEGIN
    RETURN COALESCE(
        (SELECT COUNT(*)
         FROM public.referral_credits
         WHERE foundry_id = p_foundry_id
           AND reason = 'referral_made'
           AND created_at > NOW() - INTERVAL '30 days'),
        0
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
