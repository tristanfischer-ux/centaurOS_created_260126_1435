-- Finance Funding Opportunities
-- Tracks funding pipeline: grants, investment, R&D tax credits, loans.

CREATE TABLE IF NOT EXISTS public.finance_funding_opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'grant' CHECK (type IN ('grant', 'investment', 'r_and_d_tax_credit', 'loan', 'other')),
    stage TEXT NOT NULL DEFAULT 'researching' CHECK (stage IN ('researching', 'applying', 'submitted', 'interview', 'offered', 'won', 'lost')),

    amount BIGINT NULL,
    currency TEXT NOT NULL DEFAULT 'GBP',

    funder_name TEXT NULL,
    deadline DATE NULL,
    applied_date DATE NULL,
    decision_date DATE NULL,

    probability_pct INTEGER NULL,
    notes TEXT NULL,
    url TEXT NULL,

    equity_pct NUMERIC NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_finance_funding_foundry ON public.finance_funding_opportunities(foundry_id);
CREATE INDEX IF NOT EXISTS idx_finance_funding_stage ON public.finance_funding_opportunities(foundry_id, stage);

-- RLS
ALTER TABLE public.finance_funding_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own funding opportunities"
    ON public.finance_funding_opportunities
    FOR ALL
    USING (auth.uid() = created_by)
    WITH CHECK (auth.uid() = created_by);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_finance_funding_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_finance_funding_updated_at
    BEFORE UPDATE ON public.finance_funding_opportunities
    FOR EACH ROW
    EXECUTE FUNCTION update_finance_funding_updated_at();

COMMENT ON TABLE public.finance_funding_opportunities IS 'Funding pipeline: grants, investment rounds, R&D tax credits, loans.';
