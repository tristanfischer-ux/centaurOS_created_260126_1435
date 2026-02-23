-- Finance Payment Links & Standalone Invoices
-- Enables one-click payment links, shareable URLs, and standalone invoicing
-- independent of the marketplace order flow.

-- ============================================================
-- Payment Links
-- ============================================================

CREATE TABLE IF NOT EXISTS public.finance_payment_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Link details
    short_code TEXT NOT NULL UNIQUE,
    amount BIGINT NOT NULL,              -- in pence
    currency TEXT NOT NULL DEFAULT 'GBP',
    description TEXT NOT NULL DEFAULT '',

    -- Status
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paid', 'expired', 'cancelled')),
    expires_at TIMESTAMPTZ NULL,
    paid_at TIMESTAMPTZ NULL,

    -- Stripe
    stripe_payment_intent_id TEXT NULL,

    -- Optional link to standalone invoice
    invoice_id UUID NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_links_foundry ON public.finance_payment_links(foundry_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_short_code ON public.finance_payment_links(short_code);
CREATE INDEX IF NOT EXISTS idx_payment_links_created_by ON public.finance_payment_links(created_by);
CREATE INDEX IF NOT EXISTS idx_payment_links_status ON public.finance_payment_links(status);

-- ============================================================
-- Standalone Invoices
-- ============================================================

CREATE TABLE IF NOT EXISTS public.finance_standalone_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Invoice details
    invoice_number TEXT NOT NULL,
    recipient_name TEXT NOT NULL,
    recipient_email TEXT NOT NULL,

    -- Line items stored as JSON array
    line_items JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Totals (all in pence)
    subtotal BIGINT NOT NULL DEFAULT 0,
    vat_amount BIGINT NOT NULL DEFAULT 0,
    total BIGINT NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'GBP',

    -- Status
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
    due_date DATE NOT NULL,

    -- Payment link association
    payment_link_id UUID NULL,

    -- Recurrence
    is_recurring BOOLEAN NOT NULL DEFAULT false,
    recurrence_interval TEXT NULL CHECK (recurrence_interval IN ('weekly', 'fortnightly', 'monthly', 'quarterly', 'annual')),
    next_recurrence_date DATE NULL,

    -- Notes
    notes TEXT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_standalone_invoices_foundry ON public.finance_standalone_invoices(foundry_id);
CREATE INDEX IF NOT EXISTS idx_standalone_invoices_created_by ON public.finance_standalone_invoices(created_by);
CREATE INDEX IF NOT EXISTS idx_standalone_invoices_status ON public.finance_standalone_invoices(status);
CREATE INDEX IF NOT EXISTS idx_standalone_invoices_recurring ON public.finance_standalone_invoices(is_recurring, next_recurrence_date)
    WHERE is_recurring = true;

-- ============================================================
-- Foreign key for payment_link_id → invoice
-- ============================================================

ALTER TABLE public.finance_payment_links
    ADD CONSTRAINT fk_payment_links_invoice
    FOREIGN KEY (invoice_id) REFERENCES public.finance_standalone_invoices(id) ON DELETE SET NULL;

ALTER TABLE public.finance_standalone_invoices
    ADD CONSTRAINT fk_invoices_payment_link
    FOREIGN KEY (payment_link_id) REFERENCES public.finance_payment_links(id) ON DELETE SET NULL;

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.finance_payment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_standalone_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own payment links"
    ON public.finance_payment_links
    FOR ALL
    USING (auth.uid() = created_by)
    WITH CHECK (auth.uid() = created_by);

-- Public read for active payment links (for the public checkout page)
CREATE POLICY "Anyone can view active payment links"
    ON public.finance_payment_links
    FOR SELECT
    USING (status = 'active');

CREATE POLICY "Users can manage own standalone invoices"
    ON public.finance_standalone_invoices
    FOR ALL
    USING (auth.uid() = created_by)
    WITH CHECK (auth.uid() = created_by);

-- ============================================================
-- Updated_at triggers
-- ============================================================

CREATE OR REPLACE FUNCTION update_payment_links_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_payment_links_updated_at
    BEFORE UPDATE ON public.finance_payment_links
    FOR EACH ROW
    EXECUTE FUNCTION update_payment_links_updated_at();

CREATE OR REPLACE FUNCTION update_standalone_invoices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_standalone_invoices_updated_at
    BEFORE UPDATE ON public.finance_standalone_invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_standalone_invoices_updated_at();

-- ============================================================
-- Comments
-- ============================================================

COMMENT ON TABLE public.finance_payment_links IS 'Shareable payment links with short codes for quick payments. Each link can optionally be tied to a standalone invoice.';
COMMENT ON TABLE public.finance_standalone_invoices IS 'Standalone invoices independent of marketplace orders. Supports line items, VAT, and optional recurrence.';
