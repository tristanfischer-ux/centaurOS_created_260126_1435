/**
 * @file radical/migrations/v0-to-v1.ts
 *
 * Migration stub: flat-list format (v0) → Radical tree format (v1.0.0).
 *
 * Phase 0 status: STUB only. The v0 format is the pre-Radical flat BoM list
 * used in the per-class pipeline (stages/2-decompose.ts output). The v1 format
 * is the RadicalTree composition tree.
 *
 * This file registers the migration slot in the migration registry so the
 * property-api version-compatibility check can find it. The actual transformation
 * logic is NOT implemented here — it will be built in Phase 1 as part of the
 * Module Decomposition stage emitting Radical trees.
 *
 * When Phase 1 is complete, this stub becomes the real migration, enabling
 * any archived manifests stored in the v0 flat-list format to be read by
 * the v1 tree-aware pipeline.
 *
 * ---
 *
 * v0 format (flat list):
 *   Array of { line_id, name, module, qty_note, unit_cost_gbp, make_buy, decomposition: { ... } }
 *
 * v1 format (RadicalTree):
 *   { radical_spec_version: "1.0.0", composition: { id, description, root: CompositionNode, environment: [] } }
 *
 * The key structural difference: v0 is a flat array; v1 is a rooted composition
 * tree where each CompositionNode maps to an archetype in the RadicalLibrary.
 */

import type { RadicalTree } from '../schema.js'
import { CURRENT_RADICAL_SPEC_VERSION } from '../schema.js'

// ---------------------------------------------------------------------------
// v0 flat-list type definition (for reference)
// ---------------------------------------------------------------------------

export interface V0BomLine {
  line_id: number
  name: string
  module: string
  qty_note: string
  unit_cost_gbp: number | null
  make_buy: 'Buy' | 'Make'
  decomposition: {
    archetype_match: string | null
    character_match: string | null
    character_needed: string | null
    new_radicals_needed: string[]
    new_archetype_needed: string | null
  }
}

export interface V0FlatList {
  meta: {
    bom_source: string
    bom_line_count: number
  }
  bom_lines: V0BomLine[]
}

// ---------------------------------------------------------------------------
// Migration function (STUB)
// ---------------------------------------------------------------------------

/**
 * Convert a v0 flat-list manifest to a v1 RadicalTree.
 *
 * STUB: Returns null (not implemented). Phase 1 will replace this with the
 * real transformation once the Module Decomposition stage is updated to emit
 * Radical trees directly.
 *
 * Implementation notes for Phase 1:
 *   1. Create a root CompositionNode for the system (product slug as archetype ID)
 *   2. For each V0BomLine, create a CompositionNode:
 *        { archetypeId: line.decomposition.new_archetype_needed ?? line.name, quantity: parseQty(line.qty_note), children: [] }
 *   3. Group nodes by module into intermediate word-level nodes
 *   4. Attach word-level nodes as children of the root
 *   5. Wrap in RadicalTree with radical_spec_version: CURRENT_RADICAL_SPEC_VERSION
 */
export function migrateV0ToV1(v0: V0FlatList): RadicalTree | null {
  // STUB — Phase 1 implementation pending
  console.warn('[v0-to-v1] Migration not yet implemented. Returning null.')
  return null
}

// ---------------------------------------------------------------------------
// Re-export for use by property-api migration registry
// ---------------------------------------------------------------------------

export { CURRENT_RADICAL_SPEC_VERSION }
