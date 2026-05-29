/**
 * @file brief-augment.ts — U5: Universal brief augmentation + provenance spine
 *
 * Problem: `runBriefParsing()` (Stage 1) correctly marks HARD fields as
 * `source:"missing"` / `value:null` when they are absent from the founder text.
 * The Stage 1 prompt explicitly instructs the LLM NOT to fill generic defaults,
 * so HIGH-confidence briefs routinely exit Stage 1 with null in all seven HARD
 * fields. Downstream engines then freelance (invent modules, geometry, costs).
 *
 * Solution: `augmentBrief()` runs ONCE, immediately after Stage 1 (and after any
 * brief-revision loop), and fills every null HARD field with a class-aware
 * inferred value tagged `source:"inferred"` + a short `rationale` string.
 * User-stated values (`source:"user"`) are NEVER overwritten.
 *
 * HARD fields (per StructuredBriefJSON):
 *   unit_cost_ceiling      — £ ceiling (from class market-band midpoint)
 *   max_mass_kg            — mass cap (from class deployment envelope)
 *   target_process         — manufacturing / operational process description
 *   target_material        — primary material / crop / medium
 *   batch_size             — annual unit volume
 *   design_life            — service life string (e.g. "12–15 yr")
 *   operating_environment  — temp_min_c / temp_max_c
 *
 * Provenance contract (upheld by this module):
 *   source:"user"     → value came verbatim from founder text — NEVER touched
 *   source:"inferred" → value derived from stated facts OR class-aware default
 *   source:"missing"  → value genuinely unknowable; only allowed when the class
 *                       lookup table has no entry for this field
 *
 * Universality: the CLASS_AUGMENT_DEFAULTS table covers every product class
 * in MARKET_BANDS. Adding a new class = adding one row to that table; no code
 * changes required.
 *
 * Anti-fabrication invariant: NEVER fill a field that contradicts a user-stated
 * constraint (e.g. if user states batch_size=5, do not overwrite with 10).
 */

import type { StructuredBriefJSON } from './types'
import { MARKET_BANDS } from './lib/market-bands'

// ─── Per-field augmentation result ──────────────────────────────────────────

export interface FieldAugmentation {
  field: string
  old_source: 'user' | 'inferred' | 'missing'
  new_source: 'user' | 'inferred' | 'missing'
  old_value: unknown
  new_value: unknown
  rationale: string
  /** True when this module changed the value (old_source was missing/null, new is inferred). */
  was_filled: boolean
}

export interface BriefAugmentResult {
  /** The mutated parsedBrief (same object reference — mutated in-place AND returned). */
  brief: StructuredBriefJSON
  /** Per-field provenance log — one entry per HARD field inspected. */
  augmentations: FieldAugmentation[]
  /** Fields that remain null/missing after augmentation (class has no default). */
  still_missing: string[]
  /** Short human-readable summary for the provenance section of the PDF. */
  summary: string
}

// ─── Class-aware defaults table ─────────────────────────────────────────────
//
// Keys map to normalised product_class strings (matching what
// product-classifier.ts / MARKET_BANDS emit). Each entry provides:
//   target_process   — manufacturing / operational process description
//   target_material  — primary material / crop / medium description
//   batch_size       — typical annual production volume (units/yr)
//   design_life      — service life string
//   op_env           — { temp_min_c, temp_max_c } interior / operating range
//   mass_kg          — reasonable mass cap when not stated (from deployment envelope)
//
// Notes on sources:
//   - op_env figures are INTERIOR/OPERATING ranges, not ambient extremes
//   - mass_kg for containerised products = 40 HC payload ≈ 28,000 kg gross –
//     tare ≈ 3,900 kg = 24,100 kg net payload; rounded to 28,000 as gross cap
//   - batch_size figures are TYPICAL production runs, not guarantees

interface ClassAugmentDefaults {
  target_process: string
  target_material: string
  batch_size: number
  design_life: string
  op_env: { temp_min_c: number; temp_max_c: number }
  mass_kg: number
  /** Rationale suffix appended to every inferred field for this class. */
  class_rationale_suffix: string
}

