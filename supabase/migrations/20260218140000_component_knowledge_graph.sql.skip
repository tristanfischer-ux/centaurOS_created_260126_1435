/**
 * Migration: Component knowledge graph — multi-hop compatibility and BOM generation
 *
 * Purpose: Add RPCs to traverse component_compatibility as a graph (multi-hop)
 * and generate a bill-of-materials from a root component.
 *
 * Related:
 * - component_compatibility table (component_a, component_b, relationship, notes)
 * - src/lib/cad-lab/component-graph.ts (optional TS wrapper)
 *
 * Rollback: DROP FUNCTION component_compatibility_multi_hop; DROP FUNCTION component_bom_from_root;
 */

-- ============================================================
-- 1. Multi-hop compatibility traversal
-- ============================================================
-- Returns all components reachable from start_component within max_depth hops.
-- Each row: depth (1 = direct), node (component id at this step), related (the other end of the edge), relationship, notes.

CREATE OR REPLACE FUNCTION component_compatibility_multi_hop(
  start_component text,
  max_depth int DEFAULT 3
)
RETURNS TABLE (
  depth int,
  node text,
  related text,
  relationship text,
  notes text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE
  edges AS (
    SELECT component_a AS n1, component_b AS n2, relationship, notes
    FROM component_compatibility
    UNION ALL
    SELECT component_b, component_a, relationship, notes
    FROM component_compatibility
  ),
  walk AS (
    SELECT 1 AS d, start_component AS n, e.n2 AS rel, e.relationship, e.notes
    FROM edges e
    WHERE e.n1 = start_component
    UNION ALL
    SELECT w.d + 1, w.rel, e.n2, e.relationship, e.notes
    FROM walk w
    JOIN edges e ON e.n1 = w.rel
    WHERE w.d < max_depth
  )
  SELECT w.d::int, w.n, w.rel, w.relationship, w.notes
  FROM walk w
  ORDER BY w.d, w.n, w.rel;
$$;

COMMENT ON FUNCTION component_compatibility_multi_hop IS 'Multi-hop traversal of component_compatibility graph from a root component (by name/part number). Returns depth, node, related component, relationship, notes.';

-- ============================================================
-- 2. BOM from root component
-- ============================================================
-- Returns a flat list of components reachable from root (e.g. "Motor A" -> ESC B, Battery C, ...)
-- with depth and path for ordering. Deduplicated by component_id; path is the chain from root.

CREATE OR REPLACE FUNCTION component_bom_from_root(
  root_component text,
  max_depth int DEFAULT 2
)
RETURNS TABLE (
  component_id text,
  depth int,
  path text[],
  relationship text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE
  edges AS (
    SELECT component_a AS n1, component_b AS n2, relationship
    FROM component_compatibility
    UNION ALL
    SELECT component_b, component_a, relationship
    FROM component_compatibility
  ),
  walk AS (
    SELECT 1 AS d, root_component AS n, ARRAY[root_component]::text[] AS p, ''::text AS rel
    UNION ALL
    SELECT w.d + 1, e.n2, w.p || e.n2, e.relationship
    FROM walk w
    JOIN edges e ON e.n1 = w.n
    WHERE w.d < max_depth
  )
  SELECT
    d.n AS component_id,
    d.d::int AS depth,
    d.p AS path,
    d.rel AS relationship
  FROM (
    SELECT DISTINCT ON (w.n) w.d, w.n, w.p, w.rel
    FROM walk w
    WHERE w.n IS NOT NULL AND w.n <> ''
    ORDER BY w.n, w.d
  ) d
  ORDER BY d.d, d.n;
END;
$$;

COMMENT ON FUNCTION component_bom_from_root IS 'Generate a flat BOM (bill of materials) from a root component by traversing component_compatibility. Returns component_id, depth, path from root, and relationship.';
