-- Migration: allow `photography` as a valid illustration_style on cad_lab_projects.
--
-- Context: The "Editorial photography" style was added to src/lib/cad-lab/illustration-styles.ts
-- as a fourth option (alongside blueprint / photoreal / isometric_vector) to power the
-- Marketing / Press Asset audience variant of the Design Journey Report.
-- The previous CHECK constraint rejected the new value; without this migration, any
-- attempt to save a project's style as 'photography' would fail with a constraint
-- violation at insert/update time.
--
-- Related:
--   src/lib/cad-lab/illustration-styles.ts (new IllustrationStyle union member)
--   src/lib/cad-lab/audience.ts (marketing audience picks this style)
--   supabase/migrations/20260418040000_cad_lab_illustration_style.sql (original constraint)

ALTER TABLE public.cad_lab_projects
  DROP CONSTRAINT IF EXISTS cad_lab_projects_illustration_style_check;

ALTER TABLE public.cad_lab_projects
  ADD CONSTRAINT cad_lab_projects_illustration_style_check
    CHECK (illustration_style IN ('blueprint', 'photoreal', 'isometric_vector', 'photography'));

COMMENT ON COLUMN public.cad_lab_projects.illustration_style IS
  'Visual style applied to the hero + all per-module images. One of: blueprint | photoreal | isometric_vector | photography.';
