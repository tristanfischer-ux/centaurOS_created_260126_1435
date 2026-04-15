-- =============================================
-- ENTERPRISE OVERAGE BILLING
-- =============================================
-- Adds metered overage billing support for Enterprise tier.
-- When Enterprise users exceed their $400/mo compute budget,
-- they continue with per-use overage charges via Stripe metered billing.
-- Core rule: Tristan's cost must NEVER exceed user revenue.

-- 1. Add stripe_overage_item_id to user_subscriptions
-- Stores the Stripe subscription item ID for the metered overage component.
-- Only populated for Enterprise subscriptions that have overage enabled.
ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS stripe_overage_item_id TEXT;

COMMENT ON COLUMN public.user_subscriptions.stripe_overage_item_id IS
  'Stripe subscription item ID for the metered overage price component. Only set for Enterprise tier.';

-- 2. Add overage tracking to ai_usage_monthly
ALTER TABLE public.ai_usage_monthly
  ADD COLUMN IF NOT EXISTS overage_cost_usd DECIMAL(10, 4) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.ai_usage_monthly.overage_cost_usd IS
  'Compute cost in USD incurred beyond the tier budget this month. Only non-zero for Enterprise tier.';

-- 3. Create overage_report_queue for fail-closed Stripe reporting
-- If a Stripe usage_record call fails, the record is queued here.
-- Next AI call from the same foundry will attempt to flush the queue
-- before allowing further overage compute.
CREATE TABLE IF NOT EXISTS public.overage_report_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    stripe_subscription_item_id TEXT NOT NULL,
    compute_cost_cents INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reported', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reported_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_overage_queue_foundry_status
    ON public.overage_report_queue(foundry_id, status)
    WHERE status = 'pending';

-- RLS: Only service role should access this table (server-side only)
ALTER TABLE public.overage_report_queue ENABLE ROW LEVEL SECURITY;

-- No user-facing policies — only admin/service role access
-- This table is accessed exclusively from server-side code via createAdminClient()

-- 4. Helper RPC: get pending overage reports for a foundry
CREATE OR REPLACE FUNCTION public.get_pending_overage_reports(p_foundry_id TEXT)
RETURNS TABLE(
    id UUID,
    stripe_subscription_item_id TEXT,
    compute_cost_cents INTEGER,
    attempts INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        oq.id,
        oq.stripe_subscription_item_id,
        oq.compute_cost_cents,
        oq.attempts
    FROM public.overage_report_queue oq
    WHERE oq.foundry_id = p_foundry_id
      AND oq.status = 'pending'
    ORDER BY oq.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Helper RPC: mark an overage report as successfully reported
CREATE OR REPLACE FUNCTION public.mark_overage_reported(p_report_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.overage_report_queue
    SET status = 'reported',
        reported_at = NOW()
    WHERE id = p_report_id
      AND status = 'pending';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Helper RPC: mark an overage report as failed (increment attempts)
CREATE OR REPLACE FUNCTION public.mark_overage_failed(
    p_report_id UUID,
    p_error TEXT
)
RETURNS VOID AS $$
BEGIN
    UPDATE public.overage_report_queue
    SET attempts = attempts + 1,
        last_error = p_error,
        -- After 5 attempts, mark as permanently failed so it doesn't block forever
        status = CASE WHEN attempts >= 4 THEN 'failed' ELSE 'pending' END
    WHERE id = p_report_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
