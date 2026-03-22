-- Security Fixes Round 4a
-- 1. reset_rate_limit RPC (for distributed rate limit reset)
-- 2. is_archived column on conversation_participants (per-user archive)

-- ===================================================================
-- 1. reset_rate_limit: Deletes a rate limit entry by key
-- ===================================================================
CREATE OR REPLACE FUNCTION public.reset_rate_limit(
    p_key text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM public.rate_limits WHERE key = p_key;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_rate_limit(text) TO service_role;

-- ===================================================================
-- 2. Per-user archive: is_archived on conversation_participants
-- ===================================================================
ALTER TABLE public.conversation_participants
    ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_conversation_participants_archived
    ON public.conversation_participants(profile_id, is_archived)
    WHERE is_archived = false;
