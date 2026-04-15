-- =============================================
-- INVESTOR VIEWS LIBRARY — "Once Viewed, Always Yours"
-- =============================================
-- Tracks which investors a user has viewed, creating a permanent
-- personal library. Monthly caps only apply to NEW investor views;
-- previously-viewed investors are accessible forever.

-- 1. Create investor_views table
CREATE TABLE IF NOT EXISTS public.investor_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    investor_id UUID NOT NULL,
    first_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    view_count INTEGER NOT NULL DEFAULT 1,
    last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(foundry_id, investor_id)
);

-- Index for monthly new-view counting
CREATE INDEX IF NOT EXISTS idx_investor_views_monthly
    ON public.investor_views(foundry_id, first_viewed_at DESC);

-- Index for library lookups (has this user viewed this investor?)
CREATE INDEX IF NOT EXISTS idx_investor_views_lookup
    ON public.investor_views(foundry_id, investor_id);

-- Index for daily burst ceiling check (non-partial — CURRENT_DATE is not immutable)
CREATE INDEX IF NOT EXISTS idx_investor_views_daily
    ON public.investor_views(foundry_id, first_viewed_at DESC);

-- RLS: users can view their own library
ALTER TABLE public.investor_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own investor library"
    ON public.investor_views FOR SELECT
    USING (user_id = auth.uid());

-- Service role gets full access for recording views
-- (views are recorded from server actions via admin client)

-- 2. RPC: Record an investor view (upsert — new or re-visit)
CREATE OR REPLACE FUNCTION public.record_investor_view(
    p_foundry_id TEXT,
    p_user_id UUID,
    p_investor_id UUID
)
RETURNS TABLE(is_new_view BOOLEAN, library_size BIGINT, new_views_this_month BIGINT) AS $$
DECLARE
    v_existing BOOLEAN;
    v_month_start TIMESTAMPTZ;
BEGIN
    v_month_start := date_trunc('month', NOW());

    -- Check if already in library
    SELECT EXISTS(
        SELECT 1 FROM public.investor_views
        WHERE foundry_id = p_foundry_id AND investor_id = p_investor_id
    ) INTO v_existing;

    -- Upsert: new view or increment re-visit count
    INSERT INTO public.investor_views (foundry_id, user_id, investor_id)
    VALUES (p_foundry_id, p_user_id, p_investor_id)
    ON CONFLICT (foundry_id, investor_id)
    DO UPDATE SET
        view_count = public.investor_views.view_count + 1,
        last_viewed_at = NOW();

    -- Return stats
    RETURN QUERY
    SELECT
        NOT v_existing AS is_new_view,
        (SELECT COUNT(*) FROM public.investor_views WHERE foundry_id = p_foundry_id) AS library_size,
        (SELECT COUNT(*) FROM public.investor_views
         WHERE foundry_id = p_foundry_id AND first_viewed_at >= v_month_start) AS new_views_this_month;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RPC: Get investor view stats for a foundry
CREATE OR REPLACE FUNCTION public.get_investor_view_stats(p_foundry_id TEXT)
RETURNS TABLE(library_size BIGINT, new_views_this_month BIGINT, views_today BIGINT) AS $$
DECLARE
    v_month_start TIMESTAMPTZ;
    v_today_start TIMESTAMPTZ;
BEGIN
    v_month_start := date_trunc('month', NOW());
    v_today_start := date_trunc('day', NOW());

    RETURN QUERY
    SELECT
        (SELECT COUNT(*) FROM public.investor_views WHERE foundry_id = p_foundry_id),
        (SELECT COUNT(*) FROM public.investor_views
         WHERE foundry_id = p_foundry_id AND first_viewed_at >= v_month_start),
        (SELECT COUNT(*) FROM public.investor_views
         WHERE foundry_id = p_foundry_id AND first_viewed_at >= v_today_start);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RPC: Check if an investor is in the user's library
CREATE OR REPLACE FUNCTION public.is_investor_in_library(
    p_foundry_id TEXT,
    p_investor_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS(
        SELECT 1 FROM public.investor_views
        WHERE foundry_id = p_foundry_id AND investor_id = p_investor_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
