/**
 * Migration: Specialist News Briefings
 *
 * Purpose: Stores MiniMax-synthesized news briefings per specialist (6am, 12pm, 5pm).
 * Briefings are generated once globally (foundry_id NULL) and injected into specialist
 * context for sweeps and chat. Optional per-foundry briefings supported for future use.
 *
 * Security:
 * - RLS: Users can view briefings for their foundry or global (foundry_id IS NULL)
 * - Service role can insert (cron job)
 *
 * Rollback: DROP TABLE specialist_briefings CASCADE
 */

CREATE TABLE IF NOT EXISTS public.specialist_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id TEXT REFERENCES public.foundries(id) ON DELETE CASCADE,
  specialist_id TEXT NOT NULL,
  briefing_type TEXT NOT NULL CHECK (briefing_type IN ('morning', 'midday', 'evening')),
  headline_summary TEXT NOT NULL,
  domain_impact TEXT NOT NULL,
  watch_items TEXT NOT NULL,
  raw_headlines JSONB DEFAULT '[]',
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  estimated_cost_usd NUMERIC(10, 6) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_specialist_briefings_lookup
  ON public.specialist_briefings (specialist_id, briefing_type, created_at DESC);

CREATE INDEX idx_specialist_briefings_foundry
  ON public.specialist_briefings (foundry_id, created_at DESC)
  WHERE foundry_id IS NOT NULL;

CREATE INDEX idx_specialist_briefings_global_latest
  ON public.specialist_briefings (specialist_id, created_at DESC)
  WHERE foundry_id IS NULL;

ALTER TABLE public.specialist_briefings ENABLE ROW LEVEL SECURITY;

-- Users can view global briefings (foundry_id IS NULL) or briefings for a foundry they belong to
CREATE POLICY "Users can view global and own foundry briefings"
  ON public.specialist_briefings FOR SELECT
  USING (
    foundry_id IS NULL
    OR foundry_id IN (
      SELECT fm.foundry_id
      FROM public.foundry_memberships fm
      WHERE fm.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert briefings"
  ON public.specialist_briefings FOR INSERT
  WITH CHECK (true);
