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
import {
  findScaleMetric,
  POWER_KW,
  ENERGY_KWH,
  VOLUME_L,
  MASS_KG,
  LENGTH_M,
  AREA_M2,
  HYDROGEN_RATE,
  CO2_CAPTURE_TPY,
  QUBIT_COUNT,
  TEMPERATURE_MK,
  CUBESAT_U,
  ELEMENT_COUNT,
} from './constraint-normaliser'

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
  // ---------------- 2026-05-22 ADDITIONS (15 new classes) ----------------
  // solar_inverter
  solar_inverter: 'solar_inverter',
  pv_inverter: 'solar_inverter',
  photovoltaic_inverter: 'solar_inverter',
  string_inverter: 'solar_inverter',
  central_inverter: 'solar_inverter',
  // wind_turbine
  wind_turbine: 'wind_turbine',
  windmill: 'wind_turbine',
  hawt: 'wind_turbine',
  vawt: 'wind_turbine',
  onshore_wind: 'wind_turbine',
  offshore_wind: 'wind_turbine',
  // h2_electrolyser
  h2_electrolyser: 'h2_electrolyser',
  hydrogen_electrolyser: 'h2_electrolyser',
  pem_electrolyser: 'h2_electrolyser',
  alkaline_electrolyser: 'h2_electrolyser',
  electrolyzer: 'h2_electrolyser',
  // ups_inverter
  ups_inverter: 'ups_inverter',
  ups: 'ups_inverter',
  uninterruptible_power_supply: 'ups_inverter',
  online_ups: 'ups_inverter',
  // 3d_printer_fdm
  '3d_printer_fdm': '3d_printer_fdm',
  fdm_printer: '3d_printer_fdm',
  filament_printer: '3d_printer_fdm',
  desktop_3d_printer: '3d_printer_fdm',
  // cnc_machine
  cnc_machine: 'cnc_machine',
  cnc: 'cnc_machine',
  cnc_mill: 'cnc_machine',
  cnc_router: 'cnc_machine',
  vmc: 'cnc_machine',
  // e_bike
  e_bike: 'e_bike',
  ebike: 'e_bike',
  electric_bike: 'e_bike',
  electric_bicycle: 'e_bike',
  pedelec: 'e_bike',
  // satellite_cubesat
  satellite_cubesat: 'satellite_cubesat',
  cubesat: 'satellite_cubesat',
  '1u_cubesat': 'satellite_cubesat',
  '3u_cubesat': 'satellite_cubesat',
  '6u_cubesat': 'satellite_cubesat',
  // satellite_smallsat
  satellite_smallsat: 'satellite_smallsat',
  smallsat: 'satellite_smallsat',
  smallsatellite: 'satellite_smallsat',
  microsat: 'satellite_smallsat',
  minisatellite: 'satellite_smallsat',
  satellite: 'satellite_smallsat',
  // satellite_geo_comsat
  satellite_geo_comsat: 'satellite_geo_comsat',
  geo_comsat: 'satellite_geo_comsat',
  geostationary_satellite: 'satellite_geo_comsat',
  comsat: 'satellite_geo_comsat',
  geo_satellite: 'satellite_geo_comsat',
  // satellite_interplanetary
  satellite_interplanetary: 'satellite_interplanetary',
  interplanetary_probe: 'satellite_interplanetary',
  deep_space_probe: 'satellite_interplanetary',
  mars_orbiter: 'satellite_interplanetary',
  europa_lander: 'satellite_interplanetary',
  // propulsion_thruster_product
  propulsion_thruster_product: 'propulsion_thruster_product',
  propulsion_thruster: 'propulsion_thruster_product',
  thruster: 'propulsion_thruster_product',
  hall_thruster: 'propulsion_thruster_product',
  ion_thruster: 'propulsion_thruster_product',
  monopropellant_thruster: 'propulsion_thruster_product',
  bipropellant_thruster: 'propulsion_thruster_product',
  // ground_station
  ground_station: 'ground_station',
  earth_station: 'ground_station',
  satellite_ground_terminal: 'ground_station',
  vsat: 'ground_station',
  // ventilator
  ventilator: 'ventilator',
  medical_ventilator: 'ventilator',
  icu_ventilator: 'ventilator',
  mechanical_ventilator: 'ventilator',
  // dialysis_machine
  dialysis_machine: 'dialysis_machine',
  dialyser: 'dialysis_machine',
  hemodialysis_machine: 'dialysis_machine',
  haemodialysis_machine: 'dialysis_machine',
  // ---------------- 2026-05-22 PRIORITY-CLASS ADDITIONS (10 new classes) -----
  // eVTOL
  evtol: 'evtol',
  e_vtol: 'evtol',
  urban_air_mobility: 'evtol',
  uam: 'evtol',
  passenger_evtol: 'evtol',
  tiltrotor_evtol: 'evtol',
  // Quantum computer (superconducting)
  quantum_computer: 'quantum_computer',
  qpu: 'quantum_computer',
  superconducting_qpu: 'quantum_computer',
  superconducting_quantum_computer: 'quantum_computer',
  transmon_qpu: 'quantum_computer',
  // Cryostat / dilution refrigerator
  cryostat: 'cryostat',
  dilution_fridge: 'cryostat',
  dilution_refrigerator: 'cryostat',
  pulse_tube_cryostat: 'cryostat',
  // FSO (free-space optical comms)
  fso: 'fso',
  free_space_optical: 'fso',
  laser_comms_terminal: 'fso',
  optical_inter_satellite_link: 'fso',
  isl_terminal: 'fso',
  // Phased-array RF antenna
  phased_array: 'phased_array',
  phased_array_antenna: 'phased_array',
  beam_forming_antenna: 'phased_array',
  active_electronically_scanned_array: 'phased_array',
  aesa: 'phased_array',
  flat_panel_satcom_terminal: 'phased_array',
  // Solid-state battery
  solid_state_battery: 'solid_state_battery',
  ssb: 'solid_state_battery',
  li_metal_battery: 'solid_state_battery',
  solid_state_cell: 'solid_state_battery',
  // PEMFC
  pemfc: 'pemfc',
  fuel_cell: 'pemfc',
  hydrogen_fuel_cell: 'pemfc',
  proton_exchange_membrane_fuel_cell: 'pemfc',
  pem_fuel_cell: 'pemfc',
  // SMR
  smr: 'smr',
  micro_reactor: 'smr',
  small_modular_reactor: 'smr',
  micro_smr: 'smr',
  // Humanoid robot
  humanoid: 'humanoid',
  biped_robot: 'humanoid',
  humanoid_robot: 'humanoid',
  general_purpose_humanoid: 'humanoid',
  // DAC
  dac: 'dac',
  direct_air_capture: 'dac',
  atmospheric_co2_capture: 'dac',
  co2_air_capture: 'dac',
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
  // 2026-05-23 Normaliser refactor (Task #66): BESS briefs occasionally pick
  // C-rate, cycle life, or power (kW) as target_performance instead of energy
  // capacity. Normaliser falls back to "nameplate / usable / energy capacity"
  // phrases. Each regex captures (value, unit).
  const numPat = '(\\d{1,4}(?:,\\d{3})*|\\d{1,7}(?:\\.\\d+)?)'
  const unitPat = '(kwh|mwh|gwh|wh)'
  const result = findScaleMetric(c, {
    family: ENERGY_KWH,
    desc_regexes: [
      new RegExp(`(?:nameplate|usable|energy|rated)\\s+capacity[\\s:]{0,8}${numPat}\\s*${unitPat}\\b`, 'i'),
      new RegExp(`${numPat}\\s*${unitPat}\\s*(?:bess|battery|energy\\s+storage|ess)`, 'i'),
      new RegExp(`${numPat}\\s*${unitPat}\\b[^a-z]{0,30}(?:nameplate|usable|capacity)`, 'i'),
    ],
  })
  if (!result.found) return null
  const kwh = result.value
  if (kwh <= 30) return 'residential'
  if (kwh <= 200) return 'light_commercial'
  if (kwh <= 2000) return 'commercial'
  if (kwh <= 20000) return 'utility_containerised'
  if (kwh <= 500000) return 'utility_farm'
  return 'grid_scale'
}

