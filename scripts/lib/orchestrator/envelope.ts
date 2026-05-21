/**
 * scripts/lib/orchestrator/envelope.ts
 *
 * BRIEF ENVELOPE DETECTOR — pure rules. NO LLM.
 *
 * Maps parsed constraints to (class, scale_tier, voltage_tier,
 * form_factor, application). The orchestrator's tool plan selector
 * keys off the envelope to pick the right deterministic tool plan.
 *
 * Council requirement (drawer drawer_forgeos_gotchas_b455d6d2555849aa):
 * brief-shape gating is mandatory. The 1424-line hand-coded BESS
 * template hardcodes utility-containerised topology; applying it to a
 * residential 50 kWh ESS scaled only by Contract.cell_count produces
 * "deterministic hallucination" (MiMo V2.5 Pro).
 *
 * Detection logic per class is keyword + range based. If the envelope
 * cannot be unambiguously determined, the function returns null and
 * the chain falls back to the LLM Generator path.
 */

import type { BriefEnvelope, ParsedConstraints } from './types'

// ---------------------------------------------------------------------------
// CLASS NORMALISATION — classifier slugs to orchestrator class IDs.
// Mirrors ARCHETYPE_ALIASES in engineering-contract.ts for consistency.
// ---------------------------------------------------------------------------

const CLASS_ALIASES: Record<string, string> = {
  energy_storage: 'bess',
  bess: 'bess',
  bess_utility_scale: 'bess',
  battery_energy_storage: 'bess',
  utility_bess: 'bess',
  residential_ess: 'bess',
  ci_bess: 'bess',
  vertical_farm: 'vertical_farm',
  verticalfarm: 'vertical_farm',
  containerised_vertical_farm: 'vertical_farm',
  vf: 'vertical_farm',
  haps: 'haps',
  high_altitude_pseudo_satellite: 'haps',
  pseudo_satellite: 'haps',
  stratospheric_uav: 'haps',
  thermal_system: 'heat_pump_residential',
  heat_pump: 'heat_pump_residential',
  heat_pump_residential: 'heat_pump_residential',
  heatpump: 'heat_pump_residential',
  air_source_heat_pump: 'heat_pump_residential',
  ashp: 'heat_pump_residential',
  drone: 'drone',
  multirotor: 'drone',
  quadcopter: 'drone',
  auv: 'auv',
  autonomous_underwater_vehicle: 'auv',
  uuv: 'auv',
  bioreactor: 'bioreactor',
  fermenter: 'bioreactor',
  wearable_medical: 'cgm',
  cgm: 'cgm',
  edge_ai: 'edge_ai',
  edge_ai_server: 'edge_ai',
  inference_server: 'edge_ai',
  ev_charger: 'ev_charger',
  dc_fast_charger: 'ev_charger',
}

function normaliseClass(raw: string): string | null {
  const key = String(raw ?? '').toLowerCase().trim()
  return CLASS_ALIASES[key] ?? null
}

// ---------------------------------------------------------------------------
// SCALE TIER DETECTORS — class-specific. Each returns a tier label or
// null if the constraints don't permit unambiguous classification.
// ---------------------------------------------------------------------------

function bessScaleTier(c: ParsedConstraints): string | null {
  const tp = c.target_performance
  if (!tp) return null
  // Normalise to kWh
  let kwh = tp.value
  const unit = String(tp.unit ?? '').toLowerCase()
  if (unit === 'mwh') kwh = tp.value * 1000
  else if (unit === 'gwh') kwh = tp.value * 1_000_000
  else if (unit === 'wh') kwh = tp.value / 1000
  else if (unit !== 'kwh') return null

  if (kwh <= 30) return 'residential'
  if (kwh <= 200) return 'light_commercial'
  if (kwh <= 2000) return 'commercial'
  if (kwh <= 20000) return 'utility_containerised'
  if (kwh <= 500000) return 'utility_farm'
  return 'grid_scale'
}

function hapsScaleTier(c: ParsedConstraints): string | null {
  const desc = String(c.product_description ?? '').toLowerCase()
  // Look for wingspan in metres
  const m = desc.match(/(\d{1,3}(?:\.\d+)?)\s*[-\s]?\s*metres?[\s-]+wingspan/i)
    ?? desc.match(/wingspan[\s:.\-of]{0,12}(\d{1,3}(?:\.\d+)?)\s*(?:m\b|metres?)/i)
  const ws = m ? parseFloat(m[1]) : null
  // Envelope dimensions fallback
  const envW = c.max_dimensions_mm?.w ? c.max_dimensions_mm.w / 1000 : null
  const span = ws ?? envW
  if (!span) return null
  if (span < 25) return 'small'
  if (span <= 60) return 'medium'
  return 'large'
}

