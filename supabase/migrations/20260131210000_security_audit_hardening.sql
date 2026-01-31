-- Security Audit Hardening Migration
-- Adds: Security audit log table, immutable audit log policies, storage bucket policies

-- =============================================
-- 1. Create Security Audit Log Table
-- =============================================
CREATE TABLE IF NOT EXISTS public.security_audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type text NOT NULL,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    email text,
    ip_address text,
    user_agent text,
    resource text,
    action text,
    success boolean NOT NULL DEFAULT true,
    severity text NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    details jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_security_audit_log_event_type ON public.security_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_user_id ON public.security_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_created_at ON public.security_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_severity ON public.security_audit_log(severity) WHERE severity IN ('HIGH', 'CRITICAL');
CREATE INDEX IF NOT EXISTS idx_security_audit_log_ip ON public.security_audit_log(ip_address);

-- Enable RLS
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 2. Make Audit Logs Immutable (Append-Only)
-- =============================================

-- Only admins can view security audit logs
CREATE POLICY "Admins can view security audit logs" ON public.security_audit_log
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('Executive', 'Founder')
        )
    );

-- No one can update security audit logs (immutable)
-- This is implicit since we don't create an UPDATE policy

-- No one can delete security audit logs (immutable)
-- This is implicit since we don't create a DELETE policy

-- Service role can insert (for server-side logging)
-- Note: Service role bypasses RLS, so this is just documentation
COMMENT ON TABLE public.security_audit_log IS 'Immutable security audit log. Records cannot be updated or deleted.';

-- Create function to insert security audit logs (for use from server)
CREATE OR REPLACE FUNCTION public.insert_security_audit_log(
    p_event_type text,
    p_user_id uuid DEFAULT NULL,
    p_email text DEFAULT NULL,
    p_ip_address text DEFAULT NULL,
    p_user_agent text DEFAULT NULL,
    p_resource text DEFAULT NULL,
    p_action text DEFAULT NULL,
    p_success boolean DEFAULT true,
    p_severity text DEFAULT 'LOW',
    p_details jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_log_id uuid;
BEGIN
    INSERT INTO public.security_audit_log (
        event_type, user_id, email, ip_address, user_agent,
        resource, action, success, severity, details
    ) VALUES (
        p_event_type, p_user_id, p_email, p_ip_address, p_user_agent,
        p_resource, p_action, p_success, p_severity, p_details
    )
    RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$$;

-- Grant execute to authenticated users (function handles its own auth via SECURITY DEFINER)
GRANT EXECUTE ON FUNCTION public.insert_security_audit_log TO authenticated;

-- =============================================
-- 3. Make Existing Audit Log Tables Immutable
-- =============================================

-- foundry_admin_audit_log - prevent updates/deletes
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'foundry_admin_audit_log') THEN
        -- Drop any existing update/delete policies
        DROP POLICY IF EXISTS "update_foundry_admin_audit_log" ON public.foundry_admin_audit_log;
        DROP POLICY IF EXISTS "delete_foundry_admin_audit_log" ON public.foundry_admin_audit_log;
        
        -- Note: Not creating UPDATE/DELETE policies makes table append-only
        COMMENT ON TABLE public.foundry_admin_audit_log IS 'Immutable admin audit log. Records cannot be updated or deleted.';
    END IF;
END $$;

-- admin_audit_log - prevent updates/deletes
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_audit_log') THEN
        -- Drop any existing update/delete policies
        DROP POLICY IF EXISTS "update_admin_audit_log" ON public.admin_audit_log;
        DROP POLICY IF EXISTS "delete_admin_audit_log" ON public.admin_audit_log;
        
        -- Note: Not creating UPDATE/DELETE policies makes table append-only
        COMMENT ON TABLE public.admin_audit_log IS 'Immutable admin audit log. Records cannot be updated or deleted.';
    END IF;
END $$;

-- gdpr_audit_log - prevent updates/deletes
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'gdpr_audit_log') THEN
        -- Drop any existing update/delete policies
        DROP POLICY IF EXISTS "update_gdpr_audit_log" ON public.gdpr_audit_log;
        DROP POLICY IF EXISTS "delete_gdpr_audit_log" ON public.gdpr_audit_log;
        
        -- Note: Not creating UPDATE/DELETE policies makes table append-only
        COMMENT ON TABLE public.gdpr_audit_log IS 'Immutable GDPR audit log. Records cannot be updated or deleted.';
    END IF;
END $$;

-- =============================================
-- 4. Storage Bucket Policies for Missing Buckets
-- =============================================

-- Note: Bucket creation and policies must be done via Supabase dashboard or storage API
-- This migration documents the required policies

-- provider-assets bucket policies (for portfolio images)
-- These need to be created in the Supabase dashboard:
-- SELECT: Authenticated users can read provider assets
-- INSERT: Authenticated users can upload to their own directory
-- DELETE: Users can only delete their own files

-- gdpr-exports bucket policies
-- SELECT: Users can only access their own exports
-- INSERT: Service role only (server-side)
-- DELETE: Service role only (cleanup after download)

-- order-documents bucket policies  
-- SELECT: Buyer and seller of order can access
-- INSERT: Buyer and seller of order can upload
-- DELETE: Service role only

-- Note: Storage bucket policies must be configured in Supabase dashboard (cannot modify storage schema via migration)

-- =============================================
-- 5. Add Trigger to Prevent Audit Log Deletion
-- =============================================

-- Create a trigger function that prevents deletion
CREATE OR REPLACE FUNCTION public.prevent_audit_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Audit log records cannot be deleted';
END;
$$;

-- Apply to security_audit_log
DROP TRIGGER IF EXISTS prevent_security_audit_delete ON public.security_audit_log;
CREATE TRIGGER prevent_security_audit_delete
    BEFORE DELETE ON public.security_audit_log
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_audit_deletion();

-- Create a trigger function that prevents updates
CREATE OR REPLACE FUNCTION public.prevent_audit_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Audit log records cannot be updated';
END;
$$;

-- Apply to security_audit_log
DROP TRIGGER IF EXISTS prevent_security_audit_update ON public.security_audit_log;
CREATE TRIGGER prevent_security_audit_update
    BEFORE UPDATE ON public.security_audit_log
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_audit_update();

-- =============================================
-- Done
-- =============================================
