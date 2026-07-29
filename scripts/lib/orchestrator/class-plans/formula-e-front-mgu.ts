/**
 * scripts/lib/orchestrator/class-plans/formula-e-front-mgu.ts
 *
 * FORMULA E FRONT FPK — analytical tool plan (2026-07-29).
 *
 * INTENT: Spec front MGU+inverter+gear+diff for Gen3/Evo. Morphology and
 * envelope are forced by the front-axle bay (`max_dimensions_mm`). Reuses the
 * rear MGU analytical tool pack + FIA axle/energy tools; does NOT fall through
 * to vehicle/plant bootstrap.
 */

import { registerPlan } from '../planner'
import { ruleRange } from '../verifier'
import type { ClassToolPlan } from '../types'
import { FORMULA_E_REAR_MGU_PLAN } from './formula-e-rear-mgu'

const rules = [
  ruleRange('formula_e_front_mgu.front_regen_cap', 'front regen ≤ 250 kW', 'front_regen_electrical_cap_kw', 50, 250, 'warning'),
  ruleRange('formula_e_front_mgu.vdc_window', 'usable Vdc in [500, 1000]', 'dc_bus_voltage_v', 500, 1000, 'warning'),
  ruleRange('formula_e_front_mgu.mass_cap', 'FPK mass aspiration ≤ 32 kg', 'fpk_mass_cap_kg', 5, 32, 'warning'),
  ruleRange('formula_e_front_mgu.bay_w', 'bay width ~343 mm class', 'front_bay_envelope_w_mm', 200, 400, 'warning'),
]

export const FORMULA_E_FRONT_MGU_PLAN: ClassToolPlan = {
  id: 'formula_e_front_mgu:analytical',
  envelope_predicate: (e) => e.class === 'formula_e_front_mgu',
  // Same analytical stack as rear — shared physics; different envelope/rules.
  tools: FORMULA_E_REAR_MGU_PLAN.tools,
  coupled_pairs: FORMULA_E_REAR_MGU_PLAN.coupled_pairs,
  max_iterations: 4,
  convergence_tolerance_pct: 3.0,
  consistency_rules: rules,
}

registerPlan(FORMULA_E_FRONT_MGU_PLAN)
