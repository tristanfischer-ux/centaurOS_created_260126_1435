/**
 * @file component-graph.ts
 *
 * @description Component knowledge graph: multi-hop compatibility traversal
 * and BOM generation from a root component. Uses PostgreSQL recursive CTEs
 * via RPCs component_compatibility_multi_hop and component_bom_from_root.
 *
 * @related supabase/migrations/20260218140000_component_knowledge_graph.sql
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface MultiHopRow {
  depth: number
  node: string
  related: string
  relationship: string
  notes: string | null
}

export interface BomRow {
  component_id: string
  depth: number
  path: string[]
  relationship: string
}

/**
 * Traverses the component_compatibility graph from a root component (name or part number)
 * up to max_depth hops. Returns all reachable (node, related, relationship, notes).
 *
 * @param supabase - Authenticated Supabase client
 * @param startComponent - Root component identifier (text)
 * @param maxDepth - Maximum hops (default 3)
 */
export async function getComponentCompatibilityMultiHop(
  supabase: SupabaseClient,
  startComponent: string,
  maxDepth: number = 3,
): Promise<MultiHopRow[]> {
  const { data, error } = await supabase.rpc("component_compatibility_multi_hop", {
    start_component: startComponent,
    max_depth: maxDepth,
  })
  if (error) {
    console.warn("[ComponentGraph] multi_hop RPC failed:", error.message)
    return []
  }
  return (data ?? []) as MultiHopRow[]
}

/**
 * Generates a flat BOM (bill of materials) from a root component by traversing
 * component_compatibility. Returns each reachable component once with its
 * minimum depth and path from root.
 *
 * @param supabase - Authenticated Supabase client
 * @param rootComponent - Root component identifier (text)
 * @param maxDepth - Maximum hops (default 2)
 */
export async function getComponentBomFromRoot(
  supabase: SupabaseClient,
  rootComponent: string,
  maxDepth: number = 2,
): Promise<BomRow[]> {
  const { data, error } = await supabase.rpc("component_bom_from_root", {
    root_component: rootComponent,
    max_depth: maxDepth,
  })
  if (error) {
    console.warn("[ComponentGraph] bom_from_root RPC failed:", error.message)
    return []
  }
  return (data ?? []) as BomRow[]
}