function hapsScaleTier(c: ParsedConstraints): string | null {
  // 2026-05-23 Normaliser refactor (P1-3): HAPS briefs occasionally pick
  // endurance (hours), payload mass (kg), or service ceiling (m) as
  // target_performance instead of wingspan. Normaliser falls back to
  // "X-metre wingspan", "wingspan: X m". Each regex captures (value, unit).
  const numPat = '(\\d{1,3}(?:,\\d{3})*|\\d{1,3}(?:\\.\\d+)?)'
  const unitPat = '(m|metres?|meters?|ft|feet|km|kilometres?|kilometers?)'
  const result = findScaleMetric(c, {
    family: LENGTH_M,
    desc_regexes: [
      // Pattern 1: "60-metre wingspan", "60 m wingspan"
      new RegExp(`${numPat}\\s*-?\\s*${unitPat}\\s*[-\\s]?\\s*wingspan`, 'i'),
      // Pattern 2: "wingspan: 60 m", "wingspan of 60 metres"
      new RegExp(`wingspan[\\s:.\\-of]{0,12}${numPat}\\s*${unitPat}\\b`, 'i'),
      // Pattern 3: "X metre span" (HAPS-context generic)
      new RegExp(`${numPat}\\s*${unitPat}\\s+span\\b`, 'i'),
    ],
  })
  let span: number | null = result.found ? result.value : null
  // Envelope-dimensions fallback — width in mm → m
  if (span == null) {
    const envW = c.max_dimensions_mm?.w ? c.max_dimensions_mm.w / 1000 : null
    span = envW
  }
  if (!span) return null
  if (span < 25) return 'small'
  if (span <= 60) return 'medium'
  return 'large'
}

function heatPumpScaleTier(c: ParsedConstraints): string | null {
  // 2026-05-23 Normaliser refactor (Task #66): heat-pump briefs commonly
  // compete kW heat output with SCOP/COP (dimensionless ratio) and refrigerant
  // mass (kg). When parser picks SCOP/refrigerant as target_performance,
  // single-field detectors fail. Normaliser scans for explicit heat-output
  // phrases. Each regex has 2 capture groups: (value, unit).
  const numPat = '(\\d{1,3}(?:,\\d{3})*|\\d{1,4}(?:\\.\\d+)?)'
  const unitPat = '(kw|kilowatt[s]?|kwt|kwth|mw|megawatt[s]?|w|watt[s]?)'
  const result = findScaleMetric(c, {
    family: POWER_KW,
    desc_regexes: [
      // Pattern 1: "Heat output: 12 kW", "thermal capacity: 12 kW"
      new RegExp(`(?:heat(?:ing)?\\s+output|thermal\\s+capacity|rated\\s+(?:heating\\s+)?capacity|nominal\\s+capacity)[\\s:]{0,8}${numPat}\\s*${unitPat}\\b`, 'i'),
      // Pattern 2: "12 kW heat output"
      new RegExp(`${numPat}\\s*${unitPat}\\s*(?:heat|thermal|heating|output)`, 'i'),
      // Pattern 3: "12 kW air-source heat pump"
      new RegExp(`${numPat}\\s*${unitPat}\\b[^a-z]{0,30}(?:heat[\\s-]?pump|monobloc|split|ashp|gshp)`, 'i'),
    ],
  })
  if (!result.found) return null
  const kw = result.value
  if (kw <= 12) return 'residential'
  if (kw <= 30) return 'light_commercial'
  if (kw <= 100) return 'commercial'
  return 'industrial'
}

function vfScaleTier(c: ParsedConstraints): string | null {
  // 2026-05-23 Normaliser refactor (P1-3): Vertical-farm briefs may pick
  // yield (kg/yr), light intensity (PPFD), or rack count as target_performance
  // instead of canopy area. Normaliser falls back to "X m² canopy", "canopy
  // area: X m²". Each regex captures (value, unit).
  const numPat = '(\\d{1,4}(?:,\\d{3})*|\\d{1,5}(?:\\.\\d+)?)'
  const unitPat = '(m2|m²|sqm|squaremetres?|squaremeters?|ft2|ft²|sqft|hectare|hectares|ha)'
  const result = findScaleMetric(c, {
    family: AREA_M2,
    desc_regexes: [
      // Pattern 1: "200 m² canopy"
      new RegExp(`${numPat}\\s*${unitPat}\\s+canopy`, 'i'),
      // Pattern 2: "canopy area: 200 m²"
      new RegExp(`canopy[\\s\\w]{0,30}?${numPat}\\s*${unitPat}\\b`, 'i'),
      // Pattern 3: "growing area X m²", "cultivation area X m²"
      new RegExp(`(?:growing|cultivation|grow|farm)\\s+area[\\s:]{0,5}${numPat}\\s*${unitPat}\\b`, 'i'),
    ],
  })
  if (!result.found) return 'commercial' // default container-scale
  const area = result.value
  if (area < 30) return 'micro'
  if (area <= 300) return 'commercial'
  return 'industrial'
}

function droneScaleTier(c: ParsedConstraints): string | null {
  // 2026-05-23 Normaliser refactor (P1-3): drone briefs may declare mass via
  // target_performance ("payload 2 kg"), max_mass_kg, or prose ("25 kg MTOW").
  // Normaliser scans all three. Each desc regex captures (value, unit).
  const numPat = '(\\d{1,4}(?:,\\d{3})*|\\d{1,5}(?:\\.\\d+)?)'
  const unitPat = '(kg|kilogram[s]?|kilo[s]?|g|gram[s]?|lb|lbs|pound[s]?|t|ton[s]?|tonne[s]?)'
  const result = findScaleMetric(c, {
    family: MASS_KG,
    extra_field_keys: ['max_mass_kg'],
    desc_regexes: [
      // Pattern 1: "MTOW: 25 kg", "max take-off weight: 25 kg"
      new RegExp(`(?:mtow|max(?:imum)?[\\s-]?(?:take[\\s-]?off)?[\\s-]?(?:weight|mass)|all[\\s-]?up[\\s-]?weight|auw)[\\s:]{0,8}${numPat}\\s*${unitPat}\\b`, 'i'),
      // Pattern 2: "25 kg drone/quadcopter/multirotor/UAS"
      new RegExp(`${numPat}\\s*${unitPat}\\s+(?:drone|quadcopter|multirotor|hexacopter|octocopter|uas|uav|aircraft)`, 'i'),
      // Pattern 3: "payload: 25 kg"
      new RegExp(`payload[\\s:]{0,5}${numPat}\\s*${unitPat}\\b`, 'i'),
    ],
  })
  if (!result.found) return null
  const mass = result.value
  if (mass <= 2) return 'consumer'
  if (mass <= 25) return 'commercial'
  if (mass <= 150) return 'industrial'
  return 'heavy_lift'
}

function auvScaleTier(c: ParsedConstraints): string | null {
  // 2026-05-23 Normaliser refactor (P1-3): AUV briefs may pick endurance
  // (hours), payload (kg), or vehicle length (m) as target_performance
  // instead of operating depth. Normaliser scans for "depth: X m", "X m
  // depth", "diving to X m" with comma-tolerant digit groups. Each regex
  // captures (value, unit) so kilometre / feet briefs convert too.
  const numPat = '(\\d{1,3}(?:,\\d{3})*|\\d{1,5}(?:\\.\\d+)?)'
  const unitPat = '(m|metres?|meters?|ft|feet|km|kilometres?|kilometers?)'
  const result = findScaleMetric(c, {
    family: LENGTH_M,
    desc_regexes: [
      // Pattern 1: "depth: 1,500 m", "depth of 1500 metres"
      new RegExp(`depth[\\s:of]{0,8}${numPat}\\s*${unitPat}\\b`, 'i'),
      // Pattern 2: "1500 m depth", "1500 m operating"
      new RegExp(`${numPat}\\s*${unitPat}\\s+(?:depth|operating|design|rating|rated)`, 'i'),
      // Pattern 3: "diving to 1500 m", "rated to 1500 m"
      new RegExp(`(?:diving|rated|design|down|going|operates?)\\s+to\\s+${numPat}\\s*${unitPat}\\b`, 'i'),
    ],
  })
  if (!result.found) return null
  const depth = result.value
  if (depth <= 100) return 'shallow'
  if (depth <= 1000) return 'mid_water'
  if (depth <= 3000) return 'deep'
  return 'full_ocean_depth'
}