const CLASS_AUGMENT_DEFAULTS: Record<string, ClassAugmentDefaults> = {

  // ── BESS (Battery Energy Storage System) ────────────────────────────────
  bess_utility_scale: {
    target_process:   'Containerised assembly: cell module stacking, busbaring, BMS wiring, PCS integration, factory-acceptance test',
    target_material:  'LFP lithium iron phosphate prismatic cells (CATL / BYD class), steel enclosure, aluminium busbars',
    batch_size:       5,
    design_life:      '15–20 yr (IEC 62619 design life; cells ≥80 % capacity at 6,000 cycles)',
    op_env:           { temp_min_c: -20, temp_max_c: 50 },
    mass_kg:          28_000,
    class_rationale_suffix: 'Class default for utility-scale BESS in 40 ft Hi-Cube ISO container (ISO 668 40HC tare ≈ 3,900 kg, gross ≈ 28,000 kg)',
  },
  bess: {
    target_process:   'Containerised assembly: cell module stacking, busbaring, BMS wiring, PCS integration, factory-acceptance test',
    target_material:  'LFP lithium iron phosphate prismatic cells (CATL / BYD class), steel enclosure, aluminium busbars',
    batch_size:       5,
    design_life:      '15–20 yr (IEC 62619 design life; cells ≥80 % capacity at 6,000 cycles)',
    op_env:           { temp_min_c: -20, temp_max_c: 50 },
    mass_kg:          28_000,
    class_rationale_suffix: 'Class default for utility-scale BESS in 40 ft Hi-Cube ISO container',
  },
  energy_storage: {
    target_process:   'Containerised assembly: cell module stacking, busbaring, BMS wiring, PCS integration, factory-acceptance test',
    target_material:  'LFP lithium iron phosphate prismatic cells (CATL / BYD class), steel enclosure, aluminium busbars',
    batch_size:       5,
    design_life:      '15–20 yr (IEC 62619 design life; cells ≥80 % capacity at 6,000 cycles)',
    op_env:           { temp_min_c: -20, temp_max_c: 50 },
    mass_kg:          28_000,
    class_rationale_suffix: 'Class default for utility-scale BESS in 40 ft Hi-Cube ISO container',
  },

  // ── Vertical Farm ────────────────────────────────────────────────────────
  // target_material is intentionally generic here; the per-brief inferrer
  // below checks the brief text for a named crop before falling back to this.
  vertical_farm: {
    target_process:   'Containerised hydroponic cultivation: NFT/DWC tray grow, LED photoperiod control, fertigation dosing, CO₂ enrichment, psychrometric HVAC management',
    target_material:  'Leafy greens (lettuce / basil / microgreens)',
    batch_size:       2,
    design_life:      '12–15 yr (ISO container structural life; LED drivers ≥50,000 hr MTBF)',
    op_env:           { temp_min_c: 16, temp_max_c: 26 },
    mass_kg:          28_000,
    class_rationale_suffix: 'Class default for containerised vertical farm (40 ft Hi-Cube ISO container; controlled-interior ≈ +18–24 °C; design life per LED/container industry norms)',
  },

  // ── HAPS ─────────────────────────────────────────────────────────────────
  haps: {
    target_process:   'Aerospace composite manufacturing: CFRP spar layup, solar cell bonding, avionics harness integration, ground station integration test',
    target_material:  'Carbon-fibre-reinforced polymer (CFRP) primary structure, monocrystalline GaAs solar cells, lithium polymer propulsion batteries',
    batch_size:       2,
    design_life:      '5–10 yr (stratospheric UV and thermal cycling; avionics replacement cycle)',
    op_env:           { temp_min_c: -60, temp_max_c: 50 },
    mass_kg:          150,
    class_rationale_suffix: 'Class default for HAPS at 20 km operational altitude (stratosphere: −56 °C floor; ground-ops +50 °C ceiling; mass per Airbus Zephyr S class)',
  },

  // ── Drone (industrial inspection) ────────────────────────────────────────
  drone: {
    target_process:   'Electronics assembly: PCB fabrication, frame machining, motor/ESC integration, payload harness, regulatory test (UK CAA)',
    target_material:  'Carbon-fibre injection-moulded frame, brushless neodymium motors, LiPo flight pack',
    batch_size:       100,
    design_life:      '3–5 yr (200–500 flight hours; battery cycle-limited)',
    op_env:           { temp_min_c: -10, temp_max_c: 50 },
    mass_kg:          25,
    class_rationale_suffix: 'Class default for commercial/industrial drone (UK Open / Specific category; mass per Matrice/senseFly class)',
  },

  // ── EV Charger ────────────────────────────────────────────────────────────
  ev_charger: {
    target_process:   'Power-electronics assembly: PCB SMT, power-module integration, enclosure assembly, OCPP commissioning, DNO G99 test',
    target_material:  'Aluminium enclosure (IP54), SiC MOSFET power modules, copper busbars, halogen-free cable harness',
    batch_size:       200,
    design_life:      '10–15 yr (IEC 61851 design life; 80,000 charge sessions)',
    op_env:           { temp_min_c: -25, temp_max_c: 50 },
    mass_kg:          300,
    class_rationale_suffix: 'Class default for DC fast EV charger cabinet (IEC 61851 design life; UK OZEV grant-eligible class)',
  },

  // ── Heat Pump (residential) ──────────────────────────────────────────────
  heat_pump_residential: {
    target_process:   'Refrigeration cycle assembly: compressor integration, heat exchanger brazed assembly, refrigerant charge, MCS commissioning test',
    target_material:  'Copper tube heat exchangers, R290 or R32 refrigerant, steel/polymer enclosure, aluminium fin-and-tube coil',
    batch_size:       1000,
    design_life:      '15–20 yr (BS EN 378-1 design life; compressor 100,000 hr MTBF)',
    op_env:           { temp_min_c: -20, temp_max_c: 45 },
    mass_kg:          150,
    class_rationale_suffix: 'Class default for residential air-source heat pump (MCS certified, UK market; R290/R32 refrigerant class)',
  },

  // ── Bioreactor ───────────────────────────────────────────────────────────
  bioreactor: {
    target_process:   'Biopharmaceutical manufacturing: stirred-tank fed-batch / perfusion culture, DO/pH closed-loop control, CIP/SIP cleaning cycles',
    target_material:  '316L electropolished stainless steel vessel, single-use polymer bags (for smaller scale), PTFE seals',
    batch_size:       20,
    design_life:      '10–15 yr (GMP equipment lifecycle; vessel re-certification at 5 yr)',
    op_env:           { temp_min_c: 15, temp_max_c: 40 },
    mass_kg:          2_000,
    class_rationale_suffix: 'Class default for GMP stirred-tank bioreactor (21 CFR Part 11 / EU Annex 11 class; 316L wetted surfaces)',
  },

  // ── AUV ──────────────────────────────────────────────────────────────────
  auv: {
    target_process:   'Marine-grade assembly: pressure-housing fabrication, thruster/control-surface integration, acoustic/optical payload integration, basin trial, sea acceptance test',
    target_material:  'Aluminium 6082 / titanium pressure housings, syntactic foam buoyancy, epoxy-glass thruster nacelles',
    batch_size:       5,
    design_life:      '10 yr (DNVGL-ST-E271 class; annual condition-based maintenance)',
    op_env:           { temp_min_c: -2, temp_max_c: 35 },
    mass_kg:          800,
    class_rationale_suffix: 'Class default for inspection-class AUV (500–3000 m rated depth; DNVGL class)',
  },

  // ── Wind Turbine ─────────────────────────────────────────────────────────
  wind_turbine: {
    target_process:   'Wind energy assembly: blade pultrusion/infusion, nacelle integration, tower section fabrication, offshore/onshore installation + commissioning',
    target_material:  'Glass-fibre reinforced polymer (GFRP) blades, structural steel tower, cast iron nacelle bedplate',
    batch_size:       10,
    design_life:      '20–25 yr (IEC 61400-1 Ed.4 design life; class I/II/III wind class)',
    op_env:           { temp_min_c: -20, temp_max_c: 50 },
    mass_kg:          500_000,
    class_rationale_suffix: 'Class default for onshore wind turbine (IEC 61400-1; mass per 3–5 MW class including tower)',
  },

  // ── CNC Machine ──────────────────────────────────────────────────────────
  cnc_machine: {
    target_process:   'Precision machining: subtractive CNC milling / turning / grinding; coolant-through tooling; automated pallet loading',
    target_material:  'Cast iron / welded steel machine frame, hardened spindle bearings, carbide tooling',
    batch_size:       50,
    design_life:      '15–20 yr (ISO 10791 geometric accuracy; linear guideway replacement at 10 yr)',
    op_env:           { temp_min_c: 10, temp_max_c: 40 },
    mass_kg:          8_000,
    class_rationale_suffix: 'Class default for 3-axis CNC machining centre (ISO 10791 class; mass per Haas VF-2 class)',
  },

  // ── H₂ Electrolyser ──────────────────────────────────────────────────────
  h2_electrolyser: {
    target_process:   'Green hydrogen production: PEM or alkaline electrolysis, deionised water feed, hydrogen drying + compression, grid-tie power electronics',
    target_material:  'Titanium / Nafion® PEM membrane-electrode assemblies, coated titanium plates, HDPE gas-manifold',
    batch_size:       10,
    design_life:      '20 yr (IEC 62282-3-300; stack replacement at ~80,000 hr)',
    op_env:           { temp_min_c: -10, temp_max_c: 40 },
    mass_kg:          5_000,
    class_rationale_suffix: 'Class default for containerised PEM electrolyser (IEC 62282-3-300; stack replacement at 80,000 hr)',
  },

  // ── Solar Inverter ────────────────────────────────────────────────────────
  solar_inverter: {
    target_process:   'Power-electronics assembly: PCB SMT, IGBT / SiC module integration, transformer winding, G99 DNO submission, commissioning test',
    target_material:  'Aluminium enclosure (IP65), SiC/IGBT power modules, copper windings, silicone conformal coating',
    batch_size:       500,
    design_life:      '15–20 yr (IEC 62109-1 design life; electrolytic capacitor replacement at 10 yr)',
    op_env:           { temp_min_c: -25, temp_max_c: 60 },
    mass_kg:          500,
    class_rationale_suffix: 'Class default for grid-tied string inverter (IEC 62109-1; UK G99 compliant; IP65 outdoor cabinet)',
  },

  // ── Edge AI hardware ─────────────────────────────────────────────────────
  edge_ai: {
    target_process:   'Industrial electronics assembly: server integration, thermal design, EMC test, IEC 61850 / PROFINET commissioning',
    target_material:  'Steel 19-inch rack chassis (IP54), GPU / inference accelerator modules, aluminium heatsinks',
    batch_size:       50,
    design_life:      '7–10 yr (IEC 61850 substation-class lifecycle; GPU module refresh at 5 yr)',
    op_env:           { temp_min_c: -40, temp_max_c: 70 },
    mass_kg:          100,
    class_rationale_suffix: 'Class default for industrial edge AI server (IEC 61850 / PROFINET class; IP54; −40 to +70 °C)',
  },

  // ── CGM (Continuous Glucose Monitor) ─────────────────────────────────────
  cgm: {
    target_process:   'Medical-device assembly: enzymatic sensor fabrication, flex-PCB integration, Bluetooth SoC programming, ISO 15197 accuracy test',
    target_material:  'Medical-grade adhesive patch, enzymatic electrochemical sensor (glucose oxidase), biocompatible polymer housing',
    batch_size:       100_000,
    design_life:      '14 days (disposable wear sensor; EN ISO 15223-1 shelf life 24 months)',
    op_env:           { temp_min_c: 10, temp_max_c: 45 },
    mass_kg:          0.1,
    class_rationale_suffix: 'Class default for 14-day disposable CGM sensor (ISO 15197; FDA Class III / UKCA Class IIb; mass per Dexcom G7 / Abbott Libre 3 class)',
  },

  // ── eVTOL ────────────────────────────────────────────────────────────────
  evtol: {
    target_process:   'Aerospace assembly: CFRP airframe layup, motor/rotor integration, avionics harness, flight management system integration, EASA / CAA type-certification test campaign',
    target_material:  'CFRP primary structure, aluminium secondary structure, neodymium PM motors, lithium polymer traction pack',
    batch_size:       50,
    design_life:      '20 yr (EASA CS-23 type certification; major overhaul at 5,000 hr)',
    op_env:           { temp_min_c: -20, temp_max_c: 55 },
    mass_kg:          3_500,
    class_rationale_suffix: 'Class default for urban air mobility eVTOL (EASA CS-23 / UK CAP 722; mass per Joby S4 / Archer Midnight class)',
  },
}

