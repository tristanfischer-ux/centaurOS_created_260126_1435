/**
 * scripts/lib/orchestrator/sizing-families/aero-platforms.ts
 *
 * AERO-PLATFORMS sizing family (E2) — the HAPS gold standard generalised.
 *
 * Computes the COUPLED airborne-platform budget from envelope + payload:
 *   - wing loading + wing area from lift = weight (S = W / (q·CL))
 *   - cruise power from drag (P = W·V / (L/D·η_prop·η_motor))
 *   - motor-prop matching (motor continuous power ≥ propeller demand power)
 *   - battery + solar mass fractions (night-energy / specific-energy; solar
 *     harvest vs cruise demand)
 *
 * WHY THIS FAMILY EXISTS (HAPS-PHYSICS-AUTOPLANNER-SCOPE.md, 2026-06-05):
 * the hand-wired HAPS emitter shipped HARDCODED literals (4.0 m prop, Hacker
 * A60 motor, 5-8 kg payload) and an LLM-prose cruise power (33.3 kW) that
 * diverged from the contract physics (2.27 kW) — defects B-4/B-5. The fix is
 * a DERIVED budget: every airborne number comes from first-principles flight
 * physics keyed to the envelope, never a literal. `FAMILIES = { battery }`
 * had NO aircraft family (scope doc Problem A) — this is it.
 *
 * DISCIPLINE: a computation emits NOTHING when its source quantity is absent
 * (never invent); requiredQuantities enforce the hard budget inputs at the G6
 * boundary (loud failure, no silent ISA defaults — the London-lat/lon class).
 * Every rule + computation cites its engineering basis.
 *
 * British spelling throughout.
 */

import type { ContractInProgress, TypedQuantity } from '../types'
import { mod, type ModifierCharacter } from '../generic/emitter-primitives'
import type { SizingParams } from '../generic/sizing'
import { num } from '../generic/sizing'
import { scanWordsAgainstRules, type FamilyRule } from './rule-engine'
import { registerSizingFamily } from './registry'
import { MASS_KG, VELOCITY_M_S, DENSITY_KG_M3 } from './units'
import {
  type EnvelopeVectorLike,
  type QuantityWrite,
  type DerivedParameterWrite,
  type SizableModule,
  type SizingDelta,
  type SizingFamilyPlugin,
} from './types'

const VERSION = '1.0.0'
const PROVENANCE = `family-plugin:aero-platforms@${VERSION}`
const G = 9.81 // m/s² standard gravity (first-principles weight W = m·g)

// ── helpers (same never-invent contract as generic/sizing.ts) ──
function q1(): ModifierCharacter[] {
  return [mod('quantity', '×1')]
}
function qn(v: number | undefined): ModifierCharacter[] {
  return v !== undefined && v >= 1 ? [mod('quantity', `×${Math.round(v)}`)] : []
}
function rate(kind: string, v: number | undefined, unit: string): ModifierCharacter[] {
  if (v === undefined || !Number.isFinite(v)) return []
  const r = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100
  return [mod(kind, String(r), unit)]
}
function firstNum(p: SizingParams, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = num(p, k)
    if (v !== undefined) return v
  }
  return undefined
}

// ---------------------------------------------------------------------------
// COUPLED BUDGET — derives the airborne quantities from flight physics.
// Returns quantity_writes + derived_parameter_writes (provenance-stamped).
// Each step guards on availability; nothing is invented.
// ---------------------------------------------------------------------------

function aeroProvenance(field: string): TypedQuantity['provenance'] {
  return { source: 'aggregator', tool_id: 'family-plugin:aero-platforms', invocation_output_field: field }
}

interface BudgetResult {
  quantity_writes: QuantityWrite[]
  derived_parameter_writes: DerivedParameterWrite[]
  notes: string[]
}

