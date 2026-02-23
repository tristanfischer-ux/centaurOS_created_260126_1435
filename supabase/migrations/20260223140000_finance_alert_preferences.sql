-- Finance Alert Preferences
-- Stores per-user alert configuration for financial notifications.
-- Uses foundry_id scoping for multi-tenant isolation.

CREATE TABLE IF NOT EXISTS public.finance_alert_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Which alert types are enabled (keyed by alert type name)
    alert_types JSONB NOT NULL DEFAULT '{
        "payment_received": true,
        "invoice_overdue": true,
        "payout_completed": true,
        "payout_failed": true,
        "budget_threshold": true,
        "cash_low": false,
        "retainer_payment_due": true
    }'::jsonb,

    -- Threshold for low cash alert (in pence, null = disabled)
    cash_low_threshold BIGINT NULL,

    -- Percentage threshold for budget alerts (default 80%)
    budget_threshold_pct INTEGER NOT NULL DEFAULT 80,

    -- Digest email frequency
    digest_frequency TEXT NOT NULL DEFAULT 'weekly' CHECK (digest_frequency IN ('daily', 'weekly', 'monthly', 'none')),

    -- Day of week for weekly digest (0=Sunday, 1=Monday, ..., 6=Saturday)
    digest_day INTEGER NOT NULL DEFAULT 1 CHECK (digest_day BETWEEN 0 AND 6),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (foundry_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_finance_alert_prefs_foundry ON public.finance_alert_preferences(foundry_id);
CREATE INDEX IF NOT EXISTS idx_finance_alert_prefs_user ON public.finance_alert_preferences(user_id);

-- RLS
ALTER TABLE public.finance_alert_preferences ENABLE ROW LEVEL SECURITY;

-- Users can read/write their own alert preferences
CREATE POLICY "Users can manage own alert preferences"
    ON public.finance_alert_preferences
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_finance_alert_prefs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_finance_alert_prefs_updated_at
    BEFORE UPDATE ON public.finance_alert_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_finance_alert_prefs_updated_at();

-- Comment
COMMENT ON TABLE public.finance_alert_preferences IS 'Per-user financial alert configuration. Scoped to foundry for multi-tenant isolation.';
