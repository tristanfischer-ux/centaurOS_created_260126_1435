/**
 * scripts/lib/orchestrator/verifier.ts
 *
 * CROSS-TOOL CONSISTENCY VERIFIER — the "external verifier with write
 * access to canonical state" Grok 4.3 mandated in the round-3 council
 * verdict (drawer drawer_forgeos_decisions_98d0586eb00a5c7f).
 *
 * Runs AFTER all tools have completed. Reads the aggregated Contract +
 * raw tool results. Per-rule check: each rule encodes a physics
 * invariant that must hold across tool outputs (e.g. cooling capacity
 * ≥ inverter dissipation × 1.5).
 *
 * If any rule with severity='fatal' fails, the bundle is rejected and
 * the chain falls back to the LLM Generator path. Warnings are
 * propagated to the design but don't trigger fallback.
 *
 * Per-class rules live in `scripts/lib/orchestrator/class-plans/*.ts`
 * and are bundled into the ClassToolPlan.consistency_rules array.
 */

import type {
  ConsistencyResult,
  ConsistencyRule,
  ContractInProgress,
  ToolResult,
} from './types'

export interface VerifierOutcome {
  passed: boolean
  results: ConsistencyResult[]
  fatal_failures: ConsistencyResult[]
  warnings: ConsistencyResult[]
}

/**
 * Run a set of consistency rules against the aggregated Contract +
 * tool results. Returns a per-rule outcome + summary.
 *
 * Each rule is pure: same Contract + same tool_results → same result.
 */
export function runConsistencyVerifier(
  rules: ConsistencyRule[],
  contract: ContractInProgress,
  tool_results: Map<string, ToolResult<unknown>>,
): VerifierOutcome {
  const results: ConsistencyResult[] = []
  for (const rule of rules) {
    try {
      results.push(rule.check(contract, tool_results))
    } catch (err) {
      results.push({
        passed: false,
        detail: `rule ${rule.id} threw: ${(err as Error).message}`,
        affected_quantities: [],
        affected_tools: [],
        severity: 'fatal',
      })
    }
  }
  const fatal_failures = results.filter(r => !r.passed && r.severity === 'fatal')
  const warnings = results.filter(r => !r.passed && r.severity === 'warning')
  return {
    passed: fatal_failures.length === 0,
    results,
    fatal_failures,
    warnings,
  }
}

// ---------------------------------------------------------------------------
// HELPER FACTORIES — build common consistency rules from a quantity
// reference + a comparison. Reduces per-class boilerplate.
// ---------------------------------------------------------------------------

/**
 * Build a rule that checks `lhs_quantity * lhs_margin ≤ rhs_quantity`.
 * Example: thermal_rejection_min_kw × 1.5 ≤ cooling_capacity_kw.
 */
export function ruleQuantityRatio(
  id: string,
  description: string,
  lhsKey: string,
  rhsKey: string,
  margin: number,
  severity: ConsistencyResult['severity'] = 'fatal',
): ConsistencyRule {
  return {
    id,
    description,
    check(contract): ConsistencyResult {
      const lhs = contract.quantities[lhsKey]
      const rhs = contract.quantities[rhsKey]
      if (!lhs || !rhs) {
        return {
          passed: false,
          detail: `missing quantity: ${!lhs ? lhsKey : ''} ${!rhs ? rhsKey : ''}`,
          affected_quantities: [lhsKey, rhsKey],
          affected_tools: [],
          severity,
        }
      }
      const passed = lhs.value * margin <= rhs.value
      const ratio = (rhs.value / lhs.value).toFixed(2)
      return {
        passed,
        detail: passed
          ? `${rhsKey}=${rhs.value}${rhs.unit} ≥ ${lhsKey}=${lhs.value}${lhs.unit} × ${margin} (margin=${ratio}×)`
          : `${rhsKey}=${rhs.value}${rhs.unit} < ${lhsKey}=${lhs.value}${lhs.unit} × ${margin} (margin=${ratio}× insufficient)`,
        affected_quantities: [lhsKey, rhsKey],
        affected_tools: [lhs.provenance?.tool_id, rhs.provenance?.tool_id].filter(Boolean) as string[],
        severity,
      }
    },
  }
}

/**
 * Build a rule that verifies `target` quantity is within ±tolerance of
 * a computed expression. Example: nameplate ≈ cell_count × voltage ×
 * Ah / 1000 within ±5%.
 */
export function ruleClosure(
  id: string,
  description: string,
  targetKey: string,
  computeFn: (contract: ContractInProgress) => number | null,
  tolerancePct: number,
  severity: ConsistencyResult['severity'] = 'fatal',
): ConsistencyRule {
  return {
    id,
    description,
    check(contract): ConsistencyResult {
      const target = contract.quantities[targetKey]
      if (!target) {
        return {
          passed: false,
          detail: `missing quantity: ${targetKey}`,
          affected_quantities: [targetKey],
          affected_tools: [],
          severity,
        }
      }
      const computed = computeFn(contract)
      if (computed === null) {
        return {
          passed: false,
          detail: `compute function returned null (missing input quantities)`,
          affected_quantities: [targetKey],
          affected_tools: [],
          severity,
        }
      }
      const denom = Math.max(Math.abs(target.value), Math.abs(computed), 1e-9)
      const relDiff = Math.abs(target.value - computed) / denom * 100
      const passed = relDiff <= tolerancePct
      return {
        passed,
        detail: passed
          ? `${targetKey}=${target.value.toFixed(2)}${target.unit} ≈ computed=${computed.toFixed(2)} within ±${tolerancePct}% (Δ=${relDiff.toFixed(2)}%)`
          : `${targetKey}=${target.value.toFixed(2)}${target.unit} vs computed=${computed.toFixed(2)} differ by ${relDiff.toFixed(2)}% (tolerance ±${tolerancePct}%)`,
        affected_quantities: [targetKey],
        affected_tools: [target.provenance?.tool_id].filter(Boolean) as string[],
        severity,
      }
    },
  }
}

/**
 * Build a rule that requires a quantity to be in a numeric range.
 */
export function ruleRange(
  id: string,
  description: string,
  quantityKey: string,
  min: number,
  max: number,
  severity: ConsistencyResult['severity'] = 'fatal',
): ConsistencyRule {
  return {
    id,
    description,
    check(contract): ConsistencyResult {
      const q = contract.quantities[quantityKey]
      if (!q) {
        return {
          passed: false,
          detail: `missing quantity: ${quantityKey}`,
          affected_quantities: [quantityKey],
          affected_tools: [],
          severity,
        }
      }
      const passed = q.value >= min && q.value <= max
      return {
        passed,
        detail: passed
          ? `${quantityKey}=${q.value}${q.unit} ∈ [${min}, ${max}]`
          : `${quantityKey}=${q.value}${q.unit} outside [${min}, ${max}]`,
        affected_quantities: [quantityKey],
        affected_tools: [q.provenance?.tool_id].filter(Boolean) as string[],
        severity,
      }
    },
  }
}
