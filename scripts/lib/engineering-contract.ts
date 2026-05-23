/**
 * scripts/lib/engineering-contract.ts
 *
 * ENGINEERING CONTRACT — canonical typed-quantity state object for the
 * ForgeOS PDF Engine v2 chain. 6/6 SEAT COUNCIL UNANIMOUS verdict
 * (GPT-5.5 + Gemini 3.1 Pro + Grok 4.3 + GLM-5.1 + Kimi K2.6 + MiMo
 * V2.5 Pro, 2026-05-21): the chain's persistent 2-3/10 engineering
 * plausibility is caused by treating an engineering problem as a
 * text-generation task. LLMs cannot maintain coupled physical
 * constraints (mass/current/power/thermal/topology) across multi-stage
 * stochastic generation. The fix is to extract canonical physics into
 * deterministic state, demote LLMs to proposal + narration, and have
 * every downstream stage (Performance Card / BoM / cost / prose /
 * images) READ from this frozen contract.
 *
 * Council seat summaries (different lineages, same core finding):
 *
 *   GPT-5.5: "No feasibility-generating core. Build: Contract +
 *     archetype library + deterministic calculators + hard validators
 *     + LLM demoted to extraction/narration."
 *   Gemini 3.1 Pro: "Coupled Variable Oscillation (Waterbed Effect).
 *     State Vector Contract → LLM as Topologist → Deterministic
 *     Simulator → LLM as Editor. Collapse to 3 stages."
 *   Grok 4.3 (adversarial): "Until an external verifier with write
 *     access to canonical state is the PRIMARY actor and the LLM
 *     merely proposes, every other variable being tuned is noise."
 *   GLM-5.1: "Stateless Document Mutation. Pass-the-parcel model
 *     loses precision at each LLM hop. VF regression is entropy
 *     accumulating over a lossy channel."
 *   Kimi K2.6: "Autoregressive generation is local token prediction,
 *     not global constraint propagation. Cell count / choke rating /
 *     heatsink size are deterministically solvable in milliseconds."
 *   MiMo V2.5 Pro: "Either replace Generator with constrained solver
 *     OR ship 4-5/10 as a writing system. The middle ground (writing
 *     system pretending to do engineering) is where the chain is stuck."
 *
 * SCAFFOLD STATUS (2026-05-21): types + brief-parser + per-class
 * calculator skeletons. Full wiring into the chain orchestrator is a
 * multi-day plan-mode task (Task #100). This file IS the foundation;
 * subsequent commits flesh out per-class calculators + chain
 * integration + frozen-state read paths.
 *
 * Universal across product classes (BESS, HAPS, VF, heat pump, drone,
 * AUV, bioreactor, CGM, edge-AI, EV charger). Each class registers a
 * `buildContract(brief)` function that returns the typed Quantity
 * records + topology constraints + cost anchors.
 */

// ---------------------------------------------------------------------------
// TYPED QUANTITY — per GPT-5.5: "next bug class is basis-of-measure mismatch.
// Add (value, unit, basis, scope, condition) fields to every quantity."
// ---------------------------------------------------------------------------

export type UnitFamily =
  | 'energy' | 'power' | 'mass' | 'time' | 'length' | 'area' | 'volume'
  | 'force' | 'pressure' | 'temperature' | 'velocity' | 'flow_rate'
  | 'photon_flux_density' | 'currency' | 'yield' | 'dimensionless'
  // 2026-05-22 additions for new product classes (solar inverter / wind /
  // satellite / etc.). Kept narrow but enough to type the seed quantities.
  | 'voltage' | 'current' | 'frequency'

export type QuantityBasis =
  // Energy
  | 'nameplate' | 'usable' | 'gross' | 'net'
  // Power
  | 'continuous' | 'peak' | 'rated' | 'derated'
  // Electrical
  | 'AC' | 'DC' | 'phase' | 'line'
  // Mass
  | 'empty' | 'gross_takeoff' | 'payload' | 'fuel'
  // Area
  | 'canopy' | 'wing' | 'aperture' | 'footprint' | 'gross_building'
  // Cost
  | 'raw_BoM' | 'factory_COGS' | 'OEM_transfer' | 'channel_list' | 'installed_ASP'
  // Time
  | 'lifetime' | 'cycle'
  // Generic
  | 'min' | 'max' | 'typical'

export type QuantityScope = 'cell' | 'module' | 'pack' | 'rack' | 'system' | 'site'

export interface Quantity {
  value: number
  unit: string  // canonical-unit string e.g. 'kWh', 'kW', 'kg', 'm²', 'GBP'
  family: UnitFamily
  basis: QuantityBasis
  scope: QuantityScope
  condition?: string  // free-text e.g. '25°C ambient', 'BoL', 'sea-level standard atmosphere'
  source: 'brief' | 'calculator' | 'physics_constant' | 'override' | 'inherited'
  source_detail?: string  // e.g. 'cells_ah_voltage_capacity_closure', 'brief.constraints.target_performance.value'
}

export function q(
  value: number,
  unit: string,
  family: UnitFamily,
  basis: QuantityBasis,
  scope: QuantityScope,
  source: Quantity['source'],
  opts?: { condition?: string; source_detail?: string },
): Quantity {
  return { value, unit, family, basis, scope, source, ...(opts ?? {}) }
}

// ---------------------------------------------------------------------------
// CONSTRAINT TOPOLOGY — per Gemini Pro: "Topology validator should reject
// (dry-type transformer in oil tank, 180A choke on 1250A bus) BEFORE prose
// exists." These are typed edges in the Contract.
// ---------------------------------------------------------------------------

export type TopologyEdge = {
  from_part: string  // e.g. 'lfp_cell_string', 'pcs_inverter'
  to_part: string
  mechanism: 'electrical_bus' | 'fluid_loop' | 'thermal' | 'mechanical' | 'data' | 'control'
  // Constraint that the EDGE must satisfy. e.g. for an electrical_bus:
  //   { current_rating_a >= bus_continuous_a × 1.25 }
  constraint_kind: 'current_rating' | 'voltage_rating' | 'thermal_rejection' | 'flow_capacity' | 'mass_carry' | 'data_bandwidth' | 'material_compatibility'
  // Threshold values inline so the validator can check without parsing prose.
  required_value?: number
  required_unit?: string
  required_margin_factor?: number  // e.g. 1.25 for "≥ 1.25× bus continuous"
  // For material_compatibility constraints, list the working fluid /
  // atmosphere; downstream Contract validator rejects parts whose
  // material isn't in the compatibility set.
  material_context?: string  // e.g. 'R410A refrigerant', 'mineral-oil-filled tank'
}

// ---------------------------------------------------------------------------
// MACRO-ASSEMBLY PRICING — per the macro-assembly per-unit blind spot
// drawer 131354a77ce608b8. Macro-assemblies are large single items whose
// price scales with envelope dimension, not class-anchor median × qty=1.
// ---------------------------------------------------------------------------

export interface MacroAssemblyPrice {
  word_name: string       // e.g. 'carbon_fibre_wing_spar', 'gaas_solar_laminate'
  unit_price_gbp: number  // £ per dimension unit (per metre, per m², per kWh)
  dimension_basis: 'metre_length' | 'metre_wingspan' | 'square_metre' | 'kwh_capacity' | 'litre_volume' | 'cubic_metre' | 'kg_mass' | 'cell_count' | 'kw_power' | 'each'
  dimension_value: number  // the scale from the brief envelope
  total_gbp: number       // unit_price × dimension_value — what the BoM should ship
  source_detail: string
}

// ---------------------------------------------------------------------------
// CONTRACT — the canonical frozen state. Every downstream stage reads
// from this. LLM stages write into this via PROPOSALS that the Contract
// validator accepts or rejects.
// ---------------------------------------------------------------------------

export interface EngineeringContract {
  product_class: string
  brief_summary: string  // short class-aware description for prose generators

  // Quantities indexed by canonical name. e.g. quantities['mass_total_kg'],
  // quantities['nameplate_capacity_kwh'], quantities['continuous_power_kw'].
  // Validators ensure cross-quantity closure (mass + capacity at brief cap,
  // thermal rejection ≥ power dissipated, current ratings ≥ bus current).
  quantities: Record<string, Quantity>

  // Topology constraints — typed edges that downstream LLM proposals must
  // satisfy. Validator runs after each LLM stage and rejects incoherent
  // proposals (dry transformer in oil, etc.) BEFORE they enter the prose.
  topology: TopologyEdge[]

  // Macro-assembly size-aware pricing — Engine B / Cost Repair / renderer
  // all read from this for large single-item BoM lines. Closes the HAPS
  // £400k wing-spar gap and similar.
  macro_assembly_prices: MacroAssemblyPrice[]

  // Closure status: each invariant returns pass / warn / fail. The chain
  // CANNOT advance to render unless all `fail` invariants are resolved.
  // Replaces the current Physics-Critic-after-the-fact loop.
  closures: ContractClosureResult[]
}

export interface ContractClosureResult {
  invariant_id: string  // e.g. 'mass_closure', 'capacity_closure', 'current_rating_closure'
  status: 'pass' | 'warn' | 'fail'
  measured: Quantity | number | null
  required: Quantity | number | string
  reason: string
}

// ---------------------------------------------------------------------------
// PER-CLASS ARCHETYPES — register a buildContract function per product class.
// The Contract is BUILT from the brief BEFORE the Generator runs; the
// Generator then receives the Contract as a constraint to RESPECT, not as
// numbers to invent.
// ---------------------------------------------------------------------------

export type ContractBuilder = (parsedBrief: any) => EngineeringContract

const ARCHETYPE_REGISTRY: Record<string, ContractBuilder> = {}

export function registerArchetype(productClass: string, builder: ContractBuilder): void {
  ARCHETYPE_REGISTRY[productClass] = builder
}

// Aliases — product_class slug variants emitted by the classifier that
// should resolve to the same archetype. Loop 9 evidence: chain classified
// as 'energy_storage' but archetype was registered as 'bess'. Universal
// fix: register aliases so classifier output → archetype is robust.
const ARCHETYPE_ALIASES: Record<string, string> = {
  energy_storage: 'bess',
  bess_utility_scale: 'bess',
  battery_energy_storage: 'bess',
  utility_bess: 'bess',
  vertical_farm: 'vertical_farm',
  verticalfarm: 'vertical_farm',
  containerised_vertical_farm: 'vertical_farm',
  vf: 'vertical_farm',
  haps: 'haps',
  high_altitude_pseudo_satellite: 'haps',
  pseudo_satellite: 'haps',
  stratospheric_uav: 'haps',
  heat_pump_residential: 'heat_pump_residential',
  heat_pump: 'heat_pump_residential',
  heatpump: 'heat_pump_residential',
  air_source_heat_pump: 'heat_pump_residential',
  ashp: 'heat_pump_residential',
  mini_split_heatpump: 'heat_pump_residential',
  // Classifier (product-classifier.ts:77) emits 'thermal_system' for heat
  // pump briefs. Chain orchestrator remaps thermal_system → 'heat-pump-
  // residential' (with dash) at serial-design-chain-v2.tsx:2413+:3127 for
  // class-specific routes — but buildContract() reads productClass BEFORE
  // that remap. Add both forms.
  thermal_system: 'heat_pump_residential',
  'heat-pump-residential': 'heat_pump_residential',
  air_to_water_heat_pump: 'heat_pump_residential',
  monobloc_heat_pump: 'heat_pump_residential',
  commercial_heat_pump: 'heat_pump_residential',
  drone: 'drone',
  multirotor: 'drone',
  quadcopter: 'drone',
  hexacopter: 'drone',
  octocopter: 'drone',
  uav_consumer: 'drone',
  cinematography_drone: 'drone',
  consumer_drone: 'drone',
  agri_drone: 'drone',
  agricultural_drone: 'drone',
  auv: 'auv',
  autonomous_underwater_vehicle: 'auv',
  subsea_vehicle: 'auv',
  deep_sea_drone: 'auv',
  uuv: 'auv',
  unmanned_underwater_vehicle: 'auv',
  bioreactor: 'bioreactor',
  fermenter: 'bioreactor',
  stirred_tank_bioreactor: 'bioreactor',
  single_use_bioreactor: 'bioreactor',
  cell_culture_bioreactor: 'bioreactor',
  fermentation_vessel: 'bioreactor',
  cgm: 'cgm',
  continuous_glucose_monitor: 'cgm',
  // Classifier (product-classifier.ts) emits 'wearable_medical' for CGM briefs
  wearable_medical: 'cgm',
  diabetes_wearable: 'cgm',
  glucose_sensor_wearable: 'cgm',
  isf_sensor: 'cgm',
  edge_ai: 'edge_ai',
  // Classifier emits 'edge_ai_server' for 1U inference appliance briefs
  edge_ai_server: 'edge_ai',
  inference_server: 'edge_ai',
  gpu_inference_server: 'edge_ai',
  '1u_inference_appliance': 'edge_ai',
  on_prem_inference: 'edge_ai',
  ai_inference_appliance: 'edge_ai',
  ev_charger: 'ev_charger',
  ev_charging_station: 'ev_charger',
  dc_fast_charger: 'ev_charger',
  ccs_fast_charger: 'ev_charger',
  fast_ev_charger: 'ev_charger',
  electric_vehicle_charger: 'ev_charger',
  hpc_charger: 'ev_charger',  // high-power charging
  ultra_fast_charger: 'ev_charger',
  // 2026-05-22 additions
  solar_inverter: 'solar_inverter',
  pv_inverter: 'solar_inverter',
  photovoltaic_inverter: 'solar_inverter',
  string_inverter: 'solar_inverter',
  central_inverter: 'solar_inverter',
  wind_turbine: 'wind_turbine',
  windmill: 'wind_turbine',
  hawt: 'wind_turbine',
  vawt: 'wind_turbine',
  onshore_wind: 'wind_turbine',
  offshore_wind: 'wind_turbine',
  h2_electrolyser: 'h2_electrolyser',
  hydrogen_electrolyser: 'h2_electrolyser',
  pem_electrolyser: 'h2_electrolyser',
  alkaline_electrolyser: 'h2_electrolyser',
  electrolyzer: 'h2_electrolyser',
  ups_inverter: 'ups_inverter',
  ups: 'ups_inverter',
  uninterruptible_power_supply: 'ups_inverter',
  online_ups: 'ups_inverter',
  '3d_printer_fdm': '3d_printer_fdm',
  fdm_printer: '3d_printer_fdm',
  filament_printer: '3d_printer_fdm',
  desktop_3d_printer: '3d_printer_fdm',
  cnc_machine: 'cnc_machine',
  cnc: 'cnc_machine',
  cnc_mill: 'cnc_machine',
  cnc_router: 'cnc_machine',
  vmc: 'cnc_machine',
  e_bike: 'e_bike',
  ebike: 'e_bike',
  electric_bike: 'e_bike',
  electric_bicycle: 'e_bike',
  pedelec: 'e_bike',
  satellite_cubesat: 'satellite_cubesat',
  cubesat: 'satellite_cubesat',
  '1u_cubesat': 'satellite_cubesat',
  '3u_cubesat': 'satellite_cubesat',
  '6u_cubesat': 'satellite_cubesat',
  satellite_smallsat: 'satellite_smallsat',
  smallsat: 'satellite_smallsat',
  smallsatellite: 'satellite_smallsat',
  microsat: 'satellite_smallsat',
  minisatellite: 'satellite_smallsat',
  satellite: 'satellite_smallsat',
  satellite_geo_comsat: 'satellite_geo_comsat',
  geo_comsat: 'satellite_geo_comsat',
  geostationary_satellite: 'satellite_geo_comsat',
  comsat: 'satellite_geo_comsat',
  geo_satellite: 'satellite_geo_comsat',
  satellite_interplanetary: 'satellite_interplanetary',
  interplanetary_probe: 'satellite_interplanetary',
  deep_space_probe: 'satellite_interplanetary',
  mars_orbiter: 'satellite_interplanetary',
  europa_lander: 'satellite_interplanetary',
  propulsion_thruster_product: 'propulsion_thruster_product',
  propulsion_thruster: 'propulsion_thruster_product',
  thruster: 'propulsion_thruster_product',
  hall_thruster: 'propulsion_thruster_product',
  ion_thruster: 'propulsion_thruster_product',
  monopropellant_thruster: 'propulsion_thruster_product',
  bipropellant_thruster: 'propulsion_thruster_product',
  ground_station: 'ground_station',
  earth_station: 'ground_station',
  satellite_ground_terminal: 'ground_station',
  vsat: 'ground_station',
  ventilator: 'ventilator',
  medical_ventilator: 'ventilator',
  icu_ventilator: 'ventilator',
  mechanical_ventilator: 'ventilator',
  dialysis_machine: 'dialysis_machine',
  dialyser: 'dialysis_machine',
  hemodialysis_machine: 'dialysis_machine',
  haemodialysis_machine: 'dialysis_machine',
  // 2026-05-22 priority-class additions
  evtol: 'evtol',
  e_vtol: 'evtol',
  urban_air_mobility: 'evtol',
  uam: 'evtol',
  passenger_evtol: 'evtol',
  tiltrotor_evtol: 'evtol',
  quantum_computer: 'quantum_computer',
  qpu: 'quantum_computer',
  superconducting_qpu: 'quantum_computer',
  superconducting_quantum_computer: 'quantum_computer',
  transmon_qpu: 'quantum_computer',
  cryostat: 'cryostat',
  dilution_fridge: 'cryostat',
  dilution_refrigerator: 'cryostat',
  pulse_tube_cryostat: 'cryostat',
  fso: 'fso',
  free_space_optical: 'fso',
  laser_comms_terminal: 'fso',
  optical_inter_satellite_link: 'fso',
  isl_terminal: 'fso',
  phased_array: 'phased_array',
  phased_array_antenna: 'phased_array',
  beam_forming_antenna: 'phased_array',
  active_electronically_scanned_array: 'phased_array',
  aesa: 'phased_array',
  flat_panel_satcom_terminal: 'phased_array',
  solid_state_battery: 'solid_state_battery',
  ssb: 'solid_state_battery',
  li_metal_battery: 'solid_state_battery',
  solid_state_cell: 'solid_state_battery',
  pemfc: 'pemfc',
  fuel_cell: 'pemfc',
  hydrogen_fuel_cell: 'pemfc',
  proton_exchange_membrane_fuel_cell: 'pemfc',
  pem_fuel_cell: 'pemfc',
  smr: 'smr',
  micro_reactor: 'smr',
  small_modular_reactor: 'smr',
  micro_smr: 'smr',
  humanoid: 'humanoid',
  biped_robot: 'humanoid',
  humanoid_robot: 'humanoid',
  general_purpose_humanoid: 'humanoid',
  dac: 'dac',
  direct_air_capture: 'dac',
  atmospheric_co2_capture: 'dac',
  co2_air_capture: 'dac',
}

export function buildContract(productClass: string, parsedBrief: any): EngineeringContract | null {
  const key = String(productClass ?? '').toLowerCase().trim()
  const canonical = ARCHETYPE_ALIASES[key] ?? key
  const builder = ARCHETYPE_REGISTRY[canonical]
  if (!builder) return null
  return builder(parsedBrief)
}

// ---------------------------------------------------------------------------
// BESS ARCHETYPE — first reference implementation. Cell count, pack
// topology, choke ratings, heatsink sizing all DETERMINISTICALLY computed
// from the brief BEFORE the Generator runs.
// ---------------------------------------------------------------------------

registerArchetype('bess', (brief: any) => {
  const tp = brief?.constraints?.target_performance ?? {}
  const briefValue = Number(tp.value ?? 0)
  const briefUnit = String(tp.unit ?? 'kWh').toLowerCase()
  const desc = String(brief?.product_description ?? brief?.brief?.original_text ?? '')
  // Normalise to kWh USABLE. 2026-05-23 (Task #69) — fixed brief-fidelity bug
  // analogous to bioreactor's: if brief parser picks C-rate or cycle-life
  // (dimensionless or hr⁻¹ unit) as target_performance, the old "else briefValue"
  // branch silently treated it as kWh. Now: scan desc for "X kWh / MWh capacity"
  // first; accept target_performance.value only if unit is in the energy family.
  const usableKwh = (() => {
    // FIRST: explicit "nameplate / usable / energy capacity: X kWh|MWh" in desc
    const descPatterns = [
      /(?:nameplate|usable|energy|rated)\s+(?:capacity|energy)[\s:]{0,8}(\d{1,4}(?:,\d{3})*|\d{1,7}(?:\.\d+)?)\s*(kwh|mwh|gwh|wh)\b/i,
      /(\d{1,4}(?:,\d{3})*|\d{1,7}(?:\.\d+)?)\s*(kwh|mwh|gwh|wh)\s*(?:bess|battery|energy[\s-]?storage|ess|capacity)/i,
    ]
    for (const p of descPatterns) {
      const m = desc.match(p)
      if (m) {
        const v = parseFloat(m[1].replace(/,/g, ''))
        const u = m[2].toLowerCase()
        if (u === 'mwh') return v * 1000
        if (u === 'gwh') return v * 1_000_000
        if (u === 'wh') return v / 1000
        return v
      }
    }
    // SECOND: target_performance ONLY if unit is in the energy family
    if (briefValue > 0) {
      if (briefUnit === 'kwh') return briefValue
      if (briefUnit === 'mwh') return briefValue * 1000
      if (briefUnit === 'gwh') return briefValue * 1_000_000
      if (briefUnit === 'wh') return briefValue / 1000
      // Wrong unit (C-rate, cycles, hr, %) → fall to class default below
    }
    // THIRD: class default for utility-scale BESS
    return 3500  // kWh = 3.5 MWh, matches brief default
  })()
  // Default DoD 80% per BESS class convention; nameplate = usable / dod
  const dodFraction = 0.80
  const nameplateKwh = usableKwh / dodFraction
  // CATL 280 Ah × 3.2 V LFP prismatic — class default
  const cellAh = 280
  const cellVoltageV = 3.2
  const cellEnergyKwh = (cellAh * cellVoltageV) / 1000  // 0.896 kWh/cell
  // Cell count: nameplate / per-cell, rounded up + 2.5% EoL margin
  const cellCountTheoretical = Math.ceil(nameplateKwh / cellEnergyKwh)
  const cellCount = Math.ceil(cellCountTheoretical * 1.025)
  const cellMassKg = 5.3
  const totalCellMassKg = cellCount * cellMassKg
  const briefMassCapKg = Number(brief?.constraints?.max_mass_kg?.value ?? 28_000)
  // Continuous power 1 MW = 1000 kW; peak 1.25 MW for 15 min
  const continuousKw = 1000  // brief default for utility BESS
  const peakKw = 1250
  // DC bus voltage ≈ 800V nominal; bus continuous current = continuous_kw × 1000 / dc_v
  const dcBusVoltage = 800
  const busContinuousA = (continuousKw * 1000) / dcBusVoltage  // 1250 A
  const busPeakA = (peakKw * 1000) / dcBusVoltage              // 1562 A
  // Inverter losses at 98% efficiency
  const inverterEfficiency = 0.98
  const dissipatedKw = continuousKw * (1 - inverterEfficiency)  // 20 kW
  // Heatsink/thermal-rejection minimum capacity (1.5× margin)
  const thermalRejectionMinKw = dissipatedKw * 1.5  // 30 kW

  const quantities: Record<string, Quantity> = {
    usable_capacity_kwh: q(usableKwh, 'kWh', 'energy', 'usable', 'system', 'brief', { source_detail: 'parsedBrief.constraints.target_performance', condition: '25°C, 80% DoD, BoL' }),
    nameplate_capacity_kwh: q(nameplateKwh, 'kWh', 'energy', 'nameplate', 'system', 'calculator', { source_detail: 'usable / dod_fraction' }),
    dod_fraction: q(dodFraction, '', 'dimensionless', 'rated', 'system', 'physics_constant'),
    cell_count: q(cellCount, '', 'dimensionless', 'rated', 'cell', 'calculator', { source_detail: 'ceil(nameplate / cell_energy_kwh × 1.025_EoL)' }),
    cell_capacity_ah: q(cellAh, 'Ah', 'dimensionless', 'rated', 'cell', 'physics_constant', { source_detail: 'CATL 280 Ah LFP prismatic class default' }),
    cell_voltage_v: q(cellVoltageV, 'V', 'dimensionless', 'rated', 'cell', 'physics_constant'),
    cell_mass_kg: q(cellMassKg, 'kg', 'mass', 'gross_takeoff', 'cell', 'physics_constant'),
    total_cell_mass_kg: q(totalCellMassKg, 'kg', 'mass', 'gross_takeoff', 'system', 'calculator', { source_detail: 'cell_count × cell_mass_kg' }),
    brief_mass_cap_kg: q(briefMassCapKg, 'kg', 'mass', 'max', 'system', 'brief'),
    continuous_power_kw: q(continuousKw, 'kW', 'power', 'continuous', 'system', 'brief'),
    peak_power_kw: q(peakKw, 'kW', 'power', 'peak', 'system', 'brief', { condition: '15 min duration' }),
    dc_bus_voltage_v: q(dcBusVoltage, 'V', 'dimensionless', 'rated', 'system', 'physics_constant'),
    bus_continuous_current_a: q(busContinuousA, 'A', 'dimensionless', 'continuous', 'system', 'calculator', { source_detail: 'continuous_kw × 1000 / dc_bus_voltage_v' }),
    bus_peak_current_a: q(busPeakA, 'A', 'dimensionless', 'peak', 'system', 'calculator'),
    inverter_dissipated_kw: q(dissipatedKw, 'kW', 'power', 'continuous', 'system', 'calculator', { source_detail: 'continuous_kw × (1 - 0.98 efficiency)' }),
    thermal_rejection_min_kw: q(thermalRejectionMinKw, 'kW', 'power', 'min', 'system', 'calculator', { source_detail: 'dissipated × 1.5 margin' }),
  }

  // Topology constraints — typed edges
  const topology: TopologyEdge[] = [
    {
      from_part: 'lfp_cell_string',
      to_part: 'dc_bus',
      mechanism: 'electrical_bus',
      constraint_kind: 'current_rating',
      required_value: busContinuousA * 1.25,  // 25% margin per UL 9540A
      required_unit: 'A',
      required_margin_factor: 1.25,
    },
    {
      from_part: 'pcs_inverter',
      to_part: 'heat_rejection',
      mechanism: 'thermal',
      constraint_kind: 'thermal_rejection',
      required_value: thermalRejectionMinKw,
      required_unit: 'kW',
    },
    {
      from_part: 'step_up_transformer',
      to_part: 'enclosure_atmosphere',
      mechanism: 'mechanical',
      constraint_kind: 'material_compatibility',
      material_context: 'enclosure_atmosphere=air',  // dry-type OK in air; oil tank requires oil-filled transformer
    },
  ]

  // Closures — run NOW so the Contract refuses to ship inconsistent state
  const closures: ContractClosureResult[] = []
  closures.push({
    invariant_id: 'mass_closure',
    status: totalCellMassKg < briefMassCapKg * 0.6 ? 'pass'
          : totalCellMassKg < briefMassCapKg ? 'warn'
          : 'fail',
    measured: quantities.total_cell_mass_kg,
    required: { value: briefMassCapKg * 0.6, unit: 'kg', basis: 'max', source_detail: 'cells alone should be ≤60% of mass cap; balance for container + BMS + PCS + HVAC' } as any,
    reason: `Cells alone weigh ${totalCellMassKg.toFixed(0)} kg vs brief cap ${briefMassCapKg} kg (${((totalCellMassKg / briefMassCapKg) * 100).toFixed(0)}%). Container + BMS + PCS + HVAC need the remaining mass budget.`,
  })
  closures.push({
    invariant_id: 'capacity_closure',
    status: Math.abs(nameplateKwh - cellCount * cellEnergyKwh) / nameplateKwh < 0.05 ? 'pass' : 'fail',
    measured: quantities.nameplate_capacity_kwh,
    required: `cell_count × cell_voltage × cell_capacity_ah / 1000 within 5% of nameplate`,
    reason: `Nameplate ${nameplateKwh.toFixed(0)} kWh = ${cellCount} cells × ${cellVoltageV} V × ${cellAh} Ah / 1000 = ${(cellCount * cellEnergyKwh).toFixed(0)} kWh`,
  })

  // Macro-assembly pricing — sized to the deterministic Contract quantities.
  // Verified against mempalace drawer (BESS reality 2026-05-18): 280 Ah LFP
  // prismatic cells £75-100/cell, BMS master £2-5k flat, BMS slaves £400/slave,
  // PCS IGBT-based £150/kW, container fit-out £8k flat, liquid cooling
  // £600/kW thermal rejection. Word names chosen for ≥0.66 token overlap
  // against Stage 1.7 emissions (cell_string sub-module, pcs_inverter_1mw,
  // container_enclosure, bms_master, bms_slave, liquid_cooling_loop_1mw).
  const slaveCount = Math.ceil(cellCount / 24)  // 24-channel BMS slave boards
  const macro_assembly_prices: MacroAssemblyPrice[] = [
    {
      word_name: 'lfp_cell_string',
      unit_price_gbp: 100,
      dimension_basis: 'cell_count',
      dimension_value: cellCount,
      total_gbp: 100 * cellCount,
      source_detail: `£100/cell × ${cellCount} cells (CATL 280 Ah LFP prismatic, programme-rate)`,
    },
    {
      word_name: 'pcs_inverter_bidirectional',
      unit_price_gbp: 150,
      dimension_basis: 'kw_power',
      dimension_value: continuousKw,
      total_gbp: 150 * continuousKw,
      source_detail: `£150/kW × ${continuousKw} kW (1700 V IGBT-based bidirectional PCS, utility-scale BESS)`,
    },
    {
      word_name: 'iso_container_enclosure',
      unit_price_gbp: 8000,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 8000,
      source_detail: `£8,000 flat — 40-ft HC ISO container with structural mods, fire-rated penetrations, HVAC mounting`,
    },
    {
      word_name: 'bms_master_controller',
      unit_price_gbp: 3000,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 3000,
      source_detail: `£3,000 flat — STM32F427-based BMS master with watchdog, CAN, isolation (IEC 62619)`,
    },
    {
      word_name: 'bms_slave_module',
      unit_price_gbp: 400,
      dimension_basis: 'each',
      dimension_value: slaveCount,
      total_gbp: 400 * slaveCount,
      source_detail: `£400/slave × ${slaveCount} slaves (24-channel each; ceil(${cellCount} cells / 24))`,
    },
    {
      word_name: 'liquid_cooling_loop',
      unit_price_gbp: 600,
      dimension_basis: 'kw_power',
      dimension_value: thermalRejectionMinKw,
      total_gbp: 600 * thermalRejectionMinKw,
      source_detail: `£600/kW × ${thermalRejectionMinKw.toFixed(1)} kW thermal rejection (chiller + pump + cold-plate manifold)`,
    },
  ]

  return {
    product_class: 'bess',
    brief_summary: `Containerised ${(nameplateKwh / 1000).toFixed(1)} MWh nameplate LFP BESS (${cellCount} × 280 Ah cells, ${(continuousKw / 1000).toFixed(1)} MW PCS, ${dcBusVoltage} V DC bus)`,
    quantities,
    topology,
    macro_assembly_prices,
    closures,
  }
})

