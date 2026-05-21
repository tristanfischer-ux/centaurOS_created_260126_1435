/**
 * scripts/lib/orchestrator/planner.ts
 *
 * TOOL PLAN SELECTOR — static lookup table mapping envelope to ordered
 * Tool sequence. NO LLM CHOICE.
 *
 * The council (GLM-5.1 round 3, drawer drawer_forgeos_decisions_98d0586eb00a5c7f)
 * identified TOOL PLAN SELECTOR as the entropy injection kill-zone:
 * "Selecting Cantera vs lumped-parameter IS engineering design disguised
 * as orchestration. If the LLM chooses... you've built an entropy engine
 * with better furniture."
 *
 * The plan for each (class, envelope) tuple is a constant declared
 * here. Given the envelope, the plan is the ONLY valid sequence per
 * physics justification documented in the plan's `rationale` field.
 */

import type { BriefEnvelope, ClassToolPlan } from './types'

// ---------------------------------------------------------------------------
// GLOBAL PLAN REGISTRY — populated by class-plans/*.ts files.
// ---------------------------------------------------------------------------

const _plans: ClassToolPlan[] = []

/** Register a tool plan with the global selector. Called from each
 *  class-plan file at module load time. */
export function registerPlan(plan: ClassToolPlan): void {
  if (_plans.find(p => p.id === plan.id)) {
    throw new Error(`Plan already registered: ${plan.id}`)
  }
  _plans.push(plan)
}

/** Get all registered plans (read-only view). */
export function listPlans(): ReadonlyArray<ClassToolPlan> {
  return _plans
}

/** Test-only: clear the registry. */
export function _clearPlansForTests(): void {
  _plans.length = 0
}

// ---------------------------------------------------------------------------
// SELECTION
// ---------------------------------------------------------------------------

/**
 * Pick the plan that applies to the given envelope. Returns null if no
 * registered plan accepts the envelope; the chain should fall back to
 * the LLM Generator path in that case.
 *
 * If multiple plans match (which shouldn't happen with well-disjoint
 * predicates), the first registered one wins. Validator below catches
 * overlapping registrations.
 */
export function selectPlan(envelope: BriefEnvelope): ClassToolPlan | null {
  for (const p of _plans) {
    if (p.envelope_predicate(envelope)) return p
  }
  return null
}

/**
 * Detect overlapping plan registrations. Returns a list of envelope
 * descriptions that match multiple plans — these are bugs in the plan
 * definitions and should be fixed before relying on `selectPlan` in
 * production.
 *
 * Tests call this with a synthetic envelope grid.
 */
export function detectPlanOverlaps(testEnvelopes: BriefEnvelope[]): Array<{ envelope: BriefEnvelope; plans: string[] }> {
  const overlaps: Array<{ envelope: BriefEnvelope; plans: string[] }> = []
  for (const e of testEnvelopes) {
    const matches = _plans.filter(p => p.envelope_predicate(e)).map(p => p.id)
    if (matches.length > 1) overlaps.push({ envelope: e, plans: matches })
  }
  return overlaps
}

/**
 * Validate a plan against its declared tools (which must all be in the
 * registry) and verify coupled_pairs reference plan members. Returns
 * a list of errors; empty array means the plan is well-formed.
 *
 * Note: this does NOT call tool.applicable_to — that's runtime work.
 */
export function validatePlan(plan: ClassToolPlan): string[] {
  const errs: string[] = []
  const toolIds = new Set(plan.tools.map(t => t.tool_id))
  for (const [a, b] of plan.coupled_pairs) {
    if (!toolIds.has(a)) errs.push(`coupled_pairs[${a},${b}]: '${a}' not in plan.tools`)
    if (!toolIds.has(b)) errs.push(`coupled_pairs[${a},${b}]: '${b}' not in plan.tools`)
  }
  if (plan.max_iterations < 1) errs.push(`max_iterations must be ≥ 1, got ${plan.max_iterations}`)
  if (plan.convergence_tolerance_pct <= 0) errs.push(`convergence_tolerance_pct must be > 0, got ${plan.convergence_tolerance_pct}`)
  return errs
}
