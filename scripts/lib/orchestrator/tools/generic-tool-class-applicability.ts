/**
 * scripts/lib/orchestrator/tools/generic-tool-class-applicability.ts
 *
 * Shared class-applicability gate for the GENERIC orchestrator tools whose
 * numeric models are calibrated for discrete manufactured PRODUCTS (consumer /
 * industrial hardware) and produce WRONG or misleading numbers for a continuous
 * PROCESS PLANT (Fischer-Tropsch SAF synthesis, CO₂ mineralisation, direct-air
 * capture, steam-methane reforming, H₂ electrolysis, etc.).
 *
 * Observed on the e_fuel SAF dossier (out/oxccu-saf-v6):
 *   • reliability-fmea       → system_mtbf_years = 0.21 (a chemical plant's MTBF
 *                              is years–decades; the part-count FIT model is wrong)
 *   • regulatory-cert-cost   → total_cost_gbp = £0, total_critical_path_months = 0
 *                              (a COMAH / PED / ATEX / DSEAR plant is not £0/0mo)
 *   • cybersecurity-threat   → score on a consumer-IoT STRIDE scale, meaningless
 *                              for a DCS/SIS-controlled plant
 *
 * COUNCIL-HARDENED (2026-06-06): do NOT hide these at render only — that pollutes
 * the data model and breaks render-vs-audit parity. Instead each tool DECLARES,
 * in its own output, that it did not estimate for this class: `status:
 * 'not_estimated_for_class'` + a `reason` string. The tool stays REGISTERED and
 * RUNS (so presence-checks / Appendix-B listing are unaffected); only its NUMERIC
 * meaning is replaced by the honest status. The renderer reads this status and
 * shows "Not estimated at concept stage for this class — <reason>" instead of the
 * number.
 *
 * IMPORTANT (file-ownership boundary, 2026-06-06): the class-plan
 * `contract_update` functions (e.g. scripts/lib/orchestrator/class-plans/
 * e-fuel-synthesis.ts) read these tools' NUMERIC output fields via
 * `num(output, 'system_mtbf_years') ?? 0` to build contract quantities. To avoid
 * making those class-plans emit an even-more-wrong `0`, `markNotEstimatedForClass`
 * KEEPS the original numeric fields in `output` and ADDS the status alongside
 * them. The renderer is the single reader-facing surface that suppresses the
 * number based on the status; the contract quantity keeps the raw figure for the
 * class-plan's arithmetic. A class-plan owner can later read `output.status` to
 * emit a null/omitted quantity — tracked as a follow-up.
 */

/**
 * Product classes that are continuous PROCESS PLANTS, for which the generic
 * product-calibrated tools above are not calibrated. Extend as new process-plant
 * archetypes are registered. Lower-cased compare.
 */
export const PROCESS_PLANT_CLASSES = new Set<string>([
  'e_fuel_synthesis',
  'co2_mineralisation',
  'dac',
  'direct_air_capture',
  'smr',
  'steam_methane_reformer',
  'h2_electrolyser',
  'hydrogen_electrolyser',
  'electrolyser',
  'ammonia_synthesis',
  'methanol_synthesis',
  'carbon_capture',
])

/** True when `productClass` (any case) is a continuous process-plant archetype. */
export function isProcessPlantClass(productClass: unknown): boolean {
  const c = String(productClass ?? '').trim().toLowerCase()
  if (!c) return false
  if (PROCESS_PLANT_CLASSES.has(c)) return true
  // Defensive substring net for compound/aliased slugs (e.g. "e_fuel_synthesis_ft").
  return /(_fuel_synthesis|co2_mineralis|direct_air_capture|\bdac\b|electrolyser|methanol_synth|ammonia_synth|steam_methane|carbon_capture)/.test(c)
}

/**
 * The structured "not estimated for this class" output. Carries the honest
 * status + reason; the original numeric fields are preserved alongside (see
 * file header) so existing class-plan arithmetic does not regress to 0.
 */
export interface NotEstimatedForClass {
  status: 'not_estimated_for_class'
  not_estimated_reason: string
}

/**
 * Stamp a tool output as not-estimated-for-this-class WITHOUT removing its
 * numeric fields. Returns a new object (does not mutate `output`).
 */
export function markNotEstimatedForClass<T extends object>(
  output: T,
  reason: string,
): T & NotEstimatedForClass {
  return {
    ...output,
    status: 'not_estimated_for_class',
    not_estimated_reason: reason,
  }
}