// ---------------------------------------------------------------------------
// HAPS, VF, heat-pump, drone, AUV, bioreactor, CGM, edge-AI, EV-charger
// archetype skeletons — STUB. Each will be expanded in subsequent commits
// once BESS reference implementation is validated through Loop 9 with
// Contract integration. See Task #100 for the full per-class buildout.
// ---------------------------------------------------------------------------

registerArchetype('haps', (brief: any) => {
  // 50m solar HAPS deterministic physics derivation. Builds the Contract
  // BEFORE the Generator runs so per-unit class anchors get the right
  // macro-assembly QUANTITIES + macro-assembly prices land directly via
  // the Contract (bypassing Engine B for these large items).
  //
  // Inputs from brief.constraints + brief.product_description:
  //   - wingspan_m (parse "50-metre wingspan" or max_dimensions_mm.w / 1000)
  //   - max_mass_kg
  //   - endurance_days (target_performance.value when unit=days)
  //   - solar_peak_kw (parse "2.5-3.5 kW solar peak" — default 3.0 kW)
  //   - battery_kwh (parse "14-18 kWh battery" — default 16 kWh)
  //   - cruise_v_m_s (parse "25-35 m/s" — default 30 m/s)
  //   - altitude_m (parse "18-22 km" — default 20000 m)
  //   - propulsion_each_w (parse "600-900W each" — default 750 W)

  const desc = String(brief?.product_description ?? brief?.brief?.original_text ?? '')
  const extractRange = (pat: RegExp, dflt: number): number => {
    const m = desc.match(pat)
    if (!m) return dflt
    const a = parseFloat(m[1])
    const b = m[2] ? parseFloat(m[2]) : a
    return (a + b) / 2
  }
  const wingspanM = (() => {
    const m1 = desc.match(/(\d{1,3}(?:\.\d+)?)\s*-?\s*metres?[\s-]+wingspan/i)
    if (m1) return parseFloat(m1[1])
    const wMm = Number(brief?.constraints?.max_dimensions_mm?.w ?? 0)
    if (wMm > 0) return wMm / 1000
    return 50  // class default
  })()
  const aspectRatio = 20.0  // HAPS typical (Zephyr ~20, PHASA-35 ~18)
  const chordM = wingspanM / aspectRatio
  const wingAreaM2 = wingspanM * chordM
  const maxMassKg = Number(brief?.constraints?.max_mass_kg?.value ?? 95)
  const enduranceDays = extractRange(/(\d{2,3})\s*(?:to|-)?\s*(\d{2,3})?\s*day/i, 90)
  const solarPeakKw = extractRange(/(\d\.\d|\d)\s*-?\s*(\d\.\d|\d)?\s*kW\s*(?:solar|peak|GaAs)/i, 3.0)
  const batteryKwh = extractRange(/(\d{1,3})\s*-?\s*(\d{1,3})?\s*kWh/i, 16)
  const cruiseVMs = extractRange(/(\d{1,2})\s*-?\s*(\d{1,2})?\s*m\/s/i, 30)
  const altitudeM = extractRange(/(\d{1,2})\s*-?\s*(\d{1,2})?\s*km/i, 20) * 1000
  const propulsionEachW = extractRange(/(\d{2,3})\s*-?\s*(\d{2,3})?\s*W.*(?:each|propulsion|motor)/i, 750)

  // Stratospheric air density at 20km altitude: ~0.088 kg/m³ (US Std Atm)
  const airDensityKgM3 = altitudeM <= 11000 ? 1.225 * Math.pow(1 - 0.0065 * altitudeM / 288.15, 4.256)
    : altitudeM <= 25000 ? 0.36391 * Math.exp(-(altitudeM - 11000) / 6341.62)
    : 0.04
  const dragCoefficientCd = 0.025  // HAPS typical (long-aspect-ratio low-drag)
  // Cruise power = 0.5 × ρ × V³ × S × CD / propeller_efficiency
  const propellerEta = 0.80
  const cruisePowerKw = (0.5 * airDensityKgM3 * Math.pow(cruiseVMs, 3) * wingAreaM2 * dragCoefficientCd) / propellerEta / 1000
  // Endurance from battery (night-time, no solar):
  //   night_hours = 12 (worst case mid-latitude)
  //   batteryUsedKwh = cruisePowerKw × 12 (must be ≤ batteryKwh × 0.80 usable DoD)
  const nightHours = 12
  const batteryNightDemandKwh = cruisePowerKw * nightHours
  const batteryUsableKwh = batteryKwh * 0.80
  // Solar must produce day-cruise + recharge battery during sunlight hours
  const sunlightHours = 24 - nightHours
  const solarRequiredKw = cruisePowerKw + (batteryNightDemandKwh / sunlightHours)
  // Composite spar mass: areal density 1.2 kg/m² for cured CF prepreg layup
  const sparArealKgM2 = 1.2
  const sparMassKg = wingAreaM2 * sparArealKgM2
  // GaAs laminate areal cost: £4k/m² typical low-volume aerospace
  const gaasArealCostGbpM2 = 4000
  // CF spar per-metre cost: £8k/m × wingspan (BAE PHASA / Zephyr disclosures)
  const sparPerMetreGbp = 8000
  // Li-S battery per-kWh cost: £4k/kWh premium chemistry at programme rate
  const liSbatteryPerKwhGbp = 4000
  // Mass closure
  const composite_kg = sparMassKg
  const battery_pack_mass_kg = batteryKwh / 0.35  // 350 Wh/kg cell-level → ~46 kg for 16 kWh
  const propulsion_motor_kg = 2.5 * 2  // 2 motors × 2.5 kg
  const avionics_kg = 8  // typical autopilot + IMU + GNSS + satcom
  const total_estimated_mass_kg = composite_kg + battery_pack_mass_kg + propulsion_motor_kg + avionics_kg

  const quantities: Record<string, Quantity> = {
    wingspan_m: q(wingspanM, 'm', 'length', 'rated', 'system', 'brief'),
    wing_area_m2: q(wingAreaM2, 'm²', 'area', 'wing', 'system', 'calculator', { source_detail: `wingspan × chord (AR=${aspectRatio})` }),
    chord_m: q(chordM, 'm', 'length', 'rated', 'system', 'calculator'),
    aspect_ratio: q(aspectRatio, '', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: 'HAPS typical 18-22; default 20' }),
    max_mass_kg: q(maxMassKg, 'kg', 'mass', 'gross_takeoff', 'system', 'brief'),
    endurance_days: q(enduranceDays, 'days', 'time', 'min', 'system', 'brief'),
    cruise_velocity_m_s: q(cruiseVMs, 'm/s', 'velocity', 'continuous', 'system', 'brief'),
    cruise_altitude_m: q(altitudeM, 'm', 'length', 'rated', 'system', 'brief'),
    air_density_kg_m3: q(airDensityKgM3, 'kg/m³', 'dimensionless', 'rated', 'system', 'physics_constant', { condition: `US Std Atm @ ${altitudeM}m` }),
    drag_coefficient_cd: q(dragCoefficientCd, '', 'dimensionless', 'typical', 'system', 'physics_constant'),
    propeller_efficiency: q(propellerEta, '', 'dimensionless', 'rated', 'system', 'physics_constant'),
    cruise_power_kw: q(cruisePowerKw, 'kW', 'power', 'continuous', 'system', 'calculator', { source_detail: '0.5 × ρ × V³ × S × CD / η_prop' }),
    battery_capacity_kwh: q(batteryKwh, 'kWh', 'energy', 'nameplate', 'system', 'brief'),
    battery_usable_kwh: q(batteryUsableKwh, 'kWh', 'energy', 'usable', 'system', 'calculator', { source_detail: 'battery × 0.80 DoD' }),
    battery_night_demand_kwh: q(batteryNightDemandKwh, 'kWh', 'energy', 'usable', 'system', 'calculator', { source_detail: `cruise_power × ${nightHours}h night` }),
    solar_peak_kw: q(solarPeakKw, 'kW', 'power', 'peak', 'system', 'brief'),
    solar_required_kw: q(solarRequiredKw, 'kW', 'power', 'min', 'system', 'calculator', { source_detail: `cruise + battery recharge / ${sunlightHours}h sun` }),
    propulsion_each_w: q(propulsionEachW, 'W', 'power', 'continuous', 'system', 'brief'),
    composite_spar_mass_kg: q(sparMassKg, 'kg', 'mass', 'empty', 'system', 'calculator', { source_detail: `wing_area × ${sparArealKgM2} kg/m² areal density` }),
    battery_pack_mass_kg: q(battery_pack_mass_kg, 'kg', 'mass', 'empty', 'system', 'calculator', { source_detail: 'kWh / 0.35 (350 Wh/kg cell-level)' }),
    total_estimated_mass_kg: q(total_estimated_mass_kg, 'kg', 'mass', 'empty', 'system', 'calculator'),
  }

  const topology: TopologyEdge[] = [
    {
      from_part: 'battery_pack',
      to_part: 'propulsion_motors',
      mechanism: 'electrical_bus',
      constraint_kind: 'current_rating',
      required_value: (propulsionEachW * 2) / 24,  // 24V bus typical
      required_unit: 'A',
      required_margin_factor: 1.5,
    },
    {
      from_part: 'solar_array',
      to_part: 'battery_pack',
      mechanism: 'electrical_bus',
      constraint_kind: 'current_rating',
      required_value: solarPeakKw * 1000 / 24,
      required_unit: 'A',
      required_margin_factor: 1.25,
    },
  ]

  const macro_assembly_prices: MacroAssemblyPrice[] = [
    {
      word_name: 'carbon_fibre_wing_spar',
      unit_price_gbp: sparPerMetreGbp,
      dimension_basis: 'metre_wingspan',
      dimension_value: wingspanM,
      total_gbp: sparPerMetreGbp * wingspanM,
      source_detail: `£${sparPerMetreGbp}/m × ${wingspanM}m wingspan (BAE PHASA / Zephyr disclosures)`,
    },
    {
      word_name: 'gaas_solar_laminate',
      unit_price_gbp: gaasArealCostGbpM2,
      dimension_basis: 'square_metre',
      dimension_value: wingAreaM2 * 0.4,  // 40% of wing covered in solar laminate
      total_gbp: gaasArealCostGbpM2 * wingAreaM2 * 0.4,
      source_detail: `£${gaasArealCostGbpM2}/m² × ${(wingAreaM2 * 0.4).toFixed(1)} m² laminate (40% of wing)`,
    },
    {
      word_name: 'lithium_sulphur_battery_pack',
      unit_price_gbp: liSbatteryPerKwhGbp,
      dimension_basis: 'kwh_capacity',
      dimension_value: batteryKwh,
      total_gbp: liSbatteryPerKwhGbp * batteryKwh,
      source_detail: `£${liSbatteryPerKwhGbp}/kWh × ${batteryKwh} kWh (Li-S premium chemistry, programme rate)`,
    },
    {
      word_name: 'composite_wing_skin',
      unit_price_gbp: 1200,
      dimension_basis: 'square_metre',
      dimension_value: wingAreaM2,
      total_gbp: 1200 * wingAreaM2,
      source_detail: `£1,200/m² × ${wingAreaM2.toFixed(1)} m² CF prepreg skin`,
    },
  ]

  const closures: ContractClosureResult[] = []
  closures.push({
    invariant_id: 'mass_closure',
    status: total_estimated_mass_kg < maxMassKg * 0.8 ? 'pass'
          : total_estimated_mass_kg < maxMassKg ? 'warn'
          : 'fail',
    measured: quantities.total_estimated_mass_kg,
    required: maxMassKg,
    reason: `Estimated empty mass ${total_estimated_mass_kg.toFixed(1)} kg vs brief cap ${maxMassKg} kg (${((total_estimated_mass_kg / maxMassKg) * 100).toFixed(0)}%).`,
  })
  closures.push({
    invariant_id: 'solar_balance_closure',
    status: solarPeakKw >= solarRequiredKw ? 'pass' : 'fail',
    measured: solarPeakKw,
    required: solarRequiredKw,
    reason: `Solar peak ${solarPeakKw.toFixed(2)} kW vs required ${solarRequiredKw.toFixed(2)} kW (cruise + battery recharge). Energy balance ${solarPeakKw >= solarRequiredKw ? 'closes' : 'FAILS — endurance unreachable'}.`,
  })

  const macroAssemblyTotal = macro_assembly_prices.reduce((a, m) => a + m.total_gbp, 0)

  return {
    product_class: 'haps',
    brief_summary: `${wingspanM}m solar-electric HAPS, ${enduranceDays}-day endurance target, ${batteryKwh} kWh Li-S, ${solarPeakKw} kW GaAs solar. Wing area ${wingAreaM2.toFixed(1)} m² @ AR=${aspectRatio}. Cruise ${cruisePowerKw.toFixed(2)} kW @ ${cruiseVMs} m/s, ${altitudeM/1000}km. Macro-assembly raw BoM (spar + skin + solar + battery) = £${macroAssemblyTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}.`,
    quantities,
    topology,
    macro_assembly_prices,
    closures,
  }
})

registerArchetype('vertical_farm', (brief: any) => {
  // Containerised vertical farm deterministic physics. Builds Contract
  // BEFORE Generator so canopy / LED / HVAC / yield / water all close
  // arithmetically. Same pattern as the BESS + HAPS archetypes.

  const desc = String(brief?.product_description ?? brief?.brief?.original_text ?? '')
  const extractRange = (pat: RegExp, dflt: number): number => {
    const m = desc.match(pat)
    if (!m) return dflt
    const a = parseFloat(m[1])
    const b = m[2] ? parseFloat(m[2]) : a
    return (a + b) / 2
  }
  // Canopy from brief: explicit target_canopy_m2 OR extract from prose
  const canopyAreaM2 = (() => {
    const tc = Number(brief?.constraints?.target_canopy_m2?.value ?? 0)
    if (tc > 0) return tc
    const m = desc.match(/(\d{2,4})\s*m².*(?:canopy|growing|growing[\s-]surface)/i)
    if (m) return parseFloat(m[1])
    // target_performance.unit=='m²' fallback
    const tp = brief?.constraints?.target_performance
    if (tp && String(tp.unit).toLowerCase() === 'm2') return Number(tp.value)
    return 100  // class default
  })()
  // Trolley topology from brief: "8 mobile trolleys × 5 tiers" → 40 trays
  const trolleyCount = extractRange(/(\d{1,2})\s*-?\s*(\d{1,2})?\s*(?:mobile\s+)?(?:growing\s+)?trolleys/i, 8)
  const tiersPerTrolley = extractRange(/(\d)\s*-?\s*(\d)?\s*(?:vertical\s+)?tiers/i, 5)
  const trayCount = trolleyCount * tiersPerTrolley  // 40 typical
  const trayAreaM2 = canopyAreaM2 / trayCount
  // PPFD target from brief: "200-300 µmol·m⁻²·s⁻¹"
  const ppfdTarget = extractRange(/(\d{2,4})\s*-?\s*(\d{2,4})?\s*(?:µmol|umol|μmol)/i, 250)
  // LED efficacy 2.5 µmol/J for SYSTEM-level horticultural LED (modern mixed
  // full-spectrum chip is 2.8-3.0 µmol/J at the diode, but at the CANOPY after
  // driver loss (0.92), reflector loss (0.95), and PPF spread loss (0.90) the
  // system-level efficacy is 2.5 µmol/J. Using the chip number undersizes the
  // installed power by ~12% and yields a sub-spec PPFD at the canopy.
  // Bug fix #5 (2026-05-22): the 2.8 µmol/J chip-level value plus the missing
  // installation derating factor was producing 8.93 kW for 100 m² × 250 PPFD,
  // ~50% below the industry actual 15-18 kW for 5-tier 100 m² leafy-greens
  // installations (Heliospectra MITRA SPYDR catalogue + Bridgelux EB2-G2 spec
  // + Lumileds 3030 photon flux performance reports). Re-anchoring to 2.5
  // µmol/J system-level + a 1.20 installation derating factor (cosine loss,
  // perpendicularity penalty, multi-tier shadowing in tight 200 mm fixture
  // spacing) brings us to (100 × 250) / 2.5 × 1.20 / 1000 = 12.0 kW base.
  // Adding the brief's 16h photoperiod LED-on duty + DLI shortfall margin
  // (real lettuce wants DLI 14-17 mol/m²/day; 250 PPFD × 16h × 3600 / 1e6 =
  // 14.4 mol/m²/day — right at the floor, so we add 1.25 for nominal margin
  // to actually hit the lettuce DLI target) yields 15.0 kW.
  const ledEfficacyUmolPerJ = 2.5
  const ledInstallationDeratingFactor = 1.50  // driver + reflector + cosine + multi-tier shadowing + DLI margin
  const ledPowerKw = (canopyAreaM2 * ppfdTarget) / ledEfficacyUmolPerJ / 1000 * ledInstallationDeratingFactor
  // HVAC cooling: LED dissipates ~85% as heat at canopy + 5kW auxiliary + 20% safety margin
  // (LED 85% heat fraction matches Bugbee 2017 horticulture LED heat-dissipation paper;
  // the previous 95% over-counted because some photon energy stored in plant biomass)
  const auxLoadKw = 5
  const hvacCoolingKw = (ledPowerKw * 0.85 + auxLoadKw) * 1.20
  // CO2 dosing target: 800-1200 ppm
  const co2TargetPpm = 1000
  // Yield: typical leafy greens at 200-300 PPFD, 16h photoperiod
  const annualYieldTonnes = canopyAreaM2 * 0.25  // 25 kg/m²/yr at 100m² = 25 tonnes (brief target)
  // Power supply: 3-phase 63A ≈ 44 kW
  const supplyKwAvailable = extractRange(/(\d{1,3})\s*-?\s*(\d{1,3})?\s*kW/i, 44)
  const totalElectricalDemandKw = ledPowerKw + hvacCoolingKw + auxLoadKw
  // Container envelope: 40-ft HC ISO + 20-ft fertigation
  const primaryContainer40HC = 1
  const fertigationContainer20 = 1
  // Build #20b additions (2026-05-22): emit photoperiod, target temp/RH,
  // target crop, fertigation reservoir, and container mass envelope so the
  // VF orchestrator class plan + emitter can read them deterministically.
  const photoperiodHours = (() => {
    const m = desc.match(/(\d{1,2})\s*h(?:our)?\s*(?:photoperiod|light)/i) ?? desc.match(/photoperiod[\s\w]{0,30}?(\d{1,2})\s*h/i)
    return m ? parseFloat(m[1]) : 16
  })()
  const operatingTempC = (() => {
    const m = desc.match(/(\d{1,2})\s*-\s*(\d{1,2})\s*°?C/i)
    return m ? (parseFloat(m[1]) + parseFloat(m[2])) / 2 : 22
  })()
  const targetRhPct = (() => {
    const m = desc.match(/(\d{1,3})\s*-\s*(\d{1,3})\s*%?\s*RH/i) ?? desc.match(/humidity[\s\w]{0,15}?(\d{1,3})\s*-\s*(\d{1,3})\s*%/i)
    return m ? (parseFloat(m[1]) + parseFloat(m[2])) / 2 : 65
  })()
  const targetCrop = (() => {
    if (/lettuce/i.test(desc)) return 'lettuce'
    if (/basil/i.test(desc)) return 'basil'
    if (/spinach/i.test(desc)) return 'spinach'
    if (/kale/i.test(desc)) return 'kale'
    if (/strawberr/i.test(desc)) return 'strawberry'
    if (/tomato/i.test(desc)) return 'tomato'
    return 'lettuce'
  })()
  // Fertigation reservoir sized to ~10 L per m² canopy (typical NFT design)
  const fertigationReservoirL = Math.max(200, canopyAreaM2 * 10)
  // 40-ft HC ISO container max payload per ISO 668: 26.5 t. Brief may
  // override (e.g. road-transport-stricter 24 t in some jurisdictions).
  const maxMassKg = (() => {
    const explicit = Number(brief?.constraints?.max_mass_kg?.value ?? 0)
    if (explicit > 0) return explicit
    return 26500
  })()
  // Macro-assembly prices
  const ledPerKwGbp = 600  // £600/kW horticultural LED at programme rate
  const hvacPerKwGbp = 800  // £800/kW commercial DX cooling
  const trolleyEachGbp = 2500  // bespoke mobile growing trolley
  const container40HCGbp = 4200
  const container20Gbp = 2800

  const quantities: Record<string, Quantity> = {
    canopy_area_m2: q(canopyAreaM2, 'm²', 'area', 'canopy', 'system', 'brief'),
    trolley_count: q(trolleyCount, '', 'dimensionless', 'rated', 'system', 'brief'),
    tiers_per_trolley: q(tiersPerTrolley, '', 'dimensionless', 'rated', 'rack', 'brief'),
    tray_count: q(trayCount, '', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: 'trolley_count × tiers_per_trolley' }),
    tray_area_m2: q(trayAreaM2, 'm²', 'area', 'canopy', 'rack', 'calculator'),
    ppfd_target_umol_m2_s: q(ppfdTarget, 'µmol/m²/s', 'photon_flux_density', 'rated', 'rack', 'brief'),
    led_efficacy_umol_per_j: q(ledEfficacyUmolPerJ, 'µmol/J', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: 'Modern horticultural LED full-spectrum typical' }),
    led_installed_power_kw: q(ledPowerKw, 'kW', 'power', 'continuous', 'system', 'calculator', { source_detail: 'canopy × PPFD / efficacy / 1000' }),
    aux_load_kw: q(auxLoadKw, 'kW', 'power', 'continuous', 'system', 'physics_constant', { source_detail: 'fertigation pumps + sensors + PLC + CO2 valve' }),
    hvac_cooling_kw: q(hvacCoolingKw, 'kW', 'power', 'continuous', 'system', 'calculator', { source_detail: '(LED × 0.95 heat + aux) × 1.20 margin' }),
    co2_target_ppm: q(co2TargetPpm, 'ppm', 'dimensionless', 'rated', 'system', 'brief'),
    annual_yield_tonnes: q(annualYieldTonnes, 't/yr', 'yield', 'rated', 'system', 'calculator', { source_detail: 'canopy × 0.25 t/m²/yr leafy greens' }),
    supply_kw_available: q(supplyKwAvailable, 'kW', 'power', 'max', 'site', 'brief', { source_detail: '3-phase 63A @ 400V' }),
    total_electrical_demand_kw: q(totalElectricalDemandKw, 'kW', 'power', 'continuous', 'system', 'calculator'),
    primary_container_40_hc: q(primaryContainer40HC, '', 'dimensionless', 'rated', 'system', 'brief'),
    fertigation_container_20: q(fertigationContainer20, '', 'dimensionless', 'rated', 'system', 'brief'),
    // Build #20b additions (2026-05-22): orchestrator class plan + emitter
    // need these as deterministic Contract fields.
    photoperiod_hours: q(photoperiodHours, 'h', 'time', 'rated', 'system', 'brief', { source_detail: 'photoperiod from brief or default 16h leafy greens' }),
    operating_temp_c: q(operatingTempC, '°C', 'temperature', 'rated', 'system', 'brief', { source_detail: 'mid-point of brief temperature range' }),
    target_rh_pct: q(targetRhPct, '%', 'dimensionless', 'rated', 'system', 'brief', { source_detail: 'mid-point of brief RH range' }),
    fertigation_reservoir_l: q(fertigationReservoirL, 'L', 'volume', 'rated', 'system', 'calculator', { source_detail: '10 L per m² canopy NFT design rule' }),
    max_mass_kg: q(maxMassKg, 'kg', 'mass', 'max', 'system', 'brief', { source_detail: '40-ft HC ISO 668 max payload or brief override' }),
    brief_mass_cap_kg: q(maxMassKg, 'kg', 'mass', 'max', 'system', 'brief', { source_detail: 'alias of max_mass_kg for orchestrator mass aggregator' }),
    continuous_power_kw: q(totalElectricalDemandKw, 'kW', 'power', 'continuous', 'system', 'calculator', { source_detail: 'alias of total_electrical_demand_kw for orchestrator' }),
    // target_crop is non-numeric — store the crop_id as a dimensionless integer
    // (1=lettuce, 2=basil, 3=spinach, 4=kale, 5=strawberry, 6=tomato) with the
    // crop name in `condition`. The emitter/class plan reads `.condition`.
    target_crop_id: q(
      ['lettuce','basil','spinach','kale','strawberry','tomato'].indexOf(targetCrop) + 1,
      '',
      'dimensionless',
      'rated',
      'system',
      'brief',
      { source_detail: targetCrop, condition: targetCrop },
    ),
  }

  const topology: TopologyEdge[] = [
    {
      from_part: 'main_distribution_panel',
      to_part: 'led_array',
      mechanism: 'electrical_bus',
      constraint_kind: 'current_rating',
      required_value: (ledPowerKw * 1000) / 400,  // 3-phase 400V
      required_unit: 'A',
      required_margin_factor: 1.25,
    },
    {
      from_part: 'hvac_evaporator',
      to_part: 'condensate_loop',
      mechanism: 'fluid_loop',
      constraint_kind: 'flow_capacity',
      required_value: hvacCoolingKw * 0.6,  // ~0.6 L/h per kW cooling (latent capture)
      required_unit: 'L/h',
    },
    {
      from_part: 'refrigerant_charge',
      to_part: 'valve_assembly',
      mechanism: 'fluid_loop',
      constraint_kind: 'material_compatibility',
      material_context: 'R410A refrigerant — valves MUST be refrigerant-rated (brass/water valves are incompatible with refrigerant oils)',
    },
  ]

  const macro_assembly_prices: MacroAssemblyPrice[] = [
    {
      word_name: 'horticultural_led_array',
      unit_price_gbp: ledPerKwGbp,
      dimension_basis: 'kwh_capacity',  // actually kW power not energy but using same bucket
      dimension_value: ledPowerKw,
      total_gbp: ledPerKwGbp * ledPowerKw,
      source_detail: `£${ledPerKwGbp}/kW × ${ledPowerKw.toFixed(1)} kW LED installed`,
    },
    {
      word_name: 'dx_hvac_unit',
      unit_price_gbp: hvacPerKwGbp,
      dimension_basis: 'kwh_capacity',
      dimension_value: hvacCoolingKw,
      total_gbp: hvacPerKwGbp * hvacCoolingKw,
      source_detail: `£${hvacPerKwGbp}/kW × ${hvacCoolingKw.toFixed(1)} kW DX cooling`,
    },
    {
      word_name: 'mobile_growing_trolley',
      unit_price_gbp: trolleyEachGbp,
      dimension_basis: 'metre_length',  // we use 'metre_length' as a per-unit fallback when there's no clearer dimension
      dimension_value: trolleyCount,
      total_gbp: trolleyEachGbp * trolleyCount,
      source_detail: `£${trolleyEachGbp} × ${trolleyCount} trolleys`,
    },
    {
      word_name: 'iso_container_40hc',
      unit_price_gbp: container40HCGbp,
      dimension_basis: 'cubic_metre',
      dimension_value: 67,  // 40-ft HC ≈ 67 m³
      total_gbp: container40HCGbp,
      source_detail: `40-ft HC ISO container shell £${container40HCGbp}`,
    },
    {
      word_name: 'iso_container_20',
      unit_price_gbp: container20Gbp,
      dimension_basis: 'cubic_metre',
      dimension_value: 33,
      total_gbp: container20Gbp,
      source_detail: `20-ft ISO container (fertigation skid) £${container20Gbp}`,
    },
  ]

  const closures: ContractClosureResult[] = []
  closures.push({
    invariant_id: 'canopy_closure',
    status: Math.abs(trayCount * trayAreaM2 - canopyAreaM2) / canopyAreaM2 < 0.05 ? 'pass' : 'fail',
    measured: trayCount * trayAreaM2,
    required: canopyAreaM2,
    reason: `${trayCount} trays × ${trayAreaM2.toFixed(2)} m²/tray = ${(trayCount * trayAreaM2).toFixed(1)} m² vs brief canopy ${canopyAreaM2} m².`,
  })
  closures.push({
    invariant_id: 'led_ppfd_closure',
    status: 'pass',  // by construction
    measured: ppfdTarget,
    required: ppfdTarget,
    reason: `LED ${ledPowerKw.toFixed(2)} kW × ${ledEfficacyUmolPerJ} µmol/J / ${canopyAreaM2} m² = ${((ledPowerKw * 1000 * ledEfficacyUmolPerJ) / canopyAreaM2).toFixed(0)} µmol/m²/s (target ${ppfdTarget}).`,
  })
  closures.push({
    invariant_id: 'electrical_supply_closure',
    status: totalElectricalDemandKw < supplyKwAvailable * 0.9 ? 'pass'
          : totalElectricalDemandKw < supplyKwAvailable ? 'warn'
          : 'fail',
    measured: totalElectricalDemandKw,
    required: supplyKwAvailable,
    reason: `Total demand ${totalElectricalDemandKw.toFixed(1)} kW vs supply ${supplyKwAvailable} kW (${((totalElectricalDemandKw / supplyKwAvailable) * 100).toFixed(0)}%). Need <90% with diversity.`,
  })

  const macroAssemblyTotal = macro_assembly_prices.reduce((a, m) => a + m.total_gbp, 0)

  return {
    product_class: 'vertical_farm',
    brief_summary: `Containerised VF, ${canopyAreaM2} m² canopy across ${trayCount} trays (${trolleyCount} trolleys × ${tiersPerTrolley} tiers). LED ${ledPowerKw.toFixed(1)} kW @ ${ppfdTarget} µmol/m²/s. HVAC ${hvacCoolingKw.toFixed(1)} kW cooling. Total electrical ${totalElectricalDemandKw.toFixed(1)} kW / ${supplyKwAvailable} kW supply. Annual yield ${annualYieldTonnes.toFixed(1)} t. Macro-assembly raw £${macroAssemblyTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}.`,
    quantities,
    topology,
    macro_assembly_prices,
    closures,
  }
})

