-- Migration: Admin Panel, Data Sync, Export, and User Management
-- This migration adds:
-- 1. foundry_admin_permissions - Track who has admin panel access per foundry
-- 2. foundry_integrations - Store Google Sheets and other integration configs
-- 3. foundry_offboarding_settings - Configurable offboarding behavior
-- 4. offboarding_tasks - Track tasks during offboarding workflow
-- 5. is_active and deactivated_at columns to profiles for soft-delete support

-- =============================================
-- 1. ADD SOFT-DELETE COLUMNS TO PROFILES
-- =============================================

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;

-- Add index for active users filter
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON public.profiles(is_active);

-- =============================================
-- 2. CREATE OFFBOARDING_ACTION ENUM
-- =============================================

DO $$ BEGIN
    CREATE TYPE public.offboarding_action AS ENUM ('reassign_delete', 'soft_delete', 'anonymize');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =============================================
-- 3. CREATE FOUNDRY_ADMIN_PERMISSIONS TABLE
-- =============================================
-- Tracks which users have access to the admin panel within their foundry

CREATE TABLE IF NOT EXISTS public.foundry_admin_permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id text NOT NULL,
    profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    granted_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    UNIQUE (foundry_id, profile_id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_foundry_admin_permissions_foundry ON public.foundry_admin_permissions(foundry_id);
CREATE INDEX IF NOT EXISTS idx_foundry_admin_permissions_profile ON public.foundry_admin_permissions(profile_id);

-- Enable RLS
ALTER TABLE public.foundry_admin_permissions ENABLE ROW LEVEL SECURITY;

-- Founders can view admin permissions for their foundry
DROP POLICY IF EXISTS "Founders can view admin permissions" ON public.foundry_admin_permissions;
CREATE POLICY "Founders can view admin permissions" ON public.foundry_admin_permissions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.foundry_id = foundry_admin_permissions.foundry_id
            AND p.role = 'Founder'
            AND p.is_active = true
        )
    );

-- Users can view their own admin permission
DROP POLICY IF EXISTS "Users can view own admin permission" ON public.foundry_admin_permissions;
CREATE POLICY "Users can view own admin permission" ON public.foundry_admin_permissions
    FOR SELECT USING (profile_id = auth.uid());

-- Founders can manage admin permissions
DROP POLICY IF EXISTS "Founders can manage admin permissions" ON public.foundry_admin_permissions;
CREATE POLICY "Founders can manage admin permissions" ON public.foundry_admin_permissions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.foundry_id = foundry_admin_permissions.foundry_id
            AND p.role = 'Founder'
            AND p.is_active = true
        )
    );

-- =============================================
-- 4. CREATE FOUNDRY_INTEGRATIONS TABLE
-- =============================================
-- Stores configuration for Google Sheets and other integrations

CREATE TABLE IF NOT EXISTS public.foundry_integrations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id text NOT NULL,
    service_type text NOT NULL, -- 'google_sheets', etc.
    config jsonb NOT NULL DEFAULT '{}',
    -- For google_sheets: { sheet_id, sync_enabled, tables_to_sync[], last_sync_at, sync_errors[] }
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (foundry_id, service_type)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_foundry_integrations_foundry ON public.foundry_integrations(foundry_id);
CREATE INDEX IF NOT EXISTS idx_foundry_integrations_service ON public.foundry_integrations(service_type);

-- Enable RLS
ALTER TABLE public.foundry_integrations ENABLE ROW LEVEL SECURITY;

-- Founders and admin permission holders can view integrations
DROP POLICY IF EXISTS "Admins can view integrations" ON public.foundry_integrations;
CREATE POLICY "Admins can view integrations" ON public.foundry_integrations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.foundry_id = foundry_integrations.foundry_id
            AND p.is_active = true
            AND (
                p.role = 'Founder'
                OR EXISTS (
                    SELECT 1 FROM public.foundry_admin_permissions fap
                    WHERE fap.profile_id = p.id
                    AND fap.foundry_id = foundry_integrations.foundry_id
                )
            )
        )
    );

