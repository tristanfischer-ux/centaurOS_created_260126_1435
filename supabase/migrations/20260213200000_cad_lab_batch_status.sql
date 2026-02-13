/**
 * Migration: Add batch_status and batch_started_at to cad_lab_projects.
 *
 * Purpose: Track background batch generation state so the client can
 * detect an in-progress generation when returning to the page and poll
 * for completion. This enables "fire and forget" batch generation where
 * the user can navigate away without losing progress.
 *
 * Columns:
 *   batch_status   — idle | running | done | error
 *   batch_started_at — when the current/last batch was started
 *
 * Rollback:
 *   ALTER TABLE public.cad_lab_projects DROP COLUMN IF EXISTS batch_status;
 *   ALTER TABLE public.cad_lab_projects DROP COLUMN IF EXISTS batch_started_at;
 */

ALTER TABLE public.cad_lab_projects
ADD COLUMN IF NOT EXISTS batch_status TEXT NOT NULL DEFAULT 'idle'
    CHECK (batch_status IN ('idle', 'running', 'done', 'error'));

ALTER TABLE public.cad_lab_projects
ADD COLUMN IF NOT EXISTS batch_started_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.cad_lab_projects.batch_status IS 'Batch generation state: idle (no active batch), running (server is generating modules), done (all complete), error (batch failed).';
COMMENT ON COLUMN public.cad_lab_projects.batch_started_at IS 'Timestamp when the current or last batch generation was initiated.';
