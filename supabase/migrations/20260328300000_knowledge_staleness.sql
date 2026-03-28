-- Knowledge vault staleness system
ALTER TABLE public.knowledge_notes
  ADD COLUMN IF NOT EXISTS is_stale BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stale_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS staleness_window_days INTEGER;

CREATE INDEX IF NOT EXISTS idx_knowledge_notes_stale
  ON public.knowledge_notes(foundry_id, is_stale) WHERE is_stale = true;
