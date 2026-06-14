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

import { detectEnvelope, validateEnvelope, genericEnvelope } from './envelope'
import { buildEnvelopeVector } from './envelope-vector'
import { checkClassFit, mintProvisionalSlug, type ClassFitResult } from './class-fit-check'
import { selectPlan } from './planner'
import { composeFallbackPlan } from './auto-plan-fallback'
import { bootstrapToolPlan } from './generic/bootstrap-tool-plan'
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
  let envelope = detectEnvelope(parsedConstraints)
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

  // ── Step 1b: W0 deterministic class-fit contradiction check (tracker #21).
  // The product-classifier is ADVISORY (G2). If the brief's operating domain
  // contradicts the assigned class (e.g. a fully-immersed subsea tidal kite
  // classified wind_turbine), DOWNGRADE to the registry-miss/generic envelope
  // so the universal fallbacks fire (envelope-vector tier-b/c, generic
  // emitter, sizing families), per G3. Record the verdict for G4 provenance.
  const classFit = applyClassFitCheck(envelope, parsedConstraints)
  let mintedSlug: string | null = null
  if (classFit.fit === 'contradiction') {
    const downgraded = genericEnvelope(parsedConstraints)
    // W0 refinement (tracker #22): genericEnvelope keeps the CONTRADICTED class
    // label (wind_turbine → "wind-turbine"), which then keys every downstream
    // store (class-reference graph, corpus components, blender dispatch) to the
    // WRONG class. Mint a deterministic provisional slug from the brief's own
    // naming instead, so the novel archetype carries an honest identity.
    mintedSlug = mintProvisionalSlug(parsedConstraints)
    downgraded.class = mintedSlug
    console.error(
      `[orchestrator] CLASS-FIT CONTRADICTION (W0): classifier assigned "${classFit.class_slug}" ` +
      `(${classFit.class_domain} domain) but the brief operates in the ${classFit.brief_domain} domain. ` +
      `Routing as REGISTRY-MISS with a MINTED provisional slug (envelope.class "${envelope.class}" → ` +
      `"${downgraded.class}", scale_tier generic — contradicted label "${classFit.class_slug}" NOT kept) ` +
      `so the universal path fires instead of a wrong-class dossier. Findings: ` +
      classFit.findings.filter(f => f.severity === 'high').map(f => f.detail).join(' | '),
    )
    envelope = downgraded
  }

  // ── Step 2: Select tool plan ──────────────────────────────────────────
  let plan = selectPlan(envelope)
  if (!plan) {
    // NO hand-written ClassToolPlan matched (a NOVEL/unregistered class). Two
    // tiers, best-first:
    //
    //   TIER 1 — ON-THE-FLY TOOL-PLAN BOOTSTRAP (2026-06-14, removes the
    //   curation crutch): the engine does AT RUNTIME exactly what a human does
    //   when hand-writing a class plan — read the detailed brief + the tool
    //   catalogue, PICK the tools whose physics the brief needs, WIRE each to
    //   the tools' REAL I/O field names (validated; a hallucinated field is
    //   REJECTED, and a missing computed output is fail-closed at runtime), then
    //   topo-ORDER + run them — and CACHE the plan so re-runs are instant. This
    //   replaces the domain-blind auto-planner's nonsense selections (it picked
    //   aircraft-airfoil + AUV-hydrostatics + bicycle-gear for a fish farm).
    //   Gated behind UNIVERSAL_TOOL_PLAN_BOOTSTRAP (default ON; =0 disables),
    //   mirroring CLASS_GRAPH_BOOTSTRAP. The candidate is stored status
    //   'candidate' — NEVER auto-promoted. register-all is imported before
    //   orchestrateDesign so listTools()/getTool() are populated.
    if (process.env.UNIVERSAL_TOOL_PLAN_BOOTSTRAP !== '0') {
      try {
        // The duties = the engineering-contract quantities already on the
        // contract (key/value/unit), which describe what the system must DO.
        const duties = Object.entries(initialContract.quantities ?? {}).map(([key, qv]) => ({
          key,
          value: (qv as TypedQuantity)?.value,
          unit: (qv as TypedQuantity)?.unit ?? '',
          condition: (qv as TypedQuantity)?.condition ?? null,
        })).filter(d => typeof d.value === 'number' && Number.isFinite(d.value))
        // U6: seed the duties with the brief's reasoner-derived requirements so
        // the tool-planner sees the FULL demand set the detailed brief implies —
        // not only what the contract already happened to compute. Contract-
        // computed duties WIN on a key collision (the engine's own maths trumps
        // the brief's first-pass estimate). Brief duties carry the demand a tool
        // may not yet exist for → drives a richer (and missing-tool) selection.
        const briefDuties: any[] = Array.isArray((parsedConstraints as any).derived_requirements)
          ? (parsedConstraints as any).derived_requirements
          : []
        const dutyKeys = new Set(duties.map(d => d.key))
        for (const r of briefDuties) {
          if (!r || typeof r.key !== 'string') continue
          if (typeof r.value !== 'number' || !Number.isFinite(r.value)) continue
          if (dutyKeys.has(r.key)) continue
          dutyKeys.add(r.key)
          duties.push({ key: r.key, value: r.value, unit: typeof r.unit === 'string' ? r.unit : '', condition: null })
        }
        const boot = await bootstrapToolPlan(envelope.class, parsedConstraints, envelope, duties)
        if (boot.ok) {
          console.error(
            `[orchestrator] UNIVERSAL_TOOL_PLAN_BOOTSTRAP: no registered plan for ${envelope.class}/${envelope.scale_tier} — ` +
            `bootstrapped a ${boot.plan.tools.length}-step tool plan ` +
            `(candidate id=${boot.candidate.id} version=${boot.candidate.version} status=${boot.candidate.status} ` +
            `reused=${boot.candidate.reused} attempts=${boot.attempts} cost_usd=${boot.llm_cost_usd ?? 'n/a'}). ` +
            `Stored as CANDIDATE only — NOT auto-promoted. Selected: ${boot.selected_tool_ids.join(', ')}`,
          )
          plan = boot.plan
        } else {
          console.error(
            `[orchestrator] UNIVERSAL_TOOL_PLAN_BOOTSTRAP failed (stage=${boot.stage}) for ${envelope.class}: ${boot.error}` +
            (boot.validation_errors.length > 0 ? ` | validation: ${boot.validation_errors.slice(0, 5).join('; ')}` : '') +
            ` — falling through to the auto-planner fallback.`,
          )
        }
      } catch (err) {
        console.error(`[orchestrator] UNIVERSAL_TOOL_PLAN_BOOTSTRAP threw for ${envelope.class}: ${(err as Error).message} — falling through to the auto-planner fallback.`)
      }
    }

    // TIER 2 — WALL-2 AUTO-PLANNER FALLBACK (2026-06-01, LAST RESORT): only if
    // the bootstrap returned no plan. Composes a tool graph from declared tool
    // I/O by backward-chaining (domain-blind — kept solely so a novel class
    // still advances past wall-2 when the bootstrap is unavailable, e.g. no API
    // key). Gated behind UNIVERSAL_AUTO_PLAN. Returns null when the flag is off
    // or no graph composes → we keep the loud failure below verbatim.
    if (!plan) {
      const composed = composeFallbackPlan(envelope, parsedConstraints)
      if (composed) {
        console.error(
          `[orchestrator] UNIVERSAL_AUTO_PLAN (fallback): no registered plan AND bootstrap unavailable for ${envelope.class}/${envelope.scale_tier} — composed a ${composed.plan.tools.length}-tool fallback graph ` +
          `(coupled_pairs=${composed.graph.coupled_pairs.length}, unmet_outputs=${composed.graph.unmet_outputs.length}). All steps non-fatal; proceeding past wall-2.`,
        )
        plan = composed.plan
      } else {
        const prefix = loud_failures ? '[LOUD] ' : ''
        return failResult(
          initialContract,
          [`${prefix}no tool plan registered for envelope ${envelope.class}/${envelope.scale_tier} — class needs a ClassToolPlan in scripts/lib/orchestrator/class-plans/<class>.ts with envelope_predicate matching this envelope (or set UNIVERSAL_TOOL_PLAN_BOOTSTRAP=1 / UNIVERSAL_AUTO_PLAN=1 to compose one)`],
          fallback_on_failure,
        )
      }
    }
  }

  // Annotate the Contract envelope (if not already set) + G4 class-fit note.
  const contractWithEnv: ContractInProgress = {
    ...initialContract,
    envelope,
    _tools_run: [...(initialContract._tools_run ?? [])],
    class_fit: {
      fit: classFit.fit,
      class_slug: classFit.class_slug,
      brief_domain: classFit.brief_domain,
      class_domain: String(classFit.class_domain),
      // G4 provenance (tracker #22): on a contradiction, record BOTH the
      // contradicted classifier label AND the minted provisional slug the
      // envelope now carries, so the dossier can surface the re-route honestly.
      ...(mintedSlug
        ? { contradicted_class: classFit.class_slug, minted_slug: mintedSlug }
        : {}),
      findings: classFit.findings.map(f => ({
        signal: f.signal, severity: f.severity, detail: f.detail, evidence: f.evidence,
      })),
    },
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
  // U9-A: derive flow_edges from the plan's feeds_into declarations so
  // the renderer can draw real tool→tool dependency arrows in the
  // Engineering Tools Flow diagram (Section 1c), and so U9-B can
  // replace "(none)" input_summary with actual feeder provenance.
  const planFlowEdges: Array<{ from: string; to: string }> = []
  for (const step of plan.tools) {
    for (const downstream of step.feeds_into) {
      planFlowEdges.push({ from: step.tool_id, to: downstream })
    }
  }
  const toolsUsedPage = buildToolsUsedPage(aggregatorOutcome.contract, planFlowEdges)

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

/**
 * W0 READY INTEGRATION FUNCTION (tracker #21). Builds the envelope vector for
 * the constraints and runs the deterministic class-fit contradiction check
 * against the assigned class. Pure + deterministic (no LLM). Exported so the
 * chain can call it directly if it ever wires the check ahead of the
 * orchestrator; orchestrateDesign calls it internally (step 1b).
 *
 * The classifier output reaches this via parsedConstraints.product_class (the
 * normalised slug also lives on envelope.class). We check the constraints'
 * declared product_class — the classifier's verdict — NOT the post-downgrade
 * envelope class.
 */
export function applyClassFitCheck(
  envelope: { class: string },
  parsedConstraints: ParsedConstraints,
): ClassFitResult {
  const vector = buildEnvelopeVector(parsedConstraints)
  const slug = String(parsedConstraints.product_class ?? envelope.class ?? '')
  return checkClassFit(parsedConstraints, vector, slug)
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
  generatePhysicsNarrative,
} from './attribution'
export type { PhysicsNarrative } from './attribution'
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