function bioreactorScaleTier(c: ParsedConstraints): string | null {
  // 2026-05-23 Normaliser refactor (Task #66): bioreactor brief parser
  // routinely picks a non-volume metric (kLa hr⁻¹, ramp rate, etc.) as
  // target_performance. The Normaliser scans target_performance, then
  // additional_constraints, then product_description.
  //
  // Each desc regex has 2 capture groups: (value, unit). The Normaliser
  // calls convertToCanonical on (value, unit) — so the regex can match
  // across L / m³ / ml without the detector knowing the conversion.
  const numPat = '(\\d{1,3}(?:,\\d{3})*|\\d{1,5}(?:\\.\\d+)?)'
  const unitPat = '(l|litres?|liters?|ltr|ml|m3|m³)'
  const result = findScaleMetric(c, {
    family: VOLUME_L,
    desc_regexes: [
      // Pattern 1: "Nominal/working/rated volume: 200 L"
      new RegExp(`(?:working|nominal|design|rated|reactor|fermenter)\\s+volume[\\s:]{0,5}${numPat}\\s*${unitPat}\\b`, 'i'),
      // Pattern 2: "200 L bioreactor/fermenter/reactor" with up to 30 chars of
      // padding between unit and keyword (handles "200 L production fermenter")
      new RegExp(`${numPat}[\\s-]*${unitPat}\\b[^.,;]{0,30}(?:bioreactor|fermenter|sub|reactor|vessel|tank|sub[\\s-]?cultivation)`, 'i'),
      // Pattern 3: "(numeric)-litre" hyphenated form ("200-litre reactor")
      new RegExp(`${numPat}\\s*-\\s*(litres?|liters?|l|ltr|ml|m3|m³)\\b`, 'i'),
    ],
  })
  if (!result.found) return null
  const l = result.value
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
  // 2026-05-23 Normaliser refactor (Task #66): EV charger briefs may pick
  // efficiency, voltage, or current as target_performance. Normaliser falls
  // back to "output power", "rated power", "350 kW DC fast charger" prose.
  const numPat = '(\\d{1,4}(?:,\\d{3})*|\\d{1,5}(?:\\.\\d+)?)'
  const unitPat = '(kw|kilowatt[s]?|mw|megawatt[s]?|w|watt[s]?)'
  const result = findScaleMetric(c, {
    family: POWER_KW,
    desc_regexes: [
      new RegExp(`(?:output|rated|max(?:imum)?|peak|nominal)\\s+power[\\s:]{0,8}${numPat}\\s*${unitPat}\\b`, 'i'),
      new RegExp(`${numPat}\\s*${unitPat}\\s+(?:dc\\s+fast|ultra[\\s-]?(?:rapid|fast)|charger|charge[\\s-]?point)`, 'i'),
      new RegExp(`${numPat}\\s*${unitPat}\\b[^a-z]{0,30}(?:ev[\\s-]?charger|chargepoint|forecourt|kiosk|pedestal)`, 'i'),
    ],
  })
  if (!result.found) return null
  const kw = result.value
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
// 2026-05-22 ADDITIONS — detectors for 15 new classes
// (solar_inverter, wind_turbine, h2_electrolyser, ups_inverter,
//  3d_printer_fdm, cnc_machine, e_bike, satellite_cubesat / smallsat /
//  geo_comsat / interplanetary, propulsion_thruster_product, ground_station,
//  ventilator, dialysis_machine)
// ---------------------------------------------------------------------------

function powerKwFromTp(c: ParsedConstraints, dflt: number): number {
  const tp = c.target_performance
  if (!tp) return dflt
  const u = String(tp.unit ?? '').toLowerCase()
  if (u === 'w') return tp.value / 1000
  if (u === 'mw') return tp.value * 1000
  if (u === 'kw') return tp.value
  return dflt
}

/**
 * 2026-05-23 Normaliser refactor (Task #66): generic power-kW helper that
 * uses the Normaliser to scan target_performance, additional_constraints,
 * and product_description. Detector callers pass class-specific keyword
 * patterns to bound the regex (e.g. 'turbine|generator' for wind,
 * 'inverter|pv' for solar).
 *
 * Returns kW or null. Use for classes that MUST have a scale-determining
 * power metric; for classes with a sensible default tier (e.g. 'commercial'),
 * the caller can substitute the default when null is returned.
 */
function powerKwViaNormaliser(c: ParsedConstraints, classKeywordPat: string): number | null {
  const numPat = '(\\d{1,4}(?:,\\d{3})*|\\d{1,5}(?:\\.\\d+)?)'
  const unitPat = '(kw|kilowatt[s]?|mw|megawatt[s]?|gw|gigawatt[s]?|w|watt[s]?)'
  const result = findScaleMetric(c, {
    family: POWER_KW,
    desc_regexes: [
      new RegExp(`(?:rated|nominal|output|peak|continuous|nameplate)\\s+(?:power|capacity)[\\s:]{0,8}${numPat}\\s*${unitPat}\\b`, 'i'),
      new RegExp(`${numPat}\\s*${unitPat}\\s+(?:${classKeywordPat})`, 'i'),
      new RegExp(`${numPat}\\s*${unitPat}\\b[^a-z]{0,30}(?:${classKeywordPat})`, 'i'),
    ],
  })
  return result.found ? result.value : null
}

// solar_inverter ----------------------------------------------
function solarInverterScaleTier(c: ParsedConstraints): string | null {
  // 2026-05-23 Normaliser refactor (Task #66): solar-inverter briefs may pick
  // efficiency (%), DC voltage, or string current as target_performance.
  // Normaliser falls back to "rated AC output", "MVA", "inverter capacity".
  let kw = powerKwFromTp(c, NaN)
  if (Number.isNaN(kw)) {
    const viaDesc = powerKwViaNormaliser(c, 'inverter|pv|photovoltaic|string|central|solar')
    if (viaDesc !== null) kw = viaDesc
  }
  if (Number.isNaN(kw)) return 'commercial' // best-effort default kept for back-compat
  if (kw <= 10) return 'residential'
  if (kw <= 100) return 'commercial'
  if (kw <= 1000) return 'utility'
  return 'utility_central'
}
function solarInverterVoltageTier(_: string | null, c: ParsedConstraints): VoltageTier {
  if (c.voltage_class_v) return classifyVoltage(c.voltage_class_v)
  return 'low'
}
function solarInverterFormFactor(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/string/i.test(desc)) return 'string'
  if (/central/i.test(desc)) return 'central'
  if (/micro/i.test(desc)) return 'microinverter'
  return 'string'
}
function solarInverterApplication(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/rooftop|residential/i.test(desc)) return 'rooftop_residential'
  if (/utility/i.test(desc)) return 'utility_pv'
  if (/commercial/i.test(desc)) return 'commercial_rooftop'
  return 'commercial_rooftop'
}

// wind_turbine ------------------------------------------------
function windTurbineScaleTier(c: ParsedConstraints): string | null {
  // 2026-05-23 Normaliser refactor (Task #66): wind-turbine briefs may pick
  // swept area (m²), rotor diameter (m), or capacity factor (%) as
  // target_performance. Normaliser falls back to "rated power", "X MW turbine".
  let kw = powerKwFromTp(c, NaN)
  if (Number.isNaN(kw)) {
    const viaDesc = powerKwViaNormaliser(c, 'turbine|wind|generator|nacelle|hawt|vawt')
    if (viaDesc !== null) kw = viaDesc
  }
  if (Number.isNaN(kw)) return 'onshore_medium'
  if (kw <= 10) return 'micro'
  if (kw <= 100) return 'small'
  if (kw <= 1000) return 'medium'
  if (kw <= 5000) return 'large_onshore'
  return 'offshore'
}
function windTurbineVoltageTier(_: string | null, c: ParsedConstraints): VoltageTier {
  if (c.voltage_class_v) return classifyVoltage(c.voltage_class_v)
  return 'medium'
}
function windTurbineFormFactor(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/vawt|vertical[\s-]?axis/i.test(desc)) return 'vawt'
  return 'hawt'
}
function windTurbineApplication(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/offshore|marine/i.test(desc)) return 'offshore'
  return 'onshore'
}

