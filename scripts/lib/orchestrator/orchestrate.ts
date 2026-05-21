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
 */
export async function orchestrateDesign(
  parsedConstraints: ParsedConstraints,
  initialContract: ContractInProgress,
  opts: OrchestrateOptions = {},
): Promise<OrchestratorResult & { design: unknown; tools_used_page: unknown }> {
  const fallback_on_failure = opts.fallback_on_failure ?? true

  // ── Step 1: Detect envelope ────────────────────────────────────────────
  const envelope = detectEnvelope(parsedConstraints)
  if (!envelope) {
    return failResult(
      initialContract,
      ['envelope detection failed — no class detector matched parsedConstraints.product_class'],
      fallback_on_failure,
    )
  }
  const envErrors = validateEnvelope(envelope)
  if (envErrors.length > 0) {
    return failResult(initialContract, envErrors, fallback_on_failure)
  }

  // ── Step 2: Select tool plan ──────────────────────────────────────────
  const plan = selectPlan(envelope)
  if (!plan) {
    return failResult(
      initialContract,
      [`no tool plan registered for envelope: ${JSON.stringify(envelope)}`],
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
    return failResult(executorOutcome.contract, toolFailures, fallback_on_failure, executorOutcome.tool_results, executorOutcome.iterations)
  }

  // ── Step 4: Cross-tool consistency verifier ──────────────────────────
  const verifierOutcome = runConsistencyVerifier(
    plan.consistency_rules,
    executorOutcome.contract,
    executorOutcome.tool_results,
  )
  if (!verifierOutcome.passed && fallback_on_failure) {
    return failResult(
      executorOutcome.contract,
      verifierOutcome.fatal_failures.map(r => `consistency failure: ${r.detail}`),
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
    return failResult(
      aggregatorOutcome.contract,
      [assemblerOutcome.error ?? 'assembler returned no design'],
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