function heatPumpScaleTier(c: ParsedConstraints): string | null {
  const tp = c.target_performance
  if (!tp) return null
  let kw = tp.value
  const unit = String(tp.unit ?? '').toLowerCase()
  if (unit === 'w') kw = tp.value / 1000
  else if (unit === 'mw') kw = tp.value * 1000
  else if (unit !== 'kw') return null

  if (kw <= 12) return 'residential'
  if (kw <= 30) return 'light_commercial'
  if (kw <= 100) return 'commercial'
  return 'industrial'
}

function vfScaleTier(c: ParsedConstraints): string | null {
  // Vertical farm scale: by canopy area or container count
  const desc = String(c.product_description ?? '').toLowerCase()
  const m = desc.match(/(\d{1,4})\s*m[2²]\s+canopy/i) ?? desc.match(/canopy[\s\w]{0,30}?(\d{1,4})\s*m[2²]/i)
  const area = m ? parseFloat(m[1]) : null
  if (!area) return 'commercial' // default container-scale
  if (area < 30) return 'micro'
  if (area <= 300) return 'commercial'
  return 'industrial'
}

function droneScaleTier(c: ParsedConstraints): string | null {
  const mass = c.max_mass_kg?.value
  if (!mass) return null
  if (mass <= 2) return 'consumer'
  if (mass <= 25) return 'commercial'
  if (mass <= 150) return 'industrial'
  return 'heavy_lift'
}

function auvScaleTier(c: ParsedConstraints): string | null {
  const desc = String(c.product_description ?? '').toLowerCase()
  const m = desc.match(/(\d{1,5})\s*m\s+(?:depth|operating|design)/i)
    ?? desc.match(/depth[\s:]{0,5}(\d{1,5})\s*m/i)
  const depth = m ? parseFloat(m[1]) : null
  if (!depth) return null
  if (depth <= 100) return 'shallow'
  if (depth <= 1000) return 'mid_water'
  if (depth <= 3000) return 'deep'
  return 'full_ocean_depth'
}

function bioreactorScaleTier(c: ParsedConstraints): string | null {
  const tp = c.target_performance
  if (!tp) return null
  let l = tp.value
  const unit = String(tp.unit ?? '').toLowerCase()
  if (unit === 'ml') l = tp.value / 1000
  else if (unit === 'm3' || unit === 'm³') l = tp.value * 1000
  else if (unit !== 'l' && unit !== 'litre' && unit !== 'liter') return null
  if (l < 100) return 'bench'
  if (l < 1000) return 'pilot'
  if (l < 10000) return 'production'
  return 'large_production'
}

function cgmScaleTier(_c: ParsedConstraints): string | null {
  // CGM is single-tier (consumer wearable). Returning 'standard' covers
  // the 7-14 day disposable variant.
  return 'standard'
}

function edgeAiScaleTier(c: ParsedConstraints): string | null {
  // Edge AI scale: 1U/2U/4U/half-rack/full-rack
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/1u\b|1-u/i.test(desc)) return 'rack_1u'
  if (/2u\b|2-u/i.test(desc)) return 'rack_2u'
  if (/4u\b|4-u/i.test(desc)) return 'rack_4u'
  if (/half-rack|half rack/i.test(desc)) return 'half_rack'
  if (/full rack|full-rack/i.test(desc)) return 'full_rack'
  return 'rack_1u' // default
}

function evChargerScaleTier(c: ParsedConstraints): string | null {
  const tp = c.target_performance
  if (!tp) return null
  let kw = tp.value
  const unit = String(tp.unit ?? '').toLowerCase()
  if (unit === 'w') kw = tp.value / 1000
  else if (unit === 'mw') kw = tp.value * 1000
  else if (unit !== 'kw') return null
  if (kw <= 22) return 'ac_slow'
  if (kw <= 50) return 'dc_fast_low'
  if (kw <= 200) return 'dc_fast'
  if (kw <= 350) return 'ultra_fast'
  return 'megawatt'
}

// ---------------------------------------------------------------------------
// VOLTAGE TIER — rule-based per class.
// ---------------------------------------------------------------------------

type VoltageTier = BriefEnvelope['voltage_tier']

function classifyVoltage(v: number): VoltageTier {
  if (v <= 50) return 'extra_low'         // SELV/PELV
  if (v <= 1000) return 'low'              // LV per IEC 60038
  if (v <= 66_000) return 'medium'         // MV
  if (v <= 230_000) return 'high'          // HV
  return 'extra_high'                      // EHV (≥ 230 kV)
}

