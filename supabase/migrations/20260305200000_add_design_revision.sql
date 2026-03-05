-- Design revision tracking for post-specialist-review workflow.
-- design_revision: project-level version (v1 = initial, v2+ = post-review)
-- images_generated_at_revision: tracks when images were last generated
-- When design_revision > images_generated_at_revision, images are stale.

ALTER TABLE public.cad_lab_projects
  ADD COLUMN IF NOT EXISTS design_revision INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.cad_lab_projects
  ADD COLUMN IF NOT EXISTS images_generated_at_revision INTEGER NOT NULL DEFAULT 1;
