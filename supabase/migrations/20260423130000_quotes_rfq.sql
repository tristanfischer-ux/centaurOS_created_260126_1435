-- 20260423130000_quotes_rfq.sql
--
-- Adds a dedicated `quotes` table for RFQ lifecycle management — closes the
-- data-model gap flagged as #87. The /request page previously approximated
-- quote state via the supplier shortlist's `ramp_role` column, which is a
-- role category, not a lifecycle state, so the UI had no honest way to
-- render status chips ("awaiting", "accepted", "rejected").
--
-- Shape:
--   id                  uuid        primary key
--   foundry_id          text        FK → foundries(id), tenant scope
--   project_id          uuid        FK → cad_lab_projects(id), nullable for
--                                   off-CAD quotes (generic marketplace RFQ)
--   module_id           text        optional — matches cad_lab_projects.modules[].id
--   supplier_id         uuid        FK → supplier_directory(id)
--   requested_by        uuid        FK → auth.users.id (founder who sent)
--   status              text        pending | sent | received | accepted |
--                                   rejected | withdrawn | expired
--   unit_price_gbp_pence bigint     nullable until supplier replies
--   quantity            integer     default 1
--   lead_weeks          integer     nullable until supplier replies
--   terms               jsonb       freeform terms capture (payment,
--                                   incoterms, MOQ, NRE, tooling)
--   notes               text        founder-facing notes (why this quote)
--   supplier_notes      text        supplier's response notes
--   sent_at             timestamptz nullable — when the request was sent
--   replied_at          timestamptz nullable — when supplier replied
--   expires_at          timestamptz nullable — quote validity deadline
--   created_at          timestamptz default now()
--   updated_at          timestamptz default now()
--
-- RLS: foundry-scoped — members of the foundry can read/write their own
-- quotes. Suppliers don't have read access at the DB layer; supplier-facing
-- views go through a different auth flow (magic-link tokens) and an
-- explicit API that projects subset columns.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.quotes;

BEGIN;

CREATE TABLE IF NOT EXISTS public.quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.cad_lab_projects(id) ON DELETE SET NULL,
    module_id TEXT,
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'sent', 'received', 'accepted', 'rejected', 'withdrawn', 'expired')
    ),
    unit_price_gbp_pence BIGINT,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    lead_weeks INTEGER,
    terms JSONB DEFAULT '{}'::jsonb,
    notes TEXT,
    supplier_notes TEXT,
    sent_at TIMESTAMPTZ,
    replied_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.quotes IS
    'RFQ lifecycle table — one row per (supplier, project-module) request. Replaces the ramp_role shortcut that the /request page used before 2026-04-23.';
COMMENT ON COLUMN public.quotes.status IS
    'pending: row created, not yet sent | sent: emailed to supplier | received: supplier provided a price | accepted: founder accepted | rejected: founder rejected | withdrawn: founder cancelled | expired: past expires_at';

-- Indexes for the common queries.
CREATE INDEX IF NOT EXISTS idx_quotes_foundry_id ON public.quotes(foundry_id);
CREATE INDEX IF NOT EXISTS idx_quotes_project_id ON public.quotes(project_id);
CREATE INDEX IF NOT EXISTS idx_quotes_supplier_id ON public.quotes(supplier_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON public.quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_foundry_status ON public.quotes(foundry_id, status);

-- updated_at maintenance trigger.
CREATE OR REPLACE FUNCTION public.quotes_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quotes_touch_updated_at ON public.quotes;
CREATE TRIGGER quotes_touch_updated_at
    BEFORE UPDATE ON public.quotes
    FOR EACH ROW
    EXECUTE FUNCTION public.quotes_touch_updated_at();

-- ──────── RLS ────────
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

-- SELECT: members of the foundry see their quotes.
DROP POLICY IF EXISTS quotes_select_foundry ON public.quotes;
CREATE POLICY quotes_select_foundry ON public.quotes
    FOR SELECT
    TO authenticated
    USING (
        foundry_id IN (
            SELECT fm.foundry_id FROM public.foundry_memberships fm
            WHERE fm.user_id = auth.uid()
        )
    );

-- INSERT: must pin both requested_by = auth.uid() AND foundry_id = caller's foundry.
DROP POLICY IF EXISTS quotes_insert_foundry ON public.quotes;
CREATE POLICY quotes_insert_foundry ON public.quotes
    FOR INSERT
    TO authenticated
    WITH CHECK (
        requested_by = auth.uid()
        AND foundry_id IN (
            SELECT fm.foundry_id FROM public.foundry_memberships fm
            WHERE fm.user_id = auth.uid()
        )
    );

-- UPDATE: only within your own foundry. Same check on USING and WITH CHECK so
-- a row can't be moved between foundries via UPDATE.
DROP POLICY IF EXISTS quotes_update_foundry ON public.quotes;
CREATE POLICY quotes_update_foundry ON public.quotes
    FOR UPDATE
    TO authenticated
    USING (
        foundry_id IN (
            SELECT fm.foundry_id FROM public.foundry_memberships fm
            WHERE fm.user_id = auth.uid()
        )
    )
    WITH CHECK (
        foundry_id IN (
            SELECT fm.foundry_id FROM public.foundry_memberships fm
            WHERE fm.user_id = auth.uid()
        )
    );

-- DELETE: only within your own foundry.
DROP POLICY IF EXISTS quotes_delete_foundry ON public.quotes;
CREATE POLICY quotes_delete_foundry ON public.quotes
    FOR DELETE
    TO authenticated
    USING (
        foundry_id IN (
            SELECT fm.foundry_id FROM public.foundry_memberships fm
            WHERE fm.user_id = auth.uid()
        )
    );

COMMIT;
