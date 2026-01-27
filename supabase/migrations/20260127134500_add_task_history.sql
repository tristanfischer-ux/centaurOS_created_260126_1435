-- Create task_history table for auditing
CREATE TABLE IF NOT EXISTS "public"."task_history" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "task_id" uuid NOT NULL REFERENCES "public"."tasks"("id") ON DELETE CASCADE,
    "user_id" uuid NOT NULL REFERENCES "public"."profiles"("id"),
    "action_type" text NOT NULL, -- 'CREATED', 'UPDATED', 'STATUS_CHANGE', 'ASSIGNED', 'COMPLETED'
    "changes" jsonb DEFAULT '{}'::jsonb, -- Store { field: { old: val, new: val } }
    "created_at" timestamptz DEFAULT now(),
    PRIMARY KEY ("id")
);

-- Enable RLS
ALTER TABLE "public"."task_history" ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view history of tasks they can view" 
ON "public"."task_history"
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM "public"."tasks" 
        WHERE "tasks"."id" = "task_history"."task_id"
    )
    -- Tasks policy handles auth check implicitly if we just check existence? 
    -- Actually policies rely on the user being able to select from tasks. 
    -- If tasks RLS is generic (authenticated), this is fine.
    -- Better: auth.role() = 'authenticated' matches strictness of other tables currently.
    AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can insert history" 
ON "public"."task_history" 
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');