// h2_electrolyser ---------------------------------------------
function h2ElectrolyserScaleTier(c: ParsedConstraints): string | null {
  // 2026-05-23 Normaliser refactor (Task #66): H2 electrolyser briefs compete
  // electrical input (kW/MW) with hydrogen output rate (Nm³/hr, kg H2/hr,
  // t/day). The Normaliser tries power first (2-capture group regex handles
  // kW vs MW vs W via unit conversion), then hydrogen rate (converted to
  // electrical kW at industry-typical 5.0 kWh/Nm³ for PEM/alkaline).
  const numPat = '(\\d{1,3}(?:,\\d{3})*|\\d{1,5}(?:\\.\\d+)?)'
  const powerUnitPat = '(kw|kilowatt[s]?|mw|megawatt[s]?|w|watt[s]?)'

  // Try electrical input first (most common scale metric)
  let result = findScaleMetric(c, {
    family: POWER_KW,
    desc_regexes: [
      // Pattern 1: "Electrical input: 5 MW", "Rated power: 5 MW"
      new RegExp(`(?:electrical|stack|rated|input)\\s+(?:input|power|capacity)[\\s:]{0,8}${numPat}\\s*${powerUnitPat}\\b`, 'i'),
      // Pattern 2: "5 MW PEM electrolyser"
      new RegExp(`${numPat}\\s*${powerUnitPat}\\s+(?:pem|alkaline|electrolyser|electrolyzer|stack|soec)`, 'i'),
      // Pattern 3: "electrolyser of 5 MW" / "electrolyser (5 MW)"
      new RegExp(`(?:electrolyser|electrolyzer)[\\s()of:]*${numPat}\\s*${powerUnitPat}`, 'i'),
    ],
  })

  // Fall back to hydrogen production rate → derive kW at industry-typical
  // 5.0 kWh/Nm³ H2 (PEM/alkaline benchmark, IEA 2023 Global H2 Review).
  if (!result.found) {
    const h2Result = findScaleMetric(c, {
      family: HYDROGEN_RATE,
      desc_regexes: [
        // Pattern 1: "Hydrogen output: 1000 Nm³/hr"
        new RegExp(`(?:hydrogen|h2)\\s+(?:production|output|rate|flow)[\\s:]{0,8}${numPat}\\s*(nm3\\s*\\/?\\s*hr?|nm³\\s*\\/?\\s*hr?)`, 'i'),
        // Pattern 2: "1000 Nm³/hr PEM electrolyser"
        new RegExp(`${numPat}\\s*(nm3\\s*\\/?\\s*hr?|nm³\\s*\\/?\\s*hr?)\\s*(?:pem|alkaline|electrolyser|electrolyzer)`, 'i'),
        // Pattern 3: "Nm³/hr" with any context
        new RegExp(`${numPat}\\s*(nm3\\s*\\/?\\s*hr?|nm³\\s*\\/?\\s*hr?)`, 'i'),
      ],
    })
    if (h2Result.found) {
      // Industry benchmark: PEM stack consumes ~5.0 kWh per Nm³ H2 produced
      const kwEquivalent = h2Result.value * 5.0
      result = { ...h2Result, value: kwEquivalent, canonical_unit: 'kw' }
    }
  }

  if (!result.found) return null
  const kw = result.value
  if (kw <= 100) return 'lab'
  if (kw <= 1000) return 'commercial'
  if (kw <= 10000) return 'industrial'
  return 'utility_scale'
}
function h2ElectrolyserVoltageTier(_: string | null, c: ParsedConstraints): VoltageTier {
  if (c.voltage_class_v) return classifyVoltage(c.voltage_class_v)
  return 'low'
}
function h2ElectrolyserFormFactor(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/alkaline/i.test(desc)) return 'alkaline'
  if (/soec|solid[\s-]?oxide/i.test(desc)) return 'soec'
  return 'pem'
}
function h2ElectrolyserApplication(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/refinery|industrial/i.test(desc)) return 'industrial_feedstock'
  if (/mobility|fuel cell vehicle/i.test(desc)) return 'mobility'
  return 'green_hydrogen_production'
}

// ups_inverter ------------------------------------------------
function upsInverterScaleTier(c: ParsedConstraints): string | null {
  // 2026-05-23 Normaliser refactor (Task #66): UPS briefs may pick autonomy
  // time (minutes) or efficiency (%) as target_performance. Normaliser falls
  // back to "rated power", "X kVA UPS".
  let kw = powerKwFromTp(c, NaN)
  if (Number.isNaN(kw)) {
    const viaDesc = powerKwViaNormaliser(c, 'ups|uninterruptible|online|line[\\s-]?interactive|standby|battery[\\s-]?backup')
    if (viaDesc !== null) kw = viaDesc
  }
  if (Number.isNaN(kw)) return 'commercial'
  if (kw <= 3) return 'desktop'
  if (kw <= 20) return 'rack'
  if (kw <= 200) return 'commercial'
  return 'data_centre'
}
function upsInverterVoltageTier(_: string | null, c: ParsedConstraints): VoltageTier {
  if (c.voltage_class_v) return classifyVoltage(c.voltage_class_v)
  return 'low'
}
function upsInverterFormFactor(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/online|double[\s-]?conversion/i.test(desc)) return 'online_double_conversion'
  if (/line[\s-]?interactive/i.test(desc)) return 'line_interactive'
  return 'online_double_conversion'
}
function upsInverterApplication(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/data[\s-]?cent/i.test(desc)) return 'data_centre'
  if (/medical/i.test(desc)) return 'medical_backup'
  if (/telecom/i.test(desc)) return 'telecom'
  return 'commercial_backup'
}

// 3d_printer_fdm ----------------------------------------------
function printerFdmScaleTier(c: ParsedConstraints): string | null {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/industrial|production/i.test(desc)) return 'industrial'
  if (/professional|professional/i.test(desc)) return 'professional'
  return 'desktop'
}
function printerFdmVoltageTier(_: string | null, _c: ParsedConstraints): VoltageTier {
  return 'extra_low'
}
function printerFdmFormFactor(_: string | null, _c: ParsedConstraints): string {
  return 'cartesian'
}
function printerFdmApplication(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/prototyping/i.test(desc)) return 'rapid_prototyping'
  if (/production/i.test(desc)) return 'short_run_production'
  return 'rapid_prototyping'
}

// cnc_machine -------------------------------------------------
function cncMachineScaleTier(c: ParsedConstraints): string | null {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/5[\s-]?axis/i.test(desc)) return 'milling_5axis'
  if (/4[\s-]?axis/i.test(desc)) return 'milling_4axis'
  if (/lathe|turning/i.test(desc)) return 'turning'
  return 'milling_3axis'
}
function cncMachineVoltageTier(_: string | null, c: ParsedConstraints): VoltageTier {
  if (c.voltage_class_v) return classifyVoltage(c.voltage_class_v)
  return 'low'
}
function cncMachineFormFactor(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/gantry/i.test(desc)) return 'gantry'
  if (/bench/i.test(desc)) return 'benchtop'
  return 'vertical_machining_centre'
}
function cncMachineApplication(_: string | null, _c: ParsedConstraints): string {
  return 'metal_cutting'
}

// e_bike ------------------------------------------------------
function eBikeScaleTier(c: ParsedConstraints): string | null {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/cargo/i.test(desc)) return 'cargo'
  if (/mountain|emtb/i.test(desc)) return 'mountain'
  if (/road|race/i.test(desc)) return 'road'
  return 'commuter'
}
function eBikeVoltageTier(_: string | null, _c: ParsedConstraints): VoltageTier {
  return 'extra_low'
}
function eBikeFormFactor(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/hub[\s-]?motor/i.test(desc)) return 'hub_motor'
  if (/mid[\s-]?drive/i.test(desc)) return 'mid_drive'
  return 'mid_drive'
}
function eBikeApplication(_: string | null, _c: ParsedConstraints): string {
  return 'urban_transport'
}

// satellite_cubesat -------------------------------------------
function cubesatScaleTier(c: ParsedConstraints): string | null {
  // 2026-05-23 Normaliser refactor (P1-3): CubeSat U-size lives in
  // target_performance (e.g. {value: 6, unit: 'u'}) or in prose. Each desc
  // regex captures (value, unit). Family is dimensionless count (CUBESAT_U).
  const numPat = '(\\d{1,3})'
  const unitPat = '(u|unit|units|cubesat-u|cubesatu)'
  const result = findScaleMetric(c, {
    family: CUBESAT_U,
    desc_regexes: [
      // Pattern 1: "6U cubesat", "12-U platform"
      new RegExp(`${numPat}\\s*-?\\s*${unitPat}\\b`, 'i'),
      // Pattern 2: "cubesat 6U", "platform: 12U"
      new RegExp(`(?:cubesat|platform|spacecraft|bus)[\\s:]{0,5}${numPat}\\s*${unitPat}\\b`, 'i'),
    ],
  })
  const u = result.found ? result.value : null
  if (u === null) return '3u'
  if (u <= 1) return '1u'
  if (u <= 3) return '3u'
  if (u <= 6) return '6u'
  return '12u'
}
function cubesatVoltageTier(_: string | null, _c: ParsedConstraints): VoltageTier {
  return 'extra_low'
}
function cubesatFormFactor(_: string | null, _c: ParsedConstraints): string {
  return 'cubesat'
}
function cubesatApplication(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/earth[\s-]?obs|imaging/i.test(desc)) return 'earth_observation'
  if (/iot|comm/i.test(desc)) return 'iot_comms'
  if (/science|research/i.test(desc)) return 'research_science'
  return 'earth_observation'
}