// ─── Crop / material extraction from brief text ──────────────────────────────
//
// For vertical farms, the brief text often names the crop being grown.
// Extract it before falling back to the generic class default.

function extractCropFromBriefText(briefText: string, productDescription: string): string | null {
  const src = `${briefText} ${productDescription}`.toLowerCase()
  const CROPS: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /\b(ornamental|flowers?|plants?)\b/,        label: 'ornamental plants' },
    { pattern: /\b(cannabis|hemp)\b/,                      label: 'cannabis / hemp' },
    { pattern: /\b(strawberr(?:y|ies))\b/,                 label: 'strawberries' },
    { pattern: /\b(tomato(?:es)?)\b/,                      label: 'tomatoes' },
    { pattern: /\b(lettuce|leafy\s+greens?)\b/,            label: 'lettuce / leafy greens' },
    { pattern: /\b(microgreens?|micro\s+greens?)\b/,       label: 'microgreens' },
    { pattern: /\b(basil|herbs?)\b/,                       label: 'basil / herbs' },
    { pattern: /\b(spinach)\b/,                            label: 'spinach' },
    { pattern: /\b(kale)\b/,                               label: 'kale' },
    { pattern: /\b(cucumber)\b/,                           label: 'cucumbers' },
  ]
  for (const { pattern, label } of CROPS) {
    if (pattern.test(src)) return label
  }
  return null
}

