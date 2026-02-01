-- Activity Stream Tables
-- Enables unified inbox on Today page with read tracking

-- ============================================================================
-- 1. task_comment_reads - Track which task comments a user has seen
-- ============================================================================

CREATE TABLE IF NOT EXISTS task_comment_reads (
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES task_comments(id) ON DELETE CASCADE,
  read_at timestamptz DEFAULT now(),
  foundry_id text NOT NULL,
  PRIMARY KEY (user_id, comment_id)
);

-- Index for efficient lookup by user
CREATE INDEX IF NOT EXISTS idx_task_comment_reads_user 
  ON task_comment_reads(user_id);

-- Index for foundry filtering
CREATE INDEX IF NOT EXISTS idx_task_comment_reads_foundry 
  ON task_comment_reads(foundry_id);

-- Enable RLS
ALTER TABLE task_comment_reads ENABLE ROW LEVEL SECURITY;

-- Users can only view their own read state
CREATE POLICY "Users can view own task comment read state" 
  ON task_comment_reads FOR SELECT 
  USING (user_id = auth.uid());

-- Users can mark comments as read (insert their own records)
CREATE POLICY "Users can mark task comments as read" 
  ON task_comment_reads FOR INSERT 
  WITH CHECK (user_id = auth.uid());

-- Users can update their own read timestamps
CREATE POLICY "Users can update own task comment read state" 
  ON task_comment_reads FOR UPDATE 
  USING (user_id = auth.uid());

-- ============================================================================
-- 2. objective_comments - Direct comments/notes on objectives
-- ============================================================================

CREATE TABLE IF NOT EXISTS objective_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  objective_id uuid NOT NULL REFERENCES objectives(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id),
  content text NOT NULL,
  is_system_log boolean DEFAULT false,
  foundry_id text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Index for fetching comments by objective
CREATE INDEX IF NOT EXISTS idx_objective_comments_objective 
  ON objective_comments(objective_id);

-- Index for foundry filtering
CREATE INDEX IF NOT EXISTS idx_objective_comments_foundry 
  ON objective_comments(foundry_id);

-- Index for fetching comments by user
CREATE INDEX IF NOT EXISTS idx_objective_comments_user 
  ON objective_comments(user_id);

-- Index for sorting by date
CREATE INDEX IF NOT EXISTS idx_objective_comments_created 
  ON objective_comments(created_at DESC);

-- Enable RLS
ALTER TABLE objective_comments ENABLE ROW LEVEL SECURITY;

-- Foundry members can view comments in their foundry
CREATE POLICY "Foundry members can view objective comments" 
  ON objective_comments FOR SELECT 
  USING (
    foundry_id = (SELECT foundry_id FROM profiles WHERE id = auth.uid())
  );

-- Foundry members can add comments to objectives in their foundry
CREATE POLICY "Foundry members can add objective comments" 
  ON objective_comments FOR INSERT 
  WITH CHECK (
    foundry_id = (SELECT foundry_id FROM profiles WHERE id = auth.uid())
    AND user_id = auth.uid()
  );

-- Users can update their own comments
CREATE POLICY "Users can update own objective comments" 
  ON objective_comments FOR UPDATE 
  USING (user_id = auth.uid());

-- Users can delete their own comments
CREATE POLICY "Users can delete own objective comments" 
  ON objective_comments FOR DELETE 
  USING (user_id = auth.uid());

-- ============================================================================
-- 3. objective_comment_reads - Track which objective comments a user has seen
-- ============================================================================

CREATE TABLE IF NOT EXISTS objective_comment_reads (
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES objective_comments(id) ON DELETE CASCADE,
  read_at timestamptz DEFAULT now(),
  foundry_id text NOT NULL,
  PRIMARY KEY (user_id, comment_id)
);

-- Index for efficient lookup by user
CREATE INDEX IF NOT EXISTS idx_objective_comment_reads_user 
  ON objective_comment_reads(user_id);

-- Index for foundry filtering
CREATE INDEX IF NOT EXISTS idx_objective_comment_reads_foundry 
  ON objective_comment_reads(foundry_id);

-- Enable RLS
ALTER TABLE objective_comment_reads ENABLE ROW LEVEL SECURITY;

-- Users can only view their own read state
CREATE POLICY "Users can view own objective comment read state" 
  ON objective_comment_reads FOR SELECT 
  USING (user_id = auth.uid());

-- Users can mark comments as read
CREATE POLICY "Users can mark objective comments as read" 
  ON objective_comment_reads FOR INSERT 
  WITH CHECK (user_id = auth.uid());

-- Users can update their own read timestamps
CREATE POLICY "Users can update own objective comment read state" 
  ON objective_comment_reads FOR UPDATE 
  USING (user_id = auth.uid());

-- ============================================================================
-- 4. Helper function to get user's foundry_id (if not exists)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_foundry_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT foundry_id FROM profiles WHERE id = auth.uid();
$$;