function bessVoltageTier(scaleTier: string | null, c: ParsedConstraints): VoltageTier {
  if (c.voltage_class_v) return classifyVoltage(c.voltage_class_v)
  // Defaults by scale
  switch (scaleTier) {
    case 'residential': return 'extra_low'         // 48V DC
    case 'light_commercial': return 'low'           // 400V DC
    case 'commercial': return 'low'                 // 800V DC
    case 'utility_containerised': return 'medium'   // 800V DC → 11 kV AC PCC
    case 'utility_farm': return 'medium'
    case 'grid_scale': return 'high'
    default: return 'low'
  }
}

function hapsVoltageTier(_: string | null, _c: ParsedConstraints): VoltageTier {
  return 'extra_low' // typical 24-48V DC airframe bus
}

function heatPumpVoltageTier(scaleTier: string | null, c: ParsedConstraints): VoltageTier {
  if (c.voltage_class_v) return classifyVoltage(c.voltage_class_v)
  // Defaults
  if (scaleTier === 'residential') return 'extra_low' // 230V AC single-phase, but compressor controllers can be 400V
  if (scaleTier === 'light_commercial' || scaleTier === 'commercial') return 'low' // 400V three-phase
  return 'low'
}

function vfVoltageTier(_: string | null, _c: ParsedConstraints): VoltageTier {
  return 'low' // 230/400V AC
}

function droneVoltageTier(scaleTier: string | null, _c: ParsedConstraints): VoltageTier {
  if (scaleTier === 'consumer') return 'extra_low'
  return 'extra_low' // 6S to 12S LiPo (22-50V)
}

function auvVoltageTier(_: string | null, _c: ParsedConstraints): VoltageTier {
  return 'extra_low' // 24-48V DC typical
}

function bioreactorVoltageTier(_: string | null, _c: ParsedConstraints): VoltageTier {
  return 'low' // 400V three-phase for agitator
}

function cgmVoltageTier(_: string | null, _c: ParsedConstraints): VoltageTier {
  return 'extra_low' // 1.55V coin cell
}

function edgeAiVoltageTier(_: string | null, _c: ParsedConstraints): VoltageTier {
  return 'low' // 230V single-phase or 400V three-phase
}

function evChargerVoltageTier(scaleTier: string | null, _c: ParsedConstraints): VoltageTier {
  if (scaleTier === 'ac_slow') return 'low'           // 230/400V AC input
  if (scaleTier === 'megawatt') return 'medium'
  return 'low' // 400V AC input → up to 1000V DC output is still 'low' per IEC 60038
}

// ---------------------------------------------------------------------------
// FORM FACTOR DETECTORS — keyword based with class-specific defaults.
// ---------------------------------------------------------------------------

function bessFormFactor(scaleTier: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/40[\s-]?(?:foot|ft)|40hc\b|40['\s]hc/i.test(desc)) return 'container_40hc'
  if (/20[\s-]?(?:foot|ft)\b/i.test(desc)) return 'container_20ft'
  if (/multi[\s-]?container|farm|array/i.test(desc) && scaleTier === 'utility_farm') return 'multi_container'
  if (/cabinet|wall[\s-]?mount/i.test(desc)) return 'cabinet'
  if (/rack[\s-]?mount|19["\s-]?in/i.test(desc)) return 'rack_19in'
  // Defaults by tier
  switch (scaleTier) {
    case 'residential': return 'wall_mount'
    case 'light_commercial':
    case 'commercial': return 'cabinet'
    case 'utility_containerised': return 'container_40hc'
    case 'utility_farm': return 'multi_container'
    default: return 'cabinet'
  }
}

function hapsFormFactor(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/airship|balloon|lighter[\s-]?than[\s-]?air|lta\b/i.test(desc)) return 'lighter_than_air'
  return 'fixed_wing'
}

function heatPumpFormFactor(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/monobloc/i.test(desc)) return 'monobloc'
  if (/multi[\s-]?split|vrv|vrf/i.test(desc)) return 'vrv_vrf'
  if (/split/i.test(desc)) return 'split'
  return 'monobloc'
}

function vfFormFactor(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/40[\s-]?(?:foot|ft)|40hc/i.test(desc)) return 'container_40hc'
  if (/20[\s-]?(?:foot|ft)/i.test(desc)) return 'container_20ft'
  if (/warehouse|building/i.test(desc)) return 'warehouse_buildout'
  return 'container_40hc'
}

