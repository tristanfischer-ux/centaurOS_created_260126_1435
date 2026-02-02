-- =============================================
-- MIGRATION: Enforce Task Objectives
-- =============================================
-- Ensure all tasks have an objective by creating a default
-- "No objective set" objective for each foundry, then making
-- tasks.objective_id NOT NULL to enforce data integrity.

-- Step 1: Create "No objective set" objective for each foundry
-- This is idempotent - only creates if it doesn't exist
INSERT INTO public.objectives (
    id,
    title,
    description,
    status,
    progress,
    creator_id,
    foundry_id,
    created_at,
    updated_at
)
SELECT 
    gen_random_uuid(),
    'No objective set',
    'Default objective for tasks without a specific objective',
    'In Progress',
    0,
    f.owner_id,
    f.id,
    now(),
    now()
FROM public.foundries f
WHERE NOT EXISTS (
    SELECT 1 
    FROM public.objectives o 
    WHERE o.foundry_id = f.id 
    AND o.title = 'No objective set'
)
AND f.owner_id IS NOT NULL;  -- Only for foundries with an owner

-- Step 2: For foundries without owners, use the first available profile in that foundry
INSERT INTO public.objectives (
    id,
    title,
    description,
    status,
    progress,
    creator_id,
    foundry_id,
    created_at,
    updated_at
)
SELECT 
    gen_random_uuid(),
    'No objective set',
    'Default objective for tasks without a specific objective',
    'In Progress',
    0,
    p.id,
    f.id,
    now(),
    now()
FROM public.foundries f
CROSS JOIN LATERAL (
    SELECT id 
    FROM public.profiles 
    WHERE foundry_id = f.id 
    ORDER BY created_at 
    LIMIT 1
) p
WHERE NOT EXISTS (
    SELECT 1 
    FROM public.objectives o 
    WHERE o.foundry_id = f.id 
    AND o.title = 'No objective set'
)
AND f.owner_id IS NULL;  -- Only for foundries without an owner

-- Step 3: Update all tasks with NULL objective_id to point to "No objective set"
UPDATE public.tasks t
SET objective_id = o.id
FROM public.objectives o
WHERE t.objective_id IS NULL
AND o.foundry_id = t.foundry_id
AND o.title = 'No objective set';

-- Step 4: Make objective_id NOT NULL
ALTER TABLE public.tasks 
ALTER COLUMN objective_id SET NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.tasks.objective_id IS 'Required reference to an objective. Uses "No objective set" as default.';

-- Verify the constraint was added
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'tasks' 
        AND column_name = 'objective_id' 
        AND is_nullable = 'NO'
    ) THEN
        RAISE EXCEPTION 'Failed to set objective_id as NOT NULL';
    END IF;
    
    RAISE NOTICE 'objective_id constraint successfully applied to tasks table';
END $$;
