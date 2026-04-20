-- Adds a distinct concept_render_url column to cad_lab_projects.
--
-- INTENT: The Brief hero + Workspace system card show two panes — "Nano
-- Banana render" (photo-realistic) on the left and "System blueprint · plan
-- view" (schematic / engineering drawing) on the right. Until now both panes
-- rendered the same system_illustration_url so they looked identical. This
-- column carries the photo-realistic variant; system_illustration_url stays
-- as the blueprint/plan-view image.
--
-- ROLLBACK:
--   ALTER TABLE public.cad_lab_projects DROP COLUMN IF EXISTS concept_render_url;

BEGIN;

ALTER TABLE public.cad_lab_projects
    ADD COLUMN IF NOT EXISTS concept_render_url TEXT DEFAULT NULL;

COMMENT ON COLUMN public.cad_lab_projects.concept_render_url IS
    'URL to a photo-realistic concept render of the product. Distinct from system_illustration_url (blueprint / plan-view). The Brief hero + Workspace system card render concept_render_url in the left pane and system_illustration_url in the right pane.';

COMMIT;
