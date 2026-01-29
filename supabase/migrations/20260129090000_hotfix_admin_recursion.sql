-- Hotfix: Fix infinite recursion in admin_users RLS policy
-- This creates a SECURITY DEFINER function to bypass RLS when checking admin status

-- Create the function if it doesn't exist
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

-- Drop the problematic recursive policy if it exists
DROP POLICY IF EXISTS "admin_view_admins" ON public.admin_users;

-- Create a simple policy - users can only see their own admin record
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'admin_users' 
        AND policyname = 'users_view_own_admin_record'
    ) THEN
        CREATE POLICY "users_view_own_admin_record" ON public.admin_users
            FOR SELECT USING (user_id = auth.uid());
    END IF;
END;
$$;