// ─── unit_cost_ceiling inference ─────────────────────────────────────────────
//
// Uses the class MARKET_BANDS midpoint of the premium tier as the ceiling,
// because a startup asking for a ForgeOS report is building a differentiated
// product — not the cheapest commodity. Falls back to commodity midpoint when
// premium is unavailable.
//
// For classes where output_unit != 'unit' (e.g. vertical_farm: £/m², BESS:
// £/kWh), the per-unit-of-output midpoint MUST be multiplied by the design's
// output quantity to produce a TOTAL ex-works ceiling comparable to the
// achieved ex-works cost on the cover. Without the multiplication the
// compliance check compares £2,450/m² against £140,488 total — a nonsensical
// 57× breach on a correctly-priced VF.
//
// When the brief's target_performance.metrics[] carries the output quantity
// (e.g. total_growing_area_m2 = 100 for a 100 m² VF), pass that value as
// outputQuantity so inferCostCeiling can compute the TOTAL ceiling:
//   £2,450/m² × 100 m² = £245,000 total ceiling.
//
// When outputQuantity is absent (brief has no scale metric), the per-unit-of-
// output midpoint is stored with a rationale flagging the dependency — the
// compliance renderer should handle this gracefully (e.g. show "per m²" with
// a note rather than comparing against a total).