function droneFormFactor(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/octocopter/i.test(desc)) return 'octocopter'
  if (/hexacopter/i.test(desc)) return 'hexacopter'
  if (/quadcopter/i.test(desc)) return 'quadcopter'
  if (/fixed[\s-]?wing/i.test(desc)) return 'fixed_wing'
  return 'quadcopter'
}

function auvFormFactor(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/glider/i.test(desc)) return 'glider'
  return 'torpedo'
}

function bioreactorFormFactor(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/single[\s-]?use|disposable/i.test(desc)) return 'single_use'
  if (/airlift/i.test(desc)) return 'airlift'
  return 'stirred_tank'
}

function cgmFormFactor(_: string | null, _c: ParsedConstraints): string {
  return 'sensor_patch'
}

function edgeAiFormFactor(scaleTier: string | null, _c: ParsedConstraints): string {
  return scaleTier ?? 'rack_1u'
}

function evChargerFormFactor(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/gantry|truck|hgv/i.test(desc)) return 'gantry'
  if (/kiosk/i.test(desc)) return 'kiosk'
  if (/wall[\s-]?mount/i.test(desc)) return 'wall_mount'
  return 'pedestal'
}

// ---------------------------------------------------------------------------
// APPLICATION CONTEXT — class-specific.
// ---------------------------------------------------------------------------

function bessApplication(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/behind[\s-]?the[\s-]?meter|btm/i.test(desc)) return 'behind_the_meter'
  if (/front[\s-]?of[\s-]?meter|fom|grid[\s-]?balancing|frequency response|capacity market/i.test(desc)) return 'front_of_meter'
  if (/micro[\s-]?grid/i.test(desc)) return 'micro_grid'
  if (/off[\s-]?grid/i.test(desc)) return 'off_grid'
  return 'front_of_meter' // default for utility-scale
}

function hapsApplication(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/telecom|cellular|backhaul|5g/i.test(desc)) return 'civilian_telecom'
  if (/earth[\s-]?obs|surveillance|monitoring/i.test(desc)) return 'commercial_earth_obs'
  if (/isr|military|defense/i.test(desc)) return 'military_isr'
  return 'civilian_telecom'
}

function heatPumpApplication(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/dhw|domestic hot water/i.test(desc)) return 'residential_dhw'
  if (/space heating|heating retrofit/i.test(desc)) return 'commercial_retrofit'
  if (/process heat|industrial/i.test(desc)) return 'industrial_process'
  return 'residential_dhw'
}

function vfApplication(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/leafy greens|lettuce/i.test(desc)) return 'leafy_greens'
  if (/strawberr|berr/i.test(desc)) return 'berries'
  if (/herb/i.test(desc)) return 'herbs'
  return 'leafy_greens'
}

function droneApplication(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/cinematography|film/i.test(desc)) return 'cinematography'
  if (/agricultur|crop|spray/i.test(desc)) return 'agriculture'
  if (/inspection|survey/i.test(desc)) return 'inspection'
  if (/delivery|logistics/i.test(desc)) return 'delivery'
  return 'cinematography'
}

function auvApplication(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/oil|gas|subsea/i.test(desc)) return 'oil_and_gas'
  if (/ocean|research|science/i.test(desc)) return 'ocean_science'
  if (/military|naval/i.test(desc)) return 'naval'
  return 'ocean_science'
}

function bioreactorApplication(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/mammalian|cell culture|monoclonal/i.test(desc)) return 'mammalian_cell_culture'
  if (/microbial|fermentation/i.test(desc)) return 'microbial_fermentation'
  if (/algae/i.test(desc)) return 'algae_cultivation'
  return 'microbial_fermentation'
}

function cgmApplication(_: string | null, _c: ParsedConstraints): string {
  return 'diabetes_management'
}

function edgeAiApplication(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/llm|language model|gpt|llama/i.test(desc)) return 'llm_inference'
  if (/computer vision|cv|image/i.test(desc)) return 'vision_inference'
  if (/recommendation|search/i.test(desc)) return 'recommendation'
  return 'llm_inference'
}

function evChargerApplication(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/public|forecourt|motorway/i.test(desc)) return 'public_dc_fast'
  if (/depot|fleet/i.test(desc)) return 'fleet_depot'
  if (/home|residential/i.test(desc)) return 'home_ac'
  return 'public_dc_fast'
}

// ---------------------------------------------------------------------------
// DISPATCH TABLE — class to detector functions.
// ---------------------------------------------------------------------------