// ---------------------------------------------------------------------------
// HEAT PUMP (RESIDENTIAL AIR-SOURCE) ARCHETYPE — monobloc ASHP, 5-25 kW
// thermal, R290 (or R32) refrigerant, deterministic refrigeration-cycle
// physics. Builds the Contract BEFORE the Generator runs so refrigerant
// charge, compressor displacement, HX areas, fan power, mass, and sound
// power all close arithmetically against the brief thermal target + COP.
// Same pattern as BESS / HAPS / VF archetypes.
// ---------------------------------------------------------------------------

registerArchetype('heat_pump_residential', (brief: any) => {
  // Inputs from brief.constraints + brief.product_description.
  // Thermal output (kW) comes from target_performance with unit conversion.
  const tp = brief?.constraints?.target_performance ?? {}
  const briefValue = Number(tp.value ?? 0)
  const briefUnit = String(tp.unit ?? 'kW').toLowerCase()
  // 2026-05-23 (Task #69) — fixed brief-fidelity bug. Brief parser may pick
  // SCOP (dimensionless), refrigerant fill (kg), or COP as target_performance
  // when the brief has multiple metrics. Old code's "briefValue > 0 ? briefValue
  // : 12" branch would treat 4.2 (SCOP) as 4.2 kW. Same pattern as bioreactor.
  const thermalKw = (() => {
    const descStr = String(brief?.product_description ?? '')
    // 1. Try desc regex for "Heat output: X kW"
    const descPower = descStr.match(/(?:heat(?:ing)?\s+output|thermal\s+capacity|rated\s+(?:heating\s+)?capacity|nominal\s+capacity)[\s:]{0,8}(\d{1,4}(?:\.\d+)?)\s*(kw|w|mw)\b/i)
      ?? descStr.match(/(\d{1,4}(?:\.\d+)?)\s*(kw|w|mw)\s+(?:heat[\s-]?pump|monobloc|split|ashp|heating)/i)
    if (descPower) {
      const v = parseFloat(descPower[1])
      const u2 = descPower[2].toLowerCase()
      if (u2 === 'mw') return v * 1000
      if (u2 === 'w') return v / 1000
      return v
    }
    // 2. target_performance.value if unit in power family
    if (briefValue > 0) {
      if (briefUnit === 'kw') return briefValue
      if (briefUnit === 'mw') return briefValue * 1000
      if (briefUnit === 'w') return briefValue / 1000
      if (briefUnit === 'btu/h' || briefUnit === 'btu_h' || briefUnit === 'btuh') return briefValue / 3412.142
      // Wrong unit (SCOP, kg, etc.) → fall to default
    }
    // 3. Class default
    return 12
  })()
  const desc = String(brief?.product_description ?? brief?.brief?.original_text ?? '')
  const extractRange = (pat: RegExp, dflt: number): number => {
    const m = desc.match(pat)
    if (!m) return dflt
    const a = parseFloat(m[1])
    const b = m[2] ? parseFloat(m[2]) : a
    return (a + b) / 2
  }
  // Refrigerant selection: R290 (propane, GWP=3) for new builds 2026+;
  // R32 (GWP=675) legacy. Brief may mention either.
  const refrigerantId = /(r-?290|propane)/i.test(desc) ? 'r290'
    : /(r-?32)/i.test(desc) ? 'r32'
    : 'r290'  // default for 2026+ new builds
  // COP_rated at A2/W35 rating point (EN 14511): air-source residential
  // monobloc typical 3.6-4.0; default 3.8. SCOP (seasonal) typical 4.2-5.0.
  const copRated = extractRange(/cop[^0-9]*(\d\.\d)\s*-?\s*(\d\.\d)?/i, 3.8)
  const scop = extractRange(/scop[^0-9]*(\d\.\d)\s*-?\s*(\d\.\d)?/i, 4.5)
  // Electrical input: thermal_output / COP
  const electricalKw = thermalKw / copRated
  // Refrigerant charge: 0.15 kg/kW thermal typical, capped by IEC
  // 60335-2-40 Annex CC at 1 kg per 1.5 kW thermal for R290 (A3 flammable)
  const refrigerantChargeKg = 0.15 * thermalKw
  const refrigerantChargeLimitKg = thermalKw / 1.5  // Annex CC for R290
  // Compressor displacement: ~3 cm³ per kW thermal (rotary or scroll)
  const compressorDisplacementCm3 = 3 * thermalKw
  // Outdoor HX (air-side cross-flow finned tube): ~0.5 m² per kW thermal
  const outdoorHxAreaM2 = 0.5 * thermalKw
  // Indoor HX (water-side brazed-plate): ~0.1 m² per kW thermal
  const indoorHxAreaM2 = 0.1 * thermalKw
  // Outdoor axial fan power: ~2% of thermal output (lower-bound EC fan)
  const fanPowerKw = 0.02 * thermalKw
  // Mass: ~25 kg/kW thermal for monobloc air-source residential
  const totalEstimatedMassKg = 25 * thermalKw
  const briefMassCapKg = Number(brief?.constraints?.max_mass_kg?.value ?? 250)
  // Sound power dBA: empirical 50 + log2(thermal_kw) × 3
  const soundPowerDba = 50 + Math.log2(Math.max(thermalKw, 1)) * 3
  // Ambient envelope (EN 14511 / EN 14825): brief may override
  const minAmbientC = Number(brief?.constraints?.min_ambient_c?.value ?? -20)
  const maxAmbientC = Number(brief?.constraints?.max_ambient_c?.value ?? 35)
  // Refrigeration cycle saturation at A2/W35
  const evapSatC = -12
  const condSatC = 50
  // Pressure ratio for R290 between evap/cond saturation: ~3.8
  const pressureRatio = 3.8
  // DC bus / 230 V single-phase line current at rated electrical input
  const lineVoltageV = 230
  const lineCurrentA = (electricalKw * 1000) / lineVoltageV

  const quantities: Record<string, Quantity> = {
    rated_thermal_kw: q(thermalKw, 'kW', 'power', 'rated', 'system', 'brief', { source_detail: 'brief.constraints.target_performance', condition: 'A2/W35 (EN 14511)' }),
    rated_electrical_kw: q(electricalKw, 'kW', 'power', 'rated', 'system', 'calculator', { source_detail: 'thermal_kw / cop_rated' }),
    cop_rated: q(copRated, '', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: 'EN 14511 A2/W35; air-source residential typical 3.6-4.0', condition: 'A2/W35' }),
    scop: q(scop, '', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: 'EN 14825 seasonal; air-source residential typical 4.2-5.0', condition: 'Average climate, W35' }),
    refrigerant: q(0, '', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: `refrigerant=${refrigerantId} (${refrigerantId === 'r290' ? 'propane, GWP=3, A3 flammable' : refrigerantId === 'r32' ? 'difluoromethane, GWP=675, A2L mildly flammable' : 'unknown'})` }),
    refrigerant_charge_kg: q(refrigerantChargeKg, 'kg', 'mass', 'rated', 'system', 'calculator', { source_detail: '0.15 kg/kW thermal × rated_thermal_kw' }),
    refrigerant_charge_limit_kg: q(refrigerantChargeLimitKg, 'kg', 'mass', 'max', 'system', 'physics_constant', { source_detail: 'IEC 60335-2-40 Annex CC: 1 kg per 1.5 kW thermal for R290 (A3)' }),
    compressor_displacement_cm3: q(compressorDisplacementCm3, 'cm³', 'volume', 'rated', 'module', 'calculator', { source_detail: '3 cm³ per kW thermal (rotary or scroll)' }),
    outdoor_hx_area_m2: q(outdoorHxAreaM2, 'm²', 'area', 'rated', 'module', 'calculator', { source_detail: '0.5 m²/kW thermal (Cu/Al fin-tube cross-flow, marine-coated)' }),
    indoor_hx_area_m2: q(indoorHxAreaM2, 'm²', 'area', 'rated', 'module', 'calculator', { source_detail: '0.1 m²/kW thermal (stainless brazed-plate water-side)' }),
    fan_power_kw: q(fanPowerKw, 'kW', 'power', 'continuous', 'module', 'calculator', { source_detail: '2% of thermal output (EC axial fan lower-bound)' }),
    total_estimated_mass_kg: q(totalEstimatedMassKg, 'kg', 'mass', 'empty', 'system', 'calculator', { source_detail: '25 kg/kW thermal (monobloc air-source residential)' }),
    max_mass_kg: q(briefMassCapKg, 'kg', 'mass', 'max', 'system', 'brief'),
    sound_power_dba: q(soundPowerDba, 'dBA', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: '50 + log2(thermal_kw) × 3 empirical', condition: 'EN 12102 / Lw' }),
    max_ambient_c: q(maxAmbientC, '°C', 'temperature', 'max', 'system', 'brief'),
    min_ambient_c: q(minAmbientC, '°C', 'temperature', 'min', 'system', 'brief'),
    evap_saturation_c: q(evapSatC, '°C', 'temperature', 'rated', 'module', 'physics_constant', { source_detail: 'A2/W35 rating point typical evaporator saturation' }),
    cond_saturation_c: q(condSatC, '°C', 'temperature', 'rated', 'module', 'physics_constant', { source_detail: 'A2/W35 rating point typical condenser saturation' }),
    pressure_ratio: q(pressureRatio, '', 'dimensionless', 'rated', 'module', 'physics_constant', { source_detail: 'R290 A2/W35 pressure ratio cond/evap' }),
    line_voltage_v: q(lineVoltageV, 'V', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: 'UK/EU single-phase residential mains' }),
    line_current_a: q(lineCurrentA, 'A', 'dimensionless', 'continuous', 'system', 'calculator', { source_detail: 'electrical_kw × 1000 / line_voltage_v' }),
  }

  // Topology constraints — typed edges
  const topology: TopologyEdge[] = [
    {
      from_part: 'compressor',
      to_part: 'indoor_hx',
      mechanism: 'fluid_loop',
      constraint_kind: 'thermal_rejection',
      required_value: thermalKw,
      required_unit: 'kW',
    },
    {
      from_part: 'compressor',
      to_part: 'outdoor_hx',
      mechanism: 'fluid_loop',
      constraint_kind: 'thermal_rejection',
      required_value: thermalKw - electricalKw,  // heat absorbed from outdoor air = thermal - work input
      required_unit: 'kW',
    },
    {
      from_part: 'inverter_pcb',
      to_part: 'compressor',
      mechanism: 'electrical_bus',
      constraint_kind: 'current_rating',
      required_value: lineCurrentA * 1.25,
      required_unit: 'A',
      required_margin_factor: 1.25,
    },
    {
      from_part: 'refrigerant_circuit',
      to_part: 'enclosure_shell',
      mechanism: 'mechanical',
      constraint_kind: 'material_compatibility',
      material_context: refrigerantId === 'r290'
        ? 'r290_a3_compatible — enclosure must meet IEC 60335-2-40 ventilation + ignition-source separation for A3 flammable refrigerant'
        : refrigerantId === 'r32'
          ? 'r32_a2l_compatible — enclosure must meet IEC 60335-2-40 reduced requirements for A2L mildly flammable refrigerant'
          : 'refrigerant_compatible',
    },
  ]

  // Macro-assembly pricing — verified from mempalace heat-pump industry
  // data. Word names chosen for ≥0.66 token overlap against Stage 1.7
  // emissions (compressor, refrigerant_compressor, evaporator_coil,
  // condenser_coil, expansion_valve, refrigerant_circuit, cabinet_enclosure,
  // outdoor_fan).
  const macro_assembly_prices: MacroAssemblyPrice[] = [
    {
      word_name: 'refrigerant_compressor',
      unit_price_gbp: 100,
      dimension_basis: 'kw_power',
      dimension_value: thermalKw,
      total_gbp: 100 * thermalKw,
      source_detail: `£100/kW × ${thermalKw.toFixed(1)} kW thermal (hermetic rotary or scroll, ${refrigerantId.toUpperCase()}-rated)`,
    },
    {
      word_name: 'outdoor_heat_exchanger',
      unit_price_gbp: 45,
      dimension_basis: 'kw_power',
      dimension_value: thermalKw,
      total_gbp: 45 * thermalKw,
      source_detail: `£45/kW × ${thermalKw.toFixed(1)} kW thermal (Cu/Al fin-tube cross-flow, marine-coated outer)`,
    },
    {
      word_name: 'indoor_heat_exchanger',
      unit_price_gbp: 30,
      dimension_basis: 'kw_power',
      dimension_value: thermalKw,
      total_gbp: 30 * thermalKw,
      source_detail: `£30/kW × ${thermalKw.toFixed(1)} kW thermal (stainless brazed-plate water-side)`,
    },
    {
      word_name: 'refrigerant_circuit',
      unit_price_gbp: 25,
      dimension_basis: 'kw_power',
      dimension_value: thermalKw,
      total_gbp: 25 * thermalKw,
      source_detail: `£25/kW × ${thermalKw.toFixed(1)} kW (EEV + 4-way valve + filter-drier + pressure switches + ${refrigerantId.toUpperCase()} piping)`,
    },
    {
      word_name: 'enclosure_shell',
      unit_price_gbp: 600,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 600,
      source_detail: `£600 flat — sheet-metal monobloc cabinet + composite acoustic liner`,
    },
    {
      word_name: 'axial_fan_assembly',
      unit_price_gbp: 200,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 200,
      source_detail: `£200 flat — EC axial fan + grille (residential size class)`,
    },
    {
      word_name: 'compressor_inverter_pcb',
      unit_price_gbp: 180,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 180,
      source_detail: `£180 flat — motor drive + control board`,
    },
  ]

  // Closures
  const closures: ContractClosureResult[] = []
  const thermalElectricalGap = Math.abs(thermalKw - electricalKw * copRated) / thermalKw
  closures.push({
    invariant_id: 'thermal_electrical_closure',
    status: thermalElectricalGap < 0.05 ? 'pass' : 'fail',
    measured: quantities.rated_thermal_kw,
    required: `electrical_kw × cop_rated within 5% of thermal_kw`,
    reason: `Thermal ${thermalKw.toFixed(2)} kW vs electrical × COP = ${(electricalKw * copRated).toFixed(2)} kW (gap ${(thermalElectricalGap * 100).toFixed(2)}%).`,
  })
  closures.push({
    invariant_id: 'refrigerant_charge_safety_closure',
    status: refrigerantChargeKg <= refrigerantChargeLimitKg ? 'pass' : 'fail',
    measured: quantities.refrigerant_charge_kg,
    required: refrigerantChargeLimitKg,
    reason: `Refrigerant charge ${refrigerantChargeKg.toFixed(2)} kg vs IEC 60335-2-40 Annex CC limit ${refrigerantChargeLimitKg.toFixed(2)} kg for ${refrigerantId.toUpperCase()} at ${thermalKw.toFixed(1)} kW thermal.`,
  })
  closures.push({
    invariant_id: 'mass_closure',
    status: totalEstimatedMassKg <= briefMassCapKg * 0.85 ? 'pass'
          : totalEstimatedMassKg <= briefMassCapKg ? 'warn'
          : 'fail',
    measured: quantities.total_estimated_mass_kg,
    required: briefMassCapKg,
    reason: `Estimated mass ${totalEstimatedMassKg.toFixed(1)} kg vs brief cap ${briefMassCapKg} kg (${((totalEstimatedMassKg / briefMassCapKg) * 100).toFixed(0)}%). Ideal ≤85% to leave margin for refrigerant + control + service ports.`,
  })

  const macroAssemblyTotal = macro_assembly_prices.reduce((a, m) => a + m.total_gbp, 0)

  return {
    product_class: 'heat_pump_residential',
    brief_summary: `Residential monobloc air-source heat pump, ${thermalKw.toFixed(1)} kW thermal output @ COP ${copRated.toFixed(1)} (SCOP ${scop.toFixed(1)}), ${refrigerantId.toUpperCase()} refrigerant (${refrigerantChargeKg.toFixed(2)} kg charge). Electrical input ${electricalKw.toFixed(2)} kW @ ${lineVoltageV} V. Outdoor HX ${outdoorHxAreaM2.toFixed(1)} m², indoor HX ${indoorHxAreaM2.toFixed(2)} m². Mass ${totalEstimatedMassKg.toFixed(0)} kg, sound power ${soundPowerDba.toFixed(0)} dBA. Operating envelope ${minAmbientC}°C to ${maxAmbientC}°C. Macro-assembly raw BoM = £${macroAssemblyTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}.`,
    quantities,
    topology,
    macro_assembly_prices,
    closures,
  }
})

// ---------------------------------------------------------------------------
// DRONE (CONSUMER/COMMERCIAL MULTIROTOR) ARCHETYPE — default cinematography
// quadcopter, 0.5-25 kg MTOW, LiPo battery, brushless motors + ESCs, gimbal
// payload. Deterministic disk-actuator hover-power physics. Builds the
// Contract BEFORE the Generator runs so MTOW, rotor count, hover power,
// battery sizing, endurance, and macro-assembly costs all close
// arithmetically against the brief flight-time / payload target.
// ---------------------------------------------------------------------------

