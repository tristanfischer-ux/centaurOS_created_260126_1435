-- Security Fixes Round 4b
-- Atomic founding member assignment (prevents TOCTOU race)

CREATE OR REPLACE FUNCTION public.assign_founding_member_atomically(
    p_user_id uuid,
    p_foundry_id text,
    p_credit_amount integer DEFAULT 25,
    p_member_limit integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_count integer;
    v_member_number integer;
BEGIN
    -- Serialize with advisory lock to prevent concurrent assignment
    PERFORM pg_advisory_xact_lock(hashtext('founding_member_assign'));

    SELECT COUNT(*) INTO v_current_count
    FROM public.profiles
    WHERE is_founding_member = true;

    IF v_current_count >= p_member_limit THEN
        RETURN jsonb_build_object('granted', false, 'reason', 'limit_reached');
    END IF;

    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND is_founding_member = true) THEN
        RETURN jsonb_build_object('granted', false, 'reason', 'already_member');
    END IF;

    v_member_number := v_current_count + 1;

    UPDATE public.profiles
    SET is_founding_member = true,
        founding_member_number = v_member_number
    WHERE id = p_user_id;

    INSERT INTO public.referral_credits (foundry_id, granted_to, granted_by, amount, reason)
    VALUES (p_foundry_id, p_user_id, NULL, p_credit_amount, 'founding_member');

    RETURN jsonb_build_object(
        'granted', true,
        'member_number', v_member_number
    );
END;
$$;

-- GRANT handled separately: service_role has execute rights on SECURITY DEFINER functions by default