function inferCostCeiling(
  productClass: string,
  outputQuantity?: number,
): { value: number; perUnitMidpoint: number; outputUnit: string; rationale: string } | null {
  const band = MARKET_BANDS[productClass]
  if (!band) return null

  const { premium, commodity } = band.tiers
  const midPremium = Math.round((premium.low_gbp + premium.high_gbp) / 2)
  const midCommodity = Math.round((commodity.low_gbp + commodity.high_gbp) / 2)
  const perUnitMidpoint = midPremium > 0 ? midPremium : midCommodity

  if (band.output_unit === 'unit') {
    return {
      value: perUnitMidpoint,
      perUnitMidpoint,
      outputUnit: 'unit',
      rationale: `Class market-band midpoint (premium tier) for ${productClass}: £${perUnitMidpoint.toLocaleString()} per unit. Source: ${band.source}`,
    }
  }

  // For £/kWh, £/kW, £/m², £/L etc.: multiply by the design's output quantity
  // so the stored value is a TOTAL ceiling comparable to the achieved ex-works
  // cost. This makes "Achieved ex-works £140,488 vs ceiling £245,000" (PASS)
  // rather than "vs ceiling £2,450" (false FAIL at 57×).
  if (outputQuantity != null && outputQuantity > 0) {
    const totalCeiling = Math.round(perUnitMidpoint * outputQuantity)
    return {
      value: totalCeiling,
      perUnitMidpoint,
      outputUnit: band.output_unit,
      rationale: `Class market-band midpoint (premium tier) for ${productClass}: £${perUnitMidpoint.toLocaleString()} per ${band.output_unit} × ${outputQuantity} ${band.output_unit} (from brief target_performance) = £${totalCeiling.toLocaleString()} total ceiling. Source: ${band.source}`,
    }
  }

  // No output quantity available — store the per-unit-of-output midpoint and
  // flag in the rationale. The compliance renderer must NOT compare this raw
  // value against the total ex-works cost.
  return {
    value: perUnitMidpoint,
    perUnitMidpoint,
    outputUnit: band.output_unit,
    rationale: `Class market-band midpoint (premium tier) for ${productClass}: £${perUnitMidpoint.toLocaleString()} per ${band.output_unit} — total ceiling unknown (no output quantity in brief). Compliance check should compare on a per-${band.output_unit} basis. Source: ${band.source}`,
  }
}

// ─── Output-quantity extraction from brief target_performance ─────────────────
//
// Reads the brief's target_performance.metrics[] for a 'scale' category metric
// whose key matches the class's typical output-quantity key (same vocabulary as
// market-bands.ts readOutputQuantity / engineering-contract.ts shared_quantities).
// Returns the numeric value, or null when absent.

function extractOutputQuantityFromBrief(
  brief: StructuredBriefJSON,
  productClass: string,
): number | null {
  const metrics = brief.constraints.target_performance.metrics ?? []
  // Per-class preferred key order (mirrors market-bands.ts readOutputQuantity).
  const PREFERRED_KEYS: Record<string, string[]> = {
    bess_utility_scale: ['usable_capacity_kwh', 'nameplate_capacity_kwh', 'nameplate_capacity_mwh'],
    bess:              ['usable_capacity_kwh', 'nameplate_capacity_kwh', 'nameplate_capacity_mwh'],
    energy_storage:    ['usable_capacity_kwh', 'nameplate_capacity_kwh', 'nameplate_capacity_mwh'],
    haps:              ['wingspan_m'],
    vertical_farm:     ['canopy_area_m2', 'growing_area_m2', 'total_growing_area_m2'],
    ev_charger:        ['rated_power_kw', 'continuous_power_kw'],
    heat_pump_residential: ['rated_thermal_output_kw', 'continuous_power_kw'],
    bioreactor:        ['working_volume_l', 'volume_l'],
    wind_turbine:      ['rated_power_kw', 'continuous_power_kw'],
    h2_electrolyser:   ['rated_power_kw', 'continuous_power_kw'],
    solar_inverter:    ['rated_power_kw', 'continuous_power_kw'],
  }
  // Try preferred keys first (exact or suffix match against key_metric).
  const preferred = PREFERRED_KEYS[productClass] ?? []
  for (const want of preferred) {
    const m = metrics.find(
      mm => mm.key_metric === want || mm.key_metric?.endsWith(want) || want.endsWith(mm.key_metric ?? ''),
    )
    if (m && m.value != null && Number.isFinite(m.value) && m.value > 0) return m.value
  }
  // Fallback: first 'scale' category metric with a positive value.
  const scaleMetric = metrics.find(mm => mm.category === 'scale' && mm.value != null && Number.isFinite(mm.value) && mm.value > 0)
  if (scaleMetric) return scaleMetric.value
  return null
}

// ─── Main augmentation function ──────────────────────────────────────────────

/**
 * Augment a parsed brief in-place: fill every null HARD field with a
 * class-aware inferred value. User-stated values are never overwritten.
 *
 * @param brief   The StructuredBriefJSON output from runBriefParsing().
 *                Mutated in-place AND returned for convenience.
 * @param productClass  The normalised product class string from classifyProduct().
 * @param rawBriefText  The original founder brief text (for crop extraction etc.).
 * @returns BriefAugmentResult with per-field provenance log.
 */
