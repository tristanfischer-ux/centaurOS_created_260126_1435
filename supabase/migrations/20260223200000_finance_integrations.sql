-- Finance Integrations & Sync Log
-- Stores accounting provider connections (Xero, QuickBooks, FreeAgent)
-- and sync history for auditing.

CREATE TABLE IF NOT EXISTS public.finance_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    provider TEXT NOT NULL CHECK (provider IN ('xero', 'quickbooks', 'freeagent')),

    -- OAuth tokens (encrypted at rest via Supabase)
    access_token_encrypted TEXT NULL,
    refresh_token_encrypted TEXT NULL,
    token_expires_at TIMESTAMPTZ NULL,
    external_org_id TEXT NULL,

    status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected', 'connected', 'error', 'syncing')),
    last_sync_at TIMESTAMPTZ NULL,

    chart_of_accounts_mapping JSONB NOT NULL DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (foundry_id, provider)
);

CREATE TABLE IF NOT EXISTS public.finance_sync_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id UUID NOT NULL REFERENCES public.finance_integrations(id) ON DELETE CASCADE,

    direction TEXT NOT NULL CHECK (direction IN ('push', 'pull')),
    entity_type TEXT NOT NULL,
    entity_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'success', 'partial', 'failed')),
    error_message TEXT NULL,

    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_finance_integrations_foundry ON public.finance_integrations(foundry_id);
CREATE INDEX IF NOT EXISTS idx_finance_sync_log_integration ON public.finance_sync_log(integration_id);

-- RLS
ALTER TABLE public.finance_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own integrations"
    ON public.finance_integrations
    FOR ALL
    USING (auth.uid() = created_by)
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can view sync logs for own integrations"
    ON public.finance_sync_log
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.finance_integrations fi
            WHERE fi.id = finance_sync_log.integration_id
            AND fi.created_by = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.finance_integrations fi
            WHERE fi.id = finance_sync_log.integration_id
            AND fi.created_by = auth.uid()
        )
    );

-- Updated_at trigger for integrations
CREATE OR REPLACE FUNCTION update_finance_integrations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_finance_integrations_updated_at
    BEFORE UPDATE ON public.finance_integrations
    FOR EACH ROW
    EXECUTE FUNCTION update_finance_integrations_updated_at();

COMMENT ON TABLE public.finance_integrations IS 'Accounting provider connections (Xero, QuickBooks, FreeAgent).';
COMMENT ON TABLE public.finance_sync_log IS 'Sync history for accounting integrations.';
