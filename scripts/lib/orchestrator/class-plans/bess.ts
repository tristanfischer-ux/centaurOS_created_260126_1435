/**
 * scripts/lib/orchestrator/class-plans/bess.ts
 *
 * BESS UTILITY-CONTAINERISED TOOL PLAN — Phase 1 scaffold.
 *
 * Phase 1 registers the plan with NO tool steps. The orchestrator's
 * tool executor runs zero tools, then the cross-tool consistency
 * verifier runs zero rules, then the assembler delegates to the
 * existing hand-coded BESS deterministic emitter (Build #17a).
 *
 * This is a deliberate scaffold: it validates the orchestrator wiring
 * end-to-end without depending on any external tool being installed.
 * The empty tool plan + no consistency rules + Build #17a assembler
 * fallback produces the exact same output as calling
 * emitBessDesign() directly — but now exercises the orchestrator's
 * dispatch / aggregator / attribution machinery.
 *
 * Phase 2 will replace the empty tools array with real wrappers
 * (PyBaMM, CoolProp, ngspice, PandaPower, Octopart, IEC standards)
 * and add 7 consistency rules (thermal_balance, current_rating,
 * mass_closure, capacity_closure, dc_link_ripple, regulatory_coverage,
 * part_availability) per docs/orchestrator-plan/PLAN.md §5.
 */

import { registerPlan } from '../planner'
import type { ClassToolPlan } from '../types'

export const BESS_UTILITY_CONTAINERISED_PLAN: ClassToolPlan = {
  id: 'bess:utility_containerised',

  envelope_predicate: (e) =>
    e.class === 'bess' &&
    e.scale_tier === 'utility_containerised' &&
    (e.nameplate_kwh === undefined || (e.nameplate_kwh >= 2000 && e.nameplate_kwh <= 20000)),

  // Phase 1: empty tool plan. Orchestrator executor runs zero tools;
  // assembler.ts falls back to the existing hand-coded BESS emitter
  // (scripts/lib/deterministic-emitter.ts emitBessDesign).
  //
  // Phase 2 additions (TODO):
  //   - { tool_id: 'pybamm:cell-sizing', required: true, ... }
  //   - { tool_id: 'coolprop:refrigerant-properties', required: true, ... }
  //   - { tool_id: 'ngspice:pcs-simulation', required: true, ... }
  //   - { tool_id: 'pandapower:grid-integration', required: true, ... }
  //   - { tool_id: 'octopart:parts-lookup', required: false, ... }
  //   - { tool_id: 'iec-standards:bess', required: false, ... }
  tools: [],

  // Phase 2 will add coupled_pairs: [['ngspice:pcs-simulation',
  // 'coolprop:refrigerant-properties']] for fixed-point thermal
  // iteration.
  coupled_pairs: [],

  max_iterations: 5,
  convergence_tolerance_pct: 2.0,

  // Phase 2 will add 7 rules. Phase 1 = empty (no rules to enforce
  // since no tools ran).
  consistency_rules: [],
}

// Auto-register at module load.
registerPlan(BESS_UTILITY_CONTAINERISED_PLAN)
