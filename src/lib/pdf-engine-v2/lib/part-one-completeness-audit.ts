// part-one-completeness-audit.ts
//
// THE PART-1 COMPLETENESS GATE (Phase 0 of the universal-engineering build,
// 2026-06-10). The self-correcting net that would have caught the compute_heat
// "1 kW spacecraft-radiator" dossier BEFORE it shipped.
//
// WHAT IT DOES (universal, class-agnostic, deterministic — no LLM):
//   Reads state.orchestratorContract.quantities and asks the one question the
//   reader cares most about: does Part 1 (Engineering Basis + Engineering
//   Calculations) have any REAL engineering physics in it, or is it hollow?
//
//   The auto-planner (auto-plan-fallback.ts) selects tools for an unseen
//   archetype but cannot ground their outputs — it writes only breadcrumb flags
//   `auto_planned_tool_ran__<id>` (auto-plan-fallback.ts:201), NOT the tool's
//   real outputs. So a hollow dossier has a `quantities` map that is ALL
//   breadcrumbs and ZERO real numbers. Verified on out/compute-heat-module-v5/
//   state.json: nine `auto_planned_tool_ran__* = {value:1, unit:'flag'}` entries
//   and not a single real engineering quantity. The renderer then faithfully
//   renders nonsense (a blank mass/energy balance + archetype-wrong worked calcs).
//
// VERDICT (the gate-severity philosophy: WRONGNESS hard-exits, soft deviation flags):
//   'hollow'      — quantities are ONLY breadcrumb flags (real_count === 0), OR
//                   thin + ungrounded (breadcrumbs present, < MIN_REAL real
//                   quantities, AND zero worked-calc steps). Part 1 cannot be a 9.
//   'pass'        — real engineering quantities present.
//   'unavailable' — no orchestratorContract.quantities at all (cannot assess;
//                   never blocks — a class on the legacy/LLM path is not our case).
//
// SHADOW by default (records state.partOneCompleteness + logs; NEVER exits).
// ENFORCING is opt-in via PART_ONE_COMPLETENESS_ENFORCING; a 'hollow' verdict
// then hard-exits 36. Default OFF so an in-flight re-run is never blocked.
// Kill entirely with CHAIN_SKIP_PART_ONE_COMPLETENESS=1.
//
// Distinct from gate 32 (independent cost-sanity): that checks the £/output-unit
// MAGNITUDE is sane; this checks the engineering CONTENT EXISTS at all. A dossier
// can have a plausible headline cost (gate 32 passes) while Part 1 is hollow.

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** A real engineering design derives many quantities (capacities, ratings,
 *  flows, masses…). Fewer than this WITH breadcrumb flags present + no worked
 *  maths is the ungrounded auto-plan signature. Deliberately low to avoid
 *  false-positives on a genuinely small but real design. */
export const MIN_REAL_QUANTITIES = 3

/** The breadcrumb-flag key prefix written by the auto-planner when it selects a
 *  tool it cannot ground (auto-plan-fallback.ts:201). */
export const AUTO_PLANNED_FLAG_PREFIX = 'auto_planned_tool_ran__'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PartOneCompletenessVerdict = 'pass' | 'hollow' | 'unavailable'

export interface PartOneCompletenessResult {
  verdict: PartOneCompletenessVerdict
  /** Quantity keys that are NOT auto-planned breadcrumb flags. */
  real_quantity_count: number
  /** Quantity keys matching the `auto_planned_tool_ran__*` breadcrumb prefix. */
  breadcrumb_count: number
  /** Total keys in orchestratorContract.quantities. */
  total_quantity_count: number
  /** Total worked-calculation steps across all tools (the maths Part 1 renders). */
  worked_calc_step_count: number
  /** One-line human summary. */
  message: string
  /** The specific signals that drove a 'hollow' verdict. */
  reasons: string[]
  /** A few example real quantity keys (diagnostic). */
  sample_real_quantities: string[]
}

export type PartOneCompletenessEnforceMode = 'off' | 'on'

/** Fatal chain exit code for an enforced Part-1-completeness block. Next free
 *  after 35 (render-quality). Codes 0-34 are in the repo CLAUDE.md exit table;
 *  35 is render-quality-audit. */
export const PART_ONE_COMPLETENESS_EXIT_CODE = 36

export interface PartOneCompletenessEnforcementDecision {
  shouldExit: boolean
  exitCode: number
  reason: string
  mode: PartOneCompletenessEnforceMode
}

// ---------------------------------------------------------------------------
// Pure compute (no LLM, no I/O)
// ---------------------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Count worked-calculation steps the engine produced. The executor stows each
 *  tool's worked array on contract.worked_calculations[tool_id]; the assembled
 *  state.toolsUsedPage carries the same `worked` arrays per tool. We read both
 *  defensively and take the larger count, so the gate works whether or not the
 *  tools-used page has been assembled yet. */
export function countWorkedCalcSteps(state: any): number {
  let fromContract = 0
  const wc = state?.orchestratorContract?.worked_calculations
  if (isPlainObject(wc)) {
    for (const v of Object.values(wc)) {
      if (Array.isArray(v)) fromContract += v.length
    }
  }
  let fromToolsPage = 0
  const tools = state?.toolsUsedPage?.tools
  if (Array.isArray(tools)) {
    for (const t of tools) {
      if (Array.isArray(t?.worked)) fromToolsPage += t.worked.length
    }
  }
  return Math.max(fromContract, fromToolsPage)
}