-- Founders can manage integrations
DROP POLICY IF EXISTS "Founders can manage integrations" ON public.foundry_integrations;
CREATE POLICY "Founders can manage integrations" ON public.foundry_integrations
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.foundry_id = foundry_integrations.foundry_id
            AND p.role = 'Founder'
            AND p.is_active = true
        )
    );

-- Admin permission holders can also manage integrations
DROP POLICY IF EXISTS "Admin permission holders can manage integrations" ON public.foundry_integrations;
CREATE POLICY "Admin permission holders can manage integrations" ON public.foundry_integrations
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            JOIN public.foundry_admin_permissions fap ON fap.profile_id = p.id
            WHERE p.id = auth.uid()
            AND p.foundry_id = foundry_integrations.foundry_id
            AND p.is_active = true
            AND fap.foundry_id = foundry_integrations.foundry_id
        )
    );

-- =============================================
-- 5. CREATE FOUNDRY_OFFBOARDING_SETTINGS TABLE
-- =============================================
-- Configurable offboarding behavior per foundry

CREATE TABLE IF NOT EXISTS public.foundry_offboarding_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id text NOT NULL UNIQUE,
    default_action public.offboarding_action NOT NULL DEFAULT 'reassign_delete',
    require_task_reassignment boolean NOT NULL DEFAULT true,
    retention_days integer DEFAULT 30,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.foundry_offboarding_settings ENABLE ROW LEVEL SECURITY;

-- Founders and admin permission holders can view settings
DROP POLICY IF EXISTS "Admins can view offboarding settings" ON public.foundry_offboarding_settings;
CREATE POLICY "Admins can view offboarding settings" ON public.foundry_offboarding_settings
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.foundry_id = foundry_offboarding_settings.foundry_id
            AND p.is_active = true
            AND (
                p.role = 'Founder'
                OR EXISTS (
                    SELECT 1 FROM public.foundry_admin_permissions fap
                    WHERE fap.profile_id = p.id
                    AND fap.foundry_id = foundry_offboarding_settings.foundry_id
                )
            )
        )
    );

-- Only Founders can manage offboarding settings
DROP POLICY IF EXISTS "Founders can manage offboarding settings" ON public.foundry_offboarding_settings;
CREATE POLICY "Founders can manage offboarding settings" ON public.foundry_offboarding_settings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.foundry_id = foundry_offboarding_settings.foundry_id
            AND p.role = 'Founder'
            AND p.is_active = true
        )
    );

-- =============================================
-- 6. CREATE OFFBOARDING_TASKS TABLE
-- =============================================
-- Tracks tasks that need reassignment during offboarding

CREATE TABLE IF NOT EXISTS public.offboarding_tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id text NOT NULL,
    departing_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    reassigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    relationship_type text NOT NULL CHECK (relationship_type IN ('creator', 'assignee')),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reassigned', 'skipped')),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (departing_user_id, task_id, relationship_type)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_offboarding_tasks_foundry ON public.offboarding_tasks(foundry_id);
CREATE INDEX IF NOT EXISTS idx_offboarding_tasks_departing_user ON public.offboarding_tasks(departing_user_id);
CREATE INDEX IF NOT EXISTS idx_offboarding_tasks_status ON public.offboarding_tasks(status);

-- Enable RLS
ALTER TABLE public.offboarding_tasks ENABLE ROW LEVEL SECURITY;

-- Founders and Executives can view/manage offboarding tasks
DROP POLICY IF EXISTS "Admins can view offboarding tasks" ON public.offboarding_tasks;
CREATE POLICY "Admins can view offboarding tasks" ON public.offboarding_tasks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.foundry_id = offboarding_tasks.foundry_id
            AND p.is_active = true
            AND (
                p.role IN ('Founder', 'Executive')
                OR EXISTS (
                    SELECT 1 FROM public.foundry_admin_permissions fap
                    WHERE fap.profile_id = p.id
                    AND fap.foundry_id = offboarding_tasks.foundry_id
                )
            )
        )
    );

