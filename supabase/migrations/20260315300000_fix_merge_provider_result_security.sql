-- SECURITY FIX: merge_provider_result was SECURITY DEFINER, bypassing RLS.
-- Any authenticated user could write to any project's provider_results.
-- Fix: SECURITY INVOKER (respects RLS) + provider allowlist.

CREATE OR REPLACE FUNCTION merge_provider_result(
  p_project_id uuid,
  p_provider text,
  p_result jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER  -- Run as calling user, RLS policies apply
AS $$
BEGIN
  -- SECURITY: Validate provider is in the allowed set
  IF p_provider NOT IN ('meshy', 'tripo', 'trellis', 'sf3d', 'zoo', 'gencad') THEN
    RAISE EXCEPTION 'Invalid provider: %', p_provider;
  END IF;

  UPDATE cad_lab_projects
  SET provider_results = COALESCE(provider_results, '{}'::jsonb) || jsonb_build_object(p_provider, p_result)
  WHERE id = p_project_id;
END;
$$;