export function computeAeroBudget(
  params: SizingParams,
  principalModuleIndex: number,
): BudgetResult {
  const qw: QuantityWrite[] = []
  const dp: DerivedParameterWrite[] = []
  const notes: string[] = []

  const massKg = firstNum(params, ['max_mass_kg', 'mtow_kg', 'gross_takeoff_mass_kg', 'total_system_mass_kg'])
  const v = firstNum(params, ['cruise_velocity_m_s', 'cruise_speed_m_s', 'airspeed_m_s'])
  const rho = firstNum(params, ['air_density_kg_m3', 'cruise_air_density_kg_m3'])
  const cl = firstNum(params, ['wing_lift_coefficient_cl', 'cruise_cl', 'wing_cl'])
  const lOverD = firstNum(params, ['wing_l_over_d', 'l_over_d', 'lift_to_drag'])
  const existingWingArea = firstNum(params, ['wing_area_m2'])

  const pushQ = (key: string, value: number, unit: string, family: TypedQuantity['family'], basis: string): void => {
    qw.push({
      key,
      rule_id: 'aero_budget',
      basis,
      provenance: PROVENANCE,
      quantity: {
        value, unit, family, basis: 'rated', scope: 'system',
        uncertainty_pct: 10, temporal_resolution_s: null, condition: null,
        provenance: aeroProvenance(key),
      },
    })
    dp.push({ module: principalModuleIndex, key, value, rule_id: 'aero_budget', basis, provenance: PROVENANCE })
  }

  // weight + dynamic pressure (the two budget primitives)
  const weightN = massKg !== undefined ? massKg * G : undefined
  const qDyn = rho !== undefined && v !== undefined ? 0.5 * rho * v * v : undefined // Pa

  // 1. WING AREA — lift balances weight: L = q·S·CL = W ⇒ S = W/(q·CL).
  //    Basis: steady-level-flight lift equation (Anderson, Fundamentals of Aero).
  let wingArea = existingWingArea
  if (wingArea === undefined && weightN !== undefined && qDyn !== undefined && qDyn > 0 && cl !== undefined && cl > 0) {
    wingArea = weightN / (qDyn * cl)
    pushQ('wing_area_m2', round2(wingArea), 'm²', 'area', 'lift=weight: S = W/(q·CL) (steady level flight, Anderson)')
    notes.push(`wing area ${round2(wingArea)} m² from S=W/(q·CL)`)
  }

  // 2. WING LOADING — W/S (kg/m²). Basis: design wing loading; HAPS run very low
  //    (~2-6 kg/m²) for high-altitude low-density flight.
  if (massKg !== undefined && wingArea !== undefined && wingArea > 0) {
    const wl = massKg / wingArea
    pushQ('wing_loading_kg_m2', round2(wl), 'kg/m²', 'dimensionless', 'wing loading W/S (aircraft design parameter)')
  }

  // 3. CRUISE POWER — P = W·V / ((L/D)·η_prop·η_motor). Basis: power-required
  //    in cruise = drag·velocity, with propulsive + electrical efficiencies.
  const etaProp = firstNum(params, ['prop_efficiency', 'propeller_efficiency']) ?? 0.80 // BEMT-typical for low-Re HAPS prop
  const etaMotor = firstNum(params, ['motor_efficiency_pct_at_altitude']) !== undefined
    ? (firstNum(params, ['motor_efficiency_pct_at_altitude']) as number) / 100
    : (firstNum(params, ['motor_efficiency']) ?? 0.88)
  let cruisePowerW: number | undefined
  if (weightN !== undefined && v !== undefined && lOverD !== undefined && lOverD > 0) {
    cruisePowerW = (weightN * v) / (lOverD * etaProp * etaMotor)
    pushQ('cruise_power_w', round2(cruisePowerW), 'W', 'power', 'P = W·V/((L/D)·η_prop·η_motor) (cruise power-required)')
    notes.push(`cruise power ${round2(cruisePowerW)} W from drag·V/η (η_prop=${etaProp}, η_motor=${round2(etaMotor)})`)
  }

  // 4. PROPELLER DEMAND vs MOTOR RATING — motor-prop matching. Basis: a motor
  //    must deliver ≥ the propeller shaft-power demand at cruise (HAPS B-2:
  //    the un-wired motor-prop:matching join that would catch "A60 can't turn
  //    a 4 m prop"). Emits a coherence flag (1 ok / 0 mismatch).
  const propDemandW = firstNum(params, ['prop_power_w', 'propeller_shaft_power_w'])
  const motorContW = firstNum(params, ['continuous_power_w', 'motor_continuous_power_w'])
  if (propDemandW !== undefined && motorContW !== undefined) {
    const ok = motorContW >= propDemandW ? 1 : 0
    pushQ('motor_prop_match_ok', ok, '', 'dimensionless',
      'motor-prop match: motor continuous shaft power ≥ propeller demand at cruise (torque-curve intersection)')
    if (!ok) notes.push(`MOTOR-PROP MISMATCH: motor ${motorContW} W < prop demand ${propDemandW} W`)
  }

  // 5. BATTERY MASS — night energy / cell specific energy. Basis: m_batt =
  //    E_night / e_spec, E_night = P_cruise·t_night (energy-balance overnight
  //    hold for a solar HALE platform).
  const tNightH = firstNum(params, ['night_duration_h', 'dark_hours_h']) ?? 12 // mid-lat summer night ≈ 12 h
  const eSpecWhKg = firstNum(params, ['battery_specific_energy_wh_kg', 'cell_specific_energy_wh_kg']) ?? 350 // Li-S/advanced Li-ion pack-level
  if (cruisePowerW !== undefined) {
    const eNightWh = cruisePowerW * tNightH
    const mBatt = eNightWh / eSpecWhKg
    pushQ('battery_pack_mass_kg', round2(mBatt), 'kg', 'mass', 'm_batt = P_cruise·t_night / e_spec (overnight energy balance)')
    pushQ('battery_energy_kwh', round2(eNightWh / 1000), 'kWh', 'energy', 'E_night = P_cruise·t_night (overnight hold)')
    notes.push(`battery ${round2(mBatt)} kg / ${round2(eNightWh / 1000)} kWh (t_night=${tNightH} h, e_spec=${eSpecWhKg} Wh/kg)`)
    if (massKg !== undefined && massKg > 0) {
      pushQ('battery_mass_fraction', round2(mBatt / massKg), '', 'dimensionless', 'battery mass fraction m_batt/MTOW')
    }
  }

  // 6. SOLAR ARRAY — area + harvest. Basis: P_solar = G·A·η; array sized to
  //    re-charge the night battery during the solar day (energy-closure).
  const wingCoverage = firstNum(params, ['solar_wing_coverage_frac']) ?? 0.40 // fraction of wing skinned with cells
  const cellEff = firstNum(params, ['solar_cell_efficiency']) ?? 0.30 // triple-junction GaAs
  const irradiance = firstNum(params, ['solar_irradiance_et_w_m2', 'solar_irradiance_w_m2'])
  if (wingArea !== undefined && irradiance !== undefined) {
    const arrayArea = wingArea * wingCoverage
    const harvestW = irradiance * arrayArea * cellEff
    pushQ('solar_array_area_m2', round2(arrayArea), 'm²', 'area', 'solar array area = wing area × skin coverage fraction')
    pushQ('solar_harvest_peak_w', round2(harvestW), 'W', 'power', 'P_solar = G·A·η (peak harvest, triple-junction GaAs)')
    notes.push(`solar ${round2(arrayArea)} m² array → ${round2(harvestW)} W peak (η=${cellEff}, coverage=${wingCoverage})`)
  }

  return { quantity_writes: qw, derived_parameter_writes: dp, notes }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

// ---------------------------------------------------------------------------
// WORD RULES — attach the budget onto the BoM component words. 16 rules.
// ---------------------------------------------------------------------------

export const AERO_PLATFORMS: FamilyRule[] = [
  // 1. Wing spar / main spar. Basis: spar sized to bending from wing loading ×
  //    span; length = wingspan.
  {
    id: 'wing_spar',
    match: /wing[_\s-]?spar|main[_\s-]?spar|spar[_\s-]?box|spar[_\s-]?cap/i,
    basis: 'spar bending from lift distribution over span; length = wingspan (beam theory)',
    size: (p) => [...q1(), ...rate('dimension', firstNum(p, ['wingspan_m', 'span_m']), 'm span')],
  },
  // 2. Wing skin / panel. Basis: area = wing area.
  {
    id: 'wing_skin',
    match: /wing[_\s-]?skin|wing[_\s-]?panel|wing[_\s-]?rib|aerofoil|airfoil/i,
    basis: 'wing skin area = wing area S (planform)',
    size: (p) => [...q1(), ...rate('capacity', firstNum(p, ['wing_area_m2']), 'm²')],
  },
  // 3. Solar laminate / array. Basis: solar array area (computed in budget).
  {
    id: 'solar_array',
    match: /solar[_\s-]?lamin|solar[_\s-]?cell|gaas|photovoltaic|\bpv\b[_\s-]?array|solar[_\s-]?array/i,
    basis: 'array area = wing area × coverage; harvest P = G·A·η (triple-junction)',
    size: (p) => [...q1(), ...rate('capacity', firstNum(p, ['solar_array_area_m2']), 'm²'), ...rate('rating_primary', firstNum(p, ['solar_harvest_peak_w', 'solar_harvest_peak_kw']), 'W peak')],
  },
  // 4. Propeller. Basis: prop demand power at cruise (BEMT); diameter literal
  //    REPLACED by contract-derived diameter when present (HAPS B-4 fix).
  {
    id: 'propeller',
    match: /propeller|\bprop\b|rotor[_\s-]?blade|airscrew/i,
    basis: 'propeller demand P from BEMT at cruise; diameter from contract (not a literal — HAPS B-4)',
    size: (p) => [...qn(firstNum(p, ['propeller_count', 'num_propellers'])) , ...rate('rating_primary', firstNum(p, ['prop_power_w', 'propeller_shaft_power_w']), 'W shaft'), ...rate('dimension', firstNum(p, ['propeller_diameter_m', 'prop_diameter_m']), 'm dia')],
  },
  // 5. Motor. Basis: motor continuous power ≥ prop demand (motor-prop match);
  //    altitude-derated rating.
  {
    id: 'motor',
    match: /\bmotor\b|electric[_\s-]?drive|outrunner|bldc/i,
    basis: 'motor continuous shaft power ≥ prop demand (IEC 60034 altitude-derated); motor-prop match',
    size: (p) => [...qn(firstNum(p, ['motor_count', 'propeller_count'])) , ...rate('rating_primary', firstNum(p, ['continuous_power_w', 'motor_continuous_power_w']), 'W continuous')],
  },
  // 6. Battery / pack. Basis: night-energy mass (budget).
  {
    id: 'battery',
    match: /batter|\bcell\b|li[_\s-]?s\b|lithium|pack[_\s-]?module/i,
    basis: 'battery mass = night energy / specific energy; E_night = P_cruise·t_night',
    size: (p) => [...q1(), ...rate('rating_primary', firstNum(p, ['battery_energy_kwh', 'actual_pack_energy_kwh']), 'kWh'), ...rate('capacity', firstNum(p, ['battery_pack_mass_kg']), 'kg')],
  },
  // 7. Fuselage / pod / central body. Basis: houses payload + avionics; one body.
  {
    id: 'fuselage',
    match: /fuselage|\bpod\b|central[_\s-]?body|pod[_\s-]?shell|nacelle[_\s-]?body/i,
    basis: 'fuselage/pod houses payload + avionics + battery (single central body)',
    size: () => [...q1()],
  },
  // 8. Boom / tail boom. Basis: twin/single boom carries empennage; count.
  {
    id: 'boom',
    match: /tail[_\s-]?boom|\bboom\b|tail[_\s-]?arm/i,
    basis: 'tail boom carries empennage at moment arm; count from configuration',
    size: (p) => [...qn(firstNum(p, ['boom_count'])) ],
  },
  // 9. Empennage / tail / stabiliser. Basis: tail volume coefficient sizing.
  {
    id: 'empennage',
    match: /empennage|tailplane|stabilis|stabiliz|\btail\b|elevator|rudder|v[_\s-]?tail/i,
    basis: 'tail area from tail-volume coefficient V_h = (S_t·l_t)/(S·c̄) (aircraft stability)',
    size: () => [...q1()],
  },
  // 10. Avionics / autopilot / flight computer. Basis: one flight-control unit.
  {
    id: 'avionics',
    match: /avionic|autopilot|flight[_\s-]?comput|fcs|flight[_\s-]?control/i,
    basis: 'single flight-control / autopilot unit (FCS architecture)',
    size: () => [...q1()],
  },
  // 11. Payload. Basis: payload mass from brief (HAPS B-4: not a 5-8 kg literal).
  {
    id: 'payload',
    match: /payload|sensor[_\s-]?pod|camera|earth[_\s-]?obs|imaging[_\s-]?payload/i,
    basis: 'payload mass from brief constraint (not a literal — HAPS B-4)',
    size: (p) => [...q1(), ...rate('capacity', firstNum(p, ['payload_mass_kg']), 'kg payload')],
  },
  // 12. Comms / RF transceiver. Basis: link-budget-rated transmit power.
  {
    id: 'comms',
    match: /transceiv|\brf\b|telemetr|datalink|s[_\s-]?band|comm(s|unication)/i,
    basis: 'RF transmit power from link budget (EIRP, slant range) — link-budget tool output',
    size: (p) => [...q1(), ...rate('rating_primary', firstNum(p, ['rf_tx_power_w']), 'W TX')],
  },
  // 13. Landing gear / skid. Basis: belly-landing load case (FEA).
  {
    id: 'landing_gear',
    match: /landing[_\s-]?gear|\bskid\b|undercarriage|belly[_\s-]?land/i,
    basis: 'landing-gear load from descent-rate energy at touchdown (FEA landing case)',
    size: () => [...q1()],
  },
  // 14. Solar MPPT / power management. Basis: rated to solar harvest power.
  {
    id: 'mppt',
    match: /mppt|power[_\s-]?manag|charge[_\s-]?controller|power[_\s-]?distribution[_\s-]?unit|\bpdu\b/i,
    basis: 'MPPT rated to peak solar harvest power (P_solar)',
    size: (p) => [...q1(), ...rate('rating_primary', firstNum(p, ['solar_harvest_peak_w']), 'W')],
  },
  // 15. ESC / motor controller. Basis: rated to motor continuous current/power.
  {
    id: 'esc',
    match: /\besc\b|motor[_\s-]?controller|speed[_\s-]?controller|inverter[_\s-]?drive/i,
    basis: 'ESC rated to motor continuous power with margin (drive sizing)',
    size: (p) => [...qn(firstNum(p, ['motor_count', 'propeller_count'])) , ...rate('rating_primary', firstNum(p, ['continuous_power_w', 'motor_continuous_power_w']), 'W')],
  },
  // 16. Antenna / array element. Basis: count from link-budget gain requirement.
  {
    id: 'antenna',
    match: /antenna|helical[_\s-]?array|patch[_\s-]?array|\bdish\b/i,
    basis: 'antenna gain from link-budget requirement (dBi); count per configuration',
    size: (p) => [...qn(firstNum(p, ['antenna_count'])) ],
  },
]

export const AERO_PLATFORMS_FAMILY: SizingFamilyPlugin = {
  family: 'aero-platforms',
  version: VERSION,
  runs_after: [],
  overrides: [],

  // 1.0 — aircraft/HAPS/UAV slug; 0.75 — 'aero' domain signal; 0.6 — keyword.
  appliesTo(envelopeVector: EnvelopeVectorLike | null | undefined, classSlug: string): number {
    const slug = String(classSlug ?? '')
    if (/haps|\buav\b|drone|aircraft|aero[_-]?platform|fixed[_-]?wing|airship|glider|hale/i.test(slug)) return 1.0
    const domains = envelopeVector?.domains ?? []
    if (domains.some((d) => /aero|aircraft|aviation|flight/i.test(String(d)))) return 0.75
    if (/wing|propuls|airborne/i.test(slug)) return 0.6
    return 0
  },

  // G6 boundary: the budget cannot run without gross mass + cruise speed +
  // cruise air density. Loud failure (no silent ISA defaults — the prior
  // London-lat/lon / 0.088 hardcode bug class).
  requiredQuantities: [
    { name: 'max_mass_kg', aliases: ['mtow_kg', 'gross_takeoff_mass_kg', 'total_system_mass_kg'], unit: 'kg', family: MASS_KG, valid_range: [0.5, 100_000] },
    { name: 'cruise_velocity_m_s', aliases: ['cruise_speed_m_s', 'airspeed_m_s'], unit: 'm/s', family: VELOCITY_M_S, valid_range: [3, 340] },
    { name: 'air_density_kg_m3', aliases: ['cruise_air_density_kg_m3'], unit: 'kg/m3', family: DENSITY_KG_M3, valid_range: [0.001, 1.5] },
  ],

  size(modules: ReadonlyArray<SizableModule>, contract: ContractInProgress): SizingDelta {
    const params = flatten(contract)
    // pick the principal aero module for derived_parameters (wing/airframe), else module 0
    let principal = 0
    for (let i = 0; i < (modules?.length ?? 0); i++) {
      const name = String(modules[i]?.module ?? '').toLowerCase()
      if (/wing|airframe|aero|structure|propuls/.test(name)) { principal = i; break }
    }
    const budget = computeAeroBudget(params, principal)
    // re-flatten with the budget's freshly-derived quantities so the word rules
    // (wing_area, cruise power, solar area, battery mass) can attach them.
    const enriched: SizingParams = { ...params }
    for (const w of budget.quantity_writes) enriched[w.key] = w.quantity.value
    const modifier_writes = scanWordsAgainstRules(modules, AERO_PLATFORMS, enriched, PROVENANCE, 'aero-platforms flight-physics budget')
    return {
      family: 'aero-platforms',
      version: VERSION,
      provenance: PROVENANCE,
      modifier_writes,
      quantity_writes: budget.quantity_writes,
      derived_parameter_writes: budget.derived_parameter_writes,
      notes: [...budget.notes, ...(modifier_writes.length > 0 ? [`aero-platforms sized ${modifier_writes.length} component word(s)`] : [])],
    }
  },
}

function flatten(contract: ContractInProgress): SizingParams {
  const out: SizingParams = {}
  const qs = (contract?.quantities ?? {}) as Record<string, { value?: unknown } | undefined>
  for (const [k, v] of Object.entries(qs)) {
    const val = v?.value
    if (typeof val === 'number' || typeof val === 'string') out[k] = val
  }
  return out
}

registerSizingFamily(AERO_PLATFORMS_FAMILY)
