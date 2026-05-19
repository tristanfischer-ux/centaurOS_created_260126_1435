/**
 * @file 1.5-feasibility-advisor.ts — NEW-001 STUB (deferred)
 *
 * This is a PLACEHOLDER MODULE for the feasibility-advisor stage.
 * It is NOT implemented. It exists so that:
 *
 *   1. The feature is discoverable via grep / IDE autocomplete
 *      (so a future session doesn't re-derive the intent from scratch)
 *   2. The planned signature + type shape are locked in code
 *   3. An attempt to call it fails loudly with a pointer to the plan
 *
 * FULL PLAN: see src/lib/pdf-engine-v2/PLAN-NEW-001.md
 *
 * ─── The problem (summary) ──────────────────────────────────────────
 *
 * When a brief is physically impossible (e.g. "10 MWh battery pack in a
 * briefcase"), today's pipeline: Sizing returns INFEASIBLE → downstream
 * stages skip → founder sees a red banner with no guidance. This stage
 * would catch the impossibility upfront and tell the founder which brief
 * constraint to relax.
 *
 * ─── Status ─────────────────────────────────────────────────────────
 *
 * DEFERRED per Tristan 2026-05-06: "resolve later, not now".
 *
 * Plan went through 4 iterations with 6 model reviews (Grok 4.3,
 * GPT-5.4/5.5, MiMo V2.5-Pro, GLM-5.1, DeepSeek V4-Pro, Kimi K2.6).
 * v3's "universal physics" framing is correct; v4 hardens it against
 * 11 BLOCKER findings from the council (applicability is the gatekeeper,
 * need 100+ ceilings not 30, missing dimensions, compound-feasibility
 * LP, regulatory/supply-chain as co-equal advisors, etc.).
 *
 * Delivery estimate: 15-20 hrs across 4-5 sessions for full v4.
 * Alternative: v4-MVP narrower scope at 5-7 hrs.
 *
 * ─── Placement in the pipeline (when built) ─────────────────────────
 *
 *   Research → Decompose → [FeasibilityAdvisor] → Sizing → BOM → ...
 *
 * Runs BEFORE Sizing so we don't waste solver time on impossible briefs.
 * Advisory only — DOES NOT short-circuit the pipeline (council consensus
 * finding from v2 review: a mis-extracted constraint would permanently
 * block valid briefs if terminal).
 *
 * ─── Data model (locked by type even though impl is deferred) ───────
 */

import type { PipelineState, StageResult } from '../types'

/** A single numeric dimension extracted from the brief, SI-normalised. */
export interface ClaimDimension {
  kind:
    | 'energy' | 'power' | 'mass' | 'volume' | 'area' | 'length'
    | 'time' | 'cost' | 'efficiency' | 'yield' | 'throughput'
    | 'temperature' | 'temperature_delta' | 'pressure' | 'voltage'
    | 'current' | 'velocity' | 'angular_velocity' | 'frequency'
    | 'information' | 'count'
  value: number
  unit: string                // original unit string from the brief
  siValue: number             // normalised to SI base units
  siUnit: string
  sourceSpan: string          // verbatim text span where this was extracted

  /** Which subsystem this dimension refers to (v4 addition per council). */
  provenance: 'storage' | 'propulsion' | 'thermal' | 'structure' |
              'fuel' | 'cargo' | 'interface' | 'overall' | 'unclassified'

  /** Intensive vs extensive vs differential (v4). */
  kindQualifier?: 'intensive' | 'extensive' | 'differential'

  /** When value is negative (e.g. CO2 removal rate, cost delta), true. */
  signed?: boolean
}

/** A physical-law ceiling that applies to a specific dimension-pair ratio. */
export interface PhysicsCeiling {
  id: string
  /** Unit signature — which dimension kinds must be present to apply. */
  signature: {
    numerator: ClaimDimension['kind']
    denominator?: ClaimDimension['kind']  // absent for absolute limits
  }
  /** The regime this ceiling applies to (electrochemical, mechanical, thermal, etc.). */
  regime: string
  /** Maximum value of the ratio (in SI units). */
  maxValue: number
  /** Evidence required for this ceiling to apply (v4 addition). */
  requiredEvidence?: string[]
  note: string
  source: string
  firstPrinciplesDerivation?: string
}

/** A single hard blocker — a physical-law violation found in the brief. */
export interface HardBlocker {
  blockerCeiling: string            // PhysicsCeiling.id
  dimensionPair: string             // e.g. "energy_in_storage / volume_in_storage"
  impliedRatio: number
  ceilingValue: number
  violationFactor: number           // impliedRatio / ceilingValue
  regime: string
  relaxations: Array<{
    dimension: ClaimDimension['kind']
    currentValue: number
    proposedValue: number
    unit: string
    sideEffects: string[]
  }>
  confidence: 'high' | 'moderate' | 'low'
}

/** Output of the advisor (attached to PipelineState.feasibilityAdvice). */
export interface FeasibilityAdvice {
  status: 'feasible' | 'tight' | 'indeterminate' | 'infeasible'
  physicalityGate: 'physical' | 'hybrid' | 'informational'
  extractedDimensions: ClaimDimension[]
  activeRegimes: Array<{ regime: string; confidence: number }>
  hardBlockers: HardBlocker[]
  relaxationOptions: Array<{
    id: string
    priority: 'high' | 'medium' | 'low'
    summary: string
    rationale: string
    sideEffects: string[]
    costToFounder: string
  }>
  /** Blocks from regulatory advisor (parallel module, not physics). */
  regulatoryBlockers?: string[]
  /** Blocks from supply-chain advisor (parallel module). */
  supplyChainBlockers?: string[]
  /** When status = 'indeterminate', what would resolve the uncertainty. */
  missingInformation?: string[]
}

// ─── Stub implementation ─────────────────────────────────────────────

/**
 * Run the feasibility advisor. NOT IMPLEMENTED.
 *
 * @param state current pipeline state (needs research + decompose complete)
 * @returns FeasibilityAdvice — attach to state.feasibilityAdvice in caller
 * @throws Error — this stage is deferred pending a dedicated session
 *
 * See PLAN-NEW-001.md for the full scope, council reviews (v1-v4), and
 * delivery-effort estimates.
 */
export async function runFeasibilityAdvisor(
  _state: PipelineState,
): Promise<StageResult<FeasibilityAdvice>> {
  throw new Error(
    'NEW-001 feasibility advisor is not yet implemented. ' +
    'See src/lib/pdf-engine-v2/PLAN-NEW-001.md for the full plan and ' +
    'council review history. Tristan deferred this feature on 2026-05-06.'
  )
}

/**
 * Is the advisor implemented? Callers should check this before calling
 * runFeasibilityAdvisor. While false, the pipeline continues without it.
 */
export const FEASIBILITY_ADVISOR_IMPLEMENTED = false

// ─── What a caller would look like (kept commented for reference) ───

/*
import { runFeasibilityAdvisor, FEASIBILITY_ADVISOR_IMPLEMENTED } from './1.5-feasibility-advisor'

// In index.ts, between decompose and sizing:
if (FEASIBILITY_ADVISOR_IMPLEMENTED) {
  const adviceResult = await runFeasibilityAdvisor(state)
  trackStage('feasibility_advisor', adviceResult)
  if (adviceResult.ok && adviceResult.data) {
    ;(state as any).feasibilityAdvice = adviceResult.data
    // Advisor is non-terminal — pipeline continues even when infeasible,
    // to produce a report the founder can iterate on.
  }
}
*/