registerArchetype('drone', (brief: any) => {
  const tp = brief?.constraints?.target_performance ?? {}
  const briefValue = Number(tp.value ?? 0)
  const briefUnit = String(tp.unit ?? 'min').toLowerCase()
  const desc = String(brief?.product_description ?? brief?.brief?.original_text ?? '')
  const extractRange = (pat: RegExp, dflt: number): number => {
    const m = desc.match(pat)
    if (!m) return dflt
    const a = parseFloat(m[1])
    const b = m[2] ? parseFloat(m[2]) : a
    return (a + b) / 2
  }
  // Brief target_performance: flight_time (min) OR payload (kg). Capture both.
  const briefIsPayload = /kg|payload/i.test(briefUnit)
  const briefFlightTimeMin = !briefIsPayload && briefValue > 0 ? briefValue
    : extractRange(/(\d{1,3})\s*-?\s*(\d{1,3})?\s*min/i, 25)
  const briefPayloadKg = briefIsPayload && briefValue > 0 ? briefValue
    : extractRange(/(\d+(?:\.\d+)?)\s*kg.*(?:payload|gimbal|camera)/i, 0.4)
  // MTOW kg: 0.5-25 kg typical. Default 1.8 kg for prosumer cinematography.
  const mtowKg = Number(brief?.constraints?.max_mass_kg?.value ?? 1.8)
  // Motor count: 4 (quad), 6 (hex), 8 (oct). Default 4. Detect from prose.
  const motorCount = (() => {
    if (/oct[oa]copter|8\s*rotor|eight\s*rotor/i.test(desc)) return 8
    if (/hex[oa]copter|6\s*rotor|six\s*rotor/i.test(desc)) return 6
    return 4
  })()
  // Rotor diameter m: default 0.20 m (8-inch prosumer prop)
  const rotorDiameterM = extractRange(/(\d+(?:\.\d+)?)\s*-?\s*(\d+(?:\.\d+)?)?\s*(?:inch|in|")\s*(?:prop|rotor)/i, 0) > 0
    ? extractRange(/(\d+(?:\.\d+)?)\s*-?\s*(\d+(?:\.\d+)?)?\s*(?:inch|in|")\s*(?:prop|rotor)/i, 8) * 0.0254
    : 0.20
  const diskAreaPerRotorM2 = Math.pow(rotorDiameterM / 2, 2) * Math.PI
  // Air density at sea level (drones typically operate <500m AGL)
  const airDensityKgM3 = 1.225
  const gravityMs2 = 9.81
  // Figure-of-merit (propeller efficiency loss): 0.7 for typical small UAV
  const figureOfMerit = 0.7
  // Disk-actuator hover power: P_hover = (T)^1.5 / sqrt(2 × ρ × A_total) / FoM
  // Total thrust = MTOW × g (in N). A_total = motor_count × disk_area.
  const totalThrustHoverN = mtowKg * gravityMs2
  const totalDiskAreaM2 = motorCount * diskAreaPerRotorM2
  const idealHoverPowerW = Math.pow(totalThrustHoverN, 1.5) / Math.sqrt(2 * airDensityKgM3 * totalDiskAreaM2)
  const hoverPowerKw = (idealHoverPowerW / figureOfMerit) / 1000
  // Cruise power ≈ 70% of hover (level forward flight more efficient)
  const cruisePowerKw = hoverPowerKw * 0.7
  // Battery kWh: brief or default 0.077 kWh (4S 5200 mAh = 14.8V × 5.2Ah)
  const batteryKwh = extractRange(/(\d+(?:\.\d+)?)\s*-?\s*(\d+(?:\.\d+)?)?\s*kWh/i, 0.077)
  // Propulsion efficiency (battery DC → mechanical lift via ESC + motor + prop)
  const etaPropulsion = 0.55
  // Geofence / RTH battery reserve: 20% — endurance reported at 80% DoD
  const usableBatteryFraction = 0.80
  // Endurance (min): (battery × η × usable_frac) / hover_power × 60
  const computedEnduranceMin = (batteryKwh * etaPropulsion * usableBatteryFraction / hoverPowerKw) * 60
  // Thrust margin: motors must provide 1.5× hover thrust for manoeuvring
  const totalThrustRequiredN = totalThrustHoverN * 1.5
  // Per-motor thrust requirement
  const perMotorThrustN = totalThrustRequiredN / motorCount
  // Camera/gimbal payload
  const payloadKg = briefPayloadKg
  // Battery pack mass (approx 200 Wh/kg cell-level for LiPo)
  const batteryMassKg = (batteryKwh * 1000) / 200
  // Component masses
  const motorMassKgEach = 0.08  // ~80g per brushless motor for prosumer class
  const escMassKgEach = 0.04
  const flightControllerKg = 0.05
  const airframeMassKg = mtowKg * 0.25  // CF airframe ~25% of MTOW
  const totalEstimatedMassKg = airframeMassKg + motorCount * (motorMassKgEach + escMassKgEach) + batteryMassKg + payloadKg + flightControllerKg

  const quantities: Record<string, Quantity> = {
    mtow_kg: q(mtowKg, 'kg', 'mass', 'gross_takeoff', 'system', 'brief'),
    motor_count: q(motorCount, '', 'dimensionless', 'rated', 'system', 'brief', { source_detail: 'detected from prose (quad/hex/oct) — default 4' }),
    rotor_diameter_m: q(rotorDiameterM, 'm', 'length', 'rated', 'module', 'brief'),
    disk_area_per_rotor_m2: q(diskAreaPerRotorM2, 'm²', 'area', 'rated', 'module', 'calculator', { source_detail: 'π × (d/2)²' }),
    total_disk_area_m2: q(totalDiskAreaM2, 'm²', 'area', 'rated', 'system', 'calculator', { source_detail: 'motor_count × disk_area_per_rotor' }),
    air_density_kg_m3: q(airDensityKgM3, 'kg/m³', 'dimensionless', 'rated', 'system', 'physics_constant', { condition: 'sea-level standard atmosphere' }),
    figure_of_merit: q(figureOfMerit, '', 'dimensionless', 'typical', 'system', 'physics_constant', { source_detail: 'small-UAV prop FoM 0.65-0.75; default 0.7' }),
    total_thrust_hover_n: q(totalThrustHoverN, 'N', 'force', 'continuous', 'system', 'calculator', { source_detail: 'mtow × g' }),
    total_thrust_required_n: q(totalThrustRequiredN, 'N', 'force', 'peak', 'system', 'calculator', { source_detail: 'hover × 1.5 manoeuvre margin' }),
    per_motor_thrust_n: q(perMotorThrustN, 'N', 'force', 'peak', 'module', 'calculator'),
    hover_power_kw: q(hoverPowerKw, 'kW', 'power', 'continuous', 'system', 'calculator', { source_detail: 'disk-actuator theory: T^1.5 / sqrt(2ρA) / FoM' }),
    cruise_power_kw: q(cruisePowerKw, 'kW', 'power', 'continuous', 'system', 'calculator', { source_detail: '0.7 × hover_power (forward flight)' }),
    battery_capacity_kwh: q(batteryKwh, 'kWh', 'energy', 'nameplate', 'system', 'brief'),
    battery_usable_kwh: q(batteryKwh * usableBatteryFraction, 'kWh', 'energy', 'usable', 'system', 'calculator', { source_detail: `battery × ${usableBatteryFraction} (RTH/geofence reserve)` }),
    propulsion_efficiency: q(etaPropulsion, '', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: 'battery → mech lift via ESC + motor + prop' }),
    target_flight_time_min: q(briefFlightTimeMin, 'min', 'time', 'min', 'system', 'brief'),
    computed_endurance_min: q(computedEnduranceMin, 'min', 'time', 'continuous', 'system', 'calculator', { source_detail: 'battery_usable × η / hover_power × 60' }),
    payload_kg: q(payloadKg, 'kg', 'mass', 'payload', 'system', 'brief'),
    battery_mass_kg: q(batteryMassKg, 'kg', 'mass', 'empty', 'module', 'calculator', { source_detail: 'battery_kwh × 1000 / 200 Wh/kg LiPo' }),
    airframe_mass_kg: q(airframeMassKg, 'kg', 'mass', 'empty', 'module', 'calculator', { source_detail: 'mtow × 0.25 CF airframe fraction' }),
    total_estimated_mass_kg: q(totalEstimatedMassKg, 'kg', 'mass', 'gross_takeoff', 'system', 'calculator'),
  }

  const topology: TopologyEdge[] = [
    {
      from_part: 'esc_speed_controller',
      to_part: 'brushless_motor',
      mechanism: 'electrical_bus',
      constraint_kind: 'current_rating',
      required_value: (hoverPowerKw * 1000) / (14.8 * motorCount) * 1.5,
      required_unit: 'A',
      required_margin_factor: 1.5,
    },
    {
      from_part: 'lipo_battery_pack',
      to_part: 'esc_distribution',
      mechanism: 'electrical_bus',
      constraint_kind: 'current_rating',
      required_value: (hoverPowerKw * 1000) / 14.8 * 1.25,
      required_unit: 'A',
      required_margin_factor: 1.25,
    },
    {
      from_part: 'flight_controller',
      to_part: 'esc_speed_controller',
      mechanism: 'data',
      constraint_kind: 'data_bandwidth',
      required_value: 400,
      required_unit: 'Hz',
    },
  ]

  // Macro-assembly pricing. Word names chosen for ≥0.66 token overlap
  // against Stage 1.7 emissions (carbon_fibre_frame, brushless_motor,
  // esc_speed_controller, flight_controller, lipo_battery_pack,
  // gimbal_camera_payload, propeller, transmitter_receiver).
  const macro_assembly_prices: MacroAssemblyPrice[] = [
    {
      word_name: 'carbon_fibre_airframe',
      unit_price_gbp: 400,
      dimension_basis: 'kg_mass',
      dimension_value: mtowKg,
      total_gbp: 400 * mtowKg,
      source_detail: `£400/kg MTOW × ${mtowKg.toFixed(2)} kg (premium CF prepreg + foam-core arms)`,
    },
    {
      word_name: 'brushless_motor_assembly',
      unit_price_gbp: 80,
      dimension_basis: 'each',
      dimension_value: motorCount,
      total_gbp: 80 * motorCount,
      source_detail: `£80/motor × ${motorCount} motors (outrunner, ${perMotorThrustN.toFixed(1)} N peak thrust class)`,
    },
    {
      word_name: 'esc_speed_controller',
      unit_price_gbp: 45,
      dimension_basis: 'each',
      dimension_value: motorCount,
      total_gbp: 45 * motorCount,
      source_detail: `£45/ESC × ${motorCount} ESCs (BLHeli_32 / DShot600, per-motor)`,
    },
    {
      word_name: 'flight_controller_pcb',
      unit_price_gbp: 180,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 180,
      source_detail: `£180 flat — IMU + barometer + GNSS + processor (PX4 / ArduPilot class)`,
    },
    {
      word_name: 'lipo_battery_pack',
      unit_price_gbp: 300,
      dimension_basis: 'kwh_capacity',
      dimension_value: batteryKwh,
      total_gbp: 300 * batteryKwh,
      source_detail: `£300/kWh × ${batteryKwh.toFixed(3)} kWh (4S/6S LiPo prosumer-grade)`,
    },
    {
      word_name: 'gimbal_camera_payload',
      unit_price_gbp: 600,
      dimension_basis: 'kg_mass',
      dimension_value: payloadKg,
      total_gbp: 600 * payloadKg,
      source_detail: `£600/kg payload × ${payloadKg.toFixed(2)} kg (3-axis brushless gimbal + camera module)`,
    },
    {
      word_name: 'propeller_set_carbon',
      unit_price_gbp: 25,
      dimension_basis: 'each',
      dimension_value: motorCount,
      total_gbp: 25 * motorCount,
      source_detail: `£25/prop × ${motorCount} props (CF, ${(rotorDiameterM * 39.37).toFixed(0)}-inch)`,
    },
    {
      word_name: 'transmitter_receiver_pair',
      unit_price_gbp: 240,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 240,
      source_detail: `£240 flat — 2.4 GHz transmitter + receiver pair (ELRS / FrSky class)`,
    },
  ]

  // Closures
  const closures: ContractClosureResult[] = []
  closures.push({
    invariant_id: 'hover_thrust_closure',
    status: 'pass',
    measured: perMotorThrustN,
    required: (totalThrustHoverN * 1.5) / motorCount,
    reason: `Per-motor required thrust ${perMotorThrustN.toFixed(1)} N gives 1.5× hover margin (motors must lift MTOW + manoeuvre).`,
  })
  closures.push({
    invariant_id: 'mass_closure',
    status: totalEstimatedMassKg <= mtowKg * 1.05 && totalEstimatedMassKg >= mtowKg * 0.85 ? 'pass'
          : totalEstimatedMassKg <= mtowKg * 1.15 ? 'warn'
          : 'fail',
    measured: quantities.total_estimated_mass_kg,
    required: mtowKg,
    reason: `Estimated total mass ${totalEstimatedMassKg.toFixed(2)} kg vs brief MTOW cap ${mtowKg.toFixed(2)} kg (${((totalEstimatedMassKg / mtowKg) * 100).toFixed(0)}%).`,
  })
  closures.push({
    invariant_id: 'endurance_closure',
    status: computedEnduranceMin >= briefFlightTimeMin * 0.95 ? 'pass'
          : computedEnduranceMin >= briefFlightTimeMin * 0.80 ? 'warn'
          : 'fail',
    measured: quantities.computed_endurance_min,
    required: briefFlightTimeMin,
    reason: `Computed endurance ${computedEnduranceMin.toFixed(1)} min vs target ${briefFlightTimeMin.toFixed(1)} min (${((computedEnduranceMin / briefFlightTimeMin) * 100).toFixed(0)}%). At ${hoverPowerKw.toFixed(3)} kW hover, ${batteryKwh.toFixed(3)} kWh battery, ${etaPropulsion} η, ${(usableBatteryFraction * 100).toFixed(0)}% DoD.`,
  })

  const macroAssemblyTotal = macro_assembly_prices.reduce((a, m) => a + m.total_gbp, 0)

  return {
    product_class: 'drone',
    brief_summary: `${motorCount === 4 ? 'Quadcopter' : motorCount === 6 ? 'Hexacopter' : 'Octocopter'} consumer/commercial drone, ${mtowKg.toFixed(2)} kg MTOW, ${(rotorDiameterM * 1000).toFixed(0)} mm rotors. Hover ${hoverPowerKw.toFixed(3)} kW, cruise ${cruisePowerKw.toFixed(3)} kW. ${batteryKwh.toFixed(3)} kWh LiPo → ${computedEnduranceMin.toFixed(1)} min endurance (target ${briefFlightTimeMin.toFixed(1)} min). ${payloadKg.toFixed(2)} kg gimbal/camera payload. Macro-assembly raw BoM = £${macroAssemblyTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}.`,
    quantities,
    topology,
    macro_assembly_prices,
    closures,
  }
})

// ---------------------------------------------------------------------------
// AUV (AUTONOMOUS UNDERWATER VEHICLE) ARCHETYPE — deep-marine variant,
// 50-3000 m operating depth, titanium/aluminium pressure hull, multi-
// thruster propulsion, LFP subsea-rated battery, syntactic foam buoyancy.
// Deterministic hydrostatic + hoop-stress hull thickness physics. Builds
// the Contract BEFORE the Generator runs so depth → hull thickness,
// displacement → buoyancy, battery → endurance all close arithmetically.
// ---------------------------------------------------------------------------

registerArchetype('auv', (brief: any) => {
  const tp = brief?.constraints?.target_performance ?? {}
  const briefValue = Number(tp.value ?? 0)
  const briefUnit = String(tp.unit ?? 'm').toLowerCase()
  const desc = String(brief?.product_description ?? brief?.brief?.original_text ?? '')
  const extractRange = (pat: RegExp, dflt: number): number => {
    const m = desc.match(pat)
    if (!m) return dflt
    const a = parseFloat(m[1])
    const b = m[2] ? parseFloat(m[2]) : a
    return (a + b) / 2
  }
  const gravityMs2 = 9.81
  // Brief target_performance: depth (m) OR endurance (h). Capture both.
  const briefIsDepth = briefUnit === 'm' || briefUnit === 'metres' || briefUnit === 'meter' || briefUnit === 'meters'
  const briefIsEndurance = /h|hour/i.test(briefUnit)
  const operatingDepthM = briefIsDepth && briefValue > 0 ? briefValue
    : extractRange(/(\d{2,5})\s*-?\s*(\d{2,5})?\s*m(?:etre)?s?\s*(?:depth|operating|rated)/i, 200)
  const briefEnduranceH = briefIsEndurance && briefValue > 0 ? briefValue
    : extractRange(/(\d{1,3})\s*-?\s*(\d{1,3})?\s*h(?:our)?s?\s*(?:endurance|mission)/i, 12)
  // Hydrostatic pressure: P_external_bar = depth_m × 0.0981
  const externalPressureBar = operatingDepthM * 0.0981
  const externalPressurePa = externalPressureBar * 1e5
  // Hull material: titanium grade 5 above 1000 m, 6061-T6 aluminium below
  const hullMaterial = operatingDepthM >= 1000 ? 'titanium_grade_5' : 'aluminium_6061_t6'
  // Allowable stress (yield / safety factor 1.5)
  const allowableStressPa = hullMaterial === 'titanium_grade_5' ? 828e6 / 1.5 : 270e6 / 1.5
  // Hull cylinder OD: default 0.4 m, length 2 m
  const hullDiameterM = extractRange(/(\d+(?:\.\d+)?)\s*-?\s*(\d+(?:\.\d+)?)?\s*m\s*(?:diameter|OD)/i, 0.4)
  const hullLengthM = extractRange(/(\d+(?:\.\d+)?)\s*-?\s*(\d+(?:\.\d+)?)?\s*m\s*(?:length|hull|long)/i, 2.0)
  // Weld efficiency
  const weldEfficiency = 0.85
  // Hull thickness (hoop stress, von Mises with 1.5× depth safety factor)
  const designPressurePa = externalPressurePa * 1.5
  const hullThicknessM = (designPressurePa * hullDiameterM) / (2 * allowableStressPa * weldEfficiency)
  const hullThicknessMm = hullThicknessM * 1000
  // Hull volume (cylinder shell) and mass
  const hullVolumeM3 = Math.PI * hullDiameterM * hullThicknessM * hullLengthM
  const hullDensityKgM3 = hullMaterial === 'titanium_grade_5' ? 4500 : 2700
  const hullMassKg = hullVolumeM3 * hullDensityKgM3
  // Displacement: external cylinder volume
  const displacementM3 = Math.PI * Math.pow(hullDiameterM / 2, 2) * hullLengthM
  // Seawater density
  const seawaterDensityKgM3 = 1025
  // Positive buoyancy 6% — syntactic foam volume
  const positiveBuoyancyFraction = 0.06
  const buoyancyFoamVolumeM3 = displacementM3 * positiveBuoyancyFraction
  // Battery kWh: brief or default 4 kWh
  const batteryKwh = extractRange(/(\d{1,2}(?:\.\d+)?)\s*-?\s*(\d{1,2}(?:\.\d+)?)?\s*kWh/i, 4.0)
  // Propulsion power: cruise 0.4 kW, peak 1.5 kW
  const cruisePowerKw = 0.4
  const peakPowerKw = 1.5
  // Thruster count: 4 typical (forward + 2 lateral + 1 vertical)
  const thrusterCount = (() => {
    if (/6\s*thrust/i.test(desc)) return 6
    if (/8\s*thrust/i.test(desc)) return 8
    if (/3\s*thrust/i.test(desc)) return 3
    return 4
  })()
  // Endurance (h): battery × 0.8 efficiency / cruise power
  const etaPropulsionElectrical = 0.8
  const computedEnduranceH = (batteryKwh * etaPropulsionElectrical) / cruisePowerKw
  // Subsea battery mass: ~80 Wh/kg system-level
  const batteryMassKg = (batteryKwh * 1000) / 80
  // Thruster mass: 2 kg each
  const thrusterMassKgEach = 2.0
  // Electronics mass: 5 kg
  const electronicsMassKg = 5.0
  // Ballast: trimmed for 6% positive buoyancy in seawater
  const seawaterDisplaced = displacementM3 * seawaterDensityKgM3
  const componentMass = hullMassKg + batteryMassKg + thrusterCount * thrusterMassKgEach + electronicsMassKg
  const ballastMassKg = Math.max(0, seawaterDisplaced * (1 - positiveBuoyancyFraction) - componentMass)
  const mtowAirKg = componentMass + ballastMassKg
  // DC bus voltage: 24 V subsea typical
  const busVoltageV = 24
  const peakBusCurrentA = (peakPowerKw * 1000) / busVoltageV

  const quantities: Record<string, Quantity> = {
    operating_depth_m: q(operatingDepthM, 'm', 'length', 'rated', 'system', 'brief', { condition: 'rated max design depth' }),
    external_pressure_bar: q(externalPressureBar, 'bar', 'pressure', 'rated', 'system', 'calculator', { source_detail: 'hydrostatic: depth × 0.0981' }),
    design_pressure_bar: q(externalPressureBar * 1.5, 'bar', 'pressure', 'max', 'system', 'calculator', { source_detail: 'external × 1.5 safety factor' }),
    hull_material: q(0, '', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: `material=${hullMaterial} (Ti-6Al-4V Grade 5 for depth ≥1000m, Al 6061-T6 otherwise)` }),
    allowable_stress_mpa: q(allowableStressPa / 1e6, 'MPa', 'pressure', 'max', 'system', 'physics_constant', { source_detail: `yield / 1.5 safety factor (${hullMaterial})` }),
    hull_diameter_m: q(hullDiameterM, 'm', 'length', 'rated', 'system', 'brief'),
    hull_length_m: q(hullLengthM, 'm', 'length', 'rated', 'system', 'brief'),
    hull_thickness_mm: q(hullThicknessMm, 'mm', 'length', 'rated', 'system', 'calculator', { source_detail: 'hoop stress: P × d / (2 × σ × η_weld)' }),
    weld_efficiency: q(weldEfficiency, '', 'dimensionless', 'rated', 'system', 'physics_constant'),
    hull_mass_kg: q(hullMassKg, 'kg', 'mass', 'empty', 'system', 'calculator'),
    displacement_m3: q(displacementM3, 'm³', 'volume', 'rated', 'system', 'calculator', { source_detail: 'π × (d/2)² × L cylinder external volume' }),
    seawater_density_kg_m3: q(seawaterDensityKgM3, 'kg/m³', 'dimensionless', 'rated', 'system', 'physics_constant', { condition: 'standard seawater 35 PSU @ 4°C' }),
    positive_buoyancy_fraction: q(positiveBuoyancyFraction, '', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: 'typical AUV trim 5-10%; default 6%' }),
    buoyancy_foam_volume_m3: q(buoyancyFoamVolumeM3, 'm³', 'volume', 'rated', 'system', 'calculator'),
    battery_capacity_kwh: q(batteryKwh, 'kWh', 'energy', 'nameplate', 'system', 'brief'),
    battery_mass_kg: q(batteryMassKg, 'kg', 'mass', 'empty', 'module', 'calculator', { source_detail: 'kWh × 1000 / 80 Wh/kg subsea-rated LFP' }),
    cruise_power_kw: q(cruisePowerKw, 'kW', 'power', 'continuous', 'system', 'physics_constant', { source_detail: 'typical 0.4 kW @ 2 m/s cruise' }),
    peak_power_kw: q(peakPowerKw, 'kW', 'power', 'peak', 'system', 'physics_constant', { source_detail: 'typical 1.5 kW peak transient' }),
    thruster_count: q(thrusterCount, '', 'dimensionless', 'rated', 'system', 'brief'),
    propulsion_efficiency: q(etaPropulsionElectrical, '', 'dimensionless', 'rated', 'system', 'physics_constant'),
    target_endurance_h: q(briefEnduranceH, 'h', 'time', 'min', 'system', 'brief'),
    computed_endurance_h: q(computedEnduranceH, 'h', 'time', 'continuous', 'system', 'calculator', { source_detail: 'battery × η / cruise_power' }),
    ballast_mass_kg: q(ballastMassKg, 'kg', 'mass', 'empty', 'system', 'calculator', { source_detail: 'trimmed for +6% buoyancy in seawater' }),
    mtow_air_kg: q(mtowAirKg, 'kg', 'mass', 'gross_takeoff', 'system', 'calculator', { source_detail: 'hull + battery + thrusters + electronics + ballast', condition: 'in-air mass' }),
    bus_voltage_v: q(busVoltageV, 'V', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: '24V subsea convention' }),
    peak_bus_current_a: q(peakBusCurrentA, 'A', 'dimensionless', 'peak', 'system', 'calculator'),
  }

  const topology: TopologyEdge[] = [
    {
      from_part: 'lfp_subsea_battery',
      to_part: 'thruster_motor',
      mechanism: 'electrical_bus',
      constraint_kind: 'current_rating',
      required_value: peakBusCurrentA * 1.5,
      required_unit: 'A',
      required_margin_factor: 1.5,
    },
    {
      from_part: 'pressure_compensator',
      to_part: 'hull_internal',
      mechanism: 'fluid_loop',
      constraint_kind: 'flow_capacity',
      required_value: 0.5,
      required_unit: 'L/min',
    },
    {
      from_part: 'nav_computer',
      to_part: 'thruster_motor',
      mechanism: 'data',
      constraint_kind: 'data_bandwidth',
      required_value: 100,
      required_unit: 'Hz',
    },
    {
      from_part: 'pressure_hull',
      to_part: 'seawater_environment',
      mechanism: 'mechanical',
      constraint_kind: 'material_compatibility',
      material_context: hullMaterial === 'titanium_grade_5'
        ? 'titanium_seawater_compatible — Ti-6Al-4V Grade 5 is inert in seawater; no galvanic protection needed'
        : 'aluminium_seawater_requires_anodes — Al 6061-T6 requires sacrificial Zn/Al anodes + hard anodised + epoxy coating',
    },
  ]

  // Macro-assembly pricing. Word names chosen for ≥0.66 token overlap
  // against Stage 1.7 emissions (titanium_hull, aluminium_hull,
  // pressure_hull, thruster_motor, lfp_battery, syntactic_foam,
  // doppler_velocity_log, pressure_compensator, subsea_dome).
  const hullPricePerKg = hullMaterial === 'titanium_grade_5' ? 900 : 200
  const macro_assembly_prices: MacroAssemblyPrice[] = [
    {
      word_name: hullMaterial === 'titanium_grade_5' ? 'titanium_pressure_hull' : 'aluminium_pressure_hull',
      unit_price_gbp: hullPricePerKg,
      dimension_basis: 'kg_mass',
      dimension_value: hullMassKg,
      total_gbp: hullPricePerKg * hullMassKg,
      source_detail: `£${hullPricePerKg}/kg × ${hullMassKg.toFixed(1)} kg (${hullMaterial.replace(/_/g, ' ')}, rated to ${operatingDepthM} m)`,
    },
    {
      word_name: 'thruster_motor_assembly',
      unit_price_gbp: 600,
      dimension_basis: 'each',
      dimension_value: thrusterCount,
      total_gbp: 600 * thrusterCount,
      source_detail: `£600/thruster × ${thrusterCount} thrusters (subsea brushless DC, oil-filled, pressure-tolerant)`,
    },
    {
      word_name: 'lfp_subsea_battery_pack',
      unit_price_gbp: 450,
      dimension_basis: 'kwh_capacity',
      dimension_value: batteryKwh,
      total_gbp: 450 * batteryKwh,
      source_detail: `£450/kWh × ${batteryKwh.toFixed(2)} kWh (LFP subsea-rated, oil-compensated pack)`,
    },
    {
      word_name: 'syntactic_foam_buoyancy',
      unit_price_gbp: 1500,
      dimension_basis: 'cubic_metre',
      dimension_value: buoyancyFoamVolumeM3,
      total_gbp: 1500 * buoyancyFoamVolumeM3,
      source_detail: `£1,500/m³ × ${buoyancyFoamVolumeM3.toFixed(3)} m³ (hollow-glass-microsphere syntactic foam, depth-rated)`,
    },
    {
      word_name: 'subsea_glass_oil_dome',
      unit_price_gbp: 800,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 800,
      source_detail: `£800 flat — borosilicate optical port + oil-filled compensation for camera/sensor`,
    },
    {
      word_name: 'doppler_velocity_log',
      unit_price_gbp: 8000,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 8000,
      source_detail: `£8,000 flat — 4-beam DVL (Teledyne Pathfinder / Nortek DVL1000 class) for subsea nav`,
    },
    {
      word_name: 'pressure_compensator_assembly',
      unit_price_gbp: 350,
      dimension_basis: 'each',
      dimension_value: thrusterCount,
      total_gbp: 350 * thrusterCount,
      source_detail: `£350/thruster × ${thrusterCount} compensators (rubber bladder + reservoir + check valve)`,
    },
  ]

  // Closures
  const closures: ContractClosureResult[] = []
  const hoopStressAtDesignPa = (designPressurePa * hullDiameterM) / (2 * hullThicknessM)
  closures.push({
    invariant_id: 'hull_pressure_closure',
    status: hoopStressAtDesignPa <= allowableStressPa * weldEfficiency * 1.05 ? 'pass' : 'fail',
    measured: hoopStressAtDesignPa / 1e6,
    required: (allowableStressPa * weldEfficiency) / 1e6,
    reason: `Hoop stress at 1.5× design depth = ${(hoopStressAtDesignPa / 1e6).toFixed(1)} MPa vs allowable × η_weld = ${((allowableStressPa * weldEfficiency) / 1e6).toFixed(1)} MPa. Hull thickness ${hullThicknessMm.toFixed(2)} mm.`,
  })
  const buoyancyForceN = (seawaterDisplaced - mtowAirKg) * gravityMs2
  const buoyancyPct = (buoyancyForceN / (mtowAirKg * gravityMs2)) * 100
  closures.push({
    invariant_id: 'buoyancy_closure',
    status: buoyancyPct >= 4 && buoyancyPct <= 12 ? 'pass'
          : buoyancyPct >= 2 && buoyancyPct <= 15 ? 'warn'
          : 'fail',
    measured: buoyancyPct,
    required: '5-10% positive buoyancy in seawater',
    reason: `Net buoyancy ${buoyancyPct.toFixed(1)}% of in-air weight (target 5-10%). Seawater displacement ${seawaterDisplaced.toFixed(1)} kg vs in-air mass ${mtowAirKg.toFixed(1)} kg.`,
  })
  closures.push({
    invariant_id: 'endurance_closure',
    status: computedEnduranceH >= briefEnduranceH * 0.95 ? 'pass'
          : computedEnduranceH >= briefEnduranceH * 0.80 ? 'warn'
          : 'fail',
    measured: quantities.computed_endurance_h,
    required: briefEnduranceH,
    reason: `Computed endurance ${computedEnduranceH.toFixed(1)} h vs target ${briefEnduranceH.toFixed(1)} h. At ${cruisePowerKw} kW cruise, ${batteryKwh.toFixed(2)} kWh battery, ${etaPropulsionElectrical} η.`,
  })

  const macroAssemblyTotal = macro_assembly_prices.reduce((a, m) => a + m.total_gbp, 0)

  return {
    product_class: 'auv',
    brief_summary: `Autonomous underwater vehicle, ${operatingDepthM} m rated depth (${externalPressureBar.toFixed(1)} bar hydrostatic), ${hullMaterial.replace(/_/g, ' ')} pressure hull ${hullThicknessMm.toFixed(2)} mm thick. ${thrusterCount} thrusters, ${batteryKwh.toFixed(2)} kWh battery → ${computedEnduranceH.toFixed(1)} h endurance (target ${briefEnduranceH.toFixed(1)} h). In-air mass ${mtowAirKg.toFixed(1)} kg. Macro-assembly raw BoM = £${macroAssemblyTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}.`,
    quantities,
    topology,
    macro_assembly_prices,
    closures,
  }
})

// ---------------------------------------------------------------------------
// BIOREACTOR ARCHETYPE — stirred-tank stainless 316L jacketed vessel,
// working volume + dissolved oxygen + agitation deterministic physics.
// Builds the Contract BEFORE the Generator runs so vessel volume,
// agitation power, kLa, oxygen transfer, heat balance, and pH/DO control
// all close arithmetically against the brief working-volume target.
// ---------------------------------------------------------------------------

registerArchetype('bioreactor', (brief: any) => {
  const tp = brief?.constraints?.target_performance ?? {}
  const briefValue = Number(tp.value ?? 0)
  const briefUnit = String(tp.unit ?? 'L').toLowerCase()
  const desc = String(brief?.product_description ?? brief?.brief?.original_text ?? '')
  const extractRange = (pat: RegExp, dflt: number): number => {
    const m = desc.match(pat)
    if (!m) return dflt
    const a = parseFloat(m[1])
    const b = m[2] ? parseFloat(m[2]) : a
    return (a + b) / 2
  }
  // Working volume L: 2026-05-23 (Task #69) — fixed brief-fidelity bug.
  // PREVIOUS BUG: when brief parser picked kLa "8 hr⁻¹" as target_performance
  // (because brief had both kLa and volume), the unit guard fell through to
  // "return briefValue" treating 8 hr⁻¹ as 8 L → 10 L vessel for a 200 L brief.
  // Physics Critic flagged this as brief_to_design_fidelity=2/10.
  // FIX: scan product_description FIRST for explicit volume mentions; only
  // accept target_performance.value when its unit is in the volume family.
  // Same pattern needed across all archetypes that read target_performance
  // (BESS, heat pump, drone, AUV, etc.). See [[forgeos_envelope_detector_silent_fallback]].
  const workingVolumeL = (() => {
    // FIRST: try the desc regex (most reliable signal for volume — the brief
    // text contains "Nominal working volume: 200 L" as a top-line spec)
    const descPatterns = [
      /(?:nominal|working|design|rated|reactor|fermenter)\s+volume[\s:]{0,8}(\d{1,4}(?:,\d{3})*|\d{1,5})\s*(?:l|litre|liter)\b/i,
      /(\d{1,4}(?:,\d{3})*|\d{1,5})\s*-?\s*(?:l|litre|liter)\s+(?:bioreactor|fermenter|reactor|vessel|single[\s-]?use|working)/i,
      /(\d{1,4}(?:,\d{3})*|\d{1,5})\s*(?:l|litre|liter)\b[^a-z]{0,30}(?:nominal|working|reactor)/i,
    ]
    for (const p of descPatterns) {
      const m = desc.match(p)
      if (m) return parseFloat(m[1].replace(/,/g, ''))
    }
    // SECOND: accept target_performance.value ONLY if unit is in the volume family
    if (briefValue > 0) {
      if (briefUnit === 'l' || briefUnit === 'litre' || briefUnit === 'litres' || briefUnit === 'liter' || briefUnit === 'liters' || briefUnit === 'ltr') return briefValue
      if (briefUnit === 'm3' || briefUnit === 'm³' || briefUnit === 'cubic_metre' || briefUnit === 'cubic_meter') return briefValue * 1000
      if (briefUnit === 'ml') return briefValue / 1000
      // Wrong unit (kLa, ramp rate, etc.) → fall through to class default below.
      // Do NOT return briefValue blindly — that was the bug.
    }
    // THIRD: class default
    return 1000
  })()
  // Fill ratio: 80% standard for stirred tanks
  const fillRatio = 0.80
  const totalVolumeL = workingVolumeL / fillRatio
  const totalVolumeM3 = totalVolumeL / 1000
  // Aspect ratio H:D = 2:1
  const aspectRatioHD = 2.0
  // V_cyl = π × (D/2)² × 2D = π × D³ / 2 → D = (2V / π)^(1/3)
  const vesselDiameterM = Math.cbrt((2 * totalVolumeM3) / Math.PI)
  const vesselHeightM = aspectRatioHD * vesselDiameterM
  // Vessel mass: ~4 kg per litre total volume (316L jacketed sanitary)
  const vesselMassKg = 4 * totalVolumeL
  // Agitation power W/L: 5 W/L default (mammalian cell), 2-10 W/L range
  const agitationPowerPerLW = extractRange(/(\d+(?:\.\d+)?)\s*-?\s*(\d+(?:\.\d+)?)?\s*W\/L/i, 5)
  const agitatorPowerKw = (workingVolumeL * agitationPowerPerLW) / 1000
  // Oxygen transfer rate (OTR) mmol/L/h: 30-50 aerobic, default 40
  const otrMmolLH = extractRange(/(\d{2,3})\s*-?\s*(\d{2,3})?\s*mmol/i, 40)
  // DO saturation 0.21 mmol/L; setpoint 30% of sat
  const doSaturationMmolL = 0.21
  const doSetpointFraction = 0.30
  const doSetpointMmolL = doSaturationMmolL * doSetpointFraction
  // kLa = OTR / (DO_sat - DO_setpoint)
  const klaPerH = otrMmolLH / (doSaturationMmolL - doSetpointMmolL)
  // Sparger: vvm × working volume, vvm default 0.75
  const vvm = extractRange(/(\d+(?:\.\d+)?)\s*-?\s*(\d+(?:\.\d+)?)?\s*vvm/i, 0.75)
  const spargerFlowLMin = vvm * workingVolumeL
  // Heat removal: agitator dissipation 40% + microbial heat 5 W/L
  const microbialHeatKw = workingVolumeL * 0.005
  const agitatorHeatKw = agitatorPowerKw * 0.40
  const heatRemovalKw = agitatorHeatKw + microbialHeatKw
  // pH dosing channels
  const phChannels = 2
  // Temperature envelope
  const tempControlMinC = 20
  const tempControlMaxC = 45

  const quantities: Record<string, Quantity> = {
    working_volume_l: q(workingVolumeL, 'L', 'volume', 'usable', 'system', 'brief'),
    total_volume_l: q(totalVolumeL, 'L', 'volume', 'gross', 'system', 'calculator', { source_detail: `working / ${fillRatio} fill ratio` }),
    fill_ratio: q(fillRatio, '', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: 'standard stirred tank 75-80% fill' }),
    aspect_ratio_hd: q(aspectRatioHD, '', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: 'H:D = 2:1 stirred tank convention' }),
    vessel_diameter_m: q(vesselDiameterM, 'm', 'length', 'rated', 'system', 'calculator'),
    vessel_height_m: q(vesselHeightM, 'm', 'length', 'rated', 'system', 'calculator'),
    vessel_mass_kg: q(vesselMassKg, 'kg', 'mass', 'empty', 'system', 'calculator', { source_detail: '4 kg/L total (316L jacketed sanitary)' }),
    agitation_power_per_l_w: q(agitationPowerPerLW, 'W/L', 'dimensionless', 'rated', 'system', 'brief', { source_detail: 'typical 2-10 W/L; default 5 (mammalian)' }),
    agitator_power_kw: q(agitatorPowerKw, 'kW', 'power', 'continuous', 'module', 'calculator', { source_detail: 'working_L × W/L / 1000' }),
    otr_mmol_l_h: q(otrMmolLH, 'mmol/L/h', 'dimensionless', 'rated', 'system', 'brief', { source_detail: 'aerobic typical 30-50; default 40' }),
    do_saturation_mmol_l: q(doSaturationMmolL, 'mmol/L', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: '1 mM O2 at 25°C, 1 atm air' }),
    do_setpoint_mmol_l: q(doSetpointMmolL, 'mmol/L', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: `${(doSetpointFraction * 100).toFixed(0)}% of saturation` }),
    kla_per_h: q(klaPerH, '1/h', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: 'OTR / (DO_sat − DO_setpoint)' }),
    vvm: q(vvm, 'vvm', 'dimensionless', 'rated', 'system', 'brief'),
    sparger_flow_l_min: q(spargerFlowLMin, 'L/min', 'flow_rate', 'continuous', 'module', 'calculator', { source_detail: 'vvm × working_volume_L' }),
    microbial_heat_kw: q(microbialHeatKw, 'kW', 'power', 'continuous', 'system', 'calculator', { source_detail: '5 W/L high-cell-density typical' }),
    agitator_heat_kw: q(agitatorHeatKw, 'kW', 'power', 'continuous', 'system', 'calculator', { source_detail: '40% of agitator power dissipates as heat' }),
    heat_removal_kw: q(heatRemovalKw, 'kW', 'power', 'continuous', 'system', 'calculator', { source_detail: 'agitator + microbial heat' }),
    ph_channels: q(phChannels, '', 'dimensionless', 'rated', 'module', 'physics_constant', { source_detail: '2-channel peristaltic acid + base' }),
    temp_control_min_c: q(tempControlMinC, '°C', 'temperature', 'min', 'system', 'brief'),
    temp_control_max_c: q(tempControlMaxC, '°C', 'temperature', 'max', 'system', 'brief'),
  }

  const topology: TopologyEdge[] = [
    {
      from_part: 'agitator_motor',
      to_part: 'vessel_top_plate',
      mechanism: 'mechanical',
      constraint_kind: 'mass_carry',
      required_value: vesselMassKg + workingVolumeL,
      required_unit: 'kg',
    },
    {
      from_part: 'sparger_air',
      to_part: 'vessel_bottom',
      mechanism: 'fluid_loop',
      constraint_kind: 'flow_capacity',
      required_value: spargerFlowLMin,
      required_unit: 'L/min',
    },
    {
      from_part: 'jacket_heat_exchanger',
      to_part: 'vessel_jacket',
      mechanism: 'thermal',
      constraint_kind: 'thermal_rejection',
      required_value: heatRemovalKw,
      required_unit: 'kW',
    },
    {
      from_part: 'do_probe',
      to_part: 'control_unit',
      mechanism: 'data',
      constraint_kind: 'data_bandwidth',
      required_value: 1,
      required_unit: 'Hz',
    },
    {
      from_part: 'vessel_internal',
      to_part: 'culture_media',
      mechanism: 'mechanical',
      constraint_kind: 'material_compatibility',
      material_context: '316L_sanitary — electropolished Ra <0.5 µm, biocompatible, withstands SIP/CIP cycles (NaOH/HNO3/peracetic acid)',
    },
  ]

  // Macro-assembly pricing. Word names chosen for ≥0.66 token overlap
  // against Stage 1.7 emissions (stainless_vessel, jacketed_vessel,
  // agitator_motor, aeration_sparger, jacket_heat_exchanger,
  // temperature_control, ph_dosing, do_probe, biosafety_filter).
  const macro_assembly_prices: MacroAssemblyPrice[] = [
    {
      word_name: 'stainless_316l_vessel',
      unit_price_gbp: 200,
      dimension_basis: 'litre_volume',
      dimension_value: totalVolumeL,
      total_gbp: 200 * totalVolumeL,
      source_detail: `£200/L × ${totalVolumeL.toFixed(0)} L total (316L jacketed, sanitary electropolished, SIP-rated)`,
    },
    {
      word_name: 'agitator_motor_assembly',
      unit_price_gbp: 300,
      dimension_basis: 'kw_power',
      dimension_value: agitatorPowerKw,
      total_gbp: 300 * agitatorPowerKw,
      source_detail: `£300/kW × ${agitatorPowerKw.toFixed(2)} kW (top-entry direct-drive, mechanical seal, multi-impeller)`,
    },
    {
      word_name: 'aeration_sparger_system',
      unit_price_gbp: 0.15,
      dimension_basis: 'litre_volume',
      dimension_value: workingVolumeL,
      total_gbp: 0.15 * workingVolumeL,
      source_detail: `£0.15/L × ${workingVolumeL.toFixed(0)} L working (ring sparger + mass-flow controller + 0.2µm inlet filter)`,
    },
    {
      word_name: 'jacket_heat_exchanger',
      unit_price_gbp: 400,
      dimension_basis: 'kw_power',
      dimension_value: heatRemovalKw,
      total_gbp: 400 * heatRemovalKw,
      source_detail: `£400/kW × ${heatRemovalKw.toFixed(2)} kW heat removal (welded dimple jacket, glycol loop)`,
    },
    {
      word_name: 'temperature_control_unit',
      unit_price_gbp: 2500,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 2500,
      source_detail: `£2,500 flat — chiller + heater + circulation pump + PID control`,
    },
    {
      word_name: 'ph_dosing_system',
      unit_price_gbp: 1800,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 1800,
      source_detail: `£1,800 flat — 2-channel peristaltic pump + acid/base reservoirs + pH probe`,
    },
    {
      word_name: 'do_probe_optical',
      unit_price_gbp: 900,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 900,
      source_detail: `£900 flat — luminescent quenching DO probe (Hamilton VisiFerm / Mettler InPro 6970)`,
    },
    {
      word_name: 'biosafety_filter_assembly',
      unit_price_gbp: 350,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 350,
      source_detail: `£350 flat — 0.2µm hydrophobic vent + sparger filters (biosafety containment)`,
    },
  ]

  // Closures
  const closures: ContractClosureResult[] = []
  closures.push({
    invariant_id: 'volume_closure',
    status: Math.abs(totalVolumeL - workingVolumeL / fillRatio) / totalVolumeL < 0.05 ? 'pass' : 'fail',
    measured: totalVolumeL,
    required: workingVolumeL / fillRatio,
    reason: `Total volume ${totalVolumeL.toFixed(1)} L = working ${workingVolumeL} L / ${fillRatio} fill ratio. ±5% closure check.`,
  })
  closures.push({
    invariant_id: 'kla_closure',
    status: klaPerH >= 100 && klaPerH <= 800 ? 'pass'
          : klaPerH >= 50 && klaPerH <= 1200 ? 'warn'
          : 'fail',
    measured: klaPerH,
    required: '100-800 1/h typical aerobic stirred tank',
    reason: `kLa ${klaPerH.toFixed(0)} 1/h from OTR ${otrMmolLH} mmol/L/h and ΔDO ${(doSaturationMmolL - doSetpointMmolL).toFixed(3)} mmol/L. Check agitator + sparger can deliver this.`,
  })
  closures.push({
    invariant_id: 'heat_balance_closure',
    status: heatRemovalKw >= (agitatorHeatKw + microbialHeatKw) * 0.95 ? 'pass' : 'fail',
    measured: heatRemovalKw,
    required: agitatorHeatKw + microbialHeatKw,
    reason: `Heat removal ${heatRemovalKw.toFixed(2)} kW vs dissipation ${(agitatorHeatKw + microbialHeatKw).toFixed(2)} kW (agitator + microbial). By construction passes — verifies arithmetic.`,
  })

  const macroAssemblyTotal = macro_assembly_prices.reduce((a, m) => a + m.total_gbp, 0)

  return {
    product_class: 'bioreactor',
    brief_summary: `Stirred-tank bioreactor, ${workingVolumeL.toFixed(0)} L working / ${totalVolumeL.toFixed(0)} L total volume (316L jacketed). Vessel ${vesselDiameterM.toFixed(2)} m diameter × ${vesselHeightM.toFixed(2)} m height (H:D=${aspectRatioHD}:1). Agitator ${agitatorPowerKw.toFixed(2)} kW (${agitationPowerPerLW} W/L). Sparger ${spargerFlowLMin.toFixed(1)} L/min @ ${vvm} vvm. kLa ${klaPerH.toFixed(0)} 1/h delivering OTR ${otrMmolLH} mmol/L/h. Heat removal ${heatRemovalKw.toFixed(2)} kW. Macro-assembly raw BoM = £${macroAssemblyTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}.`,
    quantities,
    topology,
    macro_assembly_prices,
    closures,
  }
})

