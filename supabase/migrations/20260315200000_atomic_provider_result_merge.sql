-- Atomic JSONB merge for provider_results to prevent race conditions
-- when N concurrent provider requests write their results.
-- DECISION: Single atomic SQL statement — no read-then-write gap.

CREATE OR REPLACE FUNCTION merge_provider_result(
  p_project_id uuid,
  p_provider text,
  p_result jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE cad_lab_projects
  SET provider_results = COALESCE(provider_results, '{}'::jsonb) || jsonb_build_object(p_provider, p_result)
  WHERE id = p_project_id;
$$;
