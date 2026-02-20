-- Migration: Shared report links
--
-- Purpose:
-- - Enable shareable read-only links for report snapshots.
-- - Public viewers (no auth) can access a report via a unique share token.
-- - Foundry members can create, view, and revoke share links for their reports.
--
-- Security:
-- - RLS on shared_reports: foundry members manage their own links.
-- - Public read is performed server-side via the service-role admin client,
--   so no anon/public RLS policy is needed.
--
-- Related:
-- - src/actions/report-share.ts
-- - src/app/share/report/[token]/page.tsx
--
-- Rollback:
--   DROP TABLE IF EXISTS public.shared_reports CASCADE;

-- ============================================================================
-- SHARED REPORTS (share links for report_snapshots)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.shared_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_snapshot_id UUID NOT NULL REFERENCES public.report_snapshots(id) ON DELETE CASCADE,
    share_token TEXT NOT NULL UNIQUE,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ,
    view_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shared_reports_token
    ON public.shared_reports(share_token);
CREATE INDEX IF NOT EXISTS idx_shared_reports_snapshot
    ON public.shared_reports(report_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_shared_reports_expires
    ON public.shared_reports(expires_at)
    WHERE expires_at IS NOT NULL;

ALTER TABLE public.shared_reports ENABLE ROW LEVEL SECURITY;

-- Foundry members can view share links for their foundry
CREATE POLICY "Shared reports: foundry members can select"
    ON public.shared_reports FOR SELECT
    USING (
        foundry_id IN (
            SELECT fm.foundry_id
            FROM public.foundry_memberships fm
            WHERE fm.user_id = auth.uid()
        )
    );

-- Foundry members can create share links
CREATE POLICY "Shared reports: foundry members can insert"
    ON public.shared_reports FOR INSERT
    WITH CHECK (
        created_by = auth.uid()
        AND foundry_id IN (
            SELECT fm.foundry_id
            FROM public.foundry_memberships fm
            WHERE fm.user_id = auth.uid()
        )
    );

-- Foundry members can delete share links (revoke)
CREATE POLICY "Shared reports: foundry members can delete"
    ON public.shared_reports FOR DELETE
    USING (
        foundry_id IN (
            SELECT fm.foundry_id
            FROM public.foundry_memberships fm
            WHERE fm.user_id = auth.uid()
        )
    );