// satellite_smallsat ------------------------------------------
function smallsatScaleTier(c: ParsedConstraints): string | null {
  // 2026-05-23 Normaliser refactor (P1-3): smallsat mass may live in
  // max_mass_kg, target_performance, or prose ("X kg satellite"). Normaliser
  // scans all sources. Each desc regex captures (value, unit).
  const numPat = '(\\d{1,4}(?:,\\d{3})*|\\d{1,5}(?:\\.\\d+)?)'
  const unitPat = '(kg|kilogram[s]?|kilo[s]?|g|gram[s]?|lb|lbs|pound[s]?|t|ton[s]?|tonne[s]?)'
  const result = findScaleMetric(c, {
    family: MASS_KG,
    extra_field_keys: ['max_mass_kg'],
    desc_regexes: [
      // Pattern 1: "wet mass: 80 kg", "dry mass: 50 kg"
      new RegExp(`(?:wet|dry|launch|spacecraft|satellite)\\s+mass[\\s:]{0,5}${numPat}\\s*${unitPat}\\b`, 'i'),
      // Pattern 2: "80 kg microsat / smallsat / spacecraft / satellite"
      new RegExp(`${numPat}\\s*${unitPat}\\s+(?:microsat|smallsat|minisat|satellite|spacecraft|cubesat|payload)`, 'i'),
    ],
  })
  if (!result.found) return 'smallsat'
  const mass = result.value
  if (mass <= 10) return 'microsat'
  if (mass <= 100) return 'minisat'
  return 'smallsat'
}
function smallsatVoltageTier(_: string | null, _c: ParsedConstraints): VoltageTier {
  return 'low'
}
function smallsatFormFactor(_: string | null, _c: ParsedConstraints): string {
  return 'bus_panel'
}
function smallsatApplication(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/sar|radar/i.test(desc)) return 'sar_imaging'
  if (/earth[\s-]?obs/i.test(desc)) return 'earth_observation'
  if (/comm|broadcast/i.test(desc)) return 'comms'
  return 'earth_observation'
}

// satellite_geo_comsat ----------------------------------------
function geoComsatScaleTier(c: ParsedConstraints): string | null {
  // 2026-05-23 Normaliser refactor (P1-3): GEO-comsat mass spans 1-7 tonnes;
  // briefs may declare via max_mass_kg, target_performance ({value, unit:'kg'}),
  // or prose ("4500 kg launch mass"). Each desc regex captures (value, unit).
  const numPat = '(\\d{1,4}(?:,\\d{3})*|\\d{1,6}(?:\\.\\d+)?)'
  const unitPat = '(kg|kilogram[s]?|kilo[s]?|g|gram[s]?|lb|lbs|pound[s]?|t|ton[s]?|tonne[s]?)'
  const result = findScaleMetric(c, {
    family: MASS_KG,
    extra_field_keys: ['max_mass_kg'],
    desc_regexes: [
      // Pattern 1: "launch mass: 4500 kg", "wet mass: 4500 kg"
      new RegExp(`(?:wet|dry|launch|spacecraft|satellite|gtow|bol)\\s+mass[\\s:]{0,5}${numPat}\\s*${unitPat}\\b`, 'i'),
      // Pattern 2: "4500 kg comsat / geo satellite / spacecraft"
      new RegExp(`${numPat}\\s*${unitPat}\\s+(?:comsat|geo|satellite|spacecraft|payload|bus)`, 'i'),
    ],
  })
  if (!result.found) return 'geo_medium'
  const mass = result.value
  if (mass <= 1500) return 'geo_small'
  if (mass <= 4000) return 'geo_medium'
  return 'geo_heavy'
}
function geoComsatVoltageTier(_: string | null, _c: ParsedConstraints): VoltageTier {
  return 'low'
}
function geoComsatFormFactor(_: string | null, _c: ParsedConstraints): string {
  return 'geo_bus'
}
function geoComsatApplication(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/broadcast|direct[\s-]?to[\s-]?home/i.test(desc)) return 'dth_broadcast'
  if (/broadband|hts|vhts/i.test(desc)) return 'hts_broadband'
  return 'fixed_satellite_service'
}

// satellite_interplanetary ------------------------------------
function interplanetaryScaleTier(c: ParsedConstraints): string | null {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/lander|rover/i.test(desc)) return 'surface_lander'
  if (/flyby/i.test(desc)) return 'flyby_probe'
  return 'orbiter'
}
function interplanetaryVoltageTier(_: string | null, _c: ParsedConstraints): VoltageTier {
  return 'low'
}
function interplanetaryFormFactor(_: string | null, _c: ParsedConstraints): string {
  return 'deep_space_bus'
}
function interplanetaryApplication(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/mars/i.test(desc)) return 'mars_mission'
  if (/europa|jovian/i.test(desc)) return 'jovian_mission'
  if (/asteroid/i.test(desc)) return 'asteroid_mission'
  return 'planetary_exploration'
}

// propulsion_thruster_product ---------------------------------
function thrusterScaleTier(c: ParsedConstraints): string | null {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/cold[\s-]?gas/i.test(desc)) return 'cold_gas'
  if (/monoprop/i.test(desc)) return 'monopropellant'
  if (/biprop|bipropellant/i.test(desc)) return 'bipropellant'
  if (/hall|ion|electric/i.test(desc)) return 'electric'
  return 'monopropellant'
}
function thrusterVoltageTier(_: string | null, _c: ParsedConstraints): VoltageTier {
  return 'low'
}
function thrusterFormFactor(_: string | null, _c: ParsedConstraints): string {
  return 'component'
}
function thrusterApplication(_: string | null, _c: ParsedConstraints): string {
  return 'attitude_or_station_keeping'
}

// ground_station ---------------------------------------------
function groundStationScaleTier(c: ParsedConstraints): string | null {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/large[\s-]?aperture|teleport/i.test(desc)) return 'teleport'
  if (/medium|mid[\s-]?size/i.test(desc)) return 'medium_aperture'
  return 'vsat'
}
function groundStationVoltageTier(_: string | null, _c: ParsedConstraints): VoltageTier {
  return 'low'
}
function groundStationFormFactor(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/portable|man[\s-]?portable/i.test(desc)) return 'portable'
  if (/mobile|drive[\s-]?away/i.test(desc)) return 'mobile'
  return 'fixed'
}
function groundStationApplication(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/telemetry|tracking|tt&c/i.test(desc)) return 'ttc'
  if (/broadcast/i.test(desc)) return 'broadcast'
  return 'data_downlink'
}

// ventilator -------------------------------------------------
function ventilatorScaleTier(c: ParsedConstraints): string | null {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/icu|critical care/i.test(desc)) return 'icu'
  if (/transport|portable|ambulance/i.test(desc)) return 'transport'
  if (/neonatal/i.test(desc)) return 'neonatal'
  return 'icu'
}
function ventilatorVoltageTier(_: string | null, _c: ParsedConstraints): VoltageTier {
  return 'low'
}
function ventilatorFormFactor(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/portable|handheld/i.test(desc)) return 'portable'
  return 'trolley_mounted'
}
function ventilatorApplication(_: string | null, _c: ParsedConstraints): string {
  return 'mechanical_ventilation'
}

// dialysis_machine -------------------------------------------
function dialysisScaleTier(c: ParsedConstraints): string | null {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/home|wearable/i.test(desc)) return 'home'
  if (/peritoneal/i.test(desc)) return 'peritoneal'
  return 'hospital'
}
function dialysisVoltageTier(_: string | null, _c: ParsedConstraints): VoltageTier {
  return 'low'
}
function dialysisFormFactor(_: string | null, _c: ParsedConstraints): string {
  return 'trolley_mounted'
}
function dialysisApplication(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/peritoneal/i.test(desc)) return 'peritoneal_dialysis'
  return 'hemodialysis'
}

// ---------------------------------------------------------------------------
// 2026-05-22 PRIORITY-CLASS ADDITIONS — 10 new classes
// ---------------------------------------------------------------------------

// evtol -------------------------------------------------------
function evtolScaleTier(c: ParsedConstraints): string | null {
  // 2026-05-23 Normaliser refactor (P1-3): eVTOL briefs declare mass via
  // max_mass_kg, target_performance ({value, unit:'kg'}), or prose ("2500 kg
  // MTOW"). Normaliser scans all three. Each desc regex captures (value, unit).
  const numPat = '(\\d{1,4}(?:,\\d{3})*|\\d{1,5}(?:\\.\\d+)?)'
  const unitPat = '(kg|kilogram[s]?|kilo[s]?|g|gram[s]?|lb|lbs|pound[s]?|t|ton[s]?|tonne[s]?)'
  const result = findScaleMetric(c, {
    family: MASS_KG,
    extra_field_keys: ['max_mass_kg'],
    desc_regexes: [
      // Pattern 1: "MTOW: 2500 kg", "max take-off weight: 2500 kg"
      new RegExp(`(?:mtow|max(?:imum)?[\\s-]?(?:take[\\s-]?off)?[\\s-]?(?:weight|mass)|all[\\s-]?up[\\s-]?weight|auw)[\\s:]{0,8}${numPat}\\s*${unitPat}\\b`, 'i'),
      // Pattern 2: "2500 kg evtol / aircraft / tiltrotor"
      new RegExp(`${numPat}\\s*${unitPat}\\s+(?:evtol|e-?vtol|aircraft|tiltrotor|multirotor|lift\\+cruise|air[\\s-]?taxi)`, 'i'),
    ],
  })
  if (!result.found) {
    // Fall back to seat-count heuristic when no mass anywhere.
    const desc = String(c.product_description ?? '').toLowerCase()
    if (/single[\s-]?seat|single[\s-]?pax/i.test(desc)) return 'single_pax'
    if (/4[\s-]?(?:seat|pax)|five[\s-]?seat/i.test(desc)) return 'four_pax'
    return 'four_pax'
  }
  const mass = result.value
  if (mass <= 800) return 'single_pax'
  if (mass <= 2500) return 'two_to_four_pax'
  if (mass <= 7000) return 'four_to_six_pax'
  return 'heavy_lift'
}
function evtolVoltageTier(_: string | null, c: ParsedConstraints): VoltageTier {
  if (c.voltage_class_v) return classifyVoltage(c.voltage_class_v)
  return 'low'  // typical 800 V DC battery bus
}
function evtolFormFactor(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/tilt[\s-]?rotor|tilt[\s-]?wing/i.test(desc)) return 'tiltrotor'
  if (/lift\s*[\+\&]\s*cruise|lift[\s-]?cruise/i.test(desc)) return 'lift_plus_cruise'
  if (/multi[\s-]?rotor|multirotor/i.test(desc)) return 'multirotor'
  if (/vectored[\s-]?thrust/i.test(desc)) return 'vectored_thrust'
  return 'multirotor'
}
function evtolApplication(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/cargo|logistics|delivery/i.test(desc)) return 'cargo_logistics'
  if (/medical|ambulance|emergency/i.test(desc)) return 'medical_evac'
  if (/passenger|taxi|uam|urban[\s-]?air[\s-]?mobility/i.test(desc)) return 'urban_air_mobility'
  return 'urban_air_mobility'
}

