-- Add decomposition_connections column for storing AI-declared inter-module connections.
-- INTENT: Connections declared during decomposition are the highest-fidelity edge source
-- for flow diagrams — no heuristic matching needed. Stored as JSONB array of
-- { from, output, to, input } objects.
ALTER TABLE cad_lab_projects
  ADD COLUMN IF NOT EXISTS decomposition_connections JSONB DEFAULT NULL;

COMMENT ON COLUMN cad_lab_projects.decomposition_connections IS
  'AI-declared inter-module connections from decomposition. Array of {from, output, to, input}.';
