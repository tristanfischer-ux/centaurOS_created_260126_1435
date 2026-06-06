/**
 * Brief-constraint completeness audit — gate 17 (codified 2026-05-25 after
 * BESS L22 council).
 *
 * Universal across every product class.
 *
 * Root cause it addresses: the renderer's `_buildComplianceRows` in
 * `scripts/render-minimal-pdf.tsx` walks the brief constraints through a
 * curated `METRIC_MAP` and a hardcoded handful of conditionals (cost, mass,
 * envelope, design_life, operating_environment, batch_size). Any constraint
 * the brief states but the renderer's map doesn't know about is SILENTLY
 * DROPPED from the rendered Brief Compliance table.
 *
 * L22 trigger gap: the cover claimed PASS on usable energy 3.5 MWh while the
 * design only closed at 2.69 MWh. The compliance table didn't include a
 * usable-energy row at all — the renderer's METRIC_MAP only maps
 * `nameplate_capacity_mwh`, but the L22 brief used `usable_energy_mwh`.
 * Cycle life (mapped but the achieved quantity `cycle_life_cycles` was
 * missing from the contract → renderer's `continue` swallowed the row) and
 * the 5-day deployment constraint (in `additional_constraints`, never read
 * by the renderer) were also silently absent.
 *
 * Gate 17 audit (this file): walks every constraint declared in the brief
 * (numeric metrics + safety standards + additional_constraints) and checks
 * whether each appears as a row in the rendered Brief Compliance table.
 * Anything missing is flagged. The audit reconstructs the renderer's row
 * decisions by calling the same logic the renderer uses, so what the
 * auditor expects to see is exactly what the renderer should have rendered.
 *
 * Severity ladder:
 *   HIGH — a HARD constraint is missing from the compliance table:
 *          unit_cost_ceiling, max_mass_kg, target_performance metrics
 *          tagged scale|durability|safety, dc/ac bus voltage. These are
 *          the constraints that should NEVER silently disappear because
 *          they were the brief's explicit acceptance criteria.
 *   MED  — a SOFT constraint is missing: operating_environment,
 *          batch_size, design_life, depth_of_discharge_percent,
 *          additional_constraints other than voltage. These shape the
 *          design but a missing row is not catastrophic.
 *   LOW  — informational: safety_standards row counts ≠ mandatory_total
 *          from the compliance gate (informational only).
 *
 * Exit code 17 on any HIGH-severity finding. MED + LOW are informational
 * and do not block the chain.
 *
 * Distinct from gate 12 (numeric-claim drift detector): gate 12 catches
 * narrative-vs-BoM disagreement on a SINGLE NAMED QUANTITY (e.g. "313 BMS
 * slaves" in prose vs "165" in BoM). Gate 17 catches MISSING ROWS: the
 * compliance table doesn't even ATTEMPT to claim PASS or FAIL on a brief
 * constraint, so the reader sees a green table while the design silently
 * violates the constraint.
 *
 * Distinct from gate 1 (audit-pdf-run F-1 brief-vs-design fidelity): F-1
 * is an LLM-scored opinion on whether the design honours the brief overall.
 * Gate 17 is a deterministic enumeration: every brief constraint must
 * either appear as a row OR be explicitly skipped with a reason.
 *
 * Per task #122 universal-gate pattern: adding a new constraint type to
 * the brief schema automatically extends gate 17 coverage — the auditor
 * iterates the brief constraints declaratively rather than hardcoding
 * what's in scope. To extend the audit (e.g. when adding a new metric key
 * to the renderer's METRIC_MAP), update the parallel KNOWN_METRIC_KEYS
 * set below; otherwise the gate will keep flagging the renderer-missing
 * metric as a real coverage gap (which is the correct behaviour until
 * the renderer is updated).
 */

import { readFileSync } from 'node:fs'