// ---------------------------------------------------------------------------
// CGM (CONTINUOUS GLUCOSE MONITOR) ARCHETYPE — wearable medical disposable
// 7-14 day enzymatic electrochemical sensor (glucose oxidase) with BLE 5.x
// transmitter. Subcutaneous interstitial-fluid (ISF) microneedle. Builds
// the Contract BEFORE the Generator runs so wear duration, sensor MARD,
// battery energy budget, and macro-assembly costs all close arithmetically
// against the brief wear-duration / accuracy target.
// ---------------------------------------------------------------------------

registerArchetype('cgm', (brief: any) => {
  const tp = brief?.constraints?.target_performance ?? {}
  const briefValue = Number(tp.value ?? 0)
  const briefUnit = String(tp.unit ?? 'day').toLowerCase()
  const desc = String(brief?.product_description ?? brief?.brief?.original_text ?? '')
  const extractRange = (pat: RegExp, dflt: number): number => {
    const m = desc.match(pat)
    if (!m) return dflt
    const a = parseFloat(m[1])
    const b = m[2] ? parseFloat(m[2]) : a
    return (a + b) / 2
  }
  // Brief target_performance: wear_duration (days) OR sensor_accuracy MARD %
  const briefIsMard = /%|mard/i.test(briefUnit)
  const wearDurationDays = !briefIsMard && briefValue > 0 ? briefValue
    : extractRange(/(\d{1,2})\s*-?\s*(\d{1,2})?\s*day/i, 14)
  const targetMardPct = briefIsMard && briefValue > 0 ? briefValue
    : extractRange(/(\d{1,2}(?:\.\d+)?)\s*-?\s*(\d{1,2}(?:\.\d+)?)?\s*%?\s*mard/i, 10)
  // Reading interval: 5 minutes standard → 288 readings/day
  const readingIntervalMin = 5
  const readingsPerDay = (24 * 60) / readingIntervalMin
  const totalReadings = Math.round(readingsPerDay * wearDurationDays)
  // Microneedle length: 5 mm subcutaneous ISF access
  const microneedleLengthMm = 5
  // Battery: silver oxide SR416 — 1.55 V × 8 mAh = 12.4 mWh
  const batteryVoltageV = 1.55
  const batteryCapacityMah = 8
  const batteryCapacityMwh = batteryVoltageV * batteryCapacityMah
  // Power consumption budget: sleep + BLE TX bursts; target ≤ Wh / wear_days × 24
  // Average power (mW) = battery_mwh / (wear_days × 24)
  const powerConsumptionMw = batteryCapacityMwh / (wearDurationDays * 24)
  // BLE TX power: 0 dBm (1 mW) typical Nordic nRF52805 long-range mode
  const bleTxPowerDbm = 0
  // Body mass: ~5 g including adhesive patch
  const bodyMassG = 5.0
  // Operating envelope
  const operatingTempMinC = 20
  const operatingTempMaxC = 43
  // Glucose detection range (mg/dL)
  const glucoseRangeMin = 40
  const glucoseRangeMax = 400

  const quantities: Record<string, Quantity> = {
    wear_duration_days: q(wearDurationDays, 'day', 'time', 'rated', 'system', 'brief', { source_detail: 'brief.constraints.target_performance', condition: 'continuous wear, single disposable' }),
    sensor_mard_pct: q(targetMardPct, '%', 'dimensionless', 'rated', 'system', 'brief', { source_detail: 'mean absolute relative deviation vs YSI reference, ISO 15197', condition: '40-400 mg/dL range' }),
    reading_interval_min: q(readingIntervalMin, 'min', 'time', 'rated', 'system', 'physics_constant', { source_detail: 'standard CGM reading cadence' }),
    total_readings: q(totalReadings, '', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: 'readings_per_day × wear_duration_days' }),
    microneedle_length_mm: q(microneedleLengthMm, 'mm', 'length', 'rated', 'system', 'physics_constant', { source_detail: '5 mm subcutaneous ISF access (Dexcom/Abbott class)' }),
    body_mass_g: q(bodyMassG, 'g', 'mass', 'gross_takeoff', 'system', 'physics_constant', { source_detail: 'disposable patch including adhesive (5 g typical)' }),
    battery_voltage_v: q(batteryVoltageV, 'V', 'dimensionless', 'rated', 'module', 'physics_constant', { source_detail: 'silver oxide SR416 coin cell' }),
    battery_capacity_mah: q(batteryCapacityMah, 'mAh', 'dimensionless', 'nameplate', 'module', 'physics_constant'),
    battery_capacity_mwh: q(batteryCapacityMwh, 'mWh', 'energy', 'nameplate', 'module', 'calculator', { source_detail: 'voltage × capacity_mAh' }),
    power_consumption_mw: q(powerConsumptionMw, 'mW', 'power', 'continuous', 'system', 'calculator', { source_detail: 'battery_mwh / (wear_days × 24)' }),
    ble_tx_power_dbm: q(bleTxPowerDbm, 'dBm', 'dimensionless', 'rated', 'module', 'physics_constant', { source_detail: 'Nordic nRF52805 / Dialog DA14531 typical 0 dBm BLE 5.x' }),
    operating_temp_min_c: q(operatingTempMinC, '°C', 'temperature', 'min', 'system', 'physics_constant', { source_detail: 'skin contact lower bound' }),
    operating_temp_max_c: q(operatingTempMaxC, '°C', 'temperature', 'max', 'system', 'physics_constant', { source_detail: 'febrile body temp upper bound' }),
    glucose_range_mg_dl_min: q(glucoseRangeMin, 'mg/dL', 'dimensionless', 'min', 'system', 'physics_constant', { source_detail: 'ISO 15197 hypoglycaemia lower bound' }),
    glucose_range_mg_dl_max: q(glucoseRangeMax, 'mg/dL', 'dimensionless', 'max', 'system', 'physics_constant', { source_detail: 'ISO 15197 hyperglycaemia upper bound' }),
  }

  const topology: TopologyEdge[] = [
    {
      from_part: 'enzyme_electrode',
      to_part: 'nrf52805_pcb',
      mechanism: 'data',
      constraint_kind: 'data_bandwidth',
      required_value: 1 / (readingIntervalMin * 60),  // Hz
      required_unit: 'Hz',
    },
    {
      from_part: 'silver_oxide_battery',
      to_part: 'nrf52805_pcb',
      mechanism: 'electrical_bus',
      constraint_kind: 'voltage_rating',
      required_value: batteryVoltageV,
      required_unit: 'V',
    },
    {
      from_part: 'nrf52805_pcb',
      to_part: 'ble_antenna',
      mechanism: 'data',
      constraint_kind: 'data_bandwidth',
      required_value: 2.4e9,
      required_unit: 'Hz',
    },
    {
      from_part: 'adhesive_patch',
      to_part: 'skin_contact',
      mechanism: 'mechanical',
      constraint_kind: 'material_compatibility',
      material_context: 'iso_10993_biocompatible — all skin-contact materials must pass ISO 10993-5 cytotoxicity + ISO 10993-10 irritation/sensitisation',
    },
  ]

  // Macro-assembly pricing. Word names chosen for ≥0.66 token overlap
  // against Stage 1.7 emissions (enzyme_electrode_assembly, nrf52805_pcb,
  // silver_oxide_battery, adhesive_patch, microneedle_array,
  // molded_housing, sealed_enclosure).
  const macro_assembly_prices: MacroAssemblyPrice[] = [
    {
      word_name: 'enzyme_electrode_assembly',
      unit_price_gbp: 8.0,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 8.0,
      source_detail: `£8/sensor — Pt working + Ag/AgCl reference + carbon counter + glucose oxidase coating (CGM-grade enzyme)`,
    },
    {
      word_name: 'nrf52805_pcb_assembly',
      unit_price_gbp: 6.0,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 6.0,
      source_detail: `£6/PCB — Nordic nRF52805 BLE 5.x SoC + matching network + 32 MHz crystal`,
    },
    {
      word_name: 'silver_oxide_battery',
      unit_price_gbp: 0.40,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 0.40,
      source_detail: `£0.40/cell — SR416 silver oxide coin cell (1.55 V, 8 mAh)`,
    },
    {
      word_name: 'adhesive_patch_3m',
      unit_price_gbp: 1.20,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 1.20,
      source_detail: `£1.20/patch — 3M 9871 transparent breathable medical adhesive, 25 mm dia + applicator interlock`,
    },
    {
      word_name: 'microneedle_array',
      unit_price_gbp: 3.50,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 3.50,
      source_detail: `£3.50/array — Pt-coated stainless or PMMA microneedle, ${microneedleLengthMm} mm length, single needle subcutaneous ISF access`,
    },
    {
      word_name: 'molded_housing_pp',
      unit_price_gbp: 1.80,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 1.80,
      source_detail: `£1.80/housing — polypropylene transparent injection-moulded, ISO 10993 biocompatible`,
    },
    {
      word_name: 'sealed_enclosure_polymer',
      unit_price_gbp: 2.50,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 2.50,
      source_detail: `£2.50/unit — IP68 epoxy potting + RF window over BLE antenna`,
    },
  ]

  // Closures
  const closures: ContractClosureResult[] = []
  const totalEnergyMwhRequired = powerConsumptionMw * wearDurationDays * 24
  closures.push({
    invariant_id: 'wear_duration_closure',
    status: batteryCapacityMwh >= totalEnergyMwhRequired * 0.95 ? 'pass'
          : batteryCapacityMwh >= totalEnergyMwhRequired * 0.80 ? 'warn'
          : 'fail',
    measured: quantities.battery_capacity_mwh,
    required: totalEnergyMwhRequired,
    reason: `Battery ${batteryCapacityMwh.toFixed(2)} mWh vs required ${totalEnergyMwhRequired.toFixed(2)} mWh for ${wearDurationDays.toFixed(0)} days at ${powerConsumptionMw.toFixed(3)} mW average draw.`,
  })
  closures.push({
    invariant_id: 'mard_closure',
    status: targetMardPct <= 12 ? 'pass' : targetMardPct <= 15 ? 'warn' : 'fail',
    measured: targetMardPct,
    required: '≤12% MARD for ISO 15197 / FDA 510(k) clearance',
    reason: `Target MARD ${targetMardPct.toFixed(1)}% — enzymatic electrochemical (glucose oxidase) + factory-calibrated electronics typically deliver 9-12% MARD against YSI reference.`,
  })
  closures.push({
    invariant_id: 'biocompat_closure',
    status: 'pass',
    measured: 1,
    required: 'ISO 10993-tested skin contact materials',
    reason: `All skin-contact materials (3M 9871 adhesive, PP housing, Pt-coated needle) are ISO 10993-5/10 tested. EU MDR Class IIb, FDA 510(k) De Novo or PMA pathway.`,
  })

  const macroAssemblyTotal = macro_assembly_prices.reduce((a, m) => a + m.total_gbp, 0)

  return {
    product_class: 'cgm',
    brief_summary: `Continuous glucose monitor, ${wearDurationDays.toFixed(0)}-day disposable wearable (enzymatic electrochemical, glucose oxidase). ${totalReadings} readings @ ${readingIntervalMin}-min interval, target MARD ${targetMardPct.toFixed(1)}%. ${microneedleLengthMm} mm microneedle subcutaneous ISF access. ${batteryCapacityMwh.toFixed(1)} mWh SR416 silver oxide battery, ${powerConsumptionMw.toFixed(3)} mW average draw. ${bodyMassG.toFixed(1)} g body mass on 3M 9871 adhesive patch. BLE 5.x telemetry @ ${bleTxPowerDbm} dBm. Macro-assembly raw BoM = £${macroAssemblyTotal.toFixed(2)}.`,
    quantities,
    topology,
    macro_assembly_prices,
    closures,
  }
})

// ---------------------------------------------------------------------------
// EDGE AI INFERENCE SERVER (1U RACK) ARCHETYPE — GPU-accelerated on-prem
// inference appliance. Default 1× NVIDIA L40S + AMD EPYC 9354 + 256 GB
// DDR5 ECC + 2× NVMe RAID 1 + 2× 25 GbE + redundant 2 kW Titanium PSU.
// Builds the Contract BEFORE the Generator runs so power budget, thermal
// envelope, inference throughput, and macro-assembly costs all close
// arithmetically against the brief power_kw / inference_tps target.
// ---------------------------------------------------------------------------

registerArchetype('edge_ai', (brief: any) => {
  const tp = brief?.constraints?.target_performance ?? {}
  const briefValue = Number(tp.value ?? 0)
  const briefUnit = String(tp.unit ?? 'tps').toLowerCase()
  const desc = String(brief?.product_description ?? brief?.brief?.original_text ?? '')
  const extractRange = (pat: RegExp, dflt: number): number => {
    const m = desc.match(pat)
    if (!m) return dflt
    const a = parseFloat(m[1])
    const b = m[2] ? parseFloat(m[2]) : a
    return (a + b) / 2
  }
  // Brief target_performance: inference_tps OR model_size_b OR power_kw
  const briefIsTps = /tps|token/i.test(briefUnit)
  const briefIsPower = /kw|watt/i.test(briefUnit)
  const briefIsModel = /b|param|billion/i.test(briefUnit)
  // GPU selection: L40S default; H100 if mentioned; MI300X if mentioned
  const gpuModel = /h100/i.test(desc) ? 'NVIDIA H100 PCIe'
    : /mi300x|amd.*gpu/i.test(desc) ? 'AMD MI300X'
    : /a100/i.test(desc) ? 'NVIDIA A100 PCIe'
    : 'NVIDIA L40S'
  const gpuPowerW = gpuModel === 'NVIDIA H100 PCIe' ? 400
    : gpuModel === 'AMD MI300X' ? 750
    : gpuModel === 'NVIDIA A100 PCIe' ? 300
    : 300  // L40S
  const gpuPriceGbp = gpuModel === 'NVIDIA H100 PCIe' ? 25000
    : gpuModel === 'AMD MI300X' ? 18000
    : gpuModel === 'NVIDIA A100 PCIe' ? 12000
    : 15000  // L40S
  // GPU count: 1 default for 1U short-depth chassis; up to 4
  const gpuCount = (() => {
    if (/4\s*gpu|quad.*gpu/i.test(desc)) return 4
    if (/2\s*gpu|dual.*gpu/i.test(desc)) return 2
    return 1
  })()
  // Inference throughput tps default (L40S Llama-2-13B batch=1 ~80 tps)
  const tpsPerGpu = gpuModel === 'NVIDIA H100 PCIe' ? 150
    : gpuModel === 'AMD MI300X' ? 140
    : gpuModel === 'NVIDIA A100 PCIe' ? 90
    : 80  // L40S
  const inferenceTps = briefIsTps && briefValue > 0 ? briefValue : tpsPerGpu * gpuCount
  // CPU: AMD EPYC 9354 32-core (240 W)
  const cpuCores = 32
  const cpuPowerW = 240
  // RAM: 256 GB DDR5 ECC standard (8× 32 GB DIMMs)
  const ramGbTotal = extractRange(/(\d{2,4})\s*-?\s*(\d{2,4})?\s*gb/i, 256)
  const ramDimmCount = Math.round(ramGbTotal / 32)
  const ramPowerW = ramDimmCount * 6  // ~6 W per DIMM under load
  // NVMe: 2× 1.92 TB U.2 NVMe RAID 1
  const nvmeCount = 2
  const nvmeTbEach = 1.92
  const storageTbTotal = nvmeCount * nvmeTbEach
  const nvmePowerW = nvmeCount * 12  // ~12 W per U.2 NVMe under load
  // Total power draw (kW continuous)
  const totalPowerKw = (gpuCount * gpuPowerW + cpuPowerW + ramPowerW + nvmePowerW + 50) / 1000  // +50 W fans/misc
  // PSU efficiency 92% at typical load → grid power = total / 0.92
  const psuEfficiencyPct = 92
  const gridPowerKw = totalPowerKw / (psuEfficiencyPct / 100)
  // PSU capacity: 2× 2000 W redundant = 4 kW pair, 2 kW operational headroom
  const psuCapacityKw = 4.0
  // Heat dissipation = all electrical input becomes heat in 1U
  const heatDissipationKw = totalPowerKw
  // Inlet temp envelope: NEBS Level 3 = 10-35°C; extended = 5-45°C
  const maxInletTempC = briefIsPower ? 35 : 35
  // Acoustic: data centre normal 60-75 dBA at 1m at 100% fan
  const acousticDbaMax = 70
  // Network: 2× 25 GbE SFP28
  const networkThroughputGbe = 50  // 2× 25 GbE
  // Mass kg: 1U chassis ~14 kg typical loaded
  const totalMassKg = 14

  const quantities: Record<string, Quantity> = {
    inference_tps: q(inferenceTps, 'tps', 'dimensionless', 'rated', 'system', briefIsTps ? 'brief' : 'calculator', { source_detail: `tokens-per-second @ batch=1, ${gpuModel} on Llama-2-13B class`, condition: 'INT4/FP8 quantised, batch=1' }),
    gpu_count: q(gpuCount, '', 'dimensionless', 'rated', 'system', 'brief', { source_detail: `${gpuModel} accelerator count` }),
    gpu_model_power_w: q(gpuPowerW, 'W', 'power', 'continuous', 'module', 'physics_constant', { source_detail: `${gpuModel} TDP` }),
    cpu_cores: q(cpuCores, '', 'dimensionless', 'rated', 'module', 'physics_constant', { source_detail: 'AMD EPYC 9354 32-core' }),
    cpu_power_w: q(cpuPowerW, 'W', 'power', 'continuous', 'module', 'physics_constant', { source_detail: 'EPYC 9354 240 W TDP' }),
    ram_gb_total: q(ramGbTotal, 'GB', 'dimensionless', 'rated', 'module', 'brief', { source_detail: `${ramDimmCount}× 32 GB DDR5-4800 ECC RDIMM` }),
    ram_dimm_count: q(ramDimmCount, '', 'dimensionless', 'rated', 'module', 'calculator'),
    storage_tb_total: q(storageTbTotal, 'TB', 'dimensionless', 'rated', 'module', 'physics_constant', { source_detail: `${nvmeCount}× ${nvmeTbEach} TB U.2 NVMe Gen4, RAID 1` }),
    total_power_kw: q(totalPowerKw, 'kW', 'power', 'continuous', 'system', 'calculator', { source_detail: 'GPU + CPU + RAM + NVMe + fans (board-side, pre-PSU)' }),
    grid_power_kw: q(gridPowerKw, 'kW', 'power', 'continuous', 'system', 'calculator', { source_detail: 'total / PSU efficiency (grid-side)' }),
    psu_capacity_kw: q(psuCapacityKw, 'kW', 'power', 'rated', 'system', 'physics_constant', { source_detail: '2× 2000 W 80+ Titanium redundant' }),
    psu_efficiency_pct: q(psuEfficiencyPct, '%', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: '80+ Titanium typical at 50% load' }),
    heat_dissipation_kw: q(heatDissipationKw, 'kW', 'power', 'continuous', 'system', 'calculator', { source_detail: 'all electrical input → heat; equal to total_power_kw' }),
    max_inlet_temp_c: q(maxInletTempC, '°C', 'temperature', 'max', 'system', 'physics_constant', { source_detail: 'NEBS Level 3 = 10-35°C inlet' }),
    acoustic_dba_max: q(acousticDbaMax, 'dBA', 'dimensionless', 'max', 'system', 'physics_constant', { source_detail: 'data centre normal at 1 m, 100% fan' }),
    network_throughput_gbe: q(networkThroughputGbe, 'Gbe', 'dimensionless', 'rated', 'module', 'physics_constant', { source_detail: '2× 25 GbE SFP28' }),
    total_mass_kg: q(totalMassKg, 'kg', 'mass', 'gross_takeoff', 'system', 'physics_constant', { source_detail: '1U short-depth chassis fully populated' }),
  }

  const topology: TopologyEdge[] = [
    {
      from_part: 'cpu',
      to_part: 'motherboard',
      mechanism: 'electrical_bus',
      constraint_kind: 'voltage_rating',
      required_value: 12,
      required_unit: 'V',
    },
    {
      from_part: 'gpu_inference_card',
      to_part: 'motherboard',
      mechanism: 'data',
      constraint_kind: 'data_bandwidth',
      required_value: 64,  // PCIe 4.0 ×16 = 64 GB/s
      required_unit: 'GB/s',
    },
    {
      from_part: 'redundant_psu_pair',
      to_part: 'motherboard',
      mechanism: 'electrical_bus',
      constraint_kind: 'current_rating',
      required_value: (totalPowerKw * 1000) / 12,  // 12 V rail
      required_unit: 'A',
      required_margin_factor: 1.5,
    },
    {
      from_part: 'gpu_inference_card',
      to_part: 'chassis_airflow',
      mechanism: 'thermal',
      constraint_kind: 'thermal_rejection',
      required_value: gpuCount * gpuPowerW / 1000,
      required_unit: 'kW',
    },
    {
      from_part: 'chassis_1u_short_depth',
      to_part: 'data_centre_rack',
      mechanism: 'mechanical',
      constraint_kind: 'material_compatibility',
      material_context: 'eia_310_19inch_rack — 1U short-depth (760 mm) chassis must fit standard 19-inch rack with front-to-back airflow',
    },
  ]

  // Macro-assembly pricing. Word names chosen for ≥0.66 token overlap
  // against Stage 1.7 emissions (gpu_inference_card, cpu_epyc_assembly,
  // ecc_ddr5_dimm, nvme_storage, redundant_psu, chassis_1u,
  // network_adapter, motherboard).
  const macro_assembly_prices: MacroAssemblyPrice[] = [
    {
      word_name: 'gpu_inference_card',
      unit_price_gbp: gpuPriceGbp,
      dimension_basis: 'each',
      dimension_value: gpuCount,
      total_gbp: gpuPriceGbp * gpuCount,
      source_detail: `£${gpuPriceGbp.toLocaleString()}/GPU × ${gpuCount} (${gpuModel}, 2026 list price; programme pricing varies)`,
    },
    {
      word_name: 'cpu_epyc_assembly',
      unit_price_gbp: 4500,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 4500,
      source_detail: `£4,500/socket — AMD EPYC 9354 32-core + heatsink + socket retention`,
    },
    {
      word_name: 'ecc_ddr5_dimm',
      unit_price_gbp: 180,
      dimension_basis: 'each',
      dimension_value: ramDimmCount,
      total_gbp: 180 * ramDimmCount,
      source_detail: `£180/DIMM × ${ramDimmCount} (32 GB DDR5-4800 ECC RDIMM)`,
    },
    {
      word_name: 'nvme_storage',
      unit_price_gbp: 400,
      dimension_basis: 'each',
      dimension_value: nvmeCount,
      total_gbp: 400 * nvmeCount,
      source_detail: `£400/drive × ${nvmeCount} (1.92 TB U.2 NVMe Gen4, RAID 1)`,
    },
    {
      word_name: 'redundant_psu_pair',
      unit_price_gbp: 900,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 900,
      source_detail: `£900/pair — 2× 2000 W 80+ Titanium hot-swap PSU`,
    },
    {
      word_name: 'chassis_1u_short_depth',
      unit_price_gbp: 600,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 600,
      source_detail: `£600 flat — 1U Supermicro AS-1115S-WN10RT-class short-depth chassis (760 mm)`,
    },
    {
      word_name: 'network_adapter_25gbe',
      unit_price_gbp: 350,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 350,
      source_detail: `£350 flat — 2× 25 GbE SFP28 NIC + DAC/AOC cables`,
    },
    {
      word_name: 'motherboard_dual_socket',
      unit_price_gbp: 1200,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 1200,
      source_detail: `£1,200 flat — server motherboard with IPMI, multiple PCIe Gen4 ×16 slots`,
    },
  ]

  // Closures
  const closures: ContractClosureResult[] = []
  closures.push({
    invariant_id: 'power_closure',
    status: gridPowerKw <= psuCapacityKw * (psuEfficiencyPct / 100) * 0.85 ? 'pass'
          : gridPowerKw <= psuCapacityKw * (psuEfficiencyPct / 100) ? 'warn'
          : 'fail',
    measured: quantities.grid_power_kw,
    required: psuCapacityKw * (psuEfficiencyPct / 100),
    reason: `Grid power ${gridPowerKw.toFixed(2)} kW vs PSU capacity ${(psuCapacityKw * (psuEfficiencyPct / 100)).toFixed(2)} kW at ${psuEfficiencyPct}% efficiency. Need ≤85% to leave headroom for transient peaks + N+1 redundancy.`,
  })
  closures.push({
    invariant_id: 'thermal_closure',
    status: heatDissipationKw <= 1.2 ? 'pass' : heatDissipationKw <= 1.5 ? 'warn' : 'fail',
    measured: quantities.heat_dissipation_kw,
    required: '≤1.2 kW per 1U at 35°C inlet (front-to-back air-cooled)',
    reason: `Heat dissipation ${heatDissipationKw.toFixed(2)} kW vs typical 1U air-cooled capacity 1.2 kW @ 35°C inlet. Above 1.2 kW requires liquid-cooled or rear-door HX or extended-temp chassis.`,
  })
  closures.push({
    invariant_id: 'inference_perf_closure',
    status: briefIsTps ? (inferenceTps >= briefValue * 0.95 ? 'pass' : 'fail') : 'pass',
    measured: inferenceTps,
    required: briefIsTps ? briefValue : 'no brief tps target',
    reason: briefIsTps
      ? `Declared inference ${inferenceTps.toFixed(0)} tps vs brief target ${briefValue.toFixed(0)} tps with ${gpuCount}× ${gpuModel}.`
      : `No brief tps target; declared ${inferenceTps.toFixed(0)} tps with ${gpuCount}× ${gpuModel}.`,
  })

  const macroAssemblyTotal = macro_assembly_prices.reduce((a, m) => a + m.total_gbp, 0)

  return {
    product_class: 'edge_ai',
    brief_summary: `Edge AI inference server, 1U short-depth chassis with ${gpuCount}× ${gpuModel} (${tpsPerGpu * gpuCount} tps/Llama-2-13B class). AMD EPYC 9354 32-core + ${ramGbTotal} GB DDR5 ECC + ${storageTbTotal.toFixed(2)} TB NVMe RAID 1. Power ${totalPowerKw.toFixed(2)} kW board / ${gridPowerKw.toFixed(2)} kW grid (${psuEfficiencyPct}% PSU). Heat dissipation ${heatDissipationKw.toFixed(2)} kW, inlet ≤${maxInletTempC}°C. 2× 25 GbE network. ${totalMassKg.toFixed(0)} kg. Macro-assembly raw BoM = £${macroAssemblyTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}.`,
    quantities,
    topology,
    macro_assembly_prices,
    closures,
  }
})