export function computePartOneCompleteness(state: any): PartOneCompletenessResult {
  const quantities = state?.orchestratorContract?.quantities
  const worked_calc_step_count = countWorkedCalcSteps(state)

  // No contract quantities at all → cannot assess. Never block (a class on the
  // legacy / LLM path, or a pre-orchestration state, is not the hollow case).
  if (!isPlainObject(quantities)) {
    return {
      verdict: 'unavailable',
      real_quantity_count: 0,
      breadcrumb_count: 0,
      total_quantity_count: 0,
      worked_calc_step_count,
      message: 'No orchestratorContract.quantities present — Part-1 completeness not assessable (not blocking).',
      reasons: [],
      sample_real_quantities: [],
    }
  }

  const keys = Object.keys(quantities)
  const breadcrumbKeys = keys.filter(k => k.startsWith(AUTO_PLANNED_FLAG_PREFIX))
  const realKeys = keys.filter(k => !k.startsWith(AUTO_PLANNED_FLAG_PREFIX))
  const breadcrumb_count = breadcrumbKeys.length
  const real_quantity_count = realKeys.length
  const total_quantity_count = keys.length

  const reasons: string[] = []

  // Signal 1 — quantities exist but are ONLY breadcrumb flags. The exact
  // compute_heat failure: the auto-planner ran tools but grounded nothing.
  const onlyBreadcrumbs = total_quantity_count > 0 && real_quantity_count === 0
  if (onlyBreadcrumbs) {
    reasons.push(
      `quantities are ONLY auto-planned breadcrumb flags (${breadcrumb_count} flags, 0 real engineering quantities) — the auto-planner selected tools but grounded none`,
    )
  }

  // Signal 2 — thin + ungrounded: a couple of real quantities, breadcrumbs
  // present, and NO worked maths. Part 1's Engineering Calculations would render
  // empty even though a class technically "ran".
  const thinAndUngrounded =
    !onlyBreadcrumbs &&
    breadcrumb_count > 0 &&
    real_quantity_count < MIN_REAL_QUANTITIES &&
    worked_calc_step_count === 0
  if (thinAndUngrounded) {
    reasons.push(
      `thin + ungrounded: only ${real_quantity_count} real quantities (< ${MIN_REAL_QUANTITIES}) with ${breadcrumb_count} breadcrumb flags and ZERO worked-calculation steps — Engineering Calculations would render empty`,
    )
  }

  const verdict: PartOneCompletenessVerdict = reasons.length > 0 ? 'hollow' : 'pass'

  const message =
    verdict === 'hollow'
      ? `Part 1 is HOLLOW: ${reasons[0]}.`
      : `Part 1 has real engineering content (${real_quantity_count} real quantities, ${worked_calc_step_count} worked-calc steps).`

  return {
    verdict,
    real_quantity_count,
    breadcrumb_count,
    total_quantity_count,
    worked_calc_step_count,
    message,
    reasons,
    sample_real_quantities: realKeys.slice(0, 8),
  }
}

// ---------------------------------------------------------------------------
// Enforcement decision (pure)
// ---------------------------------------------------------------------------

export function evaluatePartOneCompletenessEnforcement(
  result: PartOneCompletenessResult,
  mode: PartOneCompletenessEnforceMode,
): PartOneCompletenessEnforcementDecision {
  // Only a 'hollow' verdict blocks, and only when enforcing. 'unavailable' and
  // 'pass' never block. ('unavailable' is the cannot-assess case — blocking it
  // would break every legacy/LLM-path class that has no orchestratorContract.)
  const shouldExit = mode === 'on' && result.verdict === 'hollow'
  return {
    shouldExit,
    exitCode: PART_ONE_COMPLETENESS_EXIT_CODE,
    reason: shouldExit
      ? `Part-1 completeness HOLLOW: ${result.reasons.join('; ')}`
      : `no block (verdict ${result.verdict}, mode ${mode})`,
    mode,
  }
}

/** off / 0 / false / shadow / '' / undefined → off (shadow). Anything else
 *  truthy (1 / true / on / enforce) → on. Default is OFF (shadow). */
export function partOneCompletenessEnforceModeFromEnv(v: string | undefined): PartOneCompletenessEnforceMode {
  if (v === undefined) return 'off'
  const t = v.trim().toLowerCase()
  if (t === '' || t === '0' || t === 'false' || t === 'off' || t === 'shadow') return 'off'
  return 'on'
}

/** Convenience one-shot used by tests + any caller that wants the verdict +
 *  enforcement decision together. */
export function runPartOneCompleteness(
  state: any,
  envValue?: string,
): { result: PartOneCompletenessResult; enforcement: PartOneCompletenessEnforcementDecision } {
  const result = computePartOneCompleteness(state)
  const mode = partOneCompletenessEnforceModeFromEnv(envValue)
  const enforcement = evaluatePartOneCompletenessEnforcement(result, mode)
  return { result, enforcement }
}