// quantum_computer -------------------------------------------
function quantumComputerScaleTier(c: ParsedConstraints): string | null {
  // 2026-05-23 Normaliser refactor (P1-3): quantum-computer briefs typically
  // declare qubit count in target_performance ({value, unit:'qubits'}) or
  // prose. QUBIT_COUNT family is dimensionless. Each desc regex captures
  // (value, unit).
  const numPat = '(\\d{1,5}(?:,\\d{3})*|\\d{1,7})'
  const unitPat = '(qubits?|physicalqubits?|logicalqubits?|q)'
  const result = findScaleMetric(c, {
    family: QUBIT_COUNT,
    desc_regexes: [
      // Pattern 1: "100 physical qubits", "1000 qubits"
      new RegExp(`${numPat}\\s*(?:physical|logical)?\\s*${unitPat}\\b`, 'i'),
      // Pattern 2: "qubit count: 100", "register of 100 qubits"
      new RegExp(`(?:qubit\\s+count|register|register\\s+of)[\\s:]{0,8}${numPat}\\s*${unitPat}?\\b`, 'i'),
    ],
  })
  const n = result.found ? result.value : null
  if (n === null) return 'medium_scale'
  if (n <= 50) return 'noisy_intermediate_scale'
  if (n <= 1000) return 'medium_scale'
  if (n <= 100000) return 'fault_tolerant_logical_scale'
  return 'utility_scale'
}
function quantumComputerVoltageTier(_: string | null, _c: ParsedConstraints): VoltageTier {
  return 'extra_low'  // microwave control at mV level + cryogenic
}
function quantumComputerFormFactor(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/transmon/i.test(desc)) return 'transmon'
  if (/fluxonium/i.test(desc)) return 'fluxonium'
  if (/cat[\s-]?qubit/i.test(desc)) return 'cat_qubit'
  return 'transmon'
}
function quantumComputerApplication(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/cloud|saas|service/i.test(desc)) return 'cloud_qaas'
  if (/research|laboratory|academic/i.test(desc)) return 'research'
  if (/datacenter|enterprise/i.test(desc)) return 'on_premise_enterprise'
  return 'cloud_qaas'
}

// cryostat ---------------------------------------------------
function cryostatScaleTier(c: ParsedConstraints): string | null {
  // 2026-05-23 Normaliser refactor (P1-3): cryostat briefs may pick cooling
  // power (μW @ T) instead of base temperature. Normaliser scans for "X mK
  // base temperature", "down to X K". Each desc regex captures (value, unit).
  // TEMPERATURE_MK family converts K → mK (×1000); millikelvin is canonical
  // because that's the regime cryostats are tier-sorted in.
  const numPat = '(\\d{1,4}(?:,\\d{3})*|\\d{1,5}(?:\\.\\d+)?)'
  const unitPat = '(mk|millikelvins?|k|kelvins?)'
  const result = findScaleMetric(c, {
    family: TEMPERATURE_MK,
    desc_regexes: [
      // Pattern 1: "20 mK", "10 millikelvin", "1 K"
      new RegExp(`${numPat}\\s*${unitPat}\\b`, 'i'),
      // Pattern 2: "base temperature: 20 mK", "down to 1 K"
      new RegExp(`(?:base|operating|min(?:imum)?|down\\s+to)\\s*(?:temperature)?[\\s:]{0,8}${numPat}\\s*${unitPat}\\b`, 'i'),
    ],
  })
  const t_mk = result.found ? result.value : null
  if (t_mk === null) return 'standard_20mK'
  if (t_mk <= 10) return 'ultra_low_temp'
  if (t_mk <= 30) return 'standard_20mK'
  if (t_mk <= 100) return 'liquid_helium'
  return 'liquid_nitrogen'
}
function cryostatVoltageTier(_: string | null, _c: ParsedConstraints): VoltageTier {
  return 'extra_low'
}
function cryostatFormFactor(_: string | null, _c: ParsedConstraints): string {
  return 'top_loading_can'
}
function cryostatApplication(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/quantum/i.test(desc)) return 'quantum_computing_host'
  if (/superconducting[\s-]?nanowire/i.test(desc)) return 'snspd'
  if (/single[\s-]?molecule|materials/i.test(desc)) return 'low_t_physics'
  return 'quantum_computing_host'
}

// fso --------------------------------------------------------
function fsoScaleTier(c: ParsedConstraints): string | null {
  // 2026-05-23 Normaliser refactor (P1-3): FSO briefs may pick data rate
  // (Gbps) or wavelength (nm) as target_performance instead of link range.
  // Normaliser falls back to "X km range", "range: X km". LENGTH_M family
  // converts km→m (×1000); tier thresholds compare against metres.
  const numPat = '(\\d{1,4}(?:,\\d{3})*|\\d{1,7}(?:\\.\\d+)?)'
  const unitPat = '(km|kilometres?|kilometers?|m|metres?|meters?)'
  const result = findScaleMetric(c, {
    family: LENGTH_M,
    desc_regexes: [
      // Pattern 1: "range: 5 km", "operating range: 100 km"
      new RegExp(`(?:link|operating|optical)?\\s*range[\\s:]{0,8}${numPat}\\s*${unitPat}\\b`, 'i'),
      // Pattern 2: "5 km range", "5 km link"
      new RegExp(`${numPat}\\s*${unitPat}\\s+(?:range|link|reach)`, 'i'),
    ],
  })
  const range_m = result.found ? result.value : null
  if (range_m === null) return 'medium_range'
  // Tier thresholds in metres (5 km / 100 km / 5000 km).
  if (range_m <= 5000) return 'short_range'
  if (range_m <= 100_000) return 'medium_range'
  if (range_m <= 5_000_000) return 'satellite_to_ground'
  return 'inter_satellite'
}
function fsoVoltageTier(_: string | null, _c: ParsedConstraints): VoltageTier {
  return 'extra_low'
}
function fsoFormFactor(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/satellite|on[\s-]?orbit/i.test(desc)) return 'satellite_terminal'
  if (/rooftop|building/i.test(desc)) return 'rooftop_terminal'
  if (/portable|man[\s-]?portable/i.test(desc)) return 'portable_terminal'
  return 'rooftop_terminal'
}
function fsoApplication(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/inter[\s-]?satellite|isl|leo[\s-]?to[\s-]?leo/i.test(desc)) return 'inter_satellite_link'
  if (/ground|downlink/i.test(desc)) return 'space_to_ground'
  if (/military|defense|isr/i.test(desc)) return 'military_isr'
  return 'space_to_ground'
}