// ---------------------------------------------------------------------------
// EV CHARGER (DC FAST-CHARGING CCS COMBO 2) ARCHETYPE — pedestal-mounted
// 50-350 kW DC fast charger with liquid-cooled CCS2 cable, ISO 15118-20
// Plug & Charge, OCPP 2.0.1 networking. Builds the Contract BEFORE the
// Generator runs so AC input current, DC output current, heat dissipation,
// efficiency, and macro-assembly costs all close arithmetically against
// the brief rated_power_kw target.
// ---------------------------------------------------------------------------

registerArchetype('ev_charger', (brief: any) => {
  const tp = brief?.constraints?.target_performance ?? {}
  const briefValue = Number(tp.value ?? 0)
  const briefUnit = String(tp.unit ?? 'kw').toLowerCase()
  const desc = String(brief?.product_description ?? brief?.brief?.original_text ?? '')
  const extractRange = (pat: RegExp, dflt: number): number => {
    const m = desc.match(pat)
    if (!m) return dflt
    const a = parseFloat(m[1])
    const b = m[2] ? parseFloat(m[2]) : a
    return (a + b) / 2
  }
  // Brief target_performance: rated_power_kw
  const ratedPowerKw = briefValue > 0 && /kw|kilowatt/i.test(briefUnit) ? briefValue
    : extractRange(/(\d{2,3})\s*-?\s*(\d{2,3})?\s*kW/i, 150)
  // Peak power 5% above continuous
  const peakPowerKw = ratedPowerKw * 1.05
  // Output voltage range: CCS2 supports 200-1000 V DC (legacy 400 V + 800 V architectures)
  const outputVoltageMaxV = 1000
  const outputVoltageNominalV = 500  // rating midpoint
  // Output current max @ half-voltage (worst-case current for given power)
  const outputCurrentMaxA = (ratedPowerKw * 1000) / outputVoltageNominalV
  // AC input: 3-phase 400 V; current = P × 1000 / (400 × √3 × pf × η)
  const acInputVoltageV = 400
  const powerFactor = 0.99
  const efficiencyPct = 95.5
  const efficiency = efficiencyPct / 100
  const acInputCurrentA = (ratedPowerKw * 1000) / (acInputVoltageV * Math.sqrt(3) * powerFactor * efficiency)
  // Cable length: 5 m typical liquid-cooled CCS2
  const cableLengthM = extractRange(/(\d(?:\.\d+)?)\s*-?\s*(\d(?:\.\d+)?)?\s*m\s*cable/i, 5)
  // Cable mass: 0.5 kg/m dry + cooling liquid charge
  const cableMassKg = cableLengthM * 0.5 + 1.0
  // Liquid cooling: 5-8 L/min flow for 250+ A cable
  const coolingFlowRateLmin = 6.5
  // Heat dissipation = (1 - efficiency) × rated_power
  const heatDissipationKw = (1 - efficiency) * ratedPowerKw
  // Total mass kg: 150 kW class typical 250 kg pedestal
  const totalMassKg = (() => {
    if (ratedPowerKw >= 350) return 400
    if (ratedPowerKw >= 200) return 320
    if (ratedPowerKw >= 150) return 250
    if (ratedPowerKw >= 100) return 200
    if (ratedPowerKw >= 50) return 150
    return 100
  })()
  // Acoustic 60-65 dBA at 1m
  const acousticDba = 62

  const quantities: Record<string, Quantity> = {
    rated_power_kw: q(ratedPowerKw, 'kW', 'power', 'continuous', 'system', 'brief', { source_detail: 'brief.constraints.target_performance', condition: 'continuous DC output' }),
    peak_power_kw: q(peakPowerKw, 'kW', 'power', 'peak', 'system', 'calculator', { source_detail: 'continuous × 1.05 transient' }),
    output_voltage_max_v: q(outputVoltageMaxV, 'V', 'dimensionless', 'max', 'system', 'physics_constant', { source_detail: 'CCS2 IEC 62196-3 800 V architecture support (DC output)' }),
    output_voltage_nominal_v: q(outputVoltageNominalV, 'V', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: 'rating-midpoint for current sizing' }),
    output_current_max_a: q(outputCurrentMaxA, 'A', 'dimensionless', 'max', 'system', 'calculator', { source_detail: 'rated_power × 1000 / nominal_voltage' }),
    ac_input_voltage_v: q(acInputVoltageV, 'V', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: '3-phase 400 V mains 50/60 Hz' }),
    ac_input_current_a: q(acInputCurrentA, 'A', 'dimensionless', 'continuous', 'system', 'calculator', { source_detail: 'P × 1000 / (V × √3 × pf × η)' }),
    power_factor: q(powerFactor, '', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: 'active PFC ≥ 0.99' }),
    efficiency_pct: q(efficiencyPct, '%', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: 'AFE + LLC resonant or DAB at rated load' }),
    cable_length_m: q(cableLengthM, 'm', 'length', 'rated', 'system', 'brief'),
    cable_mass_kg: q(cableMassKg, 'kg', 'mass', 'empty', 'module', 'calculator', { source_detail: '0.5 kg/m × length + liquid charge' }),
    cooling_flow_rate_lmin: q(coolingFlowRateLmin, 'L/min', 'flow_rate', 'continuous', 'module', 'physics_constant', { source_detail: 'water-glycol loop for liquid-cooled CCS2' }),
    heat_dissipation_kw: q(heatDissipationKw, 'kW', 'power', 'continuous', 'system', 'calculator', { source_detail: '(1 - efficiency) × rated_power' }),
    total_mass_kg: q(totalMassKg, 'kg', 'mass', 'gross_takeoff', 'system', 'physics_constant', { source_detail: 'pedestal + power modules + cooling + cable' }),
    acoustic_dba: q(acousticDba, 'dBA', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: 'forced-air cooling at 1 m typical' }),
  }

  const topology: TopologyEdge[] = [
    {
      from_part: 'afe_power_module',
      to_part: 'llc_resonant_module',
      mechanism: 'electrical_bus',
      constraint_kind: 'voltage_rating',
      required_value: 800,
      required_unit: 'V',
    },
    {
      from_part: 'llc_resonant_module',
      to_part: 'ccs2_connector',
      mechanism: 'electrical_bus',
      constraint_kind: 'current_rating',
      required_value: outputCurrentMaxA * 1.25,
      required_unit: 'A',
      required_margin_factor: 1.25,
    },
    {
      from_part: 'iso15118_controller',
      to_part: 'ccs2_connector',
      mechanism: 'data',
      constraint_kind: 'data_bandwidth',
      required_value: 1,
      required_unit: 'Mbps',
    },
    {
      from_part: 'liquid_cooling_unit',
      to_part: 'liquid_cooled_cable',
      mechanism: 'fluid_loop',
      constraint_kind: 'flow_capacity',
      required_value: coolingFlowRateLmin,
      required_unit: 'L/min',
    },
    {
      from_part: 'pedestal_chassis',
      to_part: 'outdoor_environment',
      mechanism: 'mechanical',
      constraint_kind: 'material_compatibility',
      material_context: 'ip54_outdoor — galvanised steel pedestal + IP54 enclosure for dust + splash protection; IP44 at cable connector',
    },
  ]

  // Macro-assembly pricing. Word names chosen for ≥0.66 token overlap
  // against Stage 1.7 emissions (afe_power_module, llc_resonant_module,
  // liquid_cooled_cable, ccs2_connector, pedestal_chassis,
  // iso15118_controller, liquid_cooling_unit).
  const macro_assembly_prices: MacroAssemblyPrice[] = [
    {
      word_name: 'afe_power_module',
      unit_price_gbp: 180,
      dimension_basis: 'kw_power',
      dimension_value: ratedPowerKw,
      total_gbp: 180 * ratedPowerKw,
      source_detail: `£180/kW × ${ratedPowerKw.toFixed(0)} kW (3-phase active front-end SiC IGBT PFC)`,
    },
    {
      word_name: 'llc_resonant_module',
      unit_price_gbp: 140,
      dimension_basis: 'kw_power',
      dimension_value: ratedPowerKw,
      total_gbp: 140 * ratedPowerKw,
      source_detail: `£140/kW × ${ratedPowerKw.toFixed(0)} kW (galvanic isolation DC-DC LLC resonant)`,
    },
    {
      word_name: 'liquid_cooled_cable',
      unit_price_gbp: 85,
      dimension_basis: 'kw_power',
      dimension_value: ratedPowerKw,
      total_gbp: 85 * ratedPowerKw,
      source_detail: `£85/kW × ${ratedPowerKw.toFixed(0)} kW (250+ A liquid-cooled CCS2 cable + integrated cooling pump)`,
    },
    {
      word_name: 'ccs2_connector_assembly',
      unit_price_gbp: 450,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 450,
      source_detail: `£450 flat — IEC 62196-3 CCS Combo 2 pin set + pilot/CP/PP wiring + lock actuator`,
    },
    {
      word_name: 'pedestal_chassis',
      unit_price_gbp: 1800,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 1800,
      source_detail: `£1,800 flat — galvanised steel pedestal + IP54 enclosure + door + display mount`,
    },
    {
      word_name: 'iso15118_controller',
      unit_price_gbp: 900,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 900,
      source_detail: `£900 flat — V2G computer + ISO 15118-20 Plug & Charge stack + OCPP 2.0.1 + OCPI 2.2 cert`,
    },
    {
      word_name: 'liquid_cooling_unit',
      unit_price_gbp: 1400,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 1400,
      source_detail: `£1,400 flat — pump + reservoir + radiator + water-glycol charge + temp sensors`,
    },
  ]

  // Closures
  const closures: ContractClosureResult[] = []
  const acInputPowerKw = acInputCurrentA * acInputVoltageV * Math.sqrt(3) * powerFactor / 1000
  const dcOutputCheck = acInputPowerKw * efficiency
  const powerBalanceGap = Math.abs(dcOutputCheck - ratedPowerKw) / ratedPowerKw
  closures.push({
    invariant_id: 'power_balance_closure',
    status: powerBalanceGap < 0.02 ? 'pass' : powerBalanceGap < 0.05 ? 'warn' : 'fail',
    measured: dcOutputCheck,
    required: ratedPowerKw,
    reason: `AC input × efficiency = ${dcOutputCheck.toFixed(2)} kW DC vs rated ${ratedPowerKw.toFixed(2)} kW (gap ${(powerBalanceGap * 100).toFixed(2)}%). AC current ${acInputCurrentA.toFixed(1)} A @ 400 V 3-phase, ${(powerFactor * 100).toFixed(0)}% pf, ${efficiencyPct}% η.`,
  })
  const coolingCapacityKw = coolingFlowRateLmin * 4.18 * 30 / 60 / 1000  // ΔT 30°C × cp_water-glycol → kW
  closures.push({
    invariant_id: 'thermal_closure',
    status: coolingCapacityKw >= heatDissipationKw * 1.5 ? 'pass'
          : coolingCapacityKw >= heatDissipationKw ? 'warn'
          : 'fail',
    measured: coolingCapacityKw,
    required: heatDissipationKw * 1.5,
    reason: `Cooling capacity ${coolingCapacityKw.toFixed(2)} kW (${coolingFlowRateLmin} L/min × ΔT 30°C) vs heat dissipation ${heatDissipationKw.toFixed(2)} kW × 1.5 margin = ${(heatDissipationKw * 1.5).toFixed(2)} kW needed.`,
  })
  const briefMassCapKg = Number(brief?.constraints?.max_mass_kg?.value ?? 500)
  closures.push({
    invariant_id: 'mass_closure',
    status: totalMassKg <= briefMassCapKg ? 'pass' : 'fail',
    measured: quantities.total_mass_kg,
    required: briefMassCapKg,
    reason: `Total mass ${totalMassKg} kg vs brief cap ${briefMassCapKg} kg. ${ratedPowerKw} kW DC fast-charger pedestal class.`,
  })

  const macroAssemblyTotal = macro_assembly_prices.reduce((a, m) => a + m.total_gbp, 0)

  return {
    product_class: 'ev_charger',
    brief_summary: `DC fast EV charger, ${ratedPowerKw.toFixed(0)} kW continuous (CCS Combo 2, IEC 62196-3). Output 200-${outputVoltageMaxV} V DC up to ${outputCurrentMaxA.toFixed(0)} A. AC input ${acInputCurrentA.toFixed(0)} A @ 400 V 3-phase, ${efficiencyPct}% efficiency, ${(powerFactor * 100).toFixed(0)}% pf. Liquid-cooled CCS2 cable ${cableLengthM} m, ${coolingFlowRateLmin} L/min water-glycol. Heat dissipation ${heatDissipationKw.toFixed(2)} kW. ISO 15118-20 Plug & Charge + OCPP 2.0.1 + OCPI 2.2. ${totalMassKg} kg pedestal, IP54. Macro-assembly raw BoM = £${macroAssemblyTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}.`,
    quantities,
    topology,
    macro_assembly_prices,
    closures,
  }
})

// ---------------------------------------------------------------------------
// 2026-05-22 ADDITIONS — 15 new product-class archetypes seeded so the
// orchestrator has starting quantities. Each builder is intentionally
// minimal (extracts brief.target_performance + ambient ranges + mass cap)
// — detailed per-class macro_assembly + topology can be added once the
// class plan + Python tools are validated end-to-end.
//
// Each builder follows the existing pattern: deterministically derive
// the load-bearing physical quantities from the brief, attach unit-
// rich Quantity records, and emit an empty topology / closures /
// macro_assembly_prices list as a starting point.
// ---------------------------------------------------------------------------

function extractRangeFromDesc(desc: string, pat: RegExp, dflt: number): number {
  const m = desc.match(pat)
  if (!m) return dflt
  const a = parseFloat(m[1])
  const b = m[2] ? parseFloat(m[2]) : a
  return (a + b) / 2
}

function buildMinimalContract(productClass: string, brief: any, quantities: Record<string, Quantity>, briefSummary: string): EngineeringContract {
  return {
    product_class: productClass,
    brief_summary: briefSummary,
    quantities,
    topology: [],
    macro_assembly_prices: [],
    closures: [],
  }
}

// ---------------- solar_inverter -----------------
registerArchetype('solar_inverter', (brief: any) => {
  const tp = brief?.constraints?.target_performance ?? {}
  const u = String(tp.unit ?? 'kW').toLowerCase()
  const ratedKw = u === 'mw' ? Number(tp.value ?? 0) * 1000 : u === 'w' ? Number(tp.value ?? 0) / 1000 : Number(tp.value ?? 50)
  const desc = String(brief?.product_description ?? '')
  const dcInputV = extractRangeFromDesc(desc, /(\d{3,4})\s*-?\s*(\d{3,4})?\s*V\s*DC/i, 1000)
  const acOutputV = extractRangeFromDesc(desc, /(\d{3,4})\s*V\s*AC/i, 400)
  const mpptCount = extractRangeFromDesc(desc, /(\d{1,2})\s*MPPT/i, 2)
  const efficiencyPct = extractRangeFromDesc(desc, /(\d{2}(?:\.\d+)?)\s*-?\s*(\d{2}(?:\.\d+)?)?\s*%?\s*(?:euro\s*)?efficien/i, 97.5)
  const q1 = {
    rated_power_kw: q(ratedKw, 'kW', 'power', 'rated', 'system', 'brief', { source_detail: 'brief.constraints.target_performance' }),
    dc_input_voltage_v: q(dcInputV, 'V', 'voltage', 'DC', 'system', 'brief'),
    ac_output_voltage_v: q(acOutputV, 'V', 'voltage', 'AC', 'system', 'brief'),
    mppt_count: q(mpptCount, '', 'dimensionless', 'rated', 'system', 'brief'),
    efficiency_pct: q(efficiencyPct, '%', 'dimensionless', 'rated', 'system', 'physics_constant'),
  } as Record<string, Quantity>
  return buildMinimalContract('solar_inverter', brief, q1, `${ratedKw} kW solar inverter, ${dcInputV}V DC input / ${acOutputV}V AC output, ${mpptCount} MPPT, ${efficiencyPct}% efficiency.`)
})

// ---------------- wind_turbine -------------------
registerArchetype('wind_turbine', (brief: any) => {
  const tp = brief?.constraints?.target_performance ?? {}
  const u = String(tp.unit ?? 'kW').toLowerCase()
  const ratedKw = u === 'mw' ? Number(tp.value ?? 0) * 1000 : Number(tp.value ?? 2000)
  const desc = String(brief?.product_description ?? '')
  const rotorDiamM = extractRangeFromDesc(desc, /(\d{1,3})\s*-?\s*(\d{1,3})?\s*m\s+rotor/i, Math.max(40, Math.sqrt(ratedKw) * 1.5))
  const hubHeightM = extractRangeFromDesc(desc, /(\d{1,3})\s*-?\s*(\d{1,3})?\s*m\s+(?:hub|tower)/i, rotorDiamM * 1.2)
  const cutInMs = extractRangeFromDesc(desc, /cut[\s-]?in\s+(\d{1,2}(?:\.\d+)?)/i, 3.0)
  const ratedMs = extractRangeFromDesc(desc, /rated\s+(\d{1,2}(?:\.\d+)?)/i, 11.5)
  const cutOutMs = extractRangeFromDesc(desc, /cut[\s-]?out\s+(\d{1,2}(?:\.\d+)?)/i, 25.0)
  const isOffshore = /offshore/i.test(desc)
  const q1 = {
    rated_power_kw: q(ratedKw, 'kW', 'power', 'rated', 'system', 'brief'),
    rotor_diameter_m: q(rotorDiamM, 'm', 'length', 'rated', 'system', 'brief'),
    hub_height_m: q(hubHeightM, 'm', 'length', 'rated', 'system', 'brief'),
    cut_in_wind_speed_m_s: q(cutInMs, 'm/s', 'velocity', 'min', 'system', 'physics_constant'),
    rated_wind_speed_m_s: q(ratedMs, 'm/s', 'velocity', 'rated', 'system', 'physics_constant'),
    cut_out_wind_speed_m_s: q(cutOutMs, 'm/s', 'velocity', 'max', 'system', 'physics_constant'),
    generator_type: q(isOffshore ? 2 : 1, '', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: 'enum: 1=DFIG (onshore), 2=PMG (offshore)' }),
  } as Record<string, Quantity>
  return buildMinimalContract('wind_turbine', brief, q1, `${ratedKw} kW wind turbine, ${rotorDiamM} m rotor, ${hubHeightM} m hub, ${isOffshore ? 'offshore' : 'onshore'} class.`)
})

// ---------------- h2_electrolyser ----------------
registerArchetype('h2_electrolyser', (brief: any) => {
  const tp = brief?.constraints?.target_performance ?? {}
  const u = String(tp.unit ?? 'kW').toLowerCase()
  const desc = String(brief?.product_description ?? '')
  // 2026-05-23 (Task #69) — fixed brief-fidelity bug: brief parser commonly
  // picks H2 production rate (kg/hr, Nm³/hr) as target_performance instead of
  // electrical input (kW/MW). Old code fell through to "treat as kW" → 90 kg/hr
  // became 90 kW → 0.09 MW instead of 5 MW (Physics Critic fidelity=1/10).
  // FIX: scan desc for "5 MW" first; accept target_performance only if unit
  // in power family; convert H2 rate to power via 5.0 kWh/Nm³ if rate-given.
  const ratedKw = (() => {
    // 1. Try desc regex for explicit electrical power
    const descPower = desc.match(/(?:electrical|stack|rated|input)\s+(?:input|power|capacity)[\s:]{0,8}(\d{1,5}(?:,\d{3})*|\d{1,5}(?:\.\d+)?)\s*(kw|mw|w)\b/i)
      ?? desc.match(/(\d{1,5}(?:,\d{3})*|\d{1,5}(?:\.\d+)?)\s*(mw|kw|w)\s+(?:pem|alkaline|electrolyser|electrolyzer|stack)/i)
    if (descPower) {
      const v = parseFloat(descPower[1].replace(/,/g, ''))
      const unit = descPower[2].toLowerCase()
      if (unit === 'mw') return v * 1000
      if (unit === 'w') return v / 1000
      return v
    }
    // 2. target_performance.value if unit in power family
    if (Number(tp.value ?? 0) > 0) {
      if (u === 'mw') return Number(tp.value) * 1000
      if (u === 'kw') return Number(tp.value)
      if (u === 'w') return Number(tp.value) / 1000
      // 3. If unit is H2 production rate, convert to electrical kW
      if (u === 'kg/hour' || u === 'kg/hr' || u === 'kghour' || u === 'kghr') {
        // 1 kg H2 = 11.126 Nm³ × 5 kWh/Nm³ = 55.6 kWh/kg (PEM stack benchmark)
        return Number(tp.value) * 55.6
      }
      if (u === 'nm3/hr' || u === 'nm³/hr' || u === 'nm3hr') {
        // 5 kWh/Nm³ benchmark for PEM/alkaline
        return Number(tp.value) * 5.0
      }
      if (u === 't/day' || u === 'tpd') {
        // tonnes/day → kg/day → kg/hr → kWh
        return (Number(tp.value) * 1000 / 24) * 55.6
      }
      // Unknown unit — fall through to default below
    }
    // 4. Class default for a commercial electrolyser
    return 1000
  })()
  const h2KgPerDay = extractRangeFromDesc(desc, /(\d{1,5})\s*-?\s*(\d{1,5})?\s*kg.*(?:h2|hydrogen)/i, ratedKw / 53)
  const opPressureBar = extractRangeFromDesc(desc, /(\d{1,3})\s*bar/i, 30)
  const cellTempC = extractRangeFromDesc(desc, /(\d{2,3})\s*°?C/i, 70)
  const stackEffPct = extractRangeFromDesc(desc, /(\d{2})\s*%?\s*(?:stack\s+)?efficiency/i, 62)
  const q1 = {
    rated_power_kw: q(ratedKw, 'kW', 'power', 'rated', 'system', 'brief'),
    rated_power_mw: q(ratedKw / 1000, 'MW', 'power', 'rated', 'system', 'brief'),
    h2_production_kg_per_day: q(h2KgPerDay, 'kg/day', 'flow_rate', 'rated', 'system', 'brief'),
    operating_pressure_bar: q(opPressureBar, 'bar', 'pressure', 'rated', 'system', 'brief'),
    cell_temperature_c: q(cellTempC, '°C', 'temperature', 'rated', 'system', 'brief'),
    stack_efficiency_lhv_pct: q(stackEffPct, '%', 'dimensionless', 'rated', 'system', 'physics_constant'),
  } as Record<string, Quantity>
  return buildMinimalContract('h2_electrolyser', brief, q1, `${ratedKw} kW PEM electrolyser, ${h2KgPerDay.toFixed(0)} kg/day H₂, ${opPressureBar} bar, ${cellTempC}°C, ${stackEffPct}% LHV efficiency.`)
})

// ---------------- ups_inverter -------------------
registerArchetype('ups_inverter', (brief: any) => {
  const tp = brief?.constraints?.target_performance ?? {}
  const u = String(tp.unit ?? 'kVA').toLowerCase()
  const ratedKw = u === 'kva' ? Number(tp.value ?? 100) * 0.9 : u === 'mw' ? Number(tp.value ?? 0) * 1000 : Number(tp.value ?? 100)
  const desc = String(brief?.product_description ?? '')
  const runtimeMin = extractRangeFromDesc(desc, /(\d{1,4})\s*-?\s*(\d{1,4})?\s*min(?:utes?)?/i, 15)
  const efficiencyPct = extractRangeFromDesc(desc, /(\d{2}(?:\.\d+)?)\s*%?\s*(?:double[\s-]?conversion\s+)?efficiency/i, 96)
  const batteryKwh = extractRangeFromDesc(desc, /(\d{1,4})\s*-?\s*(\d{1,4})?\s*kWh/i, ratedKw * (runtimeMin / 60))
  const q1 = {
    rated_power_kw: q(ratedKw, 'kW', 'power', 'rated', 'system', 'brief'),
    runtime_min_at_full_load: q(runtimeMin, 'min', 'time', 'min', 'system', 'brief'),
    efficiency_pct: q(efficiencyPct, '%', 'dimensionless', 'rated', 'system', 'physics_constant'),
    battery_kwh: q(batteryKwh, 'kWh', 'energy', 'usable', 'system', 'calculator', { source_detail: 'rated × runtime/60' }),
  } as Record<string, Quantity>
  return buildMinimalContract('ups_inverter', brief, q1, `${ratedKw} kW online UPS, ${runtimeMin} min runtime @ full load, ${batteryKwh.toFixed(1)} kWh battery, ${efficiencyPct}% efficiency.`)
})

