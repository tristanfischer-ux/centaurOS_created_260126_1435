/**
 * Migration: Create early_access_feedback table (fix for 20260208200000)
 * 
 * The original migration failed because it used UUID for foundry_id
 * but foundries.id is TEXT. This creates the table correctly.
 */

-- Create feedback category enum
DO $$ BEGIN
  CREATE TYPE feedback_category AS ENUM ('bug', 'idea', 'confusion', 'praise');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create the feedback table with TEXT foundry_id
CREATE TABLE IF NOT EXISTS early_access_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  foundry_id TEXT NOT NULL,
  category feedback_category NOT NULL DEFAULT 'idea',
  message TEXT NOT NULL,
  page_route TEXT,
  feature_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_early_access_feedback_foundry 
  ON early_access_feedback(foundry_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_early_access_feedback_user 
  ON early_access_feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_early_access_feedback_category 
  ON early_access_feedback(category);

-- Enable RLS
ALTER TABLE early_access_feedback ENABLE ROW LEVEL SECURITY;

-- RLS: Users can insert their own feedback
DROP POLICY IF EXISTS "Users can submit feedback" ON early_access_feedback;
CREATE POLICY "Users can submit feedback"
  ON early_access_feedback
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS: Users can view their own feedback
DROP POLICY IF EXISTS "Users can view own feedback" ON early_access_feedback;
CREATE POLICY "Users can view own feedback"
  ON early_access_feedback
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS: Foundry admins can view all feedback for their foundry
DROP POLICY IF EXISTS "Admins can view foundry feedback" ON early_access_feedback;
CREATE POLICY "Admins can view foundry feedback"
  ON early_access_feedback
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM foundry_memberships fm
      WHERE fm.foundry_id = early_access_feedback.foundry_id
        AND fm.user_id = auth.uid()
        AND fm.role IN ('Founder', 'Executive')
    )
  );