interface ClassDetectors {
  scaleTier: (c: ParsedConstraints) => string | null
  voltageTier: (s: string | null, c: ParsedConstraints) => VoltageTier
  formFactor: (s: string | null, c: ParsedConstraints) => string
  application: (s: string | null, c: ParsedConstraints) => string
  nameplateKwh?: (c: ParsedConstraints) => number | undefined
}

const DETECTORS: Record<string, ClassDetectors> = {
  bess: {
    scaleTier: bessScaleTier,
    voltageTier: bessVoltageTier,
    formFactor: bessFormFactor,
    application: bessApplication,
    nameplateKwh: (c) => {
      const tp = c.target_performance
      if (!tp) return undefined
      const u = String(tp.unit ?? '').toLowerCase()
      const usable = u === 'mwh' ? tp.value * 1000 : u === 'gwh' ? tp.value * 1_000_000 : u === 'wh' ? tp.value / 1000 : tp.value
      return usable / 0.80 // nameplate = usable / DoD
    },
  },
  haps: {
    scaleTier: hapsScaleTier,
    voltageTier: hapsVoltageTier,
    formFactor: hapsFormFactor,
    application: hapsApplication,
  },
  heat_pump_residential: {
    scaleTier: heatPumpScaleTier,
    voltageTier: heatPumpVoltageTier,
    formFactor: heatPumpFormFactor,
    application: heatPumpApplication,
  },
  vertical_farm: {
    scaleTier: vfScaleTier,
    voltageTier: vfVoltageTier,
    formFactor: vfFormFactor,
    application: vfApplication,
  },
  drone: {
    scaleTier: droneScaleTier,
    voltageTier: droneVoltageTier,
    formFactor: droneFormFactor,
    application: droneApplication,
  },
  auv: {
    scaleTier: auvScaleTier,
    voltageTier: auvVoltageTier,
    formFactor: auvFormFactor,
    application: auvApplication,
  },
  bioreactor: {
    scaleTier: bioreactorScaleTier,
    voltageTier: bioreactorVoltageTier,
    formFactor: bioreactorFormFactor,
    application: bioreactorApplication,
  },
  cgm: {
    scaleTier: cgmScaleTier,
    voltageTier: cgmVoltageTier,
    formFactor: cgmFormFactor,
    application: cgmApplication,
  },
  edge_ai: {
    scaleTier: edgeAiScaleTier,
    voltageTier: edgeAiVoltageTier,
    formFactor: edgeAiFormFactor,
    application: edgeAiApplication,
  },
  ev_charger: {
    scaleTier: evChargerScaleTier,
    voltageTier: evChargerVoltageTier,
    formFactor: evChargerFormFactor,
    application: evChargerApplication,
  },
}

// ---------------------------------------------------------------------------
// PUBLIC API
// ---------------------------------------------------------------------------

/**
 * Detect the brief envelope from parsed constraints.
 *
 * Returns null if the envelope cannot be unambiguously determined —
 * the chain should fall back to the LLM Generator path in that case.
 *
 * Pure function. Same input → same output.
 */
export function detectEnvelope(constraints: ParsedConstraints): BriefEnvelope | null {
  const klass = normaliseClass(constraints.product_class)
  if (!klass) return null

  const detectors = DETECTORS[klass]
  if (!detectors) return null // class registered in classifier but no detector

  const scaleTier = detectors.scaleTier(constraints)
  if (!scaleTier) return null // brief constraints insufficient to classify

  const voltageTier = detectors.voltageTier(scaleTier, constraints)
  const formFactor = detectors.formFactor(scaleTier, constraints)
  const application = detectors.application(scaleTier, constraints)
  const nameplateKwh = detectors.nameplateKwh?.(constraints)
  const voltageClassV = constraints.voltage_class_v

  return {
    class: klass,
    scale_tier: scaleTier,
    voltage_tier: voltageTier,
    form_factor: formFactor,
    application,
    nameplate_kwh: nameplateKwh,
    voltage_class_v: voltageClassV,
  }
}

/**
 * Validate that an envelope is well-formed. Returns a list of errors;
 * empty array means the envelope passes.
 */
export function validateEnvelope(env: BriefEnvelope): string[] {
  const errs: string[] = []
  if (!env.class || env.class.length === 0) errs.push('envelope.class is empty')
  if (!env.scale_tier) errs.push('envelope.scale_tier is empty')
  if (!env.voltage_tier) errs.push('envelope.voltage_tier is empty')
  if (!env.form_factor) errs.push('envelope.form_factor is empty')
  if (!env.application) errs.push('envelope.application is empty')
  return errs
}
