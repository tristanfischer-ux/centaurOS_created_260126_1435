/**
 * Migration: Investor intel hardening (Red Team #2 fixes)
 *
 * M-2: Add length CHECK constraints on text fields
 * M-3: Add generated_by_user_id for audit trail
 */

-- M-3: User attribution for cost tracking
ALTER TABLE investor_news_intel
  ADD COLUMN IF NOT EXISTS generated_by_user_id uuid REFERENCES profiles(id);

CREATE INDEX IF NOT EXISTS idx_investor_news_intel_user
  ON investor_news_intel (generated_by_user_id, generated_at DESC);

-- M-2: Length constraints on AI-generated text fields
ALTER TABLE investor_news_intel
  ADD CONSTRAINT chk_intel_summary_length CHECK (length(intel_summary) <= 10000);

ALTER TABLE investor_news_intel
  ADD CONSTRAINT chk_social_activity_length CHECK (social_activity IS NULL OR length(social_activity) <= 5000);

ALTER TABLE investor_news_intel
  ADD CONSTRAINT chk_current_focus_length CHECK (current_focus IS NULL OR length(current_focus) <= 5000);

ALTER TABLE investor_news_intel
  ADD CONSTRAINT chk_recent_deals_length CHECK (recent_deals IS NULL OR length(recent_deals) <= 5000);
