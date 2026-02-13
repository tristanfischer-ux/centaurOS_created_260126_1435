/**
 * Migration: Add atomic module update RPC for CAD Lab
 *
 * Purpose: When multiple serverless functions generate modules in parallel,
 * they all write to the same `modules` JSONB array. Without atomicity,
 * concurrent writes can overwrite each other's results. This RPC function
 * finds and replaces a single module element within the array atomically.
 *
 * Security:
 * - RLS still applies (caller must have UPDATE access to the project)
 * - Function validates the module_id exists in the array
 *
 * Rollback: DROP FUNCTION IF EXISTS update_cad_lab_module;
 */

CREATE OR REPLACE FUNCTION update_cad_lab_module(
  p_project_id UUID,
  p_module_id TEXT,
  p_module_data JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER  -- RLS policies still apply
AS $$
DECLARE
  v_modules JSONB;
  v_idx INT := -1;
  v_elem JSONB;
  i INT := 0;
BEGIN
  -- Lock the row to prevent concurrent updates
  SELECT modules INTO v_modules
  FROM cad_lab_projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF v_modules IS NULL THEN
    RAISE EXCEPTION 'Project not found or modules is null';
  END IF;

  -- Find the index of the module with matching id
  FOR v_elem IN SELECT * FROM jsonb_array_elements(v_modules)
  LOOP
    IF v_elem->>'id' = p_module_id THEN
      v_idx := i;
      EXIT;
    END IF;
    i := i + 1;
  END LOOP;

  IF v_idx = -1 THEN
    RAISE EXCEPTION 'Module % not found in project', p_module_id;
  END IF;

  -- Atomically replace the module at the found index
  UPDATE cad_lab_projects
  SET modules = jsonb_set(v_modules, ARRAY[v_idx::TEXT], p_module_data)
  WHERE id = p_project_id;
END;
$$;
