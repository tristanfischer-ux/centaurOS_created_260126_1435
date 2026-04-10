-- SECURITY FIX: Prevent users from escalating their own role via direct PostgREST calls
--
-- The existing profiles_update_own policy allows authenticated users to update ANY
-- column on their own row, including role, is_active, account_type, foundry_id, etc.
-- This is a privilege escalation vulnerability: a user can call
--   supabase.from('profiles').update({ role: 'Founder' }).eq('id', myUserId)
-- to gain admin access.
--
-- Fix: Add a BEFORE UPDATE trigger that prevents changes to security-critical columns
-- unless the update is from the service_role (admin) key.

CREATE OR REPLACE FUNCTION public.guard_profile_security_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Allow service_role (admin) to update anything
  IF current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- For regular users: prevent changes to security-critical columns
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Cannot modify role directly. Use the platform UI.';
  END IF;

  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'Cannot modify is_active directly.';
  END IF;

  IF NEW.account_type IS DISTINCT FROM OLD.account_type THEN
    RAISE EXCEPTION 'Cannot modify account_type directly.';
  END IF;

  IF NEW.foundry_id IS DISTINCT FROM OLD.foundry_id THEN
    RAISE EXCEPTION 'Cannot modify foundry_id directly. Use foundry switching.';
  END IF;

  IF NEW.is_founding_member IS DISTINCT FROM OLD.is_founding_member THEN
    RAISE EXCEPTION 'Cannot modify founding member status directly.';
  END IF;

  IF NEW.founding_member_number IS DISTINCT FROM OLD.founding_member_number THEN
    RAISE EXCEPTION 'Cannot modify founding member number directly.';
  END IF;

  RETURN NEW;
END;
$$;

-- Drop if exists (idempotent)
DROP TRIGGER IF EXISTS guard_profile_security_columns_trigger ON public.profiles;

CREATE TRIGGER guard_profile_security_columns_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_security_columns();

-- Grant execute to authenticated role (trigger needs it)
GRANT EXECUTE ON FUNCTION public.guard_profile_security_columns() TO authenticated;

COMMENT ON FUNCTION public.guard_profile_security_columns() IS
  'Security trigger: prevents authenticated users from escalating their own role, '
  'reactivating their account, or changing their account type via direct PostgREST calls. '
  'Service role (admin) bypasses all guards.';
