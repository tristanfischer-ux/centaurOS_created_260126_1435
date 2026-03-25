-- SECURITY: Enable RLS on cad_lab_generation_metrics.
-- This table was created in 20260228200000 without RLS, exposing it via PostgREST.
-- Supabase Security Advisor flagged this as rls_disabled_in_public.
--
-- Access pattern:
--   INSERT: server-side only via admin client (bypasses RLS)
--   SELECT: user client in workshop report — must be foundry-scoped

ALTER TABLE public.cad_lab_generation_metrics ENABLE ROW LEVEL SECURITY;

-- SELECT: Users can read metrics for projects belonging to their foundry.
-- Joins through cad_lab_projects to enforce foundry isolation.
CREATE POLICY "Users can view metrics for own foundry projects"
ON public.cad_lab_generation_metrics
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.cad_lab_projects p
    WHERE p.id = cad_lab_generation_metrics.project_id
      AND p.foundry_id = (SELECT foundry_id FROM public.profiles WHERE id = auth.uid())
  )
);

-- INSERT: Only service_role (admin client) can insert metrics.
-- No user-facing insert path exists; this policy blocks direct PostgREST inserts.
CREATE POLICY "Service role inserts metrics"
ON public.cad_lab_generation_metrics
FOR INSERT
WITH CHECK (false);
