-- Migration: add illustration_style column to cad_lab_projects
--
-- INTENT: Project-level illustration style that gates the hero + per-module
-- image generation prompts. MVP ships three styles:
--   blueprint         — current default (engineering drawing, white BG)
--   photoreal         — physical materials, studio lighting
--   isometric_vector  — flat SaaS-landing-page style
--
-- The column is NOT NULL with a default of 'blueprint' so every existing row
-- backfills to the current behaviour silently. The CHECK constraint is the
-- canonical gate — server actions validate UUIDs and length caps elsewhere,
-- but the enum shape is owned by the database.
--
-- Changing style is a silent preference update (does not auto-regenerate).
-- The next hero/module regeneration reads this column and injects the
-- matching style-preamble via src/lib/cad-lab/illustration-styles.ts.

ALTER TABLE public.cad_lab_projects
  ADD COLUMN IF NOT EXISTS illustration_style text NOT NULL DEFAULT 'blueprint';

ALTER TABLE public.cad_lab_projects
  DROP CONSTRAINT IF EXISTS cad_lab_projects_illustration_style_check;

ALTER TABLE public.cad_lab_projects
  ADD CONSTRAINT cad_lab_projects_illustration_style_check
    CHECK (illustration_style IN ('blueprint', 'photoreal', 'isometric_vector'));

COMMENT ON COLUMN public.cad_lab_projects.illustration_style IS
  'Project-level illustration style. Silent preference — next hero/module regeneration injects the matching style preamble. One of: blueprint (default, engineering drawing), photoreal (studio render), isometric_vector (flat SaaS style).';
