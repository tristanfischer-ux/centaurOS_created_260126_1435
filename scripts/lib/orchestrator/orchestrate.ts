/**
 * scripts/lib/orchestrator/orchestrate.ts
 *
 * UNIVERSAL ENGINEERING ORCHESTRATOR — top-level entry point.
 *
 * The chain calls `orchestrateDesign(brief, parsedConstraints)`. The
 * orchestrator:
 *   1. detects envelope (rules-only)
 *   2. selects a registered ClassToolPlan (static lookup, no LLM)
 *   3. runs all tools (with iterative solving for coupled physics)
 *   4. validates cross-tool consistency
 *   5. assembles the final DesignJSON
 *
 * Returns an OrchestratorResult. If `ok` is false OR `fallback_to_llm`
 * is true, the chain falls back to the legacy LLM Generator path.
 *
 * Per the round-3 council verdict (drawer drawer_forgeos_decisions_98d0586eb00a5c7f)
 * refined by LLM-position commitment (drawer drawer_forgeos_decisions_b6ca90761c861622):
 *   - NO LLM in this entry point
 *   - All work delegated to deterministic modules
 *   - LLM appears only in the chain's brief parser (upstream) and
 *     narrator (downstream), each sandwiched by deterministic
 *     validators (prose-validator.ts is the narrator sandwich)
 */

import { detectEnvelope, validateEnvelope } from './envelope'
import { selectPlan } from './planner'
import { runToolPlan } from './executor'
import { runConsistencyVerifier } from './verifier'
import { finaliseContract } from './aggregator'
import { assembleDesign } from './assembler'
import { buildToolsUsedPage } from './attribution'
import type {
  ContractInProgress,
  OrchestratorResult,
  ParsedConstraints,
  TypedQuantity,
} from './types'

export interface OrchestrateOptions {
  /** If true, fall back to LLM path on ANY failure (default true).
   *  If false, return partial result with failures for diagnostic use. */
  fallback_on_failure?: boolean
}

/**
 * Top-level orchestrator entry. Returns the final Contract +
 * design JSON + tools-used attribution page, OR signals fall-back
 * to the legacy LLM Generator path.
 *
 * 2026-05-23 (Task #66): when `ORCHESTRATOR=1` is set without
 * `ALLOW_LLM_FALLBACK=1`, envelope-null produces a STRUCTURED LOUD
 * failure rather than a silent LLM fallback. The chain caller is
 * responsible for honouring the `fallback_to_llm` flag — but the
 * `failures` array now carries a `[loud]` prefix that the chain
 * surfaces in the operator log AND in a PDF banner. Per 5-seat
 * council verdict 2026-05-23 (synthesised): silent degradation
 * from tool-grounded to LLM-only path destroys product value.
 */
export async function orchestrateDesign(
  parsedConstraints: ParsedConstraints,
  initialContract: ContractInProgress,
  opts: OrchestrateOptions = {},
): Promise<OrchestratorResult & { design: unknown; tools_used_page: unknown }> {
  const fallback_on_failure = opts.fallback_on_failure ?? true
  // 2026-05-23 PRUNE: the chain script now invokes the orchestrator
  // unconditionally (no more `ORCHESTRATOR=1` gate) and hard-exits on
  // failure (no more LLM Generator fallback). The previous gate
  // `orchestrator_explicit = process.env.ORCHESTRATOR === '1'` is removed.
  // Loud failures are emitted whenever the caller asked for a Contract
  // result (fallback_on_failure=true). ALLOW_LLM_FALLBACK=1 remains as a
  // diagnostic-only opt-out — it suppresses the [LOUD] prefix so legacy
  // tooling that grepped for "[LOUD]" can still distinguish silent vs loud.
  const allow_silent_fallback = process.env.ALLOW_LLM_FALLBACK === '1'
  const loud_failures = !allow_silent_fallback

  // ── Step 1: Detect envelope ────────────────────────────────────────────
  const envelope = detectEnvelope(parsedConstraints)
  if (!envelope) {
    const detail = buildEnvelopeFailureDetail(parsedConstraints)
    const prefix = loud_failures ? '[LOUD] ' : ''
    return failResult(
      initialContract,
      [`${prefix}envelope detection failed for class="${parsedConstraints.product_class}" — ${detail}`],
      fallback_on_failure,
    )
  }
  const envErrors = validateEnvelope(envelope)
  if (envErrors.length > 0) {
    const prefix = loud_failures ? '[LOUD] ' : ''
    return failResult(initialContract, envErrors.map(e => `${prefix}envelope validation: ${e}`), fallback_on_failure)
  }

  // ── Step 2: Select tool plan ──────────────────────────────────────────
  const plan = selectPlan(envelope)
  if (!plan) {
    const prefix = loud_failures ? '[LOUD] ' : ''
    return failResult(
      initialContract,
      [`${prefix}no tool plan registered for envelope ${envelope.class}/${envelope.scale_tier} — class needs a ClassToolPlan in scripts/lib/orchestrator/class-plans/<class>.ts with envelope_predicate matching this envelope`],
      fallback_on_failure,
    )
  }

  // Annotate the Contract envelope (if not already set)
  const contractWithEnv: ContractInProgress = {
    ...initialContract,
    envelope,
    _tools_run: [...(initialContract._tools_run ?? [])],
  }

  // ── Step 3: Run tool plan ─────────────────────────────────────────────
  const executorOutcome = await runToolPlan(plan, contractWithEnv, parsedConstraints)
  const toolFailures = executorOutcome.failures
  if (toolFailures.length > 0 && fallback_on_failure) {
    const prefix = loud_failures ? '[LOUD] ' : ''
    return failResult(executorOutcome.contract, toolFailures.map(f => `${prefix}tool failure: ${f}`), fallback_on_failure, executorOutcome.tool_results, executorOutcome.iterations)
  }

  // ── Step 4: Cross-tool consistency verifier ──────────────────────────
  const verifierOutcome = runConsistencyVerifier(
    plan.consistency_rules,
    executorOutcome.contract,
    executorOutcome.tool_results,
  )
  if (!verifierOutcome.passed && fallback_on_failure) {
    const prefix = loud_failures ? '[LOUD] ' : ''
    return failResult(
      executorOutcome.contract,
      verifierOutcome.fatal_failures.map(r => `${prefix}consistency failure: ${r.detail}`),
      fallback_on_failure,
      executorOutcome.tool_results,
      executorOutcome.iterations,
    )
  }

  // ── Step 5: Finalise + aggregator ────────────────────────────────────
  const aggregatorOutcome = finaliseContract(executorOutcome.contract, executorOutcome.tool_results)

  // ── Step 6: Assemble DesignJSON ──────────────────────────────────────
  const assemblerOutcome = await assembleDesign(aggregatorOutcome.contract, envelope, parsedConstraints)
  if (!assemblerOutcome.ok || !assemblerOutcome.design) {
    const prefix = loud_failures ? '[LOUD] ' : ''
    return failResult(
      aggregatorOutcome.contract,
      [`${prefix}assembler failed: ${assemblerOutcome.error ?? 'returned no design'}`],
      fallback_on_failure,
      executorOutcome.tool_results,
      executorOutcome.iterations,
    )
  }

  // ── Step 7: Build Tools-Used page ───────────────────────────────────
  const toolsUsedPage = buildToolsUsedPage(aggregatorOutcome.contract)

  return {
    ok: true,
    contract: aggregatorOutcome.contract,
    tool_results: executorOutcome.tool_results,
    consistency_results: verifierOutcome.results,
    iterations: executorOutcome.iterations,
    failures: [],
    fallback_to_llm: false,
    design: assemblerOutcome.design,
    tools_used_page: toolsUsedPage,
  }
}

