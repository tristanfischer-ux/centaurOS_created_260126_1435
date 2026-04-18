-- Migration: bump cad_lab_projects.model_id default from claude-opus-4-6 to claude-opus-4-7.
--
-- INTENT: New projects inherit the current recommended Opus version.
-- Existing projects are NOT touched — their model_id column stays at whatever
-- was stored when they were created. Upgrading those rows would silently change
-- the model users have been running without their consent. Instead, the next
-- time a user touches the project and saves, they'll be on the new default via
-- the CLAUDE_MODELS UI constant.
--
-- Paired with src/lib/ai/models.ts — the central alias manifest — and the
-- weekly check-model-versions GitHub Action that alerts when a newer Opus
-- family model ships.

ALTER TABLE public.cad_lab_projects
  ALTER COLUMN model_id SET DEFAULT 'claude-opus-4-7';
