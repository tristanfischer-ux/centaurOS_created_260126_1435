/**
 * Migration: Create insight_log table
 * 
 * Purpose: Append-only log of every AI insight/nudge surfaced to a user.
 * Enables deduplication (same insight won't repeat), narrative continuity
 * (briefing can say "yesterday I mentioned X — here's an update"), and
 * implicit feedback tracking (was_acted_on inferred from behavior).
 *
 * Security:
 * - RLS enforced: users can only read/write their own insight log
 * - Scoped per user + foundry for multi-tenant isolation
 *
 * Related:
 * - src/actions/nudges.ts — logs insights after generating briefings
 * - src/actions/progress-report.ts — logs insights after generating weekly reports
 * - src/lib/intelligence/feedback-tracker.ts — infers was_acted_on from behavior
 * 
 * Rollback: DROP TABLE insight_log CASCADE
 */

-- Create insight_log table (append-only)
CREATE TABLE IF NOT EXISTS insight_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  foundry_id UUID NOT NULL REFERENCES foundries(id) ON DELETE CASCADE,

  -- What was surfaced
  insight_type TEXT NOT NULL CHECK (insight_type IN (
    'briefing_narrative', 'nudge', 'weekly_highlight', 'weekly_concern', 'weekly_priority'
  )),
  content_hash TEXT NOT NULL,        -- SHA-256 of content for dedup
  content_summary TEXT NOT NULL,     -- Short text summary of the insight

  -- Feedback (inferred, not explicit)
  was_acted_on BOOLEAN,              -- NULL = unknown, true/false = inferred
  dismissed BOOLEAN DEFAULT FALSE,

  -- Timestamps
  surfaced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acted_on_at TIMESTAMPTZ           -- When the action was inferred
);

-- RLS: Users can only access their own insight log
ALTER TABLE insight_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own insight log"
  ON insight_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own insight log"
  ON insight_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own insight log"
  ON insight_log FOR UPDATE
  USING (auth.uid() = user_id);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_insight_log_user_foundry_surfaced
  ON insight_log(user_id, foundry_id, surfaced_at DESC);

CREATE INDEX IF NOT EXISTS idx_insight_log_content_hash
  ON insight_log(user_id, foundry_id, content_hash);

CREATE INDEX IF NOT EXISTS idx_insight_log_feedback
  ON insight_log(user_id, foundry_id, was_acted_on)
  WHERE was_acted_on IS NULL;
