/**
 * Migration: Create forge_contracts table
 *
 * Purpose: Stores generated procurement documents (RFQ packs, SOWs, NDAs)
 * linked to Forge projects (xray_scans). Each document is its own row for
 * independent querying, auditing, and status tracking.
 *
 * Security:
 * - RLS: Foundry members can CRUD contracts for their foundry's scans
 * - created_by tracks who generated each document
 *
 * Related:
 * - src/actions/forge-contracts.ts — Server actions for Forge contract CRUD
 * - src/app/(platform)/the-forge/components/contracting-dashboard.tsx — UI
 *
 * Rollback: DROP TABLE public.forge_contracts CASCADE;
 */

-- ─── Table ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.forge_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    xray_scan_id UUID NOT NULL REFERENCES public.xray_scans(id) ON DELETE CASCADE,
    foundry_id TEXT NOT NULL,
    template_id UUID REFERENCES public.contract_templates(id) ON DELETE SET NULL,
    document_type TEXT NOT NULL CHECK (document_type IN (
        'rfq_pack', 'sow', 'nda', 'ip_assignment', 'fractional_engagement'
    )),
    module_id TEXT,               -- Which module this covers (null for project-wide docs like rfq_pack)
    supplier_name TEXT,           -- Supplier this contract is for (null for rfq_pack)
    rendered_content TEXT NOT NULL DEFAULT '',
    variable_values JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'final', 'signed')),
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_forge_contracts_scan ON public.forge_contracts(xray_scan_id);
CREATE INDEX IF NOT EXISTS idx_forge_contracts_foundry ON public.forge_contracts(foundry_id);
CREATE INDEX IF NOT EXISTS idx_forge_contracts_type ON public.forge_contracts(document_type);

-- ─── RLS ─────────────────────────────────────────────────────────────
-- RLS follows the same pattern as xray_scans: match foundry_id via profiles

ALTER TABLE public.forge_contracts ENABLE ROW LEVEL SECURITY;

-- Foundry members can view contracts for their foundry's scans
CREATE POLICY "view_forge_contracts_in_own_foundry"
ON public.forge_contracts
FOR SELECT
USING (
    foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
);

-- Foundry members can create contracts in their foundry
CREATE POLICY "create_forge_contracts_in_own_foundry"
ON public.forge_contracts
FOR INSERT
WITH CHECK (
    created_by = auth.uid()
    AND foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
);

-- Foundry members can update contracts in their foundry
CREATE POLICY "update_forge_contracts_in_own_foundry"
ON public.forge_contracts
FOR UPDATE
USING (
    foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
);

-- Foundry members can delete contracts in their foundry
CREATE POLICY "delete_forge_contracts_in_own_foundry"
ON public.forge_contracts
FOR DELETE
USING (
    foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
);

-- ─── Updated-at trigger ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_forge_contracts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER forge_contracts_updated_at
    BEFORE UPDATE ON public.forge_contracts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_forge_contracts_updated_at();
