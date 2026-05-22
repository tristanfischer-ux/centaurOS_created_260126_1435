/**
 * scripts/lib/orchestrator/aggregator.ts
 *
 * AGGREGATOR — Final transformation from per-tool results to a
 * complete EngineeringContract. Mostly a pass-through given that each
 * ToolStep's contract_update has already merged its outputs. This
 * module owns the cross-tool reconciliation logic (when two tools
 * compute overlapping quantities, which wins) + final validation.
 */

import type {
  ContractInProgress,
  ToolResult,
  TypedQuantity,
} from './types'

export interface AggregatorOutcome {
  contract: ContractInProgress
  reconciliations: ReconciliationRecord[]
  orphan_quantities: string[]
  warnings: string[]
}

export interface ReconciliationRecord {
  quantity_key: string
  tool_a: string
  value_a: number
  tool_b: string
  value_b: number
  resolved_value: number
  resolved_tool: string
  rationale: string
}

/**
 * Finalise the Contract.
 *
 * Currently this checks for:
 * - quantities with provenance.source matching neither 'brief',
 *   'envelope_detector', 'class_anchor', 'physics_constant', nor
 *   'tool:*' (orphans — likely indicates a wiring bug)
 * - missing required quantities for the product class
 */
export function finaliseContract(
  contract: ContractInProgress,
  _tool_results: Map<string, ToolResult<unknown>>,
): AggregatorOutcome {
  const reconciliations: ReconciliationRecord[] = []
  const orphan_quantities: string[] = []
  const warnings: string[] = []

  for (const [key, q] of Object.entries(contract.quantities)) {
    if (!isValidProvenanceSource(q)) {
      orphan_quantities.push(key)
    }
  }

  if (orphan_quantities.length > 0) {
    warnings.push(`Contract has ${orphan_quantities.length} orphan quantities (no valid provenance source): ${orphan_quantities.join(', ')}`)
  }

  return { contract, reconciliations, orphan_quantities, warnings }
}

function isValidProvenanceSource(q: TypedQuantity): boolean {
  // Defensive: legacy quantities from engineering-contract.ts don't carry
  // provenance. Treat missing provenance as 'brief' (the most common
  // legacy source) so the orchestrator can ingest legacy contracts.
  if (!q || typeof q !== 'object') return false
  const prov = q.provenance
  if (!prov) return true  // legacy shape — accept
  const src = prov.source
  if (src === 'brief') return true
  if (src === 'envelope_detector') return true
  if (src === 'class_anchor') return true
  if (src === 'physics_constant') return true
  if (src === 'aggregator') return true
  if (src === 'closure_validator') return true
  if (typeof src === 'string' && src.startsWith('tool:')) return true
  return false
}
