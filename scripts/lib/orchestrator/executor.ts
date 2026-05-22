/**
 * scripts/lib/orchestrator/executor.ts
 *
 * TOOL EXECUTOR WITH ITERATIVE SOLVER — runs a ClassToolPlan against a
 * starting Contract, producing an enriched Contract + per-tool results.
 *
 * Per Gemini 3.1 Pro + Kimi K2.6 council requirement: coupled physics
 * (BESS thermal↔electrical, heat pump refrigerant↔HX, HAPS aero↔structural)
 * cannot be solved by a single sequential pass. The executor splits the
 * plan into independent tools (run once) and coupled tools (run inside
 * a fixed-point loop until quantities converge OR max_iterations hit).
 *
 * Pure-ish: tool invocations are async + side-effecting (subprocess,
 * API), but the loop logic is deterministic given the same starting
 * Contract + same tool outputs.
 */

import type {
  ClassToolPlan,
  ContractInProgress,
  ParsedConstraints,
  ToolResult,
  ToolStep,
} from './types'
import { getTool } from './registry'

export interface ExecutorOutcome {
  contract: ContractInProgress
  tool_results: Map<string, ToolResult<unknown>>
  iterations: number
  failures: string[]
  warnings: string[]
}

/**
 * Run a ClassToolPlan. Returns the enriched Contract + per-tool results
 * + iteration count + failure list.
 *
 * Failures are accumulated, not thrown — the caller decides whether to
 * fall back to LLM or proceed with partial Contract.
 */
export async function runToolPlan(
  plan: ClassToolPlan,
  initialContract: ContractInProgress,
  brief: ParsedConstraints,
): Promise<ExecutorOutcome> {
  let contract = { ...initialContract, _tools_run: [...initialContract._tools_run] }
  const tool_results = new Map<string, ToolResult<unknown>>()
  const failures: string[] = []
  const warnings: string[] = []
  let iterations = 0

  // ── Split into independent vs coupled ────────────────────────────
  const coupledTools = new Set<string>()
  for (const [a, b] of plan.coupled_pairs) {
    coupledTools.add(a)
    coupledTools.add(b)
  }
  const independent = plan.tools.filter(t => !coupledTools.has(t.tool_id))
  const coupled = plan.tools.filter(t => coupledTools.has(t.tool_id))

  // ── Run independent tools once ───────────────────────────────────
  for (const step of independent) {
    const outcome = await runStep(step, contract, brief, tool_results)
    if (!outcome.ok && step.required) {
      failures.push(`required tool ${step.tool_id} failed: ${outcome.error ?? 'unknown'}`)
      // Continue executing — accumulator pattern. Caller decides fallback.
    }
    if (outcome.contract) contract = outcome.contract
    if (outcome.warnings.length > 0) warnings.push(...outcome.warnings)
  }

  // ── Run coupled tools in fixed-point loop ────────────────────────
  if (coupled.length > 0) {
    let prevSnapshot: ContractInProgress | null = null
    for (iterations = 1; iterations <= plan.max_iterations; iterations++) {
      prevSnapshot = snapshotForConvergence(contract)
      for (const step of coupled) {
        const outcome = await runStep(step, contract, brief, tool_results)
        if (!outcome.ok && step.required) {
          failures.push(`coupled tool ${step.tool_id} failed at iter ${iterations}: ${outcome.error ?? 'unknown'}`)
        }
        if (outcome.contract) contract = outcome.contract
        if (outcome.warnings.length > 0) warnings.push(...outcome.warnings)
      }
      if (hasConverged(prevSnapshot, contract, plan.convergence_tolerance_pct)) break
    }
    if (iterations > plan.max_iterations) {
      failures.push(`fixed-point iteration did not converge in ${plan.max_iterations} iterations`)
    }
  }

  return { contract, tool_results, iterations, failures, warnings }
}

// ---------------------------------------------------------------------------
// PRIVATE
// ---------------------------------------------------------------------------

interface StepOutcome {
  ok: boolean
  contract: ContractInProgress | null
  warnings: string[]
  error?: string
}

async function runStep(
  step: ToolStep,
  contract: ContractInProgress,
  brief: ParsedConstraints,
  tool_results: Map<string, ToolResult<unknown>>,
): Promise<StepOutcome> {
  const tool = getTool(step.tool_id)
  if (!tool) {
    return { ok: false, contract: null, warnings: [], error: `tool not in registry: ${step.tool_id}` }
  }

  let result: ToolResult<unknown>
  try {
    const input = step.input_from_contract(contract, brief)
    result = await tool.invoke(input, contract)
  } catch (err) {
    return { ok: false, contract: null, warnings: [], error: `tool ${step.tool_id} threw: ${(err as Error).message}` }
  }

  tool_results.set(step.tool_id, result)
  if (!result.ok) return { ok: false, contract: null, warnings: result.warnings, error: result.error }

  const updated = step.contract_update(contract, result.output)
  const newContract = {
    ...updated,
    _tools_run: [...updated._tools_run.filter(t => t !== step.tool_id), step.tool_id],
  }
  return { ok: true, contract: newContract, warnings: result.warnings }
}

/** Take a snapshot of just the quantity values for convergence
 *  comparison. We compare numeric values; provenance metadata is
 *  ignored because it changes per invocation (timestamp). */
function snapshotForConvergence(c: ContractInProgress): ContractInProgress {
  return {
    ...c,
    quantities: Object.fromEntries(
      Object.entries(c.quantities).map(([k, q]) => [k, { ...q }]),
    ),
  }
}

/** Returns true if max relative change across COMMON quantities is below
 *  the tolerance. New quantities added between iterations count as
 *  PROGRESS (a coupled tool ran and produced output for the first time),
 *  not as non-convergence. Removed quantities still signal instability.
 *
 *  (2026-05-22 Tristan: previously, ANY new key flagged the iteration
 *  as non-converged. With VF's 2 coupled pairs (4 tools), tool A's
 *  output in iter N enables tool B to compute a new field in iter N+1
 *  — that's a genuine fixed-point step, not divergence. Returning
 *  "not converged" trapped VF in the LLM-fallback path.) */
function hasConverged(
  prev: ContractInProgress,
  curr: ContractInProgress,
  tolerancePct: number,
): boolean {
  if (!prev || !curr) return false
  const prevKeys = new Set(Object.keys(prev.quantities))
  const currKeys = new Set(Object.keys(curr.quantities))

  // Removed quantities = a tool retracted output → unstable, not converged
  for (const k of prevKeys) if (!currKeys.has(k)) return false

  // Numeric comparison on COMMON keys only. New keys (in curr but not
  // prev) are accepted as one-time progress on this iteration; they
  // will be checked for stability on the NEXT iteration.
  for (const k of prevKeys) {
    const a = prev.quantities[k].value
    const b = curr.quantities[k].value
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue
    const denom = Math.max(Math.abs(a), Math.abs(b), 1e-9)
    const relChange = Math.abs(a - b) / denom * 100
    if (relChange > tolerancePct) return false
  }
  return true
}
