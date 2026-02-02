-- =============================================
-- MIGRATION: User Preferences
-- =============================================
-- Store per-user, per-foundry preferences for inbox view settings
-- including view mode (people/tasks) and task filter (my_tasks/all_tasks)

-- Create user_preferences table
CREATE TABLE IF NOT EXISTS public.user_preferences (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    foundry_id text NOT NULL,
    
    -- Inbox view preferences
    inbox_view text DEFAULT 'people' CHECK (inbox_view IN ('people', 'tasks')),
    inbox_task_filter text DEFAULT 'my_tasks' CHECK (inbox_task_filter IN ('my_tasks', 'all_tasks')),
    
    -- Timestamps
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    -- Ensure one preference record per user per foundry
    UNIQUE(profile_id, foundry_id)
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_user_preferences_profile_id 
    ON public.user_preferences(profile_id);

CREATE INDEX IF NOT EXISTS idx_user_preferences_foundry_id 
    ON public.user_preferences(foundry_id);

-- Composite index for the common query pattern (profile + foundry lookup)
CREATE INDEX IF NOT EXISTS idx_user_preferences_profile_foundry 
    ON public.user_preferences(profile_id, foundry_id);

-- Enable RLS
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only view/manage their own preferences

-- Users can view their own preferences
CREATE POLICY "Users can view own preferences"
    ON public.user_preferences
    FOR SELECT
    USING (profile_id = auth.uid());

-- Users can insert their own preferences
CREATE POLICY "Users can create own preferences"
    ON public.user_preferences
    FOR INSERT
    WITH CHECK (profile_id = auth.uid());

-- Users can update their own preferences
CREATE POLICY "Users can update own preferences"
    ON public.user_preferences
    FOR UPDATE
    USING (profile_id = auth.uid());

-- Users can delete their own preferences
CREATE POLICY "Users can delete own preferences"
    ON public.user_preferences
    FOR DELETE
    USING (profile_id = auth.uid());

-- Add comments for documentation
COMMENT ON TABLE public.user_preferences IS 'Per-user, per-foundry preference storage for inbox and other UI settings';
COMMENT ON COLUMN public.user_preferences.inbox_view IS 'Inbox view mode: people (conversations) or tasks';
COMMENT ON COLUMN public.user_preferences.inbox_task_filter IS 'Task filter: my_tasks (assigned to user) or all_tasks (all foundry tasks)';

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_user_preferences_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_user_preferences_timestamp ON public.user_preferences;
CREATE TRIGGER trigger_update_user_preferences_timestamp
    BEFORE UPDATE ON public.user_preferences
    FOR EACH ROW
    EXECUTE FUNCTION public.update_user_preferences_timestamp();

-- Verify the table was created
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'user_preferences'
    ) THEN
        RAISE EXCEPTION 'Failed to create user_preferences table';
    END IF;
    
    RAISE NOTICE 'user_preferences table created successfully';
END $$;