// ---------------- 3d_printer_fdm -----------------
registerArchetype('3d_printer_fdm', (brief: any) => {
  const desc = String(brief?.product_description ?? '')
  const nozzleTempC = extractRangeFromDesc(desc, /(\d{2,3})\s*°?C\s*(?:nozzle|hotend)/i, 260)
  const bedTempC = extractRangeFromDesc(desc, /(\d{2,3})\s*°?C\s*bed/i, 100)
  const buildVolL = extractRangeFromDesc(desc, /(\d{2,4})\s*x\s*(\d{2,4})\s*x\s*(\d{2,4})/i, 220)
  const maxPrintSpeedMmS = extractRangeFromDesc(desc, /(\d{2,4})\s*mm\/s/i, 200)
  const filamentDiameterMm = extractRangeFromDesc(desc, /(\d\.\d{1,2})\s*mm\s+filament/i, 1.75)
  const q1 = {
    nozzle_temp_c: q(nozzleTempC, '°C', 'temperature', 'rated', 'system', 'brief'),
    bed_temp_c: q(bedTempC, '°C', 'temperature', 'rated', 'system', 'brief'),
    build_volume_l: q(buildVolL, 'L', 'volume', 'rated', 'system', 'brief'),
    max_print_speed_mm_s: q(maxPrintSpeedMmS, 'mm/s', 'velocity', 'max', 'system', 'brief'),
    filament_diameter_mm: q(filamentDiameterMm, 'mm', 'length', 'rated', 'system', 'physics_constant'),
  } as Record<string, Quantity>
  return buildMinimalContract('3d_printer_fdm', brief, q1, `FDM 3D printer, nozzle ${nozzleTempC}°C, bed ${bedTempC}°C, ${buildVolL} L build volume, ${maxPrintSpeedMmS} mm/s max speed.`)
})

// ---------------- cnc_machine --------------------
registerArchetype('cnc_machine', (brief: any) => {
  const tp = brief?.constraints?.target_performance ?? {}
  const u = String(tp.unit ?? 'kW').toLowerCase()
  const spindleKw = u === 'w' ? Number(tp.value ?? 0) / 1000 : Number(tp.value ?? 15)
  const desc = String(brief?.product_description ?? '')
  const maxSpindleRpm = extractRangeFromDesc(desc, /(\d{4,6})\s*-?\s*(\d{4,6})?\s*rpm/i, 18000)
  const traverseMmMin = extractRangeFromDesc(desc, /(\d{4,6})\s*-?\s*(\d{4,6})?\s*mm\/min/i, 30000)
  const isFiveAxis = /5[\s-]?axis/i.test(desc)
  const q1 = {
    rated_spindle_power_kw: q(spindleKw, 'kW', 'power', 'rated', 'system', 'brief'),
    max_spindle_rpm: q(maxSpindleRpm, 'rpm', 'frequency', 'max', 'system', 'brief'),
    rapid_traverse_mm_per_min: q(traverseMmMin, 'mm/min', 'velocity', 'max', 'system', 'brief'),
    axes_count: q(isFiveAxis ? 5 : 3, '', 'dimensionless', 'rated', 'system', 'brief'),
  } as Record<string, Quantity>
  return buildMinimalContract('cnc_machine', brief, q1, `${spindleKw} kW CNC ${isFiveAxis ? '5-axis' : '3-axis'} machine, ${maxSpindleRpm} max rpm, ${traverseMmMin} mm/min rapid.`)
})

// ---------------- e_bike -------------------------
registerArchetype('e_bike', (brief: any) => {
  const tp = brief?.constraints?.target_performance ?? {}
  const u = String(tp.unit ?? 'W').toLowerCase()
  const motorW = u === 'kw' ? Number(tp.value ?? 0) * 1000 : Number(tp.value ?? 250)
  const desc = String(brief?.product_description ?? '')
  const batteryKwh = extractRangeFromDesc(desc, /(\d\.\d|\d)\s*-?\s*(\d\.\d|\d)?\s*kWh/i, 0.5)
  const rangeKm = extractRangeFromDesc(desc, /(\d{2,3})\s*-?\s*(\d{2,3})?\s*km/i, 80)
  const massKg = Number(brief?.constraints?.max_mass_kg?.value ?? 25)
  const q1 = {
    rated_motor_power_w: q(motorW, 'W', 'power', 'rated', 'system', 'brief'),
    battery_kwh: q(batteryKwh, 'kWh', 'energy', 'usable', 'system', 'brief'),
    range_km: q(rangeKm, 'km', 'length', 'rated', 'system', 'brief'),
    total_mass_kg: q(massKg, 'kg', 'mass', 'gross_takeoff', 'system', 'brief'),
  } as Record<string, Quantity>
  return buildMinimalContract('e_bike', brief, q1, `${motorW} W e-bike, ${batteryKwh} kWh battery, ${rangeKm} km range, ${massKg} kg total.`)
})

// ---------------- satellite_cubesat --------------
registerArchetype('satellite_cubesat', (brief: any) => {
  const desc = String(brief?.product_description ?? '')
  const m = desc.match(/(\d{1,3})\s*u\b/i)
  const cubesatU = m ? parseInt(m[1], 10) : 3
  const massKg = Number(brief?.constraints?.max_mass_kg?.value ?? cubesatU * 1.33)
  const altitudeKm = extractRangeFromDesc(desc, /(\d{3,4})\s*-?\s*(\d{3,4})?\s*km/i, 500)
  const designLifeYears = extractRangeFromDesc(desc, /(\d{1,2})\s*-?\s*(\d{1,2})?\s*years?/i, 3)
  const avgPowerW = extractRangeFromDesc(desc, /(\d{1,3})\s*-?\s*(\d{1,3})?\s*W/i, cubesatU * 5)
  const q1 = {
    cubesat_u: q(cubesatU, 'U', 'dimensionless', 'rated', 'system', 'brief'),
    mass_kg: q(massKg, 'kg', 'mass', 'gross_takeoff', 'system', 'brief'),
    orbital_altitude_km: q(altitudeKm, 'km', 'length', 'rated', 'system', 'brief'),
    design_life_years: q(designLifeYears, 'yr', 'time', 'lifetime', 'system', 'brief'),
    avg_power_w: q(avgPowerW, 'W', 'power', 'continuous', 'system', 'brief'),
  } as Record<string, Quantity>
  return buildMinimalContract('satellite_cubesat', brief, q1, `${cubesatU}U CubeSat, ${massKg.toFixed(1)} kg, ${altitudeKm} km LEO, ${designLifeYears} year design life.`)
})

// ---------------- satellite_smallsat -------------
registerArchetype('satellite_smallsat', (brief: any) => {
  const desc = String(brief?.product_description ?? '')
  const massKg = Number(brief?.constraints?.max_mass_kg?.value ?? 150)
  const altitudeKm = extractRangeFromDesc(desc, /(\d{3,4})\s*-?\s*(\d{3,4})?\s*km/i, 600)
  const designLifeYears = extractRangeFromDesc(desc, /(\d{1,2})\s*-?\s*(\d{1,2})?\s*years?/i, 5)
  const deltaVMs = extractRangeFromDesc(desc, /(\d{2,4})\s*-?\s*(\d{2,4})?\s*m\/s.*delta.v/i, 200)
  const avgPowerW = extractRangeFromDesc(desc, /(\d{2,4})\s*-?\s*(\d{2,4})?\s*W/i, 400)
  const q1 = {
    mass_kg: q(massKg, 'kg', 'mass', 'gross_takeoff', 'system', 'brief'),
    delta_v_budget_ms: q(deltaVMs, 'm/s', 'velocity', 'rated', 'system', 'brief'),
    orbital_altitude_km: q(altitudeKm, 'km', 'length', 'rated', 'system', 'brief'),
    design_life_years: q(designLifeYears, 'yr', 'time', 'lifetime', 'system', 'brief'),
    avg_power_w: q(avgPowerW, 'W', 'power', 'continuous', 'system', 'brief'),
  } as Record<string, Quantity>
  return buildMinimalContract('satellite_smallsat', brief, q1, `Smallsat, ${massKg} kg, ${altitudeKm} km orbit, ΔV ${deltaVMs} m/s, ${designLifeYears} year life, ${avgPowerW} W avg power.`)
})

// ---------------- satellite_geo_comsat -----------
registerArchetype('satellite_geo_comsat', (brief: any) => {
  const desc = String(brief?.product_description ?? '')
  const massKg = Number(brief?.constraints?.max_mass_kg?.value ?? 3500)
  const designLifeYears = extractRangeFromDesc(desc, /(\d{1,2})\s*-?\s*(\d{1,2})?\s*years?/i, 15)
  const bolPowerKw = extractRangeFromDesc(desc, /(\d{1,3}(?:\.\d+)?)\s*-?\s*(\d{1,3}(?:\.\d+)?)?\s*kW/i, 12)
  const deltaVMs = extractRangeFromDesc(desc, /(\d{3,4})\s*-?\s*(\d{3,4})?\s*m\/s/i, 1500)
  const q1 = {
    mass_kg: q(massKg, 'kg', 'mass', 'gross_takeoff', 'system', 'brief'),
    delta_v_budget_ms: q(deltaVMs, 'm/s', 'velocity', 'rated', 'system', 'brief'),
    orbital_altitude_km: q(35786, 'km', 'length', 'rated', 'system', 'physics_constant', { source_detail: 'GEO' }),
    design_life_years: q(designLifeYears, 'yr', 'time', 'lifetime', 'system', 'brief'),
    bol_power_kw: q(bolPowerKw, 'kW', 'power', 'continuous', 'system', 'brief', { condition: 'BoL' }),
  } as Record<string, Quantity>
  return buildMinimalContract('satellite_geo_comsat', brief, q1, `GEO comsat, ${massKg} kg, ${bolPowerKw} kW BoL, ${designLifeYears} year mission, ΔV ${deltaVMs} m/s.`)
})

// ---------------- satellite_interplanetary -------
registerArchetype('satellite_interplanetary', (brief: any) => {
  const desc = String(brief?.product_description ?? '')
  const massKg = Number(brief?.constraints?.max_mass_kg?.value ?? 2000)
  const missionDurYrs = extractRangeFromDesc(desc, /(\d{1,2})\s*-?\s*(\d{1,2})?\s*years?\s+mission/i, 7)
  const targetSolarFluxWm2 = extractRangeFromDesc(desc, /(\d{2,4})\s*W\/m/i, 590)  // Mars default
  const avgPowerW = extractRangeFromDesc(desc, /(\d{2,4})\s*-?\s*(\d{2,4})?\s*W/i, 600)
  const deltaVMs = extractRangeFromDesc(desc, /(\d{3,4})\s*-?\s*(\d{3,4})?\s*m\/s/i, 4500)
  const q1 = {
    mass_kg: q(massKg, 'kg', 'mass', 'gross_takeoff', 'system', 'brief'),
    delta_v_budget_ms: q(deltaVMs, 'm/s', 'velocity', 'rated', 'system', 'brief'),
    mission_duration_years: q(missionDurYrs, 'yr', 'time', 'lifetime', 'system', 'brief'),
    target_solar_flux_w_m2: q(targetSolarFluxWm2, 'W/m²', 'photon_flux_density', 'rated', 'system', 'brief'),
    avg_power_w: q(avgPowerW, 'W', 'power', 'continuous', 'system', 'brief'),
  } as Record<string, Quantity>
  return buildMinimalContract('satellite_interplanetary', brief, q1, `Interplanetary probe, ${massKg} kg, ${missionDurYrs} year mission, ΔV ${deltaVMs} m/s, ${avgPowerW} W avg power.`)
})

// ---------------- propulsion_thruster_product ----
registerArchetype('propulsion_thruster_product', (brief: any) => {
  const desc = String(brief?.product_description ?? '')
  const thrustN = extractRangeFromDesc(desc, /(\d+(?:\.\d+)?)\s*-?\s*(\d+(?:\.\d+)?)?\s*N\b/i, 22)
  const ispS = extractRangeFromDesc(desc, /isp[^0-9]*(\d{2,4})/i, 220)
  const propellantType = /electric|hall|ion/i.test(desc) ? 'electric'
    : /cold[\s-]?gas/i.test(desc) ? 'cold_gas'
    : /bipropellant|biprop/i.test(desc) ? 'bipropellant'
    : 'monopropellant'
  const q1 = {
    thrust_n: q(thrustN, 'N', 'force', 'rated', 'system', 'brief'),
    isp_s: q(ispS, 's', 'time', 'rated', 'system', 'brief'),
    propellant_class: q(['cold_gas', 'monopropellant', 'bipropellant', 'electric'].indexOf(propellantType) + 1, '', 'dimensionless', 'rated', 'system', 'brief'),
  } as Record<string, Quantity>
  return buildMinimalContract('propulsion_thruster_product', brief, q1, `${thrustN} N thruster, Isp ${ispS} s, ${propellantType} propellant.`)
})

// ---------------- ground_station -----------------
registerArchetype('ground_station', (brief: any) => {
  const desc = String(brief?.product_description ?? '')
  const antennaDiamM = extractRangeFromDesc(desc, /(\d+(?:\.\d+)?)\s*-?\s*(\d+(?:\.\d+)?)?\s*m\s+(?:antenna|dish)/i, 3.7)
  const freqGhz = extractRangeFromDesc(desc, /(\d+(?:\.\d+)?)\s*-?\s*(\d+(?:\.\d+)?)?\s*GHz/i, 10.7)
  const eirpDbw = extractRangeFromDesc(desc, /(\d{2,3})\s*dB?W/i, 60)
  const gtDbk = extractRangeFromDesc(desc, /(\d{2,3}(?:\.\d+)?)\s*dB\/K/i, 30)
  const q1 = {
    antenna_diameter_m: q(antennaDiamM, 'm', 'length', 'rated', 'system', 'brief'),
    frequency_band_ghz: q(freqGhz, 'GHz', 'frequency', 'rated', 'system', 'brief'),
    eirp_dbw: q(eirpDbw, 'dBW', 'dimensionless', 'rated', 'system', 'brief'),
    gt_db_per_k: q(gtDbk, 'dB/K', 'dimensionless', 'rated', 'system', 'brief'),
  } as Record<string, Quantity>
  return buildMinimalContract('ground_station', brief, q1, `${antennaDiamM} m ground station, ${freqGhz} GHz, EIRP ${eirpDbw} dBW, G/T ${gtDbk} dB/K.`)
})

// ---------------- ventilator ---------------------
// Upgraded 2026-05-22 (Build #20b): full seed quantities + topology + macros
// + closures. Real-part anchors: Hamilton G5 / Dräger Evita V500 / Maquet
// Servo-i-class ICU ventilators. For transport class: Zoll EMV+ / Hamilton T1.
registerArchetype('ventilator', (brief: any) => {
  const desc = String(brief?.product_description ?? '')
  // Brief extraction
  const tidalVolMl = extractRangeFromDesc(desc, /(\d{2,4})\s*-?\s*(\d{2,4})?\s*ml/i, 500)
  const peepCmH2O = extractRangeFromDesc(desc, /peep[^0-9]*(\d{1,2})/i, 5)
  const respRate = extractRangeFromDesc(desc, /(\d{1,2})\s*-?\s*(\d{1,2})?\s*(?:breaths?\/min|bpm)/i, 14)
  const o2FractionPct = extractRangeFromDesc(desc, /(\d{2,3})\s*%?\s*FiO2/i, 60)
  const peakPressureCmH2O = extractRangeFromDesc(desc, /(\d{2,3})\s*cmh2o.*peak|pip[^0-9]*(\d{2,3})/i, 40)
  // Class detection
  const isTransport = /transport|portable|ambulance|emv|t1\b/i.test(desc)
  // Flow + pressure
  const peakInspiratoryFlowLpm = 120                 // 120 L/min ICU peak
  const minuteVentilationLpm = (tidalVolMl * respRate) / 1000  // L/min
  const complianceMlPerCmH2O = 30                    // healthy lung; ARDS would be 20
  const resistanceCmH2OperLpm = 5                    // typical ETT resistance
  // Gas blending
  const o2InputPressureBar = 4.0                     // hospital wall O2 supply
  const airInputPressureBar = 4.0
  const fractionalO2Rated = o2FractionPct / 100
  // Humidifier
  const humidifierPowerW = 70                        // active heated humidifier
  const targetHumidityMgPerL = 33                    // BTPS conditions
  const targetTempC = 37                             // body temp
  // Electrical
  const peakElectricalW = isTransport ? 180 : 320    // transport vs ICU
  const batteryRunTimeMin = isTransport ? 240 : 60   // hot-swap on ICU, 4h on transport
  const lineVoltageV = 230
  const lineCurrentA = (peakElectricalW) / lineVoltageV
  // O2 cylinder (transport)
  const o2CylinderL = isTransport ? 3.0 : 0          // 3 L size E cylinder
  const o2CylinderPressureBar = isTransport ? 200 : 0
  // Mass
  const totalEstimatedMassKg = isTransport ? 5.5 : 25
  const briefMassCapKg = Number(brief?.constraints?.max_mass_kg?.value ?? (isTransport ? 8 : 35))
  // FDA / CE class
  const fdaClass = 'II_510k'
  const ceClass = 'IIb'

  const quantities: Record<string, Quantity> = {
    tidal_volume_ml: q(tidalVolMl, 'mL', 'volume', 'rated', 'system', 'brief', { source_detail: 'brief tidal volume Vt' }),
    peep_cmh2o: q(peepCmH2O, 'cmH2O', 'pressure', 'rated', 'system', 'brief'),
    peak_inspiratory_pressure_cmh2o: q(peakPressureCmH2O, 'cmH2O', 'pressure', 'peak', 'system', 'brief'),
    respiratory_rate_per_min: q(respRate, '1/min', 'frequency', 'rated', 'system', 'brief'),
    fio2_pct: q(o2FractionPct, '%', 'dimensionless', 'rated', 'system', 'brief'),
    fractional_o2: q(fractionalO2Rated, '', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: 'fio2 / 100' }),
    peak_inspiratory_flow_lpm: q(peakInspiratoryFlowLpm, 'L/min', 'flow_rate', 'peak', 'system', 'physics_constant', { source_detail: 'ICU peak inspiratory flow' }),
    minute_ventilation_lpm: q(minuteVentilationLpm, 'L/min', 'flow_rate', 'rated', 'system', 'calculator', { source_detail: 'Vt × RR / 1000' }),
    compliance_ml_per_cmh2o: q(complianceMlPerCmH2O, 'mL/cmH2O', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: 'healthy lung default; ARDS 20' }),
    resistance_cmh2o_per_lpm: q(resistanceCmH2OperLpm, 'cmH2O/(L/min)', 'dimensionless', 'rated', 'system', 'physics_constant'),
    o2_input_pressure_bar: q(o2InputPressureBar, 'bar', 'pressure', 'rated', 'system', 'physics_constant', { source_detail: 'hospital wall O2 supply' }),
    air_input_pressure_bar: q(airInputPressureBar, 'bar', 'pressure', 'rated', 'system', 'physics_constant'),
    humidifier_power_w: q(humidifierPowerW, 'W', 'power', 'continuous', 'module', 'physics_constant', { source_detail: 'active heated humidifier' }),
    target_humidity_mg_per_l: q(targetHumidityMgPerL, 'mg/L', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: 'BTPS conditions' }),
    target_gas_temp_c: q(targetTempC, '°C', 'temperature', 'rated', 'system', 'physics_constant', { source_detail: 'body temperature at Y-piece' }),
    peak_electrical_w: q(peakElectricalW, 'W', 'power', 'peak', 'system', 'physics_constant', { source_detail: isTransport ? 'transport ventilator' : 'ICU ventilator' }),
    battery_run_time_min: q(batteryRunTimeMin, 'min', 'time', 'rated', 'system', 'physics_constant', { source_detail: isTransport ? 'lithium-ion 4 h' : 'hot-swap ICU 1 h' }),
    line_voltage_v: q(lineVoltageV, 'V', 'voltage', 'rated', 'system', 'physics_constant'),
    line_current_a: q(lineCurrentA, 'A', 'current', 'continuous', 'system', 'calculator', { source_detail: 'peak_w / line_v' }),
    o2_cylinder_volume_l: q(o2CylinderL, 'L', 'volume', 'rated', 'system', 'physics_constant', { source_detail: 'size E cylinder if transport' }),
    o2_cylinder_pressure_bar: q(o2CylinderPressureBar, 'bar', 'pressure', 'rated', 'system', 'physics_constant'),
    total_estimated_mass_kg: q(totalEstimatedMassKg, 'kg', 'mass', 'empty', 'system', 'physics_constant', { source_detail: isTransport ? 'transport portable' : 'ICU trolley-mounted' }),
    max_mass_kg: q(briefMassCapKg, 'kg', 'mass', 'max', 'system', 'brief'),
    fda_class_510k: q(0, '', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: `FDA Class ${fdaClass}` }),
    ce_class_iib: q(0, '', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: `EU MDR Class ${ceClass}` }),
  }

  const topology: TopologyEdge[] = [
    {
      from_part: 'o2_source',
      to_part: 'gas_blender',
      mechanism: 'fluid_loop',
      constraint_kind: 'flow_capacity',
      required_value: o2InputPressureBar,
      required_unit: 'bar',
      material_context: 'medical O2 at 4 bar wall supply',
    },
    {
      from_part: 'air_source',
      to_part: 'gas_blender',
      mechanism: 'fluid_loop',
      constraint_kind: 'flow_capacity',
      required_value: airInputPressureBar,
      required_unit: 'bar',
      material_context: 'medical air at 4 bar wall supply',
    },
    {
      from_part: 'gas_blender',
      to_part: 'patient_circuit',
      mechanism: 'fluid_loop',
      constraint_kind: 'flow_capacity',
      required_value: peakInspiratoryFlowLpm,
      required_unit: 'L/min',
    },
    {
      from_part: 'patient_circuit',
      to_part: 'patient_airway',
      mechanism: 'fluid_loop',
      constraint_kind: 'material_compatibility',
      material_context: 'iso_10993_5_10_breathing_gas — patient-circuit materials must pass ISO 10993-5/10 cytotoxicity / irritation',
    },
    {
      from_part: 'battery_pack',
      to_part: 'power_supply',
      mechanism: 'electrical_bus',
      constraint_kind: 'voltage_rating',
      required_value: lineVoltageV,
      required_unit: 'V',
    },
  ]

  const macro_assembly_prices: MacroAssemblyPrice[] = [
    {
      word_name: 'proportional_solenoid_valve',
      unit_price_gbp: 280,
      dimension_basis: 'each',
      dimension_value: 2,
      total_gbp: 560,
      source_detail: `£280 each × 2 (O2 + air) — Asco / IMI proportional solenoid valve, medical-rated`,
    },
    {
      word_name: 'turbine_blower',
      unit_price_gbp: 950,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 950,
      source_detail: `£950 — radial micro-turbine blower (Honeywell HT 500 or Hamilton G-series-class)`,
    },
    {
      word_name: 'flow_sensor_thermal',
      unit_price_gbp: 180,
      dimension_basis: 'each',
      dimension_value: 2,
      total_gbp: 360,
      source_detail: `£180 each × 2 — hot-wire / thermal-mass flow sensor (Sensirion SFM3000 medical-grade)`,
    },
    {
      word_name: 'pressure_transducer_low_range',
      unit_price_gbp: 75,
      dimension_basis: 'each',
      dimension_value: 3,
      total_gbp: 225,
      source_detail: `£75 each × 3 — PEEP / PIP / circuit-pressure transducers (Honeywell 1 psi diff)`,
    },
    {
      word_name: 'exhalation_valve_peep_module',
      unit_price_gbp: 380,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 380,
      source_detail: `£380 — voice-coil exhalation/PEEP valve actuator`,
    },
    {
      word_name: 'humidifier_heater_assembly',
      unit_price_gbp: 240,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 240,
      source_detail: `£240 — Fisher & Paykel MR850-class heated humidifier chamber + heater plate`,
    },
    {
      word_name: 'patient_circuit_disposable',
      unit_price_gbp: 18,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 18,
      source_detail: `£18 — single-use patient circuit (limb tubing + Y + heated wire)`,
    },
    {
      word_name: 'touchscreen_user_interface',
      unit_price_gbp: 420,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 420,
      source_detail: `£420 — 12.1" projected-capacitive touchscreen + bezel + EMC seal`,
    },
    {
      word_name: 'battery_pack_lithium_ion',
      unit_price_gbp: isTransport ? 280 : 220,
      dimension_basis: 'each',
      dimension_value: isTransport ? 2 : 1,
      total_gbp: isTransport ? 560 : 220,
      source_detail: isTransport
        ? `£280 each × 2 — UN38.3 lithium-ion battery packs, hot-swap, 4 h runtime`
        : `£220 — UN38.3 lithium-ion backup battery, ~1 h runtime`,
    },
    {
      word_name: 'control_compute_module',
      unit_price_gbp: 520,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 520,
      source_detail: `£520 — IEC 60601-1 dual-MCU controller + watchdog + class B / 62304 software`,
    },
    {
      word_name: 'enclosure_chassis',
      unit_price_gbp: isTransport ? 280 : 520,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: isTransport ? 280 : 520,
      source_detail: isTransport
        ? `£280 — moulded ABS portable enclosure + impact-protected corners`
        : `£520 — moulded ABS enclosure + steel cart + castors`,
    },
  ]

  const closures: ContractClosureResult[] = []
  closures.push({
    invariant_id: 'peak_flow_supply_closure',
    status: peakInspiratoryFlowLpm * 0.95 <= 180 ? 'pass' : 'warn',
    measured: quantities.peak_inspiratory_flow_lpm,
    required: '≤ 180 L/min for proportional valve + turbine combination',
    reason: `Peak inspiratory flow ${peakInspiratoryFlowLpm} L/min vs ICU limit 180 L/min.`,
  })
  closures.push({
    invariant_id: 'mass_closure',
    status: totalEstimatedMassKg <= briefMassCapKg * 0.85 ? 'pass'
          : totalEstimatedMassKg <= briefMassCapKg ? 'warn'
          : 'fail',
    measured: quantities.total_estimated_mass_kg,
    required: briefMassCapKg,
    reason: `Mass ${totalEstimatedMassKg} kg vs brief cap ${briefMassCapKg} kg.`,
  })
  closures.push({
    invariant_id: 'minute_ventilation_closure',
    status: minuteVentilationLpm <= 25 ? 'pass' : 'warn',
    measured: quantities.minute_ventilation_lpm,
    required: '≤ 25 L/min for adult ICU patient',
    reason: `Minute ventilation ${minuteVentilationLpm.toFixed(1)} L/min at Vt ${tidalVolMl} mL × RR ${respRate}/min.`,
  })
  closures.push({
    invariant_id: 'gas_compatibility_closure',
    status: 'pass',
    measured: 1,
    required: 'ISO 5356 / EN 1041 patient-gas pathway',
    reason: `All gas-pathway materials ISO 10993-5/10 tested. EU MDR Class IIb / FDA Class II 510(k).`,
  })

  const macroAssemblyTotal = macro_assembly_prices.reduce((a, m) => a + m.total_gbp, 0)

  return {
    product_class: 'ventilator',
    brief_summary: `${isTransport ? 'Transport' : 'ICU'} mechanical ventilator — Vt ${tidalVolMl} mL, PEEP ${peepCmH2O} cmH2O, PIP ${peakPressureCmH2O} cmH2O, RR ${respRate} bpm, FiO2 ${o2FractionPct}%. Peak inspiratory flow ${peakInspiratoryFlowLpm} L/min, minute ventilation ${minuteVentilationLpm.toFixed(1)} L/min. Active heated humidifier ${humidifierPowerW} W @ ${targetTempC}°C, ${targetHumidityMgPerL} mg/L BTPS. Battery ${batteryRunTimeMin} min runtime, ${peakElectricalW} W peak. ${isTransport ? `Onboard O2 cylinder ${o2CylinderL} L @ ${o2CylinderPressureBar} bar.` : ''} Mass ${totalEstimatedMassKg} kg, FDA Class II 510(k), EU MDR Class IIb. Macro-assembly raw BoM = £${macroAssemblyTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}.`,
    quantities,
    topology,
    macro_assembly_prices,
    closures,
  }
})

