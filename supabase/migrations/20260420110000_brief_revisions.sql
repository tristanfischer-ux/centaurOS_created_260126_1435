-- brief_revisions — multi-row revision history for the Brief page.
--
-- INTENT: The Brief page currently renders a single "Revision N (current)"
-- row because no history table exists. The mockup shows a multi-row timeline
-- where each locked revision has a dot + label + summary. This table is the
-- source of truth for that list. Rows are append-only from the product
-- layer — we never mutate historical rows, so diffs stay honest.
--
-- ROLLBACK: DROP TABLE public.brief_revisions CASCADE;

BEGIN;

CREATE TABLE IF NOT EXISTS public.brief_revisions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id        UUID NOT NULL REFERENCES public.cad_lab_projects(id) ON DELETE CASCADE,
    foundry_id        TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
    revision_number   INTEGER NOT NULL CHECK (revision_number >= 1),
    revision_label    TEXT NOT NULL,
    summary           TEXT NOT NULL DEFAULT '',
    locked_at         TIMESTAMPTZ DEFAULT NULL,
    locked_by         UUID DEFAULT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_brief_revision UNIQUE (project_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_brief_revisions_project_created
    ON public.brief_revisions (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_brief_revisions_foundry
    ON public.brief_revisions (foundry_id);

ALTER TABLE public.brief_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view_brief_revisions_in_own_foundry"
    ON public.brief_revisions
    FOR SELECT
    USING (
        foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    );

CREATE POLICY "insert_brief_revisions_in_own_foundry"
    ON public.brief_revisions
    FOR INSERT
    WITH CHECK (
        foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
        AND project_id IN (
            SELECT id FROM public.cad_lab_projects
            WHERE foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
        )
    );

CREATE POLICY "update_brief_revisions_in_own_foundry"
    ON public.brief_revisions
    FOR UPDATE
    USING (
        foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
    );

COMMENT ON TABLE public.brief_revisions IS
    'Append-only revision history for the Brief page. Each row represents one numbered revision of the brief, with an optional locked_at / locked_by pair once the revision is frozen against suppliers.';

COMMIT;