// ── METRIC COVERAGE TABLE ───────────────────────────────────────────────────
// Mirrors the renderer's METRIC_MAP in scripts/render-minimal-pdf.tsx
// (search for `METRIC_MAP: Record<string` around line 3626). Any key here
// is one the renderer KNOWS how to render given the achieved-quantity field
// it maps to. Keys NOT in this set are guaranteed-missing in the rendered
// compliance table regardless of the rest of state.
//
// Whenever METRIC_MAP is extended (renderer learns a new metric), add the
// key here AND the achieved-quantity-field name so the auditor's "renderer
// will silently skip this because the contract quantity is missing" check
// stays in sync.
//
// IMPORTANT: keep in sync with METRIC_MAP at render-minimal-pdf.tsx:3626.
const KNOWN_METRIC_MAP: Record<string, { qtyKey: string; label: string }> = {
  nameplate_capacity_mwh: { qtyKey: 'usable_capacity_kwh', label: 'Usable energy capacity' },
  // 2026-05-28 (gate 17, BESS L57): mirror the renderer METRIC_MAP additions —
  // nameplate_capacity_kwh (kWh variant) + transient_power kW/MW (overload spec).
  nameplate_capacity_kwh: { qtyKey: 'usable_capacity_kwh', label: 'Usable energy capacity' },
  transient_power_kw: { qtyKey: 'peak_power_kw', label: 'Transient (peak) power' },
  transient_power_mw: { qtyKey: 'peak_power_kw', label: 'Transient (peak) power' },
  // BESS L24 (2026-05-25): direct-kWh / kW brief keys added to renderer
  // METRIC_MAP by commit 2dbca713e. Mirror them here so the audit doesn't
  // re-flag these as renderer-blindness misses.
  usable_energy_kwh: { qtyKey: 'usable_capacity_kwh', label: 'Usable energy' },
  usable_energy_mwh: { qtyKey: 'usable_capacity_kwh', label: 'Usable energy' },
  continuous_power_kw: { qtyKey: 'continuous_power_kw', label: 'Continuous power' },
  continuous_power_mw: { qtyKey: 'continuous_power_kw', label: 'Continuous power' },
  peak_power_kw: { qtyKey: 'peak_power_kw', label: 'Peak power' },
  rated_power_mw: { qtyKey: 'continuous_power_kw', label: 'Continuous power' },
  peak_power_mw: { qtyKey: 'peak_power_kw', label: 'Peak power' },
  cycle_life: { qtyKey: 'cycle_life_cycles', label: 'Cycle life' },
  // BESS L26 (2026-05-25, gate-17 HIGH #3): brief emits key_metric
  // 'cycle_life_cycles' (not 'cycle_life') so the above entry was never
  // matched. Mirror the renderer fix: add the _cycles-suffixed alias.
  cycle_life_cycles: { qtyKey: 'cycle_life_cycles', label: 'Cycle life' },
  dc_bus_voltage_v: { qtyKey: 'dc_bus_voltage_v', label: 'DC bus voltage' },
  ac_output_voltage_v: { qtyKey: 'ac_output_voltage_v', label: 'AC output voltage' },
  // 2026-05-25 (BESS L26 council): fix qtyKey from 'rated_power_kw' to
  // 'continuous_power_kw' to mirror renderer fix — BESS contracts emit
  // continuous_power_kw, not rated_power_kw. Also add 'rated_power' alias.
  rated_power: { qtyKey: 'continuous_power_kw', label: 'Rated power' },
  rated_power_kw: { qtyKey: 'continuous_power_kw', label: 'Rated power' },
  annual_energy_mwh: { qtyKey: 'annual_energy_yield_mwh', label: 'Annual energy yield' },
  thermal_output_kw: { qtyKey: 'thermal_output_kw', label: 'Thermal output' },
  cop: { qtyKey: 'cop_seasonal', label: 'COP (seasonal)' },
  yield_kg_per_year: { qtyKey: 'yield_kg_per_year', label: 'Annual yield' },
  // VF iter-vf5 (2026-05-29, gate 17): mirror the renderer METRIC_MAP
  // additions for the VF headline scale + geometry constraints. canopy_area_m2
  // + trolley_count already exist in the VF contract; tier_canopy_clearance_cm
  // was added to scripts/lib/engineering-contract.ts in the same change so the
  // max_plant_height_cm ceiling has an achieved headroom to audit against.
  total_growing_area_m2: { qtyKey: 'canopy_area_m2', label: 'Total growing area' },
  // Brief-parser key-NAME non-determinism — same-unit growing-area synonyms.
  growing_surface_area_m2: { qtyKey: 'canopy_area_m2', label: 'Total growing area' },
  growing_area_m2: { qtyKey: 'canopy_area_m2', label: 'Total growing area' },
  cultivation_area_m2: { qtyKey: 'canopy_area_m2', label: 'Total growing area' },
  canopy_area_m2: { qtyKey: 'canopy_area_m2', label: 'Canopy area' },
  trolley_count: { qtyKey: 'trolley_count', label: 'Grow trolleys' },
  max_plant_height_cm: { qtyKey: 'tier_canopy_clearance_cm', label: 'Max plant height (tier clearance)' },
  // Brief parser non-determinism: same "~25 cm tall" brief parses as _cm one run,
  // _mm the next (iter-vf6). Both map to the same achieved tier-clearance quantity.
  max_plant_height_mm: { qtyKey: 'tier_canopy_clearance_cm', label: 'Max plant height (tier clearance)' },
  crop_cycle_days: { qtyKey: 'crop_cycle_days', label: 'Crop cycle' },
  // CO₂-mineralisation production / feed rates (gate 17, 2026-06-04) — mirror the
  // renderer METRIC_MAP additions. Brief states kg/day; stoichiometry tool emits
  // t/day (×1000 convert in the renderer). co2_capture is derived in the renderer
  // from the CaCO₃ product via 1:1 CO₂→CaCO₃ molar stoichiometry, so its achieved
  // quantity is also caco3_product_t_day. gypsum_feed_kg_per_day is deliberately
  // NOT mirrored here: the renderer renders it via a dedicated grounded-correction
  // row (status 'unknown' + note, achieved gypsum_feed_t_day×1000), not via the
  // generic METRIC_MAP loop — so it is NOT a "renderer-blindness" miss. The
  // gate-17 auditor recognises gypsum_feed_kg_per_day's achieved presence below.
  // 2026-06-04: mirror the renderer's spelled-out CO₂ brief-metric keys (the
  // live brief uses calcium_carbonate_/potassium_sulfate_/potassium_hydroxide_
  // feed_, not the caco3_/k2so4_/koh_ abbreviations). Kept identical to
  // render-minimal-pdf.tsx::METRIC_MAP per the I12b keyset-sync invariant.
  calcium_carbonate_production_kg_per_day: { qtyKey: 'caco3_product_t_day', label: 'CaCO₃ production rate' },
  potassium_sulfate_production_kg_per_day: { qtyKey: 'k2so4_product_t_day', label: 'K₂SO₄ production rate' },
  potassium_hydroxide_feed_kg_per_day: { qtyKey: 'koh_makeup_t_day', label: 'KOH make-up feed rate' },
  caco3_production_kg_per_day: { qtyKey: 'caco3_product_t_day', label: 'CaCO₃ production rate' },
  k2so4_production_kg_per_day: { qtyKey: 'k2so4_product_t_day', label: 'K₂SO₄ production rate' },
  koh_feed_kg_per_day: { qtyKey: 'koh_makeup_t_day', label: 'KOH make-up feed rate' },
  co2_capture_kg_per_day: { qtyKey: 'caco3_product_t_day', label: 'CO₂ capture rate (from CaCO₃ stoichiometry)' },
  // 2026-06-05: mirror the renderer METRIC_MAP additions for the registered
  // co2_mineralisation contract's brief-aligned achieved keys. The LIVE brief
  // states capture/output as co2_capture_capacity_kg_per_day (1000),
  // co2_capture_capacity_kg_per_hr (42), calcium_carbonate_output_kg_per_day
  // (2300) and potassium_sulfate_output_kg_per_day (3900); the contract emits the
  // achieved values under capture_capacity_tco2_per_day / co2_capture_rate_kg_per_hour
  // / caco3_output_t_per_day / k2so4_output_t_per_day (t/day → ×1000 in the
  // renderer; kg/hr direct). Kept identical to render-minimal-pdf.tsx::METRIC_MAP
  // per the I12b keyset-sync invariant so gate-17 agrees these rows are covered.
  co2_capture_capacity_kg_per_day: { qtyKey: 'capture_capacity_tco2_per_day', label: 'CO₂ capture capacity' },
  co2_capture_capacity_kg_per_hr: { qtyKey: 'co2_capture_rate_kg_per_hour', label: 'CO₂ capture capacity' },
  calcium_carbonate_output_kg_per_day: { qtyKey: 'caco3_output_t_per_day', label: 'CaCO₃ output rate' },
  potassium_sulfate_output_kg_per_day: { qtyKey: 'k2so4_output_t_per_day', label: 'K₂SO₄ output rate' },
  // e_fuel SAF HOURLY production (2026-06-06, FIX 1). The hourly key shares its
  // unit-stripped base "saf_production" with the ANNUAL saf_production_tpy, so it
  // CANNOT use the semantic resolver (which would grab the annual t/yr quantity);
  // the renderer pins it via a curated METRIC_MAP entry, mirrored here per the
  // I12b keyset-sync invariant. (All OTHER e_fuel metrics go through the synonym
  // map, which is NOT subject to I12b.)
  saf_production_kg_per_hr: { qtyKey: 'saf_output_kg_h', label: 'SAF production (hourly)' },
}