DROP POLICY IF EXISTS "Admins can manage offboarding tasks" ON public.offboarding_tasks;
CREATE POLICY "Admins can manage offboarding tasks" ON public.offboarding_tasks
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.foundry_id = offboarding_tasks.foundry_id
            AND p.is_active = true
            AND (
                p.role IN ('Founder', 'Executive')
                OR EXISTS (
                    SELECT 1 FROM public.foundry_admin_permissions fap
                    WHERE fap.profile_id = p.id
                    AND fap.foundry_id = offboarding_tasks.foundry_id
                )
            )
        )
    );

-- =============================================
-- 7. ADMIN ACTION AUDIT LOG TABLE
-- =============================================
-- Audit log specifically for foundry admin actions

CREATE TABLE IF NOT EXISTS public.foundry_admin_audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    foundry_id text NOT NULL,
    actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    action text NOT NULL, -- 'grant_admin', 'revoke_admin', 'offboard_user', 'update_settings', etc.
    target_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    details jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_foundry_admin_audit_log_foundry ON public.foundry_admin_audit_log(foundry_id);
CREATE INDEX IF NOT EXISTS idx_foundry_admin_audit_log_actor ON public.foundry_admin_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_foundry_admin_audit_log_created ON public.foundry_admin_audit_log(created_at DESC);

ALTER TABLE public.foundry_admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Only founders can view audit log
DROP POLICY IF EXISTS "Founders can view audit log" ON public.foundry_admin_audit_log;
CREATE POLICY "Founders can view audit log" ON public.foundry_admin_audit_log
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.foundry_id = foundry_admin_audit_log.foundry_id
            AND p.role = 'Founder'
            AND p.is_active = true
        )
    );

-- Allow inserts via service role (from server actions)
DROP POLICY IF EXISTS "Service role can insert audit log" ON public.foundry_admin_audit_log;
CREATE POLICY "Service role can insert audit log" ON public.foundry_admin_audit_log
    FOR INSERT WITH CHECK (true);

-- =============================================
-- 8. HELPER FUNCTIONS
-- =============================================

-- Function to check if user has foundry admin access
CREATE OR REPLACE FUNCTION public.has_foundry_admin_access(user_id uuid, target_foundry_id text)
RETURNS boolean AS $$
DECLARE
    user_role text;
    user_is_active boolean;
    has_permission boolean;
BEGIN
    -- Get user's role, foundry, and active status
    SELECT role, is_active INTO user_role, user_is_active
    FROM public.profiles
    WHERE id = user_id AND foundry_id = target_foundry_id;
    
    -- Must be active
    IF NOT COALESCE(user_is_active, false) THEN
        RETURN false;
    END IF;
    
    -- Founders always have admin access
    IF user_role = 'Founder' THEN
        RETURN true;
    END IF;
    
    -- Check for explicit admin permission
    SELECT EXISTS (
        SELECT 1 FROM public.foundry_admin_permissions
        WHERE profile_id = user_id AND foundry_id = target_foundry_id
    ) INTO has_permission;
    
    RETURN has_permission;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to count active founders in a foundry