// phased_array ----------------------------------------------
function phasedArrayScaleTier(c: ParsedConstraints): string | null {
  // 2026-05-23 Normaliser refactor (P1-3): phased-array briefs may pick
  // EIRP (dBW), G/T, or aperture area as target_performance instead of
  // element count. ELEMENT_COUNT family is dimensionless. Each desc regex
  // captures (value, unit).
  const numPat = '(\\d{1,5}(?:,\\d{3})*|\\d{1,7})'
  const unitPat = '(elements?|antennas?|radiators?|array-elements?)'
  const result = findScaleMetric(c, {
    family: ELEMENT_COUNT,
    desc_regexes: [
      // Pattern 1: "1024 elements", "256 antennas"
      new RegExp(`${numPat}\\s*${unitPat}\\b`, 'i'),
      // Pattern 2: "element count: 1024", "array of 1024 elements"
      new RegExp(`(?:element\\s+count|array\\s+of|array)[\\s:]{0,8}${numPat}\\s*${unitPat}?\\b`, 'i'),
    ],
  })
  const n = result.found ? result.value : null
  if (n === null) return 'medium'
  if (n <= 64) return 'small'
  if (n <= 1024) return 'medium'
  if (n <= 10000) return 'large'
  return 'very_large'
}
function phasedArrayVoltageTier(_: string | null, c: ParsedConstraints): VoltageTier {
  if (c.voltage_class_v) return classifyVoltage(c.voltage_class_v)
  return 'low'
}
function phasedArrayFormFactor(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/flat[\s-]?panel/i.test(desc)) return 'flat_panel'
  if (/reflectarray|reflect[\s-]?array/i.test(desc)) return 'reflectarray'
  if (/transmitarray/i.test(desc)) return 'transmitarray'
  return 'flat_panel'
}
function phasedArrayApplication(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/5g|6g|mmwave/i.test(desc)) return '5g_mmwave'
  if (/radar/i.test(desc)) return 'radar'
  if (/satcom|satellite/i.test(desc)) return 'satcom_user_terminal'
  return 'satcom_user_terminal'
}

// solid_state_battery --------------------------------------
function ssbScaleTier(c: ParsedConstraints): string | null {
  // 2026-05-23 Normaliser refactor (Task #66): SSB briefs commonly compete
  // energy density (Wh/kg), C-rate, and cycle life with absolute capacity.
  // Normaliser scans for "X kWh pack", "energy capacity X Wh".
  const numPat = '(\\d{1,4}(?:,\\d{3})*|\\d{1,7}(?:\\.\\d+)?)'
  const unitPat = '(wh|kwh|mwh)'
  // Use a clone of ENERGY_KWH that also has 'wh' as alias for SSB sub-kWh cells
  const result = findScaleMetric(c, {
    family: {
      canonical: 'wh',
      aliases: ['wh'],
      conversions: { kwh: 1000, mwh: 1_000_000 },
    },
    desc_regexes: [
      new RegExp(`(?:energy|nameplate|cell|pack)\\s+capacity[\\s:]{0,8}${numPat}\\s*${unitPat}\\b`, 'i'),
      new RegExp(`${numPat}\\s*${unitPat}\\s+(?:pack|cell|battery|pouch|prismatic|coin)`, 'i'),
    ],
  })
  if (!result.found) return 'pouch_cell' // default kept for back-compat
  const wh = result.value
  if (wh <= 100) return 'coin_cell'
  if (wh <= 1000) return 'pouch_cell'
  if (wh <= 100000) return 'ev_pack'
  return 'utility_scale'
}
function ssbVoltageTier(_: string | null, c: ParsedConstraints): VoltageTier {
  if (c.voltage_class_v) return classifyVoltage(c.voltage_class_v)
  return 'extra_low'
}
function ssbFormFactor(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/pouch/i.test(desc)) return 'pouch'
  if (/prismatic/i.test(desc)) return 'prismatic'
  if (/cylindrical/i.test(desc)) return 'cylindrical'
  if (/thin[\s-]?film|coin/i.test(desc)) return 'thin_film'
  return 'pouch'
}
function ssbApplication(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/ev|electric vehicle|automotive/i.test(desc)) return 'automotive_ev'
  if (/grid|bess/i.test(desc)) return 'grid_storage'
  if (/wearable|implant/i.test(desc)) return 'medical_wearable'
  return 'automotive_ev'
}

// pemfc ----------------------------------------------------
function pemfcScaleTier(c: ParsedConstraints): string | null {
  // 2026-05-23 Normaliser refactor (Task #66): PEMFC briefs may pick power
  // density, Pt loading, or stack efficiency as target_performance. Normaliser
  // falls back to "rated power", "X kW fuel cell stack".
  let kw = powerKwFromTp(c, NaN)
  if (Number.isNaN(kw)) {
    const viaDesc = powerKwViaNormaliser(c, 'fuel[\\s-]?cell|pemfc|stack|fcev|automotive|marine|forklift')
    if (viaDesc !== null) kw = viaDesc
  }
  if (Number.isNaN(kw)) return 'transport'
  if (kw <= 10) return 'portable'
  if (kw <= 150) return 'transport'
  if (kw <= 1000) return 'heavy_duty'
  return 'stationary_industrial'
}
function pemfcVoltageTier(_: string | null, c: ParsedConstraints): VoltageTier {
  if (c.voltage_class_v) return classifyVoltage(c.voltage_class_v)
  return 'low'
}
function pemfcFormFactor(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/automotive|truck|bus/i.test(desc)) return 'automotive_stack'
  if (/marine|maritime/i.test(desc)) return 'marine_module'
  if (/stationary/i.test(desc)) return 'stationary_module'
  return 'automotive_stack'
}
function pemfcApplication(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/automotive|car|truck|bus/i.test(desc)) return 'transport_fcev'
  if (/backup|standby/i.test(desc)) return 'backup_power'
  if (/material[\s-]?handling|forklift/i.test(desc)) return 'material_handling'
  return 'transport_fcev'
}

// smr ------------------------------------------------------
function smrScaleTier(c: ParsedConstraints): string | null {
  // 2026-05-23 Normaliser refactor (Task #66): SMR briefs may pick fuel
  // enrichment, refuelling interval, or capacity factor as target_performance.
  // Normaliser falls back to "rated thermal power MWt", "X MWe net output".
  let kw = powerKwFromTp(c, NaN)
  if (Number.isNaN(kw)) {
    const viaDesc = powerKwViaNormaliser(c, 'smr|reactor|nuclear|module[\\s-]?reactor|micro[\\s-]?reactor|baseload')
    if (viaDesc !== null) kw = viaDesc
  }
  if (Number.isNaN(kw)) return 'medium_smr'
  const mw = kw / 1000
  if (mw <= 10) return 'micro_reactor'
  if (mw <= 50) return 'small_smr'
  if (mw <= 300) return 'medium_smr'
  return 'large_smr'
}
function smrVoltageTier(_: string | null, _c: ParsedConstraints): VoltageTier {
  return 'medium'
}
function smrFormFactor(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/molten[\s-]?salt/i.test(desc)) return 'molten_salt_reactor'
  if (/high[\s-]?temp|htgr|gas[\s-]?cooled/i.test(desc)) return 'htgr'
  if (/sodium|sfr/i.test(desc)) return 'sodium_fast_reactor'
  if (/heat[\s-]?pipe|micro/i.test(desc)) return 'heat_pipe_reactor'
  return 'light_water_smr'
}
function smrApplication(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/remote|off[\s-]?grid|isolated/i.test(desc)) return 'remote_community'
  if (/military|forward[\s-]?operating[\s-]?base/i.test(desc)) return 'military_fob'
  if (/datacenter|data[\s-]?center/i.test(desc)) return 'datacenter_baseload'
  return 'grid_baseload'
}

// humanoid -------------------------------------------------
function humanoidScaleTier(c: ParsedConstraints): string | null {
  // 2026-05-23 Normaliser refactor (P1-3): humanoid mass may live in
  // max_mass_kg, target_performance, or prose ("80 kg humanoid"). Normaliser
  // scans all sources. Each desc regex captures (value, unit).
  const numPat = '(\\d{1,4}(?:,\\d{3})*|\\d{1,5}(?:\\.\\d+)?)'
  const unitPat = '(kg|kilogram[s]?|kilo[s]?|g|gram[s]?|lb|lbs|pound[s]?|t|ton[s]?|tonne[s]?)'
  const result = findScaleMetric(c, {
    family: MASS_KG,
    extra_field_keys: ['max_mass_kg'],
    desc_regexes: [
      // Pattern 1: "robot mass: 80 kg", "system weight: 80 kg"
      new RegExp(`(?:robot|system|total|gross|net)\\s+(?:mass|weight)[\\s:]{0,5}${numPat}\\s*${unitPat}\\b`, 'i'),
      // Pattern 2: "80 kg humanoid / biped / robot"
      new RegExp(`${numPat}\\s*${unitPat}\\s+(?:humanoid|biped|robot|android)`, 'i'),
    ],
  })
  if (!result.found) return 'adult'
  const mass = result.value
  if (mass <= 30) return 'compact'
  if (mass <= 80) return 'adult'
  return 'heavy_duty'
}
function humanoidVoltageTier(_: string | null, _c: ParsedConstraints): VoltageTier {
  return 'extra_low'  // 48 V DC typical
}
function humanoidFormFactor(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/upper[\s-]?body[\s-]?only|torso[\s-]?only/i.test(desc)) return 'upper_body_only'
  if (/wheeled|mobile[\s-]?base/i.test(desc)) return 'wheeled_humanoid'
  return 'biped_full_body'
}
function humanoidApplication(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/warehouse|logistics|picking/i.test(desc)) return 'warehouse_logistics'
  if (/manufactur|factory|assembly/i.test(desc)) return 'manufacturing'
  if (/eldercare|caregiver|nursing/i.test(desc)) return 'eldercare'
  if (/research|academic/i.test(desc)) return 'research_platform'
  return 'manufacturing'
}

