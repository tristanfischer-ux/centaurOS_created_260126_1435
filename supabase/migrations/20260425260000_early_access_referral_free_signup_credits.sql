-- =============================================================================
-- Early-Access Referral Free-Signup Credits
-- 2026-04-25
--
-- During the early-access window, inviter earns +50 investor-search credits
-- the moment their invitee signs up (not waiting for a paid conversion).
-- Invitee earns +25 as a welcome bonus.
--
-- This relaxes the paid-conversion-only rule that applies to steady-state
-- referrals. After early-access (inviter's early_access_until has passed),
-- the existing grant_referral_credits_on_paid_conversion function resumes
-- as the sole reward mechanism.
--
-- The referral_signups row records granted_during_early_access = true in
-- bonus_feature_credits.metadata (JSONB) so post-cohort accounting can
-- distinguish these cheaper-to-earn credits from paid-conversion credits.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Add metadata column to bonus_feature_credits (needed for early-access tagging)
-- ---------------------------------------------------------------------------
ALTER TABLE public.bonus_feature_credits
    ADD COLUMN IF NOT EXISTS metadata JSONB;

-- ---------------------------------------------------------------------------
-- Extend referral_signups to track early-access free grants
-- ---------------------------------------------------------------------------
ALTER TABLE public.referral_signups
    ADD COLUMN IF NOT EXISTS early_access_signup_credited BOOLEAN NOT NULL DEFAULT FALSE;

-- ---------------------------------------------------------------------------
-- grant_referral_credits_on_signup_if_inviter_early_access
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_referral_credits_on_signup_if_inviter_early_access(
    p_invitee_user_id UUID,
    p_inviter_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_signup              RECORD;
    v_inviter_profile     RECORD;
    v_invitee_profile     RECORD;
    v_month_start         TIMESTAMPTZ;
    v_expires_at          TIMESTAMPTZ;
    v_inviter_granted     INTEGER;
    v_cap                 INTEGER := 500;
    v_inviter_grant       INTEGER := 50;
    v_invitee_grant       INTEGER := 25;
    v_inviter_capped      BOOLEAN := FALSE;
    v_inviter_ea_active   BOOLEAN;
BEGIN
    SELECT early_access_until IS NOT NULL AND early_access_until > NOW()
    INTO v_inviter_ea_active
    FROM public.profiles
    WHERE id = p_inviter_user_id;

    IF NOT v_inviter_ea_active THEN
        RETURN jsonb_build_object('status', 'inviter_not_in_early_access');
    END IF;

    SELECT *
    INTO v_signup
    FROM public.referral_signups
    WHERE invitee_user_id = p_invitee_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'no_signup_row');
    END IF;

    IF v_signup.early_access_signup_credited THEN
        RETURN jsonb_build_object('status', 'already_credited');
    END IF;

    SELECT id, foundry_id
    INTO v_inviter_profile
    FROM public.profiles
    WHERE id = p_inviter_user_id;

    IF NOT FOUND OR v_inviter_profile.foundry_id IS NULL THEN
        RETURN jsonb_build_object('status', 'inviter_not_found');
    END IF;

    SELECT id, foundry_id
    INTO v_invitee_profile
    FROM public.profiles
    WHERE id = p_invitee_user_id;

    IF NOT FOUND OR v_invitee_profile.foundry_id IS NULL THEN
        RETURN jsonb_build_object('status', 'invitee_not_found');
    END IF;

    v_month_start := date_trunc('month', NOW());
    v_expires_at  := NOW() + INTERVAL '30 days';

    SELECT COALESCE(SUM(amount), 0)
    INTO v_inviter_granted
    FROM public.bonus_feature_credits
    WHERE granted_to = p_inviter_user_id
      AND feature    = 'investor_monthly_views'
      AND reason     = 'early_access_signup_inviter'
      AND created_at >= v_month_start;

    IF v_inviter_granted < v_cap THEN
        DECLARE
            v_headroom INTEGER := LEAST(v_inviter_grant, v_cap - v_inviter_granted);
        BEGIN
            INSERT INTO public.bonus_feature_credits (
                foundry_id, granted_to, feature, amount, consumed, reason, expires_at, metadata
            ) VALUES (
                v_inviter_profile.foundry_id,
                p_inviter_user_id,
                'investor_monthly_views',
                v_headroom,
                0,
                'early_access_signup_inviter',
                v_expires_at,
                jsonb_build_object('granted_during_early_access', true, 'invitee_user_id', p_invitee_user_id)
            );
        END;
    ELSE
        v_inviter_capped := TRUE;
    END IF;

    INSERT INTO public.bonus_feature_credits (
        foundry_id, granted_to, feature, amount, consumed, reason, expires_at, metadata
    ) VALUES (
        v_invitee_profile.foundry_id,
        p_invitee_user_id,
        'investor_monthly_views',
        v_invitee_grant,
        0,
        'early_access_signup_invitee',
        v_expires_at,
        jsonb_build_object('granted_during_early_access', true, 'inviter_user_id', p_inviter_user_id)
    );

    UPDATE public.referral_signups
    SET early_access_signup_credited = TRUE
    WHERE id = v_signup.id;

    RETURN jsonb_build_object(
        'status',          'ok',
        'inviter_granted', CASE WHEN v_inviter_capped THEN 0 ELSE v_inviter_grant END,
        'invitee_granted', v_invitee_grant,
        'inviter_capped',  v_inviter_capped
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- Trigger function: call the grant function on every referral_signups INSERT
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_fn_early_access_referral_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    BEGIN
        PERFORM public.grant_referral_credits_on_signup_if_inviter_early_access(
            NEW.invitee_user_id,
            NEW.inviter_user_id
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[early_access_referral] credit grant failed for invitee=%: %',
            NEW.invitee_user_id, SQLERRM;
    END;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_early_access_referral_signup ON public.referral_signups;

CREATE TRIGGER trg_early_access_referral_signup
    AFTER INSERT ON public.referral_signups
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_fn_early_access_referral_signup();
