-- Teams & Multi-Assignee Migration
-- Adds support for teams and multiple task assignees

-- 1. Teams table
CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    "name" text NOT NULL,
    "foundry_id" text NOT NULL,
    "is_auto_generated" boolean DEFAULT false,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now()
);

-- 2. Team members junction table
CREATE TABLE IF NOT EXISTS "public"."team_members" (
    "team_id" uuid NOT NULL REFERENCES "public"."teams"(id) ON DELETE CASCADE,
    "profile_id" uuid NOT NULL REFERENCES "public"."profiles"(id) ON DELETE CASCADE,
    "created_at" timestamptz DEFAULT now(),
    PRIMARY KEY ("team_id", "profile_id")
);

-- 3. Task assignees junction table (replaces single assignee_id)
CREATE TABLE IF NOT EXISTS "public"."task_assignees" (
    "id" uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    "task_id" uuid NOT NULL REFERENCES "public"."tasks"(id) ON DELETE CASCADE,
    "profile_id" uuid NOT NULL REFERENCES "public"."profiles"(id) ON DELETE CASCADE,
    "team_id" uuid REFERENCES "public"."teams"(id) ON DELETE SET NULL,
    "created_at" timestamptz DEFAULT now(),
    UNIQUE("task_id", "profile_id")
);

-- 4. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_teams_foundry ON "public"."teams"("foundry_id");
CREATE INDEX IF NOT EXISTS idx_team_members_profile ON "public"."team_members"("profile_id");
CREATE INDEX IF NOT EXISTS idx_task_assignees_task ON "public"."task_assignees"("task_id");
CREATE INDEX IF NOT EXISTS idx_task_assignees_profile ON "public"."task_assignees"("profile_id");
CREATE INDEX IF NOT EXISTS idx_task_assignees_team ON "public"."task_assignees"("team_id");

-- 5. Enable RLS
ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."team_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."task_assignees" ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for teams
CREATE POLICY "Users can view all teams" ON "public"."teams" 
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can create teams" ON "public"."teams" 
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users can update teams" ON "public"."teams" 
    FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Users can delete teams" ON "public"."teams" 
    FOR DELETE USING (auth.role() = 'authenticated');

-- 7. RLS Policies for team_members
CREATE POLICY "Users can view team members" ON "public"."team_members" 
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can add team members" ON "public"."team_members" 
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users can remove team members" ON "public"."team_members" 
    FOR DELETE USING (auth.role() = 'authenticated');

-- 8. RLS Policies for task_assignees
CREATE POLICY "Users can view task assignees" ON "public"."task_assignees" 
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can add task assignees" ON "public"."task_assignees" 
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users can remove task assignees" ON "public"."task_assignees" 
    FOR DELETE USING (auth.role() = 'authenticated');

-- 9. Migrate existing assignee_id data to task_assignees
INSERT INTO "public"."task_assignees" ("task_id", "profile_id")
SELECT "id", "assignee_id" FROM "public"."tasks" 
WHERE "assignee_id" IS NOT NULL
ON CONFLICT DO NOTHING;

-- Note: assignee_id column kept on tasks table for backward compatibility
-- Can be deprecated in future migration after full rollout
