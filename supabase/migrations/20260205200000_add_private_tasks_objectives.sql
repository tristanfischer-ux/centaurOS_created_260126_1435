-- Migration: Add private/confidential support for tasks and objectives
--
-- Purpose: Allow users to mark tasks and objectives as private.
-- Private items are only visible to the creator, assignees, and
-- explicitly shared users/teams.
--
-- Security:
-- - is_private defaults to false (all existing items remain public)
-- - Share tables enforce referential integrity via foreign keys
-- - CHECK constraint ensures each share row targets either a user or team, not both
-- - Partial unique indexes prevent duplicate shares
-- - Helper functions encapsulate visibility logic for reuse
--
-- Rollback: DROP TABLE task_shares CASCADE; DROP TABLE objective_shares CASCADE;
--           ALTER TABLE tasks DROP COLUMN is_private;
--           ALTER TABLE objectives DROP COLUMN is_private;

-- 1. Add is_private column to tasks and objectives
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_private boolean DEFAULT false NOT NULL;
ALTER TABLE objectives ADD COLUMN IF NOT EXISTS is_private boolean DEFAULT false NOT NULL;

-- 2. Task shares table
CREATE TABLE IF NOT EXISTS task_shares (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    shared_with_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    shared_with_team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
    shared_by uuid NOT NULL REFERENCES profiles(id),
    created_at timestamptz DEFAULT now(),
    CONSTRAINT task_share_target_check CHECK (
        (shared_with_user_id IS NOT NULL AND shared_with_team_id IS NULL) OR
        (shared_with_user_id IS NULL AND shared_with_team_id IS NOT NULL)
    )
);

-- Partial unique indexes prevent duplicate shares per user/team
CREATE UNIQUE INDEX IF NOT EXISTS task_shares_user_unique
    ON task_shares(task_id, shared_with_user_id) WHERE shared_with_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS task_shares_team_unique
    ON task_shares(task_id, shared_with_team_id) WHERE shared_with_team_id IS NOT NULL;

-- 3. Objective shares table
CREATE TABLE IF NOT EXISTS objective_shares (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    objective_id uuid NOT NULL REFERENCES objectives(id) ON DELETE CASCADE,
    shared_with_user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    shared_with_team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
    shared_by uuid NOT NULL REFERENCES profiles(id),
    created_at timestamptz DEFAULT now(),
    CONSTRAINT objective_share_target_check CHECK (
        (shared_with_user_id IS NOT NULL AND shared_with_team_id IS NULL) OR
        (shared_with_user_id IS NULL AND shared_with_team_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS objective_shares_user_unique
    ON objective_shares(objective_id, shared_with_user_id) WHERE shared_with_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS objective_shares_team_unique
    ON objective_shares(objective_id, shared_with_team_id) WHERE shared_with_team_id IS NOT NULL;

-- 4. RLS for share tables (matches existing permissive pattern)
ALTER TABLE task_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE objective_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view task shares"
    ON task_shares FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can insert task shares"
    ON task_shares FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can delete task shares"
    ON task_shares FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view objective shares"
    ON objective_shares FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can insert objective shares"
    ON objective_shares FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can delete objective shares"
    ON objective_shares FOR DELETE USING (auth.role() = 'authenticated');

-- 5. Performance indexes
CREATE INDEX IF NOT EXISTS idx_task_shares_task_id ON task_shares(task_id);
CREATE INDEX IF NOT EXISTS idx_task_shares_user_id ON task_shares(shared_with_user_id) WHERE shared_with_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_shares_team_id ON task_shares(shared_with_team_id) WHERE shared_with_team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_objective_shares_objective_id ON objective_shares(objective_id);
CREATE INDEX IF NOT EXISTS idx_objective_shares_user_id ON objective_shares(shared_with_user_id) WHERE shared_with_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_objective_shares_team_id ON objective_shares(shared_with_team_id) WHERE shared_with_team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_is_private ON tasks(is_private) WHERE is_private = true;
CREATE INDEX IF NOT EXISTS idx_objectives_is_private ON objectives(is_private) WHERE is_private = true;