function failResult(
  contract: ContractInProgress,
  failures: string[],
  fallback: boolean,
  tool_results: Map<string, any> = new Map(),
  iterations = 0,
): OrchestratorResult & { design: unknown; tools_used_page: unknown } {
  return {
    ok: false,
    contract,
    tool_results,
    consistency_results: [],
    iterations,
    failures,
    fallback_to_llm: fallback,
    design: null,
    tools_used_page: null,
  }
}

/**
 * Build a structured diagnostic string explaining WHY envelope detection
 * returned null. Operator-facing: tells them which field was missing or
 * which unit family failed to match — so they can fix the brief instead
 * of staring at "envelope detection failed".
 */
function buildEnvelopeFailureDetail(c: ParsedConstraints): string {
  const parts: string[] = []
  const tp = c.target_performance
  if (!tp) {
    parts.push('target_performance is undefined')
  } else if (tp.value == null) {
    parts.push('target_performance.value is null (brief parser found no extractable metric)')
  } else if (!tp.unit) {
    parts.push(`target_performance.value=${tp.value} but unit is missing`)
  } else {
    parts.push(`target_performance={value: ${tp.value}, unit: "${tp.unit}"} — unit not in any expected scale-metric family for class "${c.product_class}"`)
  }

  const desc = String(c.product_description ?? '').slice(0, 120)
  if (desc) parts.push(`product_description first 120 chars: "${desc}${desc.length >= 120 ? '…' : ''}"`)

  parts.push('FIX: ensure brief contains a top-line scale metric in the unit family the detector expects (e.g. bioreactor → litres, heat pump → kW heat output, electrolyser → kW or Nm³/hr). Or set ALLOW_LLM_FALLBACK=1 to permit silent LLM-only fallback.')

  return parts.join(' | ')
}

// ---------------------------------------------------------------------------
// CONVENIENCE EXPORTS — used by tests and external callers.
// ---------------------------------------------------------------------------

export { detectEnvelope, validateEnvelope } from './envelope'
export { registerTool, getTool, listTools } from './registry'
export { registerPlan, listPlans, selectPlan, detectPlanOverlaps, validatePlan } from './planner'
export { runToolPlan } from './executor'
export { runConsistencyVerifier, ruleQuantityRatio, ruleClosure, ruleRange } from './verifier'
export { finaliseContract } from './aggregator'
export { assembleDesign } from './assembler'
export {
  extractNumbersFromProse,
  extractNumbersFromDesign,
  validateProseNumbers,
} from './prose-validator'
export {
  buildToolsUsedPage,
  renderToolsUsedPageAsText,
} from './attribution'
export type * from './types'

/** Helper used by the chain orchestrator: was at least one quantity
 *  in the Contract tool-sourced? Used to decide whether to render the
 *  Tools-Used attribution page in the final PDF. */
export function contractHasToolSources(contract: ContractInProgress): boolean {
  for (const q of Object.values(contract.quantities) as TypedQuantity[]) {
    if (typeof q.provenance.source === 'string' && q.provenance.source.startsWith('tool:')) {
      return true
    }
  }
  return false
}