// ── SEMANTIC-CONCEPT COVERAGE (mirror of render-minimal-pdf.tsx, 2026-06-05) ──
// FIX 1 added a UNIT-SUFFIX-AGNOSTIC semantic resolver to the renderer's
// _buildComplianceRows: a brief metric is matched to a contract quantity by a
// shared CONCEPT id (unit-stripped base + synonym map) so ANY suffix the brief
// parser picks (co2_capture_capacity_tpd / _kg_per_day / _t_per_day …) resolves.
// This is a PLAIN string→string map (NOT a `qtyKey:`-shaped entry) so the I12b
// METRIC_MAP-mirror invariant — which counts `<key>: { qtyKey: '…'` lines across
// the two files — is unaffected; the I12b parity is between KNOWN_METRIC_MAP above
// and the renderer's METRIC_MAP, both of which carry the same key set.
//
// gate-17 itself already treats EVERY brief metric as VISIBLE (rendererWouldEmit-
// MetricRow returns true — the universal-completeness pass guarantees a row), so
// these concept synonyms do not change the gate's pass/fail. They are mirrored
// here per the house triple-write rule and to keep the two files' notion of
// "which CO₂-mineralisation metrics get a REAL audited (vs informational) row"
// identical, so a future edit to one file is mechanically traceable to the other.
// Keys = unit-stripped base of EITHER the brief key or the contract-quantity key.
const KNOWN_METRIC_CONCEPT_SYNONYMS: Record<string, string> = {
  co2_capture_capacity: 'co2_capture_capacity',
  capture_capacity_tco2: 'co2_capture_capacity',
  capture_capacity: 'co2_capture_capacity',
  co2_capture_rate: 'co2_capture_rate',
  calcium_carbonate_output: 'caco3_output',
  caco3_output: 'caco3_output',
  potassium_sulfate_output: 'k2so4_output',
  k2so4_output: 'k2so4_output',
  // e_fuel / Power-to-Liquid Fischer-Tropsch SAF (2026-06-06 FIX B). Mirror of
  // render-minimal-pdf.tsx::_METRIC_CONCEPT_SYNONYMS for the e_fuel concepts.
  // Parity-only (the gate already treats every brief metric as VISIBLE). Keys =
  // unit-stripped base of EITHER side; bases verified against _metricRateBase.
  saf_production: 'saf_output_tpy',
  saf_output_tonnes_yr: 'saf_output_tpy',
  jet_range_selectivity: 'jet_selectivity',
  jet_selectivity_frac: 'jet_selectivity',
  co2_conversion_efficiency: 'carbon_conversion',
  carbon_to_liquids_frac: 'carbon_conversion',
  feedstock_co2: 'co2_feed',
  co2_feed: 'co2_feed',
  co2_feed_kg: 'co2_feed',
  feedstock_h2: 'h2_feed',
  hydrogen_feed: 'h2_feed',
  h2_feed_kg: 'h2_feed',
  operating_hours: 'operating_hours',
  operating_hours_yr: 'operating_hours',
  electrical_load: 'electrical_load',
  plant_electrical_load: 'electrical_load',
  connected_electrical_load: 'electrical_load',
  synthesis_pressure: 'synthesis_pressure',
  synthesis_pressure_max: 'synthesis_pressure',
  reactor_pressure: 'synthesis_pressure',
  synthesis_temp: 'synthesis_temp',
  synthesis_temp_max: 'synthesis_temp',
  reactor_temp: 'synthesis_temp',
}
// Referenced for parity/grep-traceability with the renderer; the gate's decision
// does not branch on it (every metric already renders a row). `void` keeps the
// no-unused-vars build clean without changing behaviour.
void KNOWN_METRIC_CONCEPT_SYNONYMS

