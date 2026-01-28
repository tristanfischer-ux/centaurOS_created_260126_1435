-- 1. Enable UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Enumerations
CREATE TYPE "public"."member_role" AS ENUM ('Executive', 'Apprentice', 'AI_Agent');
CREATE TYPE "public"."task_status" AS ENUM ('Pending', 'Accepted', 'Rejected', 'Amended', 'Amended_Pending_Approval');
CREATE TYPE "public"."rfq_status" AS ENUM ('Open', 'Bidding', 'Awarded', 'Closed');
CREATE TYPE "public"."provider_type" AS ENUM ('Legal', 'Financial', 'VC', 'Additive Manufacturing', 'Fabrication');
CREATE TYPE "public"."coverage_status" AS ENUM ('covered', 'partial', 'gap', 'not_applicable');
CREATE TYPE "public"."function_category" AS ENUM ('Operations', 'Finance', 'Sales & Marketing', 'HR & People', 'Legal & Compliance', 'Technology', 'Product', 'Customer Success');

-- 3. Tables

-- PROFILES
CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" uuid NOT NULL REFERENCES "auth"."users"("id") ON DELETE CASCADE,
    "email" text NOT NULL,
    "full_name" text,
    "avatar_url" text,
    "role" "public"."member_role" NOT NULL DEFAULT 'Apprentice'::member_role,
    "foundry_id" text NOT NULL,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    PRIMARY KEY ("id"),
    UNIQUE ("email")
);

-- OBJECTIVES
CREATE TABLE IF NOT EXISTS "public"."objectives" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "title" text NOT NULL,
    "description" text,
    "status" text DEFAULT 'In Progress',
    "progress" integer DEFAULT 0,
    "parent_objective_id" uuid REFERENCES "public"."objectives"("id"),
    "creator_id" uuid NOT NULL REFERENCES "public"."profiles"("id"),
    "foundry_id" text NOT NULL,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    PRIMARY KEY ("id")
);

-- TASKS
CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "title" text NOT NULL,
    "description" text,
    "status" "public"."task_status" DEFAULT 'Pending'::task_status,
    "creator_id" uuid NOT NULL REFERENCES "public"."profiles"("id"),
    "assignee_id" uuid REFERENCES "public"."profiles"("id"),
    "objective_id" uuid REFERENCES "public"."objectives"("id"),
    "foundry_id" text NOT NULL,
    "start_date" timestamptz,
    "end_date" timestamptz,
    "amendment_notes" text,
    "forwarding_history" jsonb DEFAULT '[]'::jsonb,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    PRIMARY KEY ("id")
);

-- TASK COMMENTS
CREATE TABLE IF NOT EXISTS "public"."task_comments" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "task_id" uuid NOT NULL REFERENCES "public"."tasks"("id") ON DELETE CASCADE,
    "user_id" uuid NOT NULL REFERENCES "public"."profiles"("id"),
    "content" text NOT NULL,
    "is_system_log" boolean DEFAULT false,
    "foundry_id" text NOT NULL,
    "created_at" timestamptz DEFAULT now(),
    PRIMARY KEY ("id")
);

-- MARKETPLACE
CREATE TABLE IF NOT EXISTS "public"."service_providers" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "company_name" text NOT NULL,
    "provider_type" "public"."provider_type" NOT NULL,
    "contact_info" jsonb,
    "is_verified" boolean DEFAULT false,
    PRIMARY KEY ("id")
);

-- BUSINESS FUNCTIONS (Org Blueprint)
CREATE TABLE IF NOT EXISTS "public"."business_functions" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "foundry_id" text NOT NULL,
    "category" "public"."function_category" NOT NULL,
    "name" text NOT NULL,
    "description" text,
    "coverage_status" "public"."coverage_status" DEFAULT 'gap'::coverage_status,
    "covered_by" text,
    "covered_by_type" text CHECK ("covered_by_type" IN ('internal', 'external')),
    "notes" text,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    PRIMARY KEY ("id")
);

-- RLS Policies
ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."objectives" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."task_comments" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all profiles" ON "public"."profiles" FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert profiles" ON "public"."profiles" FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can view all objectives" ON "public"."objectives" FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can create objectives" ON "public"."objectives" FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can view all tasks" ON "public"."tasks" FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can insert tasks" ON "public"."tasks" FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users can update tasks" ON "public"."tasks" FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Users can view comments" ON "public"."task_comments" FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can insert comments" ON "public"."task_comments" FOR INSERT WITH CHECK (auth.role() = 'authenticated');

ALTER TABLE "public"."business_functions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view business functions" ON "public"."business_functions" FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can insert business functions" ON "public"."business_functions" FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users can update business functions" ON "public"."business_functions" FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Users can delete business functions" ON "public"."business_functions" FOR DELETE USING (auth.role() = 'authenticated');
