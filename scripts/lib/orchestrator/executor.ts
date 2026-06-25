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
import { loadToolInputKeys } from './attribution'

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
      // (2026-05-22 Tristan: convergence-not-reached used to push to
      // `failures`, which triggered a hard fallback to the LLM path. For
      // multi-coupled-pair classes (VF, HAPS, …) the values oscillate
      // within a small band but never quite settle below the 5% tolerance
      // — that's a normal property of the engineering coupling, not a
      // failure. Downgrade to a warning so the orchestrator proceeds with
      // the iter-N state. Aggregator + verifier will catch any genuine
      // inconsistency downstream.)
      // 2026-05-23 P1-7: warning is still emitted but ALSO surface a [LOUD]
      // marker so the chain's audit machinery can flag it without forcing
      // a hard fallback. The chain log will now show this as a YELLOW
      // warning rather than silent acceptance; future renderer / audit can
      // pick up the marker. Underlying behaviour (use iter-N state) is
      // preserved — the change is visibility, not semantics.
      const msg = `fixed-point iteration did not converge in ${plan.max_iterations} iterations — using iter-${plan.max_iterations} state (design may oscillate within ${plan.convergence_tolerance_pct}% band)`
      warnings.push(msg)
      console.error(`[orchestrator] ⚠️  ${msg}`)
    }
  }

  return { contract, tool_results, iterations, failures, warnings }
}

// ---------------------------------------------------------------------------
// PRIVATE
// ---------------------------------------------------------------------------

/** TRACEABILITY SPINE: after a tool writes its outputs into the contract, stamp every NEW or
 *  CHANGED quantity with its lineage — the tool that produced it (`source: tool:<id>`, a
 *  `lineage.from` list of the tool's declared inputs that exist as quantities, and a prose
 *  `source_detail`) — so no tool-produced number is born sourceless ("appears from nowhere").
 *  UNIVERSAL: this ONE place covers every tool's outputs across every archetype, with no
 *  per-tool code. Fills ONLY the gap — a quantity that already records a real source/lineage
 *  is never overwritten. (The contract's flat quantity shape carries source/source_detail/
 *  lineage; we read/write it via an index cast since the in-progress contract type is loose.) */
export function stampToolLineage(
  beforeVals: Record<string, number | undefined>,
  contract: ContractInProgress,
  toolId: string,
): void {
  const declared = loadToolInputKeys().get(toolId) ?? []
  const present = new Set(Object.keys(contract.quantities))
  const from = declared.filter(k => present.has(k))
  const fromList = from.length ? from : ['brief']
  for (const [key, qRaw] of Object.entries(contract.quantities)) {
    const qq = qRaw as unknown as Record<string, unknown> | undefined
    if (!qq || typeof qq !== 'object') continue
    const prev = beforeVals[key]
    const changed = prev === undefined || prev !== (qq.value as number | undefined)
    if (!changed) continue
    const src = String(qq.source ?? '')
    if (!src || src === '<none>') qq.source = `tool:${toolId}`
    if (!qq.lineage) qq.lineage = { from: fromList, via: `tool:${toolId}` }
    if (!String(qq.source_detail ?? '').trim()) {
      qq.source_detail = from.length
        ? `computed by ${toolId} from ${from.slice(0, 8).join(', ')}`
        : `computed by ${toolId} (inputs from brief)`
    }
  }
}

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

  // TRACEABILITY SPINE (Tristan 2026-06-25: "every number should come from some original
  // source — the brief → tools → contract; nothing appears from nowhere"). Snapshot the
  // quantity values BEFORE the tool writes its outputs, so we can stamp lineage on exactly
  // the quantities this tool produced or changed.
  const beforeVals: Record<string, number | undefined> = {}
  for (const [k, v] of Object.entries(contract.quantities)) {
    beforeVals[k] = (v as unknown as { value?: number } | undefined)?.value
  }
  const updated = step.contract_update(contract, result.output)
  const newContract: ContractInProgress = {
    ...updated,
    _tools_run: [...updated._tools_run.filter(t => t !== step.tool_id), step.tool_id],
  }
  stampToolLineage(beforeVals, newContract, step.tool_id)
  // Capture the tool's worked calculations (inputs -> formula -> substituted numbers
  // -> result) so the Tools-Used appendix can show the maths a reviewer can check by
  // hand. UNIVERSAL: any tool whose Python emits a `worked` list is covered with zero
  // per-class code; tools that emit none (incl. stubs) simply contribute nothing —
  // we never show a fabricated working. Keyed by tool_id, persisted on the contract.
  const workedOut = (result.output as { worked?: unknown })?.worked
  if (Array.isArray(workedOut) && workedOut.length > 0) {
    const wc = ((newContract as any).worked_calculations ??= {})
    wc[step.tool_id] = workedOut
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