CREATE OR REPLACE FUNCTION public.count_active_founders(target_foundry_id text)
RETURNS integer AS $$
SELECT COUNT(*)::integer
FROM public.profiles
WHERE foundry_id = target_foundry_id
AND role = 'Founder'
AND is_active = true
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Function to get tasks for offboarding
CREATE OR REPLACE FUNCTION public.get_offboarding_tasks(target_user_id uuid)
RETURNS TABLE (
    task_id uuid,
    task_title text,
    task_status text,
    relationship_type text,
    current_assignee_name text
) AS $$
BEGIN
    RETURN QUERY
    -- Tasks created by the user
    SELECT 
        t.id as task_id,
        t.title as task_title,
        t.status::text as task_status,
        'creator'::text as relationship_type,
        p.full_name as current_assignee_name
    FROM public.tasks t
    LEFT JOIN public.profiles p ON p.id = t.assignee_id
    WHERE t.creator_id = target_user_id
    
    UNION ALL
    
    -- Tasks assigned to the user
    SELECT 
        t.id as task_id,
        t.title as task_title,
        t.status::text as task_status,
        'assignee'::text as relationship_type,
        NULL as current_assignee_name
    FROM public.tasks t
    WHERE t.assignee_id = target_user_id
    
    UNION ALL
    
    -- Tasks in task_assignees table
    SELECT 
        t.id as task_id,
        t.title as task_title,
        t.status::text as task_status,
        'assignee'::text as relationship_type,
        NULL as current_assignee_name
    FROM public.task_assignees ta
    JOIN public.tasks t ON t.id = ta.task_id
    WHERE ta.profile_id = target_user_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =============================================
-- 9. TRIGGERS
-- =============================================

-- Auto-update updated_at for foundry_integrations
CREATE OR REPLACE FUNCTION update_foundry_integrations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_foundry_integrations_updated_at_trigger ON public.foundry_integrations;
CREATE TRIGGER update_foundry_integrations_updated_at_trigger
    BEFORE UPDATE ON public.foundry_integrations
    FOR EACH ROW
    EXECUTE FUNCTION update_foundry_integrations_updated_at();

-- Auto-update updated_at for foundry_offboarding_settings
CREATE OR REPLACE FUNCTION update_foundry_offboarding_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_foundry_offboarding_settings_updated_at_trigger ON public.foundry_offboarding_settings;
CREATE TRIGGER update_foundry_offboarding_settings_updated_at_trigger
    BEFORE UPDATE ON public.foundry_offboarding_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_foundry_offboarding_settings_updated_at();

-- Auto-update updated_at for offboarding_tasks
CREATE OR REPLACE FUNCTION update_offboarding_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_offboarding_tasks_updated_at_trigger ON public.offboarding_tasks;
CREATE TRIGGER update_offboarding_tasks_updated_at_trigger
    BEFORE UPDATE ON public.offboarding_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_offboarding_tasks_updated_at();

-- =============================================
-- 10. COMMENTS
-- =============================================

COMMENT ON TABLE public.foundry_admin_permissions IS 'Tracks which non-Founder users have access to the admin panel within their foundry';
COMMENT ON COLUMN public.foundry_admin_permissions.granted_by IS 'The Founder who granted this permission';

COMMENT ON TABLE public.foundry_integrations IS 'Configuration for external integrations like Google Sheets sync';
COMMENT ON COLUMN public.foundry_integrations.config IS 'JSONB config - for google_sheets: { sheet_id, sync_enabled, tables_to_sync[], last_sync_at }';

COMMENT ON TABLE public.foundry_offboarding_settings IS 'Per-foundry configuration for how to handle user offboarding';
COMMENT ON COLUMN public.foundry_offboarding_settings.default_action IS 'Default action when removing a user: reassign_delete, soft_delete, or anonymize';
COMMENT ON COLUMN public.foundry_offboarding_settings.require_task_reassignment IS 'Whether to require task reassignment before completing offboarding';

COMMENT ON TABLE public.offboarding_tasks IS 'Tracks tasks that need attention during user offboarding process';
COMMENT ON COLUMN public.offboarding_tasks.relationship_type IS 'Whether the departing user is the creator or assignee of the task';

COMMENT ON TABLE public.foundry_admin_audit_log IS 'Audit trail for all admin panel actions within a foundry';

COMMENT ON COLUMN public.profiles.is_active IS 'Soft-delete flag - false means user has been deactivated';
COMMENT ON COLUMN public.profiles.deactivated_at IS 'Timestamp when user was deactivated';

COMMENT ON FUNCTION public.count_active_founders IS 'Returns count of active founders in a foundry - used to prevent last founder offboarding';

-- =============================================
-- END OF MIGRATION
-- =============================================
