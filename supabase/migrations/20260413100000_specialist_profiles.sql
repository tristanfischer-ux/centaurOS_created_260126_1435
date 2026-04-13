-- ============================================================================
-- Migration: specialist_profiles
-- Date: 2026-04-13
--
-- INTENT: Create database-level identity for the 13 AI specialists so they
-- can be assigned to tasks alongside human team members.
--
-- DECISION: We use a separate `specialist_profiles` table rather than
-- inserting into `profiles` because `profiles.id` has a FK to `auth.users(id)`
-- and specialists are not real auth users. This table provides stable UUIDs
-- that can be referenced from `task_assignees` via a new nullable column.
--
-- The approach:
-- 1. `specialist_profiles` — lightweight identity table for AI specialists
-- 2. `task_assignees.specialist_id` — nullable FK so tasks can be assigned
--    to either a human profile OR an AI specialist (but not both per row)
-- 3. CHECK constraint ensures exactly one of profile_id / specialist_id is set
-- ============================================================================

-- ─── 1. Specialist Profiles Table ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.specialist_profiles (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    specialist_key text NOT NULL UNIQUE,  -- matches SpecialistId in TypeScript (e.g. 'strategist')
    display_name   text NOT NULL,          -- human name (e.g. 'Sage')
    title          text NOT NULL,          -- functional title (e.g. 'Strategy')
    bio            text,
    role           text NOT NULL DEFAULT 'AI_Agent',
    is_active      boolean NOT NULL DEFAULT true,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

-- SECURITY: Readable by all authenticated users (specialists appear in assignee pickers).
-- No INSERT/UPDATE/DELETE for regular users — only migrations and service role.
ALTER TABLE public.specialist_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "specialist_profiles_select_authenticated"
    ON public.specialist_profiles
    FOR SELECT
    TO authenticated
    USING (true);

-- ─── 2. Seed the 13 Specialists ───────────────────────────────────────────────
-- Hardcoded deterministic UUIDs for stability across environments.
-- Generated via uuid_generate_v5(namespace, specialist_key).

INSERT INTO public.specialist_profiles (id, specialist_key, display_name, title, bio) VALUES
    ('a1000000-0000-4000-8000-000000000001', 'strategist',          'Sage',   'Strategy',            'Market sizing, competitive landscapes, positioning, and go-to-market playbooks.'),
    ('a1000000-0000-4000-8000-000000000002', 'cto',                 'Max',    'CTO',                 'Technical architecture, engineering trade-offs, and technology strategy.'),
    ('a1000000-0000-4000-8000-000000000003', 'vp-engineering',      'Jian',   'VP Engineering',      'Engineering execution, sprint planning, code quality, and team velocity.'),
    ('a1000000-0000-4000-8000-000000000004', 'vp-manufacturing',    'Fang',   'VP Manufacturing',    'Production processes, supplier management, quality control, and lean manufacturing.'),
    ('a1000000-0000-4000-8000-000000000005', 'vp-supply-chain',     'Chase',  'VP Supply Chain',     'Supply chain optimization, logistics, procurement, and vendor negotiations.'),
    ('a1000000-0000-4000-8000-000000000006', 'product-lead',        'Priya',  'Product Development', 'Product strategy, roadmaps, user research, and feature prioritization.'),
    ('a1000000-0000-4000-8000-000000000007', 'growth-marketer',     'Mia',    'Marketing',           'Growth strategy, brand positioning, content marketing, and demand generation.'),
    ('a1000000-0000-4000-8000-000000000008', 'sales-lead',          'Sal',    'Sales',               'Sales strategy, pipeline development, deal structuring, and customer acquisition.'),
    ('a1000000-0000-4000-8000-000000000009', 'chief-of-staff',      'Cal',    'Chief of Staff',      'Operations, cross-functional coordination, meeting facilitation, and OKR tracking.'),
    ('a1000000-0000-4000-8000-00000000000a', 'finance-lead',        'Finn',   'Finance',             'Financial modeling, unit economics, cash flow management, and budget planning.'),
    ('a1000000-0000-4000-8000-00000000000b', 'fundraising-advisor', 'Fiona',  'Fundraising',         'Fundraising strategy, investor targeting, pitch preparation, and due diligence.'),
    ('a1000000-0000-4000-8000-00000000000c', 'hiring-team',         'Harper', 'HR',                  'Talent strategy, hiring processes, culture building, and team development.'),
    ('a1000000-0000-4000-8000-00000000000d', 'legal-counsel',       'Leo',    'Legal',               'Contract review, IP protection, compliance frameworks, and regulatory guidance.')
ON CONFLICT (specialist_key) DO NOTHING;

-- ─── 3. Extend task_assignees with specialist assignment ──────────────────────

ALTER TABLE public.task_assignees
    ADD COLUMN IF NOT EXISTS specialist_id uuid REFERENCES public.specialist_profiles(id);

-- GOTCHA: Existing rows have profile_id set. New rows can have EITHER profile_id
-- OR specialist_id, but not both. We add a CHECK constraint for this.
-- profile_id already has a NOT NULL constraint implicitly via existing data,
-- but we need to make it nullable first for specialist-only assignments.
ALTER TABLE public.task_assignees
    ALTER COLUMN profile_id DROP NOT NULL;

-- Ensure exactly one assignee type per row
ALTER TABLE public.task_assignees
    ADD CONSTRAINT task_assignees_one_assignee_type
    CHECK (
        (profile_id IS NOT NULL AND specialist_id IS NULL) OR
        (profile_id IS NULL AND specialist_id IS NOT NULL)
    );

-- Index for specialist assignment lookups
CREATE INDEX IF NOT EXISTS idx_task_assignees_specialist_id
    ON public.task_assignees (specialist_id)
    WHERE specialist_id IS NOT NULL;

-- ─── 4. RLS for task_assignees specialist column ──────────────────────────────
-- Existing RLS policies on task_assignees reference profile_id.
-- Specialist assignments are created by authenticated users who own the task,
-- so existing foundry-scoped policies still apply (they check task ownership).

COMMENT ON TABLE public.specialist_profiles IS
    'AI specialist identities for task assignment. Maps to SpecialistId in TypeScript.';
COMMENT ON COLUMN public.task_assignees.specialist_id IS
    'AI specialist assigned to this task. Mutually exclusive with profile_id.';
