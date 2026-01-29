-- Fix infinite recursion in admin_users RLS policy
-- The original policy checked admin_users to determine access to admin_users

-- Drop the problematic policies
DROP POLICY IF EXISTS "admin_view_admins" ON public.admin_users;
DROP POLICY IF EXISTS "admin_view_audit_log" ON public.admin_audit_log;
DROP POLICY IF EXISTS "admin_view_metrics" ON public.platform_metrics;
DROP POLICY IF EXISTS "admin_view_fraud_signals" ON public.fraud_signals;

-- Create a security definer function to check admin status without RLS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.admin_users 
        WHERE user_id = auth.uid()
    );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Recreate admin_users policy using the function
-- Users can see their own admin record
CREATE POLICY "users_view_own_admin_record" ON public.admin_users
    FOR SELECT USING (user_id = auth.uid());

-- Service role has full access (for admin management)
-- Note: service_manage_admins policy already exists, so this is covered

-- Recreate audit log policy using the function
CREATE POLICY "admin_view_audit_log" ON public.admin_audit_log
    FOR SELECT USING (public.is_admin());

-- Recreate metrics policy using the function
CREATE POLICY "admin_view_metrics" ON public.platform_metrics
    FOR SELECT USING (
        auth.role() = 'service_role' OR public.is_admin()
    );

-- Recreate fraud signals policy using the function  
CREATE POLICY "admin_view_fraud_signals" ON public.fraud_signals
    FOR SELECT USING (
        auth.role() = 'service_role' OR public.is_admin()
    );