// dac ------------------------------------------------------
function dacScaleTier(c: ParsedConstraints): string | null {
  // 2026-05-23 Normaliser refactor (Task #66): DAC briefs may pick sorbent
  // regeneration energy (kWh/tCO2) or capture efficiency (%) as
  // target_performance. Normaliser falls back to "X tonnes CO2 per year",
  // "X tCO2/yr capture rate".
  const numPat = '(\\d{1,4}(?:,\\d{3})*|\\d{1,8}(?:\\.\\d+)?)'
  const result = findScaleMetric(c, {
    family: CO2_CAPTURE_TPY,
    desc_regexes: [
      // "X tonnes CO2/year", "X tCO2/yr"
      new RegExp(`${numPat}\\s*(t(?:onne)?s?\\s*(?:co2)?\\s*\\/?\\s*y(?:r|ear)?|tpy|tons?\\s*\\/?\\s*y(?:r|ear)?)`, 'i'),
      // "capture rate: X tons/year"
      new RegExp(`(?:capture|sequestration|removal)\\s+(?:rate|capacity)[\\s:]{0,8}${numPat}\\s*(t(?:onne)?s?\\s*\\/?\\s*y(?:r|ear)?|tpy)`, 'i'),
      // "X Mt/yr DAC", "X megatonne per year"
      new RegExp(`${numPat}\\s*(mt\\s*\\/?\\s*y(?:r|ear)?|megatonnes?\\s*\\/?\\s*y(?:r|ear)?)`, 'i'),
    ],
  })
  let tons: number
  if (result.found) {
    tons = result.value
  } else {
    // Fall back to legacy direct read of target_performance — preserves
    // back-compat for briefs whose parser-extracted unit is one we already
    // handle (kg/yr, t/yr).
    const tp = c.target_performance
    if (!tp) return 'pilot'
    tons = tp.value
    const u = String(tp.unit ?? '').toLowerCase()
    if (u === 'kg' || u === 'kg_yr' || u === 'kg/yr') tons = tp.value / 1000
    else if (u === 'ton_yr' || u === 'tons_yr' || u === 'tpy' || u === 't/yr') tons = tp.value
    else if (u === 'mt_yr' || u === 'mt/yr') tons = tp.value * 1e6
    else return 'pilot' // unrecognised unit → default to pilot tier
  }
  if (tons <= 100) return 'lab'
  if (tons <= 10000) return 'pilot'
  if (tons <= 1000000) return 'commercial'
  return 'megatonne'
}
function dacVoltageTier(_: string | null, _c: ParsedConstraints): VoltageTier {
  return 'low'
}
function dacFormFactor(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/contactor|tower|fan/i.test(desc)) return 'open_contactor'
  if (/sorbent[\s-]?bed|tsa|temperature[\s-]?swing/i.test(desc)) return 'sorbent_bed_tsa'
  return 'sorbent_bed_tsa'
}
function dacApplication(_: string | null, c: ParsedConstraints): string {
  const desc = String(c.product_description ?? '').toLowerCase()
  if (/storage|sequestration/i.test(desc)) return 'carbon_storage'
  if (/fuel|synfuel|saf/i.test(desc)) return 'synfuel_feedstock'
  if (/beverage|enhanced[\s-]?oil[\s-]?recovery|eor/i.test(desc)) return 'industrial_use'
  return 'carbon_storage'
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
  // 2026-05-22 additions
  solar_inverter: {
    scaleTier: solarInverterScaleTier,
    voltageTier: solarInverterVoltageTier,
    formFactor: solarInverterFormFactor,
    application: solarInverterApplication,
  },
  wind_turbine: {
    scaleTier: windTurbineScaleTier,
    voltageTier: windTurbineVoltageTier,
    formFactor: windTurbineFormFactor,
    application: windTurbineApplication,
  },
  h2_electrolyser: {
    scaleTier: h2ElectrolyserScaleTier,
    voltageTier: h2ElectrolyserVoltageTier,
    formFactor: h2ElectrolyserFormFactor,
    application: h2ElectrolyserApplication,
  },
  ups_inverter: {
    scaleTier: upsInverterScaleTier,
    voltageTier: upsInverterVoltageTier,
    formFactor: upsInverterFormFactor,
    application: upsInverterApplication,
  },
  '3d_printer_fdm': {
    scaleTier: printerFdmScaleTier,
    voltageTier: printerFdmVoltageTier,
    formFactor: printerFdmFormFactor,
    application: printerFdmApplication,
  },
  cnc_machine: {
    scaleTier: cncMachineScaleTier,
    voltageTier: cncMachineVoltageTier,
    formFactor: cncMachineFormFactor,
    application: cncMachineApplication,
  },
  e_bike: {
    scaleTier: eBikeScaleTier,
    voltageTier: eBikeVoltageTier,
    formFactor: eBikeFormFactor,
    application: eBikeApplication,
  },
  satellite_cubesat: {
    scaleTier: cubesatScaleTier,
    voltageTier: cubesatVoltageTier,
    formFactor: cubesatFormFactor,
    application: cubesatApplication,
  },
  satellite_smallsat: {
    scaleTier: smallsatScaleTier,
    voltageTier: smallsatVoltageTier,
    formFactor: smallsatFormFactor,
    application: smallsatApplication,
  },
  satellite_geo_comsat: {
    scaleTier: geoComsatScaleTier,
    voltageTier: geoComsatVoltageTier,
    formFactor: geoComsatFormFactor,
    application: geoComsatApplication,
  },
  satellite_interplanetary: {
    scaleTier: interplanetaryScaleTier,
    voltageTier: interplanetaryVoltageTier,
    formFactor: interplanetaryFormFactor,
    application: interplanetaryApplication,
  },
  propulsion_thruster_product: {
    scaleTier: thrusterScaleTier,
    voltageTier: thrusterVoltageTier,
    formFactor: thrusterFormFactor,
    application: thrusterApplication,
  },
  ground_station: {
    scaleTier: groundStationScaleTier,
    voltageTier: groundStationVoltageTier,
    formFactor: groundStationFormFactor,
    application: groundStationApplication,
  },
  ventilator: {
    scaleTier: ventilatorScaleTier,
    voltageTier: ventilatorVoltageTier,
    formFactor: ventilatorFormFactor,
    application: ventilatorApplication,
  },
  dialysis_machine: {
    scaleTier: dialysisScaleTier,
    voltageTier: dialysisVoltageTier,
    formFactor: dialysisFormFactor,
    application: dialysisApplication,
  },
  // 2026-05-22 priority-class additions
  evtol: {
    scaleTier: evtolScaleTier,
    voltageTier: evtolVoltageTier,
    formFactor: evtolFormFactor,
    application: evtolApplication,
  },
  quantum_computer: {
    scaleTier: quantumComputerScaleTier,
    voltageTier: quantumComputerVoltageTier,
    formFactor: quantumComputerFormFactor,
    application: quantumComputerApplication,
  },
  cryostat: {
    scaleTier: cryostatScaleTier,
    voltageTier: cryostatVoltageTier,
    formFactor: cryostatFormFactor,
    application: cryostatApplication,
  },
  fso: {
    scaleTier: fsoScaleTier,
    voltageTier: fsoVoltageTier,
    formFactor: fsoFormFactor,
    application: fsoApplication,
  },
  phased_array: {
    scaleTier: phasedArrayScaleTier,
    voltageTier: phasedArrayVoltageTier,
    formFactor: phasedArrayFormFactor,
    application: phasedArrayApplication,
  },
  solid_state_battery: {
    scaleTier: ssbScaleTier,
    voltageTier: ssbVoltageTier,
    formFactor: ssbFormFactor,
    application: ssbApplication,
  },
  pemfc: {
    scaleTier: pemfcScaleTier,
    voltageTier: pemfcVoltageTier,
    formFactor: pemfcFormFactor,
    application: pemfcApplication,
  },
  smr: {
    scaleTier: smrScaleTier,
    voltageTier: smrVoltageTier,
    formFactor: smrFormFactor,
    application: smrApplication,
  },
  humanoid: {
    scaleTier: humanoidScaleTier,
    voltageTier: humanoidVoltageTier,
    formFactor: humanoidFormFactor,
    application: humanoidApplication,
  },
  dac: {
    scaleTier: dacScaleTier,
    voltageTier: dacVoltageTier,
    formFactor: dacFormFactor,
    application: dacApplication,
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