// HARD constraint categories — when a brief constraint falls into one of
// these and the compliance table lacks a corresponding row, gate 17 emits
// HIGH severity and exits 17. These are the constraints a buyer would
// reject the design on if violated.
//
// `category` mapping for target_performance metrics: the brief tags each
// metric with `category: 'scale' | 'performance' | 'durability' | ...`.
// `scale` + `durability` are always HARD (capacity, cycle life). The
// `safety` category, when present, is also HARD. `performance` is HARD
// for voltage / power-class metrics (system identity) but MED for things
// like efficiency or part-load curves. We use the metric KEY in a curated
// HARD_PERFORMANCE_KEYS set to disambiguate.
const HARD_METRIC_CATEGORIES = new Set(['scale', 'durability', 'safety'])
const HARD_PERFORMANCE_KEYS = new Set([
  'rated_power_mw',
  'rated_power_kw',
  'peak_power_mw',
  'peak_power_kw',
  'transient_power_kw',   // BESS L57: brief overload spec — system-identity metric
  'transient_power_mw',
  'continuous_power_kw',
  'continuous_power_mw',  // BESS L24: MW alias added to renderer METRIC_MAP
  'dc_bus_voltage_v',
  'ac_output_voltage_v',
  'thermal_output_kw',
  'annual_energy_mwh',
  'yield_kg_per_year',
])
// Top-level constraint slots that are always HARD (the brief's primary
// boundary conditions).
const HARD_TOP_LEVEL_CONSTRAINTS = new Set([
  'unit_cost_ceiling',
  'max_mass_kg',
])
// Top-level constraint slots that are SOFT (MED severity if missing).
const SOFT_TOP_LEVEL_CONSTRAINTS = new Set([
  'max_dimensions_mm',     // envelope; renderer covers via deploymentEnvelope path
  'operating_environment', // temp range
  'batch_size',
  'design_life',
  'target_material',       // chemistry / material choice
])
// Voltage / electrical-class additional_constraints are HARD (they fix
// downstream component selection). Deployment-time / installation-time
// notes are MED.
const HARD_ADDITIONAL_CONSTRAINT_PATTERN = /(?:\b(?:dc|ac)\s*(?:bus\s*)?voltage|\bvoltage\b.*\bv\b|\b(?:50|60)\s*Hz\b|\bgrid[- ]?tie\b|\bIEC\s*\d|\bUL\s*\d|\bNFPA\s*\d)/i

// ── HELPERS ─────────────────────────────────────────────────────────────────

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  return null
}

function asString(v: unknown): string | null {
  if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  return null
}

/** True when an orchestratorContract.quantities entry exists with a finite
 * numeric value. The renderer's `_qtyFromOrch` returns null otherwise, so
 * the row is skipped (silent compliance-table omission). */
function qtyPresent(quantities: Record<string, any>, key: string): boolean {
  const q = quantities?.[key]
  if (!q || typeof q !== 'object') return false
  return typeof q.value === 'number' && Number.isFinite(q.value)
}

// ── FINDING SHAPES ──────────────────────────────────────────────────────────

export type CompletenessSeverity = 'HIGH' | 'MED' | 'LOW'

export interface CompletenessFinding {
  /** Stable identifier for the brief constraint that's missing a row.
   * Format: `<constraint-slot>:<sub-key>` — e.g. `target_performance:usable_energy_mwh`,
   * `additional_constraints:dc_bus_voltage_~800v`. Used by future code to
   * suppress known-acceptable misses. */
  id: string
  /** Human-readable label of the missing constraint. */
  label: string
  /** Where in the brief this constraint lives (slot name). */
  source_slot: string
  /** The raw value declared by the brief (formatted for the audit doc). */
  brief_value: string
  /** Why the renderer dropped this row (renderer-blindness, missing qty,
   * additional_constraints not parsed, etc.). */
  reason: string
  severity: CompletenessSeverity
  /** Concrete fix instruction — what file + edit removes the gap. */
  remediation: string
}

export interface BriefConstraintCompletenessResult {
  findings: CompletenessFinding[]
  brief_constraints_seen: number
  rendered_rows_estimated: number
  product_class: string
  safety_standards_in_brief: number
  safety_standards_mandatory_in_complianceGate: number
}

// ── COMPLIANCE-ROW SHADOW LOGIC ─────────────────────────────────────────────
//
// To know whether the renderer would have produced a row for a given brief
// constraint, we shadow the same conditional structure used in
// `_buildComplianceRows` (render-minimal-pdf.tsx). Each helper returns:
//   - true  → the renderer WILL emit a row for this constraint
//   - false → the renderer will silently skip (no row, no FAIL flag)
//
// When the renderer changes, this shadow logic must change too. The audit
// flags any drift it can see (e.g. METRIC_MAP missing the brief's exact
// key) so a missed sync surfaces as a HIGH finding rather than passing
// silently.

