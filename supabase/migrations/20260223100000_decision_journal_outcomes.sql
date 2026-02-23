-- Add outcome tracking columns to specialist_decision_journal
-- Enables the decision journal to record what happened after decisions were made,
-- closing the learning loop: "Last time we tried X, here's what happened."

ALTER TABLE specialist_decision_journal
  ADD COLUMN IF NOT EXISTS outcome_status text NOT NULL DEFAULT 'pending'
    CHECK (outcome_status IN ('pending', 'positive', 'negative', 'mixed', 'unknown')),
  ADD COLUMN IF NOT EXISTS outcome_notes text,
  ADD COLUMN IF NOT EXISTS outcome_recorded_at timestamptz;

-- Index for querying decisions needing outcome follow-up
CREATE INDEX IF NOT EXISTS idx_decision_journal_outcome_pending
  ON specialist_decision_journal (foundry_id, outcome_status, created_at)
  WHERE outcome_status = 'pending';

COMMENT ON COLUMN specialist_decision_journal.outcome_status IS 'Result of the decision: pending (not yet assessed), positive, negative, mixed, unknown';
COMMENT ON COLUMN specialist_decision_journal.outcome_notes IS 'Human or AI notes on what actually happened after this decision';
COMMENT ON COLUMN specialist_decision_journal.outcome_recorded_at IS 'When the outcome was first recorded';
