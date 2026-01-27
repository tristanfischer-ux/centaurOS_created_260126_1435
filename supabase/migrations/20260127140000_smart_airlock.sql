-- Create Risk Level Type (if not exists)
DO $$ BEGIN
    CREATE TYPE "public"."risk_level" AS ENUM ('Low', 'Medium', 'High');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Update Task Status Type
ALTER TYPE "public"."task_status" ADD VALUE IF NOT EXISTS 'Pending_Peer_Review';
ALTER TYPE "public"."task_status" ADD VALUE IF NOT EXISTS 'Pending_Executive_Approval';

-- Add columns to tasks table
ALTER TABLE "public"."tasks"
ADD COLUMN IF NOT EXISTS "risk_level" "public"."risk_level" NOT NULL DEFAULT 'Low'::risk_level,
ADD COLUMN IF NOT EXISTS "client_visible" boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS "nudge_count" integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS "last_nudge_at" timestamptz;

-- Add index
CREATE INDEX IF NOT EXISTS "tasks_risk_level_idx" ON "public"."tasks" ("risk_level");