function rendererWouldEmitCostRow(state: any): boolean {
  const cc = state?.parsedBrief?.constraints?.unit_cost_ceiling
  const briefHasCost = cc && typeof cc.value === 'number' && Number.isFinite(cc.value)
  if (!briefHasCost) return false
  // 2026-05-30 false-positive fix: the renderer emits the cost row when
  // bomTotals.grandTotal_gbp > 0, and bomTotals is computed at render time from
  // the BoM MACRO walk (engineeringContract.macro_assembly_prices × quantities),
  // NOT from partVerifications. Many classes carry their per-part prices under
  // distributor_price_gbp / engine_c_our_unit_gbp / cost_repair_corrected_price_gbp,
  // so the old `unit_price_gbp` heuristic false-flagged wind (30 parts, £7.3M
  // BoM, but 0 rows under unit_price_gbp → audit wrongly said "no cost row" while
  // the PDF clearly rendered "Unit cost (CAPEX, ex-works) £4.8M → £12.55M FAIL").
  // Accurate proxy: a non-empty module decomposition OR a populated macro-price
  // table guarantees bomTotals > 0, so the cost row renders.
  const macros = (state?.engineeringContract as any)?.macro_assembly_prices
  const hasMacroPrices = Array.isArray(macros)
    ? macros.length > 0
    : Boolean(macros && typeof macros === 'object' && Object.keys(macros).length > 0)
  const mods = state?.moduleDecomposition?.modules ?? state?.moduleDecomposition?.design?.modules
  const hasBom = Array.isArray(mods) && mods.length > 0
  const pv: any[] = Array.isArray(state?.partVerifications) ? state.partVerifications : []
  const anyPricedRow = pv.some((p: any) => {
    const price = p?.unit_price_gbp ?? p?.cost_repair_corrected_price_gbp ?? p?.distributor_price_gbp ?? p?.engine_c_our_unit_gbp ?? p?.price_estimate_gbp ?? 0
    return Number.isFinite(price) && price > 0
  })
  return hasMacroPrices || hasBom || anyPricedRow
}

// FIELD-ERECTED detection (2026-06-06 FIX D) — mirrors render-minimal-pdf.tsx
// _buildComplianceRows. Kept in LOCKSTEP with the renderer: the renderer drops an
// INFERRED plant-wide max_mass_kg row on a field-erected plant (the chain's U5b
// having already dropped the cap from the active constraints), so the gate-17
// shadow predicate must agree and NOT flag the (correctly) absent row as a missing
// HARD constraint. A brief-STATED cap (source !== 'inferred') is never dropped.
const _FIELD_ERECTED_FF_AUDIT: ReadonlySet<string> = new Set([
  'skid_mounted', 'skid-mounted', 'skid mounted', 'field_erected', 'field-erected',
  'field erected', 'plinth_mounted', 'plinth-mounted', 'plinth mounted',
  'modular_skid', 'modular-skid', 'fixed_plant', 'fixed-plant',
])
function _isFieldErectedAudit(state: any): boolean {
  const ff = String(
    state?.orchestratorContract?.envelope?.form_factor
    ?? state?.engineeringContract?.envelope?.form_factor
    ?? '',
  ).toLowerCase().trim()
  return _FIELD_ERECTED_FF_AUDIT.has(ff)
}

function rendererWouldEmitMassRow(state: any): boolean {
  const cap = state?.parsedBrief?.constraints?.max_mass_kg
  const briefHasMass = cap && typeof cap.value === 'number' && Number.isFinite(cap.value)
  if (!briefHasMass) return false
  // FIX D (2026-06-06): an INFERRED cap on a field-erected plant is dropped by the
  // renderer (and the chain U5b), so the row is legitimately absent — do not flag.
  if (_isFieldErectedAudit(state) && String((cap as any).source ?? '') === 'inferred') return false
  // 2026-06-03 (task #39/#38, gate-17): the renderer now ALWAYS emits the Max-gross-mass
  // row when the brief states a mass cap — a verified PASS/FAIL when a system-mass quantity
  // is present (total_system_mass_kg / in_container_mass_kg / ...), ELSE an honest UNVERIFIED
  // "—" row (never a fabricated mass; see render-minimal-pdf.tsx _buildComplianceRows mass
  // else-branch). So the HARD constraint is never SILENTLY ABSENT once the brief states it —
  // which is exactly what gate-17 guards. The design-mass-not-computed case (the per-module
  // mass-coverage gap, task #38) is now disclosed IN the dossier as an "unverified" row +
  // amber banner, not hidden by a dropped row.
  return true
}

function rendererWouldEmitMetricRow(state: any, metricKey: string): boolean {
  // 2026-05-30 universal completeness pass: _buildComplianceRows now emits a
  // row for EVERY brief metric — a real PASS/FAIL row when METRIC_MAP knows the
  // key AND the mapped quantity is present, otherwise an informational row
  // (target + universally-resolved-or-"—" achieved). So no brief metric is ever
  // silently absent from the rendered table; the row is always present. The
  // KNOWN_METRIC_MAP mirror is retained only for the I12b keyset-sync invariant
  // and to identify which metrics get a *real audited* (vs informational) row.
  // A metric with a curated mapping + present quantity still renders the richer
  // audited row; everything else renders the informational fallback. Either
  // way the constraint is VISIBLE, which is what gate 17 checks.
  void state
  void metricKey
  return true
}

function rendererWouldEmitEnvelopeRow(state: any): boolean {
  const env = state?.parsedBrief?.constraints?.max_dimensions_mm
  const hasEnv = env && (typeof env.w === 'number' || typeof env.d === 'number' || typeof env.h === 'number')
  if (!hasEnv) return false
  // The renderer emits the row even when status is unknown (no design dims).
  return true
}

