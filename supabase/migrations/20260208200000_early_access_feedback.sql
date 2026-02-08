/**
 * Migration: Add early_access_feedback table
 * 
 * Purpose: Capture contextual feedback from early access users.
 * Feedback categories: bug, idea, confusion, praise.
 * Each submission captures the page route and optional feature name
 * so feedback is actionable and traceable.
 * 
 * Security:
 * - RLS policy: users can insert their own feedback
 * - RLS policy: foundry admins (Founder/Executive) can read feedback from their foundry
 * - Users cannot read or modify other users' feedback
 * 
 * Rollback: DROP TABLE early_access_feedback CASCADE
 */

-- Create feedback category enum
DO $$ BEGIN
  CREATE TYPE feedback_category AS ENUM ('bug', 'idea', 'confusion', 'praise');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create the feedback table
CREATE TABLE IF NOT EXISTS early_access_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  foundry_id UUID NOT NULL,
  category feedback_category NOT NULL DEFAULT 'idea',
  message TEXT NOT NULL,
  page_route TEXT,
  feature_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_early_access_feedback_foundry 
  ON early_access_feedback(foundry_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_early_access_feedback_user 
  ON early_access_feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_early_access_feedback_category 
  ON early_access_feedback(category);

-- Enable RLS
ALTER TABLE early_access_feedback ENABLE ROW LEVEL SECURITY;

-- RLS: Users can insert their own feedback
CREATE POLICY "Users can submit feedback"
  ON early_access_feedback
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS: Users can view their own feedback
CREATE POLICY "Users can view own feedback"
  ON early_access_feedback
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS: Foundry admins (Founder/Executive) can view all feedback for their foundry
CREATE POLICY "Admins can view foundry feedback"
  ON early_access_feedback
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM foundry_memberships fm
      WHERE fm.foundry_id = early_access_feedback.foundry_id
        AND fm.profile_id = auth.uid()
        AND fm.role IN ('Founder', 'Executive')
    )
  );
