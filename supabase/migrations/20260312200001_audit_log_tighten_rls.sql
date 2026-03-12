-- Red team fix: Remove overly permissive INSERT policy.
-- The admin client (service_role) bypasses RLS entirely,
-- so no INSERT policy is needed. The old WITH CHECK (true)
-- allowed any authenticated user to forge audit entries.

DROP POLICY IF EXISTS "Service role can insert audit log" ON public.audit_log;