function rendererWouldEmitDesignLifeRow(state: any): boolean {
  const dl = state?.parsedBrief?.constraints?.design_life
  return Boolean(dl && (typeof dl.value === 'string' || typeof dl.value === 'number'))
}

function rendererWouldEmitOperatingEnvRow(state: any): boolean {
  const env = state?.parsedBrief?.constraints?.operating_environment
  return Boolean(env && (typeof env.temp_min_c === 'number' || typeof env.temp_max_c === 'number'))
}

function rendererWouldEmitBatchRow(state: any): boolean {
  const b = state?.parsedBrief?.constraints?.batch_size
  return Boolean(b && typeof b.value === 'number' && Number.isFinite(b.value))
}

// ── AUDIT ───────────────────────────────────────────────────────────────────

export function auditBriefConstraintCompleteness(state: any): BriefConstraintCompletenessResult {
  const findings: CompletenessFinding[] = []
  const constraints = state?.parsedBrief?.constraints ?? {}
  const productClass = String(
    state?.moduleDecomposition?.product_class
    ?? state?.parsedBrief?.product_class
    ?? '',
  )

  let briefConstraintsSeen = 0
  let renderedRowsEstimated = 0

  // ── 1. Unit cost ceiling ──────────────────────────────────────────────────
  const cc = constraints.unit_cost_ceiling
  if (cc && typeof cc.value === 'number' && Number.isFinite(cc.value)) {
    briefConstraintsSeen += 1
    if (rendererWouldEmitCostRow(state)) {
      renderedRowsEstimated += 1
    } else {
      findings.push({
        id: 'unit_cost_ceiling',
        label: 'Unit cost (CAPEX, ex-works)',
        source_slot: 'constraints.unit_cost_ceiling',
        brief_value: `${cc.currency ?? 'GBP'} ${cc.value.toLocaleString('en-GB')}`,
        reason: 'Renderer requires partVerifications with positive prices (bomTotals.grandTotal_gbp > 0); BoM produced no priced rows so the cost row was silently skipped.',
        severity: 'HIGH',
        remediation: 'Ensure the BoM emits at least one priced word before rendering, or extend render-minimal-pdf.tsx _buildComplianceRows to emit a "cost — TBD (BoM has no priced rows)" row so the constraint remains visible.',
      })
    }
  }

  // ── 2. Max mass ───────────────────────────────────────────────────────────
  const mm = constraints.max_mass_kg
  // FIX D (2026-06-06): an INFERRED plant-wide cap on a field-erected plant is NOT
  // a real brief constraint — the chain U5b + renderer both drop it (a fixed plant
  // has no plant-wide gross-mass cap). So it is neither "seen" nor a HIGH miss; the
  // renderer legitimately omits the row. A brief-STATED cap (source !== 'inferred')
  // is unaffected and still checked. Mirrors render-minimal-pdf.tsx + the chain U5b.
  const _mmInferredFieldErected = mm && _isFieldErectedAudit(state) && String((mm as any).source ?? '') === 'inferred'
  if (mm && typeof mm.value === 'number' && Number.isFinite(mm.value) && !_mmInferredFieldErected) {
    briefConstraintsSeen += 1
    if (rendererWouldEmitMassRow(state)) {
      renderedRowsEstimated += 1
    } else {
      findings.push({
        id: 'max_mass_kg',
        label: 'Max gross mass',
        source_slot: 'constraints.max_mass_kg',
        brief_value: `${mm.value.toLocaleString('en-GB')} kg`,
        reason: 'Renderer requires one of orchestratorContract.quantities.{total_system_mass_kg, system_mass_with_external_kg, in_container_mass_kg, total_mass_kg}; none present, row silently skipped.',
        severity: 'HIGH',
        remediation: 'Update the engineering contract (src/lib/pdf-engine-v2/orchestrator/) to emit total_system_mass_kg for this product class.',
      })
    }
  }

  // ── 3. target_performance.metrics (every metric the brief declares) ──────
  const metrics: any[] = Array.isArray(constraints.target_performance?.metrics)
    ? constraints.target_performance.metrics
    : []
  for (const m of metrics) {
    const key = asString(m?.key_metric)
    if (!key) continue
    briefConstraintsSeen += 1
    const value = asNumber(m?.value)
    const unit = asString(m?.unit) ?? ''
    const category = asString(m?.category) ?? 'performance'
    const isHard = HARD_METRIC_CATEGORIES.has(category) || HARD_PERFORMANCE_KEYS.has(key)
    if (rendererWouldEmitMetricRow(state, key)) {
      renderedRowsEstimated += 1
      continue
    }
    // Two failure modes:
    //   (a) the key isn't in KNOWN_METRIC_MAP at all (renderer-blindness)
    //   (b) the key is mapped but the achieved-quantity field is missing
    //       from orchestratorContract.quantities (contract gap)
    const mapping = KNOWN_METRIC_MAP[key]
    let reason: string
    let remediation: string
    if (!mapping) {
      reason = `Brief metric key "${key}" is not present in the renderer's METRIC_MAP (render-minimal-pdf.tsx _buildComplianceRows). Renderer's for-loop hits "continue" and the row never renders.`
      remediation = `Add an entry for "${key}" to METRIC_MAP in scripts/render-minimal-pdf.tsx (~line 3626) with the orchestratorContract.quantities field name + unit conversion.`
    } else {
      reason = `Brief metric "${key}" is mapped (→ orchestratorContract.quantities.${mapping.qtyKey}) but that quantity is missing/non-numeric in the contract. Renderer's "if (!ach) continue" silently drops the row.`
      remediation = `Update the orchestrator (src/lib/pdf-engine-v2/orchestrator/) to emit quantities.${mapping.qtyKey} for product_class "${productClass}".`
    }
    findings.push({
      id: `target_performance:${key}`,
      label: mapping?.label ?? key,
      source_slot: 'constraints.target_performance.metrics[]',
      brief_value: `${value ?? '?'} ${unit}`.trim(),
      reason,
      severity: isHard ? 'HIGH' : 'MED',
      remediation,
    })
  }

  // ── 4. External envelope (max_dimensions_mm) ─────────────────────────────
  const env = constraints.max_dimensions_mm
  if (env && (typeof env.w === 'number' || typeof env.d === 'number' || typeof env.h === 'number')) {
    briefConstraintsSeen += 1
    if (rendererWouldEmitEnvelopeRow(state)) {
      renderedRowsEstimated += 1
    } else {
      findings.push({
        id: 'max_dimensions_mm',
        label: 'External envelope',
        source_slot: 'constraints.max_dimensions_mm',
        brief_value: `${env.w ?? '?'} x ${env.d ?? '?'} x ${env.h ?? '?'} mm`,
        reason: 'Renderer envelope row is keyed on presence of any of w/d/h — should always emit when those are present; if missing here the renderer logic has drifted.',
        severity: 'MED',
        remediation: 'Re-read scripts/render-minimal-pdf.tsx _buildComplianceRows envelope block; gate 17 shadow may be out of date with the renderer.',
      })
    }
  }

  // ── 5. Design life ────────────────────────────────────────────────────────
  const dl = constraints.design_life
  if (dl && (typeof dl.value === 'string' || typeof dl.value === 'number')) {
    briefConstraintsSeen += 1
    if (rendererWouldEmitDesignLifeRow(state)) {
      renderedRowsEstimated += 1
    } else {
      findings.push({
        id: 'design_life',
        label: 'Design life',
        source_slot: 'constraints.design_life',
        brief_value: String(dl.value),
        reason: 'Renderer design-life row should always emit when present; gate 17 shadow drift if this fires.',
        severity: 'MED',
        remediation: 'Re-read scripts/render-minimal-pdf.tsx _buildComplianceRows design-life block.',
      })
    }
  }

  // ── 6. Operating environment (temperature range) ─────────────────────────
  const oe = constraints.operating_environment
  if (oe && (typeof oe.temp_min_c === 'number' || typeof oe.temp_max_c === 'number')) {
    briefConstraintsSeen += 1
    if (rendererWouldEmitOperatingEnvRow(state)) {
      renderedRowsEstimated += 1
    } else {
      findings.push({
        id: 'operating_environment',
        label: 'Operating temperature',
        source_slot: 'constraints.operating_environment',
        brief_value: `${oe.temp_min_c ?? '?'} to ${oe.temp_max_c ?? '?'} C`,
        reason: 'Renderer operating-env row should always emit when temp_min_c or temp_max_c present; gate 17 shadow drift if this fires.',
        severity: 'MED',
        remediation: 'Re-read scripts/render-minimal-pdf.tsx _buildComplianceRows operating-temp block.',
      })
    }
  }

  // ── 7. Batch size ─────────────────────────────────────────────────────────
  const bs = constraints.batch_size
  if (bs && typeof bs.value === 'number' && Number.isFinite(bs.value)) {
    briefConstraintsSeen += 1
    if (rendererWouldEmitBatchRow(state)) {
      renderedRowsEstimated += 1
    } else {
      findings.push({
        id: 'batch_size',
        label: 'Annual batch',
        source_slot: 'constraints.batch_size',
        brief_value: `${bs.value}/yr`,
        reason: 'Renderer batch row should always emit when value present; gate 17 shadow drift if this fires.',
        severity: 'MED',
        remediation: 'Re-read scripts/render-minimal-pdf.tsx _buildComplianceRows batch block.',
      })
    }
  }

  // ── 8. additional_constraints (free-text bullets the brief author added) ─
  // BESS L24 fix (2026-05-25, gate-17 HIGH #4): the renderer's
  // _buildComplianceRows now iterates additional_constraints[] (block 8 in
  // the renderer). Each bullet emits a row with status 'pass' (plain intent)
  // or 'unknown' (bullet contains a measurable value — needs human verify).
  // The audit's shadow logic must match: count the bullets as rendered rows
  // rather than finding them absent.
  //
  // Bullets matching HARD_ADDITIONAL_CONSTRAINT_PATTERN (voltage, frequency,
  // grid-tie, IEC/UL/NFPA citations) that carry a measurable quantity the
  // renderer marks 'unknown' are still SOFT — the renderer surfaces them,
  // just with a "verify in narrative" notice. Only flag HIGH when the bullet
  // would NOT be rendered at all (which was the pre-fix case; post-fix the
  // renderer always emits a row, so HIGH is never triggered here).
  const addl: any[] = Array.isArray(constraints.additional_constraints) ? constraints.additional_constraints : []
  for (const a of addl) {
    const desc = asString(a?.description)
    if (!desc) continue
    briefConstraintsSeen += 1
    // Renderer block 8 always emits a row for every non-empty bullet; count it.
    renderedRowsEstimated += 1
  }

  // ── 9. safety_standards (informational only) ─────────────────────────────
  // These are surfaced separately by the compliance gate (state.complianceGate.
  // mandatory_total / mandatory_covered) so we don't double-flag, but we LOW-
  // flag any discrepancy between the count of brief-declared standards and
  // the compliance gate's mandatory_total because that means a standard the
  // brief author cited isn't being enforced as mandatory.
  const safetyStandardsInBrief = Array.isArray(constraints.safety_standards)
    ? constraints.safety_standards.length
    : 0
  const complianceGate = state?.complianceGate ?? null
  const mandatoryInGate = Number.isFinite(complianceGate?.mandatory_total)
    ? Number(complianceGate.mandatory_total)
    : 0
  if (safetyStandardsInBrief > 0 && mandatoryInGate < safetyStandardsInBrief) {
    findings.push({
      id: 'safety_standards:coverage_below_brief',
      label: 'Brief safety standards not all enforced as mandatory',
      source_slot: 'constraints.safety_standards[]',
      brief_value: `${safetyStandardsInBrief} standards in brief, ${mandatoryInGate} marked mandatory by complianceGate`,
      reason: 'The brief lists more safety standards than the compliance gate marked mandatory. Some brief-cited standards are being treated as informational, so the compliance table won\'t show PASS/FAIL for them.',
      severity: 'LOW',
      remediation: 'Audit src/lib/pdf-engine-v2/stages/3.5-compliance-gate.ts: standards the brief cites should always be at mandatory level for the product class, even if the gate considers them inferred. Cross-check class-standards.ts mandatory lists.',
    })
  }

  return {
    findings,
    brief_constraints_seen: briefConstraintsSeen,
    rendered_rows_estimated: renderedRowsEstimated,
    product_class: productClass,
    safety_standards_in_brief: safetyStandardsInBrief,
    safety_standards_mandatory_in_complianceGate: mandatoryInGate,
  }
}

