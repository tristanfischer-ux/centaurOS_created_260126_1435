-- Finance Expenses
-- Quick expense logging with receipt references and approval workflow.

CREATE TABLE IF NOT EXISTS public.finance_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    amount BIGINT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'GBP',
    category TEXT NOT NULL CHECK (category IN ('personnel', 'infrastructure', 'marketing', 'operations', 'materials', 'production', 'travel', 'office', 'other')),
    description TEXT NOT NULL,
    vendor TEXT NULL,

    expense_date DATE NOT NULL,
    receipt_url TEXT NULL,
    receipt_data JSONB NULL,

    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
    approved_by UUID NULL REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ NULL,

    project_id UUID NULL REFERENCES public.finance_projects(id) ON DELETE SET NULL,
    mileage_km NUMERIC NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_finance_expenses_foundry ON public.finance_expenses(foundry_id);
CREATE INDEX IF NOT EXISTS idx_finance_expenses_status ON public.finance_expenses(foundry_id, status);
CREATE INDEX IF NOT EXISTS idx_finance_expenses_date ON public.finance_expenses(foundry_id, expense_date);

-- RLS
ALTER TABLE public.finance_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own expenses"
    ON public.finance_expenses
    FOR ALL
    USING (auth.uid() = created_by)
    WITH CHECK (auth.uid() = created_by);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_finance_expenses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_finance_expenses_updated_at
    BEFORE UPDATE ON public.finance_expenses
    FOR EACH ROW
    EXECUTE FUNCTION update_finance_expenses_updated_at();

COMMENT ON TABLE public.finance_expenses IS 'Expense tracking with receipt references and approval workflow.';
