-- Add skills system for smart task routing
-- This enables the Smart Routing Agent to match tasks to skilled team members

-- Add skills column to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS skills text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS capacity_score integer DEFAULT 100; -- 0-100, lower = more available

-- Create index for skill-based queries
CREATE INDEX IF NOT EXISTS idx_profiles_skills ON public.profiles USING GIN (skills);

-- Create task requirements table for skill matching
CREATE TABLE IF NOT EXISTS public.task_requirements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    required_skills text[] DEFAULT '{}',
    preferred_skills text[] DEFAULT '{}',
    estimated_hours numeric,
    complexity text CHECK (complexity IN ('low', 'medium', 'high', 'expert')),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.task_requirements ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view task requirements in their foundry
CREATE POLICY "Users can view task requirements" ON public.task_requirements
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.tasks t, public.profiles p
            WHERE t.id = task_requirements.task_id
            AND p.id = auth.uid()
            AND t.foundry_id = p.foundry_id
        )
    );

-- Policy: Users can create task requirements for their tasks
CREATE POLICY "Users can create task requirements" ON public.task_requirements
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.tasks t, public.profiles p
            WHERE t.id = task_requirements.task_id
            AND p.id = auth.uid()
            AND t.foundry_id = p.foundry_id
        )
    );

-- Function to calculate workload score for a user
CREATE OR REPLACE FUNCTION public.calculate_workload_score(p_user_id uuid)
RETURNS integer AS $$
DECLARE
    active_tasks_count integer;
    pending_tasks_count integer;
    workload_score integer;
BEGIN
    -- Count active tasks
    SELECT COUNT(*) INTO active_tasks_count
    FROM public.tasks t
    LEFT JOIN public.task_assignees ta ON t.id = ta.task_id
    WHERE (t.assignee_id = p_user_id OR ta.profile_id = p_user_id)
    AND t.status = 'Accepted';
    
    -- Count pending tasks
    SELECT COUNT(*) INTO pending_tasks_count
    FROM public.tasks t
    LEFT JOIN public.task_assignees ta ON t.id = ta.task_id
    WHERE (t.assignee_id = p_user_id OR ta.profile_id = p_user_id)
    AND t.status = 'Pending';
    
    -- Calculate score (higher = busier, 0-100 scale)
    workload_score := LEAST(100, (active_tasks_count * 20) + (pending_tasks_count * 10));
    
    RETURN workload_score;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to find best assignees for a task based on skills and workload
CREATE OR REPLACE FUNCTION public.suggest_task_assignees(
    p_required_skills text[] DEFAULT '{}',
    p_preferred_skills text[] DEFAULT '{}',
    p_exclude_user_ids uuid[] DEFAULT '{}',
    p_limit integer DEFAULT 5
)
RETURNS TABLE (
    user_id uuid,
    full_name text,
    role text,
    skills text[],
    skill_match_score integer,
    workload_score integer,
    total_score integer,
    match_reason text
) AS $$
BEGIN
    RETURN QUERY
    WITH user_scores AS (
        SELECT 
            p.id as user_id,
            p.full_name,
            p.role::text,
            p.skills,
            -- Skill match score (0-50)
            CASE 
                WHEN p_required_skills = '{}' THEN 25
                ELSE LEAST(50, (
                    SELECT COUNT(*) FROM unnest(p_required_skills) rs 
                    WHERE rs = ANY(p.skills)
                ) * 25)
            END as skill_match_score,
            -- Workload score (inverted so lower workload = higher score, 0-50)
            50 - (public.calculate_workload_score(p.id) / 2) as availability_score
        FROM public.profiles p
        WHERE p.foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
        AND p.role IN ('Apprentice', 'Executive')
        AND p.id != ALL(p_exclude_user_ids)
    )
    SELECT 
        us.user_id,
        us.full_name,
        us.role,
        us.skills,
        us.skill_match_score::integer,
        (50 - us.availability_score)::integer as workload_score,
        (us.skill_match_score + us.availability_score)::integer as total_score,
        CASE
            WHEN us.skill_match_score >= 40 AND us.availability_score >= 40 THEN 'Great match - right skills & available'
            WHEN us.skill_match_score >= 40 THEN 'Skills match but busy'
            WHEN us.availability_score >= 40 THEN 'Available but may lack some skills'
            ELSE 'Possible match'
        END as match_reason
    FROM user_scores us
    ORDER BY (us.skill_match_score + us.availability_score) DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.calculate_workload_score TO authenticated;
GRANT EXECUTE ON FUNCTION public.suggest_task_assignees TO authenticated;

COMMENT ON COLUMN public.profiles.skills IS 'Array of skill tags for task routing';
COMMENT ON COLUMN public.profiles.capacity_score IS 'Current workload capacity (0-100, lower = more available)';
COMMENT ON FUNCTION public.suggest_task_assignees IS 'Suggests best assignees based on skills and availability';
