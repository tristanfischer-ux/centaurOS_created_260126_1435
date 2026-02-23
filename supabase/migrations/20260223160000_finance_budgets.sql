-- Finance Budgets
-- Tracks budget allocations by category with period-based amounts.
-- Actuals are computed from money_map_cost_items at query time.

CREATE TABLE IF NOT EXISTS public.finance_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('personnel', 'infrastructure', 'marketing', 'operations', 'materials', 'production', 'other')),
    period TEXT NOT NULL DEFAULT 'monthly' CHECK (period IN ('monthly', 'quarterly', 'annual')),

    -- Budget amount in pence
    amount BIGINT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'GBP',

    start_date DATE NOT NULL,
    end_date DATE NULL,

    is_active BOOLEAN NOT NULL DEFAULT true,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_finance_budgets_foundry ON public.finance_budgets(foundry_id);
CREATE INDEX IF NOT EXISTS idx_finance_budgets_active ON public.finance_budgets(foundry_id, is_active);

-- RLS
ALTER TABLE public.finance_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own budgets"
    ON public.finance_budgets
    FOR ALL
    USING (auth.uid() = created_by)
    WITH CHECK (auth.uid() = created_by);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_finance_budgets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_finance_budgets_updated_at
    BEFORE UPDATE ON public.finance_budgets
    FOR EACH ROW
    EXECUTE FUNCTION update_finance_budgets_updated_at();

COMMENT ON TABLE public.finance_budgets IS 'Budget allocations by category. Actuals computed from money_map_cost_items at query time.';