// ── MARKDOWN RENDERER ───────────────────────────────────────────────────────

function renderMarkdown(result: BriefConstraintCompletenessResult, statePath: string): string {
  const lines: string[] = []
  lines.push(`# Brief Constraint Completeness Audit (gate 17) - ${statePath}`)
  lines.push('')
  lines.push(
    `**${result.brief_constraints_seen} brief constraints seen**, ` +
      `~${result.rendered_rows_estimated} rendered as compliance rows (estimated by shadowing the renderer's logic).`,
  )
  lines.push('')
  lines.push(`Product class: \`${result.product_class}\`.`)
  lines.push(
    `Safety standards: ${result.safety_standards_in_brief} declared in brief, ` +
      `${result.safety_standards_mandatory_in_complianceGate} enforced as mandatory by complianceGate.`,
  )
  lines.push('')

  if (result.findings.length === 0) {
    lines.push('PASS - every brief constraint is rendered as a row (or skipped with a known-acceptable reason).')
    return lines.join('\n')
  }

  const high = result.findings.filter((f) => f.severity === 'HIGH')
  const med = result.findings.filter((f) => f.severity === 'MED')
  const low = result.findings.filter((f) => f.severity === 'LOW')
  lines.push(
    `FAIL - ${result.findings.length} finding(s): ${high.length} HIGH, ${med.length} MED, ${low.length} LOW.`,
  )
  lines.push('')
  const sorted = [...result.findings].sort((a, b) => {
    const order = { HIGH: 0, MED: 1, LOW: 2 }
    return order[a.severity] - order[b.severity]
  })
  for (const f of sorted) {
    lines.push(`## [${f.severity}] ${f.label}`)
    lines.push(`- **id:** \`${f.id}\``)
    lines.push(`- **Source slot:** \`${f.source_slot}\``)
    lines.push(`- **Brief value:** ${f.brief_value}`)
    lines.push(`- **Reason:** ${f.reason}`)
    lines.push(`- **Fix:** ${f.remediation}`)
    lines.push('')
  }
  return lines.join('\n')
}

