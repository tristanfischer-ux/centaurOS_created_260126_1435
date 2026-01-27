-- Add ON DELETE CASCADE to tasks -> objectives
BEGIN;

ALTER TABLE "public"."tasks"
DROP CONSTRAINT IF EXISTS "tasks_objective_id_fkey";

ALTER TABLE "public"."tasks"
ADD CONSTRAINT "tasks_objective_id_fkey"
FOREIGN KEY ("objective_id")
REFERENCES "public"."objectives"("id")
ON DELETE CASCADE;

-- Add DELETE policy for objectives
DROP POLICY IF EXISTS "Users can delete objectives" ON "public"."objectives";
CREATE POLICY "Users can delete objectives" ON "public"."objectives"
FOR DELETE
USING (auth.uid() = creator_id);

-- Add DELETE policy for tasks
DROP POLICY IF EXISTS "Users can delete tasks" ON "public"."tasks";
CREATE POLICY "Users can delete tasks" ON "public"."tasks"
FOR DELETE
USING (auth.uid() = creator_id);

COMMIT;