export function augmentBrief(
  brief: StructuredBriefJSON,
  productClass: string,
  rawBriefText: string,
): BriefAugmentResult {
  const augmentations: FieldAugmentation[] = []
  const c = brief.constraints

  // Resolve class defaults (try exact match, then strip trailing classifier-
  // variant suffixes like _residential, _commercial, _small etc.)
  let defaults: ClassAugmentDefaults | undefined = CLASS_AUGMENT_DEFAULTS[productClass]
  if (!defaults) {
    // Try prefix match: e.g. "heat_pump_commercial" → "heat_pump_residential"
    const prefix = Object.keys(CLASS_AUGMENT_DEFAULTS).find(k =>
      productClass.startsWith(k) || k.startsWith(productClass.replace(/_[^_]+$/, ''))
    )
    if (prefix) defaults = CLASS_AUGMENT_DEFAULTS[prefix]
  }

  const suffix = defaults?.class_rationale_suffix ?? `class-aware default for product class "${productClass}"`

  // ── Helper: record an augmentation and return updated field ───────────────

  function fillField<T>(
    fieldName: string,
    currentValue: T | null | undefined,
    currentSource: 'user' | 'inferred' | 'missing',
    inferredValue: T,
    rationale: string,
  ): { value: T; source: 'user' | 'inferred' | 'missing'; rationale?: string } {
    const shouldFill = (currentValue === null || currentValue === undefined || currentSource === 'missing')
    const entry: FieldAugmentation = {
      field: fieldName,
      old_source: currentSource,
      new_source: shouldFill ? 'inferred' : currentSource,
      old_value: currentValue ?? null,
      new_value: shouldFill ? inferredValue : currentValue,
      rationale: shouldFill ? rationale : `RETAINED — founder stated this value (source:${currentSource})`,
      was_filled: shouldFill,
    }
    augmentations.push(entry)
    if (shouldFill) {
      return { value: inferredValue, source: 'inferred' }
    }
    return { value: currentValue as T, source: currentSource }
  }

  // ── 1. unit_cost_ceiling ─────────────────────────────────────────────────
  //
  // For classes with output_unit != 'unit' (e.g. vertical_farm: £/m²),
  // inferCostCeiling needs the design's output quantity so it can produce
  // a TOTAL ceiling (£/m² × m²) comparable to the achieved ex-works cost.
  // Extract the quantity from the brief's target_performance.metrics[] first.
  const outputQtyForCeiling = extractOutputQuantityFromBrief(brief, productClass)

  if (c.unit_cost_ceiling.source !== 'user' || c.unit_cost_ceiling.value === null) {
    const inferred = inferCostCeiling(productClass, outputQtyForCeiling ?? undefined)
    if (inferred && (c.unit_cost_ceiling.value === null || c.unit_cost_ceiling.source === 'missing')) {
      const result = fillField(
        'unit_cost_ceiling',
        c.unit_cost_ceiling.value,
        c.unit_cost_ceiling.source as 'user' | 'inferred' | 'missing',
        inferred.value,
        inferred.rationale,
      )
      c.unit_cost_ceiling = {
        value: result.value,
        currency: c.unit_cost_ceiling.currency ?? 'GBP',
        source: result.source,
      }
    } else {
      augmentations.push({
        field: 'unit_cost_ceiling',
        old_source: c.unit_cost_ceiling.source as 'user' | 'inferred' | 'missing',
        new_source: c.unit_cost_ceiling.source as 'user' | 'inferred' | 'missing',
        old_value: c.unit_cost_ceiling.value,
        new_value: c.unit_cost_ceiling.value,
        rationale: c.unit_cost_ceiling.value !== null
          ? `RETAINED — already has a value (source:${c.unit_cost_ceiling.source})`
          : `No market-band entry for class "${productClass}" — cannot infer cost ceiling`,
        was_filled: false,
      })
    }
  } else {
    augmentations.push({
      field: 'unit_cost_ceiling',
      old_source: 'user',
      new_source: 'user',
      old_value: c.unit_cost_ceiling.value,
      new_value: c.unit_cost_ceiling.value,
      rationale: 'RETAINED — founder stated this value (source:user)',
      was_filled: false,
    })
  }

  // ── 2. max_mass_kg ───────────────────────────────────────────────────────

  if (defaults && (c.max_mass_kg.value === null || c.max_mass_kg.source === 'missing')) {
    const result = fillField(
      'max_mass_kg',
      c.max_mass_kg.value,
      c.max_mass_kg.source as 'user' | 'inferred' | 'missing',
      defaults.mass_kg,
      `${suffix}`,
    )
    c.max_mass_kg = { value: result.value, source: result.source }
  } else {
    augmentations.push({
      field: 'max_mass_kg',
      old_source: c.max_mass_kg.source as 'user' | 'inferred' | 'missing',
      new_source: c.max_mass_kg.source as 'user' | 'inferred' | 'missing',
      old_value: c.max_mass_kg.value,
      new_value: c.max_mass_kg.value,
      rationale: c.max_mass_kg.value !== null
        ? `RETAINED — already has a value (source:${c.max_mass_kg.source})`
        : `No class defaults available for mass cap on class "${productClass}"`,
      was_filled: false,
    })
  }

  // ── 3. target_process ────────────────────────────────────────────────────

  if (defaults && (c.target_process.value === null || c.target_process.source === 'missing')) {
    const result = fillField(
      'target_process',
      c.target_process.value,
      c.target_process.source as 'user' | 'inferred' | 'missing',
      defaults.target_process,
      `Class-canonical process for ${productClass}. ${suffix}`,
    )
    c.target_process = { value: result.value, source: result.source }
  } else {
    augmentations.push({
      field: 'target_process',
      old_source: c.target_process.source as 'user' | 'inferred' | 'missing',
      new_source: c.target_process.source as 'user' | 'inferred' | 'missing',
      old_value: c.target_process.value,
      new_value: c.target_process.value,
      rationale: `RETAINED — already has a value (source:${c.target_process.source})`,
      was_filled: false,
    })
  }

  // ── 4. target_material ───────────────────────────────────────────────────
  //
  // For vertical_farm we try to extract the named crop from the brief text
  // before falling back to the generic class default.

  if (defaults && (c.target_material.value === null || c.target_material.source === 'missing')) {
    let materialValue = defaults.target_material
    let materialRationale = `Class-canonical material for ${productClass}. ${suffix}`

    if (productClass === 'vertical_farm') {
      const crop = extractCropFromBriefText(rawBriefText, brief.product_description)
      if (crop) {
        materialValue = crop
        materialRationale = `Crop name extracted from founder brief text ("${crop}"). ${suffix}`
      }
    }

    const result = fillField(
      'target_material',
      c.target_material.value,
      c.target_material.source as 'user' | 'inferred' | 'missing',
      materialValue,
      materialRationale,
    )
    c.target_material = { value: result.value, source: result.source }
  } else {
    augmentations.push({
      field: 'target_material',
      old_source: c.target_material.source as 'user' | 'inferred' | 'missing',
      new_source: c.target_material.source as 'user' | 'inferred' | 'missing',
      old_value: c.target_material.value,
      new_value: c.target_material.value,
      rationale: `RETAINED — already has a value (source:${c.target_material.source})`,
      was_filled: false,
    })
  }

  // ── 5. batch_size ────────────────────────────────────────────────────────

  if (defaults && (c.batch_size.value === null || c.batch_size.source === 'missing')) {
    const result = fillField(
      'batch_size',
      c.batch_size.value,
      c.batch_size.source as 'user' | 'inferred' | 'missing',
      defaults.batch_size,
      `Typical annual production volume for ${productClass} startups at Series A–B stage. ${suffix}`,
    )
    c.batch_size = { value: result.value, source: result.source }
  } else {
    augmentations.push({
      field: 'batch_size',
      old_source: c.batch_size.source as 'user' | 'inferred' | 'missing',
      new_source: c.batch_size.source as 'user' | 'inferred' | 'missing',
      old_value: c.batch_size.value,
      new_value: c.batch_size.value,
      rationale: `RETAINED — already has a value (source:${c.batch_size.source})`,
      was_filled: false,
    })
  }

  // ── 6. design_life ───────────────────────────────────────────────────────

  if (defaults && (c.design_life.value === null || c.design_life.source === 'missing')) {
    const result = fillField(
      'design_life',
      c.design_life.value,
      c.design_life.source as 'user' | 'inferred' | 'missing',
      defaults.design_life,
      `Industry-standard service life for ${productClass} per applicable design standard. ${suffix}`,
    )
    c.design_life = { value: result.value, source: result.source }
  } else {
    augmentations.push({
      field: 'design_life',
      old_source: c.design_life.source as 'user' | 'inferred' | 'missing',
      new_source: c.design_life.source as 'user' | 'inferred' | 'missing',
      old_value: c.design_life.value,
      new_value: c.design_life.value,
      rationale: `RETAINED — already has a value (source:${c.design_life.source})`,
      was_filled: false,
    })
  }

  // ── 7. operating_environment ─────────────────────────────────────────────
  //
  // We check each temperature independently — the brief may have stated one
  // but not the other (rare but possible). The `source` field on
  // StructuredBriefOperatingEnvironment is a single value for the whole
  // object, so we apply the fill when the whole object's source is missing
  // OR when individual temp values are null while the other was stated.

  if (defaults) {
    const envNeedsFill = c.operating_environment.source === 'missing'
      || (c.operating_environment.temp_min_c === null && c.operating_environment.temp_max_c === null)

    if (envNeedsFill) {
      const oldSource = c.operating_environment.source as 'user' | 'inferred' | 'missing'
      const inferredEnv = defaults.op_env
      augmentations.push({
        field: 'operating_environment',
        old_source: oldSource,
        new_source: 'inferred',
        old_value: { temp_min_c: c.operating_environment.temp_min_c, temp_max_c: c.operating_environment.temp_max_c },
        new_value: inferredEnv,
        rationale: `Class-canonical operating temperature range for ${productClass}: ${inferredEnv.temp_min_c} °C to ${inferredEnv.temp_max_c} °C. ${suffix}`,
        was_filled: true,
      })
      c.operating_environment = {
        temp_min_c: inferredEnv.temp_min_c,
        temp_max_c: inferredEnv.temp_max_c,
        source: 'inferred',
      }
    } else if (c.operating_environment.temp_min_c === null && c.operating_environment.temp_max_c !== null) {
      // Partial fill: min missing, max stated
      augmentations.push({
        field: 'operating_environment.temp_min_c',
        old_source: 'missing',
        new_source: 'inferred',
        old_value: null,
        new_value: defaults.op_env.temp_min_c,
        rationale: `temp_max_c was stated; temp_min_c inferred from class default for ${productClass}. ${suffix}`,
        was_filled: true,
      })
      c.operating_environment.temp_min_c = defaults.op_env.temp_min_c
      // Keep the existing source tag (reflects the max_c that was stated)
    } else if (c.operating_environment.temp_max_c === null && c.operating_environment.temp_min_c !== null) {
      // Partial fill: max missing, min stated
      augmentations.push({
        field: 'operating_environment.temp_max_c',
        old_source: 'missing',
        new_source: 'inferred',
        old_value: null,
        new_value: defaults.op_env.temp_max_c,
        rationale: `temp_min_c was stated; temp_max_c inferred from class default for ${productClass}. ${suffix}`,
        was_filled: true,
      })
      c.operating_environment.temp_max_c = defaults.op_env.temp_max_c
    } else {
      augmentations.push({
        field: 'operating_environment',
        old_source: c.operating_environment.source as 'user' | 'inferred' | 'missing',
        new_source: c.operating_environment.source as 'user' | 'inferred' | 'missing',
        old_value: { temp_min_c: c.operating_environment.temp_min_c, temp_max_c: c.operating_environment.temp_max_c },
        new_value: { temp_min_c: c.operating_environment.temp_min_c, temp_max_c: c.operating_environment.temp_max_c },
        rationale: `RETAINED — already has values (source:${c.operating_environment.source})`,
        was_filled: false,
      })
    }
  } else {
    augmentations.push({
      field: 'operating_environment',
      old_source: c.operating_environment.source as 'user' | 'inferred' | 'missing',
      new_source: c.operating_environment.source as 'user' | 'inferred' | 'missing',
      old_value: { temp_min_c: c.operating_environment.temp_min_c, temp_max_c: c.operating_environment.temp_max_c },
      new_value: { temp_min_c: c.operating_environment.temp_min_c, temp_max_c: c.operating_environment.temp_max_c },
      rationale: `No class defaults available for product class "${productClass}"`,
      was_filled: false,
    })
  }

  // ── Post-augmentation: update missing_mandatory_fields ───────────────────
  //
  // Remove fields from missing_mandatory_fields that we just filled.
  // This keeps the array honest: a field is "missing" only when it is
  // genuinely unknowable (null + no class default).

  const FIELD_ALIASES: Record<string, string[]> = {
    unit_cost_ceiling:   ['unit_cost_ceiling', 'cost_ceiling'],
    max_mass_kg:         ['max_mass_kg', 'max_mass', 'mass'],
    target_process:      ['target_process'],
    target_material:     ['target_material'],
    batch_size:          ['batch_size'],
    design_life:         ['design_life'],
    operating_environment: ['operating_environment', 'operating_environment.temp_min_c', 'operating_environment.temp_max_c'],
  }

  const filledFields = new Set(
    augmentations
      .filter(a => a.was_filled)
      .map(a => a.field),
  )

  const removedFromMissing = new Set<string>()
  brief.missing_mandatory_fields = brief.missing_mandatory_fields.filter(mf => {
    for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
      if (aliases.some(alias => mf === alias || mf.startsWith(alias))) {
        if (filledFields.has(canonical) || filledFields.has(mf)) {
          removedFromMissing.add(mf)
          return false // remove from missing_mandatory_fields
        }
      }
    }
    return true // keep
  })

  // ── Build still_missing list ─────────────────────────────────────────────

  const HARD_FIELDS = [
    'unit_cost_ceiling',
    'max_mass_kg',
    'target_process',
    'target_material',
    'batch_size',
    'design_life',
    'operating_environment',
  ] as const

  const still_missing: string[] = []

  for (const field of HARD_FIELDS) {
    const aug = augmentations.find(a => a.field === field)
    if (!aug || aug.new_value === null || aug.new_value === undefined) {
      still_missing.push(field)
    }
  }
  // Also include remaining entries in missing_mandatory_fields that are HARD
  for (const mf of brief.missing_mandatory_fields) {
    for (const hf of HARD_FIELDS) {
      if ((mf === hf || mf.startsWith(hf)) && !still_missing.includes(hf)) {
        still_missing.push(hf)
      }
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────

  const filledCount = augmentations.filter(a => a.was_filled).length
  const retainedCount = augmentations.filter(a => !a.was_filled && a.new_source === 'user').length
  const summary = [
    `U5 augmentation (class: ${productClass}): ${filledCount} HARD field(s) filled with class-aware inferred values, ${retainedCount} field(s) retained from founder text.`,
    still_missing.length > 0
      ? `Still null after augmentation (no class default): ${still_missing.join(', ')}.`
      : 'All 7 HARD fields are now non-null.',
    removedFromMissing.size > 0
      ? `Removed from missing_mandatory_fields: ${[...removedFromMissing].join(', ')}.`
      : '',
  ].filter(Boolean).join(' ')

  return { brief, augmentations, still_missing, summary }
}