// ── CLI ENTRYPOINT ──────────────────────────────────────────────────────────
// Usage: npx tsx scripts/lib/brief-constraint-completeness-audit.ts <statePath> [outMdPath]
// Exit code 17 on any HIGH-severity finding.

const argv1 = process.argv[1] ?? ''
const isMain = /brief-constraint-completeness-audit\.(?:ts|js|mjs|cjs)$/.test(argv1)

if (isMain) {
  const statePath = process.argv[2]
  const outMdPath = process.argv[3]
  if (!statePath) {
    console.error('Usage: brief-constraint-completeness-audit <statePath> [outMdPath]')
    process.exit(1)
  }
  let state: any
  try {
    state = JSON.parse(readFileSync(statePath, 'utf-8'))
  } catch (err) {
    console.error(
      `[brief-constraint-completeness-audit] failed to read ${statePath}: ${(err as Error).message}`,
    )
    process.exit(1)
  }
  const result = auditBriefConstraintCompleteness(state)
  const md = renderMarkdown(result, statePath)
  if (outMdPath) {
    const fs = require('node:fs') as typeof import('node:fs')
    fs.writeFileSync(outMdPath, md, 'utf-8')
    console.log(`[brief-constraint-completeness-audit] wrote ${outMdPath}`)
  } else {
    console.log(md)
  }
  const high = result.findings.filter((f) => f.severity === 'HIGH')
  if (high.length > 0) {
    console.error(
      `[brief-constraint-completeness-audit] FAIL: ${high.length} HIGH-severity finding(s)`,
    )
    process.exit(17)
  }
  console.log(
    `[brief-constraint-completeness-audit] PASS: ${result.brief_constraints_seen} constraints, ` +
      `${result.findings.length} non-blocking findings ` +
      `(${result.findings.filter((f) => f.severity === 'MED').length} MED, ${result.findings.filter((f) => f.severity === 'LOW').length} LOW)`,
  )
}
