-- Cash Burn Planning
-- Three tables for weekly cash flow modelling: cash out (costs), cash in (revenue/funding),
-- and burn scenarios for what-if analysis. All amounts in pence (BIGINT).

-- ============================================================
-- Table 1: cash_out_items — Fixed and variable costs
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cash_out_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id      TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    created_by      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    name            TEXT NOT NULL,
    category        TEXT NOT NULL CHECK (category IN (
        'rent', 'salaries', 'benefits_insurance', 'phone_internet',
        'ai_llm', 'saas_subscriptions', 'insurance', 'accounting',
        'legal_retainer', 'bank_fees',
        'contractors', 'hardware_components', 'prototyping', 'manufacturing',
        'shipping', 'marketing', 'travel', 'events', 'cloud_infrastructure',
        'r_and_d', 'equipment_purchase', 'other'
    )),
    cost_type       TEXT NOT NULL CHECK (cost_type IN ('fixed', 'variable')),
    pnl_category    TEXT NOT NULL DEFAULT 'opex' CHECK (pnl_category IN (
        'cogs', 'opex', 'rnd', 'capex', 'excluded'
    )),
    amount          BIGINT NOT NULL,
    currency        TEXT NOT NULL DEFAULT 'GBP',
    frequency       TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN (
        'weekly', 'monthly', 'annual', 'one_time'
    )),
    effective_from  DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to    DATE,
    notes           TEXT,
    sort_order      INT NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_out_items_foundry ON public.cash_out_items(foundry_id);
CREATE INDEX IF NOT EXISTS idx_cash_out_items_active ON public.cash_out_items(foundry_id, is_active);

ALTER TABLE public.cash_out_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own cash out items"
    ON public.cash_out_items
    FOR ALL
    USING (auth.uid() = created_by)
    WITH CHECK (auth.uid() = created_by);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_cash_out_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_cash_out_items_updated_at
    BEFORE UPDATE ON public.cash_out_items
    FOR EACH ROW
    EXECUTE FUNCTION update_cash_out_items_updated_at();

COMMENT ON TABLE public.cash_out_items IS 'Fixed and variable cost items for weekly cash burn modelling. Amounts in pence.';

-- ============================================================
-- Table 2: cash_in_items — Revenue, loans, equity, grants
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cash_in_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id      TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    created_by      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    name            TEXT NOT NULL,
    source_type     TEXT NOT NULL CHECK (source_type IN (
        'revenue', 'loan', 'equity', 'government_grant', 'other'
    )),
    amount          BIGINT NOT NULL,
    currency        TEXT NOT NULL DEFAULT 'GBP',
    frequency       TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN (
        'weekly', 'monthly', 'annual', 'one_time'
    )),
    probability_pct INT NOT NULL DEFAULT 100 CHECK (probability_pct >= 0 AND probability_pct <= 100),
    effective_from  DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to    DATE,
    notes           TEXT,
    sort_order      INT NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_in_items_foundry ON public.cash_in_items(foundry_id);
CREATE INDEX IF NOT EXISTS idx_cash_in_items_active ON public.cash_in_items(foundry_id, is_active);

ALTER TABLE public.cash_in_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own cash in items"
    ON public.cash_in_items
    FOR ALL
    USING (auth.uid() = created_by)
    WITH CHECK (auth.uid() = created_by);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_cash_in_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_cash_in_items_updated_at
    BEFORE UPDATE ON public.cash_in_items
    FOR EACH ROW
    EXECUTE FUNCTION update_cash_in_items_updated_at();

COMMENT ON TABLE public.cash_in_items IS 'Cash inflow items (revenue, loans, equity, grants) for weekly burn modelling. Amounts in pence.';

-- ============================================================
-- Table 3: burn_scenarios — Named what-if scenarios
-- ============================================================

CREATE TABLE IF NOT EXISTS public.burn_scenarios (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id          TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    created_by          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    name                TEXT NOT NULL,
    opening_balance     BIGINT NOT NULL DEFAULT 0,
    revenue_delay_weeks INT NOT NULL DEFAULT 0,
    cost_delay_weeks    INT NOT NULL DEFAULT 0,
    revenue_growth_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,
    item_overrides      JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_default          BOOLEAN NOT NULL DEFAULT false,
    sort_order          INT NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_burn_scenarios_foundry ON public.burn_scenarios(foundry_id);

ALTER TABLE public.burn_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own burn scenarios"
    ON public.burn_scenarios
    FOR ALL
    USING (auth.uid() = created_by)
    WITH CHECK (auth.uid() = created_by);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_burn_scenarios_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_burn_scenarios_updated_at
    BEFORE UPDATE ON public.burn_scenarios
    FOR EACH ROW
    EXECUTE FUNCTION update_burn_scenarios_updated_at();

COMMENT ON TABLE public.burn_scenarios IS 'Named burn scenarios for what-if cash flow analysis with delay/growth adjustments.';
