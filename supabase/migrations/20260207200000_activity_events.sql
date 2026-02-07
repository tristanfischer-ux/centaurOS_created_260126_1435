/**
 * Migration: Create activity_events table for behavioral intelligence
 * 
 * Purpose: Capture user behavior signals (page views, searches, feature usage,
 * time-on-page) so the AI Context Builder can learn patterns and improve
 * recommendation relevance over time.
 * 
 * Security:
 * - RLS ensures users can only insert events for their own foundry
 * - Read access is limited to the user's own foundry
 * - Events are lightweight and auto-pruned after 90 days
 * 
 * Related:
 * - Hook: src/hooks/useActivityTracker.ts
 * - Action: src/actions/activity-events.ts
 * - Intelligence: src/lib/activity-intelligence/insights.ts
 * 
 * Rollback: DROP TABLE IF EXISTS activity_events;
 */

-- Create activity_events table
CREATE TABLE IF NOT EXISTS public.activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  foundry_id TEXT NOT NULL REFERENCES public.foundries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can insert events for their own foundry
CREATE POLICY "Users can insert own foundry events"
  ON public.activity_events FOR INSERT
  WITH CHECK (
    foundry_id = get_my_foundry_id()
    AND user_id = auth.uid()
  );

-- Policy: Users can read events from their own foundry
CREATE POLICY "Users can read own foundry events"
  ON public.activity_events FOR SELECT
  USING (foundry_id = get_my_foundry_id());

-- Composite index for querying by foundry + type + time (most common pattern)
CREATE INDEX IF NOT EXISTS idx_activity_events_foundry_type_time
  ON public.activity_events (foundry_id, event_type, created_at DESC);

-- Index for per-user queries
CREATE INDEX IF NOT EXISTS idx_activity_events_user_time
  ON public.activity_events (user_id, created_at DESC);

-- Add comments
COMMENT ON TABLE public.activity_events IS 'Captures user behavior signals for AI-powered behavioral intelligence. Auto-pruned after 90 days.';
COMMENT ON COLUMN public.activity_events.event_type IS 'Event category: page_view, search, feature_use, time_spent, advisory_question';
COMMENT ON COLUMN public.activity_events.event_data IS 'Flexible payload: { page, query, duration_seconds, feature, ... }';

-- Auto-cleanup function: delete events older than 90 days
-- This can be called via a Supabase cron job or Edge Function
CREATE OR REPLACE FUNCTION cleanup_old_activity_events()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM public.activity_events
  WHERE created_at < now() - interval '90 days';
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION cleanup_old_activity_events IS 'Deletes activity events older than 90 days. Call via cron or scheduled Edge Function.';
