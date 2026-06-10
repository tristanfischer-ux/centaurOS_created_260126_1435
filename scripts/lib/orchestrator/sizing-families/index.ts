/**
 * scripts/lib/orchestrator/sizing-families/index.ts
 *
 * Barrel + registration entrypoint for the sizing-family plug-in layer (E2).
 * Importing this module registers every family (each family file calls
 * `registerSizingFamily` at load — mirrors orchestrator/register-all.ts for
 * tool plans). Adding a new family = create the file + add ONE import line
 * here; no central switch to edit.
 */

export * from './types'
export {
  registerSizingFamily,
  listSizingFamilies,
  _clearSizingFamiliesForTests,
  runSizingFamilies,
  applySizingDeltas,
  applySizingFamilies,
  resizeSizingFamilies,
  readRequiredQuantity,
} from './registry'

// ── family registrations (load order = registration order = tie-break order) ──
import './battery'
import './process-plant'
import './aero-platforms'

export { BATTERY_FAMILY } from './battery'
export { PROCESS_PLANT_FAMILY, PROCESS_PLANT } from './process-plant'
export { AERO_PLATFORMS_FAMILY, AERO_PLATFORMS, computeAeroBudget } from './aero-platforms'