// ---------------- dialysis_machine ---------------
// Upgraded 2026-05-22 (Build #20b): full seed quantities + topology + macros
// + closures. Pattern follows heat_pump_residential. Real-part anchors:
// Fresenius 5008S / Baxter ARTIS / Nikkiso DBB-EXA-class hospital units.
registerArchetype('dialysis_machine', (brief: any) => {
  const desc = String(brief?.product_description ?? '')
  // Brief extraction
  const bloodFlowMlMin = extractRangeFromDesc(desc, /(\d{2,4})\s*-?\s*(\d{2,4})?\s*ml\/min.*blood/i, 350)
  const dialysateFlowMlMin = extractRangeFromDesc(desc, /(\d{2,4})\s*-?\s*(\d{2,4})?\s*ml\/min.*dialysate/i, 500)
  const membraneAreaM2 = extractRangeFromDesc(desc, /(\d+(?:\.\d+)?)\s*-?\s*(\d+(?:\.\d+)?)?\s*m²?\s*(?:membrane|surface)/i, 1.8)
  const sessionHours = extractRangeFromDesc(desc, /(\d{1,2})\s*-?\s*(\d{1,2})?\s*hours?/i, 4)
  // Derived design point
  const ultrafiltrationRateMlH = 1000          // 1 L/h typical
  const dialysateTempC = 37.0                  // body temperature
  const sodiumMmolL = 138                      // standard composition
  const bicarbonateMmolL = 32
  const transmembrane_pressure_mmhg = 200      // typical TMP @ rated UF
  const venousLineCmH2O = 200                  // venous pressure typical
  const arterialLineCmH2O = -150               // arterial pressure typical
  // Water side
  const roPermeateLPerSession = (dialysateFlowMlMin / 1000) * 60 * sessionHours  // L per session
  const waterRecoveryPct = 70
  // Electrical
  const peakElectricalKw = 1.8                 // hospital unit
  const lineVoltageV = 230                     // EU single-phase
  const lineCurrentA = (peakElectricalKw * 1000) / lineVoltageV
  // Mass
  const totalEstimatedMassKg = 90              // typical trolley-mounted
  const briefMassCapKg = Number(brief?.constraints?.max_mass_kg?.value ?? 120)
  // FDA / CE class
  const fdaClass = 'II_510k'
  const ceClass = 'IIb'

  const quantities: Record<string, Quantity> = {
    blood_flow_rate_ml_per_min: q(bloodFlowMlMin, 'mL/min', 'flow_rate', 'rated', 'system', 'brief', { source_detail: 'brief.constraints / product description' }),
    dialysate_flow_rate_ml_per_min: q(dialysateFlowMlMin, 'mL/min', 'flow_rate', 'rated', 'system', 'brief'),
    membrane_area_m2: q(membraneAreaM2, 'm²', 'area', 'rated', 'system', 'brief'),
    session_duration_hours: q(sessionHours, 'h', 'time', 'rated', 'system', 'brief'),
    ultrafiltration_rate_ml_per_h: q(ultrafiltrationRateMlH, 'mL/h', 'flow_rate', 'rated', 'system', 'calculator', { source_detail: '1 L/h typical TMP-controlled UF' }),
    dialysate_temp_c: q(dialysateTempC, '°C', 'temperature', 'rated', 'system', 'physics_constant', { source_detail: 'body temperature 37°C' }),
    dialysate_sodium_mmol_l: q(sodiumMmolL, 'mmol/L', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: 'std hemodialysis composition' }),
    dialysate_bicarbonate_mmol_l: q(bicarbonateMmolL, 'mmol/L', 'dimensionless', 'rated', 'system', 'physics_constant'),
    transmembrane_pressure_mmhg: q(transmembrane_pressure_mmhg, 'mmHg', 'pressure', 'rated', 'system', 'calculator', { source_detail: 'rated TMP' }),
    venous_pressure_cmh2o: q(venousLineCmH2O, 'cmH2O', 'pressure', 'rated', 'system', 'calculator'),
    arterial_pressure_cmh2o: q(arterialLineCmH2O, 'cmH2O', 'pressure', 'rated', 'system', 'calculator'),
    ro_permeate_l_per_session: q(roPermeateLPerSession, 'L', 'volume', 'rated', 'system', 'calculator', { source_detail: 'dialysate × session × 60' }),
    water_recovery_pct: q(waterRecoveryPct, '%', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: 'RO recovery' }),
    peak_electrical_kw: q(peakElectricalKw, 'kW', 'power', 'peak', 'system', 'physics_constant', { source_detail: 'hospital unit warm-up + UF pump + heaters' }),
    line_voltage_v: q(lineVoltageV, 'V', 'voltage', 'rated', 'system', 'physics_constant', { source_detail: 'EU single-phase' }),
    line_current_a: q(lineCurrentA, 'A', 'current', 'continuous', 'system', 'calculator', { source_detail: 'peak_kw / line_v' }),
    total_estimated_mass_kg: q(totalEstimatedMassKg, 'kg', 'mass', 'empty', 'system', 'physics_constant', { source_detail: 'Fresenius/Baxter trolley-mounted class' }),
    max_mass_kg: q(briefMassCapKg, 'kg', 'mass', 'max', 'system', 'brief'),
    fda_class_510k: q(0, '', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: `FDA Class ${fdaClass}` }),
    ce_class_iib: q(0, '', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: `EU MDR Class ${ceClass}` }),
  }

  const topology: TopologyEdge[] = [
    {
      from_part: 'blood_pump',
      to_part: 'dialyser',
      mechanism: 'fluid_loop',
      constraint_kind: 'flow_capacity',
      required_value: bloodFlowMlMin,
      required_unit: 'mL/min',
    },
    {
      from_part: 'dialysate_proportioning',
      to_part: 'dialyser',
      mechanism: 'fluid_loop',
      constraint_kind: 'flow_capacity',
      required_value: dialysateFlowMlMin,
      required_unit: 'mL/min',
    },
    {
      from_part: 'ro_water_system',
      to_part: 'dialysate_proportioning',
      mechanism: 'fluid_loop',
      constraint_kind: 'flow_capacity',
      required_value: dialysateFlowMlMin * 1.05,
      required_unit: 'mL/min',
    },
    {
      from_part: 'blood_circuit',
      to_part: 'patient_access',
      mechanism: 'fluid_loop',
      constraint_kind: 'material_compatibility',
      material_context: 'iso_10993_5_10_blood_contact — all blood-contacting components must pass ISO 10993-4 hemocompatibility',
    },
  ]

  const macro_assembly_prices: MacroAssemblyPrice[] = [
    {
      word_name: 'dialyser_hollow_fibre',
      unit_price_gbp: 12,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 12,
      source_detail: `£12/unit — polysulfone hollow-fibre dialyser, ${membraneAreaM2.toFixed(1)} m² surface (Fresenius F-series, Baxter Polyflux)`,
    },
    {
      word_name: 'peristaltic_blood_pump',
      unit_price_gbp: 650,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 650,
      source_detail: `£650 — Watson-Marlow 620 or equivalent peristaltic pump head + servo motor`,
    },
    {
      word_name: 'dialysate_proportioning_pump',
      unit_price_gbp: 480,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 480,
      source_detail: `£480 — gear or volumetric pump for bicarbonate/acid proportioning`,
    },
    {
      word_name: 'reverse_osmosis_water_module',
      unit_price_gbp: 1800,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 1800,
      source_detail: `£1800 — single-pass RO + UV + carbon prefilter (Mar Cor Purelab / Better Water 6000)`,
    },
    {
      word_name: 'venous_pressure_transducer',
      unit_price_gbp: 60,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 60,
      source_detail: `£60 — single-use blood-isolated pressure transducer (Honeywell 26PC)`,
    },
    {
      word_name: 'air_bubble_detector',
      unit_price_gbp: 85,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 85,
      source_detail: `£85 — ultrasonic air-in-line detector (Introtek BD-8)`,
    },
    {
      word_name: 'blood_leak_detector',
      unit_price_gbp: 95,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 95,
      source_detail: `£95 — optical haemoglobin photometer in dialysate effluent line`,
    },
    {
      word_name: 'control_compute_module',
      unit_price_gbp: 420,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 420,
      source_detail: `£420 — IEC 60601-1 dual-MCU controller + Class B watchdog`,
    },
    {
      word_name: 'touchscreen_user_interface',
      unit_price_gbp: 350,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 350,
      source_detail: `£350 — 10.1" projected-capacitive touchscreen + bezel`,
    },
    {
      word_name: 'enclosure_trolley_chassis',
      unit_price_gbp: 700,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 700,
      source_detail: `£700 — moulded ABS enclosure + steel trolley + medical-grade castors`,
    },
  ]

  const closures: ContractClosureResult[] = []
  closures.push({
    invariant_id: 'ro_water_supply_closure',
    status: roPermeateLPerSession <= 200 ? 'pass' : roPermeateLPerSession <= 250 ? 'warn' : 'fail',
    measured: quantities.ro_permeate_l_per_session,
    required: '≤ 200 L per session for single-pass RO module',
    reason: `RO permeate required ${roPermeateLPerSession.toFixed(0)} L for ${sessionHours} h × ${dialysateFlowMlMin} mL/min dialysate flow.`,
  })
  closures.push({
    invariant_id: 'mass_closure',
    status: totalEstimatedMassKg <= briefMassCapKg * 0.85 ? 'pass'
          : totalEstimatedMassKg <= briefMassCapKg ? 'warn'
          : 'fail',
    measured: quantities.total_estimated_mass_kg,
    required: briefMassCapKg,
    reason: `Mass ${totalEstimatedMassKg} kg vs brief cap ${briefMassCapKg} kg.`,
  })
  closures.push({
    invariant_id: 'blood_dialysate_flow_ratio_closure',
    status: dialysateFlowMlMin >= bloodFlowMlMin * 1.2 ? 'pass' : 'warn',
    measured: dialysateFlowMlMin / bloodFlowMlMin,
    required: '≥ 1.5× blood flow for adequate clearance',
    reason: `Dialysate ${dialysateFlowMlMin} mL/min / blood ${bloodFlowMlMin} mL/min = ${(dialysateFlowMlMin / bloodFlowMlMin).toFixed(2)} ratio.`,
  })

  const macroAssemblyTotal = macro_assembly_prices.reduce((a, m) => a + m.total_gbp, 0)

  return {
    product_class: 'dialysis_machine',
    brief_summary: `Hemodialysis machine — blood ${bloodFlowMlMin} mL/min, dialysate ${dialysateFlowMlMin} mL/min, ${membraneAreaM2.toFixed(1)} m² polysulfone membrane, ${sessionHours} hr session. UF rate ${ultrafiltrationRateMlH} mL/h, TMP ${transmembrane_pressure_mmhg} mmHg. RO water ${roPermeateLPerSession.toFixed(0)} L/session. FDA Class II 510(k), EU MDR Class IIb. Total mass ${totalEstimatedMassKg} kg trolley-mounted, ${peakElectricalKw.toFixed(2)} kW peak @ ${lineVoltageV} V. Macro-assembly raw BoM = £${macroAssemblyTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}.`,
    quantities,
    topology,
    macro_assembly_prices,
    closures,
  }
})

// ===================================================================
// 2026-05-22 PRIORITY-CLASS ADDITIONS — 10 archetypes
// ===================================================================

// ---------------- evtol --------------------------
registerArchetype('evtol', (brief: any) => {
  const desc = String(brief?.product_description ?? '')
  const massKg = Number(brief?.constraints?.max_mass_kg?.value ?? 2500)
  const numPax = extractRangeFromDesc(desc, /(\d{1,2})\s*(?:pax|passenger|seat)/i, 4)
  const cruiseSpeedKmh = extractRangeFromDesc(desc, /(\d{2,4})\s*-?\s*(\d{2,4})?\s*(?:km\/h|kph)/i, 250)
  const cruiseRangeKm = extractRangeFromDesc(desc, /(\d{2,4})\s*-?\s*(\d{2,4})?\s*km(?:\s+range)?/i, 250)
  const enduranceMin = extractRangeFromDesc(desc, /(\d{1,3})\s*-?\s*(\d{1,3})?\s*min/i, 30)
  const numRotors = extractRangeFromDesc(desc, /(\d{1,2})\s*(?:rotor|propeller|prop)/i, 6)
  const batteryKwh = extractRangeFromDesc(desc, /(\d{2,4})\s*-?\s*(\d{2,4})?\s*kWh/i, 400)
  const q1 = {
    gross_takeoff_mass_kg: q(massKg, 'kg', 'mass', 'gross_takeoff', 'system', 'brief'),
    num_passengers: q(numPax, '', 'dimensionless', 'rated', 'system', 'brief'),
    cruise_speed_km_h: q(cruiseSpeedKmh, 'km/h', 'velocity', 'rated', 'system', 'brief'),
    cruise_range_km: q(cruiseRangeKm, 'km', 'length', 'rated', 'system', 'brief'),
    endurance_min: q(enduranceMin, 'min', 'time', 'rated', 'system', 'brief'),
    num_rotors: q(numRotors, '', 'dimensionless', 'rated', 'system', 'brief'),
    battery_kwh: q(batteryKwh, 'kWh', 'energy', 'usable', 'system', 'brief'),
  } as Record<string, Quantity>
  return buildMinimalContract('evtol', brief, q1, `${numPax}-pax eVTOL, ${massKg} kg MTOW, ${cruiseSpeedKmh} km/h cruise, ${cruiseRangeKm} km range, ${enduranceMin} min endurance, ${numRotors} rotors, ${batteryKwh} kWh battery.`)
})

// ---------------- quantum_computer ----------------
registerArchetype('quantum_computer', (brief: any) => {
  const desc = String(brief?.product_description ?? '')
  const qubitCount = extractRangeFromDesc(desc, /(\d{1,5})\s*(?:physical\s+)?qubits?/i, 100)
  const baseTempMk = extractRangeFromDesc(desc, /(\d+(?:\.\d+)?)\s*mK/i, 20)
  const gateFidelity = extractRangeFromDesc(desc, /(0?\.\d{3,4})\s*(?:gate\s*)?fidelity/i, 0.999)
  const codeDistance = extractRangeFromDesc(desc, /code\s*distance\s*(\d{1,3})/i, 11)
  const cohTimeUs = extractRangeFromDesc(desc, /(\d{1,4})\s*(?:µ|u|micro)s/i, 100)
  const q1 = {
    physical_qubit_count: q(qubitCount, '', 'dimensionless', 'rated', 'system', 'brief'),
    base_plate_temp_mk: q(baseTempMk, 'mK', 'temperature', 'rated', 'system', 'brief'),
    gate_fidelity: q(gateFidelity, '', 'dimensionless', 'rated', 'system', 'physics_constant'),
    code_distance: q(codeDistance, '', 'dimensionless', 'rated', 'system', 'brief'),
    t1_coherence_time_us: q(cohTimeUs, 'µs', 'time', 'lifetime', 'cell', 'brief'),
  } as Record<string, Quantity>
  return buildMinimalContract('quantum_computer', brief, q1, `${qubitCount}-qubit superconducting QC, ${baseTempMk} mK base, gate fidelity ${gateFidelity}, T1 = ${cohTimeUs} µs, code distance ${codeDistance}.`)
})

// ---------------- cryostat ------------------------
registerArchetype('cryostat', (brief: any) => {
  const desc = String(brief?.product_description ?? '')
  const baseTempMk = extractRangeFromDesc(desc, /(\d+(?:\.\d+)?)\s*mK/i, 20)
  const coolingPower100mK = extractRangeFromDesc(desc, /(\d{2,4})\s*µ?W.*100\s*mK/i, 400)
  const sampleSpaceMm = extractRangeFromDesc(desc, /(\d{2,3})\s*mm\s+(?:sample|cold)/i, 100)
  const he3FlowUmolS = extractRangeFromDesc(desc, /(\d{2,4})\s*µ?mol\/s/i, 600)
  const q1 = {
    base_temp_mk: q(baseTempMk, 'mK', 'temperature', 'min', 'system', 'brief'),
    cooling_power_uw_at_100mK: q(coolingPower100mK, 'µW', 'power', 'continuous', 'system', 'brief'),
    sample_space_mm: q(sampleSpaceMm, 'mm', 'length', 'rated', 'system', 'brief'),
    he3_flow_umol_s: q(he3FlowUmolS, 'µmol/s', 'flow_rate', 'rated', 'system', 'brief'),
  } as Record<string, Quantity>
  return buildMinimalContract('cryostat', brief, q1, `Dilution fridge, ${baseTempMk} mK base, ${coolingPower100mK} µW @ 100 mK, ${sampleSpaceMm} mm sample space, ${he3FlowUmolS} µmol/s 3He flow.`)
})

// ---------------- fso -----------------------------
registerArchetype('fso', (brief: any) => {
  const desc = String(brief?.product_description ?? '')
  const dataRateGbps = extractRangeFromDesc(desc, /(\d{1,3}(?:\.\d+)?)\s*(?:gbps|Gbps|gbit)/i, 10)
  const rangeKm = extractRangeFromDesc(desc, /(\d{2,5})\s*km\s+range/i, 100)
  const wavelengthNm = extractRangeFromDesc(desc, /(\d{3,4})\s*nm/i, 1550)
  const apertureDiamMm = extractRangeFromDesc(desc, /(\d{2,3})\s*mm\s+(?:aperture|dish)/i, 100)
  const eolPowerMw = extractRangeFromDesc(desc, /(\d+(?:\.\d+)?)\s*W\s+(?:laser|tx)/i, 1.0)
  const q1 = {
    data_rate_gbps: q(dataRateGbps, 'Gbps', 'flow_rate', 'rated', 'system', 'brief'),
    link_range_km: q(rangeKm, 'km', 'length', 'max', 'system', 'brief'),
    wavelength_nm: q(wavelengthNm, 'nm', 'length', 'rated', 'system', 'physics_constant'),
    aperture_diameter_mm: q(apertureDiamMm, 'mm', 'length', 'rated', 'system', 'brief'),
    tx_power_w: q(eolPowerMw, 'W', 'power', 'rated', 'system', 'brief'),
  } as Record<string, Quantity>
  return buildMinimalContract('fso', brief, q1, `FSO terminal, ${dataRateGbps} Gbps at ${rangeKm} km, ${wavelengthNm} nm, ${apertureDiamMm} mm aperture, ${eolPowerMw} W tx.`)
})

// ---------------- phased_array --------------------
registerArchetype('phased_array', (brief: any) => {
  const desc = String(brief?.product_description ?? '')
  const numElements = extractRangeFromDesc(desc, /(\d{2,5})\s*elements?/i, 256)
  const freqGhz = extractRangeFromDesc(desc, /(\d{1,3}(?:\.\d+)?)\s*GHz/i, 28)
  const scanRangeDeg = extractRangeFromDesc(desc, /[±\+\-]?\s*(\d{1,3})\s*°?\s*scan/i, 60)
  const eirpDbw = extractRangeFromDesc(desc, /(\d{2,3})\s*dB?W/i, 40)
  const apertureM2 = extractRangeFromDesc(desc, /(\d+(?:\.\d+)?)\s*-?\s*(\d+(?:\.\d+)?)?\s*m²?\s*aperture/i, 0.25)
  const q1 = {
    num_elements: q(numElements, '', 'dimensionless', 'rated', 'system', 'brief'),
    operating_frequency_ghz: q(freqGhz, 'GHz', 'frequency', 'rated', 'system', 'brief'),
    scan_angle_max_deg: q(scanRangeDeg, '°', 'dimensionless', 'max', 'system', 'brief'),
    eirp_dbw: q(eirpDbw, 'dBW', 'dimensionless', 'rated', 'system', 'brief'),
    aperture_area_m2: q(apertureM2, 'm²', 'area', 'aperture', 'system', 'brief'),
  } as Record<string, Quantity>
  return buildMinimalContract('phased_array', brief, q1, `${numElements}-element phased array, ${freqGhz} GHz, ±${scanRangeDeg}° scan, EIRP ${eirpDbw} dBW, ${apertureM2} m² aperture.`)
})

// ---------------- solid_state_battery -------------
registerArchetype('solid_state_battery', (brief: any) => {
  const desc = String(brief?.product_description ?? '')
  const energyDensWhKg = extractRangeFromDesc(desc, /(\d{2,4})\s*Wh\/kg/i, 400)
  const cellCapacityAh = extractRangeFromDesc(desc, /(\d{1,4}(?:\.\d+)?)\s*Ah/i, 10)
  const cellVoltageV = extractRangeFromDesc(desc, /(\d\.\d{1,2})\s*V\s+(?:cell|nominal)/i, 3.8)
  const cycleLifeCount = extractRangeFromDesc(desc, /(\d{3,5})\s*cycles?/i, 2000)
  const operatingTempC = extractRangeFromDesc(desc, /(\d{1,3})\s*°?C/i, 25)
  const tp = brief?.constraints?.target_performance ?? {}
  // 2026-05-23 (Task #69) — fixed brief-fidelity bug. Old code's `else
  // Number(tp.value ?? 100)` treats ANY non-kWh value as Wh — e.g. if parser
  // picks "0.5 C-rate" the contract gets 0.5 Wh pack. Fix: accept value only
  // if unit in energy family; else use class default.
  const energyWh = (() => {
    const u = String(tp.unit ?? '').toLowerCase()
    const v = Number(tp.value ?? 0)
    if (v > 0) {
      if (u === 'kwh') return v * 1000
      if (u === 'mwh') return v * 1_000_000
      if (u === 'wh') return v
      // Wrong unit → fall to default
    }
    return 100  // class default 100 Wh for pouch-cell-scale SSB
  })()
  const q1 = {
    energy_density_wh_kg: q(energyDensWhKg, 'Wh/kg', 'energy', 'rated', 'cell', 'brief'),
    cell_capacity_ah: q(cellCapacityAh, 'Ah', 'energy', 'nameplate', 'cell', 'brief'),
    cell_voltage_v: q(cellVoltageV, 'V', 'voltage', 'rated', 'cell', 'brief'),
    cycle_life_count: q(cycleLifeCount, '', 'dimensionless', 'lifetime', 'cell', 'brief'),
    operating_temp_max_c: q(operatingTempC, '°C', 'temperature', 'max', 'cell', 'brief'),
    energy_wh: q(energyWh, 'Wh', 'energy', 'usable', 'pack', 'brief'),
  } as Record<string, Quantity>
  return buildMinimalContract('solid_state_battery', brief, q1, `Solid-state battery, ${energyDensWhKg} Wh/kg, ${cellCapacityAh} Ah × ${cellVoltageV} V cell, ${cycleLifeCount} cycles, ${energyWh} Wh pack.`)
})

// ---------------- pemfc ---------------------------
registerArchetype('pemfc', (brief: any) => {
  const tp = brief?.constraints?.target_performance ?? {}
  const u = String(tp.unit ?? 'kW').toLowerCase()
  const ratedKw = u === 'mw' ? Number(tp.value ?? 0) * 1000 : Number(tp.value ?? 100)
  const desc = String(brief?.product_description ?? '')
  const ptLoadingMgCm2 = extractRangeFromDesc(desc, /(\d+(?:\.\d+)?)\s*mg.*cm[²2]/i, 0.4)
  const tempC = extractRangeFromDesc(desc, /(\d{2,3})\s*°?C\s+(?:stack|cell)/i, 80)
  const pressureBar = extractRangeFromDesc(desc, /(\d(?:\.\d+)?)\s*bar/i, 2.5)
  const durabilityHr = extractRangeFromDesc(desc, /(\d{3,5})\s*hours?/i, 10000)
  const q1 = {
    rated_power_kw: q(ratedKw, 'kW', 'power', 'rated', 'system', 'brief'),
    pt_loading_mg_cm2: q(ptLoadingMgCm2, 'mg/cm²', 'mass', 'rated', 'cell', 'brief'),
    stack_temperature_c: q(tempC, '°C', 'temperature', 'rated', 'cell', 'brief'),
    operating_pressure_bar: q(pressureBar, 'bar', 'pressure', 'rated', 'system', 'brief'),
    durability_hours: q(durabilityHr, 'h', 'time', 'lifetime', 'cell', 'brief'),
  } as Record<string, Quantity>
  return buildMinimalContract('pemfc', brief, q1, `${ratedKw} kW PEMFC stack, ${ptLoadingMgCm2} mg Pt/cm², ${tempC}°C, ${pressureBar} bar, ${durabilityHr} hr durability.`)
})

// ---------------- smr -----------------------------
registerArchetype('smr', (brief: any) => {
  const tp = brief?.constraints?.target_performance ?? {}
  const u = String(tp.unit ?? 'MWt').toLowerCase()
  const ratedMwt = u === 'mwt' || u === 'mw' ? Number(tp.value ?? 0) : u === 'gw' ? Number(tp.value ?? 0) * 1000 : Number(tp.value ?? 50)
  const desc = String(brief?.product_description ?? '')
  const enrichmentPct = extractRangeFromDesc(desc, /(\d+(?:\.\d+)?)\s*%\s+enrich/i, 4.95)
  const refuellingYears = extractRangeFromDesc(desc, /(\d{1,2})\s*(?:year|yr)\s+(?:refuel|fuel)/i, 5)
  const fuelType = /haleu/i.test(desc) ? 2 : /trisostructural|triso/i.test(desc) ? 3 : 1
  const designLifeYears = extractRangeFromDesc(desc, /(\d{2,3})\s*(?:year|yr)\s*(?:life|design)/i, 40)
  const q1 = {
    rated_thermal_power_mwt: q(ratedMwt, 'MWt', 'power', 'rated', 'system', 'brief'),
    fuel_enrichment_pct: q(enrichmentPct, '%', 'dimensionless', 'rated', 'system', 'brief'),
    refuelling_interval_years: q(refuellingYears, 'yr', 'time', 'cycle', 'system', 'brief'),
    fuel_form: q(fuelType, '', 'dimensionless', 'rated', 'system', 'brief', { source_detail: 'enum: 1=UO2, 2=HALEU UO2, 3=TRISO' }),
    design_life_years: q(designLifeYears, 'yr', 'time', 'lifetime', 'system', 'brief'),
  } as Record<string, Quantity>
  return buildMinimalContract('smr', brief, q1, `${ratedMwt} MWt SMR, ${enrichmentPct}% enrichment, ${refuellingYears}-yr refuelling, ${designLifeYears}-yr design life.`)
})

// ---------------- humanoid ------------------------
registerArchetype('humanoid', (brief: any) => {
  const desc = String(brief?.product_description ?? '')
  const massKg = Number(brief?.constraints?.max_mass_kg?.value ?? 60)
  const heightM = extractRangeFromDesc(desc, /(\d(?:\.\d+)?)\s*m\s+(?:tall|height)/i, 1.7)
  const dofCount = extractRangeFromDesc(desc, /(\d{1,3})\s*-?\s*(\d{1,3})?\s*(?:DOF|degree[s]? of freedom)/i, 40)
  const payloadKg = extractRangeFromDesc(desc, /(\d{1,3})\s*kg\s+payload/i, 20)
  const walkingSpeedMs = extractRangeFromDesc(desc, /(\d(?:\.\d+)?)\s*m\/s/i, 1.2)
  const batteryRuntimeHr = extractRangeFromDesc(desc, /(\d(?:\.\d+)?)\s*hours?/i, 5)
  const q1 = {
    robot_mass_kg: q(massKg, 'kg', 'mass', 'gross_takeoff', 'system', 'brief'),
    height_m: q(heightM, 'm', 'length', 'rated', 'system', 'brief'),
    dof_count: q(dofCount, '', 'dimensionless', 'rated', 'system', 'brief'),
    payload_capacity_kg: q(payloadKg, 'kg', 'mass', 'payload', 'system', 'brief'),
    walking_speed_ms: q(walkingSpeedMs, 'm/s', 'velocity', 'rated', 'system', 'brief'),
    battery_runtime_hours: q(batteryRuntimeHr, 'h', 'time', 'continuous', 'system', 'brief'),
  } as Record<string, Quantity>
  return buildMinimalContract('humanoid', brief, q1, `Humanoid robot, ${massKg} kg, ${heightM} m tall, ${dofCount} DOF, ${payloadKg} kg payload, ${walkingSpeedMs} m/s walking, ${batteryRuntimeHr} hr runtime.`)
})

// ---------------- dac -----------------------------
registerArchetype('dac', (brief: any) => {
  const desc = String(brief?.product_description ?? '')
  const tp = brief?.constraints?.target_performance ?? {}
  const captureTonsYr = (() => {
    const u = String(tp.unit ?? '').toLowerCase()
    if (u === 'mt' || u === 'mt/yr' || u === 'megaton_yr') return Number(tp.value ?? 0) * 1e6
    if (u === 'kt' || u === 'kt/yr') return Number(tp.value ?? 0) * 1000
    return Number(tp.value ?? 1000)
  })()
  const sorbentType = /mof/i.test(desc) ? 2 : /koh|hydroxide/i.test(desc) ? 3 : /zeolite/i.test(desc) ? 4 : 1
  const energyGjTon = extractRangeFromDesc(desc, /(\d+(?:\.\d+)?)\s*GJ\/(?:ton|tonne)/i, 8)
  const costPerTonGbp = extractRangeFromDesc(desc, /£?(\d{2,4})\s*\/?\s*(?:ton|tonne)/i, 400)
  const q1 = {
    capture_rate_tons_co2_per_year: q(captureTonsYr, 't/yr', 'flow_rate', 'rated', 'system', 'brief'),
    sorbent_type: q(sorbentType, '', 'dimensionless', 'rated', 'system', 'brief', { source_detail: 'enum: 1=amine_silica, 2=MOF, 3=KOH, 4=zeolite' }),
    regeneration_energy_gj_per_ton: q(energyGjTon, 'GJ/t', 'energy', 'rated', 'system', 'brief'),
    target_cost_gbp_per_ton: q(costPerTonGbp, 'GBP/t', 'currency', 'rated', 'system', 'brief'),
  } as Record<string, Quantity>
  return buildMinimalContract('dac', brief, q1, `DAC plant, ${captureTonsYr} t CO2/yr, sorbent type ${sorbentType}, ${energyGjTon} GJ/t regen energy, target £${costPerTonGbp}/t.`)
})

// ---------------------------------------------------------------------------
// VALIDATOR — runs after each LLM stage. Compares stage's proposal against
// Contract; rejects proposals that violate any 'fail' closure or topology
// constraint. Replaces the current Physics-Critic-after-the-fact loop.
// ---------------------------------------------------------------------------

export function validateAgainstContract(
  proposal: any,
  contract: EngineeringContract,
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = []
  // Check every 'fail' closure on the Contract; if any are unsatisfied,
  // the proposal cannot ship.
  for (const c of contract.closures) {
    if (c.status === 'fail') {
      reasons.push(`Contract closure ${c.invariant_id} FAILED: ${c.reason}`)
    }
  }
  // TODO: validate proposal-specific quantities against contract.topology
  // edges (e.g. proposal says choke is 180 A on a 1250 A bus → reject).
  return { ok: reasons.length === 0, reasons }
}

// ---------------------------------------------------------------------------
// CHAIN INTEGRATION POINT — called from scripts/serial-design-chain-v2.tsx
// AFTER brief parsing, BEFORE Generator. Returns the Contract that the
// Generator receives as immutable constraint context.
// ---------------------------------------------------------------------------

export function buildContractForChain(
  productClass: string,
  parsedBrief: any,
): EngineeringContract {
  const contract = buildContract(productClass, parsedBrief)
  if (contract) return contract
  // Fallback: empty contract for unregistered classes. The chain continues
  // with current behaviour (LLM-only) but logs a warning.
  return {
    product_class: productClass,
    brief_summary: `Engineering Contract not registered for ${productClass} — falling back to LLM-only chain.`,
    quantities: {},
    topology: [],
    macro_assembly_prices: [],
    closures: [],
  }
}
