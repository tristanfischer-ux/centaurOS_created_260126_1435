/*
  FIX MISSING MIGRATIONS
  Run this in your Supabase Dashboard SQL Editor to resolve the 'client_visible' error.
*/

-- 1. Smart Airlock Columns (Risk Level, Client Visibility)
DO $$ BEGIN
    CREATE TYPE "public"."risk_level" AS ENUM ('Low', 'Medium', 'High');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TYPE "public"."task_status" ADD VALUE IF NOT EXISTS 'Pending_Peer_Review';
ALTER TYPE "public"."task_status" ADD VALUE IF NOT EXISTS 'Pending_Executive_Approval';

ALTER TABLE "public"."tasks"
ADD COLUMN IF NOT EXISTS "risk_level" "public"."risk_level" NOT NULL DEFAULT 'Low'::risk_level,
ADD COLUMN IF NOT EXISTS "client_visible" boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS "nudge_count" integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS "last_nudge_at" timestamptz;

CREATE INDEX IF NOT EXISTS "tasks_risk_level_idx" ON "public"."tasks" ("risk_level");

-- 2. Add 'Completed' Status
ALTER TYPE "public"."task_status" ADD VALUE IF NOT EXISTS 'Completed';

-- 3. Add Profile Bio/Phones
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_number text;
