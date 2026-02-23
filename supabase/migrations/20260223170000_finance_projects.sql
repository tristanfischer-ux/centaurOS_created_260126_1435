-- Finance Projects & Project Transactions
-- Tracks project-level P&L by linking revenue and expenses to projects.

CREATE TABLE IF NOT EXISTS public.finance_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    name TEXT NOT NULL,
    client_name TEXT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'on_hold', 'cancelled')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.finance_project_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.finance_projects(id) ON DELETE CASCADE,

    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('order', 'retainer_entry', 'expense', 'cost_item')),
    reference_id UUID NULL,
    description TEXT NOT NULL DEFAULT '',
    amount BIGINT NOT NULL,
    is_revenue BOOLEAN NOT NULL DEFAULT false,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_finance_projects_foundry ON public.finance_projects(foundry_id);
CREATE INDEX IF NOT EXISTS idx_finance_projects_status ON public.finance_projects(foundry_id, status);
CREATE INDEX IF NOT EXISTS idx_finance_project_transactions_project ON public.finance_project_transactions(project_id);

-- RLS
ALTER TABLE public.finance_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_project_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own projects"
    ON public.finance_projects
    FOR ALL
    USING (auth.uid() = created_by)
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can manage transactions on own projects"
    ON public.finance_project_transactions
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.finance_projects fp
            WHERE fp.id = finance_project_transactions.project_id
            AND fp.created_by = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.finance_projects fp
            WHERE fp.id = finance_project_transactions.project_id
            AND fp.created_by = auth.uid()
        )
    );

-- Updated_at trigger for finance_projects
CREATE OR REPLACE FUNCTION update_finance_projects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_finance_projects_updated_at
    BEFORE UPDATE ON public.finance_projects
    FOR EACH ROW
    EXECUTE FUNCTION update_finance_projects_updated_at();

COMMENT ON TABLE public.finance_projects IS 'Projects for per-project P&L tracking.';
COMMENT ON TABLE public.finance_project_transactions IS 'Revenue and expense transactions linked to projects.';
