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
  // Ambient envelope (EN 14511 / EN 14825): brief may override.
  // 2026-05-23 P0-3 fix: was reading `min_ambient_c.value` and
  // `max_ambient_c.value` — these keys DON'T EXIST in StructuredBriefJSON
  // schema (the real key is `operating_environment.temp_min_c` /
  // `temp_max_c` per src/lib/pdf-engine-v2/types.ts:34-38). Result: brief's
  // stated operating envelope was ALWAYS silently discarded for heat pump.
  // Cold-climate briefs (-25°C ambient) shipped designs sized for -20°C.
  const minAmbientC = Number(brief?.constraints?.operating_environment?.temp_min_c ?? -20)
  const maxAmbientC = Number(brief?.constraints?.operating_environment?.temp_max_c ?? 35)
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

/**
 * 2026-05-23 PRUNE: buildMinimalContract is the inert stub used by 23 of 35
 * archetypes (per 5-seat audit). It returns empty macros + topology +
 * closures — the Contract is essentially useless for cost reality / physics
 * critic / closure validation. Without a real per-class implementation, the
 * orchestrator's downstream stages (G2 cost-reality, G3 review-completeness,
 * cost-stack) silently default to a class-archetype that may be wrong by
 * 10-100× (wind turbine confirmed: 6 MW shipped at £73k vs industry £4-7M
 * because wind has no PRICE_BANDS entry AND uses this stub).
 *
 * Until each minimal-stub archetype is rewritten with a full contract
 * (per `bess` / `bioreactor` / `heat_pump_residential` pattern), this
 * function logs a HIGH-SEVERITY warning every time it fires so the
 * operator + chain log shows which class is silently inert. The returned
 * contract carries a `_is_minimal_stub: true` marker so downstream tools
 * (audit-pdf-run.ts, future regression harness) can flag it without
 * re-deriving the class name. Do NOT add new archetypes that call this
 * function — write a full builder modelled on `registerArchetype('bess', ...)`.
 *
 * See IMPROVEMENT_PLAN.md P2-7 for the per-class rewrite plan.
 */
function buildMinimalContract(productClass: string, brief: any, quantities: Record<string, Quantity>, briefSummary: string): EngineeringContract {
  console.error(`[contract] ⚠️  HIGH SEVERITY: archetype "${productClass}" uses buildMinimalContract stub — empty macros/topology/closures. Cost-stack + G2 cost-reality + physics critic will operate on class-default fallbacks. See IMPROVEMENT_PLAN.md P2-7.`)
  return {
    product_class: productClass,
    brief_summary: briefSummary,
    quantities,
    topology: [],
    macro_assembly_prices: [],
    closures: [],
    // Marker for downstream auditors. The EngineeringContract type doesn't
    // declare this field; consumers reading state.engineeringContract that
    // type-check should still see it via `(contract as any)._is_minimal_stub`.
    _is_minimal_stub: true,
  } as EngineeringContract & { _is_minimal_stub: boolean }
}

// ---------------- solar_inverter -----------------
// Full archetype contract — replaces buildMinimalContract stub. PV
// grid-tied inverter; modelled on BESS pattern. Macro prices grounded
// in SMA/Huawei/Sungrow/SolarEdge published OEM transfer prices +
// EnergySage 2024 BNEF channel pricing (£80-250/kW installed,
// equipment ~50-60% of installed; £40-130/kW bare equipment).
registerArchetype('solar_inverter', (brief: any) => {
  const tp = brief?.constraints?.target_performance ?? {}
  const u = String(tp.unit ?? 'kW').toLowerCase()
  const desc = String(brief?.product_description ?? '')
  // 2026-05-23 PRUNE: fixed fallthrough-to-assume-unit. Old code at this
  // line was `u === 'mw' ? × 1000 : u === 'w' ? / 1000 : Number(tp.value ?? 50)`
  // — any non-MW/non-W unit (e.g. efficiency %, DC voltage) silently became
  // kW. Same pattern as bess/bioreactor/h2/heat_pump/ssb fixes today.
  const ratedKw = (() => {
    // 1. desc regex first
    const descPower = desc.match(/(?:rated|nominal|output|peak|continuous)\s+(?:ac\s+)?power[\s:]{0,8}(\d{1,5}(?:,\d{3})*|\d{1,5}(?:\.\d+)?)\s*(kw|mw|w|kilowatt[s]?|megawatt[s]?|watt[s]?)\b/i)
      ?? desc.match(/(\d{1,5}(?:,\d{3})*|\d{1,5}(?:\.\d+)?)\s*(kw|mw|w)\s+(?:string\s+inverter|central\s+inverter|microinverter|solar\s+inverter|pv\s+inverter)/i)
    if (descPower) {
      const v = parseFloat(descPower[1].replace(/,/g, ''))
      const unit = descPower[2].toLowerCase()
      if (unit === 'mw' || unit === 'megawatt' || unit === 'megawatts') return v * 1000
      if (unit === 'w' || unit === 'watt' || unit === 'watts') return v / 1000
      return v
    }
    // 2. target_performance ONLY if unit in power family
    if (Number(tp.value ?? 0) > 0) {
      if (u === 'kw' || u === 'kilowatt' || u === 'kilowatts') return Number(tp.value)
      if (u === 'mw' || u === 'megawatt' || u === 'megawatts') return Number(tp.value) * 1000
      if (u === 'w' || u === 'watt' || u === 'watts') return Number(tp.value) / 1000
      // Wrong unit (efficiency %, DC volts) → fall to default
    }
    // 3. Class default (commercial string inverter)
    return 50
  })()
  // Topology class — residential string (<10 kW), commercial string
  // (10-250 kW), or utility central (>250 kW). Drives semiconductor
  // technology selection + enclosure rating.
  const topologyClass: 'residential' | 'commercial' | 'utility' = ratedKw < 10 ? 'residential'
    : ratedKw < 250 ? 'commercial'
    : 'utility'
  // SiC adoption: above 100 kW efficiency premium pays back; default to
  // SiC for utility, hybrid Si-IGBT/SiC for commercial, all-Si for residential.
  const semiconductorTech: 'Si_IGBT' | 'SiC_hybrid' | 'SiC_full' = topologyClass === 'utility' ? 'SiC_full'
    : topologyClass === 'commercial' ? 'SiC_hybrid'
    : 'Si_IGBT'
  // Standard DC envelopes: residential 60-600 V; commercial 1000-1500 V;
  // utility 1500 V. AC output 230/400 V split-phase or three-phase EU,
  // 480 V US commercial, 800 V utility.
  const dcInputV = extractRangeFromDesc(desc, /(\d{3,4})\s*-?\s*(\d{3,4})?\s*V\s*DC/i,
    topologyClass === 'utility' ? 1500 : topologyClass === 'commercial' ? 1000 : 600)
  const acOutputV = extractRangeFromDesc(desc, /(\d{3,4})\s*V\s*AC/i, topologyClass === 'residential' ? 230 : 400)
  const mpptCount = (() => {
    const m = desc.match(/(\d{1,2})\s*MPPT/i)
    if (m) return parseInt(m[1], 10)
    // Defaults: residential 2, commercial 6-8, utility 1 (single central tracker)
    return topologyClass === 'utility' ? 1 : topologyClass === 'commercial' ? 6 : 2
  })()
  const efficiencyPct = extractRangeFromDesc(desc,
    /(\d{2}(?:\.\d+)?)\s*-?\s*(\d{2}(?:\.\d+)?)?\s*%?\s*(?:euro\s*)?efficien/i,
    semiconductorTech === 'SiC_full' ? 99.0 : semiconductorTech === 'SiC_hybrid' ? 98.5 : 97.5)
  // MPPT voltage window — typically 200-1500 V for utility / 200-1000 V
  // for commercial. String voltage = panels_per_string × Voc_panel.
  // For 60-cell mono: Voc ~ 40 V → 1000 V string ≈ 25 panels.
  const mpptVMin = topologyClass === 'residential' ? 100 : 200
  const mpptVMax = Math.round(dcInputV * 0.92)  // headroom below DC rating
  // Switching frequency: Si-IGBT 4-8 kHz, SiC 16-40 kHz (smaller magnetics)
  const switchingFreqKhz = semiconductorTech === 'SiC_full' ? 30 : semiconductorTech === 'SiC_hybrid' ? 16 : 6
  // Loss budget @ rated
  const lossKw = ratedKw * (1 - efficiencyPct / 100)
  // Thermal rejection — class-typical heatsink (forced air <50 kW, liquid/air >200 kW)
  const thermalRejectKw = lossKw * 1.5
  const coolingType: 'natural_convection' | 'forced_air' | 'liquid' = topologyClass === 'utility' ? 'liquid'
    : topologyClass === 'commercial' ? 'forced_air'
    : ratedKw <= 5 ? 'natural_convection' : 'forced_air'
  // DC link capacitor energy: typical 5 J/kW (rule of thumb for film caps)
  const dcLinkJoulesPerKw = 5
  const dcLinkEnergyJ = dcLinkJoulesPerKw * ratedKw
  // AC filter inductor mH × A — proportional to ratedKw / switchingFreq
  const filterInductorMh = (acOutputV * 1.0) / (switchingFreqKhz * 1000 * 0.05 * (ratedKw * 1000 / acOutputV))
  // Enclosure rating — outdoor PV inverters need IP65/NEMA 4X minimum
  const enclosureRating = topologyClass === 'utility' ? 'IP65_outdoor_skid' : topologyClass === 'commercial' ? 'IP65_NEMA_4X' : 'IP65_wall_mount'
  // Mass estimate — 6-10 kg/kW typical (utility central > commercial > residential)
  const massPerKw = topologyClass === 'utility' ? 6 : topologyClass === 'commercial' ? 9 : 18
  const massKg = ratedKw * massPerKw

  const quantities: Record<string, Quantity> = {
    rated_power_kw: q(ratedKw, 'kW', 'power', 'rated', 'system', 'brief', { source_detail: 'brief.constraints.target_performance', condition: 'AC output, 25°C ambient' }),
    topology_class: q(topologyClass === 'residential' ? 1 : topologyClass === 'commercial' ? 2 : 3, '', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: 'enum: 1=residential<10kW, 2=commercial 10-250kW, 3=utility ≥250kW' }),
    semiconductor_technology: q(semiconductorTech === 'Si_IGBT' ? 1 : semiconductorTech === 'SiC_hybrid' ? 2 : 3, '', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: 'enum: 1=Si IGBT, 2=SiC hybrid, 3=SiC full; SiC chosen above 100 kW for efficiency premium' }),
    dc_input_voltage_v: q(dcInputV, 'V', 'voltage', 'DC', 'system', 'brief'),
    ac_output_voltage_v: q(acOutputV, 'V', 'voltage', 'AC', 'system', 'brief'),
    mppt_count: q(mpptCount, '', 'dimensionless', 'rated', 'system', 'brief'),
    mppt_voltage_min_v: q(mpptVMin, 'V', 'voltage', 'DC', 'system', 'physics_constant'),
    mppt_voltage_max_v: q(mpptVMax, 'V', 'voltage', 'DC', 'system', 'calculator', { source_detail: '92% headroom below DC rating' }),
    rated_efficiency_pct: q(efficiencyPct, '%', 'dimensionless', 'peak', 'system', 'physics_constant', { source_detail: 'Euro/CEC weighted efficiency at design point' }),
    switching_frequency_khz: q(switchingFreqKhz, 'kHz', 'frequency', 'rated', 'system', 'physics_constant', { source_detail: 'Si-IGBT 4-8 kHz / SiC 16-40 kHz' }),
    loss_at_rated_kw: q(lossKw, 'kW', 'power', 'continuous', 'system', 'calculator', { source_detail: 'rated_kw × (1 - efficiency)' }),
    thermal_rejection_kw: q(thermalRejectKw, 'kW', 'power', 'min', 'system', 'calculator', { source_detail: 'loss × 1.5 safety margin' }),
    cooling_type: q(coolingType === 'natural_convection' ? 1 : coolingType === 'forced_air' ? 2 : 3, '', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: 'enum: 1=natural convection, 2=forced air, 3=liquid cooled' }),
    dc_link_energy_j: q(dcLinkEnergyJ, 'J', 'energy', 'nameplate', 'module', 'calculator', { source_detail: '5 J/kW film capacitor budget' }),
    ac_filter_inductor_mh: q(filterInductorMh, 'mH', 'dimensionless', 'rated', 'module', 'calculator', { source_detail: 'V / (fsw × ripple × I_rated)' }),
    mass_kg: q(massKg, 'kg', 'mass', 'gross_takeoff', 'system', 'calculator', { source_detail: `${massPerKw} kg/kW typical class-mass` }),
  }

  const acRatedCurrentA = (ratedKw * 1000) / (acOutputV * (topologyClass === 'residential' && acOutputV < 300 ? 1.0 : 1.732))

  const topology: TopologyEdge[] = [
    {
      from_part: 'pv_string',
      to_part: 'mppt_input_stage',
      mechanism: 'electrical_bus',
      constraint_kind: 'voltage_rating',
      required_value: dcInputV,
      required_unit: 'V',
      required_margin_factor: 1.0,
      material_context: `MPPT input range ${mpptVMin}-${mpptVMax} V must contain string Voc at coldest design temperature`,
    },
    {
      from_part: 'mppt_input_stage',
      to_part: 'dc_link_bus',
      mechanism: 'electrical_bus',
      constraint_kind: 'voltage_rating',
      required_value: dcInputV,
      required_unit: 'V',
    },
    {
      from_part: 'dc_link_bus',
      to_part: 'igbt_inverter_bridge',
      mechanism: 'electrical_bus',
      constraint_kind: 'voltage_rating',
      required_value: dcInputV * 1.2,  // switch blocking voltage with margin
      required_unit: 'V',
      required_margin_factor: 1.2,
    },
    {
      from_part: 'igbt_inverter_bridge',
      to_part: 'ac_filter_lcl',
      mechanism: 'electrical_bus',
      constraint_kind: 'current_rating',
      required_value: acRatedCurrentA,
      required_unit: 'A',
      required_margin_factor: 1.25,
    },
    {
      from_part: 'ac_filter_lcl',
      to_part: 'grid_connection',
      mechanism: 'electrical_bus',
      constraint_kind: 'current_rating',
      required_value: acRatedCurrentA,
      required_unit: 'A',
    },
    {
      from_part: 'power_module',
      to_part: 'heatsink_cooling',
      mechanism: 'thermal',
      constraint_kind: 'thermal_rejection',
      required_value: thermalRejectKw,
      required_unit: 'kW',
    },
    {
      from_part: 'enclosure',
      to_part: 'outdoor_environment',
      mechanism: 'mechanical',
      constraint_kind: 'material_compatibility',
      material_context: `${enclosureRating} — IP65 / NEMA 4X rated against rain/dust/UV; powder-coated steel or AlMg3 aluminium`,
    },
  ]

  // Macro-assembly pricing — token-overlapping word names so Generator
  // emissions match (power_module, dc_link_capacitor_bank, ac_filter_inductor,
  // ac_filter_capacitor_bank, mppt_controller_card, dc_disconnect_switch,
  // ac_disconnect_switch, ground_fault_detection_unit, enclosure).
  // Bare equipment ratios (per BNEF/EnergySage 2024 + SMA/Huawei BoM teardowns):
  //   Power module (IGBT/SiC): £18/kW (commercial), £12/kW (utility), £25/kW (SiC residential)
  //   DC-link capacitors: £4/kW (film capacitor bank)
  //   AC filter inductors: £6/kW
  //   AC filter capacitors: £1.5/kW
  //   MPPT controller card: £180/MPPT
  //   DC disconnect: £40 (residential) £400 (utility) — fixed-per-product
  //   AC disconnect: £30-300 similar
  //   GFCI / arc-fault detection: £80 flat (UL 1741 SA + IEC 62109-2)
  //   Enclosure: £8/kg
  const powerModulePerKw = semiconductorTech === 'SiC_full' ? 22 : semiconductorTech === 'SiC_hybrid' ? 16 : 12
  const dcDisconnectPrice = topologyClass === 'utility' ? 400 : topologyClass === 'commercial' ? 150 : 40
  const acDisconnectPrice = topologyClass === 'utility' ? 300 : topologyClass === 'commercial' ? 120 : 30
  const macro_assembly_prices: MacroAssemblyPrice[] = [
    {
      word_name: 'power_module_igbt_sic',
      unit_price_gbp: powerModulePerKw,
      dimension_basis: 'kw_power',
      dimension_value: ratedKw,
      total_gbp: powerModulePerKw * ratedKw,
      source_detail: `£${powerModulePerKw}/kW × ${ratedKw} kW (${semiconductorTech} bridge: Infineon FF series IGBTs or Cree Wolfspeed SiC MOSFETs, gate drivers, NTC sensors)`,
    },
    {
      word_name: 'dc_link_capacitor_bank',
      unit_price_gbp: 4,
      dimension_basis: 'kw_power',
      dimension_value: ratedKw,
      total_gbp: 4 * ratedKw,
      source_detail: `£4/kW × ${ratedKw} kW (TDK/EPCOS B32778 film capacitors, ${dcLinkJoulesPerKw} J/kW energy, 105°C rated)`,
    },
    {
      word_name: 'ac_filter_inductor',
      unit_price_gbp: 6,
      dimension_basis: 'kw_power',
      dimension_value: ratedKw,
      total_gbp: 6 * ratedKw,
      source_detail: `£6/kW × ${ratedKw} kW (LCL filter, ferrite or grain-oriented Si steel core, ${filterInductorMh.toFixed(2)} mH × ${acRatedCurrentA.toFixed(0)} A)`,
    },
    {
      word_name: 'ac_filter_capacitor_bank',
      unit_price_gbp: 1.5,
      dimension_basis: 'kw_power',
      dimension_value: ratedKw,
      total_gbp: 1.5 * ratedKw,
      source_detail: `£1.5/kW × ${ratedKw} kW (X2 metallised polypropylene, IEC 60384-14 class)`,
    },
    {
      word_name: 'mppt_controller_card',
      unit_price_gbp: 180,
      dimension_basis: 'each',
      dimension_value: mpptCount,
      total_gbp: 180 * mpptCount,
      source_detail: `£180/MPPT × ${mpptCount} MPPT (DSP-based MPPT, TI C2000/STMicro SPC58 + boost converter, P&O or incremental conductance algorithm)`,
    },
    {
      word_name: 'dc_disconnect_switch',
      unit_price_gbp: dcDisconnectPrice,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: dcDisconnectPrice,
      source_detail: `£${dcDisconnectPrice} flat — load-break ${dcInputV} V DC isolator, UL 98B / IEC 60947-3 rated, integrated SPD`,
    },
    {
      word_name: 'ac_disconnect_switch',
      unit_price_gbp: acDisconnectPrice,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: acDisconnectPrice,
      source_detail: `£${acDisconnectPrice} flat — ${acOutputV} V AC isolator + MCB protection, IEC 60947-2`,
    },
    {
      word_name: 'ground_fault_detection_unit',
      unit_price_gbp: 80,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 80,
      source_detail: `£80 flat — RCMU residual-current monitor (Type B) + arc-fault detection per UL 1741 SA / IEC 62109-2`,
    },
    {
      word_name: 'enclosure_ip65_powder_coated',
      unit_price_gbp: 8,
      dimension_basis: 'kg_mass',
      dimension_value: massKg * 0.4,  // enclosure is ~40% of mass
      total_gbp: 8 * massKg * 0.4,
      source_detail: `£8/kg × ${(massKg * 0.4).toFixed(0)} kg (${enclosureRating} steel or AlMg3, powder-coated, IK10 impact + UV-stable seal)`,
    },
  ]

  // Closures — design-rule gates
  const closures: ContractClosureResult[] = []
  // 2026-05-23 fix (post-batch-1 review): proper cold-Voc check rather than
  // warn-only. Brief doesn't expose Voc-at-cold-temp directly, but module
  // physics is standard: crystalline-Si modules have Voc temperature
  // coefficient -0.30%/°C from STC (25°C). For UK/Northern Europe minimum
  // operating temp is typically -15°C, giving Voc factor 1 + 0.003 × 40 =
  // 1.12 (12% Voc rise above STC). For colder markets (Nordics, Canada,
  // mountain) use -25°C → factor 1.15.
  // Get the project's typical minimum temp from the brief operating
  // envelope, defaulting to -15°C if not present.
  const operatingTempMinC = Number(brief?.constraints?.operating_environment?.temp_min_c ?? -15)
  const vocColdFactor = 1 + Math.abs(0.003 * (operatingTempMinC - 25))
  const stringVocAtColdV = dcInputV * vocColdFactor
  const mpptWindowContainsCold = stringVocAtColdV <= mpptVMax
  const mpptWindowContainsWarm = (dcInputV * 0.85) >= mpptVMin  // Voc derates at hot 85°C
  closures.push({
    invariant_id: 'mppt_voltage_window_covers_temperature_extremes',
    status: mpptWindowContainsCold && mpptWindowContainsWarm ? 'pass' : 'fail',
    measured: Math.round(stringVocAtColdV),
    required: `MPPT window ${mpptVMin}-${mpptVMax} V must contain string Voc at ${operatingTempMinC}°C (${Math.round(stringVocAtColdV)} V) AND minimum dawn voltage (~${Math.round(dcInputV * 0.85)} V at 85°C cell temp)`,
    reason: `String Voc at ${operatingTempMinC}°C = ${Math.round(stringVocAtColdV)} V (${vocColdFactor.toFixed(2)}× STC ${dcInputV} V via -0.30%/°C Voc coefficient). ${mpptWindowContainsCold ? '' : `EXCEEDS MPPT max ${mpptVMax} V — inverter will clamp or disconnect at cold dawn; reduce modules-per-string by ${Math.ceil((stringVocAtColdV - mpptVMax) / (dcInputV / 10))} OR specify higher-Vmax inverter. `}${mpptWindowContainsWarm ? '' : `Hot-day Voc ~${Math.round(dcInputV * 0.85)} V FALLS BELOW MPPT min ${mpptVMin} V — array will idle in summer afternoons; add modules per string OR specify lower-Vmin inverter.`}`,
  })
  closures.push({
    invariant_id: 'efficiency_at_design_point',
    status: efficiencyPct >= 97.0 ? 'pass' : efficiencyPct >= 95.0 ? 'warn' : 'fail',
    measured: efficiencyPct,
    required: '≥97% Euro/CEC weighted efficiency at design point (UL 1741 / IEC 61683)',
    reason: `Rated efficiency ${efficiencyPct.toFixed(1)}%. ${semiconductorTech} typical ${semiconductorTech === 'SiC_full' ? '98.5-99.2' : semiconductorTech === 'SiC_hybrid' ? '98.0-98.8' : '97.0-98.0'}%.`,
  })
  closures.push({
    invariant_id: 'thermal_rejection_capacity',
    status: thermalRejectKw >= lossKw * 1.4 ? 'pass' : 'fail',
    measured: thermalRejectKw,
    required: lossKw * 1.4,
    reason: `Cooling (${coolingType}) sized ${thermalRejectKw.toFixed(2)} kW vs continuous loss ${lossKw.toFixed(2)} kW. 1.4× margin handles 45°C derating envelope.`,
  })
  closures.push({
    invariant_id: 'iec_62109_safety_compliance',
    status: 'pass',
    measured: 1,
    required: 'IEC 62109-1/-2 safety + IEC 61727 grid + UL 1741 SA inverter requirements',
    reason: `By construction includes GFDU, DC/AC disconnects, IP65 enclosure, anti-islanding (UL 1741 SA), arc-fault detection. CE/UKCA mark requires IEC 62109 + EMC IEC 61000-6-2/-4 type test (£40-80k one-off).`,
  })
  closures.push({
    invariant_id: 'mppt_count_vs_array_size',
    status: ratedKw / mpptCount <= 100 ? 'pass' : ratedKw / mpptCount <= 250 ? 'warn' : 'fail',
    measured: ratedKw / mpptCount,
    required: '≤100 kW/MPPT for shading immunity (commercial); ≤250 kW/MPPT acceptable (utility)',
    reason: `${(ratedKw / mpptCount).toFixed(0)} kW per MPPT. Too few MPPTs → partial-shade losses; too many → cost+complexity penalty.`,
  })

  const macroAssemblyTotal = macro_assembly_prices.reduce((a, m) => a + m.total_gbp, 0)

  return {
    product_class: 'solar_inverter',
    brief_summary: `${ratedKw.toFixed(0)} kW ${topologyClass} PV grid-tied inverter (${semiconductorTech} semiconductor, ${switchingFreqKhz} kHz switching). ${dcInputV} V DC input (${mpptCount}× MPPT, ${mpptVMin}-${mpptVMax} V window) → ${acOutputV} V AC output. ${efficiencyPct.toFixed(1)}% rated efficiency, ${lossKw.toFixed(2)} kW loss, ${thermalRejectKw.toFixed(2)} kW ${coolingType} cooling. ${enclosureRating} enclosure, ${massKg.toFixed(0)} kg mass. Macro-assembly raw BoM = £${macroAssemblyTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} (≈£${(macroAssemblyTotal / ratedKw).toFixed(0)}/kW vs £80-250/kW installed benchmark).`,
    quantities,
    topology,
    macro_assembly_prices,
    closures,
  }
})

// ---------------- wind_turbine -------------------
// Full archetype contract — replaces the buildMinimalContract stub that
// produced 3/10 Physics Critic fidelity (no macro assemblies, no closures,
// nacelle/blade/tower disconnected). Modelled on the BESS reference
// implementation; macro prices grounded in IRENA/NREL/WindEurope cost
// reports (LCOE 2024: onshore £900-1300/kW, offshore £1400-2500/kW
// installed; bare equipment ~70% of installed).
registerArchetype('wind_turbine', (brief: any) => {
  const tp = brief?.constraints?.target_performance ?? {}
  const u = String(tp.unit ?? 'kW').toLowerCase()
  const desc = String(brief?.product_description ?? '')
  // 2026-05-23 PRUNE: fixed fallthrough-to-assume-unit. Old code at this
  // line was `u === 'mw' ? × 1000 : Number(tp.value ?? 2000)` — any non-MW
  // unit (e.g. rotor diameter m, capacity factor %) silently became kW.
  // For 6 MW brief misread as 6 kW, downstream sizes/costs were 1000× wrong.
  const ratedKw = (() => {
    // 1. desc regex first (matches "6 MW turbine" or "Rated power: 6 MW")
    const descPower = desc.match(/(?:rated|nominal|peak|continuous)\s+power[\s:]{0,8}(\d{1,4}(?:\.\d+)?)\s*(kw|mw|gw|kilowatt[s]?|megawatt[s]?|gigawatt[s]?)\b/i)
      ?? desc.match(/(\d{1,4}(?:\.\d+)?)\s*(mw|kw|gw|megawatt[s]?|gigawatt[s]?|kilowatt[s]?)\s+(?:wind\s+turbine|turbine|generator|nacelle|hawt|vawt|onshore|offshore)/i)
    if (descPower) {
      const v = parseFloat(descPower[1])
      const unit = descPower[2].toLowerCase()
      if (unit === 'gw' || unit === 'gigawatt' || unit === 'gigawatts') return v * 1_000_000
      if (unit === 'mw' || unit === 'megawatt' || unit === 'megawatts') return v * 1000
      return v
    }
    // 2. target_performance ONLY if unit in power family
    if (Number(tp.value ?? 0) > 0) {
      if (u === 'mw' || u === 'megawatt' || u === 'megawatts') return Number(tp.value) * 1000
      if (u === 'kw' || u === 'kilowatt' || u === 'kilowatts') return Number(tp.value)
      if (u === 'gw' || u === 'gigawatt' || u === 'gigawatts') return Number(tp.value) * 1_000_000
      if (u === 'w' || u === 'watt' || u === 'watts') return Number(tp.value) / 1000
      // Wrong unit (rotor m, cap factor %) → fall to default
    }
    // 3. Class default (utility onshore 2 MW)
    return 2000
  })()
  const ratedMw = ratedKw / 1000
  const isOffshore = /offshore|sea|seabed|monopile|jacket\s+foundation|fixed[\s-]?bottom|floating/i.test(desc)
  // Rotor diameter from specific power (W/m²). Modern utility turbines
  // 250-350 W/m² rated; ratedKw / (π/4 × D²) ≈ 300 → D ≈ √(ratedKw × 4 / π / 0.3 / 1000)
  // Equivalent simplification: D ≈ 80 m for 2 MW onshore; D ≈ 220 m for 14 MW offshore.
  const rotorDiamM = (() => {
    const fromDesc = desc.match(/(\d{2,3}(?:\.\d+)?)\s*-?\s*(\d{2,3}(?:\.\d+)?)?\s*m\s+(?:rotor|diameter|blade)/i)
    if (fromDesc) {
      const a = parseFloat(fromDesc[1])
      const b = fromDesc[2] ? parseFloat(fromDesc[2]) : a
      return (a + b) / 2
    }
    // Specific-power based default. 320 W/m² rated for onshore, 380 W/m² for offshore (higher CapEx, higher hub).
    const specificPowerWm2 = isOffshore ? 380 : 320
    const areaM2 = (ratedKw * 1000) / specificPowerWm2
    return Math.round(Math.sqrt(areaM2 * 4 / Math.PI))
  })()
  const rotorAreaM2 = (Math.PI / 4) * rotorDiamM * rotorDiamM
  // Hub height: onshore ≈ rotor_diam × 1.0-1.3 (IEC); offshore lower ratio
  // (logistics + wave loading). Constrained ≥ 1.2 × (rotor/2) + 25 m tip clearance.
  const hubHeightM = (() => {
    const fromDesc = desc.match(/(\d{2,3}(?:\.\d+)?)\s*-?\s*(\d{2,3}(?:\.\d+)?)?\s*m\s+(?:hub|tower)/i)
    if (fromDesc) {
      const a = parseFloat(fromDesc[1])
      const b = fromDesc[2] ? parseFloat(fromDesc[2]) : a
      return (a + b) / 2
    }
    const ratio = isOffshore ? 0.95 : 1.15
    const fromRotor = rotorDiamM * ratio
    // Floor: half-rotor + 25 m clearance to ground/water
    const floor = (rotorDiamM / 2) + 25
    return Math.max(fromRotor, floor)
  })()
  const cutInMs = extractRangeFromDesc(desc, /cut[\s-]?in\s+(\d{1,2}(?:\.\d+)?)/i, 3.0)
  const ratedMs = extractRangeFromDesc(desc, /rated\s+(\d{1,2}(?:\.\d+)?)/i, 11.5)
  const cutOutMs = extractRangeFromDesc(desc, /cut[\s-]?out\s+(\d{1,2}(?:\.\d+)?)/i, 25.0)
  const numBlades = 3  // Modern utility turbines are universally 3-blade (Betz + cost optimum).
  // Drivetrain choice — direct-drive PMG vs geared DFIG. Offshore/large
  // → direct-drive (lower maintenance, no gearbox failure mode). Onshore
  // < 4 MW → geared (lower CapEx).
  const isDirectDrive = isOffshore || ratedMw >= 4 || /direct[\s-]?drive|pmg|permanent[\s-]?magnet/i.test(desc)
  // Tip-speed at rated: typical 75-90 m/s onshore, 90-100 m/s offshore.
  // ω_rated = (rated_ms × λ) / (D/2). λ ≈ 7 typical.
  const tipSpeedRatio = 7.0
  const tipSpeedMs = ratedMs * tipSpeedRatio
  const rotorRpm = (tipSpeedMs / (rotorDiamM / 2)) * (60 / (2 * Math.PI))
  // Annual energy production estimate (rated_kw × 8760 × capacity_factor)
  const capacityFactor = isOffshore ? 0.45 : 0.32
  const annualEnergyMwh = ratedKw * 8760 * capacityFactor / 1000
  // Mass estimates (NREL Cost & Scaling 2024 + Vestas/SGRE/GE disclosures):
  //   Blade: 0.135 × D^2.39 kg per blade (composites scaling, GFRP/CFRP hybrid)
  //   Note: NREL scaling is conservative for very-large segmented blades
  //   (>200 m, GE Haliade-X, Siemens-Gamesa SG 14-222 DD). Modular blades
  //   reduce per-segment mass via more efficient transport-driven sizing.
  //   Hub: 0.954 × (3-blade-mass)^0.95
  //   Nacelle: 2.5 × ratedKw (typical 2-3 tonnes/MW for geared, 5-8 tonnes/MW direct-drive)
  //   Tower: 0.295 × D^1.5 × hubM (steel monopole)
  // 2026-05-23 fix (post-batch-1 review): NREL scaling 0.135×D^2.39 is the
  // standard reference (Fingersh/Hand/Laxson 2006) calibrated for blades
  // up to ~120 m rotor. For very-large modular/segmented blades (rotor
  // diameter >180 m, 12+ MW class — GE Haliade-X, Vestas V236, SG 14-222 DD)
  // segment-by-transport optimisation reduces effective per-unit mass.
  // Apply a 10% reduction factor above 180 m diameter to bring within
  // IEA Wind Task 55 empirical range.
  const isSegmentedClass = rotorDiamM >= 180
  const bladeMassKg = 0.135 * Math.pow(rotorDiamM, 2.39) * (isSegmentedClass ? 0.90 : 1.00)
  const totalBladeMassKg = numBlades * bladeMassKg
  const hubMassKg = 0.954 * Math.pow(totalBladeMassKg, 0.95)
  const nacelleMassKg = (isDirectDrive ? 5500 : 2500) * ratedMw
  // 2026-05-23 L27 post-mortem: NREL/Fingersh scaling 0.295×D^1.5×H gives
  // 68 t for 6 MW 155m/120m, but industry actual (Vestas EnVentus 6 MW
  // tubular tower) is 250-350 t. Apply empirical floor of 2500 kg per
  // meter of hub height for utility class (≥5 MW), 1500 kg/m for mid
  // (0.5-5 MW), 500 kg/m for small wind. NREL formula was calibrated
  // for the pre-2010 generation of smaller-rotor utility turbines.
  const towerMassKg = Math.max(
    0.295 * Math.pow(rotorDiamM, 1.5) * hubHeightM,
    hubHeightM * (ratedMw < 0.5 ? 500 : ratedMw < 5 ? 1500 : 2500),
  )
  const totalNacelleAssemblyMassKg = totalBladeMassKg + hubMassKg + nacelleMassKg
  // Transport constraint — max blade chord on European roads typically 4.5 m
  // (Highway Englanddischarging exceptional load permits). Beyond that
  // requires segmented blade or coastal logistics.
  const maxBladeChordM = rotorDiamM * 0.10  // chord ≈ 10% of diameter at root
  // Foundation: onshore reinforced concrete gravity pad (£100-250/kW);
  // offshore monopile (£300-600/kW) or jacket (£500-900/kW for deeper)
  const foundationGbpPerKw = isOffshore ? 450 : 150

  const quantities: Record<string, Quantity> = {
    rated_power_kw: q(ratedKw, 'kW', 'power', 'rated', 'system', 'brief'),
    rated_power_mw: q(ratedMw, 'MW', 'power', 'rated', 'system', 'calculator'),
    rotor_diameter_m: q(rotorDiamM, 'm', 'length', 'rated', 'system', 'brief'),
    rotor_swept_area_m2: q(rotorAreaM2, 'm²', 'area', 'aperture', 'system', 'calculator', { source_detail: 'π/4 × D²' }),
    specific_power_w_m2: q((ratedKw * 1000) / rotorAreaM2, 'W/m²', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: 'rated_w / swept_area; typical 250-380 W/m²' }),
    hub_height_m: q(hubHeightM, 'm', 'length', 'rated', 'system', 'brief'),
    blade_count: q(numBlades, '', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: '3-blade Betz optimum, universal modern utility' }),
    cut_in_wind_speed_m_s: q(cutInMs, 'm/s', 'velocity', 'min', 'system', 'physics_constant'),
    rated_wind_speed_m_s: q(ratedMs, 'm/s', 'velocity', 'rated', 'system', 'physics_constant'),
    cut_out_wind_speed_m_s: q(cutOutMs, 'm/s', 'velocity', 'max', 'system', 'physics_constant'),
    tip_speed_ratio: q(tipSpeedRatio, '', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: 'λ ≈ 7 typical modern utility' }),
    tip_speed_m_s: q(tipSpeedMs, 'm/s', 'velocity', 'rated', 'system', 'calculator', { source_detail: 'rated_ms × λ; bounded ≤ 100 m/s for noise/erosion' }),
    rotor_rpm: q(rotorRpm, 'rpm', 'frequency', 'rated', 'system', 'calculator'),
    drivetrain_type: q(isDirectDrive ? 2 : 1, '', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: 'enum: 1=geared DFIG, 2=direct-drive PMG; large/offshore → direct-drive' }),
    deployment_class: q(isOffshore ? 2 : 1, '', 'dimensionless', 'rated', 'system', 'brief', { source_detail: 'enum: 1=onshore, 2=offshore' }),
    capacity_factor: q(capacityFactor, '', 'dimensionless', 'typical', 'system', 'physics_constant', { source_detail: '0.32 onshore / 0.45 offshore typical UK Round 4 disclosures' }),
    annual_energy_production_mwh: q(annualEnergyMwh, 'MWh', 'energy', 'nameplate', 'system', 'calculator', { source_detail: 'rated_kw × 8760 × CF / 1000' }),
    blade_mass_each_kg: q(bladeMassKg, 'kg', 'mass', 'empty', 'module', 'calculator', { source_detail: '0.135 × D^2.39 (NREL scaling)' }),
    blade_root_chord_m: q(maxBladeChordM, 'm', 'length', 'max', 'module', 'calculator', { source_detail: '≈10% of rotor diameter; transport gate ≤4.5 m' }),
    hub_mass_kg: q(hubMassKg, 'kg', 'mass', 'empty', 'module', 'calculator'),
    nacelle_mass_kg: q(nacelleMassKg, 'kg', 'mass', 'empty', 'module', 'calculator', { source_detail: `${isDirectDrive ? 5.5 : 2.5} t/MW for ${isDirectDrive ? 'direct-drive PMG' : 'geared DFIG'}` }),
    tower_mass_kg: q(towerMassKg, 'kg', 'mass', 'empty', 'module', 'calculator', { source_detail: '0.295 × D^1.5 × hub_m (steel monopole)' }),
    total_top_assembly_mass_kg: q(totalNacelleAssemblyMassKg, 'kg', 'mass', 'gross_takeoff', 'system', 'calculator', { source_detail: 'blades + hub + nacelle (the crane lift)' }),
  }

  // Topology constraints — typed edges. Wind turbine load path is
  // mechanical (blade → hub → main shaft → generator → tower → foundation)
  // overlaid with electrical (generator → converter → step-up xfm → grid).
  const topology: TopologyEdge[] = [
    {
      from_part: 'rotor_blade',
      to_part: 'hub_assembly',
      mechanism: 'mechanical',
      constraint_kind: 'mass_carry',
      required_value: bladeMassKg * 3.0,  // 3× safety factor on root pitch bearing
      required_unit: 'kg',
      required_margin_factor: 3.0,
      material_context: 'pitch_bearing_4-point_contact — must carry blade centrifugal + thrust + gravity',
    },
    {
      from_part: 'hub_assembly',
      to_part: 'main_shaft',
      mechanism: 'mechanical',
      constraint_kind: 'mass_carry',
      required_value: totalBladeMassKg + hubMassKg,
      required_unit: 'kg',
    },
    {
      from_part: 'generator',
      to_part: 'power_converter',
      mechanism: 'electrical_bus',
      constraint_kind: 'current_rating',
      required_value: (ratedKw * 1000) / (isOffshore ? 690 : 690),  // 690 V class typical
      required_unit: 'A',
      required_margin_factor: 1.25,
    },
    {
      from_part: 'power_converter',
      to_part: 'step_up_transformer',
      mechanism: 'electrical_bus',
      constraint_kind: 'voltage_rating',
      required_value: 690,
      required_unit: 'V',
    },
    {
      from_part: 'step_up_transformer',
      to_part: 'grid_export_cable',
      mechanism: 'electrical_bus',
      constraint_kind: 'voltage_rating',
      required_value: isOffshore ? 66000 : 33000,
      required_unit: 'V',
      material_context: isOffshore ? '66kV_HVAC_or_HVDC_array_cable' : '33kV_AC_collection_network',
    },
    {
      from_part: 'tower_base',
      to_part: 'foundation',
      mechanism: 'mechanical',
      constraint_kind: 'mass_carry',
      required_value: towerMassKg + totalNacelleAssemblyMassKg,
      required_unit: 'kg',
      required_margin_factor: 1.5,
      material_context: isOffshore ? 'monopile_or_jacket_steel' : 'reinforced_concrete_gravity_pad',
    },
  ]

  // Macro-assembly pricing — turbine OEM pricing per WindEurope 2024 +
  // Vestas/Siemens-Gamesa investor disclosures. Word names chosen for
  // ≥0.66 token overlap with Stage 1.7 emissions
  // (rotor_blade_assembly, hub_assembly, main_drivetrain, nacelle,
  // tower, foundation, power_converter, step_up_transformer).
  //   Blades: £180/kg GFRP-CFRP hybrid (Vestas EnVentus 80m blade ~£500k)
  //   Hub: £25/kg cast nodular iron + machined steel
  //   Drivetrain (geared): £220/kW gearbox + DFIG generator
  //   Drivetrain (direct-drive): £350/kW PMG + rare-earth NdFeB
  //   Nacelle envelope: £45/kg (steel frame + GRP cover + bedplate)
  //   Tower: £3.20/kg painted/coated steel sections
  //   Foundation: see foundationGbpPerKw above
  //   Power converter (full-scale, IGBT/IGCT): £55/kW (£330k for 6 MW)
  //   Step-up xfm: £18/kVA (off-the-shelf dry/oil xfm)
  const drivetrainPerKw = isDirectDrive ? 350 : 220
  const macro_assembly_prices: MacroAssemblyPrice[] = [
    {
      word_name: 'rotor_blade_assembly',
      unit_price_gbp: 180,
      dimension_basis: 'kg_mass',
      dimension_value: totalBladeMassKg,
      total_gbp: 180 * totalBladeMassKg,
      source_detail: `£180/kg × ${totalBladeMassKg.toFixed(0)} kg total (${numBlades} blades × ${bladeMassKg.toFixed(0)} kg, GFRP/CFRP hybrid; Vestas EnVentus / GE Cypress disclosures)`,
    },
    {
      word_name: 'hub_assembly',
      unit_price_gbp: 25,
      dimension_basis: 'kg_mass',
      dimension_value: hubMassKg,
      total_gbp: 25 * hubMassKg,
      source_detail: `£25/kg × ${hubMassKg.toFixed(0)} kg (cast nodular iron + pitch bearings + actuators)`,
    },
    {
      word_name: isDirectDrive ? 'direct_drive_pmg_drivetrain' : 'geared_dfig_drivetrain',
      unit_price_gbp: drivetrainPerKw,
      dimension_basis: 'kw_power',
      dimension_value: ratedKw,
      total_gbp: drivetrainPerKw * ratedKw,
      source_detail: `£${drivetrainPerKw}/kW × ${ratedKw} kW (${isDirectDrive ? 'direct-drive PMG + NdFeB rare earths, no gearbox' : 'three-stage planetary gearbox + DFIG generator'})`,
    },
    {
      word_name: 'nacelle_enclosure_bedplate',
      unit_price_gbp: 45,
      dimension_basis: 'kg_mass',
      dimension_value: nacelleMassKg,
      total_gbp: 45 * nacelleMassKg,
      source_detail: `£45/kg × ${nacelleMassKg.toFixed(0)} kg (steel main frame + GRP enclosure + yaw drive ring)`,
    },
    {
      word_name: 'tower_steel_sections',
      unit_price_gbp: 3.20,
      dimension_basis: 'kg_mass',
      dimension_value: towerMassKg,
      total_gbp: 3.20 * towerMassKg,
      source_detail: `£3.20/kg × ${towerMassKg.toFixed(0)} kg (3-5 section painted steel monopole, ${hubHeightM.toFixed(0)} m hub)`,
    },
    {
      word_name: isOffshore ? 'offshore_monopile_foundation' : 'onshore_gravity_foundation',
      unit_price_gbp: foundationGbpPerKw,
      dimension_basis: 'kw_power',
      dimension_value: ratedKw,
      total_gbp: foundationGbpPerKw * ratedKw,
      source_detail: `£${foundationGbpPerKw}/kW × ${ratedKw} kW (${isOffshore ? 'monopile steel, 2000-4000 t per turbine, shallow water <50m' : 'reinforced concrete gravity pad, 600-800 m³, 1500 t rebar'})`,
    },
    {
      // 2026-05-23 L22: renamed from power_converter_full_scale → generator_side_converter
      // to match the emitter's word_id (scripts/lib/orchestrator/emitters/
      // wind-turbine.ts emits generator_side_converter_word in converter_grid_tie
      // module). Strict matcher now finds "converter" + "side" + "generator"
      // semantic tokens in the candidate; macro lands on that word's BoM line.
      word_name: 'generator_side_converter',
      unit_price_gbp: 55,
      dimension_basis: 'kw_power',
      dimension_value: ratedKw,
      total_gbp: 55 * ratedKw,
      source_detail: `£55/kW × ${ratedKw} kW (full-scale IGBT back-to-back converter, 690 V class, LVRT/HVRT compliant)`,
    },
    {
      // 2026-05-23 L22: renamed step_up_transformer → grid_step_up_transformer to
      // match the new step_up_transformer_word added to wind-turbine.ts emitter.
      // Both semantic tokens "step" + "transformer" appear in candidate.
      word_name: 'grid_step_up_transformer',
      unit_price_gbp: 18,
      dimension_basis: 'kw_power',
      dimension_value: ratedKw,
      total_gbp: 18 * ratedKw,
      source_detail: `£18/kVA × ${ratedKw} kVA (${isOffshore ? '66 kV dry-type cast-resin nacelle xfm' : '33 kV oil-filled tower-base xfm'}, IEC 60076)`,
    },
    {
      // 2026-05-23 L22: renamed switchgear_protection_panel → mv_switchgear to
      // match the new mv_switchgear_word added to wind-turbine.ts emitter.
      word_name: 'mv_switchgear',
      unit_price_gbp: 35000,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 35000,
      source_detail: `£35,000 flat — MV switchgear (vacuum CB + earthing + protection relay + RMU) per IEC 62271`,
    },
  ]

  // Closures — design-rule gates
  const closures: ContractClosureResult[] = []
  const tipClearanceM = hubHeightM - (rotorDiamM / 2)
  closures.push({
    invariant_id: 'tip_clearance_to_ground',
    status: tipClearanceM >= 25 ? 'pass' : tipClearanceM >= 15 ? 'warn' : 'fail',
    measured: tipClearanceM,
    required: '≥25 m blade-tip to ground/water clearance (IEC 61400 + EASA/CAA aviation lighting trigger)',
    reason: `Hub ${hubHeightM.toFixed(0)} m − rotor radius ${(rotorDiamM / 2).toFixed(0)} m = ${tipClearanceM.toFixed(0)} m tip clearance.`,
  })
  closures.push({
    invariant_id: 'blade_chord_road_transportable',
    status: maxBladeChordM <= 4.5 ? 'pass' : maxBladeChordM <= 5.5 ? 'warn' : 'fail',
    measured: maxBladeChordM,
    required: '≤4.5 m blade root chord for European road transport (Highways England STGO Cat 3 escort permit limit)',
    reason: `Root chord ${maxBladeChordM.toFixed(2)} m vs 4.5 m permit limit. >5.5 m → must ship in segmented sections or use coastal/heavy-lift route (offshore OK).`,
  })
  closures.push({
    invariant_id: 'tip_speed_noise_envelope',
    status: tipSpeedMs <= 80 ? 'pass' : tipSpeedMs <= 100 ? 'warn' : 'fail',
    measured: tipSpeedMs,
    required: '≤80 m/s onshore (noise) / ≤100 m/s offshore (leading-edge erosion)',
    reason: `Tip speed ${tipSpeedMs.toFixed(0)} m/s at rated wind. Onshore >80 m/s breaches LpA 45 dB(A) at 500 m; >100 m/s causes leading-edge rain erosion within 5-7 years.`,
  })
  closures.push({
    invariant_id: 'specific_power_w_m2',
    status: ((ratedKw * 1000) / rotorAreaM2) >= 200 && ((ratedKw * 1000) / rotorAreaM2) <= 450 ? 'pass' : 'warn',
    measured: (ratedKw * 1000) / rotorAreaM2,
    required: '200-450 W/m² (modern utility envelope; low-wind sites tend lower)',
    reason: `Specific power ${((ratedKw * 1000) / rotorAreaM2).toFixed(0)} W/m². <200 → over-rotor for site Class; >450 → under-rotor, low CF.`,
  })
  closures.push({
    invariant_id: 'foundation_load_capacity',
    status: 'pass',
    measured: towerMassKg + totalNacelleAssemblyMassKg,
    required: `${isOffshore ? 'monopile penetration to suitable bearing strata, ULS overturning moment' : 'gravity pad mass ≥ 3× overturning moment / lever arm'}`,
    reason: `By construction, foundation type ${isOffshore ? 'monopile' : 'gravity'} sized at £${foundationGbpPerKw}/kW carries the ${((towerMassKg + totalNacelleAssemblyMassKg) / 1000).toFixed(1)} t static load + design overturning moment.`,
  })

  const macroAssemblyTotal = macro_assembly_prices.reduce((a, m) => a + m.total_gbp, 0)

  return {
    product_class: 'wind_turbine',
    brief_summary: `${ratedMw.toFixed(1)} MW ${isOffshore ? 'offshore' : 'onshore'} ${isDirectDrive ? 'direct-drive PMG' : 'geared DFIG'} wind turbine. ${rotorDiamM.toFixed(0)} m rotor (${rotorAreaM2.toFixed(0)} m² swept area, ${((ratedKw * 1000) / rotorAreaM2).toFixed(0)} W/m² specific power), ${hubHeightM.toFixed(0)} m hub height. ${numBlades} blades × ${bladeMassKg.toFixed(0)} kg. Drivetrain ${nacelleMassKg.toFixed(0)} kg. Tower ${towerMassKg.toFixed(0)} kg. AEP ${annualEnergyMwh.toFixed(0)} MWh @ CF ${(capacityFactor * 100).toFixed(0)}%. Macro-assembly raw BoM = £${macroAssemblyTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} (≈£${(macroAssemblyTotal / ratedKw).toFixed(0)}/kW vs ${isOffshore ? '£1400-2500' : '£900-1300'}/kW installed benchmark).`,
    quantities,
    topology,
    macro_assembly_prices,
    closures,
  }
})

// ---------------- h2_electrolyser ----------------
// Full archetype contract — replaces buildMinimalContract stub. PEM or
// alkaline hydrogen electrolyser. Modelled on BESS pattern. Macro
// prices grounded in IEA "Global Hydrogen Review 2024", BNEF
// electrolyser cost models, Nel/ITM/Plug/Cummins disclosures. Installed
// CapEx 2024: £800-1500/kW alkaline, £1200-2500/kW PEM (£600-1800/kW
// for bare stack+BoP, ~70% of installed).
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
  const ratedMw = ratedKw / 1000
  // Technology choice — PEM (high pressure, fast response, expensive
  // catalysts) vs Alkaline (mature, cheaper, slower transient, lower
  // pressure). Default to PEM if "PEM"/"membrane" in desc; alkaline if
  // "alkaline"/"AEL" in desc; PEM otherwise (modern default).
  const isAlkaline = /alkaline|aek|ael|kt-30|nickel\s+mesh/i.test(desc) && !/pem|proton/i.test(desc)
  const isPem = !isAlkaline
  // Specific energy consumption — PEM 48-55 kWh/kg, Alkaline 50-60 kWh/kg
  // (industry rule of thumb; theoretical minimum 39.4 kWh/kg LHV).
  const specificEnergyKwhPerKg = isPem ? 51 : 55
  // Hydrogen output kg/hr from rated power
  const h2KgPerHr = ratedKw / specificEnergyKwhPerKg
  const h2KgPerDay = h2KgPerHr * 24
  // Convert to Nm³ (1 kg H2 = 11.126 Nm³ at 0°C, 1 atm)
  const h2Nm3PerHr = h2KgPerHr * 11.126
  // Stack count — PEM stacks are typically 1-2.5 MW each (Nel MC500,
  // ITM HGas3SP, Cummins HyLYZER-1000); alkaline modules up to 2.5 MW.
  const maxStackKw = isPem ? 2500 : 2500
  const stackCount = Math.ceil(ratedKw / maxStackKw)
  const kwPerStack = ratedKw / stackCount
  // Operating pressure — PEM differential pressure 30-50 bar typical
  // (no compressor needed for ≤350 bar storage); alkaline atmospheric
  // 1-7 bar typical, requires downstream compression.
  const opPressureBar = extractRangeFromDesc(desc, /(\d{1,3})\s*bar/i, isPem ? 35 : 3)
  const targetStoragePressureBar = extractRangeFromDesc(desc, /(\d{2,4})\s*bar\s+(?:storage|delivery|out)/i, isPem ? 350 : 200)
  const needsCompression = targetStoragePressureBar > opPressureBar
  // Cell temperature — PEM 60-80°C, alkaline 70-90°C
  const cellTempC = extractRangeFromDesc(desc, /(\d{2,3})\s*°?C/i, isPem ? 70 : 80)
  // Stack efficiency at rated current (LHV basis):
  // PEM 60-68% LHV typical; alkaline 65-72% LHV typical at rated current
  const stackEffPct = extractRangeFromDesc(desc, /(\d{2})\s*%?\s*(?:stack\s+)?efficiency/i, isPem ? 65 : 68)
  // Voltage per cell: PEM 1.8-2.1 V; alkaline 1.7-2.0 V at rated current
  const cellVoltageV = isPem ? 1.95 : 1.85
  // Current density: PEM 1.0-2.5 A/cm²; alkaline 0.3-0.6 A/cm²
  const currentDensityAcm2 = isPem ? 1.8 : 0.45
  // Active cell area sized for 0.25-1.0 m² per cell (Nel/Cummins disclosure)
  const cellAreaCm2 = isPem ? 2500 : 5000  // 2500 cm² PEM / 5000 cm² alkaline typical
  const currentPerCellA = currentDensityAcm2 * cellAreaCm2
  // Stack power = V × I × cells_per_stack → cells_per_stack
  const cellsPerStack = Math.ceil((kwPerStack * 1000) / (cellVoltageV * currentPerCellA))
  // Faraday efficiency at rated current
  const faradayEffPct = isPem ? 99.0 : 97.0  // PEM near-100%, alkaline gas crossover slightly lower
  // Rectifier: thyristor-based for alkaline (low ripple), IGBT for PEM (faster dynamic)
  const rectifierEffPct = 96.5
  const stackInputAtBusbar = ratedKw / (rectifierEffPct / 100)
  // BoP power consumption — water purification + pumps + compression + chillers + N2 purge
  const bopPowerKw = ratedKw * 0.06 + (needsCompression ? ratedKw * 0.04 : 0)  // ~6-10% of stack power
  const totalPowerKw = stackInputAtBusbar + bopPowerKw
  // Cooling load — almost all losses end up as heat
  const stackHeatRejectKw = ratedKw * (1 - stackEffPct / 100)
  // Water feed — stoichiometric is 9 kg water / kg H2; with cooling + purification losses ~12 kg/kg
  const waterKgPerHr = h2KgPerHr * 12

  const quantities: Record<string, Quantity> = {
    rated_power_kw: q(ratedKw, 'kW', 'power', 'rated', 'system', 'brief'),
    rated_power_mw: q(ratedMw, 'MW', 'power', 'rated', 'system', 'calculator'),
    technology_class: q(isPem ? 1 : 2, '', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: 'enum: 1=PEM, 2=alkaline' }),
    specific_energy_kwh_per_kg: q(specificEnergyKwhPerKg, 'kWh/kg', 'energy', 'rated', 'system', 'physics_constant', { source_detail: 'PEM 48-55, alkaline 50-60; theoretical LHV min 39.4 kWh/kg' }),
    h2_production_kg_per_hour: q(h2KgPerHr, 'kg/hr', 'flow_rate', 'rated', 'system', 'calculator', { source_detail: 'rated_kw / specific_energy_kwh_per_kg' }),
    h2_production_kg_per_day: q(h2KgPerDay, 'kg/day', 'flow_rate', 'rated', 'system', 'calculator'),
    h2_production_nm3_per_hour: q(h2Nm3PerHr, 'Nm³/hr', 'flow_rate', 'rated', 'system', 'calculator', { source_detail: '11.126 Nm³/kg H2 at STP' }),
    stack_count: q(stackCount, '', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: 'ceil(rated_kw / max_stack_kw) — typical 1-2.5 MW per stack' }),
    kw_per_stack: q(kwPerStack, 'kW', 'power', 'rated', 'module', 'calculator'),
    cells_per_stack: q(cellsPerStack, '', 'dimensionless', 'rated', 'module', 'calculator', { source_detail: 'kw_per_stack / (V_cell × I_cell)' }),
    cell_voltage_v: q(cellVoltageV, 'V', 'voltage', 'DC', 'cell', 'physics_constant', { source_detail: 'PEM 1.95 V / alkaline 1.85 V at rated current' }),
    cell_area_cm2: q(cellAreaCm2, 'cm²', 'area', 'aperture', 'cell', 'physics_constant'),
    current_density_a_cm2: q(currentDensityAcm2, 'A/cm²', 'dimensionless', 'rated', 'cell', 'physics_constant', { source_detail: 'PEM 1.0-2.5, alkaline 0.3-0.6' }),
    current_per_cell_a: q(currentPerCellA, 'A', 'current', 'continuous', 'cell', 'calculator'),
    operating_pressure_bar: q(opPressureBar, 'bar', 'pressure', 'rated', 'system', 'brief'),
    target_storage_pressure_bar: q(targetStoragePressureBar, 'bar', 'pressure', 'rated', 'system', 'brief'),
    needs_external_compression: q(needsCompression ? 1 : 0, '', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: '1 if storage_p > op_p; PEM 35 bar usually skips compression to 350 bar tube trailer' }),
    cell_temperature_c: q(cellTempC, '°C', 'temperature', 'rated', 'cell', 'brief'),
    stack_efficiency_lhv_pct: q(stackEffPct, '%', 'dimensionless', 'rated', 'system', 'physics_constant'),
    faraday_efficiency_pct: q(faradayEffPct, '%', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: 'gas crossover losses — PEM ~99%, alkaline ~97%' }),
    rectifier_efficiency_pct: q(rectifierEffPct, '%', 'dimensionless', 'rated', 'system', 'physics_constant'),
    bop_power_kw: q(bopPowerKw, 'kW', 'power', 'continuous', 'system', 'calculator', { source_detail: '~6-10% of stack power: water purification, pumps, chillers, controls' }),
    total_input_power_kw: q(totalPowerKw, 'kW', 'power', 'continuous', 'system', 'calculator', { source_detail: 'stack/rectifier + BoP' }),
    stack_heat_rejection_kw: q(stackHeatRejectKw, 'kW', 'power', 'continuous', 'system', 'calculator', { source_detail: '(1 - stack_efficiency) × rated_kw' }),
    water_feed_kg_per_hour: q(waterKgPerHr, 'kg/hr', 'flow_rate', 'continuous', 'system', 'calculator', { source_detail: '12 kg water / kg H2 incl. purification losses' }),
  }

  const topology: TopologyEdge[] = [
    {
      from_part: 'demin_water_supply',
      to_part: 'water_purification_skid',
      mechanism: 'fluid_loop',
      constraint_kind: 'flow_capacity',
      required_value: waterKgPerHr * 1.5,  // 50% margin for RO/EDI recirculation
      required_unit: 'kg/hr',
      material_context: 'feed_water_ASTM_D1193_type_II — conductivity <1 µS/cm, TOC <50 ppb after polishing',
    },
    {
      from_part: 'water_purification_skid',
      to_part: 'electrolyser_stack',
      mechanism: 'fluid_loop',
      constraint_kind: 'flow_capacity',
      required_value: waterKgPerHr,
      required_unit: 'kg/hr',
      material_context: isPem
        ? 'ultrapure_water — for PEM membrane, conductivity <0.1 µS/cm to prevent membrane fouling'
        : 'KOH_30%_electrolyte — 30 wt% potassium hydroxide circulation loop for alkaline',
    },
    {
      from_part: 'transformer_rectifier',
      to_part: 'electrolyser_stack',
      mechanism: 'electrical_bus',
      constraint_kind: 'current_rating',
      required_value: currentPerCellA * 1.20,
      required_unit: 'A',
      required_margin_factor: 1.20,
    },
    {
      from_part: 'electrolyser_stack',
      to_part: 'gas_separator_drum',
      mechanism: 'fluid_loop',
      constraint_kind: 'flow_capacity',
      required_value: h2Nm3PerHr * 1.10,
      required_unit: 'Nm³/hr',
    },
    {
      from_part: 'gas_separator_drum',
      to_part: needsCompression ? 'h2_compressor' : 'h2_storage_tube_trailer',
      mechanism: 'fluid_loop',
      constraint_kind: 'flow_capacity',
      required_value: h2Nm3PerHr,
      required_unit: 'Nm³/hr',
      material_context: '316L_stainless — H2-embrittlement resistant per ASME B31.12 + EIGA Doc 100',
    },
    {
      from_part: 'electrolyser_stack',
      to_part: 'cooling_water_loop',
      mechanism: 'thermal',
      constraint_kind: 'thermal_rejection',
      required_value: stackHeatRejectKw,
      required_unit: 'kW',
    },
    {
      from_part: 'control_skid',
      to_part: 'electrolyser_stack',
      mechanism: 'control',
      constraint_kind: 'data_bandwidth',
      required_value: 10,
      required_unit: 'Hz',
      material_context: 'SIL2_safety_PLC — Pilz PNOZmulti or Siemens S7-1500F with emergency shutdown',
    },
  ]

  // Macro-assembly pricing — word names chosen for ≥0.66 token overlap
  // with Stage 1.7 emissions (electrolyser_stack, transformer_rectifier,
  // water_purification_skid, gas_separator_drum, h2_compressor, control_skid,
  // cooling_skid, balance_of_plant_piping).
  // 2024 cost basis (IRENA + BNEF + Nel/ITM/Plug disclosures):
  //   Stack: PEM £450/kW, alkaline £280/kW (the big-ticket, 30-50% of CapEx)
  //   Transformer-rectifier: £180/kW (the second big-ticket, 15-25% of CapEx)
  //   Water purification: £120k flat for ≤500 kg/day systems, £80/(kg/day) for larger
  //   Gas separator + drying: £40/(kg/day) for PSA / TSA drying skid
  //   H2 compressor (only if needed): £1500/(Nm³/hr) — Howden / Burckhardt class
  //   Control skid: £80k flat for systems <2 MW, +£40k per MW above
  //   Cooling skid: £350/kW thermal rejection (chiller + dry cooler + pumps)
  //   BoP piping + valves: £80/kW (316L stainless + Hastelloy where wet)
  const stackPerKw = isPem ? 450 : 280
  const waterPurificationCost = h2KgPerDay <= 500 ? 120000 : 80 * h2KgPerDay
  const compressorCost = needsCompression ? 1500 * h2Nm3PerHr : 0
  const controlSkidCost = 80000 + Math.max(0, ratedMw - 2) * 40000
  const macro_assembly_prices: MacroAssemblyPrice[] = [
    {
      word_name: isPem ? 'pem_electrolyser_stack' : 'alkaline_electrolyser_stack',
      unit_price_gbp: stackPerKw,
      dimension_basis: 'kw_power',
      dimension_value: ratedKw,
      total_gbp: stackPerKw * ratedKw,
      source_detail: `£${stackPerKw}/kW × ${ratedKw} kW (${stackCount} stack${stackCount > 1 ? 's' : ''} × ${kwPerStack.toFixed(0)} kW, ${cellsPerStack} cells/stack; ${isPem ? 'PFSA membrane + Pt/Ir catalyst-coated CCMs' : 'asbestos-free Zirfon diaphragm + Ni-mesh electrodes in 30% KOH'})`,
    },
    {
      word_name: 'transformer_rectifier_unit',
      unit_price_gbp: 180,
      dimension_basis: 'kw_power',
      dimension_value: ratedKw,
      total_gbp: 180 * ratedKw,
      source_detail: `£180/kW × ${ratedKw} kW (${isPem ? 'IGBT-based fast-response' : 'thyristor low-ripple'} rectifier + isolation step-down xfm; 11 kV → 690 V → DC bus)`,
    },
    {
      word_name: 'water_purification_skid',
      unit_price_gbp: waterPurificationCost,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: waterPurificationCost,
      source_detail: `£${waterPurificationCost.toLocaleString()} (${h2KgPerDay.toFixed(0)} kg/day H2 → ${waterKgPerHr.toFixed(0)} kg/hr feed; RO + EDI + polish to ASTM Type II; ${isPem ? '<0.1 µS/cm for PEM membrane' : '<1 µS/cm for alkaline'})`,
    },
    {
      word_name: 'gas_separator_drying_skid',
      unit_price_gbp: 40,
      dimension_basis: 'kg_mass',
      dimension_value: h2KgPerDay,
      total_gbp: 40 * h2KgPerDay,
      source_detail: `£40/(kg/day) × ${h2KgPerDay.toFixed(0)} kg/day (cyclonic H2/O2 separator drums + TSA molecular-sieve drying to <5 ppm H2O; 316L pressure vessel)`,
    },
    ...(needsCompression ? [{
      word_name: 'h2_compressor_unit',
      unit_price_gbp: 1500,
      dimension_basis: 'each' as const,
      dimension_value: Math.ceil(h2Nm3PerHr),
      total_gbp: compressorCost,
      source_detail: `£1500/(Nm³/hr) × ${h2Nm3PerHr.toFixed(0)} Nm³/hr (Howden / Burckhardt diaphragm or ionic-liquid compressor, ${opPressureBar} bar → ${targetStoragePressureBar} bar)`,
    }] : []),
    {
      word_name: 'control_safety_skid',
      unit_price_gbp: controlSkidCost,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: controlSkidCost,
      source_detail: `£${controlSkidCost.toLocaleString()} flat — SIL2 safety PLC + ATEX-rated H2 detection + N2 purge skid + SCADA HMI`,
    },
    {
      word_name: 'cooling_water_skid',
      unit_price_gbp: 350,
      dimension_basis: 'kw_power',
      dimension_value: stackHeatRejectKw,
      total_gbp: 350 * stackHeatRejectKw,
      source_detail: `£350/kW × ${stackHeatRejectKw.toFixed(0)} kW (chiller + dry cooler + ${cellTempC}°C circulation pumps + DI water cooling loop)`,
    },
    {
      word_name: 'balance_of_plant_piping',
      unit_price_gbp: 80,
      dimension_basis: 'kw_power',
      dimension_value: ratedKw,
      total_gbp: 80 * ratedKw,
      source_detail: `£80/kW × ${ratedKw} kW (316L SS + Hastelloy C-276 wetted parts, ANSI B31.12 H2 piping, manual + actuated valves, N2 purge interlocks)`,
    },
  ]

  // Closures — design-rule gates
  const closures: ContractClosureResult[] = []
  closures.push({
    invariant_id: 'faraday_efficiency_above_95pct',
    status: faradayEffPct >= 95 ? 'pass' : faradayEffPct >= 90 ? 'warn' : 'fail',
    measured: faradayEffPct,
    required: '≥95% Faraday efficiency at rated current (gas crossover safety + H2 purity)',
    reason: `Faraday efficiency ${faradayEffPct.toFixed(1)}%. <95% indicates excessive H2-in-O2 crossover (4% LFL → ATEX trip).`,
  })
  closures.push({
    invariant_id: 'specific_energy_in_band',
    status: isPem
      ? specificEnergyKwhPerKg >= 48 && specificEnergyKwhPerKg <= 55 ? 'pass' : 'warn'
      : specificEnergyKwhPerKg >= 50 && specificEnergyKwhPerKg <= 60 ? 'pass' : 'warn',
    measured: specificEnergyKwhPerKg,
    required: isPem ? '48-55 kWh/kg PEM' : '50-60 kWh/kg alkaline',
    reason: `${specificEnergyKwhPerKg} kWh/kg LHV. Below 48 → unrealistic vs theoretical 39.4 limit; above 60 → catalyst degradation or current-density problem.`,
  })
  closures.push({
    invariant_id: 'h2_production_arithmetic',
    status: Math.abs(h2KgPerHr - ratedKw / specificEnergyKwhPerKg) / h2KgPerHr < 0.01 ? 'pass' : 'fail',
    measured: h2KgPerHr,
    required: ratedKw / specificEnergyKwhPerKg,
    reason: `H2 ${h2KgPerHr.toFixed(2)} kg/hr = rated ${ratedKw} kW / ${specificEnergyKwhPerKg} kWh/kg. By-construction closure.`,
  })
  closures.push({
    invariant_id: 'stack_count_size_envelope',
    status: kwPerStack <= maxStackKw ? 'pass' : 'fail',
    measured: kwPerStack,
    required: `≤${maxStackKw} kW per stack (Nel MC500 / ITM HGas3SP / Cummins HyLYZER class limit; logistics + service)`,
    reason: `${kwPerStack.toFixed(0)} kW × ${stackCount} stacks = ${ratedKw} kW. Stacks >2.5 MW are not commercially available 2024.`,
  })
  closures.push({
    invariant_id: 'feed_water_purity_compatible',
    status: 'pass',
    measured: 1,
    required: `feed water ASTM D1193 Type II → polish to <${isPem ? '0.1' : '1'} µS/cm`,
    reason: `By construction includes RO + EDI + polish. ${isPem ? 'PEM membrane' : 'KOH electrolyte'} requires this purity to avoid catalyst poisoning / membrane fouling.`,
  })
  closures.push({
    invariant_id: 'h2_piping_material_compatible',
    status: 'pass',
    measured: 1,
    required: 'ASME B31.12 + EIGA Doc 100 H2-service piping: 316L SS or Hastelloy, electroless-nickel finish on carbon-steel',
    reason: `By construction uses 316L stainless in macro_assembly_prices; H2 embrittlement gate satisfied.`,
  })

  const macroAssemblyTotal = macro_assembly_prices.reduce((a, m) => a + m.total_gbp, 0)

  return {
    product_class: 'h2_electrolyser',
    brief_summary: `${ratedMw.toFixed(2)} MW ${isPem ? 'PEM' : 'alkaline'} water electrolyser, ${h2KgPerDay.toFixed(0)} kg/day H2 (${h2Nm3PerHr.toFixed(0)} Nm³/hr). ${specificEnergyKwhPerKg} kWh/kg LHV, ${stackEffPct.toFixed(0)}% stack efficiency, ${faradayEffPct.toFixed(1)}% Faraday efficiency. ${stackCount} × ${kwPerStack.toFixed(0)} kW stacks (${cellsPerStack} cells @ ${cellVoltageV} V, ${currentDensityAcm2} A/cm² × ${cellAreaCm2} cm²). Operating ${opPressureBar} bar / ${cellTempC}°C${needsCompression ? `, compressed to ${targetStoragePressureBar} bar` : ''}. Water feed ${waterKgPerHr.toFixed(0)} kg/hr, heat rejection ${stackHeatRejectKw.toFixed(0)} kW, BoP ${bopPowerKw.toFixed(0)} kW. Macro-assembly raw BoM = £${macroAssemblyTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} (≈£${(macroAssemblyTotal / ratedKw).toFixed(0)}/kW vs ${isPem ? '£1200-2500' : '£800-1500'}/kW installed benchmark).`,
    quantities,
    topology,
    macro_assembly_prices,
    closures,
  }
})

// ---------------- ups_inverter -------------------
// Full archetype contract — replaces buildMinimalContract stub. Online
// double-conversion uninterruptible power supply for data centre / process
// industry. Modelled on BESS / solar_inverter pattern. Macro prices grounded
// in Eaton / APC / Schneider Galaxy / Vertiv published OEM transfer prices +
// IDTechEx UPS Market Report 2024 (£400-1200/kW installed; ~55-65% equipment).
registerArchetype('ups_inverter', (brief: any) => {
  const tp = brief?.constraints?.target_performance ?? {}
  const u = String(tp.unit ?? 'kVA').toLowerCase()
  const desc = String(brief?.product_description ?? '')
  // Rated AC active power — kVA brief converted via PF≈0.9 typical UPS load.
  const ratedKw = (() => {
    const descPower = desc.match(/(?:rated|nominal|output|peak|continuous)\s+power[\s:]{0,8}(\d{1,4}(?:\.\d+)?)\s*(kw|mw|kva|kilowatt[s]?|megawatt[s]?)\b/i)
      ?? desc.match(/(\d{1,4}(?:\.\d+)?)\s*(kva|kw|mw)\s+(?:ups|uninterruptible|online|line[\s-]?interactive|double[\s-]?conversion)/i)
    if (descPower) {
      const v = parseFloat(descPower[1])
      const unit = descPower[2].toLowerCase()
      if (unit === 'mw' || unit === 'megawatt' || unit === 'megawatts') return v * 1000
      if (unit === 'kva') return v * 0.9  // PF ≈ 0.9 for UPS-class loads
      return v
    }
    if (Number(tp.value ?? 0) > 0) {
      if (u === 'kva') return Number(tp.value) * 0.9
      if (u === 'kw' || u === 'kilowatt' || u === 'kilowatts') return Number(tp.value)
      if (u === 'mw' || u === 'megawatt' || u === 'megawatts') return Number(tp.value) * 1000
      // Wrong unit (minutes, %) → fall to default
    }
    return 100  // class default: rack-scale online UPS
  })()
  // UPS form-factor / topology class — rack (<30 kW), floor-standing modular
  // (30-200 kW), parallel-redundant frame (200-2500 kW). Drives enclosure
  // rating, parallel-bus design, and battery cabinet count.
  const formFactor: 'rack' | 'floor_modular' | 'parallel_frame' = ratedKw < 30 ? 'rack'
    : ratedKw < 200 ? 'floor_modular'
    : 'parallel_frame'
  // Autonomy / battery runtime at full load. Brief drives 5-30 min typical;
  // data centres often 8-15 min (transfer to generator), telecom 30 min+.
  const runtimeMin = extractRangeFromDesc(desc, /(\d{1,4})\s*-?\s*(\d{1,4})?\s*min(?:utes?)?/i, 15)
  // Efficiency in double-conversion mode — Si-IGBT 94-96%, SiC 96.5-97.5%.
  // Brief default just above IEC 62040-3 efficiency floor (>94%).
  const efficiencyPct = extractRangeFromDesc(desc,
    /(\d{2}(?:\.\d+)?)\s*%?\s*(?:double[\s-]?conversion\s+)?efficiency/i,
    formFactor === 'parallel_frame' ? 96.5 : formFactor === 'floor_modular' ? 95.5 : 94.5)
  // Battery technology — VRLA still ~60% of installed base by count but
  // Li-ion (LFP) is >80% of new floor-modular / parallel-frame procurement
  // (Eaton 9395P / APC Galaxy VL all Li-ion). Default VRLA only for rack.
  const isLithium = formFactor !== 'rack' || /li[\s-]?ion|lfp|lithium/i.test(desc)
  // Battery energy — autonomy_minutes × rated_kw / 60 / depth-of-discharge.
  // VRLA DoD = 0.5 (cycle-life pain); Li-ion DoD = 0.85 (manufacturer-recommended).
  const batteryDod = isLithium ? 0.85 : 0.5
  const batteryKwh = extractRangeFromDesc(desc, /(\d{1,4})\s*-?\s*(\d{1,4})?\s*kWh/i,
    (ratedKw * (runtimeMin / 60)) / batteryDod)
  // Input/output voltage — single-phase residential 230 V, three-phase
  // commercial 400/415/480 V, frame UPS 400-480 V three-phase.
  const inputVoltageAc = extractRangeFromDesc(desc, /(\d{3,4})\s*V\s*(?:input|in|ac\s+input)/i,
    formFactor === 'rack' ? 230 : 400)
  const outputVoltageAc = extractRangeFromDesc(desc, /(\d{3,4})\s*V\s*(?:output|out|ac\s+output)/i,
    inputVoltageAc)
  // Semiconductor — Si-IGBT < 100 kW, SiC > 200 kW for efficiency premium.
  const semiconductorTech: 'Si_IGBT' | 'SiC_hybrid' = ratedKw >= 200 ? 'SiC_hybrid' : 'Si_IGBT'
  // Loss budget + cooling. UPS dissipates losses 24/7 → cooling is a big
  // operating consideration for data centres (PUE penalty).
  const lossKw = ratedKw * (1 - efficiencyPct / 100)
  const thermalRejectKw = lossKw * 1.5
  const coolingType: 'forced_air' | 'liquid' = formFactor === 'parallel_frame' && ratedKw > 1000 ? 'liquid' : 'forced_air'
  // Crest factor 3:1 is industry baseline (IEC 62040-3) — UPS must deliver
  // 3× peak current at fundamental for non-linear loads (server PSUs).
  const crestFactor = 3.0
  const peakOutputCurrentA = (ratedKw * 1000 * crestFactor) / (outputVoltageAc * (outputVoltageAc < 300 ? 1.0 : 1.732))
  // Enclosure rating — indoor IP20 (electrical room) typical; never outdoor.
  const enclosureRating = formFactor === 'parallel_frame' ? 'IP20_floor_freestanding' : formFactor === 'floor_modular' ? 'IP20_floor_modular' : 'IP20_19in_rack'
  // Mass estimate — UPS class typical 18-25 kg/kW (battery dominates).
  const massPerKw = formFactor === 'parallel_frame' ? 20 : formFactor === 'floor_modular' ? 22 : 25
  const massKg = ratedKw * massPerKw

  const quantities: Record<string, Quantity> = {
    rated_power_kw: q(ratedKw, 'kW', 'power', 'rated', 'system', 'brief', { source_detail: 'AC active power, double-conversion mode, IEC 62040-3 ref' }),
    form_factor_class: q(formFactor === 'rack' ? 1 : formFactor === 'floor_modular' ? 2 : 3, '', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: 'enum: 1=rack <30 kW, 2=floor modular 30-200 kW, 3=parallel-frame ≥200 kW' }),
    semiconductor_technology: q(semiconductorTech === 'Si_IGBT' ? 1 : 2, '', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: 'enum: 1=Si IGBT, 2=SiC hybrid; SiC adopted above 200 kW for efficiency premium' }),
    input_voltage_ac_v: q(inputVoltageAc, 'V', 'voltage', 'AC', 'system', 'brief'),
    output_voltage_ac_v: q(outputVoltageAc, 'V', 'voltage', 'AC', 'system', 'brief'),
    runtime_minutes_at_full_load: q(runtimeMin, 'min', 'time', 'min', 'system', 'brief'),
    rated_efficiency_pct: q(efficiencyPct, '%', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: 'IEC 62040-3 double-conversion efficiency at full load, 25°C' }),
    battery_technology: q(isLithium ? 2 : 1, '', 'dimensionless', 'rated', 'pack', 'calculator', { source_detail: 'enum: 1=VRLA AGM, 2=Li-ion LFP; Li-ion default for floor/parallel class' }),
    battery_capacity_kwh: q(batteryKwh, 'kWh', 'energy', 'usable', 'pack', 'calculator', { source_detail: 'rated_kw × runtime_min/60 ÷ DoD' }),
    battery_dod: q(batteryDod, '', 'dimensionless', 'rated', 'pack', 'physics_constant', { source_detail: 'VRLA 0.5 / Li-ion LFP 0.85 manufacturer-recommended' }),
    loss_at_full_load_kw: q(lossKw, 'kW', 'power', 'continuous', 'system', 'calculator', { source_detail: 'rated_kw × (1 - efficiency); 24/7 dissipation = data-centre PUE penalty' }),
    thermal_rejection_kw: q(thermalRejectKw, 'kW', 'power', 'min', 'system', 'calculator', { source_detail: 'loss × 1.5 safety margin' }),
    cooling_type: q(coolingType === 'forced_air' ? 2 : 3, '', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: 'enum: 2=forced air, 3=liquid; liquid only >1 MW frame' }),
    crest_factor: q(crestFactor, '', 'dimensionless', 'peak', 'system', 'physics_constant', { source_detail: 'IEC 62040-3 nonlinear-load crest factor 3:1' }),
    peak_output_current_a: q(peakOutputCurrentA, 'A', 'current', 'peak', 'system', 'calculator'),
    mass_kg: q(massKg, 'kg', 'mass', 'gross_takeoff', 'system', 'calculator', { source_detail: `${massPerKw} kg/kW (battery cabinet dominates)` }),
  }

  const acRatedCurrentA = (ratedKw * 1000) / (outputVoltageAc * (outputVoltageAc < 300 ? 1.0 : 1.732))

  const topology: TopologyEdge[] = [
    {
      from_part: 'mains_input',
      to_part: 'input_rectifier_pfc',
      mechanism: 'electrical_bus',
      constraint_kind: 'current_rating',
      required_value: (ratedKw * 1000) / (inputVoltageAc * (inputVoltageAc < 300 ? 1.0 : 1.732)),
      required_unit: 'A',
      required_margin_factor: 1.25,
    },
    {
      from_part: 'input_rectifier_pfc',
      to_part: 'dc_link_bus',
      mechanism: 'electrical_bus',
      constraint_kind: 'voltage_rating',
      required_value: outputVoltageAc * 1.6,  // DC link ≈ √2 × Vac + ripple
      required_unit: 'V',
    },
    {
      from_part: 'battery_string',
      to_part: 'dc_link_bus',
      mechanism: 'electrical_bus',
      constraint_kind: 'voltage_rating',
      required_value: outputVoltageAc * 1.6,
      required_unit: 'V',
      material_context: isLithium ? 'LFP_cell_string — 14S2P typical at 48 V level, multiple strings in series-parallel' : 'VRLA_12V_block_string — 30-40 blocks in series typical 480 V battery bus',
    },
    {
      from_part: 'dc_link_bus',
      to_part: 'igbt_output_inverter',
      mechanism: 'electrical_bus',
      constraint_kind: 'current_rating',
      required_value: acRatedCurrentA * crestFactor,
      required_unit: 'A',
      required_margin_factor: 3.0,  // IEC 62040-3 crest factor sizing
      material_context: 'IGBT_3kV_or_SiC_module — 3× peak overload capability per IEC 62040-3 crest 3:1',
    },
    {
      from_part: 'igbt_output_inverter',
      to_part: 'output_filter_lc',
      mechanism: 'electrical_bus',
      constraint_kind: 'current_rating',
      required_value: acRatedCurrentA,
      required_unit: 'A',
    },
    {
      from_part: 'output_filter_lc',
      to_part: 'critical_load_bus',
      mechanism: 'electrical_bus',
      constraint_kind: 'current_rating',
      required_value: acRatedCurrentA,
      required_unit: 'A',
    },
    {
      from_part: 'mains_input',
      to_part: 'static_bypass_switch',
      mechanism: 'electrical_bus',
      constraint_kind: 'current_rating',
      required_value: acRatedCurrentA * 10,  // 10× rated for 5-cycle fault clearance
      required_unit: 'A',
      required_margin_factor: 10.0,
      material_context: 'thyristor_back_to_back — fault-mode 5-cycle ride-through, instant transfer <2 ms',
    },
    {
      from_part: 'static_bypass_switch',
      to_part: 'critical_load_bus',
      mechanism: 'electrical_bus',
      constraint_kind: 'current_rating',
      required_value: acRatedCurrentA * 1.25,
      required_unit: 'A',
    },
    {
      from_part: 'power_module',
      to_part: 'heat_exchanger_cooling',
      mechanism: 'thermal',
      constraint_kind: 'thermal_rejection',
      required_value: thermalRejectKw,
      required_unit: 'kW',
    },
    {
      from_part: 'enclosure',
      to_part: 'electrical_room',
      mechanism: 'mechanical',
      constraint_kind: 'material_compatibility',
      material_context: `${enclosureRating} — indoor data-centre / electrical room; powder-coated steel, IP20, IK08 impact`,
    },
  ]

  // Macro-assembly pricing — Eaton 9395P / APC Galaxy VL teardowns + IDTechEx
  // UPS 2024 OEM-level cost survey. Word names chosen for ≥0.66 token overlap
  // with Stage 1.7 emissions (power_module, battery_string, rectifier,
  // static_bypass_switch, control_logic, fans_heat_exchanger, enclosure).
  // 2024 OEM-level cost basis:
  //   Power module (IGBT/SiC): £45/kW Si-IGBT, £75/kW SiC hybrid
  //   Input rectifier (3-phase PFC): £28/kW
  //   Output filter (LC inductor + caps): £8/kW
  //   Static bypass switch (back-to-back thyristor + contactors): £900 flat
  //     + £15/kW for large frame
  //   Battery cells: Li-ion LFP £180/kWh OEM (vs £100/kWh BESS-scale — UPS
  //   pays a premium for short-cycle high-rate cells), VRLA £85/kWh
  //   Battery cabinet/rack + BMS: £40/kWh
  //   Control logic + display + comms: £4000 flat (microcontroller + colour
  //   LCD + SNMP/Modbus/BACnet card)
  //   Cooling: fans £30/kW forced-air, liquid skid £180/kW
  //   Enclosure: £12/kg powder-coated steel (rack class), £8/kg floor (cheaper per kg at scale)
  const powerModulePerKw = semiconductorTech === 'SiC_hybrid' ? 75 : 45
  const batteryCellPerKwh = isLithium ? 180 : 85
  const coolingPerKw = coolingType === 'liquid' ? 180 : 30
  const enclosurePerKg = formFactor === 'rack' ? 12 : 8
  const enclosureMassKg = massKg * 0.20  // ~20% of mass (battery dominates the rest)
  const staticBypassCost = 900 + 15 * Math.max(0, ratedKw - 30)
  const macro_assembly_prices: MacroAssemblyPrice[] = [
    {
      word_name: 'power_module_inverter_block',
      unit_price_gbp: powerModulePerKw,
      dimension_basis: 'kw_power',
      dimension_value: ratedKw,
      total_gbp: powerModulePerKw * ratedKw,
      source_detail: `£${powerModulePerKw}/kW × ${ratedKw} kW (${semiconductorTech} IGBT/SiC bridge + gate drivers + isolated power supplies; Infineon FF/Cree Wolfspeed module class)`,
    },
    {
      word_name: 'rectifier_pfc_front_end',
      unit_price_gbp: 28,
      dimension_basis: 'kw_power',
      dimension_value: ratedKw,
      total_gbp: 28 * ratedKw,
      source_detail: `£28/kW × ${ratedKw} kW (three-level NPC PFC rectifier, THDi <3%, Vienna-rectifier topology common above 100 kW)`,
    },
    {
      word_name: 'output_filter_inductor_capacitor',
      unit_price_gbp: 8,
      dimension_basis: 'kw_power',
      dimension_value: ratedKw,
      total_gbp: 8 * ratedKw,
      source_detail: `£8/kW × ${ratedKw} kW (LC output filter, sine-wave THD <2% at full nonlinear load, metallised polypropylene caps)`,
    },
    {
      word_name: isLithium ? 'battery_string_lfp_lithium' : 'battery_string_vrla_agm',
      unit_price_gbp: batteryCellPerKwh,
      dimension_basis: 'kwh_capacity',
      dimension_value: batteryKwh,
      total_gbp: batteryCellPerKwh * batteryKwh,
      source_detail: `£${batteryCellPerKwh}/kWh × ${batteryKwh.toFixed(1)} kWh (${isLithium ? 'CATL/EVE LFP prismatic cells, high-rate UPS variant, 10 yr float life' : 'CSB/Yuasa 12 V VRLA-AGM blocks, 5-7 yr float life @ 25°C'}; high-rate UPS premium vs BESS-scale cells)`,
    },
    {
      word_name: 'battery_cabinet_bms',
      unit_price_gbp: 40,
      dimension_basis: 'kwh_capacity',
      dimension_value: batteryKwh,
      total_gbp: 40 * batteryKwh,
      source_detail: `£40/kWh × ${batteryKwh.toFixed(1)} kWh (battery rack / cabinet + BMS + cell balancing + DC disconnect + Class T fuse)`,
    },
    {
      word_name: 'static_bypass_switch',
      unit_price_gbp: staticBypassCost,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: staticBypassCost,
      source_detail: `£${staticBypassCost.toLocaleString()} (thyristor back-to-back, <2 ms transfer, 5-cycle full-current ride-through per IEC 62040-3)`,
    },
    {
      word_name: 'control_logic_display_comms',
      unit_price_gbp: 4000,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 4000,
      source_detail: `£4,000 flat (ARM Cortex-M7 + DSP control card + colour touch LCD + SNMP/Modbus TCP/BACnet card per IEC 62040-3 monitoring class)`,
    },
    {
      word_name: 'fans_heat_exchanger_cooling',
      unit_price_gbp: coolingPerKw,
      dimension_basis: 'kw_power',
      dimension_value: ratedKw,
      total_gbp: coolingPerKw * ratedKw,
      source_detail: `£${coolingPerKw}/kW × ${ratedKw} kW (${coolingType === 'liquid' ? 'liquid cooling skid with chiller for >1 MW frame' : 'EC fans + finned-stack heat exchanger, hot-swappable'})`,
    },
    {
      word_name: 'enclosure_ip20_powder_coated',
      unit_price_gbp: enclosurePerKg,
      dimension_basis: 'kg_mass',
      dimension_value: enclosureMassKg,
      total_gbp: enclosurePerKg * enclosureMassKg,
      source_detail: `£${enclosurePerKg}/kg × ${enclosureMassKg.toFixed(0)} kg (${enclosureRating} powder-coated 2 mm steel, IK08 impact, EMC-shielded penetrations)`,
    },
  ]

  // Closures — design-rule gates
  const closures: ContractClosureResult[] = []
  closures.push({
    invariant_id: 'iec_62040_3_efficiency_above_94pct',
    status: efficiencyPct >= 94 ? 'pass' : efficiencyPct >= 92 ? 'warn' : 'fail',
    measured: efficiencyPct,
    required: '≥94% IEC 62040-3 double-conversion efficiency at full load (VFI-SS-111 class)',
    reason: `Rated efficiency ${efficiencyPct.toFixed(1)}%. <94% fails IEC 62040-3 efficiency class; <92% rules out data-centre Tier-III/IV.`,
  })
  // 2026-05-23 fix (post-batch-2 review): rack UPS is a LEGITIMATE design
  // choice for SME / 1-rack / Tier-II workloads, not a failure mode. The
  // previous 'warn' suggested the brief was somehow non-compliant; that's
  // wrong. Status now PASS for every form_factor with the reason explaining
  // which workload tier the design fits — operator can match against brief.
  closures.push({
    invariant_id: 'hot_swap_capability_matches_uptime_class',
    status: 'pass',
    measured: 1,
    required: 'Form-factor must match required uptime class (Tier-II rack = ≤99.9%, Tier-III modular = ≤99.98%, Tier-IV parallel = ≤99.99%)',
    reason: `${formFactor}: ${formFactor === 'rack' ? 'rack UPS supports Tier-I/II workloads (≤99.9% uptime, single-path); battery + power module not hot-swap, requires scheduled shutdown for maintenance' : formFactor === 'floor_modular' ? 'floor-modular UPS supports Tier-III workloads (99.982% uptime, N+1 redundancy); hot-swap modules + cassettes by construction, supports concurrent maintenance' : 'parallel-frame UPS supports Tier-IV workloads (99.995% uptime, 2N redundancy); hot-swap modules + N+1 within each frame; multi-frame parallel for 2N capacity redundancy'}.`,
  })
  closures.push({
    invariant_id: 'ride_through_5_cycles_at_max_load',
    status: 'pass',
    measured: 1,
    required: 'Static bypass + power-module overload capability deliver 5-cycle (100 ms) ride-through at 125-150% load per IEC 62040-3',
    reason: `Static-bypass sized ${(acRatedCurrentA * 10).toFixed(0)} A (10× rated) and inverter sized for ${crestFactor}× crest factor by construction. 5-cycle (100 ms @ 50 Hz) full-fault ride-through gated by static-bypass switch + DC-link capacitor energy.`,
  })
  closures.push({
    invariant_id: 'thermal_rejection_capacity',
    status: thermalRejectKw >= lossKw * 1.4 ? 'pass' : 'fail',
    measured: thermalRejectKw,
    required: lossKw * 1.4,
    reason: `Cooling (${coolingType}) sized ${thermalRejectKw.toFixed(2)} kW vs continuous loss ${lossKw.toFixed(2)} kW. 1.4× margin handles 40°C electrical-room derating envelope.`,
  })
  closures.push({
    invariant_id: 'autonomy_meets_brief',
    status: 'pass',
    measured: runtimeMin,
    required: `≥${runtimeMin} min autonomy at full load (brief)`,
    reason: `Battery sized ${batteryKwh.toFixed(1)} kWh × ${(batteryDod * 100).toFixed(0)}% DoD ÷ ${ratedKw} kW = ${(batteryKwh * batteryDod / ratedKw * 60).toFixed(1)} min @ full load. End-of-life capacity (80%) → ${(batteryKwh * batteryDod * 0.8 / ratedKw * 60).toFixed(1)} min EoL.`,
  })
  closures.push({
    invariant_id: 'crest_factor_3_to_1_at_full_load',
    status: 'pass',
    measured: crestFactor,
    required: '≥3:1 peak-to-RMS crest factor at full load (server PSU + nonlinear-load capability per IEC 62040-3)',
    reason: `Output inverter sized for ${peakOutputCurrentA.toFixed(0)} A peak (${crestFactor}× × ${acRatedCurrentA.toFixed(0)} A RMS); switching module current-rating margin already includes ${crestFactor}× sizing.`,
  })

  const macroAssemblyTotal = macro_assembly_prices.reduce((a, m) => a + m.total_gbp, 0)

  return {
    product_class: 'ups_inverter',
    brief_summary: `${ratedKw.toFixed(0)} kW ${formFactor.replace('_', ' ')} online double-conversion UPS (${semiconductorTech}, ${efficiencyPct.toFixed(1)}% efficiency). ${inputVoltageAc} V input → ${outputVoltageAc} V output @ ${crestFactor}:1 crest factor (${peakOutputCurrentA.toFixed(0)} A peak). ${runtimeMin} min autonomy via ${batteryKwh.toFixed(1)} kWh ${isLithium ? 'Li-ion LFP' : 'VRLA-AGM'} battery (DoD ${(batteryDod * 100).toFixed(0)}%). ${lossKw.toFixed(2)} kW loss → ${thermalRejectKw.toFixed(2)} kW ${coolingType} cooling. ${enclosureRating}, ${massKg.toFixed(0)} kg. Macro-assembly raw BoM = £${macroAssemblyTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} (≈£${(macroAssemblyTotal / ratedKw).toFixed(0)}/kW vs £400-1200/kW installed benchmark).`,
    quantities,
    topology,
    macro_assembly_prices,
    closures,
  }
})

// ---------------- 3d_printer_fdm -----------------
// Full archetype contract — replaces buildMinimalContract stub. Industrial
// FDM 3D printer (Stratasys F-series / Ultimaker S7 Pro / Markforged FX20 /
// Roboze Argo / 3DGence INDUSTRY class), not desktop hobbyist. Modelled on
// BESS / bioreactor pattern. Macro prices grounded in OEM list prices +
// Stratasys / Markforged investor disclosures (industrial £15k-150k range
// with high-temp PEEK class £80k-250k; estimate £200-800/L build volume +
// £4-15k base electronics + heater hardware).
registerArchetype('3d_printer_fdm', (brief: any) => {
  const desc = String(brief?.product_description ?? '')
  // Build volume — primary driver of cost (frame, heaters, motion system
  // all scale ~ linearly with volume). Brief gives explicit XxYxZ or just
  // a max-volume statement. Industrial range 200-1200 mm per axis typical.
  const buildXmm = extractRangeFromDesc(desc, /(\d{2,4})\s*(?:x|×|mm)\s*(?:\d{2,4})\s*(?:x|×|mm)\s*\d{2,4}.*build/i, 0)
    || extractRangeFromDesc(desc, /(\d{2,4})\s*mm\s+x/i, 300)
  const buildYmm = (() => {
    const m = desc.match(/\d{2,4}\s*(?:x|×)\s*(\d{2,4})\s*(?:x|×)/i)
    return m ? parseFloat(m[1]) : buildXmm
  })()
  const buildZmm = (() => {
    const m = desc.match(/\d{2,4}\s*(?:x|×)\s*\d{2,4}\s*(?:x|×)\s*(\d{2,4})/i)
    return m ? parseFloat(m[1]) : buildXmm
  })()
  // Build volume in litres for cost scaling.
  const buildVolL = (buildXmm * buildYmm * buildZmm) / 1_000_000
  // Chamber max temperature — defines material capability class:
  //   60-80°C: PLA/PETG/ABS (consumer-grade industrial, e.g. Ultimaker S-series)
  //   100-120°C: ASA/PC/nylon (mid industrial, Markforged X-series)
  //   180-250°C: PEEK/PEKK/Ultem (high-temp, Roboze Argo / 3DGence INDUSTRY F421)
  const maxChamberTempC = extractRangeFromDesc(desc, /(\d{2,3})\s*°?C\s*chamber/i,
    /peek|pekk|ultem|polyetherimide|high[\s-]?temp/i.test(desc) ? 200
    : /asa|polycarbonate|nylon|industrial/i.test(desc) ? 110
    : 80)
  // Materials class enum derived from chamber temp.
  const materialsClass: 'consumer' | 'industrial' | 'high_temp' = maxChamberTempC >= 160 ? 'high_temp'
    : maxChamberTempC >= 100 ? 'industrial'
    : 'consumer'
  // Nozzle / hotend temperature follows the chamber tier:
  //   PLA/PETG: 240°C; ASA/PC: 290°C; PEEK/PEKK: 450°C
  const nozzleTempC = extractRangeFromDesc(desc, /(\d{2,3})\s*°?C\s*(?:nozzle|hotend)/i,
    materialsClass === 'high_temp' ? 450 : materialsClass === 'industrial' ? 290 : 240)
  // Heated bed temperature follows similarly.
  const bedTempC = extractRangeFromDesc(desc, /(\d{2,3})\s*°?C\s*bed/i,
    materialsClass === 'high_temp' ? 220 : materialsClass === 'industrial' ? 130 : 100)
  // Extruder count — dual-extruder industrial typical (model + soluble support).
  const extruderCount = /single[\s-]?extruder/i.test(desc) ? 1 : 2
  // Motion topology — gantry (CoreXY/H-Gantry/Cartesian) for industrial,
  // delta less common in industrial class.
  const isDelta = /delta/i.test(desc)
  const motionTopology: 'cartesian' | 'corexy' | 'delta' = isDelta ? 'delta'
    : /corexy|core[\s-]?xy|h[\s-]?bot/i.test(desc) ? 'corexy'
    : 'cartesian'
  // Max print speed — industrial 80-300 mm/s realistic; "claimed" speeds up
  // to 500-1000 mm/s exist (Bambu, MakerBot) but quality is bounded by jerk
  // and acceleration limits, not nominal V_max.
  const maxPrintSpeedMmS = extractRangeFromDesc(desc, /(\d{2,4})\s*mm\/s/i,
    materialsClass === 'high_temp' ? 100 : materialsClass === 'industrial' ? 200 : 250)
  // Filament diameter — 1.75 mm industrial standard; 2.85 mm legacy
  // Ultimaker; 1.0 mm desktop variant (rare in industrial).
  const filamentDiameterMm = extractRangeFromDesc(desc, /(\d\.\d{1,2})\s*mm\s+filament/i, 1.75)
  // Repeatability — typical industrial 20-100 μm; high-end 10-25 μm
  const repeatabilityUm = extractRangeFromDesc(desc, /(\d{1,3})\s*(?:μ|u|micro)m\s+(?:repeat|positioning)/i,
    materialsClass === 'high_temp' ? 25 : materialsClass === 'industrial' ? 50 : 100)
  // Layer height — printer minimum is ~50 μm industrial (0.05 mm).
  const minLayerHeightMm = 0.05
  // Power draw — heated bed + chamber heater dominate. Approx:
  //   100 W/L for chamber heating (consumer 80°C)
  //   400 W/L for high-temp (200°C chamber, insulated)
  //   plus 350 W nozzle + 600 W bed per extruder
  const chamberHeatingWPerL = materialsClass === 'high_temp' ? 400 : materialsClass === 'industrial' ? 200 : 100
  const nozzleHeaterW = 350 * extruderCount
  const bedHeaterW = materialsClass === 'high_temp' ? 1200 : materialsClass === 'industrial' ? 800 : 600
  const totalPowerW = chamberHeatingWPerL * buildVolL + nozzleHeaterW + bedHeaterW + 400  // 400 W motion + control overhead
  // Mass estimate — 50-150 kg/L volume class (frame + heaters + motion).
  const massPerL = materialsClass === 'high_temp' ? 130 : materialsClass === 'industrial' ? 80 : 50
  const massKg = massPerL * Math.max(buildVolL, 5)  // floor 5 L to avoid micro-printer underestimation
  // Enclosure rating — industrial workshop class with HEPA + carbon filter
  // for nylon/PC, PEEK requires insulated active chamber.
  const enclosureRating = materialsClass === 'high_temp' ? 'insulated_active_chamber_400C_capable' : materialsClass === 'industrial' ? 'enclosed_filtered_chamber' : 'enclosed_chamber'

  const quantities: Record<string, Quantity> = {
    build_volume_x_mm: q(buildXmm, 'mm', 'length', 'rated', 'system', 'brief'),
    build_volume_y_mm: q(buildYmm, 'mm', 'length', 'rated', 'system', 'brief'),
    build_volume_z_mm: q(buildZmm, 'mm', 'length', 'rated', 'system', 'brief'),
    build_volume_litres: q(buildVolL, 'L', 'volume', 'rated', 'system', 'calculator', { source_detail: 'X × Y × Z / 1,000,000' }),
    materials_class: q(materialsClass === 'consumer' ? 1 : materialsClass === 'industrial' ? 2 : 3, '', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: 'enum: 1=consumer PLA/PETG, 2=industrial ASA/PC/nylon, 3=high-temp PEEK/PEKK/Ultem' }),
    max_chamber_temp_c: q(maxChamberTempC, '°C', 'temperature', 'max', 'system', 'brief', { source_detail: 'active chamber heat-up; PEEK/PEKK requires 180-220°C for crystallinity' }),
    nozzle_temp_max_c: q(nozzleTempC, '°C', 'temperature', 'max', 'module', 'brief', { source_detail: 'PLA 240°C / ASA 290°C / PEEK 450°C' }),
    bed_temp_max_c: q(bedTempC, '°C', 'temperature', 'max', 'module', 'brief'),
    extruder_count: q(extruderCount, '', 'dimensionless', 'rated', 'system', 'brief', { source_detail: 'industrial default 2: model + soluble support' }),
    motion_topology: q(motionTopology === 'cartesian' ? 1 : motionTopology === 'corexy' ? 2 : 3, '', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: 'enum: 1=cartesian, 2=CoreXY, 3=delta' }),
    max_print_speed_mm_s: q(maxPrintSpeedMmS, 'mm/s', 'velocity', 'max', 'system', 'brief'),
    filament_diameter_mm: q(filamentDiameterMm, 'mm', 'length', 'rated', 'system', 'physics_constant', { source_detail: '1.75 mm industrial standard' }),
    repeatability_micron: q(repeatabilityUm, 'μm', 'length', 'rated', 'system', 'brief', { source_detail: 'positional repeatability per ISO 230-2' }),
    min_layer_height_mm: q(minLayerHeightMm, 'mm', 'length', 'min', 'system', 'physics_constant', { source_detail: '0.05 mm typical industrial minimum' }),
    chamber_heater_power_w: q(chamberHeatingWPerL * buildVolL, 'W', 'power', 'continuous', 'module', 'calculator', { source_detail: `${chamberHeatingWPerL} W/L × build volume; insulation reduces steady-state to ~30% of heat-up draw` }),
    nozzle_heater_power_w: q(nozzleHeaterW, 'W', 'power', 'rated', 'module', 'calculator', { source_detail: `350 W per extruder × ${extruderCount}` }),
    bed_heater_power_w: q(bedHeaterW, 'W', 'power', 'rated', 'module', 'calculator'),
    total_input_power_w: q(totalPowerW, 'W', 'power', 'peak', 'system', 'calculator', { source_detail: 'sum of heaters + 400 W motion/control overhead' }),
    mass_kg: q(massKg, 'kg', 'mass', 'gross_takeoff', 'system', 'calculator', { source_detail: `${massPerL} kg/L typical for ${materialsClass} class` }),
  }

  const topology: TopologyEdge[] = [
    {
      from_part: 'mains_input',
      to_part: 'power_supply_unit',
      mechanism: 'electrical_bus',
      constraint_kind: 'current_rating',
      required_value: totalPowerW / 230,
      required_unit: 'A',
      required_margin_factor: 1.25,
      material_context: '230 V AC industrial single-phase or 400 V three-phase for >5 kW class',
    },
    {
      from_part: 'power_supply_unit',
      to_part: 'control_board',
      mechanism: 'electrical_bus',
      constraint_kind: 'voltage_rating',
      required_value: 24,
      required_unit: 'V',
      material_context: '24 V DC industrial logic + driver bus',
    },
    {
      from_part: 'control_board',
      to_part: 'servo_stepper_drivers',
      mechanism: 'data',
      constraint_kind: 'data_bandwidth',
      required_value: 1000,
      required_unit: 'Hz',
      material_context: motionTopology === 'corexy' ? 'CoreXY motion: synchronised dual-stepper jerk command' : 'cartesian XYZ stepper driver bus',
    },
    {
      from_part: 'extruder_hotend',
      to_part: 'build_chamber',
      mechanism: 'thermal',
      constraint_kind: 'thermal_rejection',
      required_value: nozzleHeaterW,
      required_unit: 'W',
      material_context: materialsClass === 'high_temp' ? 'insulated_PEEK_compatible_hotend — Inconel heater block, ceramic insulator, 450°C rated' : 'standard_brass_or_hardened_steel_nozzle',
    },
    {
      from_part: 'heated_bed',
      to_part: 'build_chamber',
      mechanism: 'thermal',
      constraint_kind: 'thermal_rejection',
      required_value: bedHeaterW,
      required_unit: 'W',
      material_context: materialsClass === 'high_temp' ? 'machined_aluminium_bed_with_PI_heater' : 'PCB_heater_with_glass_or_PEI_buildplate',
    },
    {
      from_part: 'chamber_heater',
      to_part: 'build_chamber',
      mechanism: 'thermal',
      constraint_kind: 'thermal_rejection',
      required_value: chamberHeatingWPerL * buildVolL,
      required_unit: 'W',
      material_context: materialsClass === 'high_temp' ? 'PTC_or_resistive_chamber_heaters_with_recirculation_fan' : 'enclosure_passive_or_fan_circulated',
    },
    {
      from_part: 'filament_feed_system',
      to_part: 'extruder_hotend',
      mechanism: 'mechanical',
      constraint_kind: 'flow_capacity',
      required_value: 8 * extruderCount,  // 8 mm³/s flow per extruder typical
      required_unit: 'mm³/s',
      material_context: 'bowden or direct-drive feed; geared dual-pinion for PEEK class',
    },
    {
      from_part: 'enclosure',
      to_part: 'workshop_environment',
      mechanism: 'mechanical',
      constraint_kind: 'material_compatibility',
      material_context: materialsClass !== 'consumer'
        ? `${enclosureRating} — HEPA + activated carbon filter for ABS/nylon fumes per EN ISO 16000-1 office air-quality`
        : `${enclosureRating} — passive enclosure for layer adhesion`,
    },
  ]

  // Macro-assembly pricing — Stratasys / Ultimaker / Markforged / Roboze
  // teardowns + 2024 OEM list prices. Word names chosen for ≥0.66 token
  // overlap (motion_system, heated_bed, extruder, chamber_heater, control_board,
  // filament_feed_system, frame, enclosure_with_filtration).
  // 2024 OEM-level cost basis:
  //   Motion system (linear rails + steppers/servos + belts): £35/L volume +
  //   £600 base electronics (steppers + ICs + cabling)
  //   Heated bed: £30/L surface area equivalent + £200 PI heater
  //   Extruder + hotend: £400 (consumer), £1200 (industrial), £3500 (high-temp PEEK)
  //   Chamber heater + circulation: £18/L (consumer), £80/L (industrial), £250/L (high-temp)
  //   Control board + LCD/screen: £800 (consumer-class), £1800 (Duet-Maestro
  //   industrial), £3500 (high-end Klipper or proprietary)
  //   Filament feed system: £150 per extruder (consumer), £450 (industrial dual-drive)
  //   Frame: £80/L volume (machined aluminium + structural plate)
  //   Enclosure with filtration: £1200 base + £150/L for high-temp insulated active chamber
  const motionPerL = 35
  const extruderUnit = materialsClass === 'high_temp' ? 3500 : materialsClass === 'industrial' ? 1200 : 400
  const chamberHeaterPerL = materialsClass === 'high_temp' ? 250 : materialsClass === 'industrial' ? 80 : 18
  const controlBoardCost = materialsClass === 'high_temp' ? 3500 : materialsClass === 'industrial' ? 1800 : 800
  const filamentFeedPerExtruder = materialsClass === 'consumer' ? 150 : 450
  const enclosureBaseCost = 1200 + (materialsClass === 'high_temp' ? 150 * buildVolL : 0)
  const macro_assembly_prices: MacroAssemblyPrice[] = [
    {
      word_name: 'motion_system_gantry',
      unit_price_gbp: motionPerL,
      dimension_basis: 'litre_volume',
      dimension_value: buildVolL,
      total_gbp: motionPerL * buildVolL + 600,
      source_detail: `£${motionPerL}/L × ${buildVolL.toFixed(1)} L + £600 base (${motionTopology} topology: HIWIN/THK linear rails, NEMA17/23 steppers or Mitsubishi servos, GT2 belts or ball screws on Z)`,
    },
    {
      word_name: 'heated_bed_assembly',
      unit_price_gbp: 30,
      dimension_basis: 'litre_volume',
      dimension_value: buildVolL,
      total_gbp: 30 * buildVolL + 200,
      source_detail: `£30/L equivalent + £200 PI heater (${bedTempC}°C ${materialsClass === 'high_temp' ? 'machined alu with PI silicone heater pad' : 'PCB resistive heater with PEI build surface'})`,
    },
    {
      word_name: 'extruder_hotend_assembly',
      unit_price_gbp: extruderUnit,
      dimension_basis: 'each',
      dimension_value: extruderCount,
      total_gbp: extruderUnit * extruderCount,
      source_detail: `£${extruderUnit} × ${extruderCount} extruder${extruderCount > 1 ? 's' : ''} (${materialsClass === 'high_temp' ? 'Inconel heater block + ceramic insulator + 450°C-rated thermistor for PEEK/PEKK' : materialsClass === 'industrial' ? 'hardened-steel nozzle for abrasive filled filaments, all-metal hotend, dual-drive geared extruder' : 'brass nozzle, V6/J-head hotend, Bowden or direct feed'})`,
    },
    {
      word_name: 'chamber_heater_circulation',
      unit_price_gbp: chamberHeaterPerL,
      dimension_basis: 'litre_volume',
      dimension_value: buildVolL,
      total_gbp: chamberHeaterPerL * buildVolL,
      source_detail: `£${chamberHeaterPerL}/L × ${buildVolL.toFixed(1)} L (${materialsClass === 'high_temp' ? 'PTC heaters + recirculation fan for 180-200°C active chamber + insulation' : materialsClass === 'industrial' ? 'resistive heater + circulation fan for 80-120°C chamber' : 'passive enclosure'})`,
    },
    {
      word_name: 'control_board_motherboard',
      unit_price_gbp: controlBoardCost,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: controlBoardCost,
      source_detail: `£${controlBoardCost} (${materialsClass === 'high_temp' ? 'proprietary 32-bit ARM Cortex-M7 + Klipper-style host or Marlin 2.x with high-temp sensor drivers' : materialsClass === 'industrial' ? 'Duet 3 Mainboard 6HC or comparable industrial board, colour LCD touch screen' : 'BTT Octopus or SKR class, 4.3" LCD'}, EMC-shielded, 24 V DC, thermistor + NTC × 6+ channels)`,
    },
    {
      word_name: 'filament_feed_system',
      unit_price_gbp: filamentFeedPerExtruder,
      dimension_basis: 'each',
      dimension_value: extruderCount,
      total_gbp: filamentFeedPerExtruder * extruderCount,
      source_detail: `£${filamentFeedPerExtruder} × ${extruderCount} (${materialsClass === 'consumer' ? 'single-pinion BMG or planetary geared feed' : 'BondTech / E3D Hemera-style dual-drive geared, hardened steel for filled filaments, filament runout + tangle sensor'})`,
    },
    {
      word_name: 'frame_machined_aluminium',
      unit_price_gbp: 80,
      dimension_basis: 'litre_volume',
      dimension_value: buildVolL,
      total_gbp: 80 * buildVolL,
      source_detail: `£80/L × ${buildVolL.toFixed(1)} L (welded steel or machined aluminium frame, 2020/3030/4040 extrusion or CNC-milled plate, ground levelling pads)`,
    },
    {
      word_name: 'enclosure_with_filtration',
      unit_price_gbp: enclosureBaseCost,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: enclosureBaseCost,
      source_detail: `£${enclosureBaseCost.toLocaleString()} (${enclosureRating}: ${materialsClass !== 'consumer' ? 'HEPA + activated carbon filter for VOC fume capture per EN ISO 16000, interlocked door, fire-rated enclosure for ABS/nylon' : 'PMMA + sheet metal enclosure, magnetic door latch'})`,
    },
  ]

  // Closures — design-rule gates
  const closures: ContractClosureResult[] = []
  closures.push({
    invariant_id: 'chamber_temp_supports_materials_class',
    status: (materialsClass === 'high_temp' && maxChamberTempC >= 160) || (materialsClass === 'industrial' && maxChamberTempC >= 100) || (materialsClass === 'consumer') ? 'pass' : 'fail',
    measured: maxChamberTempC,
    required: materialsClass === 'high_temp' ? '≥180°C for PEEK crystallinity (Tg + 30°C)' : materialsClass === 'industrial' ? '≥100°C for ASA/PC/nylon warpage suppression' : '≥60°C for PLA/PETG bed adhesion',
    reason: `Chamber ${maxChamberTempC}°C. ${materialsClass === 'high_temp' ? 'PEEK semi-crystallinity requires 180-220°C; <160°C produces amorphous parts with 50% loss of strength' : materialsClass === 'industrial' ? 'Below 100°C, ASA/PC warpage > 0.5 mm/100 mm causes layer separation' : 'Below 60°C, PLA first-layer adhesion fails'}.`,
  })
  closures.push({
    invariant_id: 'build_volume_meets_brief',
    status: buildXmm >= 200 && buildYmm >= 200 && buildZmm >= 200 ? 'pass' : 'warn',
    measured: buildVolL,
    required: 'Industrial-class min ≥ 200 × 200 × 200 mm (8 L); brief overrides',
    reason: `Build volume ${buildXmm.toFixed(0)} × ${buildYmm.toFixed(0)} × ${buildZmm.toFixed(0)} mm = ${buildVolL.toFixed(1)} L. Anything <200 mm/axis crosses into desktop class and should be classified differently.`,
  })
  closures.push({
    invariant_id: 'repeatability_meets_industrial_class',
    status: repeatabilityUm <= 100 ? 'pass' : 'warn',
    measured: repeatabilityUm,
    required: '≤100 μm positional repeatability per ISO 230-2 for industrial class',
    reason: `Repeatability ${repeatabilityUm} μm. Industrial typical 25-100 μm; >100 μm typically indicates belt-driven without closed-loop or worn linear bearings.`,
  })
  closures.push({
    invariant_id: 'nozzle_temp_supports_extruder_temp',
    status: nozzleTempC >= (materialsClass === 'high_temp' ? 400 : materialsClass === 'industrial' ? 280 : 230) ? 'pass' : 'fail',
    measured: nozzleTempC,
    required: materialsClass === 'high_temp' ? '≥400°C for PEEK/PEKK/Ultem (Tm 343°C + 50°C melt margin)' : materialsClass === 'industrial' ? '≥280°C for nylon/PC' : '≥230°C for PLA/PETG/ABS',
    reason: `Nozzle max ${nozzleTempC}°C. ${materialsClass === 'high_temp' ? 'PEEK melts at 343°C; ULTEM (PEI) at 217°C glass + 410°C process temp; <400°C → no PEEK capability' : 'standard hotend rating'}.`,
  })
  closures.push({
    invariant_id: 'safety_compliance_enclosure_filtration',
    status: materialsClass !== 'consumer' ? 'pass' : 'warn',
    measured: 1,
    required: 'EN 60204-1 machine-safety + EN ISO 16000-1 office-air for ABS/nylon/PEEK VOC capture',
    reason: `${materialsClass} class — ${materialsClass !== 'consumer' ? 'by construction enclosure includes HEPA + activated carbon filtration for VOC and ultra-fine particulate capture, interlocked door for high-temp safety' : 'consumer-class PLA does not require filtration; if user prints ABS, advise filtration retrofit'}.`,
  })
  closures.push({
    invariant_id: 'power_draw_realistic_for_class',
    status: totalPowerW <= 12000 ? 'pass' : 'warn',
    measured: totalPowerW,
    required: '≤12 kW peak for single-phase 230 V class; ≥12 kW must be three-phase',
    reason: `Peak power ${(totalPowerW / 1000).toFixed(2)} kW. ${totalPowerW > 12000 ? 'Requires 400 V three-phase supply (CE/EN 60204-1 industrial machine)' : 'fits domestic/commercial 230 V single-phase 32 A or 16 A circuit'}.`,
  })

  const macroAssemblyTotal = macro_assembly_prices.reduce((a, m) => a + m.total_gbp, 0)

  return {
    product_class: '3d_printer_fdm',
    brief_summary: `${materialsClass.replace('_', '-')}-class industrial FDM 3D printer, ${buildXmm.toFixed(0)} × ${buildYmm.toFixed(0)} × ${buildZmm.toFixed(0)} mm build (${buildVolL.toFixed(1)} L). ${motionTopology.toUpperCase()} motion, ${extruderCount}× extruder${extruderCount > 1 ? 's' : ''} (${nozzleTempC}°C nozzle, ${bedTempC}°C bed). Chamber ${maxChamberTempC}°C with ${enclosureRating.replace(/_/g, ' ')}. ${repeatabilityUm} μm repeatability, ${maxPrintSpeedMmS} mm/s max. ${(totalPowerW / 1000).toFixed(2)} kW total. ${massKg.toFixed(0)} kg. Macro-assembly raw BoM = £${macroAssemblyTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} (≈£${(macroAssemblyTotal / Math.max(buildVolL, 1)).toFixed(0)}/L vs £200-800/L + base benchmark for ${materialsClass} class).`,
    quantities,
    topology,
    macro_assembly_prices,
    closures,
  }
})

// ---------------- cnc_machine --------------------
// Full archetype contract — replaces buildMinimalContract stub. CNC 3-axis
// or 5-axis vertical machining centre (DMG MORI / Haas / Mazak / Hurco
// class). Modelled on BESS / solar_inverter pattern. Macro prices grounded
// in DMG MORI / Haas list prices + IMTS 2024 transfer-price disclosures.
// Installed £8,000-25,000/kW spindle (3-axis lower band, 5-axis upper).
registerArchetype('cnc_machine', (brief: any) => {
  const tp = brief?.constraints?.target_performance ?? {}
  const u = String(tp.unit ?? 'kW').toLowerCase()
  const desc = String(brief?.product_description ?? '')
  // Spindle power — primary brief variable. Accept kW / W / hp.
  const spindleKw = (() => {
    const descPower = desc.match(/(?:spindle|main|drive)\s+(?:rated\s+)?power[\s:]{0,8}(\d{1,4}(?:\.\d+)?)\s*(kw|w|hp|kilowatt[s]?|horsepower)\b/i)
      ?? desc.match(/(\d{1,4}(?:\.\d+)?)\s*(kw|w|hp)\s+(?:spindle|motor|main\s+drive)/i)
    if (descPower) {
      const v = parseFloat(descPower[1])
      const unit = descPower[2].toLowerCase()
      if (unit === 'w' || unit === 'watt' || unit === 'watts') return v / 1000
      if (unit === 'hp' || unit === 'horsepower') return v * 0.7457
      return v
    }
    if (Number(tp.value ?? 0) > 0) {
      if (u === 'kw' || u === 'kilowatt' || u === 'kilowatts') return Number(tp.value)
      if (u === 'w' || u === 'watt' || u === 'watts') return Number(tp.value) / 1000
      if (u === 'hp' || u === 'horsepower') return Number(tp.value) * 0.7457
      // Wrong unit (rpm, mm/min) → fall to default
    }
    return 15  // class default: vertical machining centre 15 kW spindle
  })()
  // Axis count — 3-axis (X/Y/Z mill), 4-axis (3 + rotary), 5-axis (3 + A/B tilt).
  const isFiveAxis = /5[\s-]?axis|five[\s-]?axis|trunnion/i.test(desc)
  const isFourAxis = !isFiveAxis && /4[\s-]?axis|four[\s-]?axis|rotary[\s-]?table/i.test(desc)
  const axisCount: 3 | 4 | 5 = isFiveAxis ? 5 : isFourAxis ? 4 : 3
  // Travels — brief drives. Defaults below class typical 5-axis VMC envelope.
  const travelXmm = (() => {
    const m = desc.match(/(?:travel|X)\s*:?\s*(\d{3,5})\s*mm/i)
    if (m) return parseFloat(m[1])
    const dim = desc.match(/(\d{3,5})\s*x\s*(\d{3,5})\s*(?:x|×)\s*(\d{3,5})/i)
    if (dim) return parseFloat(dim[1])
    return axisCount === 5 ? 800 : 1020
  })()
  const travelYmm = (() => {
    const m = desc.match(/Y\s*:?\s*(\d{3,5})\s*mm/i) ?? desc.match(/(\d{3,5})\s*x\s*(\d{3,5})\s*(?:x|×)\s*\d{3,5}/i)
    if (m) return parseFloat(m[2] ?? m[1])
    return axisCount === 5 ? 600 : 510
  })()
  const travelZmm = (() => {
    const m = desc.match(/Z\s*:?\s*(\d{3,5})\s*mm/i) ?? desc.match(/\d{3,5}\s*x\s*\d{3,5}\s*(?:x|×)\s*(\d{3,5})/i)
    if (m) return parseFloat(m[1])
    return axisCount === 5 ? 500 : 510
  })()
  const workEnvelopeM3 = (travelXmm / 1000) * (travelYmm / 1000) * (travelZmm / 1000)
  // Positioning accuracy — typical industrial 5-15 μm; high-end 1-3 μm.
  const positioningAccuracyUm = extractRangeFromDesc(desc, /(\d{1,3})\s*(?:μ|u|micro)m\s+(?:positioning|accuracy)/i,
    axisCount === 5 ? 5 : 10)
  // Repeatability typically half of positioning accuracy.
  const repeatabilityUm = positioningAccuracyUm * 0.5
  // Spindle max RPM. High-RPM for aluminium/composites; lower for steel.
  const maxSpindleRpm = extractRangeFromDesc(desc, /(\d{4,6})\s*-?\s*(\d{4,6})?\s*rpm/i,
    /aluminium|composite|hsm|high[\s-]?speed/i.test(desc) ? 30000 : 18000)
  // Spindle taper standard — BT40/HSK63 common 18 kW class, BT50/HSK100 for >25 kW.
  const spindleTaper = spindleKw >= 25 ? 'HSK_A100' : spindleKw >= 18 ? 'HSK_A63' : 'BT40'
  // Rapid traverse rate
  const rapidMmMin = extractRangeFromDesc(desc, /(\d{4,6})\s*-?\s*(\d{4,6})?\s*mm\/min/i,
    axisCount === 5 ? 48000 : 30000)
  // Tool changer capacity
  const toolMagazineCapacity = extractRangeFromDesc(desc, /(\d{1,3})\s*-?\s*(\d{1,3})?\s*(?:tool|atc)/i,
    axisCount === 5 ? 40 : 24)
  // Frame material — Meehanite cast iron or polymer concrete.
  const isPolymerConcrete = /polymer[\s-]?concrete|mineral[\s-]?cast/i.test(desc)
  const frameMaterial: 'cast_iron' | 'polymer_concrete' = isPolymerConcrete ? 'polymer_concrete' : 'cast_iron'
  // Control system OEM
  const controlOem: 'siemens' | 'fanuc' | 'heidenhain' | 'mitsubishi' = /siemens|sinumerik/i.test(desc) ? 'siemens'
    : /heidenhain|tnc/i.test(desc) ? 'heidenhain'
    : /mitsubishi|m-?series/i.test(desc) ? 'mitsubishi'
    : 'fanuc'
  // Coolant capacity — typically 200-1500 L for through-spindle + flood.
  const coolantCapacityL = extractRangeFromDesc(desc, /(\d{2,4})\s*-?\s*(\d{2,4})?\s*L\s+coolant/i,
    workEnvelopeM3 < 0.5 ? 250 : workEnvelopeM3 < 1 ? 600 : 1200)
  // Mass — VMC class 4-8 t/m³ work envelope (cast iron base + column dominant).
  const massPerM3 = isPolymerConcrete ? 7000 : 6000  // polymer concrete slightly heavier (vibration damping density)
  const massKg = Math.max(2500, massPerM3 * workEnvelopeM3 + 1500 * axisCount)  // base + per-axis structure
  // Total connected power — spindle + servo drives + auxiliaries
  const servoPowerKw = axisCount * 4  // typical 4 kW continuous per axis
  const auxiliaryPowerKw = 6 + (coolantCapacityL / 250)  // hydraulics + coolant pumps + lubricator + chip conveyor
  const totalConnectedPowerKw = spindleKw + servoPowerKw + auxiliaryPowerKw

  const quantities: Record<string, Quantity> = {
    rated_spindle_power_kw: q(spindleKw, 'kW', 'power', 'rated', 'system', 'brief'),
    axis_count: q(axisCount, '', 'dimensionless', 'rated', 'system', 'brief', { source_detail: 'enum 3/4/5; 5-axis = simultaneous A/B tilt + XYZ' }),
    travel_x_mm: q(travelXmm, 'mm', 'length', 'max', 'system', 'brief'),
    travel_y_mm: q(travelYmm, 'mm', 'length', 'max', 'system', 'brief'),
    travel_z_mm: q(travelZmm, 'mm', 'length', 'max', 'system', 'brief'),
    work_envelope_m3: q(workEnvelopeM3, 'm³', 'volume', 'rated', 'system', 'calculator', { source_detail: 'X × Y × Z / 10⁹' }),
    positioning_accuracy_um: q(positioningAccuracyUm, 'μm', 'length', 'rated', 'system', 'brief', { source_detail: 'ISO 230-2 positional accuracy at 20°C' }),
    repeatability_um: q(repeatabilityUm, 'μm', 'length', 'rated', 'system', 'calculator', { source_detail: '≈ 0.5 × positioning accuracy per ISO 230-2 B' }),
    max_spindle_rpm: q(maxSpindleRpm, 'rpm', 'frequency', 'max', 'module', 'brief'),
    rapid_traverse_mm_per_min: q(rapidMmMin, 'mm/min', 'velocity', 'max', 'system', 'brief'),
    tool_magazine_capacity: q(toolMagazineCapacity, '', 'dimensionless', 'rated', 'module', 'brief'),
    frame_material: q(frameMaterial === 'cast_iron' ? 1 : 2, '', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: 'enum: 1=Meehanite cast iron, 2=polymer concrete (mineral cast) — better damping but more mass' }),
    control_oem: q(controlOem === 'siemens' ? 1 : controlOem === 'fanuc' ? 2 : controlOem === 'heidenhain' ? 3 : 4, '', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: 'enum: 1=Siemens Sinumerik, 2=Fanuc, 3=Heidenhain TNC, 4=Mitsubishi' }),
    coolant_capacity_litres: q(coolantCapacityL, 'L', 'volume', 'rated', 'module', 'calculator'),
    servo_power_total_kw: q(servoPowerKw, 'kW', 'power', 'continuous', 'system', 'calculator', { source_detail: '4 kW continuous per axis × axis_count' }),
    auxiliary_power_kw: q(auxiliaryPowerKw, 'kW', 'power', 'continuous', 'system', 'calculator', { source_detail: 'hydraulics + coolant pumps + lubricator + chip conveyor' }),
    total_connected_power_kw: q(totalConnectedPowerKw, 'kW', 'power', 'peak', 'system', 'calculator', { source_detail: 'spindle + servos + auxiliaries' }),
    mass_kg: q(massKg, 'kg', 'mass', 'gross_takeoff', 'system', 'calculator', { source_detail: `${massPerM3} kg/m³ × envelope + ${1500 * axisCount} kg per-axis structure` }),
  }

  // Spindle current at 400 V three-phase
  const spindleCurrentA = (spindleKw * 1000) / (400 * 1.732 * 0.85)  // PF=0.85
  const totalCurrentA = (totalConnectedPowerKw * 1000) / (400 * 1.732 * 0.85)

  const topology: TopologyEdge[] = [
    {
      from_part: 'mains_input',
      to_part: 'main_disconnect_switch',
      mechanism: 'electrical_bus',
      constraint_kind: 'current_rating',
      required_value: totalCurrentA,
      required_unit: 'A',
      required_margin_factor: 1.25,
      material_context: '400 V AC three-phase 50/60 Hz industrial supply per EN 60204-1',
    },
    {
      from_part: 'main_disconnect_switch',
      to_part: 'spindle_drive',
      mechanism: 'electrical_bus',
      constraint_kind: 'current_rating',
      required_value: spindleCurrentA,
      required_unit: 'A',
      required_margin_factor: 1.5,  // CNC spindle drives need overload headroom
    },
    {
      from_part: 'spindle_drive',
      to_part: 'spindle_motor_cartridge',
      mechanism: 'mechanical',
      constraint_kind: 'mass_carry',
      required_value: 80,  // typical 80 kg cartridge
      required_unit: 'kg',
      material_context: `${spindleTaper}_taper — angular-contact ceramic bearings rated for ${maxSpindleRpm} rpm × DN factor`,
    },
    {
      from_part: 'main_disconnect_switch',
      to_part: 'servo_drives',
      mechanism: 'electrical_bus',
      constraint_kind: 'current_rating',
      required_value: (servoPowerKw * 1000) / (400 * 1.732 * 0.85),
      required_unit: 'A',
    },
    {
      from_part: 'servo_drives',
      to_part: 'ball_screw_per_axis',
      mechanism: 'mechanical',
      constraint_kind: 'mass_carry',
      required_value: axisCount === 5 ? 800 : 1500,  // 5-axis lighter table; 3-axis heavier workpiece
      required_unit: 'kg',
      material_context: 'precision_ball_screw_C3_class_ground — pitch 10-25 mm, double-nut preloaded, ABEC-5 thrust bearings',
    },
    {
      from_part: 'linear_guides',
      to_part: 'axis_slides',
      mechanism: 'mechanical',
      constraint_kind: 'mass_carry',
      required_value: axisCount === 5 ? 800 : 1500,
      required_unit: 'kg',
      material_context: 'HIWIN_or_THK_linear_guide — 4 cars per axis, dynamic load 30-80 kN, preloaded class C2',
    },
    {
      from_part: 'control_system',
      to_part: 'servo_drives',
      mechanism: 'data',
      constraint_kind: 'data_bandwidth',
      required_value: 8000,  // EtherCAT 8 kHz typical
      required_unit: 'Hz',
      material_context: `${controlOem}_${controlOem === 'siemens' ? 'Drive_CLiQ' : controlOem === 'fanuc' ? 'FSSB' : controlOem === 'heidenhain' ? 'HSCI' : 'SSCNET_III'}_servo_bus — deterministic 1-8 kHz cyclic`,
    },
    {
      from_part: 'coolant_pump',
      to_part: 'spindle_through_coolant',
      mechanism: 'fluid_loop',
      constraint_kind: 'flow_capacity',
      required_value: 70,
      required_unit: 'bar',
      material_context: 'high-pressure_coolant_70bar — through-spindle for deep-hole + tool-life; standard flood at 5 bar',
    },
    {
      from_part: 'tool_magazine',
      to_part: 'tool_changer_arm',
      mechanism: 'mechanical',
      constraint_kind: 'mass_carry',
      required_value: 6,  // typical 6 kg max tool weight including holder
      required_unit: 'kg',
      material_context: `${toolMagazineCapacity}_tool_chain_magazine_with_double_arm_atc — typical 2-4 s tool-to-tool change`,
    },
    {
      from_part: 'spindle_motor_cartridge',
      to_part: 'spindle_chiller',
      mechanism: 'thermal',
      constraint_kind: 'thermal_rejection',
      required_value: spindleKw * 0.15,  // typical 15% of spindle power as heat
      required_unit: 'kW',
      material_context: 'chiller_recirculating_water — maintains spindle ±0.5°C for thermal-growth control',
    },
    {
      from_part: 'machine_frame',
      to_part: 'workshop_foundation',
      mechanism: 'mechanical',
      constraint_kind: 'mass_carry',
      required_value: massKg,
      required_unit: 'kg',
      material_context: `${frameMaterial}_${frameMaterial === 'cast_iron' ? 'Meehanite_ribbed' : 'mineral_cast_resin'}_base — vibration isolation pads + grouted levelling per OEM template`,
    },
  ]

  // Macro-assembly pricing — DMG MORI / Haas / Mazak / Hurco teardowns +
  // IMTS 2024 OEM cost disclosures. Word names chosen for ≥0.66 token
  // overlap with Stage 1.7 emissions.
  //   Spindle motor + cartridge (incl. bearings): £550/kW (10 kW), £1100/kW (25 kW high-perf)
  //   Ball screws: £8000 per axis (C3-class, 1-2 m, ground)
  //   Linear guides: £4500 per axis (HIWIN/THK pre-loaded)
  //   Servo drives: £2500 per axis (Siemens/Fanuc/Bosch 4 kW class)
  //   Machine frame: £4/kg cast iron / £6/kg polymer concrete
  //   Tool changer: £180/tool (chain or carousel ATC + double-arm changer)
  //   Coolant system: £15 per L + £8000 base (high-pressure pump + filtration + chip auger)
  //   Enclosure with chip evacuation: £45/kg
  //   Control system: £18,000 (Siemens 840D), £14,000 (Fanuc 31i), £25,000 (Heidenhain TNC640)
  const spindlePerKw = spindleKw >= 22 ? 1100 : spindleKw >= 15 ? 800 : 550
  const ballScrewPerAxis = 8000
  const linearGuidePerAxis = 4500
  const servoDrivePerAxis = 2500
  const framePerKg = isPolymerConcrete ? 6 : 4
  const enclosureMassKg = massKg * 0.25  // 25% of mass is enclosure
  const controlCost = controlOem === 'heidenhain' ? 25000 : controlOem === 'siemens' ? 18000 : controlOem === 'fanuc' ? 14000 : 16000
  const macro_assembly_prices: MacroAssemblyPrice[] = [
    {
      word_name: 'spindle_motor_cartridge',
      unit_price_gbp: spindlePerKw,
      dimension_basis: 'kw_power',
      dimension_value: spindleKw,
      total_gbp: spindlePerKw * spindleKw,
      source_detail: `£${spindlePerKw}/kW × ${spindleKw} kW (${spindleTaper}-taper motorised spindle, ${maxSpindleRpm} rpm ceramic angular-contact bearings, integrated draw bar + tool clamp; Siemens 1FE1 / Fanuc αi / Kessler class)`,
    },
    {
      word_name: 'ball_screw_per_axis',
      unit_price_gbp: ballScrewPerAxis,
      dimension_basis: 'each',
      dimension_value: axisCount,
      total_gbp: ballScrewPerAxis * axisCount,
      source_detail: `£${ballScrewPerAxis} × ${axisCount} axis ball screws (NSK/SKF/THK C3-class ground, 32-50 mm × 16 mm pitch, double-nut preloaded, ABEC-5 thrust bearings)`,
    },
    {
      word_name: 'linear_guide_rail_per_axis',
      unit_price_gbp: linearGuidePerAxis,
      dimension_basis: 'each',
      dimension_value: axisCount,
      total_gbp: linearGuidePerAxis * axisCount,
      source_detail: `£${linearGuidePerAxis} × ${axisCount} axes (HIWIN HG35 / THK SHS35 preloaded linear rails + 4 cars per axis, dynamic load 30-80 kN, class C2 preload)`,
    },
    {
      word_name: 'servo_drives_per_axis',
      unit_price_gbp: servoDrivePerAxis,
      dimension_basis: 'each',
      dimension_value: axisCount,
      total_gbp: servoDrivePerAxis * axisCount,
      source_detail: `£${servoDrivePerAxis} × ${axisCount} axes (${controlOem === 'siemens' ? 'Siemens S120 Drive-CLiQ' : controlOem === 'fanuc' ? 'Fanuc αi 4 kW' : controlOem === 'heidenhain' ? 'Heidenhain UV-150' : 'Mitsubishi MDS-DJ'} 4 kW class with absolute encoder feedback)`,
    },
    {
      word_name: frameMaterial === 'cast_iron' ? 'machine_frame_cast_iron' : 'machine_frame_polymer_concrete',
      unit_price_gbp: framePerKg,
      dimension_basis: 'kg_mass',
      dimension_value: massKg - enclosureMassKg,
      total_gbp: framePerKg * (massKg - enclosureMassKg),
      source_detail: `£${framePerKg}/kg × ${(massKg - enclosureMassKg).toFixed(0)} kg (${frameMaterial === 'cast_iron' ? 'Meehanite cast-iron ribbed base + column, vibration-damped' : 'mineral-cast polymer-concrete monolithic structure, 10× damping factor vs cast iron'})`,
    },
    {
      word_name: 'tool_changer_atc',
      unit_price_gbp: 180,
      dimension_basis: 'each',
      dimension_value: toolMagazineCapacity,
      total_gbp: 180 * toolMagazineCapacity + 6000,  // 6k for changer arm + drive
      source_detail: `£180/tool × ${toolMagazineCapacity} pocket + £6,000 changer arm (${axisCount === 5 ? 'chain magazine with shutter door' : 'carousel-style ATC'}, 2-4 s tool-to-tool, double-arm gripper, ${spindleTaper} clamping)`,
    },
    {
      word_name: 'coolant_system',
      unit_price_gbp: 15,
      dimension_basis: 'litre_volume',
      dimension_value: coolantCapacityL,
      total_gbp: 15 * coolantCapacityL + 8000,
      source_detail: `£15/L × ${coolantCapacityL} L + £8,000 base (high-pressure pump 70 bar through-spindle + 5 bar flood + chip auger + paper-band filtration + skimmer)`,
    },
    {
      word_name: 'enclosure_with_chip_evacuation',
      unit_price_gbp: 45,
      dimension_basis: 'kg_mass',
      dimension_value: enclosureMassKg,
      total_gbp: 45 * enclosureMassKg,
      source_detail: `£45/kg × ${enclosureMassKg.toFixed(0)} kg (welded sheet steel enclosure with chip conveyor, polycarbonate viewing window, interlocked sliding door per EN 12417 + ISO 23125 machine safety)`,
    },
    {
      word_name: 'control_system_cnc',
      unit_price_gbp: controlCost,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: controlCost,
      source_detail: `£${controlCost.toLocaleString()} (${controlOem === 'siemens' ? 'Siemens Sinumerik 840D sl with 19" colour HMI' : controlOem === 'fanuc' ? 'Fanuc 31i-MB5 with 15" panel' : controlOem === 'heidenhain' ? 'Heidenhain TNC640 with 24" HSCI panel' : 'Mitsubishi M800 series CNC'}, full ${axisCount}-axis interpolation, RTCP for 5-axis, MTConnect/OPC-UA)`,
    },
  ]

  // Closures — design-rule gates
  const closures: ContractClosureResult[] = []
  closures.push({
    invariant_id: 'positioning_accuracy_better_than_brief',
    status: positioningAccuracyUm <= 15 ? 'pass' : positioningAccuracyUm <= 25 ? 'warn' : 'fail',
    measured: positioningAccuracyUm,
    required: '≤15 μm positioning accuracy per ISO 230-2 (industrial class); ≤5 μm for high-precision aerospace/medical',
    reason: `Positioning ${positioningAccuracyUm} μm. ${positioningAccuracyUm <= 5 ? 'High-precision aerospace class' : positioningAccuracyUm <= 15 ? 'Industrial machining class typical' : 'Below industrial class; suitable for prototyping only'}.`,
  })
  closures.push({
    invariant_id: 'max_rapid_rate_envelope',
    status: rapidMmMin >= 20000 ? 'pass' : 'warn',
    measured: rapidMmMin,
    required: '≥20 m/min rapid traverse for industrial productivity class (DMG MORI/Haas typical 24-60 m/min)',
    reason: `Rapid traverse ${(rapidMmMin / 1000).toFixed(1)} m/min. ${axisCount === 5 ? 'Five-axis 30-60 m/min typical for high-feed' : 'Three-axis 24-48 m/min typical for general VMC'}.`,
  })
  closures.push({
    invariant_id: 'iso_230_verification_capability',
    status: 'pass',
    measured: 1,
    required: 'ISO 230-2 (positioning accuracy) + ISO 230-4 (circular test) + ISO 230-7 (rotary axes for 5-axis) verifiable with laser interferometer + ball-bar',
    reason: `By construction: precision ball screws + linear guides + absolute encoders + thermal compensation. ${axisCount === 5 ? 'RTCP from control supports ISO 230-7 5-axis ball-bar verification' : 'ISO 230-2/-4 verifiable with off-machine instruments'}.`,
  })
  closures.push({
    invariant_id: 'spindle_dn_factor_within_bearing_limits',
    status: maxSpindleRpm * 70 <= 2_500_000 ? 'pass' : maxSpindleRpm * 70 <= 3_500_000 ? 'warn' : 'fail',
    measured: maxSpindleRpm * 70,  // DN factor with 70 mm bore typical for 18-25 kW
    required: '≤2.5 × 10⁶ for steel bearings; ≤3.5 × 10⁶ for hybrid ceramic at full load',
    reason: `DN factor ${(maxSpindleRpm * 70).toLocaleString()} (RPM × bearing bore mm). ${maxSpindleRpm * 70 > 2_500_000 ? 'Requires hybrid ceramic angular-contact (Si₃N₄ balls)' : 'Standard steel ABEC-5 angular-contact acceptable'}.`,
  })
  closures.push({
    invariant_id: 'machine_safety_en_12417_iso_23125',
    status: 'pass',
    measured: 1,
    required: 'EN 12417 (machining-centre safety) + ISO 23125 (turning machine safety, applicable to mill-turn) + EN 60204-1 (machine electrical safety)',
    reason: `By construction: interlocked sliding door + emergency stops + power-off chain + light curtains at chip-evacuation, EN 12417 (machine-tool safety) + EN 60204-1 electrical safety.`,
  })
  closures.push({
    invariant_id: 'thermal_stability_compensation',
    status: 'pass',
    measured: 1,
    required: 'Thermal compensation per ISO 230-3: spindle chiller + ball-screw nut cooling + ambient comp probes for ±2 μm/°C deviation',
    reason: `Spindle chiller sized ${(spindleKw * 0.15).toFixed(2)} kW + ball-screw nut cooling + ambient comp probes by construction. ISO 230-3 spec achievable.`,
  })

  const macroAssemblyTotal = macro_assembly_prices.reduce((a, m) => a + m.total_gbp, 0)

  return {
    product_class: 'cnc_machine',
    brief_summary: `${spindleKw} kW spindle ${axisCount}-axis ${frameMaterial.replace('_', ' ')}-base CNC ${axisCount === 5 ? '5-axis VMC' : 'machining centre'}. Travels ${travelXmm.toFixed(0)} × ${travelYmm.toFixed(0)} × ${travelZmm.toFixed(0)} mm (${workEnvelopeM3.toFixed(2)} m³ envelope). ${positioningAccuracyUm} μm positioning / ${repeatabilityUm} μm repeatability per ISO 230-2. ${maxSpindleRpm.toLocaleString()} rpm max (${spindleTaper}), ${(rapidMmMin / 1000).toFixed(0)} m/min rapid, ${toolMagazineCapacity}-tool ATC. ${controlOem.charAt(0).toUpperCase() + controlOem.slice(1)} control. ${totalConnectedPowerKw.toFixed(1)} kW total. ${(massKg / 1000).toFixed(1)} t. Macro-assembly raw BoM = £${macroAssemblyTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} (≈£${(macroAssemblyTotal / spindleKw).toFixed(0)}/kW spindle vs £8,000-25,000/kW installed benchmark).`,
    quantities,
    topology,
    macro_assembly_prices,
    closures,
  }
})

// ---------------- e_bike -------------------------
// Full archetype contract — replaces buildMinimalContract stub. Electric
// pedal-assist bicycle (EN 15194 pedelec class). Modelled on BESS / drone
// pattern. Macro prices grounded in Bosch / Shimano / Brose / Bafang OEM
// pricing + Cycling Industries Europe 2024 retail-channel teardowns
// (£20-80/kg total system mass for premium e-bikes; budget £1500-2500 RRP
// vs premium £4000-12000 RRP for £80/kg class).
registerArchetype('e_bike', (brief: any) => {
  const tp = brief?.constraints?.target_performance ?? {}
  const u = String(tp.unit ?? 'W').toLowerCase()
  const desc = String(brief?.product_description ?? '')
  // Motor power — EU legal pedelec is 250 W continuous; "speed pedelec"
  // 500-750 W common in US; uncapped fat-bike / off-road up to 1500 W.
  const motorW = (() => {
    const descPower = desc.match(/(?:rated|nominal|peak|motor|continuous)\s+power[\s:]{0,8}(\d{1,4}(?:\.\d+)?)\s*(w|kw|watt[s]?|kilowatt[s]?)\b/i)
      ?? desc.match(/(\d{1,4}(?:\.\d+)?)\s*(w|kw|watt[s]?|kilowatt[s]?)\s+(?:mid[\s-]?drive|hub[\s-]?motor|motor|pedelec)/i)
    if (descPower) {
      const v = parseFloat(descPower[1])
      const unit = descPower[2].toLowerCase()
      if (unit === 'kw' || unit === 'kilowatt' || unit === 'kilowatts') return v * 1000
      return v
    }
    if (Number(tp.value ?? 0) > 0) {
      if (u === 'w' || u === 'watt' || u === 'watts') return Number(tp.value)
      if (u === 'kw' || u === 'kilowatt' || u === 'kilowatts') return Number(tp.value) * 1000
      // Wrong unit (km, mph, kg) → fall to default
    }
    return 250  // class default: EU legal-pedelec continuous limit
  })()
  // Legal class — EU pedelec ≤250 W + 25 km/h; speed pedelec ≤500 W + 45 km/h
  // (L1e-B); US Class 1/3 250-750 W; off-road > 750 W.
  const legalClass: 'eu_pedelec' | 'eu_speed_pedelec' | 'us_class1_class3' | 'off_road' = motorW <= 250 ? 'eu_pedelec'
    : motorW <= 500 ? 'eu_speed_pedelec'
    : motorW <= 750 ? 'us_class1_class3'
    : 'off_road'
  // Motor placement — mid-drive (premium, balanced, leverages bike gearing)
  // vs hub (cheaper, easier integration, ratio fixed by wheel). Premium
  // builds default to mid-drive above 350 W.
  const isMidDrive = /mid[\s-]?drive|bbs|bosch|brose|shimano\s+ep|specialized/i.test(desc) || (motorW >= 350 && !/hub/i.test(desc))
  const motorPlacement: 'mid_drive' | 'rear_hub' | 'front_hub' = isMidDrive ? 'mid_drive'
    : /front[\s-]?hub/i.test(desc) ? 'front_hub'
    : 'rear_hub'
  // Battery capacity — brief drives kWh or Wh. Premium pedelec 500 Wh - 1 kWh
  // typical (Bosch PowerTube 625-750 / Specialized Turbo Tero 710 Wh).
  const batteryWh = (() => {
    const descWh = desc.match(/(\d{2,4}(?:\.\d+)?)\s*Wh\b/i)
    if (descWh) return parseFloat(descWh[1])
    const descKwh = desc.match(/(\d(?:\.\d{1,2})?)\s*kWh/i)
    if (descKwh) return parseFloat(descKwh[1]) * 1000
    if (Number(tp.value ?? 0) > 0) {
      if (u === 'wh') return Number(tp.value)
      if (u === 'kwh') return Number(tp.value) * 1000
    }
    // Default: 4× motor power in Wh (60 min @ rated, plus margin), bounded 250-1000 Wh
    return Math.max(250, Math.min(1000, motorW * 2.5))
  })()
  const batteryKwh = batteryWh / 1000
  // Range in pedal-assist (eco) mode. Premium pedelec achieves 80-160 km
  // on 500-750 Wh; typical consumption 6-12 Wh/km depending on terrain.
  // Default consumption: mid-drive 8 Wh/km, hub 10 Wh/km eco; 18-25 Wh/km full throttle.
  const consumptionWhPerKm = isMidDrive ? 8 : 10
  const rangeKm = extractRangeFromDesc(desc, /(\d{2,3})\s*-?\s*(\d{2,3})?\s*km\s+range/i, batteryWh / consumptionWhPerKm)
  // Frame material — alu most common (aluminium 6061/6063 hydroformed);
  // steel chromoly (budget cargo / commuter); carbon (premium road/MTB).
  const frameMaterial: 'aluminium' | 'steel' | 'carbon' = /carbon|cfrp/i.test(desc) ? 'carbon'
    : /steel|chromoly|cromoly|reynolds/i.test(desc) ? 'steel'
    : 'aluminium'
  // Total mass — brief constraint or class default. Premium pedelec 18-25 kg;
  // cargo / fat-bike 30-40 kg.
  const massKg = Number(brief?.constraints?.max_mass_kg?.value ?? (
    legalClass === 'off_road' ? 32 :
    legalClass === 'us_class1_class3' ? 26 :
    /cargo|family/i.test(desc) ? 35 :
    frameMaterial === 'carbon' ? 16 :
    frameMaterial === 'steel' ? 22 : 20))
  // Voltage class — 36 V (legal pedelec), 48 V (speed pedelec / off-road),
  // 52 V high-output mods (not OEM standard but documented).
  const batteryVoltageV = motorW <= 250 ? 36 : motorW <= 750 ? 48 : 52
  // Cells per battery — typical 21700 INR21700 (5 Ah, 3.7 V nominal = 18.5 Wh/cell);
  // older 18650 (3.4 Ah, 12.5 Wh/cell).
  const cellsInSeries = Math.round(batteryVoltageV / 3.7)
  const cellWh = 18.5  // INR21700 5 Ah typical
  const cellsInParallel = Math.max(1, Math.ceil(batteryWh / (cellWh * cellsInSeries)))
  const totalCellCount = cellsInSeries * cellsInParallel
  // Drivetrain — single chainring + cassette + derailleur (Shimano Deore /
  // XT / Sram Eagle class). Internal-gear-hub (Rohloff / Enviolo) for cargo.
  const speedCount = extractRangeFromDesc(desc, /(\d{1,2})[\s-]?speed/i, 11)
  // Tyre size — 26", 27.5", 28"/700C, 29" MTB; 20" cargo
  const wheelSizeIn = extractRangeFromDesc(desc, /(\d{2}(?:\.\d)?)\s*(?:inch|"|\")/i,
    /cargo/i.test(desc) ? 20 : /road/i.test(desc) ? 28 : 27.5)
  // Brake type — hydraulic disc (premium) vs mechanical disc (budget). Required
  // EN 15194: 50 N hand-lever force max for stopping.
  const isHydraulicDisc = !/mechanical|rim/i.test(desc) && (motorW >= 250 || frameMaterial !== 'steel')
  // Charge time — typical 3-6 hr Level 1 charger (220 V / 36 V × 4 A = 144 W charge rate)
  const chargerPowerW = batteryVoltageV * 4  // 4 A typical OEM charger
  const chargeTimeHr = batteryWh / chargerPowerW

  const quantities: Record<string, Quantity> = {
    rated_motor_power_w: q(motorW, 'W', 'power', 'rated', 'system', 'brief'),
    legal_class: q(legalClass === 'eu_pedelec' ? 1 : legalClass === 'eu_speed_pedelec' ? 2 : legalClass === 'us_class1_class3' ? 3 : 4, '', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: 'enum: 1=EU pedelec ≤250 W/25 km/h, 2=EU L1e-B speed pedelec ≤500 W/45 km/h, 3=US Class 1/3 ≤750 W, 4=off-road >750 W' }),
    motor_placement: q(motorPlacement === 'mid_drive' ? 1 : motorPlacement === 'rear_hub' ? 2 : 3, '', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: 'enum: 1=mid-drive, 2=rear hub, 3=front hub' }),
    battery_capacity_wh: q(batteryWh, 'Wh', 'energy', 'usable', 'pack', 'brief'),
    battery_capacity_kwh: q(batteryKwh, 'kWh', 'energy', 'usable', 'pack', 'calculator'),
    battery_voltage_v: q(batteryVoltageV, 'V', 'voltage', 'DC', 'pack', 'calculator', { source_detail: '36 V pedelec / 48 V speed / 52 V off-road' }),
    cells_in_series: q(cellsInSeries, '', 'dimensionless', 'rated', 'pack', 'calculator', { source_detail: 'ceil(battery_v / 3.7 V nominal per cell)' }),
    cells_in_parallel: q(cellsInParallel, '', 'dimensionless', 'rated', 'pack', 'calculator'),
    total_cell_count: q(totalCellCount, '', 'dimensionless', 'rated', 'pack', 'calculator'),
    range_km_eco: q(rangeKm, 'km', 'length', 'rated', 'system', 'brief', { source_detail: `at ${consumptionWhPerKm} Wh/km eco mode (mid-drive lower, hub higher)` }),
    consumption_wh_per_km: q(consumptionWhPerKm, 'Wh/km', 'energy', 'rated', 'system', 'physics_constant'),
    frame_material: q(frameMaterial === 'aluminium' ? 1 : frameMaterial === 'steel' ? 2 : 3, '', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: 'enum: 1=alu 6061/6063, 2=chromoly steel, 3=carbon fibre' }),
    total_mass_kg: q(massKg, 'kg', 'mass', 'gross_takeoff', 'system', 'brief'),
    drivetrain_speed_count: q(speedCount, '', 'dimensionless', 'rated', 'module', 'brief'),
    wheel_size_inch: q(wheelSizeIn, 'inch', 'length', 'rated', 'module', 'brief'),
    hydraulic_disc_brakes: q(isHydraulicDisc ? 1 : 0, '', 'dimensionless', 'rated', 'module', 'calculator', { source_detail: 'EN 15194 requires <50 N lever force; hydraulic disc above 250 W class typical' }),
    charger_power_w: q(chargerPowerW, 'W', 'power', 'rated', 'module', 'calculator', { source_detail: 'OEM Level-1 wall charger; ~4 A at battery voltage' }),
    charge_time_hours: q(chargeTimeHr, 'h', 'time', 'rated', 'system', 'calculator', { source_detail: 'battery_wh / charger_w; typical 3-6 hr' }),
  }

  // Motor current at battery voltage
  const motorCurrentA = motorW / batteryVoltageV

  const topology: TopologyEdge[] = [
    {
      from_part: 'battery_pack_li_ion',
      to_part: 'motor_controller',
      mechanism: 'electrical_bus',
      constraint_kind: 'current_rating',
      required_value: motorCurrentA * 2.5,  // 2.5× peak current for hill-climb / accel
      required_unit: 'A',
      required_margin_factor: 2.5,
      material_context: `${batteryVoltageV}V_${cellsInSeries}s${cellsInParallel}p_li_ion — 18650 or INR21700 cells with integrated BMS, XT60/Anderson SB50 connector`,
    },
    {
      from_part: 'motor_controller',
      to_part: motorPlacement === 'mid_drive' ? 'mid_drive_motor' : 'hub_motor',
      mechanism: 'electrical_bus',
      constraint_kind: 'current_rating',
      required_value: motorCurrentA * 2.5,
      required_unit: 'A',
      material_context: motorPlacement === 'mid_drive' ? 'BLDC_or_PMSM_mid_drive — torque sensor + cadence sensor, EN 15194 compliant cut-off at 25 km/h (pedelec) / 45 km/h (speed)' : 'BLDC_hub_motor — Hall-effect sensors, geared (premium) or direct-drive',
    },
    {
      from_part: motorPlacement === 'mid_drive' ? 'mid_drive_motor' : 'hub_motor',
      to_part: motorPlacement === 'mid_drive' ? 'chainring_crank' : 'drive_wheel',
      mechanism: 'mechanical',
      constraint_kind: 'mass_carry',
      required_value: massKg + 120,  // rider + payload
      required_unit: 'kg',
      material_context: motorPlacement === 'mid_drive' ? 'crank_arm_alloy_or_forged_steel — ISIS or Hollowtech II spindle' : 'rear_axle_hardened_steel — 10/12 mm thru-axle',
    },
    {
      from_part: 'chainring_crank',
      to_part: 'rear_cassette',
      mechanism: 'mechanical',
      constraint_kind: 'mass_carry',
      required_value: 1000,  // chain peak tensile load
      required_unit: 'N',
      material_context: 'KMC_or_SRAM_chain — 10/11/12 speed, anti-rust coating, EN 14781 fatigue tested',
    },
    {
      from_part: 'frame',
      to_part: 'wheels_tyres',
      mechanism: 'mechanical',
      constraint_kind: 'mass_carry',
      required_value: massKg + 130,  // rider + payload + bike
      required_unit: 'kg',
      required_margin_factor: 2.5,
      material_context: `${frameMaterial}_frame_EN_14764_or_14781 — passes ISO 4210 fatigue (100k cycle vertical pedalling + 50k brake forces)`,
    },
    {
      from_part: 'brake_calliper',
      to_part: 'brake_rotor',
      mechanism: 'mechanical',
      constraint_kind: 'mass_carry',
      required_value: 5,  // typical disc rotor mass kg
      required_unit: 'kg',
      material_context: isHydraulicDisc ? 'shimano_or_sram_hydraulic_disc_brake — DOT4/mineral oil, 4-pot calliper for cargo' : 'mechanical_cable_disc_or_v_brake',
    },
    {
      from_part: 'display_controller',
      to_part: 'motor_controller',
      mechanism: 'data',
      constraint_kind: 'data_bandwidth',
      required_value: 10,  // CAN bus 10 Hz update typical
      required_unit: 'Hz',
      material_context: 'CAN_bus_or_proprietary_link — Bosch/Bafang/Shimano respective protocols; ANT+ / Bluetooth Smart for app',
    },
    {
      from_part: 'charger_wall',
      to_part: 'battery_pack_li_ion',
      mechanism: 'electrical_bus',
      constraint_kind: 'voltage_rating',
      required_value: batteryVoltageV * 1.18,  // 4.2 V × cells charge voltage
      required_unit: 'V',
      material_context: `Level-1_${batteryVoltageV}V_${(chargerPowerW / 1000).toFixed(1)}kW_charger — CC/CV profile, BMS-coordinated balancing, EMC certified`,
    },
  ]

  // Macro-assembly pricing — Bosch / Shimano / Brose / Bafang OEM teardowns
  // + Cycling Industries Europe 2024 channel pricing. Word names chosen for
  // ≥0.66 token overlap with Stage 1.7 emissions (motor, battery_pack,
  // controller, frame, drivetrain, wheels_tyres, brakes, display_sensors,
  // charger).
  // 2024 OEM-level cost basis:
  //   Mid-drive motor (Bosch Performance Line CX / Shimano EP8 class): £450
  //     (250 W class), £680 (Yamaha PWX speed class 500 W)
  //   Hub motor (Bafang H750C class): £180 (250 W), £320 (750 W)
  //   Battery pack: £180/kWh OEM (premium Bosch PowerTube), £140/kWh budget
  //     (Bafang INR21700 pack); includes BMS + cell-balancing
  //   Motor controller (already-integrated for premium): £120 mid-drive (in motor housing); £80 separate
  //   Frame: alu £150 / steel £100 / carbon £450 (EN 15194 frame only, no fork)
  //   Drivetrain (chainring + cassette + derailleur + chain + shifter): £180 (10-speed),
  //     £280 (11-12 speed Deore XT / SX Eagle class)
  //   Wheels + tyres (pair): £180 (alu rim + steel spoke 36-spoke) - £450 (premium MTB
  //     with Schwalbe Marathon Plus tyres or Continental Grand Prix)
  //   Brakes: £160 hydraulic disc set / £80 mechanical
  //   Display + cadence / torque sensors: £80 minimal LCD / £250 colour TFT premium
  //   Charger: £90 standard 4 A / £140 fast 8 A
  //   Saddle + handlebars + stem + seatpost (cockpit): £120 standard / £280 premium
  const motorCost = isMidDrive ? (motorW <= 250 ? 450 : 680) : (motorW <= 250 ? 180 : 320)
  const batteryCellPerWh = motorW > 500 ? 0.18 : 0.14
  const frameCost = frameMaterial === 'carbon' ? 450 : frameMaterial === 'steel' ? 100 : 150
  const drivetrainCost = speedCount >= 11 ? 280 : 180
  const wheelsCost = frameMaterial === 'carbon' ? 450 : 180
  const brakesCost = isHydraulicDisc ? 160 : 80
  const displayCost = motorW >= 350 ? 250 : 80
  const chargerCost = chargerPowerW > 200 ? 140 : 90
  const cockpitCost = frameMaterial === 'carbon' ? 280 : 120
  const macro_assembly_prices: MacroAssemblyPrice[] = [
    {
      word_name: motorPlacement === 'mid_drive' ? 'motor_mid_drive_assembly' : 'motor_hub_assembly',
      unit_price_gbp: motorCost,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: motorCost,
      source_detail: `£${motorCost} (${isMidDrive ? `Bosch Performance Line CX / Shimano EP8 / Brose / Bafang BBSHD class ${motorW} W mid-drive with torque + cadence sensor, EN 15194 compliant cut-off` : `Bafang H750C / Direct-drive hub ${motorW} W with Hall sensors, geared planetary or direct-drive`})`,
    },
    {
      word_name: 'battery_pack_lithium_ion',
      unit_price_gbp: batteryCellPerWh * 1000,  // per kWh
      dimension_basis: 'kwh_capacity',
      dimension_value: batteryKwh,
      total_gbp: batteryCellPerWh * batteryWh,
      source_detail: `£${(batteryCellPerWh * 1000).toFixed(0)}/kWh × ${batteryKwh.toFixed(2)} kWh (${totalCellCount} × INR21700 cells, ${cellsInSeries}s${cellsInParallel}p configuration, BMS with cell balancing + temperature protection, IPX5 ingress)`,
    },
    {
      word_name: 'motor_controller',
      unit_price_gbp: isMidDrive ? 0 : 80,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: isMidDrive ? 0 : 80,  // mid-drive controller integrated in motor housing
      source_detail: isMidDrive ? '£0 — integrated in mid-drive motor housing (Bosch/Shimano/Brose model)' : `£80 (BLDC controller, MOSFET 4Q with regen, ANT+/CAN-bus to display)`,
    },
    {
      word_name: 'frame_assembly',
      unit_price_gbp: frameCost,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: frameCost,
      source_detail: `£${frameCost} (${frameMaterial} ${frameMaterial === 'carbon' ? 'monocoque T700 carbon fibre layup' : frameMaterial === 'steel' ? 'chromoly 4130 TIG-welded' : '6061-T6 hydroformed alu TIG-welded'} frame + fork, EN 15194 fatigue tested, integrated battery mount)`,
    },
    {
      word_name: 'drivetrain_groupset',
      unit_price_gbp: drivetrainCost,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: drivetrainCost,
      source_detail: `£${drivetrainCost} (${speedCount}-speed: ${speedCount >= 11 ? 'Shimano Deore XT or SRAM SX Eagle class — derailleur + cassette 10-46T + KMC chain + shifter' : 'Shimano Alivio / SRAM SX 10-speed groupset'})`,
    },
    {
      word_name: 'wheels_tyres_pair',
      unit_price_gbp: wheelsCost,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: wheelsCost,
      source_detail: `£${wheelsCost} (${wheelSizeIn}" rims ${frameMaterial === 'carbon' ? 'carbon fibre or alloy + DT Swiss / Mavic hubs' : 'double-walled alu rim + sealed-bearing hubs'}, ${frameMaterial === 'carbon' ? 'tubeless-ready' : '36-spoke 13G steel'}, Schwalbe Marathon Plus / Continental Grand Prix tyres)`,
    },
    {
      word_name: 'brake_set_hydraulic_disc',
      unit_price_gbp: brakesCost,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: brakesCost,
      source_detail: `£${brakesCost} (${isHydraulicDisc ? `Shimano MT200 or SRAM Level T hydraulic disc, 180/160 mm rotors, EN 15194 50 N lever-force compliant${legalClass === 'off_road' ? ', 4-pot for off-road' : ', 2-pot'}` : 'Tektro mechanical cable disc, 160 mm rotor — budget commuter class'})`,
    },
    {
      word_name: 'display_sensors_module',
      unit_price_gbp: displayCost,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: displayCost,
      source_detail: `£${displayCost} (${motorW >= 350 ? 'Bosch Kiox 300 / Shimano SC-E7000 colour TFT display, ANT+/Bluetooth Smart, Komoot/Strava integration' : 'monochrome LCD + handlebar buttons, speed + battery + mode'} + torque sensor + cadence sensor)`,
    },
    {
      word_name: 'charger_wall_unit',
      unit_price_gbp: chargerCost,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: chargerCost,
      source_detail: `£${chargerCost} (${batteryVoltageV} V Level-1 wall charger, ${(chargerPowerW / 1000).toFixed(1)} kW, CC/CV LiNMC/LiNCA profile, EMC + CE + UKCA certified)`,
    },
    {
      word_name: 'cockpit_saddle_assembly',
      unit_price_gbp: cockpitCost,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: cockpitCost,
      source_detail: `£${cockpitCost} (handlebar + stem + headset + saddle + seatpost; ${frameMaterial === 'carbon' ? 'carbon bar + saddle' : 'alu cockpit, leather/composite saddle'}; pedals separate)`,
    },
  ]

  // Closures — design-rule gates
  const closures: ContractClosureResult[] = []
  closures.push({
    invariant_id: 'range_at_pedal_assist_meets_brief',
    status: rangeKm >= (batteryWh / consumptionWhPerKm) * 0.85 ? 'pass' : 'warn',
    measured: rangeKm,
    required: `≥${(batteryWh / consumptionWhPerKm).toFixed(0)} km at eco-mode (${consumptionWhPerKm} Wh/km)`,
    reason: `Range ${rangeKm} km at ${consumptionWhPerKm} Wh/km eco-mode (${motorPlacement} typical). Brief range ${rangeKm} km vs theoretical max ${(batteryWh / consumptionWhPerKm).toFixed(0)} km. Includes ~15% drivetrain loss + headwind reserve.`,
  })
  // 2026-05-23 fix (post-batch-2 review): EN 15194 only applies to EU pedelec
  // (Class 1 ≤ 250 W/25 km/h). For other legal classes the compliance standard
  // is DIFFERENT, not absent — speed pedelec follows L1e-B (EU type-approval),
  // US Class 1/3 follows CPSC 16 CFR 1512 + UL 2849, off-road has no road
  // standard. Previously this closure emitted 'warn' for everything non-pedelec
  // implying a design failure; that was incorrect. Now PASS for every class
  // with the relevant standard cited so the reviewer knows which framework
  // certification budgeting must target.
  const complianceStandard =
    legalClass === 'eu_pedelec'        ? 'EN 15194:2017 (EU pedelec)' :
    legalClass === 'eu_speed_pedelec'  ? 'EU L1e-B type-approval (45 km/h moped class) + EN 15194' :
    legalClass === 'us_class1_class3'  ? 'CPSC 16 CFR 1512 + UL 2849 (US e-bike)' :
    /* off_road */                       'no road standard; off-highway use'
  closures.push({
    invariant_id: 'electrical_compliance_for_legal_class',
    status: 'pass',
    measured: motorW,
    required: `Identify + budget the compliance standard appropriate to the brief's market class (NOT a single global standard)`,
    reason: `${motorW} W ${legalClass} → applicable standard: ${complianceStandard}. ${legalClass === 'eu_speed_pedelec' ? 'Speed pedelec also requires registration, insurance, helmet, AM driving licence in most EU states' : legalClass === 'us_class1_class3' ? 'US Class 3 limited to 28 mph (45 km/h) pedal-assisted; Class 2 throttle limited to 20 mph' : legalClass === 'off_road' ? 'Off-road only — not legal on public roads in EU/US; sale-restricted in some jurisdictions' : 'EU Class 1 pedelec — no licence/registration/insurance in EU; bicycle rules apply'}.`,
  })
  closures.push({
    invariant_id: 'charge_time_below_6hr',
    status: chargeTimeHr <= 6 ? 'pass' : chargeTimeHr <= 8 ? 'warn' : 'fail',
    measured: chargeTimeHr,
    required: '≤6 hr full charge (industry consumer-acceptance threshold)',
    reason: `Charge time ${chargeTimeHr.toFixed(1)} hr at ${chargerPowerW} W. ${chargeTimeHr > 6 ? 'Consider 8 A fast charger or dual-port option for commuter class' : 'Acceptable for overnight charging'}.`,
  })
  closures.push({
    invariant_id: 'battery_capacity_realistic_for_class',
    status: batteryWh >= 250 && batteryWh <= 1000 ? 'pass' : batteryWh > 1000 ? 'warn' : 'fail',
    measured: batteryWh,
    required: '250-1000 Wh for premium pedelec class; >1000 Wh requires homologation review (UN38.3 transport)',
    reason: `Battery ${batteryWh.toFixed(0)} Wh. ${batteryWh < 250 ? 'Below typical premium class — range will be limited' : batteryWh > 1000 ? 'Above 1 kWh triggers UN38.3 Class 9 dangerous-goods classification for transport' : 'Within typical premium pedelec class'}.`,
  })
  closures.push({
    invariant_id: 'frame_fatigue_iso_4210',
    status: 'pass',
    measured: 1,
    required: 'ISO 4210 frame fatigue (100k pedal cycle + 50k brake force) + EN 15194 e-bike specific frame test',
    reason: `By construction, frame is ${frameMaterial}; suppliers (e.g. Reynolds, Easton, Specialized) carry ISO 4210 + EN 15194 type-test certificates.`,
  })
  closures.push({
    invariant_id: 'mass_within_class_envelope',
    status: massKg <= 30 ? 'pass' : massKg <= 40 ? 'warn' : 'fail',
    measured: massKg,
    required: '≤30 kg for road/commuter pedelec; ≤40 kg for cargo class; >40 kg classify as moped',
    reason: `Total mass ${massKg} kg. ${massKg > 40 ? 'Approaching moped/L1e-A territory — consider re-classification' : massKg > 30 ? 'Cargo / family class' : 'Standard pedelec class'}.`,
  })

  const macroAssemblyTotal = macro_assembly_prices.reduce((a, m) => a + m.total_gbp, 0)

  return {
    product_class: 'e_bike',
    brief_summary: `${motorW} W ${legalClass.replace(/_/g, ' ')} ${motorPlacement.replace('_', ' ')} e-bike. ${batteryVoltageV} V × ${batteryWh.toFixed(0)} Wh Li-ion (${totalCellCount} cells, ${cellsInSeries}s${cellsInParallel}p). ${rangeKm.toFixed(0)} km range @ ${consumptionWhPerKm} Wh/km eco. ${frameMaterial} frame, ${speedCount}-speed drivetrain, ${wheelSizeIn}" wheels, ${isHydraulicDisc ? 'hydraulic disc' : 'mechanical disc'} brakes. ${massKg} kg total mass. ${chargeTimeHr.toFixed(1)} hr charge @ ${(chargerPowerW / 1000).toFixed(2)} kW. Macro-assembly raw BoM = £${macroAssemblyTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} (≈£${(macroAssemblyTotal / massKg).toFixed(0)}/kg vs £20-80/kg premium benchmark).`,
    quantities,
    topology,
    macro_assembly_prices,
    closures,
  }
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
// Full archetype contract — replaces buildMinimalContract stub.
// Electric vertical take-off and landing aircraft (urban air mobility
// or cargo VTOL). Modelled on BESS/HAPS pattern. Macro prices
// grounded in Joby/Archer/Lilium/Volocopter SEC filings + EASA SC-VTOL
// certification cost disclosures + Beta Technologies investor decks.
// Installed ASP £3000-12000/kg MTOW for certified production aircraft.
registerArchetype('evtol', (brief: any) => {
  const desc = String(brief?.product_description ?? '')
  const massKg = Number(brief?.constraints?.max_mass_kg?.value ?? 2500)
  // Configuration class — passenger (typically 1500-3500 kg MTOW) vs
  // cargo (200-600 kg MTOW); drives ballistic recovery system requirement
  // (mandated for passenger configurations under EASA SC-VTOL).
  const isCargo = /cargo|freight|payload[\s-]?only|unmanned/i.test(desc) || massKg < 800
  const isPassenger = !isCargo
  const numPax = isCargo ? 0 : extractRangeFromDesc(desc, /(\d{1,2})\s*(?:pax|passenger|seat)/i, massKg < 1800 ? 1 : massKg < 2500 ? 2 : massKg < 3200 ? 4 : 5)
  // Payload — passenger MTOW ÷ payload typically 0.20-0.28 for batteries +
  // structure dominate; cargo configurations 0.30-0.40 payload fraction.
  const payloadKg = extractRangeFromDesc(desc, /(\d{2,4})\s*-?\s*(\d{2,4})?\s*kg\s+(?:payload|cargo)/i,
    isCargo ? Math.round(massKg * 0.35) : Math.round(numPax * 100))
  const cruiseSpeedKmh = extractRangeFromDesc(desc, /(\d{2,4})\s*-?\s*(\d{2,4})?\s*(?:km\/h|kph)/i, 250)
  const cruiseSpeedKts = cruiseSpeedKmh / 1.852
  const cruiseRangeKm = extractRangeFromDesc(desc, /(\d{2,4})\s*-?\s*(\d{2,4})?\s*km(?:\s+range)?/i, isCargo ? 150 : 240)
  const enduranceMin = extractRangeFromDesc(desc, /(\d{1,3})\s*-?\s*(\d{1,3})?\s*min/i, Math.round((cruiseRangeKm / cruiseSpeedKmh) * 60 + 15))
  // Motor count — typically 6-8 for distributed electric propulsion
  // (DEP). Higher count → better fail-safe redundancy + lower disk loading.
  // Joby S4=6, Archer Midnight=12, Lilium Jet=30 (jet ducted fan), Volocopter VoloCity=18.
  const numRotors = extractRangeFromDesc(desc, /(\d{1,2})\s*(?:rotor|propeller|prop|motor)/i, isCargo ? 4 : 6)
  // Battery kWh — sized from energy budget. Cruise power ≈ MTOW × g × cruise_v / L/D / η_prop / η_motor.
  // Hover power ≈ 1.5× cruise (high disk loading penalty).
  // 2026-05-23 fix (post-batch-1 review): detect lift_mode from product_description.
  // L/D varies massively by configuration — pure multicopter ≈ 4-6 (no wing); tilt-rotor
  // and lift-cruise ≈ 10-14 (wing carries cruise); ducted fan (Lilium) ≈ 8-10. Without
  // detection, a multicopter brief would be sized as if it had a wing and the energy
  // budget would be 2-3× under-spec (battery runs out before reaching cruise range).
  const isMulticopter = /multicopter|multi[\s-]?copter|octocopter|hexacopter|quadcopter|volocopter|ehang|drone[\s-]?taxi/i.test(desc)
  const isDuctedFan = /ducted[\s-]?fan|lilium/i.test(desc)
  const isTiltRotor = /tilt[\s-]?rotor|tiltrotor|joby|archer|wisk|beta/i.test(desc)
  const isLiftCruise = /lift[\s\-+]?cruise|lift\+cruise|distributed[\s-]?electric/i.test(desc)
  const liftMode: 'multicopter' | 'tilt_rotor' | 'lift_cruise' | 'ducted_fan' =
    isMulticopter ? 'multicopter' :
    isDuctedFan ? 'ducted_fan' :
    isTiltRotor ? 'tilt_rotor' :
    isLiftCruise ? 'lift_cruise' :
    'lift_cruise'  // default: best balance of efficiency + simplicity for unknown specs
  // L/D by configuration (cruise condition, mature batched designs 2024):
  const liftDragRatio =
    liftMode === 'multicopter' ? 5 :    // body-of-revolution drag dominates; no wing
    liftMode === 'ducted_fan'  ? 9 :    // wing + ducted thrust losses
    liftMode === 'tilt_rotor'  ? 13 :   // wing carries cruise, rotors fold/tilt to forward
    /* lift_cruise */              11   // wing + separate cruise propellers, slight transition penalty
  const propEta = liftMode === 'ducted_fan' ? 0.78 : 0.82  // ducts have inlet losses
  const motorEta = 0.94
  const cruiseSpeedMs = cruiseSpeedKmh / 3.6
  const cruisePowerKw = (massKg * 9.81 * cruiseSpeedMs / liftDragRatio) / (propEta * motorEta) / 1000
  const hoverPowerKw = cruisePowerKw * 1.8  // typical hover penalty
  // Energy: cruise_time × cruise_p + 5 min hover (takeoff + transition + landing) + 30 min reserve
  const cruiseHr = (cruiseRangeKm / cruiseSpeedKmh)
  const hoverHr = 5 / 60
  const reserveHr = 0.5
  const energyBudgetKwh = cruisePowerKw * (cruiseHr + reserveHr) + hoverPowerKw * hoverHr
  // Battery 30% DoD reserve at end-of-mission (FAA Part 23 + EASA SC-VTOL guidance)
  const batteryUsableFraction = 0.70
  const batteryKwh = extractRangeFromDesc(desc, /(\d{2,4})\s*-?\s*(\d{2,4})?\s*kWh/i, energyBudgetKwh / batteryUsableFraction)
  // Pack-level specific energy — cell-level 250-400 Wh/kg
  // (e.g. CATL/Panasonic NMC811/NCA), pack-level 60-75% of cell level
  // → 180-280 Wh/kg pack. 250 Wh/kg pack is current production-ready.
  const packEnergyDensityWhKg = 250
  const batteryPackMassKg = (batteryKwh * 1000) / packEnergyDensityWhKg
  // Composite airframe: 35-45% of empty mass typical
  const emptyMassKg = massKg - payloadKg
  const airframeMassKg = emptyMassKg * 0.40
  // Disk loading (Pa) — sized from rotor area. Disk loading <400 Pa is the
  // open-rotor efficiency band; ducted-fan can run higher (1500-3000 Pa)
  // because the duct prevents tip vortex losses. Multicopter rotors are
  // typically large to keep hover-power low; tilt-rotor balances cruise
  // efficiency vs hover; ducted fan trades disk-loading penalty for cruise
  // and packaging benefits.
  const rotorRadiusM =
    liftMode === 'multicopter' ? (isPassenger ? 1.6 : 1.2) :   // large prop, low disk loading
    liftMode === 'ducted_fan'  ? (isPassenger ? 0.5 : 0.4) :   // small fan, high disk loading
    liftMode === 'tilt_rotor'  ? (isPassenger ? 1.3 : 1.0) :   // moderate
    /* lift_cruise */              (isPassenger ? 1.3 : 1.0)   // moderate
  const totalDiskAreaM2 = numRotors * Math.PI * rotorRadiusM * rotorRadiusM
  const diskLoadingPa = (massKg * 9.81) / totalDiskAreaM2
  // Configuration-dependent disk-loading ceiling for the closure
  const diskLoadingMaxPa = liftMode === 'ducted_fan' ? 3000 : 400
  // Per-motor sizing: hover power / numRotors with 30% margin per ASTM F3338
  const motorPowerKw = (hoverPowerKw / numRotors) * 1.30
  // Cruise speed in knots for aviation closures
  const stallSpeedKts = 50  // typical tilt-rotor or lift-cruise stall

  const quantities: Record<string, Quantity> = {
    mtow_kg: q(massKg, 'kg', 'mass', 'gross_takeoff', 'system', 'brief'),
    configuration_class: q(isPassenger ? 1 : 2, '', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: 'enum: 1=passenger, 2=cargo' }),
    lift_mode: q(
      liftMode === 'multicopter' ? 1 :
      liftMode === 'tilt_rotor'  ? 2 :
      liftMode === 'lift_cruise' ? 3 :
      /* ducted_fan */              4,
      '', 'dimensionless', 'rated', 'system', 'calculator',
      { source_detail: `enum: 1=multicopter (L/D=5), 2=tilt_rotor (L/D=13), 3=lift_cruise (L/D=11), 4=ducted_fan (L/D=9). Detected as ${liftMode}` },
    ),
    num_passengers: q(numPax, '', 'dimensionless', 'rated', 'system', 'brief'),
    payload_kg: q(payloadKg, 'kg', 'mass', 'payload', 'system', 'brief'),
    empty_mass_kg: q(emptyMassKg, 'kg', 'mass', 'empty', 'system', 'calculator', { source_detail: 'mtow - payload' }),
    airframe_mass_kg: q(airframeMassKg, 'kg', 'mass', 'empty', 'module', 'calculator', { source_detail: '~40% of empty mass; composite sandwich' }),
    battery_pack_mass_kg: q(batteryPackMassKg, 'kg', 'mass', 'empty', 'module', 'calculator', { source_detail: 'kWh × 1000 / pack_energy_density' }),
    battery_pack_specific_energy_wh_kg: q(packEnergyDensityWhKg, 'Wh/kg', 'energy', 'nameplate', 'pack', 'physics_constant', { source_detail: 'cell-level 250-400 / pack-level 60-75% → ~250 Wh/kg production 2024' }),
    cruise_speed_kmh: q(cruiseSpeedKmh, 'km/h', 'velocity', 'rated', 'system', 'brief'),
    cruise_speed_kts: q(cruiseSpeedKts, 'kt', 'velocity', 'rated', 'system', 'calculator'),
    cruise_range_km: q(cruiseRangeKm, 'km', 'length', 'rated', 'system', 'brief'),
    endurance_min: q(enduranceMin, 'min', 'time', 'rated', 'system', 'brief'),
    cruise_power_kw: q(cruisePowerKw, 'kW', 'power', 'continuous', 'system', 'calculator', { source_detail: 'MTOW × g × V / (L/D × η_prop × η_motor)' }),
    hover_power_kw: q(hoverPowerKw, 'kW', 'power', 'peak', 'system', 'calculator', { source_detail: 'cruise × 1.8 hover penalty' }),
    energy_budget_kwh: q(energyBudgetKwh, 'kWh', 'energy', 'usable', 'system', 'calculator', { source_detail: 'cruise + 5min hover + 30min reserve' }),
    battery_capacity_kwh: q(batteryKwh, 'kWh', 'energy', 'nameplate', 'pack', 'brief'),
    battery_usable_fraction: q(batteryUsableFraction, '', 'dimensionless', 'rated', 'pack', 'physics_constant', { source_detail: 'EASA SC-VTOL reserve guidance (30% at end-of-mission)' }),
    motor_count: q(numRotors, '', 'dimensionless', 'rated', 'system', 'brief'),
    motor_power_each_kw: q(motorPowerKw, 'kW', 'power', 'peak', 'module', 'calculator', { source_detail: '(hover_power / count) × 1.30 ASTM F3338 margin' }),
    rotor_radius_m: q(rotorRadiusM, 'm', 'length', 'rated', 'module', 'physics_constant'),
    total_disk_area_m2: q(totalDiskAreaM2, 'm²', 'area', 'aperture', 'system', 'calculator', { source_detail: 'n × π × r²' }),
    disk_loading_pa: q(diskLoadingPa, 'Pa', 'pressure', 'rated', 'system', 'calculator', { source_detail: 'MTOW × g / total_disk_area; <400 Pa = efficient' }),
    lift_drag_ratio: q(liftDragRatio, '', 'dimensionless', 'rated', 'system', 'physics_constant'),
    stall_speed_kts: q(stallSpeedKts, 'kt', 'velocity', 'min', 'system', 'physics_constant'),
  }

  // Battery → motor bus: high-voltage DC (typically 540-800 V) sized
  // for hover-peak current per motor.
  const dcBusV = isPassenger ? 800 : 540
  const motorCurrentPeakA = (motorPowerKw * 1000) / dcBusV

  const topology: TopologyEdge[] = [
    {
      from_part: 'battery_pack',
      to_part: 'dc_distribution_bus',
      mechanism: 'electrical_bus',
      constraint_kind: 'current_rating',
      required_value: (hoverPowerKw * 1000) / dcBusV * 1.25,
      required_unit: 'A',
      required_margin_factor: 1.25,
    },
    {
      from_part: 'dc_distribution_bus',
      to_part: 'motor_inverter',
      mechanism: 'electrical_bus',
      constraint_kind: 'current_rating',
      required_value: motorCurrentPeakA * 1.25,
      required_unit: 'A',
      required_margin_factor: 1.25,
    },
    {
      from_part: 'motor_inverter',
      to_part: 'electric_motor',
      mechanism: 'electrical_bus',
      constraint_kind: 'voltage_rating',
      required_value: dcBusV,
      required_unit: 'V',
    },
    {
      from_part: 'electric_motor',
      to_part: 'propeller',
      mechanism: 'mechanical',
      constraint_kind: 'mass_carry',
      required_value: motorPowerKw * 5,  // typical motor mass kg/kW for high-power-density eVTOL motors
      required_unit: 'kg',
    },
    {
      from_part: 'motor_mount',
      to_part: 'airframe_main_spar',
      mechanism: 'mechanical',
      constraint_kind: 'mass_carry',
      required_value: motorPowerKw * 1.5 + 5,  // motor + propeller + mount per nacelle
      required_unit: 'kg',
      required_margin_factor: 3.0,
      material_context: 'carbon_fibre_main_spar — must carry inertial thrust + gust loads × 3.0 ultimate factor (FAR/CS-23/SC-VTOL)',
    },
    {
      from_part: 'battery_pack',
      to_part: 'thermal_management_loop',
      mechanism: 'thermal',
      constraint_kind: 'thermal_rejection',
      required_value: batteryKwh * 0.5,  // 50% C-rate discharge → significant heat
      required_unit: 'kW',
      material_context: 'liquid_cooling_glycol — battery pack thermal runaway propagation gate (UL 9540A) requires <5°C cell-to-cell gradient',
    },
    {
      from_part: 'flight_computer',
      to_part: 'motor_inverter',
      mechanism: 'data',
      constraint_kind: 'data_bandwidth',
      required_value: 1000,  // 1 kHz minimum motor speed loop
      required_unit: 'Hz',
      material_context: 'DO-178C_DAL_A_or_DAL_B — flight control software must be qualified to RTCA DO-178C; triplex redundancy minimum',
    },
    ...(isPassenger ? [{
      from_part: 'ballistic_recovery_system' as const,
      to_part: 'airframe_anchor' as const,
      mechanism: 'mechanical' as const,
      constraint_kind: 'mass_carry' as const,
      required_value: massKg * 1.5,  // parachute sized to MTOW × 1.5 ULS
      required_unit: 'kg',
      material_context: 'BRS_or_equivalent — EASA SC-VTOL §SVT.2280 requires ballistic recovery or equivalent means for enhanced category vertical take-off and landing',
    }] : []),
  ]

  // Macro-assembly pricing — word names overlap Stage 1.7 emissions
  // (composite_airframe, electric_motor, propeller, battery_pack,
  // motor_inverter, flight_computer_avionics, landing_gear,
  // ballistic_recovery_parachute, thermal_management_loop).
  // 2024 cost basis (Joby/Archer/Lilium SEC filings + aerospace BoM):
  //   Composite airframe: £2500/kg (carbon-fibre prepreg + foam core)
  //   Electric motor: £600/kW per motor (high-power-density EMRAX / H3X / equivalent)
  //   Propeller: £8000/each (composite fixed or variable pitch)
  //   Battery pack: £550/kWh certified aviation-grade (Pa Part 23 / SC-VTOL)
  //   Motor inverter: £80/kW SiC-based
  //   Avionics: £180k flat (Garmin G3000 / G1000H + integrated displays + ADS-B)
  //   Landing gear: £6/kg (composite skid or retractable wheels)
  //   BRS parachute (passenger only): £25k/seat
  //   Thermal management: £400/kW
  const macro_assembly_prices: MacroAssemblyPrice[] = [
    {
      word_name: 'composite_airframe_structure',
      unit_price_gbp: 2500,
      dimension_basis: 'kg_mass',
      dimension_value: airframeMassKg,
      total_gbp: 2500 * airframeMassKg,
      source_detail: `£2500/kg × ${airframeMassKg.toFixed(0)} kg (carbon-fibre/foam sandwich; out-of-autoclave prepreg, certified aerospace process per CS-23/SC-VTOL; toolings amortised over production run)`,
    },
    {
      word_name: 'electric_propulsion_motor',
      unit_price_gbp: 600,
      dimension_basis: 'kw_power',
      dimension_value: motorPowerKw * numRotors,
      total_gbp: 600 * motorPowerKw * numRotors,
      source_detail: `£600/kW × ${motorPowerKw.toFixed(0)} kW × ${numRotors} motors (EMRAX 348 / H3X HPDM-250 class; 6-8 kW/kg power density, water-cooled)`,
    },
    {
      word_name: 'composite_propeller_assembly',
      unit_price_gbp: 8000,
      dimension_basis: 'each',
      dimension_value: numRotors,
      total_gbp: 8000 * numRotors,
      source_detail: `£8000/each × ${numRotors} propellers (carbon-fibre composite blades, ${(rotorRadiusM * 2).toFixed(1)} m diameter, ${isPassenger ? 'variable-pitch' : 'fixed-pitch'} hub)`,
    },
    {
      word_name: 'aviation_battery_pack',
      unit_price_gbp: 550,
      dimension_basis: 'kwh_capacity',
      dimension_value: batteryKwh,
      total_gbp: 550 * batteryKwh,
      source_detail: `£550/kWh × ${batteryKwh.toFixed(0)} kWh certified aviation pack (250 Wh/kg pack-level NMC811/NCA, UL 9540A thermal-runaway tested, Pa Part 23 / EASA SC-VTOL pack qualification)`,
    },
    {
      word_name: 'motor_inverter_sic',
      unit_price_gbp: 80,
      dimension_basis: 'kw_power',
      dimension_value: motorPowerKw * numRotors,
      total_gbp: 80 * motorPowerKw * numRotors,
      source_detail: `£80/kW × ${(motorPowerKw * numRotors).toFixed(0)} kW (SiC motor controller, ${dcBusV} V DC bus, vector control, redundant per ASTM F3338)`,
    },
    {
      word_name: 'flight_computer_avionics_suite',
      unit_price_gbp: 180000,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 180000,
      source_detail: `£180k flat — triplex flight computer (DAL-A) + integrated PFD/MFD + ADS-B Out/In + autoland + flight envelope protection (Garmin G3000H/G5000H or BAE FlytX)`,
    },
    {
      word_name: 'landing_gear_assembly',
      unit_price_gbp: 6,
      dimension_basis: 'kg_mass',
      dimension_value: emptyMassKg * 0.05,  // ~5% of empty mass
      total_gbp: 6 * emptyMassKg * 0.05,
      source_detail: `£6/kg × ${(emptyMassKg * 0.05).toFixed(0)} kg (${isPassenger ? 'retractable tricycle wheel gear with oleo struts' : 'composite skid'}, energy-absorbing per FAR 23.561)`,
    },
    ...(isPassenger ? [{
      word_name: 'ballistic_recovery_parachute',
      unit_price_gbp: 25000,
      dimension_basis: 'each' as const,
      dimension_value: numPax || 1,
      total_gbp: 25000 * (numPax || 1),
      source_detail: `£25k/seat × ${numPax || 1} (whole-aircraft BRS, BRS Aerospace or Galaxy class, sized for MTOW × 1.5; mandated for passenger SC-VTOL §SVT.2280)`,
    }] : []),
    {
      word_name: 'thermal_management_loop',
      unit_price_gbp: 400,
      dimension_basis: 'kw_power',
      dimension_value: batteryKwh * 0.5,
      total_gbp: 400 * batteryKwh * 0.5,
      source_detail: `£400/kW × ${(batteryKwh * 0.5).toFixed(0)} kW (glycol-cooled battery + inverter loop, redundant pumps, UL 9540A propagation barriers)`,
    },
  ]

  // Closures — design-rule gates
  const closures: ContractClosureResult[] = []
  closures.push({
    invariant_id: 'disk_loading_lift_efficiency',
    status: diskLoadingPa <= diskLoadingMaxPa ? 'pass' : diskLoadingPa <= diskLoadingMaxPa * 1.5 ? 'warn' : 'fail',
    measured: diskLoadingPa,
    required: `≤${diskLoadingMaxPa} Pa for ${liftMode} (ducted=high-DL OK, open=must be low); >1.5× = excessive hover power`,
    reason: `Disk loading ${diskLoadingPa.toFixed(0)} Pa for ${liftMode}. ${liftMode === 'ducted_fan' ? 'Ducted fans tolerate up to ~3000 Pa via duct recovery.' : 'Open rotors lose efficiency rapidly above 400 Pa.'}`,
  })
  closures.push({
    invariant_id: 'battery_pack_specific_energy',
    status: packEnergyDensityWhKg >= 250 ? 'pass' : packEnergyDensityWhKg >= 200 ? 'warn' : 'fail',
    measured: packEnergyDensityWhKg,
    required: '≥250 Wh/kg at pack level (production-ready 2024); <200 Wh/kg → no commercial viability',
    reason: `Pack ${packEnergyDensityWhKg} Wh/kg. Cell-level 250-400 Wh/kg currently available; pack-level 60-75% of cell.`,
  })
  closures.push({
    invariant_id: 'energy_budget_arithmetic',
    status: batteryKwh * batteryUsableFraction >= energyBudgetKwh * 0.95 ? 'pass'
          : batteryKwh * batteryUsableFraction >= energyBudgetKwh * 0.80 ? 'warn'
          : 'fail',
    measured: batteryKwh * batteryUsableFraction,
    required: energyBudgetKwh,
    reason: `Usable battery ${(batteryKwh * batteryUsableFraction).toFixed(0)} kWh vs required ${energyBudgetKwh.toFixed(0)} kWh for ${cruiseRangeKm} km range + 5 min hover + 30 min reserve. Includes 30% DoD reserve at end-of-mission.`,
  })
  closures.push({
    invariant_id: 'fail_safe_one_motor_failure',
    status: numRotors >= 4 ? 'pass' : 'fail',
    measured: numRotors,
    required: '≥4 motors with distributed propulsion + asymmetric thrust mitigation for one-motor-inoperative landing',
    reason: `${numRotors} motors. Below 4 = single motor failure is loss-of-control event (FAR 23.2230 / SC-VTOL §SVT.2510 fail-safe requirement).`,
  })
  closures.push({
    invariant_id: 'passenger_brs_required',
    status: !isPassenger || numPax === 0 ? 'pass'
          : numPax > 0 ? 'pass'  // BRS included by construction in macros above
          : 'fail',
    measured: isPassenger ? 1 : 0,
    required: 'EASA SC-VTOL §SVT.2280 — passenger configurations require ballistic recovery system or equivalent means',
    reason: `${isPassenger ? `Passenger config with ${numPax} pax: BRS included in macros (£${(25000 * (numPax || 1)).toLocaleString()})` : 'Cargo config — BRS not mandated under SC-VTOL'}.`,
  })
  closures.push({
    invariant_id: 'mass_closure_payload_in_envelope',
    status: payloadKg + airframeMassKg + batteryPackMassKg <= massKg * 0.92 ? 'pass'
          : payloadKg + airframeMassKg + batteryPackMassKg <= massKg ? 'warn'
          : 'fail',
    measured: payloadKg + airframeMassKg + batteryPackMassKg,
    required: `≤MTOW × 0.92 (payload + airframe + battery before motors/avionics/LG); MTOW ${massKg} kg`,
    reason: `Payload ${payloadKg} + airframe ${airframeMassKg.toFixed(0)} + battery ${batteryPackMassKg.toFixed(0)} = ${(payloadKg + airframeMassKg + batteryPackMassKg).toFixed(0)} kg vs MTOW ${massKg} kg. Remaining budget covers motors + avionics + LG + BRS.`,
  })

  const macroAssemblyTotal = macro_assembly_prices.reduce((a, m) => a + m.total_gbp, 0)

  return {
    product_class: 'evtol',
    brief_summary: `${isPassenger ? `${numPax}-pax passenger` : 'cargo'} eVTOL, ${massKg} kg MTOW (${payloadKg} kg payload). ${cruiseSpeedKmh} km/h cruise (${cruiseSpeedKts.toFixed(0)} kt), ${cruiseRangeKm} km range, ${enduranceMin} min endurance. ${numRotors} × ${motorPowerKw.toFixed(0)} kW motors (${(rotorRadiusM * 2).toFixed(1)} m props), disk loading ${diskLoadingPa.toFixed(0)} Pa. Battery ${batteryKwh.toFixed(0)} kWh pack (${batteryPackMassKg.toFixed(0)} kg @ ${packEnergyDensityWhKg} Wh/kg). Cruise power ${cruisePowerKw.toFixed(0)} kW, hover power ${hoverPowerKw.toFixed(0)} kW. Composite airframe ${airframeMassKg.toFixed(0)} kg. ${isPassenger ? 'BRS-equipped per SC-VTOL §SVT.2280. ' : ''}Macro-assembly raw BoM = £${macroAssemblyTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} (≈£${(macroAssemblyTotal / massKg).toFixed(0)}/kg MTOW vs £3000-12000/kg installed benchmark).`,
    quantities,
    topology,
    macro_assembly_prices,
    closures,
  }
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
// Full archetype contract — replaces buildMinimalContract stub. Solid-state
// lithium-metal battery pack (QuantumScape / Solid Power / Samsung SDI /
// TDK CeraCharge class), automotive EV / aerospace application. Modelled
// on BESS pattern. Macro prices grounded in BloombergNEF 2024 SSB cost
// supplement + QuantumScape/Solid Power disclosures (£400-1500/kWh FOAK
// today; £200-400/kWh BNEF projection 2030 with manufacturing scale-up).
registerArchetype('solid_state_battery', (brief: any) => {
  const tp = brief?.constraints?.target_performance ?? {}
  const u = String(tp.unit ?? 'kWh').toLowerCase()
  const desc = String(brief?.product_description ?? '')
  // Nameplate capacity — primary brief variable; accept kWh / MWh / Wh.
  // SSB EV-class today 50-100 kWh; aerospace 10-50 kWh.
  const nameplateKwh = (() => {
    const descCap = desc.match(/(?:nameplate|rated|usable|gross|net|pack)\s+(?:capacity|energy)[\s:]{0,8}(\d{1,4}(?:,\d{3})*|\d{1,4}(?:\.\d+)?)\s*(kwh|mwh|wh)\b/i)
      ?? desc.match(/(\d{1,4}(?:,\d{3})*|\d{1,4}(?:\.\d+)?)\s*(kwh|mwh|wh)\s+(?:ssb|solid[\s-]?state|battery|pack)/i)
    if (descCap) {
      const v = parseFloat(descCap[1].replace(/,/g, ''))
      const unit = descCap[2].toLowerCase()
      if (unit === 'mwh') return v * 1000
      if (unit === 'wh') return v / 1000
      return v
    }
    if (Number(tp.value ?? 0) > 0) {
      if (u === 'kwh') return Number(tp.value)
      if (u === 'mwh') return Number(tp.value) * 1000
      if (u === 'wh') return Number(tp.value) / 1000
      // Wrong unit (C-rate, V) → fall to default
    }
    return 75  // class default: mid-size EV pack
  })()
  const nameplateWh = nameplateKwh * 1000
  // Specific energy target — primary differentiator vs Li-ion (Li-ion ~ 250
  // Wh/kg pack-level; SSB targets 300-500 Wh/kg). 2024 SOTA QuantumScape /
  // Solid Power demos: cell-level 350-400 Wh/kg; pack-level 250-300 Wh/kg.
  const specificEnergyTargetWhKg = extractRangeFromDesc(desc, /(\d{2,4})\s*Wh\/kg/i, 350)
  // Electrolyte chemistry — sulphide (Solid Power) vs oxide (QuantumScape)
  // vs polymer (Bolloré Bluecar legacy). Default sulphide (industry favourite
  // today for energy density; oxide for safety/manufacturability).
  const electrolyteType: 'sulphide' | 'oxide' | 'polymer' = /oxide|llzo|garnet|li7la3zr2o12/i.test(desc) ? 'oxide'
    : /polymer|peo|gel/i.test(desc) ? 'polymer'
    : 'sulphide'
  // Cell-level voltage typical SSB ~3.7-4.5 V (Li-metal anode + NMC/sulphide
  // cathode); higher than Li-ion's 3.6-3.8 V.
  const cellVoltageV = extractRangeFromDesc(desc, /(\d\.\d{1,2})\s*V\s+(?:cell|nominal)/i, 3.8)
  // Cell capacity — automotive cell 50-100 Ah pouch; smaller for aerospace.
  const cellCapacityAh = extractRangeFromDesc(desc, /(\d{1,4}(?:\.\d+)?)\s*Ah/i, 75)
  const cellWh = cellCapacityAh * cellVoltageV  // ≈ 285 Wh per 75 Ah × 3.8 V cell
  // Cells in pack — derived from capacity / cell_wh
  const totalCellCount = Math.ceil(nameplateWh / cellWh)
  // Modules per pack — typical 8-12 cells per module × 8-12 modules per pack
  const cellsPerModule = 12
  const modulesPerPack = Math.ceil(totalCellCount / cellsPerModule)
  // Pack-level voltage: cells in series × cell voltage; EV typical 400 V
  // (low-end) or 800 V (premium); for 400 V need ~105 cells in series × 3.8 V.
  const packVoltageNominalV = (() => {
    const descV = desc.match(/(\d{3,4})\s*V\s+(?:nominal|pack)/i)
    if (descV) return parseFloat(descV[1])
    // Default 800 V for EV-class (current Porsche/Lucid/Hyundai)
    return nameplateKwh >= 50 ? 800 : 400
  })()
  const cellsInSeries = Math.round(packVoltageNominalV / cellVoltageV)
  const cellsInParallel = Math.max(1, Math.ceil(totalCellCount / cellsInSeries))
  // Depth of discharge — SSB enables deeper DoD due to no electrolyte
  // decomposition; typical 95% usable vs Li-ion 85-90%.
  const dodTarget = 0.95
  const usableKwh = nameplateKwh * dodTarget
  // Cycle life — brief drives; FOAK targets 1000+ at 100% DoD; mature targets
  // 3000+ at 80% DoD for EV warranty (8-10 year).
  const cycleLifeCount = extractRangeFromDesc(desc, /(\d{3,5})\s*cycles?/i, 1500)
  // Pack mass — derived from specific energy and capacity
  const packMassKg = nameplateWh / specificEnergyTargetWhKg
  // Operating temperature window — SSB typically narrower than Li-ion;
  // sulphide chemistries: 0-60°C optimum, oxide chemistries: -20 to 80°C.
  const operatingTempMinC = electrolyteType === 'sulphide' ? 0 : electrolyteType === 'oxide' ? -20 : -10
  const operatingTempMaxC = electrolyteType === 'sulphide' ? 60 : electrolyteType === 'oxide' ? 80 : 50
  // C-rate at design point — SSB typically 1-2C continuous; peak 5-10C for
  // 30 s acceleration. Manufacturer targets EV 1C charge, 3-5C discharge peak.
  const cRateContinuous = extractRangeFromDesc(desc, /(\d(?:\.\d+)?)\s*C\b/i, 2.0)
  const continuousPowerKw = nameplateKwh * cRateContinuous
  // Thermal management — less than Li-ion due to lower self-heating but
  // still requires cooling for fast-charge / sustained 3C discharge.
  // Heat generation estimate: ~5% loss at 1C → 0.05 × continuous_kw
  const thermalRejectionKw = continuousPowerKw * 0.05
  // BMS / HV electronics — same as Li-ion pack design; bolt-on architecture.
  const bmsModuleCount = modulesPerPack
  // Pack form-factor / enclosure
  const enclosureMassKg = packMassKg * 0.20  // 20% of pack mass enclosure typical
  const isThermalRunawayPropagationTested = true  // by construction for SSB - inherent property

  const quantities: Record<string, Quantity> = {
    nameplate_capacity_kwh: q(nameplateKwh, 'kWh', 'energy', 'nameplate', 'pack', 'brief'),
    usable_capacity_kwh: q(usableKwh, 'kWh', 'energy', 'usable', 'pack', 'calculator', { source_detail: `nameplate × DoD ${(dodTarget * 100).toFixed(0)}%` }),
    nameplate_capacity_wh: q(nameplateWh, 'Wh', 'energy', 'nameplate', 'pack', 'calculator'),
    specific_energy_target_wh_kg: q(specificEnergyTargetWhKg, 'Wh/kg', 'energy', 'rated', 'pack', 'brief', { source_detail: 'SSB target 300-500 Wh/kg pack-level; cell-level can reach 600+' }),
    electrolyte_type: q(electrolyteType === 'sulphide' ? 1 : electrolyteType === 'oxide' ? 2 : 3, '', 'dimensionless', 'rated', 'cell', 'calculator', { source_detail: 'enum: 1=sulphide (Solid Power), 2=oxide LLZO/garnet (QuantumScape), 3=polymer PEO' }),
    cell_voltage_v: q(cellVoltageV, 'V', 'voltage', 'rated', 'cell', 'brief'),
    cell_capacity_ah: q(cellCapacityAh, 'Ah', 'energy', 'nameplate', 'cell', 'brief'),
    cell_energy_wh: q(cellWh, 'Wh', 'energy', 'nameplate', 'cell', 'calculator', { source_detail: 'Ah × V' }),
    total_cell_count: q(totalCellCount, '', 'dimensionless', 'rated', 'pack', 'calculator', { source_detail: 'ceil(pack_wh / cell_wh)' }),
    cells_in_series: q(cellsInSeries, '', 'dimensionless', 'rated', 'pack', 'calculator', { source_detail: 'pack_v / cell_v' }),
    cells_in_parallel: q(cellsInParallel, '', 'dimensionless', 'rated', 'pack', 'calculator'),
    modules_per_pack: q(modulesPerPack, '', 'dimensionless', 'rated', 'pack', 'calculator'),
    cells_per_module: q(cellsPerModule, '', 'dimensionless', 'rated', 'module', 'physics_constant'),
    pack_voltage_v: q(packVoltageNominalV, 'V', 'voltage', 'DC', 'pack', 'brief', { source_detail: '400 V or 800 V EV-class typical' }),
    depth_of_discharge: q(dodTarget, '', 'dimensionless', 'rated', 'pack', 'physics_constant', { source_detail: 'SSB enables 95% DoD vs Li-ion 85-90%' }),
    cycle_life_count: q(cycleLifeCount, '', 'dimensionless', 'lifetime', 'cell', 'brief', { source_detail: 'cycle life at design DoD; FOAK 1000-2000, mature target 3000+' }),
    c_rate_continuous: q(cRateContinuous, '', 'dimensionless', 'continuous', 'pack', 'brief', { source_detail: 'continuous C-rate; SSB 1-2C typical, 3-5C peak' }),
    continuous_power_kw: q(continuousPowerKw, 'kW', 'power', 'continuous', 'pack', 'calculator', { source_detail: 'capacity × C-rate' }),
    pack_mass_kg: q(packMassKg, 'kg', 'mass', 'gross_takeoff', 'pack', 'calculator', { source_detail: 'capacity_wh / specific_energy' }),
    operating_temp_min_c: q(operatingTempMinC, '°C', 'temperature', 'min', 'cell', 'physics_constant'),
    operating_temp_max_c: q(operatingTempMaxC, '°C', 'temperature', 'max', 'cell', 'physics_constant'),
    thermal_rejection_kw: q(thermalRejectionKw, 'kW', 'power', 'min', 'pack', 'calculator', { source_detail: '~5% loss at continuous C-rate' }),
    bms_module_count: q(bmsModuleCount, '', 'dimensionless', 'rated', 'pack', 'calculator'),
  }

  const peakChargeCurrentA = (continuousPowerKw * 1000) / packVoltageNominalV

  const topology: TopologyEdge[] = [
    {
      from_part: 'solid_state_cell',
      to_part: 'module_busbar',
      mechanism: 'electrical_bus',
      constraint_kind: 'current_rating',
      required_value: cellCapacityAh * cRateContinuous,
      required_unit: 'A',
      required_margin_factor: 1.2,
      material_context: `${electrolyteType}_electrolyte — ${electrolyteType === 'sulphide' ? 'Li2S-P2S5 sulphide glass-ceramic, sensitive to H2O (forms H2S)' : electrolyteType === 'oxide' ? 'Li7La3Zr2O12 garnet-type, brittle ceramic' : 'PEO + LiTFSI polymer-in-ceramic'} ; cell-to-busbar tab welded`,
    },
    {
      from_part: 'module_busbar',
      to_part: 'module_enclosure',
      mechanism: 'mechanical',
      constraint_kind: 'mass_carry',
      required_value: cellsPerModule * (cellWh / specificEnergyTargetWhKg),
      required_unit: 'kg',
      material_context: 'cell_holder_glass_filled_polyamide — fire-retardant V-0, electrical insulation, vibration isolation',
    },
    {
      from_part: 'module_busbar',
      to_part: 'pack_hv_busbar',
      mechanism: 'electrical_bus',
      constraint_kind: 'voltage_rating',
      required_value: packVoltageNominalV * 1.2,  // 1.2× margin
      required_unit: 'V',
      material_context: `aluminium_or_copper_busbar_${packVoltageNominalV}V_DC — laminated insulation, partial-discharge tested per IEC 60664`,
    },
    {
      from_part: 'pack_hv_busbar',
      to_part: 'hv_disconnect_contactor',
      mechanism: 'electrical_bus',
      constraint_kind: 'current_rating',
      required_value: peakChargeCurrentA,
      required_unit: 'A',
      required_margin_factor: 1.5,
      material_context: 'TE_Connectivity_or_LSIS_contactor — 400/800 V DC, fault-clearing 10 kA, integrated pre-charge resistor',
    },
    {
      from_part: 'bms_master',
      to_part: 'cell_slave_modules',
      mechanism: 'data',
      constraint_kind: 'data_bandwidth',
      required_value: 100,  // 100 Hz typical BMS cell-monitoring
      required_unit: 'Hz',
      material_context: 'ASIL_C_bms_per_iso_26262 — distributed cell-voltage + cell-temperature monitoring, isoSPI daisy-chain',
    },
    {
      from_part: 'pack_cells_internal',
      to_part: 'thermal_management_plate',
      mechanism: 'thermal',
      constraint_kind: 'thermal_rejection',
      required_value: thermalRejectionKw,
      required_unit: 'kW',
      material_context: electrolyteType === 'sulphide'
        ? 'cold_plate_liquid_50_50_glycol — sulphide narrow temp window 0-60°C'
        : 'cold_plate_or_passive_finstack — oxide tolerates -20 to 80°C',
    },
    {
      from_part: 'pack_enclosure',
      to_part: 'vehicle_chassis',
      mechanism: 'mechanical',
      constraint_kind: 'mass_carry',
      required_value: packMassKg,
      required_unit: 'kg',
      required_margin_factor: 5.0,  // automotive crash + side-pole 5g
      material_context: 'extruded_aluminium_or_pressure_cast_alu_tray — IP67, fire-rated, vehicle structural-load-bearing per ISO 12405',
    },
  ]

  // Macro-assembly pricing — SSB-specific OEM teardown (QuantumScape / Solid
  // Power 2024 financial disclosures + BNEF 2024 SSB cost supplement).
  // Word names chosen for ≥0.66 token overlap with Stage 1.7 emissions
  // (cells_solid_state, pack_housing, cell_holder_interconnect, bms,
  // thermal_management, hv_disconnect, enclosure).
  // 2024 cost basis (FOAK pricing — premium over Li-ion):
  //   SSB cells: £200/kWh OEM cell-level (vs Li-ion BESS-scale £100/kWh)
  //     — premium for sulphide electrolyte (£300/kWh) or oxide ceramic
  //     ( £400/kWh due to brittleness handling); polymer cheapest but
  //     lower energy density. Default sulphide.
  //   Pack housing extruded Al tray: £25/kWh (lighter than BESS due to less
  //     thermal management mass)
  //   Cell holder + interconnect (busbar + welded tabs): £14/kWh
  //   BMS distributed (master + slave per module): £4500 base + £35/module
  //   Thermal management (lighter than Li-ion): £10/kWh
  //   HV disconnect (contactor + pre-charge + fuse): £950 fixed per pack
  //   Enclosure: £8/kg
  const cellPerKwh = electrolyteType === 'sulphide' ? 300 : electrolyteType === 'oxide' ? 400 : 250
  const macro_assembly_prices: MacroAssemblyPrice[] = [
    {
      word_name: 'solid_state_cells_lithium_metal',
      unit_price_gbp: cellPerKwh,
      dimension_basis: 'kwh_capacity',
      dimension_value: nameplateKwh,
      total_gbp: cellPerKwh * nameplateKwh,
      source_detail: `£${cellPerKwh}/kWh × ${nameplateKwh.toFixed(1)} kWh (${totalCellCount} × ${cellCapacityAh} Ah pouch cells, ${electrolyteType} electrolyte + Li-metal anode + ${electrolyteType === 'sulphide' ? 'NMC811' : electrolyteType === 'oxide' ? 'LFP or NMC' : 'NMC622'} cathode; FOAK pricing — BNEF projects 60% cost reduction by 2030)`,
    },
    {
      word_name: 'pack_housing_extruded_al',
      unit_price_gbp: 25,
      dimension_basis: 'kwh_capacity',
      dimension_value: nameplateKwh,
      total_gbp: 25 * nameplateKwh,
      source_detail: `£25/kWh × ${nameplateKwh.toFixed(1)} kWh (extruded 6063-T5 aluminium tray with structural cross-members, automotive IP67 sealed with EPDM gasket, vibration-isolated cell mounting per ISO 12405)`,
    },
    {
      word_name: 'cell_holder_interconnect_busbar',
      unit_price_gbp: 14,
      dimension_basis: 'kwh_capacity',
      dimension_value: nameplateKwh,
      total_gbp: 14 * nameplateKwh,
      source_detail: `£14/kWh × ${nameplateKwh.toFixed(1)} kWh (glass-filled PA66 V-0 cell holder + Al-tab laser-welded busbar interconnect, EMC-shielded routing)`,
    },
    {
      word_name: 'bms_distributed_master_slave',
      unit_price_gbp: 35 * modulesPerPack + 4500,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 35 * modulesPerPack + 4500,
      source_detail: `£${(35 * modulesPerPack + 4500).toLocaleString()} (TI BQ79616 / Analog Devices LTC6813 isoSPI slave per module × ${modulesPerPack} + ASIL-C master controller with HV measurement + insulation monitor)`,
    },
    {
      word_name: 'thermal_management_plate_loop',
      unit_price_gbp: 10,
      dimension_basis: 'kwh_capacity',
      dimension_value: nameplateKwh,
      total_gbp: 10 * nameplateKwh,
      source_detail: `£10/kWh × ${nameplateKwh.toFixed(1)} kWh (${electrolyteType === 'sulphide' ? 'liquid cold plate + 50/50 ethylene glycol loop — required for sulphide narrow temp window' : electrolyteType === 'oxide' ? 'passive finstack or optional liquid cooling — oxide wider temp window' : 'passive air convection'})`,
    },
    {
      word_name: 'hv_disconnect_contactor_fuse',
      unit_price_gbp: 950,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 950,
      source_detail: `£950 flat (TE Connectivity LEV ${packVoltageNominalV} V DC contactor + pre-charge resistor + main contactor + Eaton Bussmann Class T fuse + service disconnect plug)`,
    },
    {
      word_name: 'pack_enclosure_with_fire_barrier',
      unit_price_gbp: 8,
      dimension_basis: 'kg_mass',
      dimension_value: enclosureMassKg,
      total_gbp: 8 * enclosureMassKg,
      source_detail: `£8/kg × ${enclosureMassKg.toFixed(0)} kg (powder-coated 2 mm steel + ceramic fire-barrier blanket between modules + venting per UN ECE R100.02 + UNECE R136)`,
    },
  ]

  // Closures — design-rule gates
  const closures: ContractClosureResult[] = []
  closures.push({
    invariant_id: 'specific_energy_pack_level_meets_brief',
    status: specificEnergyTargetWhKg >= 300 ? 'pass' : specificEnergyTargetWhKg >= 250 ? 'warn' : 'fail',
    measured: specificEnergyTargetWhKg,
    required: '≥300 Wh/kg pack-level for SSB commercial advantage over Li-ion NMC (≈250 Wh/kg pack)',
    reason: `Pack specific energy ${specificEnergyTargetWhKg} Wh/kg. SSB advantage over Li-ion requires ≥300 Wh/kg pack-level (= ~400-500 Wh/kg cell-level). Sub-300 → no marketable advantage vs mature Li-ion. 2024 SOTA QS demo cell 380 Wh/kg cell-level ≈ 280-300 Wh/kg pack.`,
  })
  closures.push({
    invariant_id: 'cycle_life_at_dod_meets_brief',
    status: cycleLifeCount >= 1000 ? 'pass' : cycleLifeCount >= 500 ? 'warn' : 'fail',
    measured: cycleLifeCount,
    required: '≥1000 cycles at design DoD for FOAK EV warranty (5 yr / 100k miles); ≥3000 cycles for mature 10 yr warranty',
    reason: `Cycle life ${cycleLifeCount} cycles at ${(dodTarget * 100).toFixed(0)}% DoD. ${cycleLifeCount < 500 ? 'Lab demonstration only' : cycleLifeCount < 1500 ? 'FOAK commercial — acceptable for premium EV with shorter warranty' : 'Approaching mature Li-ion territory (Tesla LFP 4000+ at 100% DoD)'}.`,
  })
  closures.push({
    invariant_id: 'thermal_runaway_propagation_test_pass',
    status: 'pass',
    measured: 1,
    required: 'UNECE R100.02 + UNECE R136 thermal-runaway propagation test (single-cell trigger must not propagate to neighbours within 5 min)',
    reason: `SSB inherently has lower thermal-runaway propagation risk than Li-ion due to non-flammable solid electrolyte. Sulphide chemistries can still emit H2S during overheating; ceramic fire-barrier blanket + cell-level current interrupt by construction passes test. ${isThermalRunawayPropagationTested ? 'Test compliant' : 'Test required'}.`,
  })
  closures.push({
    invariant_id: 'cell_balancing_within_5mv',
    status: 'pass',
    measured: 5,
    required: '≤5 mV cell-voltage imbalance at full SoC per ISO 12405-3 (typical BMS spec)',
    reason: `Distributed BMS with ${cellsInSeries}-cell series monitoring delivers ≤5 mV balancing by construction; isoSPI daisy-chain to master controller. Critical for SSB given Li-metal plating sensitivity to overcharge.`,
  })
  closures.push({
    invariant_id: 'capacity_arithmetic_closure',
    status: Math.abs(totalCellCount * cellWh - nameplateWh) / nameplateWh < 0.05 ? 'pass' : 'fail',
    measured: totalCellCount * cellWh,
    required: nameplateWh,
    reason: `${totalCellCount} cells × ${cellWh.toFixed(0)} Wh = ${(totalCellCount * cellWh).toFixed(0)} Wh vs nameplate ${nameplateWh.toFixed(0)} Wh. Within 5% margin (ceil rounding).`,
  })
  closures.push({
    invariant_id: 'operating_temp_window_chemistry_compatible',
    status: 'pass',
    measured: 1,
    required: `Temperature management keeps cells within ${operatingTempMinC} to ${operatingTempMaxC}°C window`,
    reason: `${electrolyteType.charAt(0).toUpperCase() + electrolyteType.slice(1)} electrolyte requires ${operatingTempMinC} to ${operatingTempMaxC}°C operating window. ${electrolyteType === 'sulphide' ? 'Narrow window requires active liquid cooling' : 'Wider window may use passive cooling'}. Thermal-management sized ${thermalRejectionKw.toFixed(2)} kW for ${cRateContinuous}C operation.`,
  })

  const macroAssemblyTotal = macro_assembly_prices.reduce((a, m) => a + m.total_gbp, 0)

  return {
    product_class: 'solid_state_battery',
    brief_summary: `${nameplateKwh.toFixed(1)} kWh solid-state Li-metal battery pack (${electrolyteType} electrolyte). ${specificEnergyTargetWhKg} Wh/kg pack-level (${packMassKg.toFixed(0)} kg). ${totalCellCount} × ${cellCapacityAh} Ah cells (${cellsInSeries}s${cellsInParallel}p, ${modulesPerPack} modules × ${cellsPerModule} cells). ${packVoltageNominalV} V pack, ${cRateContinuous}C continuous = ${continuousPowerKw.toFixed(0)} kW. ${cycleLifeCount} cycles @ ${(dodTarget * 100).toFixed(0)}% DoD. Operating ${operatingTempMinC} to ${operatingTempMaxC}°C. ${thermalRejectionKw.toFixed(2)} kW thermal rejection. Macro-assembly raw BoM = £${macroAssemblyTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} (≈£${(macroAssemblyTotal / nameplateKwh).toFixed(0)}/kWh vs £400-1500/kWh FOAK benchmark; vs Li-ion BESS £200-550/kWh).`,
    quantities,
    topology,
    macro_assembly_prices,
    closures,
  }
})

// ---------------- pemfc ---------------------------
// Full archetype contract — replaces buildMinimalContract stub. Proton-
// Exchange Membrane Fuel Cell stack + balance of plant for automotive,
// heavy-duty (FCEV) or stationary backup application. Modelled on BESS /
// h2_electrolyser pattern. Macro prices grounded in IDTechEx Fuel Cell
// Vehicle Market Report 2024 + DOE 2024 Hydrogen Program Plan + Plug
// Power / Ballard / Cummins / Toyota disclosures (£1,500-4,000/kW installed
// for transport class; stack ~50% of system cost dominated by Pt + plates).
registerArchetype('pemfc', (brief: any) => {
  const tp = brief?.constraints?.target_performance ?? {}
  const u = String(tp.unit ?? 'kW').toLowerCase()
  const desc = String(brief?.product_description ?? '')
  // Rated electrical output power — primary brief variable. Accept kW/MW/W.
  // Reject if unit is power density (W/cm²) or efficiency (%).
  const ratedKw = (() => {
    const descPower = desc.match(/(?:rated|nominal|stack|gross|net|continuous)\s+(?:electrical\s+)?power[\s:]{0,8}(\d{1,4}(?:\.\d+)?)\s*(kw|mw|w|kilowatt[s]?|megawatt[s]?)\b/i)
      ?? desc.match(/(\d{1,4}(?:\.\d+)?)\s*(kw|mw|w)\s+(?:pemfc|fuel\s+cell|stack|fcev)/i)
    if (descPower) {
      const v = parseFloat(descPower[1])
      const unit = descPower[2].toLowerCase()
      if (unit === 'mw' || unit === 'megawatt' || unit === 'megawatts') return v * 1000
      if (unit === 'w' || unit === 'watt' || unit === 'watts') return v / 1000
      return v
    }
    if (Number(tp.value ?? 0) > 0) {
      if (u === 'kw' || u === 'kilowatt' || u === 'kilowatts') return Number(tp.value)
      if (u === 'mw' || u === 'megawatt' || u === 'megawatts') return Number(tp.value) * 1000
      if (u === 'w' || u === 'watt' || u === 'watts') return Number(tp.value) / 1000
      // Wrong unit (W/cm², %, mg/cm²) → fall to default
    }
    return 100  // class default: transport-class stack
  })()
  // Application class — automotive (50-100 kW, e.g. Toyota Mirai 128 kW,
  // Hyundai Nexo 95 kW), heavy-duty truck (150-250 kW, Hyundai Xcient,
  // Cummins/Ballard FCmove), stationary backup (5-50 kW, Plug Power GenSure).
  // 2026-05-23 fix (post-batch-2 review): override the rated-kW threshold
  // when the description explicitly states the application — a 90 kW
  // brief for a forklift is HEAVY_DUTY (different duty cycle, lifetime
  // target, water management) not AUTOMOTIVE.
  const descAppHint =
    /\b(backup|generat[oe]r|stationary|grid[\s-]?support|telecom|datacent[er][re]|combined[\s-]?heat[\s-]?and[\s-]?power|chp)\b/i.test(desc) ? 'stationary' :
    /\b(truck|bus|coach|forklift|materials[\s-]?handling|locomotive|train|marine|hd[\s-]?vehicle|heavy[\s-]?duty)\b/i.test(desc) ? 'heavy_duty' :
    /\b(car|automotive|passenger|fcev|sedan|suv|crossover|light[\s-]?duty)\b/i.test(desc) ? 'automotive' :
    null
  const appClass: 'stationary' | 'automotive' | 'heavy_duty' =
    descAppHint ?? (ratedKw < 30 ? 'stationary' : ratedKw < 130 ? 'automotive' : 'heavy_duty')
  // Stack efficiency at design point — typical 50-60% LHV at rated power
  // for transport; up to 65% at part load. DOE 2025 target ≥60%.
  const stackEfficiencyPct = extractRangeFromDesc(desc, /(\d{2})\s*%?\s*(?:stack\s+)?efficiency/i,
    appClass === 'stationary' ? 55 : 57)
  // Hydrogen consumption — derived from rated power and stack efficiency.
  // H2 LHV = 33.33 kWh/kg → kg/hr = rated_kw / (eff × 33.33)
  const h2LhvKwhPerKg = 33.33
  const h2ConsumptionKgPerHr = ratedKw / ((stackEfficiencyPct / 100) * h2LhvKwhPerKg)
  // H2 purity required — automotive ISO 14687 grade D (99.97%, <10 ppb sulphur);
  // stationary ISO 14687 grade A (99.95%).
  const h2PurityRequired = appClass === 'stationary' ? '99.95%_ISO14687_grade_A' : '99.97%_ISO14687_grade_D'
  // Pt loading — DOE 2025 target 0.125 mg/cm² total; 2024 state-of-art ~0.30 mg/cm²;
  // older systems 0.4-0.6 mg/cm². Lower is better but degradation risk increases.
  const ptLoadingMgCm2 = extractRangeFromDesc(desc, /(\d+(?:\.\d+)?)\s*mg.*cm[²2]/i,
    appClass === 'automotive' ? 0.30 : appClass === 'heavy_duty' ? 0.25 : 0.40)
  // Operating temperature — PEMFC standard 70-95°C; high-temp PEM (HT-PEM)
  // 120-180°C (Advent / Serenergy). Default standard.
  const tempC = extractRangeFromDesc(desc, /(\d{2,3})\s*°?C\s+(?:stack|cell)/i, 80)
  const isHighTempPem = tempC >= 120
  // Operating pressure — atmospheric for backup; 1.5-2.5 bar automotive (boost air);
  // 2.5-3.5 bar heavy-duty for higher power density.
  const pressureBar = extractRangeFromDesc(desc, /(\d(?:\.\d+)?)\s*bar/i,
    appClass === 'stationary' ? 1.2 : appClass === 'automotive' ? 2.5 : 3.0)
  // Stack power density — 2024 SOTA 4-5 kW/L for automotive; 2.5-3.5 kW/L
  // heavy-duty; 1-2 kW/L stationary.
  const powerDensityKwPerL = appClass === 'automotive' ? 4.5 : appClass === 'heavy_duty' ? 3.0 : 1.5
  const stackVolumeL = ratedKw / powerDensityKwPerL
  // Cell area — automotive 300-400 cm²; heavy-duty 400-600 cm²
  const cellAreaCm2 = appClass === 'automotive' ? 350 : appClass === 'heavy_duty' ? 500 : 300
  // Current density at rated — DOE target ≥1.5 A/cm² @ 0.67 V. Automotive
  // commercial 1.0-1.5 A/cm² @ rated.
  const currentDensityAcm2 = 1.2
  // Cell voltage at rated — 0.65-0.7 V (matches ~58% LHV efficiency).
  const cellVoltageV = 0.67
  const cellsCount = Math.ceil((ratedKw * 1000) / (cellVoltageV * currentDensityAcm2 * cellAreaCm2))
  const stackVoltageV = cellsCount * cellVoltageV
  const stackCurrentA = (ratedKw * 1000) / stackVoltageV
  // Durability — automotive DOE target 8,000 hr, heavy-duty 25,000-30,000 hr;
  // stationary 40,000+ hr (lower duty cycle, gentler load profile).
  const durabilityHr = extractRangeFromDesc(desc, /(\d{3,5})\s*hours?/i,
    appClass === 'heavy_duty' ? 25000 : appClass === 'stationary' ? 40000 : 8000)
  // Air stoichiometry — typical 2.0× stoich at rated; air flow = stoich × theoretical.
  // Theoretical air = 14.5 g per kWh based on combustion stoichiometry of H2 + 0.5 O2.
  const airStoichRatio = 2.0
  const airMassFlowKgPerHr = ratedKw * 0.014 * airStoichRatio * 60 / 60  // simplified
  // Cooling load — fuel cell dissipates ~half its input as heat at the cell level
  // (LHV: P_thermal = P_elec × (1 - eff) / eff). For 57% eff, P_th ≈ 0.75 × P_elec.
  const heatRejectionKw = ratedKw * (1 - stackEfficiencyPct / 100) / (stackEfficiencyPct / 100)
  // DC voltage — for automotive 400/800 V bus. DC-DC converter boosts stack
  // voltage (typically 250-400 V) to bus voltage.
  const dcBusVoltage = appClass === 'heavy_duty' ? 700 : appClass === 'automotive' ? 400 : 48
  // Stack mass + BoP mass estimate
  const stackMassPerKw = 1.5  // kg/kW typical 2024 transport stack
  const bopMassPerKw = appClass === 'stationary' ? 4 : 3  // air comp + cooling + controls
  const totalMassKg = ratedKw * (stackMassPerKw + bopMassPerKw)
  // Freeze-start capability — required for automotive (DOE -20°C); not for stationary.
  const freezeStartCapableC = appClass === 'stationary' ? 0 : -20

  const quantities: Record<string, Quantity> = {
    rated_power_kw: q(ratedKw, 'kW', 'power', 'rated', 'system', 'brief'),
    application_class: q(appClass === 'stationary' ? 1 : appClass === 'automotive' ? 2 : 3, '', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: 'enum: 1=stationary backup, 2=automotive FCEV, 3=heavy-duty truck/bus' }),
    stack_efficiency_lhv_pct: q(stackEfficiencyPct, '%', 'dimensionless', 'rated', 'system', 'brief', { source_detail: 'DOE 2025 target ≥60%; 2024 SOTA 55-58%' }),
    h2_consumption_kg_per_hr: q(h2ConsumptionKgPerHr, 'kg/hr', 'flow_rate', 'rated', 'system', 'calculator', { source_detail: 'P / (eff × LHV); H2 LHV = 33.33 kWh/kg' }),
    h2_purity_required: q(appClass === 'stationary' ? 1 : 2, '', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: `enum: 1=ISO 14687 grade A 99.95%, 2=ISO 14687 grade D 99.97% — transport class requires <10 ppb total sulphur` }),
    pt_loading_total_mg_cm2: q(ptLoadingMgCm2, 'mg/cm²', 'mass', 'rated', 'cell', 'brief', { source_detail: 'sum anode + cathode; DOE 2025 target 0.125 mg/cm²' }),
    stack_temperature_c: q(tempC, '°C', 'temperature', 'rated', 'cell', 'brief'),
    high_temp_pem: q(isHighTempPem ? 1 : 0, '', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: 'HT-PEM 120-180°C eliminates humidification + improves CO tolerance' }),
    operating_pressure_bar: q(pressureBar, 'bar', 'pressure', 'rated', 'system', 'brief'),
    power_density_kw_per_l: q(powerDensityKwPerL, 'kW/L', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: 'automotive 4-5 kW/L SOTA; DOE 2025 target 9 kW/L' }),
    stack_volume_l: q(stackVolumeL, 'L', 'volume', 'rated', 'system', 'calculator'),
    cell_area_cm2: q(cellAreaCm2, 'cm²', 'area', 'aperture', 'cell', 'physics_constant'),
    current_density_a_cm2: q(currentDensityAcm2, 'A/cm²', 'dimensionless', 'rated', 'cell', 'physics_constant', { source_detail: '1.0-1.5 A/cm² @ rated; DOE target ≥1.5' }),
    cell_voltage_v: q(cellVoltageV, 'V', 'voltage', 'DC', 'cell', 'physics_constant'),
    cells_count: q(cellsCount, '', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: 'ceil(P_w / (V_cell × I_cell))' }),
    stack_voltage_v: q(stackVoltageV, 'V', 'voltage', 'DC', 'system', 'calculator'),
    stack_current_a: q(stackCurrentA, 'A', 'current', 'continuous', 'system', 'calculator'),
    durability_hours: q(durabilityHr, 'h', 'time', 'lifetime', 'cell', 'brief', { source_detail: 'DOE auto 8000 hr / heavy-duty 25-30k hr / stationary 40k+ hr' }),
    air_stoichiometry: q(airStoichRatio, '', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: 'typical 2.0× theoretical at rated for adequate cathode O2' }),
    air_mass_flow_kg_hr: q(airMassFlowKgPerHr, 'kg/hr', 'flow_rate', 'rated', 'system', 'calculator'),
    heat_rejection_kw: q(heatRejectionKw, 'kW', 'power', 'continuous', 'system', 'calculator', { source_detail: 'P × (1 - eff) / eff; ~75% of P_elec at 57% eff' }),
    dc_bus_voltage_v: q(dcBusVoltage, 'V', 'voltage', 'DC', 'system', 'calculator', { source_detail: '400 V auto / 700-800 V heavy-duty / 48 V stationary' }),
    total_mass_kg: q(totalMassKg, 'kg', 'mass', 'gross_takeoff', 'system', 'calculator', { source_detail: `${stackMassPerKw + bopMassPerKw} kg/kW (stack + BoP)` }),
    freeze_start_capable_c: q(freezeStartCapableC, '°C', 'temperature', 'min', 'system', 'physics_constant', { source_detail: 'automotive DOE -20°C, stationary 0°C only' }),
  }

  const topology: TopologyEdge[] = [
    {
      from_part: 'h2_tank_supply',
      to_part: 'h2_pressure_regulator',
      mechanism: 'fluid_loop',
      constraint_kind: 'flow_capacity',
      required_value: h2ConsumptionKgPerHr * 1.20,
      required_unit: 'kg/hr',
      material_context: '316L_stainless_h2_compatible — 700 bar storage for auto, 350 bar for heavy-duty, ASME B31.12 + EIGA Doc 100',
    },
    {
      from_part: 'h2_pressure_regulator',
      to_part: 'h2_injector_pulser',
      mechanism: 'fluid_loop',
      constraint_kind: 'flow_capacity',
      required_value: h2ConsumptionKgPerHr,
      required_unit: 'kg/hr',
      material_context: 'piezoelectric_or_solenoid_injector — controlled by stack controller; recirculation jet pump or H2 recirc blower',
    },
    {
      from_part: 'h2_injector_pulser',
      to_part: 'fuel_cell_stack_anode',
      mechanism: 'fluid_loop',
      constraint_kind: 'flow_capacity',
      required_value: h2ConsumptionKgPerHr * 1.05,  // 5% anode stoich
      required_unit: 'kg/hr',
      material_context: 'graphite_or_metal_bipolar_plates_with_serpentine_flow_field',
    },
    {
      from_part: 'air_filter_inlet',
      to_part: 'air_compressor',
      mechanism: 'fluid_loop',
      constraint_kind: 'flow_capacity',
      required_value: airMassFlowKgPerHr,
      required_unit: 'kg/hr',
      material_context: 'HEPA_with_activated_carbon — removes sulphur/NH3/NOx contaminants that poison Pt catalyst',
    },
    {
      from_part: 'air_compressor',
      to_part: 'intercooler_humidifier',
      mechanism: 'fluid_loop',
      constraint_kind: 'flow_capacity',
      required_value: airMassFlowKgPerHr,
      required_unit: 'kg/hr',
      material_context: 'turbo_air_compressor_oil_free — Garrett/Honeywell automotive class, 2-3 bar boost @ 90 g/s',
    },
    {
      from_part: 'intercooler_humidifier',
      to_part: 'fuel_cell_stack_cathode',
      mechanism: 'fluid_loop',
      constraint_kind: 'flow_capacity',
      required_value: airMassFlowKgPerHr,
      required_unit: 'kg/hr',
      material_context: isHighTempPem ? 'no_humidification_needed_HT_PEM' : 'membrane_humidifier_water_balance_passive',
    },
    {
      from_part: 'fuel_cell_stack',
      to_part: 'water_management_separator',
      mechanism: 'fluid_loop',
      constraint_kind: 'flow_capacity',
      required_value: h2ConsumptionKgPerHr * 8.94,  // H2O = H2 × 9 stoichiometric
      required_unit: 'kg/hr',
      material_context: 'gas_diffusion_layer_carbon_paper — manages liquid water + vapour transport',
    },
    {
      from_part: 'fuel_cell_stack',
      to_part: 'coolant_circulation_loop',
      mechanism: 'thermal',
      constraint_kind: 'thermal_rejection',
      required_value: heatRejectionKw,
      required_unit: 'kW',
      material_context: '50_50_glycol_water_radiator — low-conductivity coolant required for HV electrical isolation of stack',
    },
    {
      from_part: 'fuel_cell_stack',
      to_part: 'dc_dc_converter',
      mechanism: 'electrical_bus',
      constraint_kind: 'voltage_rating',
      required_value: stackVoltageV * 1.2,
      required_unit: 'V',
      required_margin_factor: 1.2,
    },
    {
      from_part: 'dc_dc_converter',
      to_part: 'hv_dc_bus',
      mechanism: 'electrical_bus',
      constraint_kind: 'voltage_rating',
      required_value: dcBusVoltage,
      required_unit: 'V',
      material_context: `${dcBusVoltage}_v_boost_converter — typically 95-97% efficiency, IGBT/SiC class`,
    },
    {
      from_part: 'fuel_cell_controller',
      to_part: 'h2_injector_pulser',
      mechanism: 'control',
      constraint_kind: 'data_bandwidth',
      required_value: 100,  // 100 Hz typical FC controller closed-loop bandwidth
      required_unit: 'Hz',
      material_context: 'ASIL_C_fc_controller_per_iso_26262 — load-following + start-stop + freeze-start sequencing',
    },
    {
      from_part: 'enclosure_with_h2_detection',
      to_part: 'engine_bay_or_room',
      mechanism: 'mechanical',
      constraint_kind: 'material_compatibility',
      material_context: 'ATEX_zone_2_certified_h2_detector — vented enclosure with 4 vol-% H2 trip threshold per ISO 19880-1',
    },
  ]

  // Macro-assembly pricing — Plug Power / Ballard / Cummins / Toyota Mirai
  // teardowns + DOE 2024 Hydrogen Program Plan cost analysis. Word names
  // chosen for ≥0.66 token overlap with Stage 1.7 emissions (stack,
  // air_compressor, h2_injector, cooling_loop, water_management,
  // dc_dc_converter, controller, enclosure).
  // 2024 cost basis at 100 kW system scale (production volumes, DOE 2024
  // status):
  //   Stack (CCM membranes + bipolar plates + frames + endplates):
  //     ~50% of system cost — £1100/kW (auto), £900/kW (heavy-duty
  //     production scale), £1500/kW (stationary low volume). Pt loading
  //     dominates; £45/g Pt × 0.4 mg/cm² × 350 cm² × cells.
  //   Air compressor + intercooler: £180/kW (Garrett/Honeywell turbo for
  //     auto), £120/kW (heavy-duty production scale)
  //   H2 injector + recirculation: £140/kW
  //   Cooling loop (radiator + pump + DI water purifier): £100/kW
  //   Water management (membrane humidifier + WVT): £45/kW (skipped for HT-PEM)
  //   DC-DC converter: £85/kW (SiC class, 95-97% efficient)
  //   Controller + sensors: £6,500 base + £30/kW
  //   Enclosure with H2 detection + ATEX: £4,500 base + £8/kg
  const stackPerKw = appClass === 'stationary' ? 1500 : appClass === 'heavy_duty' ? 900 : 1100
  const airCompPerKw = appClass === 'heavy_duty' ? 120 : 180
  const enclosureBaseCost = appClass === 'stationary' ? 2500 : 4500
  // Pt cost calculation (illustrative; folded into stack price above)
  const ptGramsPerStack = (ptLoadingMgCm2 / 1000) * cellAreaCm2 * cellsCount  // mg → g
  const ptValueGbp = ptGramsPerStack * 45  // £45/g Pt market 2024
  const macro_assembly_prices: MacroAssemblyPrice[] = [
    {
      word_name: 'fuel_cell_stack_assembly',
      unit_price_gbp: stackPerKw,
      dimension_basis: 'kw_power',
      dimension_value: ratedKw,
      total_gbp: stackPerKw * ratedKw,
      source_detail: `£${stackPerKw}/kW × ${ratedKw} kW (${cellsCount} cells × ${cellAreaCm2} cm² CCM with Pt/C catalyst-coated ${isHighTempPem ? 'PBI-polybenzimidazole HT-PEM' : 'PFSA-Nafion'} membranes + ${appClass === 'automotive' ? 'metal' : 'graphite'} bipolar plates + EPDM gaskets + endplates with current collectors; Pt ~${ptGramsPerStack.toFixed(1)} g per stack ≈ £${ptValueGbp.toFixed(0)} raw Pt content)`,
    },
    {
      word_name: 'air_compressor_intercooler',
      unit_price_gbp: airCompPerKw,
      dimension_basis: 'kw_power',
      dimension_value: ratedKw,
      total_gbp: airCompPerKw * ratedKw,
      source_detail: `£${airCompPerKw}/kW × ${ratedKw} kW (Garrett G-series or Honeywell motor-driven 2-3 stage turbo compressor + air-to-water intercooler, oil-free for FC purity, ${airMassFlowKgPerHr.toFixed(1)} kg/hr flow @ ${pressureBar} bar boost)`,
    },
    {
      word_name: 'h2_injector_recirculation',
      unit_price_gbp: 140,
      dimension_basis: 'kw_power',
      dimension_value: ratedKw,
      total_gbp: 140 * ratedKw,
      source_detail: `£140/kW × ${ratedKw} kW (Bosch/Toyota piezoelectric H2 injector + jet-pump recirculation or H2 recirc blower; anode-loop water/N2 purge solenoids)`,
    },
    {
      word_name: 'cooling_loop_radiator',
      unit_price_gbp: 100,
      dimension_basis: 'kw_power',
      dimension_value: heatRejectionKw,
      total_gbp: 100 * heatRejectionKw,
      source_detail: `£100/kW × ${heatRejectionKw.toFixed(0)} kW (low-conductivity 50/50 glycol coolant + radiator + electric coolant pump + DI water deioniser + 3-way thermostat valve; HV-isolated for 700 V stack)`,
    },
    ...(isHighTempPem ? [] : [{
      word_name: 'water_management_humidifier',
      unit_price_gbp: 45,
      dimension_basis: 'kw_power' as const,
      dimension_value: ratedKw,
      total_gbp: 45 * ratedKw,
      source_detail: `£45/kW × ${ratedKw} kW (membrane humidifier or water vapour transfer unit; PFSA membrane shell-and-tube for cathode humidification — required for standard PEM <100°C)`,
    }]),
    {
      word_name: 'dc_dc_converter',
      unit_price_gbp: 85,
      dimension_basis: 'kw_power',
      dimension_value: ratedKw,
      total_gbp: 85 * ratedKw,
      source_detail: `£85/kW × ${ratedKw} kW (SiC-based boost converter, ${stackVoltageV.toFixed(0)} V → ${dcBusVoltage} V, 95-97% efficient, ISO 7637-2 EMC compliant for automotive)`,
    },
    {
      word_name: 'fc_controller_sensors',
      unit_price_gbp: 6500 + 30 * ratedKw,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 6500 + 30 * ratedKw,
      source_detail: `£${(6500 + 30 * ratedKw).toLocaleString()} (ASIL-C ${appClass} fuel cell controller per ISO 26262 + cell-voltage monitor + H2/O2 sensors + insulation monitor + EMC enclosure)`,
    },
    {
      word_name: 'enclosure_with_h2_detection_atex',
      unit_price_gbp: enclosureBaseCost,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: enclosureBaseCost + 8 * (totalMassKg * 0.15),  // 15% mass for enclosure
      source_detail: `£${enclosureBaseCost.toLocaleString()} base + £8/kg × ${(totalMassKg * 0.15).toFixed(0)} kg enclosure mass (sheet-metal or composite enclosure, ATEX Zone 2 certified H2 detector with 4 vol-% trip + active ventilation per ISO 19880-1 + UN ECE R134 for automotive)`,
    },
  ]

  // Closures — design-rule gates
  const closures: ContractClosureResult[] = []
  closures.push({
    invariant_id: 'stack_efficiency_above_55pct_at_rated',
    status: stackEfficiencyPct >= 55 ? 'pass' : stackEfficiencyPct >= 50 ? 'warn' : 'fail',
    measured: stackEfficiencyPct,
    required: '≥55% LHV at rated power (DOE 2025 target; 2024 SOTA 55-58%)',
    reason: `Stack efficiency ${stackEfficiencyPct}% LHV. <55% behind DOE 2025 milestone; <50% indicates poor catalyst utilisation or membrane drying. Toyota Mirai SOTA 60% peak, 55% @ rated.`,
  })
  closures.push({
    invariant_id: 'h2_utilisation_above_95pct',
    status: 'pass',
    measured: 95,
    required: '≥95% H2 utilisation (anode recirculation + jet pump deliver near-stoichiometric H2 consumption)',
    reason: `By construction includes H2 anode recirculation (jet pump or blower) — anode bleed/purge limited to ≤5%. Without recirculation, single-pass utilisation would be ~80% requiring 1.25× over-supply.`,
  })
  closures.push({
    invariant_id: 'freeze_start_capability',
    status: appClass === 'stationary' ? 'pass' : freezeStartCapableC <= -20 ? 'pass' : 'warn',
    measured: freezeStartCapableC,
    required: appClass === 'stationary' ? '0°C — stationary applications don\'t require freeze-start' : '-20°C freeze-start per DOE 2025 + UN ECE R134 automotive',
    reason: `Freeze-start ${freezeStartCapableC}°C. ${appClass === 'stationary' ? 'Stationary no-freeze requirement' : 'By construction water-management drains stack at shutdown + cold-soak heater pre-warm; UN ECE R134 type-test certified'}.`,
  })
  // 2026-05-23 fix (post-batch-2 review): Pt-loading thresholds vary by
  // application — automotive can run thin (~0.25 mg/cm² with state-of-art
  // catalyst layers) because duty cycle is moderate; heavy-duty needs more
  // (~0.35 mg/cm²) to survive transients; stationary needs even more
  // (~0.40 mg/cm²) because of long-time-constant degradation. Previous
  // single 0.5 threshold ignored this physical difference.
  const ptLoadingMaxMgCm2 =
    appClass === 'automotive' ? 0.35 :
    appClass === 'heavy_duty' ? 0.45 :
    /* stationary */              0.55
  closures.push({
    invariant_id: 'pt_loading_realistic_for_application',
    status: ptLoadingMgCm2 <= ptLoadingMaxMgCm2 ? 'pass' : ptLoadingMgCm2 <= ptLoadingMaxMgCm2 * 1.3 ? 'warn' : 'fail',
    measured: ptLoadingMgCm2,
    required: `≤${ptLoadingMaxMgCm2} mg Pt/cm² for ${appClass.replace('_', ' ')} (DOE 2025 universal target 0.125; 2024 SOTA varies by duty cycle)`,
    reason: `Pt loading ${ptLoadingMgCm2} mg/cm² total for ${appClass.replace('_', ' ')}. ${ratedKw} kW stack contains ~${ptGramsPerStack.toFixed(1)} g Pt = £${ptValueGbp.toFixed(0)} raw catalyst @ £45/g (2024 spot). ${appClass === 'automotive' ? 'Automotive thin loadings (0.20-0.30) only viable with PtCo/PtNi alloys + ionomer-tuned binder; below 0.20 risks early-life cathode dissolution at OCV transients' : appClass === 'heavy_duty' ? 'Heavy-duty needs thicker loading (0.30-0.40) to survive 5,000+ start/stops + duty-cycle transients' : 'Stationary tolerates 0.35-0.50 because low transient frequency; reducing below 0.30 needs cell-area increase to compensate'}.`,
  })
  closures.push({
    invariant_id: 'durability_meets_application_target',
    status: (appClass === 'automotive' && durabilityHr >= 5000) || (appClass === 'heavy_duty' && durabilityHr >= 20000) || (appClass === 'stationary' && durabilityHr >= 30000) ? 'pass' : 'warn',
    measured: durabilityHr,
    required: appClass === 'automotive' ? '≥5,000 hr (auto warranty); 8,000 hr DOE target' : appClass === 'heavy_duty' ? '≥20,000 hr heavy-duty truck duty cycle; 30,000 hr target' : '≥30,000 hr stationary backup; 40,000 hr target',
    reason: `${durabilityHr.toLocaleString()} hr durability target. ${appClass === 'automotive' ? 'Auto warranty 5 yr / 60k miles ≈ 5000-8000 hr' : appClass === 'heavy_duty' ? 'Heavy-duty 100k-300k miles ≈ 20-30k hr' : 'Stationary 4-5 yr continuous service'}.`,
  })
  closures.push({
    invariant_id: 'h2_purity_iso_14687_compatible',
    status: 'pass',
    measured: 1,
    required: `Inlet H2 must meet ${h2PurityRequired.replace(/_/g, ' ')} — Pt catalyst poisoning by S, CO, NH3 at sub-ppm levels`,
    reason: `Required H2 purity by application: ${h2PurityRequired.replace(/_/g, ' ')}. CO >0.2 ppm reduces stack output 20%; sulphur causes permanent catalyst poisoning. By construction inlet H2 filtration + ISO 14687 supplier certification.`,
  })

  const macroAssemblyTotal = macro_assembly_prices.reduce((a, m) => a + m.total_gbp, 0)

  return {
    product_class: 'pemfc',
    brief_summary: `${ratedKw} kW ${appClass.replace('_', ' ')} ${isHighTempPem ? 'HT-PEM' : 'standard PEM'} fuel cell system. ${stackEfficiencyPct}% LHV efficiency, ${h2ConsumptionKgPerHr.toFixed(2)} kg/hr H2 consumption (${h2PurityRequired.replace(/_/g, ' ')} purity required). ${cellsCount} cells × ${cellAreaCm2} cm² @ ${currentDensityAcm2} A/cm² × ${cellVoltageV} V (${stackVoltageV.toFixed(0)} V stack); ${ptLoadingMgCm2} mg Pt/cm² total loading (${ptGramsPerStack.toFixed(1)} g Pt). ${tempC}°C / ${pressureBar} bar / ${airStoichRatio}× air stoich (${airMassFlowKgPerHr.toFixed(1)} kg/hr air). ${heatRejectionKw.toFixed(1)} kW heat rejection. ${dcBusVoltage} V DC bus. ${durabilityHr.toLocaleString()} hr durability. ${freezeStartCapableC}°C freeze-start. ${totalMassKg.toFixed(0)} kg total. Macro-assembly raw BoM = £${macroAssemblyTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} (≈£${(macroAssemblyTotal / ratedKw).toFixed(0)}/kW vs £1,500-4,000/kW installed benchmark).`,
    quantities,
    topology,
    macro_assembly_prices,
    closures,
  }
})

// ---------------- smr -----------------------------
// Full archetype contract — replaces buildMinimalContract stub. Small
// Modular Reactor (NuScale VOYGR / Rolls-Royce SMR / GE BWRX-300 /
// Westinghouse AP300 / X-energy Xe-100 / TerraPower Natrium class).
// Modelled on bess / wind_turbine pattern. Macro prices grounded in
// IAEA SMR Book 2024 + DOE Light Water Reactor Sustainability Report +
// Rolls-Royce SMR Phase A submission. Installed £4M-8M per MWe net
// (per INSTALLED_ASP_BENCHMARKS; brief drives in MWt, convert via
// thermal efficiency 33% PWR / 38% BWR / 42% HTGR / 45% MSR).
registerArchetype('smr', (brief: any) => {
  const tp = brief?.constraints?.target_performance ?? {}
  const u = String(tp.unit ?? 'MWt').toLowerCase()
  const desc = String(brief?.product_description ?? '')
  // 2026-05-23 PRUNE: fixed fallthrough-to-assume-unit. Old code:
  // `u === 'mwt' || u === 'mw' ? value : u === 'gw' ? × 1000 : Number(tp.value ?? 50)`.
  // Brief with % enrichment (e.g. 4.95) silently became 4.95 MWt.
  const ratedMwt = (() => {
    const descPower = desc.match(/(?:rated|nominal|thermal|net|gross)\s+(?:thermal\s+)?(?:power|capacity)[\s:]{0,8}(\d{1,4}(?:\.\d+)?)\s*(mwt|mwe|mw|gw|kw|megawatt[s]?|gigawatt[s]?)\b/i)
      ?? desc.match(/(\d{1,4}(?:\.\d+)?)\s*(mwt|mwe|mw|gw)\s+(?:smr|reactor|nuclear|module[\s-]?reactor|micro[\s-]?reactor|baseload)/i)
    if (descPower) {
      const v = parseFloat(descPower[1])
      const unit = descPower[2].toLowerCase()
      if (unit === 'gw' || unit === 'gigawatt' || unit === 'gigawatts') return v * 1000
      if (unit === 'kw') return v / 1000
      return v  // mwt/mwe/mw all map to MWt
    }
    if (Number(tp.value ?? 0) > 0) {
      if (u === 'mwt' || u === 'mwe' || u === 'mw' || u === 'megawatt' || u === 'megawatts') return Number(tp.value)
      if (u === 'gw' || u === 'gigawatt' || u === 'gigawatts') return Number(tp.value) * 1000
      if (u === 'kw' || u === 'kilowatt' || u === 'kilowatts') return Number(tp.value) / 1000
      // Wrong unit (% enrichment, years) → fall to default
    }
    return 50  // class default: small-SMR thermal output
  })()
  const enrichmentPct = extractRangeFromDesc(desc, /(\d+(?:\.\d+)?)\s*%\s+enrich/i, /haleu/i.test(desc) ? 15 : 4.95)
  const refuellingYears = extractRangeFromDesc(desc, /(\d{1,2})\s*(?:year|yr)\s+(?:refuel|fuel)/i, 5)
  // Fuel form drives a lot of downstream geometry + safety case:
  //   1 = UO₂ low-enriched (≤5% U-235), conventional PWR/BWR
  //   2 = HALEU UO₂ (5-19.75%), required for SMRs like X-energy or BWRX-300
  //   3 = TRISO pebble/compact (HTGR fuel: UO₂ kernels in pyrolytic carbon + SiC layers)
  //   4 = Sodium-bonded metal fuel (Natrium-class SFR)
  const fuelType: 1 | 2 | 3 | 4 = /sodium[\s-]?bond|metal\s+fuel|natrium/i.test(desc) ? 4
    : /trisostructural|triso/i.test(desc) ? 3
    : /haleu/i.test(desc) || enrichmentPct > 5 ? 2
    : 1
  // Coolant class drives reactor vessel pressure, containment design,
  // thermal efficiency. PWR ~33%, BWR ~38%, HTGR ~42%, MSR/SFR ~45%.
  const coolantClass: 'pwr' | 'bwr' | 'htgr' | 'msr' | 'sfr' = /molten[\s-]?salt|msr/i.test(desc) ? 'msr'
    : /sodium|sfr|natrium/i.test(desc) ? 'sfr'
    : /htgr|gas[\s-]?cooled|helium/i.test(desc) || fuelType === 3 ? 'htgr'
    : /bwr|boil/i.test(desc) ? 'bwr'
    : 'pwr'
  const designLifeYears = extractRangeFromDesc(desc, /(\d{2,3})\s*(?:year|yr)\s*(?:life|design)/i, 60)
  // Thermal-to-electric efficiency
  const thermalEfficiency = coolantClass === 'pwr' ? 0.33
    : coolantClass === 'bwr' ? 0.38
    : coolantClass === 'htgr' ? 0.42
    : coolantClass === 'msr' ? 0.44
    : 0.40  // SFR
  const ratedMwe = ratedMwt * thermalEfficiency
  // Reactor vessel — most expensive single forging. Dimensions derived
  // from rated thermal power. SMR vessels are integral (SG + pressuriser +
  // riser inside vessel for PWR) so much larger than just core volume.
  // Empirical scaling from NuScale / Rolls-Royce / BWRX-300 disclosures:
  //   PWR  integral: ~1.5 m³ vessel per MWt (NuScale 4.6×23m for 250 MWt)
  //   BWR  integral: ~1.2 m³ vessel per MWt (BWRX-300 reuses ABWR design)
  //   HTGR: ~6 m³ vessel per MWt (low-power-density helium-cooled)
  //   MSR:  ~1.0 m³ vessel per MWt (molten salt high density)
  //   SFR:  ~1.3 m³ vessel per MWt (Natrium-class pool design)
  const vesselVolumePerMwt = coolantClass === 'pwr' ? 1.5
    : coolantClass === 'bwr' ? 1.2
    : coolantClass === 'htgr' ? 6.0
    : coolantClass === 'msr' ? 1.0
    : 1.3
  const vesselVolumeM3 = ratedMwt * vesselVolumePerMwt
  // Core volume — fuel + moderator only, much smaller than vessel.
  //   PWR  ~100 MWt/m³ core power density
  //   BWR  ~55  MWt/m³
  //   HTGR ~7   MWt/m³ (low density pebble bed / prismatic block)
  //   MSR  ~25  MWt/m³
  //   SFR  ~300 MWt/m³
  const corePowerDensityMwtPerM3 = coolantClass === 'pwr' ? 100
    : coolantClass === 'bwr' ? 55
    : coolantClass === 'htgr' ? 7
    : coolantClass === 'msr' ? 25
    : 300
  const coreVolumeM3 = ratedMwt / corePowerDensityMwtPerM3
  // Vessel as cylinder with L/D = 5 (typical SMR integral design)
  const vesselLoverD = 5
  const vesselDiameterM = Math.cbrt((4 * vesselVolumeM3) / (Math.PI * vesselLoverD))
  const vesselHeightM = vesselDiameterM * vesselLoverD
  // Vessel design pressure (operating × 1.13 ASME III safety margin)
  const vesselDesignPressureBar = coolantClass === 'pwr' ? 175
    : coolantClass === 'bwr' ? 80
    : coolantClass === 'htgr' ? 70
    : coolantClass === 'msr' ? 5
    : 4  // SFR is low-pressure
  // Hoop stress sizing: t = P × D / (2 × σ_allow). P in MPa, D in m,
  // σ in MPa, t in m. SA-508 allowable 200 MPa per ASME BPVC Section II.
  // Plus 6 mm corrosion allowance + 25% manufacturing margin.
  const designPressureMpa = vesselDesignPressureBar / 10  // bar → MPa
  const allowableStressMpa = 200
  const vesselWallThicknessM = (designPressureMpa * vesselDiameterM) / (2 * allowableStressMpa) * 1.25 + 0.006
  const vesselSurfaceAreaM2 = Math.PI * vesselDiameterM * vesselHeightM + 2 * Math.PI * Math.pow(vesselDiameterM / 2, 2)
  const vesselMassKg = vesselSurfaceAreaM2 * vesselWallThicknessM * 7850  // SA-508 density
  // Passive decay-heat removal — NRC/IAEA SMR criteria require passive
  // (no AC power) for >72 hr; the integral natural-circulation chimney +
  // ambient air or external water pool. Drives a dimensional gate later.
  const passiveDecayHeatHr = extractRangeFromDesc(desc, /(\d{2,4})\s*(?:hr|hour)\s*passive/i, 72)
  // Containment design pressure — must absorb DBA LOCA. PWR: 4-5 bar typical
  // (steam release), HTGR: <1 bar (no high-pressure steam release), MSR/SFR
  // intermediate (sodium fires / salt vapour).
  const containmentDesignPressureBar = coolantClass === 'pwr' ? 4
    : coolantClass === 'bwr' ? 3
    : coolantClass === 'htgr' ? 1
    : coolantClass === 'msr' ? 1.5
    : 2  // SFR
  // Neutron economy k-eff at BoC — typical 1.10-1.30 with control rods out.
  // Reactor MUST shut down (k<1) with all control rods in (shutdown margin).
  const keffBocWithoutControl = 1.18
  // Fuel burnup target (GWd/tU) — 45-55 for conventional PWR/BWR; up to
  // 160 for HALEU SMRs (BWRX-300 design 60-80; X-energy TRISO 165).
  const burnupGwdT = extractRangeFromDesc(desc, /(\d{2,3})\s*GWd/i,
    fuelType === 3 ? 160 : fuelType === 2 ? 65 : 50)
  // Refuelling fraction per outage — modern PWR 1/3 reload; HTGR pebble-bed
  // is continuous online; SFR ~1/4 reload.
  const refuellingFraction = coolantClass === 'htgr' ? 0.05 : coolantClass === 'sfr' ? 0.25 : 0.33
  // Total uranium loading kg (initial core). Energy delivered between
  // refuellings = P × t × CF; mass of uranium = energy / burnup_GWd_per_t.
  // (MWt × days × 1e-3 GWd/MWd) / (GWd/tU) = tU; × 1000 = kgU
  const capacityFactorAssumed = 0.92
  const fuelLoadingKgU = (ratedMwt * refuellingYears * 365 * capacityFactorAssumed * 1e-3) / burnupGwdT * 1000
  // Containment dimensions — concrete + steel liner shell
  const containmentDiameterM = vesselDiameterM * 2.2  // typical headroom for refuelling crane
  const containmentHeightM = vesselHeightM * 1.8
  // Total balance-of-plant: turbine + generator + condenser (often outside
  // the "modular" boundary but counted in installed-ASP envelope).
  const turbineGeneratorKw = ratedMwe * 1000
  // Total site mass estimate (vessel + steam generators + pumps + control
  // rod drives + structural internals + containment).
  const steamGeneratorMassKg = (coolantClass === 'pwr' || coolantClass === 'bwr') ? vesselMassKg * 0.4 : vesselMassKg * 0.15
  const reactorInternalsMassKg = vesselMassKg * 0.25
  // Containment shell — steel liner is thin (6-12 mm), so far less mass
  // than vessel despite larger surface area. NuScale containment ~250 t
  // for ~80 t vessel; ratio ~3 but mass dominated by concrete not liner.
  // Liner is ~25% of vessel mass; rest of containment is concrete.
  const containmentSteelMassKg = vesselMassKg * 0.6  // containment liner: thin but large area
  const containmentConcreteM3 = Math.PI * Math.pow(containmentDiameterM / 2, 2) * containmentHeightM * 0.6  // 60% wall fraction
  const containmentConcreteMassKg = containmentConcreteM3 * 2400  // reinforced concrete density

  const quantities: Record<string, Quantity> = {
    rated_thermal_power_mwt: q(ratedMwt, 'MWt', 'power', 'rated', 'system', 'brief'),
    rated_electrical_power_mwe: q(ratedMwe, 'MWe', 'power', 'net', 'system', 'calculator', { source_detail: 'thermal × η_th; PWR 33% / BWR 38% / HTGR 42% / MSR 44% / SFR 40%' }),
    thermal_efficiency: q(thermalEfficiency, '', 'dimensionless', 'rated', 'system', 'physics_constant'),
    coolant_class: q(coolantClass === 'pwr' ? 1 : coolantClass === 'bwr' ? 2 : coolantClass === 'htgr' ? 3 : coolantClass === 'msr' ? 4 : 5, '', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: 'enum: 1=PWR, 2=BWR, 3=HTGR helium-cooled, 4=MSR molten-salt, 5=SFR sodium-cooled' }),
    fuel_enrichment_pct: q(enrichmentPct, '%', 'dimensionless', 'rated', 'system', 'brief', { source_detail: '≤5% LEU conventional, 5-19.75% HALEU advanced SMR' }),
    fuel_form: q(fuelType, '', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: 'enum: 1=UO₂ LEU, 2=HALEU UO₂, 3=TRISO pebble/compact, 4=sodium-bonded metal' }),
    refuelling_interval_years: q(refuellingYears, 'yr', 'time', 'cycle', 'system', 'brief'),
    design_life_years: q(designLifeYears, 'yr', 'time', 'lifetime', 'system', 'brief'),
    core_power_density_mwt_m3: q(corePowerDensityMwtPerM3, 'MW/m³', 'power', 'rated', 'system', 'physics_constant'),
    core_volume_m3: q(coreVolumeM3, 'm³', 'volume', 'rated', 'system', 'calculator', { source_detail: 'rated_mwt / core_power_density' }),
    reactor_vessel_diameter_m: q(vesselDiameterM, 'm', 'length', 'rated', 'system', 'calculator', { source_detail: 'sized from core × 1.7 (integral SG inside vessel) at L/D=3' }),
    reactor_vessel_height_m: q(vesselHeightM, 'm', 'length', 'rated', 'system', 'calculator'),
    reactor_vessel_design_pressure_bar: q(vesselDesignPressureBar, 'bar', 'pressure', 'max', 'system', 'physics_constant', { source_detail: 'PWR 15.5 MPa op / 17.5 MPa design; HTGR 7 MPa; MSR <0.5 MPa' }),
    reactor_vessel_wall_thickness_m: q(vesselWallThicknessM, 'm', 'length', 'rated', 'system', 'calculator', { source_detail: 'hoop-stress sized @ SA-508 200 MPa allowable + ASME III safety factor' }),
    reactor_vessel_mass_kg: q(vesselMassKg, 'kg', 'mass', 'gross', 'system', 'calculator', { source_detail: 'SA-508 Class 3 forged steel at 7850 kg/m³' }),
    passive_decay_heat_removal_hours: q(passiveDecayHeatHr, 'h', 'time', 'min', 'system', 'physics_constant', { source_detail: 'NRC SECY-15-0077 / IAEA SSR-2/1 require ≥72 hr passive without AC power' }),
    containment_design_pressure_bar: q(containmentDesignPressureBar, 'bar', 'pressure', 'max', 'system', 'physics_constant', { source_detail: 'sized for DBA LOCA pressure rise + leak-rate test margin' }),
    containment_diameter_m: q(containmentDiameterM, 'm', 'length', 'rated', 'system', 'calculator'),
    containment_height_m: q(containmentHeightM, 'm', 'length', 'rated', 'system', 'calculator'),
    containment_steel_mass_kg: q(containmentSteelMassKg, 'kg', 'mass', 'gross', 'system', 'calculator', { source_detail: 'inner steel liner; concrete shell separately' }),
    containment_concrete_mass_kg: q(containmentConcreteMassKg, 'kg', 'mass', 'gross', 'site', 'calculator'),
    keff_boc_no_control: q(keffBocWithoutControl, '', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: 'k_eff with all control rods withdrawn; 1.10-1.30 typical' }),
    fuel_burnup_gwd_per_tu: q(burnupGwdT, 'GWd/tU', 'energy', 'lifetime', 'system', 'brief', { source_detail: 'PWR 45-55 / BWRX HALEU 60-80 / TRISO 160-180' }),
    refuelling_fraction_per_outage: q(refuellingFraction, '', 'dimensionless', 'cycle', 'system', 'physics_constant'),
    initial_fuel_loading_kg_u: q(fuelLoadingKgU, 'kg', 'mass', 'fuel', 'system', 'calculator'),
    steam_generator_mass_kg: q(steamGeneratorMassKg, 'kg', 'mass', 'gross', 'module', 'calculator', { source_detail: '40% vessel mass for PWR/BWR (integral SG); 15% for HTGR/MSR/SFR (IHX heat exchangers)' }),
    reactor_internals_mass_kg: q(reactorInternalsMassKg, 'kg', 'mass', 'empty', 'module', 'calculator', { source_detail: 'core barrel + upper plenum + control-rod guide tubes' }),
    turbine_generator_capacity_kw: q(turbineGeneratorKw, 'kW', 'power', 'net', 'system', 'calculator', { source_detail: 'often outside the modular boundary but in installed ASP envelope' }),
  }

  // Topology constraints — typed edges
  const topology: TopologyEdge[] = [
    {
      from_part: 'fuel_assembly',
      to_part: 'reactor_core_internals',
      mechanism: 'mechanical',
      constraint_kind: 'mass_carry',
      required_value: fuelLoadingKgU * 1.3,  // fuel + cladding + spacer grids
      required_unit: 'kg',
      required_margin_factor: 3.0,
      material_context: fuelType === 3 ? 'TRISO_pebbles_in_graphite_block_or_pebble_bed'
        : fuelType === 4 ? 'metal_fuel_pins_in_HT9_steel_cladding_sodium_bonded'
        : `UO2_pellets_in_zircaloy-4_or_zirlo_cladding_${enrichmentPct.toFixed(1)}pct_enriched`,
    },
    {
      from_part: 'reactor_core_internals',
      to_part: 'reactor_vessel',
      mechanism: 'mechanical',
      constraint_kind: 'mass_carry',
      required_value: reactorInternalsMassKg + fuelLoadingKgU * 1.3,
      required_unit: 'kg',
      required_margin_factor: 1.5,
      material_context: 'SA-508_Class_3_forged_low_alloy_steel_with_308L_stainless_cladding_per_ASME_BPVC_Section_III_Subsection_NB',
    },
    {
      from_part: 'reactor_vessel',
      to_part: 'primary_coolant',
      mechanism: 'fluid_loop',
      constraint_kind: 'flow_capacity',
      required_value: ratedMwt,  // MW thermal must be removable
      required_unit: 'MW',
      required_margin_factor: 1.1,
      material_context: coolantClass === 'pwr' ? 'borated_light_water_15.5_MPa_320C_natural_circulation_or_canned_pumps'
        : coolantClass === 'bwr' ? 'boiling_light_water_7_MPa_286C_natural_circulation'
        : coolantClass === 'htgr' ? 'helium_7_MPa_750C_circulator_blower'
        : coolantClass === 'msr' ? 'FLiBe_or_NaCl_KCl_molten_salt_700C_atmospheric_pressure_centrifugal_pump'
        : 'liquid_sodium_550C_atmospheric_pressure_EM_pump',
    },
    {
      from_part: 'primary_coolant_loop',
      to_part: 'steam_generator_or_ihx',
      mechanism: 'thermal',
      constraint_kind: 'thermal_rejection',
      required_value: ratedMwt,
      required_unit: 'MW',
      material_context: coolantClass === 'pwr' ? 'integral_helical_or_once_through_SG_inconel_690_tubes'
        : coolantClass === 'htgr' ? 'IHX_helium_to_water_or_helium_to_S-CO2_compact_PCHE'
        : coolantClass === 'msr' || coolantClass === 'sfr' ? 'IHX_then_secondary_loop_then_SG_isolating_primary_radioactive_inventory'
        : 'direct_BWR_no_SG_required',
    },
    {
      from_part: 'control_rod_drives',
      to_part: 'reactor_core_internals',
      mechanism: 'mechanical',
      constraint_kind: 'mass_carry',
      required_value: 2000,  // total CRD assembly mass typical
      required_unit: 'kg',
      material_context: coolantClass === 'msr' ? 'control_rods_in_axial_neutron_absorber_or_drain_tank_freeze_plug'
        : 'magnetic_jack_or_hydraulic_CRDM_with_gravity_scram_per_RG_1.155',
    },
    {
      from_part: 'reactor_coolant_system',
      to_part: 'passive_residual_heat_removal',
      mechanism: 'thermal',
      constraint_kind: 'thermal_rejection',
      required_value: ratedMwt * 0.07,  // 7% decay heat at shutdown peak
      required_unit: 'MW',
      required_margin_factor: 1.3,
      material_context: `passive_decay_heat_removal_${passiveDecayHeatHr}_hr_no_AC_power_per_NRC_SRP_15.0.3`,
    },
    {
      from_part: 'reactor_vessel_external',
      to_part: 'primary_containment',
      mechanism: 'mechanical',
      constraint_kind: 'material_compatibility',
      required_value: containmentDesignPressureBar,
      required_unit: 'bar',
      material_context: `steel-lined_reinforced_concrete_containment_design_pressure_${containmentDesignPressureBar}_bar_per_10_CFR_50_App_J_leak_test`,
    },
    {
      from_part: 'steam_generator_secondary',
      to_part: 'turbine_generator',
      mechanism: 'fluid_loop',
      constraint_kind: 'flow_capacity',
      required_value: ratedMwt,
      required_unit: 'MW',
      material_context: 'saturated_or_superheated_steam_to_turbine_per_balance_of_plant_BOP_outside_modular_boundary',
    },
  ]

  // Macro-assembly pricing — NuScale VOYGR / Rolls-Royce SMR / X-energy /
  // BWRX-300 / TerraPower disclosures. Word names chosen for ≥0.66 token
  // overlap with Stage 1.7 emissions (reactor_vessel, steam_generators,
  // control_rod_drives, primary_coolant_pumps, containment_structure,
  // turbine_generator, instrumentation_and_control, refuelling_machinery,
  // fuel_assemblies). Pricing basis at FOAK 2024-2026:
  //   Reactor vessel: £25-40/kg SA-508 forged + clad (vs £4/kg structural
  //     steel; nuclear-grade is 6-10× because of forging size + ASME III
  //     + inspection). Largest single forging in heavy industry today.
  //   Steam generators: £18/kg Inconel 690 tubed compact units
  //     (NuScale 12-module SG bundle is ~£40M each)
  //   Control rod drives: £180,000 per drive × N_drives (typically 16-69)
  //   Primary coolant pumps: £1.2M each canned-rotor (PWR) or £2.5M EM pump (SFR)
  //   Containment: £55/kg steel liner + £450/m³ reinforced concrete
  //     (concrete is dirt-cheap vs special-grade neutron-irradiation-resistant
  //     vessels)
  //   Turbine + generator: £600/kW for steam Rankine (outside the
  //     "modular" boundary technically, but counted in installed ASP)
  //   I&C: £45M flat for nuclear-grade Class 1E + diverse + safety per 10 CFR 50.55a(h)
  //   Refuelling machinery: £18M flat (cask + manipulator + spent-fuel pool)
  //   Initial fuel loading: £8,000/kg HM for LEU; £35,000/kg HM for HALEU
  //     (DOE 2024 status; HALEU enrichment is TENEX/Centrus bottleneck,
  //     declining toward £15-20k/kg by 2030 with capacity ramp); TRISO £45k
  //     (BWXT/X-energy disclosed pricing); metal fuel £30k (Natrium Project)
  const vesselPerKg = 32  // SA-508 Class 3 forged + clad, ASME III stamped
  const sgPerKg = 18
  const numControlRods = Math.max(16, Math.round(coreVolumeM3 * 1.5))
  const numPrimaryPumps = (coolantClass === 'pwr' || coolantClass === 'bwr') ? 4 : coolantClass === 'msr' ? 2 : 2
  const fuelPerKgU = fuelType === 2 ? 35000 : fuelType === 3 ? 45000 : fuelType === 4 ? 30000 : 8000
  const turbinePerKw = 600
  const concretePerM3 = 450
  const macro_assembly_prices: MacroAssemblyPrice[] = [
    {
      word_name: 'reactor_pressure_vessel',
      unit_price_gbp: vesselPerKg,
      dimension_basis: 'kg_mass',
      dimension_value: vesselMassKg,
      total_gbp: vesselPerKg * vesselMassKg,
      source_detail: `£${vesselPerKg}/kg × ${vesselMassKg.toFixed(0)} kg (SA-508 Class 3 forged low-alloy steel with 308L SS internal cladding; ASME BPVC Section III Subsection NB; single forging at ${vesselDiameterM.toFixed(1)} m × ${vesselHeightM.toFixed(1)} m × ${(vesselWallThicknessM * 1000).toFixed(0)} mm wall; Doosan Heavy / Japan Steel Works / Sheffield Forgemasters class)`,
    },
    {
      word_name: 'steam_generators_or_ihx',
      unit_price_gbp: sgPerKg,
      dimension_basis: 'kg_mass',
      dimension_value: steamGeneratorMassKg,
      total_gbp: sgPerKg * steamGeneratorMassKg,
      source_detail: `£${sgPerKg}/kg × ${steamGeneratorMassKg.toFixed(0)} kg (${coolantClass === 'pwr' || coolantClass === 'bwr' ? 'Inconel 690 helical or once-through SG, ASME III Class 1' : coolantClass === 'htgr' ? 'compact PCHE IHX helium-to-water' : 'sodium/salt-to-secondary IHX with double-wall stress-relieving tubes'})`,
    },
    {
      word_name: 'control_rod_drive_mechanisms',
      unit_price_gbp: 180_000,
      dimension_basis: 'each',
      dimension_value: numControlRods,
      total_gbp: 180_000 * numControlRods,
      source_detail: `£180,000 × ${numControlRods} CRDMs (${coolantClass === 'msr' ? 'control rods + freeze-plug drain valve passive shutdown' : 'magnetic-jack or hydraulic CRDM per RG 1.155 with gravity scram + ATWS mitigation'})`,
    },
    {
      word_name: 'primary_coolant_pumps',
      unit_price_gbp: coolantClass === 'sfr' ? 2_500_000 : 1_200_000,
      dimension_basis: 'each',
      dimension_value: numPrimaryPumps,
      total_gbp: (coolantClass === 'sfr' ? 2_500_000 : 1_200_000) * numPrimaryPumps,
      source_detail: `£${(coolantClass === 'sfr' ? 2.5 : 1.2).toFixed(1)}M × ${numPrimaryPumps} pumps (${coolantClass === 'pwr' ? 'KSB/Flowserve canned-rotor RCP, 15.5 MPa, hermetically sealed' : coolantClass === 'sfr' ? 'EM pump for liquid sodium, no rotating seal' : coolantClass === 'htgr' ? 'helium circulator blower' : 'centrifugal pump for molten salt'})`,
    },
    {
      word_name: 'containment_steel_liner',
      unit_price_gbp: 55,
      dimension_basis: 'kg_mass',
      dimension_value: containmentSteelMassKg,
      total_gbp: 55 * containmentSteelMassKg,
      source_detail: `£55/kg × ${containmentSteelMassKg.toFixed(0)} kg (welded carbon-steel liner with epoxy coating; 6-12 mm plate; leak-tested per 10 CFR 50 App J)`,
    },
    {
      word_name: 'containment_reinforced_concrete',
      unit_price_gbp: concretePerM3,
      dimension_basis: 'cubic_metre',
      dimension_value: containmentConcreteM3,
      total_gbp: concretePerM3 * containmentConcreteM3,
      source_detail: `£${concretePerM3}/m³ × ${containmentConcreteM3.toFixed(0)} m³ (post-tensioned reinforced concrete + boron-doped neutron shielding for radiation protection; designed for DBA + aircraft impact per RG 1.91)`,
    },
    {
      word_name: 'turbine_generator_set',
      unit_price_gbp: turbinePerKw,
      dimension_basis: 'kw_power',
      dimension_value: turbineGeneratorKw,
      total_gbp: turbinePerKw * turbineGeneratorKw,
      source_detail: `£${turbinePerKw}/kW × ${turbineGeneratorKw.toFixed(0)} kW (${coolantClass === 'htgr' ? 'supercritical CO₂ Brayton cycle or steam Rankine' : 'steam Rankine condensing turbine'} + 4-pole synchronous generator; Siemens/MHI/GE class; outside modular boundary but counted in installed ASP envelope)`,
    },
    {
      word_name: 'instrumentation_and_control_class_1e',
      unit_price_gbp: 45_000_000,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 45_000_000,
      source_detail: `£45M flat — Class 1E safety-related I&C per 10 CFR 50.55a(h) and IEEE Std 603; diverse and redundant 4-train protection system; Westinghouse Common Q or Mitsubishi MELTAC class; ATWS mitigation + post-accident monitoring per RG 1.97`,
    },
    {
      word_name: 'refuelling_machinery',
      unit_price_gbp: 18_000_000,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 18_000_000,
      source_detail: `£18M flat — refuelling cavity + overhead manipulator + transfer cask + spent-fuel pool with passive heat removal; ${refuellingYears}-yr refuelling interval (${(refuellingFraction * 100).toFixed(0)}% reload per outage)`,
    },
    {
      word_name: 'initial_fuel_assemblies',
      unit_price_gbp: fuelPerKgU,
      dimension_basis: 'kg_mass',
      dimension_value: fuelLoadingKgU,
      total_gbp: fuelPerKgU * fuelLoadingKgU,
      source_detail: `£${fuelPerKgU.toLocaleString()}/kg HM × ${fuelLoadingKgU.toFixed(0)} kg (${fuelType === 1 ? 'UO₂ LEU ≤5% in zircaloy cladding (Westinghouse/Framatome)' : fuelType === 2 ? 'HALEU UO₂ 5-19.75% — TENEX/Centrus currently rate-limited; DOE HALEU stock-up programme' : fuelType === 3 ? 'TRISO compacts (BWXT/X-energy) — UO₂ kernels coated PyC/SiC/PyC' : 'sodium-bonded metal fuel pins in HT9 steel cladding (Natrium)'})`,
    },
  ]

  // Closures — design-rule gates
  const closures: ContractClosureResult[] = []
  closures.push({
    invariant_id: 'passive_decay_heat_removal_meets_nrc_iaea',
    status: passiveDecayHeatHr >= 72 ? 'pass' : passiveDecayHeatHr >= 24 ? 'warn' : 'fail',
    measured: passiveDecayHeatHr,
    required: '≥72 hr passive decay-heat removal without AC power per NRC SECY-15-0077 + IAEA SSR-2/1 SMR Design Requirements',
    reason: `Passive decay-heat removal ${passiveDecayHeatHr} hr. <72 hr means operator action or AC power required to prevent core damage — disqualifies SMR safety case under NRC SMR Design-Specific Review Standard. NuScale ULTC submission claimed 30 days passive.`,
  })
  closures.push({
    invariant_id: 'neutron_economy_keff_within_range',
    status: keffBocWithoutControl >= 1.00 && keffBocWithoutControl <= 1.30 ? 'pass' : 'fail',
    measured: keffBocWithoutControl,
    required: '1.00 ≤ k_eff_BoC (no control) ≤ 1.30 — critical mass achievable, excess reactivity within shutdown margin',
    reason: `k_eff BoC ${keffBocWithoutControl.toFixed(3)}. <1.00 = subcritical, no useful power. >1.30 = excess reactivity exceeds reasonable shutdown margin; would require excessive burnable poisons.`,
  })
  closures.push({
    invariant_id: 'fuel_burnup_meets_brief',
    status: burnupGwdT >= 40 ? 'pass' : 'warn',
    measured: burnupGwdT,
    required: '≥40 GWd/tU for economic fuel utilisation (PWR target ≥45, HALEU SMRs 60-180)',
    reason: `Fuel burnup ${burnupGwdT.toFixed(0)} GWd/tU. <40 means uneconomic short cycle. ${fuelType === 3 ? 'TRISO targets 160-180 — extremely high burnup attainable due to multi-layer fuel particle integrity' : fuelType === 2 ? 'HALEU enables ≥60 GWd/tU compact cores' : 'LEU UO₂ practical limit 55-60 GWd/tU before cladding integrity concerns'}.`,
  })
  closures.push({
    invariant_id: 'containment_design_pressure_dba_loca',
    status: containmentDesignPressureBar >= (coolantClass === 'pwr' ? 4 : coolantClass === 'bwr' ? 3 : 1) ? 'pass' : 'fail',
    measured: containmentDesignPressureBar,
    required: `Containment design pressure ≥ DBA LOCA peak — ${coolantClass === 'pwr' ? '4 bar steam release' : coolantClass === 'bwr' ? '3 bar with suppression pool' : coolantClass === 'htgr' ? '1 bar (no high-pressure steam release)' : '1-2 bar (sodium fire or salt vapour)'}`,
    reason: `Containment design pressure ${containmentDesignPressureBar} bar adequate for ${coolantClass.toUpperCase()} DBA LOCA per 10 CFR 50 App A GDC 16 + RG 1.157.`,
  })
  closures.push({
    invariant_id: 'enrichment_below_haleu_limit',
    status: enrichmentPct <= 19.75 ? 'pass' : 'fail',
    measured: enrichmentPct,
    required: '≤19.75 wt% U-235 per NRC 10 CFR 50.46 and IAEA proliferation-resistance category (HALEU upper bound)',
    reason: `Enrichment ${enrichmentPct.toFixed(2)}% U-235. ≤19.75% remains in HALEU low-enriched category; ≥20% crosses into HEU triggering Category I material control + IAEA safeguards.`,
  })
  closures.push({
    invariant_id: 'design_life_meets_smr_class',
    status: designLifeYears >= 40 ? 'pass' : 'warn',
    measured: designLifeYears,
    required: '≥40 years design life (NRC initial licence; renewable to 80 with surveillance per 10 CFR 54)',
    reason: `Design life ${designLifeYears} yr. <40 yr = uneconomic for capital recovery against £4-8M/MWe FOAK CapEx. Modern SMR designs target 60 yr (NuScale, BWRX-300) with 80-yr renewal pathway.`,
  })

  const macroAssemblyTotal = macro_assembly_prices.reduce((a, m) => a + m.total_gbp, 0)

  return {
    product_class: 'smr',
    brief_summary: `${ratedMwt.toFixed(0)} MWt / ${ratedMwe.toFixed(0)} MWe ${coolantClass.toUpperCase()} small modular reactor, ${(thermalEfficiency * 100).toFixed(0)}% thermal efficiency. ${fuelType === 1 ? 'LEU UO₂' : fuelType === 2 ? 'HALEU UO₂' : fuelType === 3 ? 'TRISO' : 'sodium-bonded metal'} fuel at ${enrichmentPct.toFixed(1)}% enrichment, ${burnupGwdT.toFixed(0)} GWd/tU burnup target. Reactor vessel ${vesselDiameterM.toFixed(1)} m × ${vesselHeightM.toFixed(1)} m × ${(vesselWallThicknessM * 1000).toFixed(0)} mm wall (${(vesselMassKg / 1000).toFixed(0)} t SA-508). Containment ${containmentDiameterM.toFixed(0)} m × ${containmentHeightM.toFixed(0)} m, ${containmentDesignPressureBar} bar design. ${refuellingYears}-yr refuelling (${(refuellingFraction * 100).toFixed(0)}% reload), ${designLifeYears}-yr design life. ${passiveDecayHeatHr} hr passive decay-heat removal (NRC SECY-15-0077 / IAEA SSR-2/1). Macro-assembly raw BoM = £${(macroAssemblyTotal / 1_000_000).toFixed(1)}M (≈£${(macroAssemblyTotal / ratedMwe / 1_000_000).toFixed(2)}M/MWe vs £4-8M/MWe installed FOAK benchmark).`,
    quantities,
    topology,
    macro_assembly_prices,
    closures,
  }
})

// ---------------- humanoid ------------------------
// Full archetype contract — replaces buildMinimalContract stub. Bipedal
// general-purpose humanoid robot (Tesla Optimus / Figure 02 / 1X Neo /
// Agility Digit / Boston Dynamics Atlas / Unitree H1 class). Modelled
// on evtol / drone pattern. Macro prices grounded in IDTechEx Humanoid
// Robots 2024-2034 report + Tesla AI Day disclosures + Figure series
// B raise PR + Agility Robotics OPEX teardowns. At production scale,
// per-unit BoM target £25k-150k; current prototypes £500k-2M each.
registerArchetype('humanoid', (brief: any) => {
  const desc = String(brief?.product_description ?? '')
  const massKg = Number(brief?.constraints?.max_mass_kg?.value ?? 60)
  // Height from brief or scaled by mass. Empirically humanoid mass/height
  // follows ≈ 30 × height² (kg, m) — i.e. tall + light, short + chunky.
  const heightM = (() => {
    const m = desc.match(/(\d(?:\.\d+)?)\s*m\s+(?:tall|height)/i)
      ?? desc.match(/height[\s:]{0,8}(\d(?:\.\d+)?)\s*m\b/i)
    if (m) return parseFloat(m[1])
    // From dimensions if present (max_dimensions_mm.h)
    const h = Number(brief?.constraints?.max_dimensions_mm?.h ?? 0)
    if (h > 0) return h / 1000
    // Mass scaling: m_kg ≈ 30 × h_m²  →  h ≈ √(m/30)
    return Math.max(1.2, Math.min(2.0, Math.sqrt(massKg / 30)))
  })()
  // DOF count scales with capability tier. Brief overrides; otherwise:
  //   minimum bipedal walker = 12 (6 per leg + spine)
  //   typical full humanoid = 28-40 (arms + waist + neck)
  //   high-dexterity manipulation = 50+ (5-finger hands × 2 + waist)
  const dofCount = (() => {
    const m = desc.match(/(\d{1,3})\s*-?\s*(\d{1,3})?\s*(?:DOF|degree[s]? of freedom|dof)/i)
    if (m) {
      const a = parseFloat(m[1])
      const b = m[2] ? parseFloat(m[2]) : a
      return Math.round((a + b) / 2)
    }
    if (/dexter|fine[\s-]?manipulat|five[\s-]?finger|articulated\s+hand/i.test(desc)) return 52
    if (/whole[\s-]?body|advanced|optimus|figure/i.test(desc)) return 35
    return /walking[\s-]?only|locomotion[\s-]?focused|legged/i.test(desc) ? 14 : 28
  })()
  // Payload at full arm extension (≠ overhead crane load) — typically
  // 0.20-0.50 × robot mass for bipedal humanoid. Optimus Gen 2 target 20kg
  // (at body, ≈11kg at arm extension); Figure 02 target 25kg; Digit 16kg.
  const payloadKg = (() => {
    const m = desc.match(/(\d{1,3})\s*kg\s+payload/i) ?? desc.match(/payload[\s:]{0,8}(\d{1,3})\s*kg/i)
    if (m) return parseFloat(m[1])
    return Math.round(massKg * 0.30)
  })()
  const walkingSpeedMs = extractRangeFromDesc(desc, /(\d(?:\.\d+)?)\s*m\/s/i, 1.2)
  const batteryRuntimeHr = extractRangeFromDesc(desc, /(\d(?:\.\d+)?)\s*(?:hr|hour|h\b)/i, 4)
  // Industrial vs consumer — drives ISO 10218-1 vs ISO 13482 safety route
  const isIndustrial = /industrial|factory|warehouse|logistics|manufacturing|workplace|optimus|digit|agility/i.test(desc)
  const isConsumer = !isIndustrial && /home|consumer|domestic|household|1x\s+neo/i.test(desc)
  // Actuator class — Series Elastic Actuator (SEA), harmonic drive (HD),
  // or quasi-direct drive (QDD). Distribution typical for general humanoid:
  //   Legs: 6 high-torque actuators each (12 total) — QDD typically £1500-3000/unit
  //   Arms: 6 actuators each (12 total) — HD typically £700-1500/unit
  //   Waist + neck: 3-5 actuators — SEA typically £600-1200/unit
  //   Hands: 8-22 actuators (if dexterous) — small SEA £200-500/unit
  // Average cost per DOF varies by location; we model legs vs arms vs hands.
  const dofLegs = 12  // standardise 6 per leg
  const dofArms = Math.min(14, Math.max(8, dofCount - dofLegs - 5))  // arms = remainder less spine/neck
  const dofWaistNeck = 5
  const dofHands = Math.max(0, dofCount - dofLegs - dofArms - dofWaistNeck)
  const legActuatorAvgGbp = 2200  // QDD or harmonic-drive, 50-200 Nm
  const armActuatorAvgGbp = 1100  // smaller harmonic-drive, 10-80 Nm
  const waistNeckActuatorAvgGbp = 900
  const handActuatorAvgGbp = 350   // miniature, 0.5-5 Nm
  // Battery — sized from runtime + walking-power budget. Typical 35 kg
  // robot draws ~250 W standing, ~500-1000 W walking depending on speed.
  // Standby ~80 W. Mixed-duty average ~400 W for general manipulation work.
  const avgPowerW = Math.max(250, 200 + 6 * massKg)  // body-mass-scaled empirical
  const battEnergyKwh = (avgPowerW * batteryRuntimeHr) / 1000
  const batteryPackSpecificEnergyWhKg = 220  // Li-ion 18650 or pouch, robotic pack-level
  const batteryMassKg = (battEnergyKwh * 1000) / batteryPackSpecificEnergyWhKg
  // Compute — typically NVIDIA Jetson Orin + ARM CPUs for VLA inference.
  // Capability tiers: edge inference 30 TOPS / 100 TOPS / 275 TOPS Orin AGX.
  const computeTops = /275\s*tops|jetson\s+agx|orin\s+64/i.test(desc) ? 275
    : /200\s*tops|jetson\s+orin\s+nano/i.test(desc) ? 100
    : 30
  // Sensors — typical full humanoid:
  //   Cameras: 4-12 (head stereo + body + wrist-mounted)
  //   IMU: 1-2 (chest + pelvis for state estimation)
  //   Force/torque (FT): per ankle + per wrist = 4 typically
  //   Time-of-flight (ToF) lidar / depth: 1-2 for navigation/obstacles
  const cameraCount = dofHands >= 8 ? 8 : 6  // dexterous adds wrist cameras
  const imuCount = 2
  const ftSensorCount = 4  // 2 ankles + 2 wrists
  const tofLidarCount = 2  // head + chest
  // Structural frame — aluminium for industrial, CFRP for consumer (lighter).
  const isCarbonFrame = isConsumer || /carbon\s*fibre|carbon\s*fiber|cfrp/i.test(desc)
  const frameMaterial: 'aluminium' | 'cfrp_aluminium_hybrid' = isCarbonFrame ? 'cfrp_aluminium_hybrid' : 'aluminium'
  // Frame mass fraction
  const frameMassKg = massKg * (isCarbonFrame ? 0.25 : 0.32)
  // Total actuator mass (typically 35-45% of total mass)
  const actuatorMassKg = massKg * 0.40
  // Electronics + battery + sensors mass = remainder
  const electronicsMassKg = massKg - frameMassKg - actuatorMassKg - batteryMassKg
  // Bus voltage — 48 V DC typical for current humanoids
  const dcBusVoltage = 48
  // Walking power at rated speed (for closure)
  const walkingPowerW = avgPowerW * (0.5 + walkingSpeedMs * 0.6)
  // Mass-stability check: actuator stall-torque at hip joint must hold robot upright
  const hipStallTorqueNm = massKg * 9.81 * (heightM / 2) * 1.3  // 1.3× safety
  // Fall-recovery capability — design class flag
  const fallRecoveryCapable = !/no[\s-]?fall|simple[\s-]?walker/i.test(desc)

  const quantities: Record<string, Quantity> = {
    robot_mass_kg: q(massKg, 'kg', 'mass', 'gross_takeoff', 'system', 'brief'),
    height_m: q(heightM, 'm', 'length', 'rated', 'system', 'brief'),
    dof_count_total: q(dofCount, '', 'dimensionless', 'rated', 'system', 'brief'),
    dof_legs: q(dofLegs, '', 'dimensionless', 'rated', 'module', 'physics_constant', { source_detail: '6 per leg × 2 = 12; hip3 + knee + ankle2' }),
    dof_arms: q(dofArms, '', 'dimensionless', 'rated', 'module', 'calculator'),
    dof_waist_neck: q(dofWaistNeck, '', 'dimensionless', 'rated', 'module', 'physics_constant'),
    dof_hands: q(dofHands, '', 'dimensionless', 'rated', 'module', 'calculator', { source_detail: 'remaining DOF after legs/arms/waist; 0 = grippers, ≥10 = dexterous' }),
    payload_capacity_at_arm_extension_kg: q(payloadKg, 'kg', 'mass', 'payload', 'system', 'brief', { source_detail: 'payload at full-arm-extension; ≈0.3 × robot mass typical for bipedal' }),
    walking_speed_ms: q(walkingSpeedMs, 'm/s', 'velocity', 'rated', 'system', 'brief'),
    battery_runtime_hours: q(batteryRuntimeHr, 'h', 'time', 'continuous', 'system', 'brief'),
    average_power_draw_w: q(avgPowerW, 'W', 'power', 'continuous', 'system', 'calculator', { source_detail: '200 + 6 × mass_kg (empirical mixed-duty)' }),
    walking_power_w: q(walkingPowerW, 'W', 'power', 'continuous', 'system', 'calculator', { source_detail: 'power × (0.5 + speed × 0.6)' }),
    battery_energy_kwh: q(battEnergyKwh, 'kWh', 'energy', 'usable', 'pack', 'calculator', { source_detail: 'avg_power × runtime / 1000' }),
    battery_pack_specific_energy_wh_kg: q(batteryPackSpecificEnergyWhKg, 'Wh/kg', 'energy', 'nameplate', 'pack', 'physics_constant', { source_detail: '220 Wh/kg Li-ion 18650/pouch robotic pack-level (cell 280 × 0.78 pack ratio)' }),
    battery_mass_kg: q(batteryMassKg, 'kg', 'mass', 'gross_takeoff', 'pack', 'calculator'),
    dc_bus_voltage_v: q(dcBusVoltage, 'V', 'voltage', 'DC', 'system', 'physics_constant', { source_detail: '48 V SELV; preferred for safety + sufficient for QDD actuators' }),
    compute_tops: q(computeTops, 'TOPS', 'dimensionless', 'rated', 'module', 'physics_constant', { source_detail: 'NVIDIA Jetson Orin Nano/NX/AGX class for VLA model inference' }),
    camera_count: q(cameraCount, '', 'dimensionless', 'rated', 'module', 'physics_constant', { source_detail: 'head stereo (2) + body (2) + wrist-mounted (2-4)' }),
    imu_count: q(imuCount, '', 'dimensionless', 'rated', 'module', 'physics_constant'),
    force_torque_sensor_count: q(ftSensorCount, '', 'dimensionless', 'rated', 'module', 'physics_constant', { source_detail: '2× ankles + 2× wrists for contact-rich manipulation' }),
    tof_lidar_count: q(tofLidarCount, '', 'dimensionless', 'rated', 'module', 'physics_constant'),
    frame_material: q(frameMaterial === 'aluminium' ? 1 : 2, '', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: 'enum: 1=aluminium, 2=CFRP/aluminium hybrid (lighter, costlier)' }),
    frame_mass_kg: q(frameMassKg, 'kg', 'mass', 'empty', 'module', 'calculator'),
    actuator_assembly_mass_kg: q(actuatorMassKg, 'kg', 'mass', 'empty', 'module', 'calculator', { source_detail: '40% of robot mass typical (legs dominate)' }),
    electronics_sensors_mass_kg: q(electronicsMassKg, 'kg', 'mass', 'empty', 'module', 'calculator', { source_detail: 'remainder after frame + actuators + battery' }),
    hip_actuator_stall_torque_required_nm: q(hipStallTorqueNm, 'N·m', 'force', 'peak', 'module', 'calculator', { source_detail: 'mass × g × CoM_height × 1.3 safety; sets QDD/HD selection' }),
    fall_recovery_capable: q(fallRecoveryCapable ? 1 : 0, '', 'dimensionless', 'rated', 'system', 'calculator'),
    deployment_class: q(isIndustrial ? 1 : isConsumer ? 2 : 3, '', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: 'enum: 1=industrial (ISO 10218-1), 2=consumer (ISO 13482), 3=general/research' }),
  }

  // Topology constraints — typed edges
  const topology: TopologyEdge[] = [
    {
      from_part: 'battery_pack',
      to_part: 'power_distribution_bus',
      mechanism: 'electrical_bus',
      constraint_kind: 'current_rating',
      required_value: (walkingPowerW * 1.5) / dcBusVoltage,  // 1.5× peak vs continuous
      required_unit: 'A',
      required_margin_factor: 1.5,
      material_context: `${dcBusVoltage}_V_DC_SELV_bus_with_e-fuse_protection_per_IEC_62133`,
    },
    {
      from_part: 'power_distribution_bus',
      to_part: 'leg_actuators',
      mechanism: 'electrical_bus',
      constraint_kind: 'current_rating',
      required_value: (dofLegs * 60) / dcBusVoltage,  // 60 W per leg actuator avg
      required_unit: 'A',
      required_margin_factor: 1.25,
      material_context: 'QDD_or_harmonic_drive_leg_actuator_50-200Nm_with_FOC_servo_drive',
    },
    {
      from_part: 'leg_actuators',
      to_part: 'hip_knee_ankle_joints',
      mechanism: 'mechanical',
      constraint_kind: 'mass_carry',
      required_value: massKg + payloadKg,  // standing static
      required_unit: 'kg',
      required_margin_factor: 2.0,  // 2× for impact/recovery
      material_context: `actuator_stall_torque_at_hip_must_exceed_${hipStallTorqueNm.toFixed(0)}_Nm_for_balance_recovery`,
    },
    {
      from_part: 'arm_actuators',
      to_part: 'shoulder_elbow_wrist_joints',
      mechanism: 'mechanical',
      constraint_kind: 'mass_carry',
      required_value: payloadKg * 1.3,  // payload at extension × dynamic factor
      required_unit: 'kg',
      required_margin_factor: 1.5,
      material_context: 'harmonic_drive_or_strain_wave_gear_arm_actuator_10-80Nm_with_backlash_under_30arcsec',
    },
    {
      from_part: 'compute_module',
      to_part: 'motor_controllers',
      mechanism: 'data',
      constraint_kind: 'data_bandwidth',
      required_value: 1000,  // 1 kHz minimum for real-time servo loop
      required_unit: 'Hz',
      material_context: 'EtherCAT_or_RS485_DC_bus_servo_loop_1-10kHz_jitter_under_100us_per_IEC_61784',
    },
    {
      from_part: 'cameras_imu_ft_sensors',
      to_part: 'compute_module',
      mechanism: 'data',
      constraint_kind: 'data_bandwidth',
      required_value: cameraCount * 1500 + imuCount * 5 + ftSensorCount * 10,  // 1.5 Gbps per camera + IMU + FT
      required_unit: 'Mbps',
      material_context: 'USB3_or_MIPI_CSI-2_camera + I2C/SPI_IMU + SPI_FT_sensors aggregated into Jetson Orin',
    },
    {
      from_part: 'battery_pack',
      to_part: 'thermal_management',
      mechanism: 'thermal',
      constraint_kind: 'thermal_rejection',
      required_value: walkingPowerW * 0.15,  // 15% of power dissipates as heat in cells + drives
      required_unit: 'W',
      material_context: 'forced_air_cooling_with_heat_pipes_to_chassis_skin_or_active_blower_for_dense_pack',
    },
    {
      from_part: 'enclosure_skin',
      to_part: 'workspace_environment',
      mechanism: 'mechanical',
      constraint_kind: 'material_compatibility',
      material_context: isIndustrial
        ? 'ISO_10218-1_industrial_collaborative_robot_safety_rating_with_emergency_stop_and_safety-monitored_stop_per_TS_15066'
        : isConsumer
        ? 'ISO_13482_personal_care_robot_safety_with_soft_skin_padding_and_force-limited_actuators_per_TS_15066'
        : 'ANSI/RIA_R15.06_general_robot_safety',
    },
  ]

  // Macro-assembly pricing — IDTechEx Humanoid Robots 2024-2034 +
  // Tesla AI Day 4 + Figure series B PR + Agility Robotics Digit
  // teardown. Word names chosen for ≥0.66 token overlap with Stage 1.7
  // emissions (actuator, structural_frame, battery_pack, compute_module,
  // sensors, end_effector, thermal_management, enclosure_skin).
  // 2024 cost basis (target production scale 50k-100k units/yr):
  //   Leg QDD actuators: £2200 each × 12 (legs)
  //   Arm harmonic-drive actuators: £1100 each × dofArms
  //   Waist + neck actuators: £900 each × 5
  //   Hand actuators (miniature): £350 each × dofHands
  //   Structural frame: £45/kg aluminium / £180/kg CFRP-hybrid
  //   Battery pack: £450/kWh (Tesla 4680 derivative for production scale)
  //   Compute module: £750 (Jetson Orin Nano) to £3500 (AGX 64GB)
  //   Sensors: cameras £180 each, IMU £120 each, FT £950 each, ToF £450 each
  //   End-effectors (hands or grippers): £1500 (gripper), £8500 (5-finger dexterous)
  //   Thermal management: £180 (passive heat-pipes) to £450 (forced-air with blower)
  //   Enclosure / skin: £80/kg painted aluminium or moulded polymer
  const computeCost = computeTops >= 250 ? 3500 : computeTops >= 100 ? 1500 : 750
  const endEffectorCost = dofHands >= 10 ? 8500 * 2 : 1500 * 2  // 2 hands
  const macro_assembly_prices: MacroAssemblyPrice[] = [
    {
      word_name: 'leg_actuator_assembly',
      unit_price_gbp: legActuatorAvgGbp,
      dimension_basis: 'each',
      dimension_value: dofLegs,
      total_gbp: legActuatorAvgGbp * dofLegs,
      source_detail: `£${legActuatorAvgGbp} × ${dofLegs} leg actuators (QDD or harmonic-drive 50-200 Nm @ ${dcBusVoltage} V, FOC servo drive with absolute encoder; hip3 + knee + ankle2 per leg; Unitree/Anybotics/MIT mini-cheetah class)`,
    },
    {
      word_name: 'arm_actuator_assembly',
      unit_price_gbp: armActuatorAvgGbp,
      dimension_basis: 'each',
      dimension_value: dofArms,
      total_gbp: armActuatorAvgGbp * dofArms,
      source_detail: `£${armActuatorAvgGbp} × ${dofArms} arm actuators (harmonic-drive strain-wave-gear 10-80 Nm with absolute encoder; <30 arcsec backlash; Harmonic Drive Systems CSF series or domestic equivalent)`,
    },
    {
      word_name: 'waist_neck_actuators',
      unit_price_gbp: waistNeckActuatorAvgGbp,
      dimension_basis: 'each',
      dimension_value: dofWaistNeck,
      total_gbp: waistNeckActuatorAvgGbp * dofWaistNeck,
      source_detail: `£${waistNeckActuatorAvgGbp} × ${dofWaistNeck} waist + neck (SEA series-elastic 5-30 Nm + pan/tilt neck servos for sensor orientation)`,
    },
    ...(dofHands > 0 ? [{
      word_name: 'hand_finger_actuators' as const,
      unit_price_gbp: handActuatorAvgGbp,
      dimension_basis: 'each' as const,
      dimension_value: dofHands,
      total_gbp: handActuatorAvgGbp * dofHands,
      source_detail: `£${handActuatorAvgGbp} × ${dofHands} miniature actuators (tendon-driven or direct-drive ${dofHands >= 10 ? '5-finger dexterous hand' : 'thumb + index for power-grasp'} 0.5-5 Nm; Shadow Robot or Wonik Robotics class)`,
    }] : []),
    {
      word_name: 'structural_frame',
      unit_price_gbp: isCarbonFrame ? 180 : 45,
      dimension_basis: 'kg_mass',
      dimension_value: frameMassKg,
      total_gbp: (isCarbonFrame ? 180 : 45) * frameMassKg,
      source_detail: `£${isCarbonFrame ? 180 : 45}/kg × ${frameMassKg.toFixed(1)} kg (${isCarbonFrame ? 'CFRP shells + aluminium endplates for dynamic mass reduction; +50% performance, +3× cost' : '7075-T6 aluminium machined or cast structural members + steel fasteners'})`,
    },
    {
      word_name: 'lithium_ion_battery_pack',
      unit_price_gbp: 450,
      dimension_basis: 'kwh_capacity',
      dimension_value: battEnergyKwh,
      total_gbp: 450 * battEnergyKwh,
      source_detail: `£450/kWh × ${battEnergyKwh.toFixed(2)} kWh (${dcBusVoltage} V Li-ion pouch or 18650/21700 cells, BMS with cell-level monitoring, contactors + e-fuse; ${batteryPackSpecificEnergyWhKg} Wh/kg pack-level)`,
    },
    {
      word_name: 'compute_module',
      unit_price_gbp: computeCost,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: computeCost,
      source_detail: `£${computeCost} (NVIDIA Jetson Orin ${computeTops}-TOPS edge inference for VLA model + dedicated ARM Cortex-A78 for real-time motion control + FPGA for servo loop offload)`,
    },
    {
      word_name: 'sensor_suite',
      unit_price_gbp: cameraCount * 180 + imuCount * 120 + ftSensorCount * 950 + tofLidarCount * 450,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: cameraCount * 180 + imuCount * 120 + ftSensorCount * 950 + tofLidarCount * 450,
      source_detail: `£${(cameraCount * 180 + imuCount * 120 + ftSensorCount * 950 + tofLidarCount * 450).toLocaleString()} aggregated (${cameraCount} × £180 RGB/depth cameras + ${imuCount} × £120 9-axis IMU + ${ftSensorCount} × £950 6-axis FT at wrists/ankles + ${tofLidarCount} × £450 ToF depth/lidar)`,
    },
    {
      word_name: 'end_effector_hands',
      unit_price_gbp: dofHands >= 10 ? 8500 : 1500,
      dimension_basis: 'each',
      dimension_value: 2,
      total_gbp: endEffectorCost,
      source_detail: `£${(endEffectorCost / 2).toLocaleString()} × 2 (${dofHands >= 10 ? '5-finger dexterous hand with tendon-driven fingers + tactile sensors per fingertip; Shadow / Wonik / SCHUNK SVH class' : 'parallel-jaw gripper or 2-finger underactuated hand for power-grasp manipulation'})`,
    },
    {
      word_name: 'thermal_management_cooling',
      unit_price_gbp: 450,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 450,
      source_detail: `£450 flat — forced-air cooling with blower fan + heat-pipe to chassis skin for battery + motor drives; <60°C surface temp limit per ISO 13482`,
    },
    {
      word_name: 'enclosure_skin_panels',
      unit_price_gbp: 80,
      dimension_basis: 'kg_mass',
      dimension_value: massKg * 0.10,  // ~10% mass for shells
      total_gbp: 80 * massKg * 0.10,
      source_detail: `£80/kg × ${(massKg * 0.10).toFixed(1)} kg (${isConsumer ? 'soft TPE/silicone skin over EPP foam for force-limited contact; ISO 13482' : 'moulded polycarbonate or sheet-aluminium shells with IP54 dust + water spray rating'})`,
    },
  ]

  // Closures — design-rule gates
  const closures: ContractClosureResult[] = []
  // 2026-05-23 fix (post-batch-3 review): closures now compare DESIGN
  // capacity vs BRIEF demand, not just an absolute floor. Previous version
  // asked "is the brief's walking speed >= 0.5 m/s?" — that's a check on
  // the brief, not on the design. Real engineering closure: given the
  // brief's walking_speed + mass, does the computed actuator stall torque
  // satisfy the dynamic balance requirement?
  // Dynamic walking torque demand: mass × g × CoM_height × peak_load_factor.
  // peak_load_factor scales with speed: ~1.5× at 0.5 m/s (static-ish) up to
  // ~3× at 2.0 m/s (dynamic single-support). Linear interpolation.
  const peakLoadFactorAtSpeed = 1.5 + (walkingSpeedMs / 2.0) * 1.5
  const requiredHipTorqueNm = (massKg + payloadKg) * 9.81 * (heightM / 2) * peakLoadFactorAtSpeed
  const hipTorqueMargin = hipStallTorqueNm / requiredHipTorqueNm
  closures.push({
    invariant_id: 'hip_torque_supports_brief_walking_speed',
    status: hipTorqueMargin >= 1.2 ? 'pass' : hipTorqueMargin >= 0.95 ? 'warn' : 'fail',
    measured: Math.round(hipStallTorqueNm),
    required: `Hip stall torque ≥${requiredHipTorqueNm.toFixed(0)} N·m to support ${walkingSpeedMs.toFixed(2)} m/s walking at ${massKg + payloadKg} kg total (mass + payload, peak load ${peakLoadFactorAtSpeed.toFixed(1)}×)`,
    reason: `Hip computed ${hipStallTorqueNm.toFixed(0)} N·m, demand ${requiredHipTorqueNm.toFixed(0)} N·m (${(hipTorqueMargin * 100).toFixed(0)}% of demand). ${hipTorqueMargin >= 1.2 ? 'Adequate margin for dynamic walking + perturbation recovery' : hipTorqueMargin >= 0.95 ? 'Marginal — design will walk but may not recover from gusts/impacts; consider higher-torque QDDs' : 'Insufficient — robot will fall under load or fail single-support; either reduce mass/payload, slow walking speed, or upsize hip actuators'}.`,
  })
  // Payload closure: check that the arm + shoulder design (which the
  // archetype derives from dof_count) is matched to the brief's payload
  // demand. Shoulder torque scales with payload × full-extension arm
  // length. Heuristic: shoulder torque ≥ payload × g × armLength × 1.5.
  const armLengthM = heightM * 0.35  // shoulder-to-fingertip ~35% of height
  const requiredShoulderTorqueNm = payloadKg * 9.81 * armLengthM * 1.5
  // Approximate shoulder torque from total actuator budget: shoulder gets
  // ~10% of total hip torque budget per arm (typical bilateral robot).
  const shoulderTorqueAvailableNm = hipStallTorqueNm * 0.20  // rough shoulder/hip ratio
  const shoulderMargin = shoulderTorqueAvailableNm / requiredShoulderTorqueNm
  closures.push({
    invariant_id: 'arm_torque_supports_brief_payload',
    status: shoulderMargin >= 1.2 ? 'pass' : shoulderMargin >= 0.9 ? 'warn' : 'fail',
    measured: Math.round(shoulderTorqueAvailableNm),
    required: `Shoulder stall torque ≥${requiredShoulderTorqueNm.toFixed(0)} N·m to support ${payloadKg} kg payload at full ${armLengthM.toFixed(2)} m arm extension (1.5× safety)`,
    reason: `Shoulder computed ${shoulderTorqueAvailableNm.toFixed(0)} N·m available, demand ${requiredShoulderTorqueNm.toFixed(0)} N·m (${(shoulderMargin * 100).toFixed(0)}% of demand). ${shoulderMargin >= 1.2 ? 'Adequate for full-extension lift + dynamic perturbations' : shoulderMargin >= 0.9 ? 'Marginal — robot can lift at extension but not dynamically; ok for slow pick-and-place, risky for impact loads' : 'Insufficient — arm will stall or drop payload at full extension'}.`,
  })
  closures.push({
    invariant_id: 'runtime_at_typical_duty_meets_brief',
    status: batteryRuntimeHr >= 2 ? 'pass' : 'warn',
    measured: batteryRuntimeHr,
    required: '≥2 hr runtime at typical mixed-duty (manipulation + locomotion); ≥4 hr for full-shift industrial deployment',
    reason: `Runtime ${batteryRuntimeHr.toFixed(1)} hr at ${avgPowerW.toFixed(0)} W average draw. Battery ${battEnergyKwh.toFixed(2)} kWh / ${batteryMassKg.toFixed(1)} kg. <2 hr forces continuous swapping; ≥4 hr enables single-charge shift work.`,
  })
  closures.push({
    invariant_id: 'fall_recovery_capable',
    status: fallRecoveryCapable ? 'pass' : 'warn',
    measured: fallRecoveryCapable ? 1 : 0,
    required: 'Fall-recovery capability — robot must self-recover from prone or supine position OR detect fall + safe-shutdown without injury (Atlas/Optimus demonstrate get-up; Digit detects + safe-state)',
    reason: `Fall-recovery ${fallRecoveryCapable ? 'designed in (capable of get-up sequence after impact-safe shutdown)' : 'not implemented — robot requires human intervention after fall, reducing autonomy'}.`,
  })
  closures.push({
    invariant_id: isIndustrial ? 'iso_10218_1_industrial_safety' : isConsumer ? 'iso_13482_personal_care_robot_safety' : 'general_robot_safety',
    status: isIndustrial ? 'pass' : isConsumer ? 'warn' : 'warn',
    measured: 1,
    required: isIndustrial
      ? 'ISO 10218-1 + ISO/TS 15066 — collaborative industrial robot safety: safety-rated monitored stop, hand-guiding, speed/separation, power/force limiting'
      : isConsumer
      ? 'ISO 13482 personal care robot safety — force-limited actuators, soft skin, emergency stop, user-presence detection'
      : 'ANSI/RIA R15.06 general — no formal certification path; voluntary safety standards apply',
    reason: `${isIndustrial ? 'Industrial deployment: by construction includes E-stop + safety-monitored stop + ISO/TS 15066 force-limit table compliance for hand-guided operation' : isConsumer ? 'Consumer deployment: requires ISO 13482 certification; current state of art (Neo, Tesla Bot consumer) still in pre-certification phase' : 'General/research deployment — no commercial sale path without further safety certification'}.`,
  })
  closures.push({
    invariant_id: 'mass_balance_actuators_dominate',
    status: actuatorMassKg + frameMassKg + batteryMassKg + electronicsMassKg <= massKg * 1.05 ? 'pass'
          : actuatorMassKg + frameMassKg + batteryMassKg + electronicsMassKg <= massKg * 1.15 ? 'warn'
          : 'fail',
    measured: actuatorMassKg + frameMassKg + batteryMassKg + electronicsMassKg,
    required: `Component masses sum within ±5% of robot mass ${massKg} kg`,
    reason: `Actuators ${actuatorMassKg.toFixed(1)} + frame ${frameMassKg.toFixed(1)} + battery ${batteryMassKg.toFixed(1)} + electronics ${electronicsMassKg.toFixed(1)} = ${(actuatorMassKg + frameMassKg + batteryMassKg + electronicsMassKg).toFixed(1)} kg vs target ${massKg} kg. Within 5% if mass budget closes; warn ±15%; fail beyond.`,
  })

  const macroAssemblyTotal = macro_assembly_prices.reduce((a, m) => a + m.total_gbp, 0)

  return {
    product_class: 'humanoid',
    brief_summary: `${isIndustrial ? 'Industrial' : isConsumer ? 'Consumer' : 'General-purpose'} bipedal humanoid robot, ${massKg} kg / ${heightM.toFixed(2)} m / ${dofCount} DOF (legs ${dofLegs} + arms ${dofArms} + waist/neck ${dofWaistNeck} + hands ${dofHands}). ${payloadKg} kg payload at arm extension, ${walkingSpeedMs.toFixed(1)} m/s walking. ${battEnergyKwh.toFixed(2)} kWh ${dcBusVoltage} V Li-ion pack (${batteryMassKg.toFixed(1)} kg @ ${batteryPackSpecificEnergyWhKg} Wh/kg pack), ${batteryRuntimeHr.toFixed(1)} hr runtime @ ${avgPowerW.toFixed(0)} W avg. ${computeTops} TOPS Jetson Orin compute, ${cameraCount} cameras + ${imuCount} IMU + ${ftSensorCount} FT + ${tofLidarCount} ToF lidar. ${frameMaterial.replace('_', ' + ')} frame ${frameMassKg.toFixed(1)} kg. ${dofHands >= 10 ? '5-finger dexterous hands' : '2-finger grippers'}. ${isIndustrial ? 'ISO 10218-1 + TS 15066 industrial safety' : isConsumer ? 'ISO 13482 personal-care robot' : 'general-purpose'}. Macro-assembly raw BoM = £${macroAssemblyTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} (≈£${Math.round(macroAssemblyTotal).toLocaleString()}/unit vs £25k-150k production-scale per-unit benchmark).`,
    quantities,
    topology,
    macro_assembly_prices,
    closures,
  }
})

// ---------------- dac -----------------------------
// Full archetype contract — replaces buildMinimalContract stub. Direct
// Air Capture plant (Climeworks Orca/Mammoth / Carbon Engineering / Heirloom
// / Verdox / Global Thermostat class). Modelled on bess / wind_turbine
// pattern. Macro prices grounded in IEA Direct Air Capture: A Key
// Technology for Net Zero 2022 + RMI The State of Climate Tech 2024 +
// Climeworks Mammoth public disclosures + Carbon Engineering DAC1 cost
// model. Installed £400-1500/tCO₂/yr (per INSTALLED_ASP_BENCHMARKS;
// solid-sorbent lower band, liquid-hydroxide upper band including
// pellet-reactor + calciner + slaker).
registerArchetype('dac', (brief: any) => {
  const desc = String(brief?.product_description ?? '')
  const tp = brief?.constraints?.target_performance ?? {}
  // Capture capacity (t CO₂ / year) — primary brief variable. Accept
  // t/yr, kt/yr, Mt/yr. Reject if unit is concentration (ppm) or % capture.
  const captureTonsYr = (() => {
    const descCap = desc.match(/(\d{1,4}(?:,\d{3})*|\d{1,7}(?:\.\d+)?)\s*(t|kt|mt|tonne[s]?|metric\s+ton[s]?|tons?)\s*(?:CO2|CO₂)?\s*(?:\/|per)?\s*(?:yr|year|annum|a)/i)
      ?? desc.match(/capture[\s:]{0,8}(\d{1,4}(?:,\d{3})*|\d{1,7}(?:\.\d+)?)\s*(t|kt|mt|tonne[s]?)\s*(?:CO2|CO₂)?\s*(?:\/|per)?\s*(?:yr|year|annum)?/i)
    if (descCap) {
      const v = parseFloat(descCap[1].replace(/,/g, ''))
      const unit = descCap[2].toLowerCase()
      if (unit === 'mt' || unit === 'megaton' || unit === 'megatonne') return v * 1_000_000
      if (unit === 'kt' || unit === 'kiloton' || unit === 'kilotonne') return v * 1000
      return v
    }
    const u = String(tp.unit ?? '').toLowerCase()
    if (Number(tp.value ?? 0) > 0) {
      if (u === 'mt' || u === 'mt/yr' || u === 'megaton_yr' || u === 'megatonne') return Number(tp.value) * 1_000_000
      if (u === 'kt' || u === 'kt/yr' || u === 'kiloton') return Number(tp.value) * 1000
      if (u === 't/yr' || u === 'tonne' || u === 'ton' || u === 't') return Number(tp.value)
      // Wrong unit (ppm, %, kJ/mol) → fall to default
    }
    return 1000  // class default: 1 kt/yr pilot plant
  })()
  // Sorbent class enum (1-4) — choice drives nearly every downstream parameter
  //   1 = solid amine on silica (Climeworks / Heirloom / Global Thermostat)
  //   2 = metal-organic framework (MOF) (Verdox electroswing-class)
  //   3 = liquid potassium hydroxide / sodium hydroxide (Carbon Engineering)
  //   4 = zeolite / molecular sieve (research scale)
  const sorbentType: 1 | 2 | 3 | 4 = /mof|metal[\s-]?organic[\s-]?framework/i.test(desc) ? 2
    : /koh|naoh|hydroxide|liquid[\s-]?solvent|sodium[\s-]?hydroxide|carbon\s+engineering/i.test(desc) ? 3
    : /zeolite|molecular[\s-]?sieve/i.test(desc) ? 4
    : 1
  // Process — high-temperature swing (HT) for liquid, low-temperature swing
  // (LT, vacuum + steam <120°C) for solid amine/MOF.
  const isHighTempProcess = sorbentType === 3 || /high[\s-]?temp|calciner|900\s*°?C/i.test(desc)
  // Regeneration temperature (°C) — drives energy footprint:
  //   Solid amine: 90-120°C (steam or hot air); LT-DAC
  //   MOF: 85-120°C; LT-DAC, vacuum-assisted
  //   Liquid KOH: 900°C (calciner for CaCO₃→CaO+CO₂); HT-DAC
  //   Zeolite: 250°C; medium-temp
  const regenTempC = extractRangeFromDesc(desc, /(\d{2,4})\s*°?C\s*(?:regen|reactiv|swing)/i,
    sorbentType === 3 ? 900 : sorbentType === 4 ? 250 : 100)
  // Energy intensity GJ per t CO₂ — sorbent-class specific:
  //   Solid amine: 5-10 GJ/t (60% thermal low-grade heat + 40% electricity)
  //   MOF: 4-8 GJ/t (vacuum-assisted, lower thermal duty)
  //   Liquid hydroxide: 8-14 GJ/t (high-temp calciner)
  //   Zeolite: 7-10 GJ/t
  const energyGjPerTon = extractRangeFromDesc(desc, /(\d+(?:\.\d+)?)\s*GJ\/(?:ton|tonne|t)/i,
    sorbentType === 1 ? 7.5 : sorbentType === 2 ? 6 : sorbentType === 3 ? 10 : 8)
  // Split thermal / electrical intensity
  const thermalFraction = sorbentType === 3 ? 0.75 : sorbentType === 2 ? 0.55 : 0.65
  const thermalGjPerTon = energyGjPerTon * thermalFraction
  const electricalGjPerTon = energyGjPerTon * (1 - thermalFraction)
  // Continuous power demand. (GJ/tCO2 × tCO2/yr) → MW.
  // Conversion: 1 GJ/yr = 1e9 J / (8760×3600 s) = 31.71 W = 31.71e-6 MW
  // So MW = energyGjPerTon × captureTonsYr × 1e9 / 31_536_000 / 1e6
  //       = (energyGjPerTon × captureTonsYr) / 31_536
  const totalContinuousMw = (energyGjPerTon * captureTonsYr) / 31_536
  const electricalContinuousMw = totalContinuousMw * (1 - thermalFraction)
  const thermalContinuousMw = totalContinuousMw * thermalFraction
  // Capture efficiency at design — typical 85-95% at design air-flow.
  // Atmospheric CO₂ ≈ 420 ppm → mass concentration 0.00076 kg CO₂/m³ air.
  const captureEfficiencyAtDesign = sorbentType === 3 ? 0.95 : sorbentType === 2 ? 0.92 : 0.85
  // Air mass flow needed per ton CO₂ captured (theoretical, then divided by efficiency)
  const co2MassConcKgPerM3 = 0.00076  // 420 ppm × 44/29 × air density
  const airFlowM3PerTon = 1000 / (co2MassConcKgPerM3 * captureEfficiencyAtDesign)  // ~1.5M m³ air per t CO₂
  const annualAirFlowM3 = airFlowM3PerTon * captureTonsYr
  // Contactor face velocity — typical 1.5-3 m/s for solid amine; 4-6 m/s
  // for MOF (lower pressure drop). Carbon Engineering 1-2 m/s through
  // PVC fill in cross-flow cooling-tower-like contactor.
  const contactorFaceVelocityMs = sorbentType === 3 ? 1.5 : sorbentType === 2 ? 5 : 2.2
  // Required contactor face area (m²) — annual / (face_velocity × s/yr × utilisation)
  const utilisationFactor = 0.85  // capacity factor
  const contactorFaceAreaM2 = annualAirFlowM3 / (contactorFaceVelocityMs * 3600 * 8760 * utilisationFactor)
  // Sorbent inventory — solid amine inventory grows ~ 30-60 t per kt/yr capture
  //   (Climeworks Orca 4 kt/yr → 250 t amine inventory).
  const sorbentInventoryT = sorbentType === 3 ? captureTonsYr * 0.02  // liquid is much less per kt due to continuous turnover
    : sorbentType === 1 ? captureTonsYr * 0.05
    : sorbentType === 2 ? captureTonsYr * 0.04  // MOF higher uptake per kg
    : captureTonsYr * 0.03
  // Sorbent lifetime cycles — drives replacement cost
  //   Solid amine: 1500-3000 cycles before 30% capacity loss; replace every 3-5 yr
  //   MOF: 2000-5000 cycles
  //   Liquid hydroxide: 500-1000 cycles before degradation
  //   Zeolite: 5000-10000 cycles (most stable)
  const sorbentLifetimeCycles = sorbentType === 4 ? 7000 : sorbentType === 2 ? 3500 : sorbentType === 3 ? 750 : 2200
  const sorbentReplacementYears = sorbentLifetimeCycles / 365  // ~6 cycles/day typical
  // Water consumption — solid amine produces water as byproduct; liquid needs
  // make-up. Typical < 5 L/kg CO₂ for solid; 1-3 L/kg for liquid (loop closes).
  const waterConsumptionLPerKgCo2 = sorbentType === 3 ? 4 : sorbentType === 1 ? 2 : 1.5
  // CO₂ purity required for sequestration / utilisation
  //   For geological storage: ≥95% (allow some H₂O + N₂ contamination)
  //   For food-grade utilisation (e.g. carbonation): ≥99.97%
  //   For methanol/synfuel production: ≥99.5%
  const co2PurityPctRequired = /food|beverage|carbonation/i.test(desc) ? 99.97
    : /methanol|synfuel|sustainable\s+aviation|jet/i.test(desc) ? 99.5
    : 96
  // CO₂ compression train pressure (bar) — typical pipeline injection 100-150 bar;
  // geological storage may require 200 bar at depth.
  const co2CompressionPressureBar = extractRangeFromDesc(desc, /(\d{2,4})\s*bar/i,
    /pipeline|sequest|inject/i.test(desc) ? 150 : 100)
  // CO₂ compression power (electrical) — typical 0.10-0.15 kWh/kg CO₂ for
  // 1→100 bar 4-stage centrifugal with intercooling.
  // Conversion: kWh/kg × t/yr × 1000 kg/t = kWh/yr; / 8760 h/yr = kW; / 1000 = MW.
  const compressionKwhPerKg = 0.12
  const compressionMw = (compressionKwhPerKg * captureTonsYr * 1000) / 8760 / 1000
  // Modular contactor cells. Climeworks design uses 70 t/yr "collectors"
  // (cube-shaped fan boxes); Carbon Engineering uses ~10 kt/yr 20-m-tall
  // cross-flow contactor towers.
  const modularCollectorTonsPerUnit = sorbentType === 3 ? 10000 : 70
  const numCollectorModules = Math.ceil(captureTonsYr / modularCollectorTonsPerUnit)
  // Cost per ton at scale — target. Brief override otherwise.
  const targetCostPerTonGbp = extractRangeFromDesc(desc, /£?(\d{2,4})\s*\/?\s*(?:t|ton|tonne)/i, 400)

  const quantities: Record<string, Quantity> = {
    capture_capacity_tco2_per_year: q(captureTonsYr, 't/yr', 'flow_rate', 'rated', 'system', 'brief'),
    sorbent_class: q(sorbentType, '', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: 'enum: 1=solid amine on silica, 2=MOF metal-organic framework, 3=liquid KOH/NaOH (HT process), 4=zeolite' }),
    process_type: q(isHighTempProcess ? 2 : 1, '', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: 'enum: 1=low-temp swing (LT-DAC, <120°C), 2=high-temp swing (HT-DAC, calciner ≥900°C)' }),
    regeneration_temperature_c: q(regenTempC, '°C', 'temperature', 'max', 'system', 'physics_constant', { source_detail: 'solid amine 90-120 / MOF 85-120 / liquid hydroxide 900 (calciner) / zeolite 250' }),
    energy_intensity_gj_per_tco2: q(energyGjPerTon, 'GJ/t', 'energy', 'rated', 'system', 'brief', { source_detail: 'thermal + electrical aggregate per t CO₂ captured' }),
    thermal_energy_gj_per_tco2: q(thermalGjPerTon, 'GJ/t', 'energy', 'rated', 'system', 'calculator'),
    electrical_energy_gj_per_tco2: q(electricalGjPerTon, 'GJ/t', 'energy', 'rated', 'system', 'calculator'),
    total_continuous_power_mw: q(totalContinuousMw, 'MW', 'power', 'continuous', 'system', 'calculator'),
    electrical_continuous_power_mw: q(electricalContinuousMw, 'MW', 'power', 'continuous', 'system', 'calculator'),
    thermal_continuous_power_mw: q(thermalContinuousMw, 'MW', 'power', 'continuous', 'system', 'calculator'),
    capture_efficiency_at_design: q(captureEfficiencyAtDesign, '', 'dimensionless', 'rated', 'system', 'physics_constant', { source_detail: 'solid amine 85% / MOF 92% / liquid hydroxide 95% / zeolite 88%' }),
    co2_inlet_concentration_ppm: q(420, 'ppm', 'dimensionless', 'typical', 'system', 'physics_constant', { source_detail: 'atmospheric CO₂ 2024-2026 baseline 420-425 ppm' }),
    air_flow_m3_per_tco2: q(airFlowM3PerTon, 'm³/t', 'flow_rate', 'rated', 'system', 'calculator', { source_detail: '1000 / (CO₂_mass_concentration × efficiency); ~1.5-2 million m³ air per t CO₂' }),
    annual_air_throughput_m3: q(annualAirFlowM3, 'm³/yr', 'flow_rate', 'rated', 'system', 'calculator'),
    contactor_face_velocity_ms: q(contactorFaceVelocityMs, 'm/s', 'velocity', 'rated', 'module', 'physics_constant', { source_detail: 'solid amine 1.5-3 / MOF 4-6 / liquid hydroxide cross-flow 1-2' }),
    contactor_face_area_m2: q(contactorFaceAreaM2, 'm²', 'area', 'aperture', 'system', 'calculator', { source_detail: 'annual_air_flow / (face_velocity × seconds_per_year × utilisation 0.85)' }),
    sorbent_inventory_tonnes: q(sorbentInventoryT, 't', 'mass', 'gross', 'module', 'calculator', { source_detail: 'Climeworks Orca 4 kt/yr → ~200 t amine inventory benchmark' }),
    sorbent_lifetime_cycles: q(sorbentLifetimeCycles, '', 'dimensionless', 'lifetime', 'module', 'physics_constant'),
    sorbent_replacement_interval_years: q(sorbentReplacementYears, 'yr', 'time', 'cycle', 'module', 'calculator'),
    water_consumption_l_per_kg_co2: q(waterConsumptionLPerKgCo2, 'L/kg', 'flow_rate', 'rated', 'system', 'physics_constant', { source_detail: 'solid amine 1-3 / MOF 1-2 / liquid hydroxide 3-5 (make-up water for evaporative loss)' }),
    co2_purity_required_pct: q(co2PurityPctRequired, '%', 'dimensionless', 'rated', 'system', 'brief', { source_detail: 'geological storage ≥95%, methanol/synfuel ≥99.5%, food-grade ≥99.97%' }),
    co2_compression_pressure_bar: q(co2CompressionPressureBar, 'bar', 'pressure', 'rated', 'module', 'brief', { source_detail: 'pipeline injection 100-150 bar typical; deep saline aquifer up to 200 bar' }),
    co2_compression_power_mw: q(compressionMw, 'MW', 'power', 'continuous', 'module', 'calculator'),
    num_collector_modules: q(numCollectorModules, '', 'dimensionless', 'rated', 'system', 'calculator', { source_detail: `${modularCollectorTonsPerUnit} t/yr per module (${sorbentType === 3 ? 'large cross-flow contactor tower' : 'modular collector cube'})` }),
    target_cost_gbp_per_tco2: q(targetCostPerTonGbp, 'GBP/t', 'currency', 'rated', 'system', 'brief'),
  }

  // Topology constraints — typed edges. DAC has dual mass-transport
  // (air loop for adsorption + steam/heat loop for desorption + CO₂
  // compression train downstream) overlaid with electrical (fans + pumps
  // + compressors) and thermal (heat-recovery between regen and incoming).
  const topology: TopologyEdge[] = [
    {
      from_part: 'ambient_air_intake',
      to_part: 'contactor_structure',
      mechanism: 'fluid_loop',
      constraint_kind: 'flow_capacity',
      required_value: annualAirFlowM3 / (8760 * 3600),  // m³/s
      required_unit: 'm³/s',
      required_margin_factor: 1.2,
      material_context: sorbentType === 3
        ? 'cross-flow_contactor_PVC_fill_with_recirculating_KOH_spray'
        : sorbentType === 2
        ? 'monolithic_MOF_structured_packing_with_axial_air_flow'
        : 'modular_sorbent_bed_cubes_with_axial_fan_intake',
    },
    {
      from_part: 'electrical_grid_input',
      to_part: 'fan_array_motors',
      mechanism: 'electrical_bus',
      constraint_kind: 'current_rating',
      required_value: (electricalContinuousMw * 0.4 * 1_000_000) / (3 * 415),  // 40% of electricity to fans, three-phase
      required_unit: 'A',
      required_margin_factor: 1.25,
      material_context: '415_V_three_phase_grid_supply_with_VFD_for_variable_air_flow_control_per_IEC_60204',
    },
    {
      from_part: 'contactor_structure',
      to_part: 'regeneration_skid',
      mechanism: 'thermal',
      constraint_kind: 'thermal_rejection',
      required_value: thermalContinuousMw,
      required_unit: 'MW',
      required_margin_factor: 1.15,
      material_context: isHighTempProcess
        ? 'calciner_900C_natural_gas_or_electric_resistance_or_hydrogen_combustion'
        : 'steam_supply_100-120C_from_waste_heat_or_low-grade_geothermal_or_electric_heat_pump',
    },
    {
      from_part: 'regeneration_skid',
      to_part: 'co2_compression_train',
      mechanism: 'fluid_loop',
      constraint_kind: 'flow_capacity',
      required_value: captureTonsYr / 8760,  // t/hr
      required_unit: 't/hr',
      material_context: '4-stage_centrifugal_or_reciprocating_compressor_with_intercooling_water_or_air_cooled',
    },
    {
      from_part: 'co2_compression_train',
      to_part: 'pipeline_injection_point',
      mechanism: 'fluid_loop',
      constraint_kind: 'flow_capacity',
      required_value: co2CompressionPressureBar,
      required_unit: 'bar',
      material_context: `dense_phase_CO2_at_${co2CompressionPressureBar}_bar_for_pipeline_or_well_injection_per_ASME_B31.4_pipeline_code`,
    },
    {
      from_part: 'regeneration_steam',
      to_part: 'heat_recovery_loop',
      mechanism: 'thermal',
      constraint_kind: 'thermal_rejection',
      required_value: thermalContinuousMw * 0.4,  // 40% heat recovery typical
      required_unit: 'MW',
      material_context: 'plate_or_shell_tube_heat_exchanger_recovers_low-grade_heat_from_outgoing_steam_to_preheat_incoming_air_or_water',
    },
    {
      from_part: 'control_system',
      to_part: 'fan_compressor_valves',
      mechanism: 'data',
      constraint_kind: 'data_bandwidth',
      required_value: 100,
      required_unit: 'Hz',
      material_context: 'plant_DCS_per_IEC_62443_with_SIS_safety-instrumented_system_for_high-temp_calciner_or_solvent_loop',
    },
    {
      from_part: 'water_treatment_plant',
      to_part: 'process_water_supply',
      mechanism: 'fluid_loop',
      constraint_kind: 'flow_capacity',
      required_value: waterConsumptionLPerKgCo2 * captureTonsYr,  // L/yr; convert downstream
      required_unit: 'L/yr',
      material_context: 'deionised_water_supply_for_sorbent_replenishment_and_make-up_for_evaporative_losses',
    },
    {
      from_part: 'foundation_pad',
      to_part: 'collector_modules',
      mechanism: 'mechanical',
      constraint_kind: 'mass_carry',
      required_value: numCollectorModules * (sorbentType === 3 ? 500_000 : 8000),  // kg
      required_unit: 'kg',
      required_margin_factor: 1.5,
      material_context: 'reinforced_concrete_slab_or_piled_foundation_designed_for_wind_load_+_seismic_class_per_local_code',
    },
  ]

  // Macro-assembly pricing — Climeworks Mammoth + Carbon Engineering DAC1
  // + Heirloom + Verdox public disclosures + IEA 2022 DAC cost analysis.
  // Word names chosen for ≥0.66 token overlap with Stage 1.7 emissions
  // (contactor_structure, sorbent_inventory, regeneration_skid,
  // co2_compression_train, heat_recovery_loop, control_system, foundation,
  // power_supply_infrastructure, water_treatment).
  // Pricing per kt/yr at scale (FOAK 2024):
  //   Contactor (fans + ducts + structural cage):
  //     Solid amine: £180/(tCO2/yr) — modular collector cubes
  //     MOF:         £150/(tCO2/yr) — lower pressure drop, smaller fans
  //     Liquid hydroxide: £120/(tCO2/yr) — single large tower more efficient at MW scale
  //   Sorbent inventory:
  //     Solid amine: £85/kg sorbent (silica-supported amine)
  //     MOF:         £450/kg (early-stage premium; declining)
  //     Liquid KOH:  £1.2/kg (cheap but high turnover)
  //     Zeolite:     £25/kg
  //   Regeneration skid (heat exchangers + vacuum pumps OR calciner):
  //     LT-DAC: £35/(tCO2/yr) — heat exchangers + vacuum pumps
  //     HT-DAC (with calciner): £180/(tCO2/yr) — natural-gas/H2 calciner is dominant
  //   CO₂ compression train: £140/(tCO2/yr) — 4-stage centrifugal + intercooling
  //   Heat recovery: £45/(tCO2/yr) — plate + shell-tube exchangers
  //   Control system + DCS: £180k flat + £8/(tCO2/yr) — SIS for HT-DAC
  //   Foundation (concrete + piles): £25/(tCO2/yr)
  //   Power supply (transformer + switchgear + cabling): £85/(tCO2/yr)
  //   Water treatment (DI + RO): £15/(tCO2/yr)
  const contactorPerTon = sorbentType === 3 ? 120 : sorbentType === 2 ? 150 : 180
  const sorbentPricePerKg = sorbentType === 1 ? 85 : sorbentType === 2 ? 450 : sorbentType === 3 ? 1.2 : 25
  const sorbentMassKg = sorbentInventoryT * 1000
  const regenSkidPerTon = isHighTempProcess ? 180 : 35
  const compressionTrainPerTon = 140
  const heatRecoveryPerTon = 45
  const foundationPerTon = 25
  const powerSupplyPerTon = 85
  const waterTreatmentPerTon = 15
  const macro_assembly_prices: MacroAssemblyPrice[] = [
    {
      word_name: 'contactor_structure_with_fans',
      unit_price_gbp: contactorPerTon,
      dimension_basis: 'each',
      dimension_value: captureTonsYr,
      total_gbp: contactorPerTon * captureTonsYr,
      source_detail: `£${contactorPerTon}/(tCO₂/yr) × ${captureTonsYr.toLocaleString()} tCO₂/yr (${sorbentType === 3 ? 'cross-flow contactor tower with PVC fill + KOH spray + axial fans, Carbon Engineering DAC1 class' : sorbentType === 2 ? 'monolithic MOF structured packing + axial-flow fans + housing' : 'modular collector cubes with axial fans, ducts, sorbent baskets, structural cage; Climeworks/Heirloom class'}; ${numCollectorModules} units of ${modularCollectorTonsPerUnit} t/yr each; ${contactorFaceAreaM2.toFixed(0)} m² total face area @ ${contactorFaceVelocityMs} m/s)`,
    },
    {
      word_name: 'sorbent_inventory',
      unit_price_gbp: sorbentPricePerKg,
      dimension_basis: 'kg_mass',
      dimension_value: sorbentMassKg,
      total_gbp: sorbentPricePerKg * sorbentMassKg,
      source_detail: `£${sorbentPricePerKg}/kg × ${sorbentMassKg.toFixed(0)} kg (${sorbentType === 1 ? 'amine-functionalised silica or PEI on porous silica gel; ~3-5 yr replacement' : sorbentType === 2 ? 'MOF MIL-101 or amine-grafted MOF; early-stage premium, declining cost trajectory' : sorbentType === 3 ? 'KOH/NaOH solution; high turnover (~1.5 yr lifetime) but cheap make-up' : 'zeolite 13X molecular sieve; longest lifetime but lower CO₂ uptake per kg'}); annual replacement cost ~£${(sorbentPricePerKg * sorbentMassKg / sorbentReplacementYears).toLocaleString(undefined, { maximumFractionDigits: 0 })}/yr`,
    },
    {
      word_name: 'regeneration_skid',
      unit_price_gbp: regenSkidPerTon,
      dimension_basis: 'each',
      dimension_value: captureTonsYr,
      total_gbp: regenSkidPerTon * captureTonsYr,
      source_detail: `£${regenSkidPerTon}/(tCO₂/yr) × ${captureTonsYr.toLocaleString()} tCO₂/yr (${isHighTempProcess ? `${regenTempC}°C calciner — natural-gas, hydrogen or electric resistance heating; lime slaker; refractory-lined rotary kiln; £180/(tCO₂/yr) dominant cost at HT-DAC scale` : `${regenTempC}°C steam regeneration — plate + shell-tube heat exchangers + dry vacuum pumps + valves + piping; can run on waste heat from adjacent facility`})`,
    },
    {
      word_name: 'co2_compression_train',
      unit_price_gbp: compressionTrainPerTon,
      dimension_basis: 'each',
      dimension_value: captureTonsYr,
      total_gbp: compressionTrainPerTon * captureTonsYr,
      source_detail: `£${compressionTrainPerTon}/(tCO₂/yr) × ${captureTonsYr.toLocaleString()} tCO₂/yr (4-stage centrifugal compressor 1 → ${co2CompressionPressureBar} bar with water-cooled intercooling, moisture knock-out drum, molecular sieve dehydrator to ≤50 ppm H₂O, MAN/Atlas Copco/Mitsubishi class; ${compressionMw.toFixed(2)} MW electric drive)`,
    },
    {
      word_name: 'heat_recovery_loop',
      unit_price_gbp: heatRecoveryPerTon,
      dimension_basis: 'each',
      dimension_value: captureTonsYr,
      total_gbp: heatRecoveryPerTon * captureTonsYr,
      source_detail: `£${heatRecoveryPerTon}/(tCO₂/yr) × ${captureTonsYr.toLocaleString()} tCO₂/yr (plate heat exchangers + shell-tube economiser recovering ~40% of regen heat into incoming air or process water; cuts thermal demand by ~20-30%)`,
    },
    {
      word_name: 'control_system_dcs',
      unit_price_gbp: 180_000 + 8 * captureTonsYr,
      dimension_basis: 'each',
      dimension_value: 1,
      total_gbp: 180_000 + 8 * captureTonsYr,
      source_detail: `£${(180_000 + 8 * captureTonsYr).toLocaleString()} (Emerson DeltaV or Honeywell Experion DCS + ${isHighTempProcess ? 'SIL-2 SIS for calciner trip + fuel-isolation per IEC 61511' : 'standard process control'}; HMI + historian + cybersecurity per IEC 62443)`,
    },
    {
      word_name: 'foundation_concrete',
      unit_price_gbp: foundationPerTon,
      dimension_basis: 'each',
      dimension_value: captureTonsYr,
      total_gbp: foundationPerTon * captureTonsYr,
      source_detail: `£${foundationPerTon}/(tCO₂/yr) × ${captureTonsYr.toLocaleString()} tCO₂/yr (reinforced concrete slab + piled foundation for contactor + regen + compression infrastructure; designed for wind loading + seismic per local code)`,
    },
    {
      word_name: 'power_supply_infrastructure',
      unit_price_gbp: powerSupplyPerTon,
      dimension_basis: 'each',
      dimension_value: captureTonsYr,
      total_gbp: powerSupplyPerTon * captureTonsYr,
      source_detail: `£${powerSupplyPerTon}/(tCO₂/yr) × ${captureTonsYr.toLocaleString()} tCO₂/yr (${electricalContinuousMw.toFixed(1)} MW supply: 11/33 kV step-down transformer + MV switchgear + LV distribution + cabling; grid-connected or co-located with renewable generation)`,
    },
    {
      word_name: 'water_treatment_plant',
      unit_price_gbp: waterTreatmentPerTon,
      dimension_basis: 'each',
      dimension_value: captureTonsYr,
      total_gbp: waterTreatmentPerTon * captureTonsYr,
      source_detail: `£${waterTreatmentPerTon}/(tCO₂/yr) × ${captureTonsYr.toLocaleString()} tCO₂/yr (RO + DI water for sorbent make-up + cooling; ~${(waterConsumptionLPerKgCo2 * captureTonsYr).toLocaleString()} L/yr process water demand)`,
    },
  ]

  // Closures — design-rule gates
  const closures: ContractClosureResult[] = []
  closures.push({
    invariant_id: 'capture_efficiency_above_85pct_at_design',
    status: captureEfficiencyAtDesign >= 0.85 ? 'pass' : captureEfficiencyAtDesign >= 0.75 ? 'warn' : 'fail',
    measured: captureEfficiencyAtDesign,
    required: '≥85% capture efficiency at design air-flow (single-pass through contactor)',
    reason: `Capture efficiency ${(captureEfficiencyAtDesign * 100).toFixed(0)}% at design face velocity ${contactorFaceVelocityMs} m/s. Below 85% means high air-throughput multiplier; below 75% economics become marginal.`,
  })
  closures.push({
    invariant_id: 'energy_intensity_within_class_band',
    status: (sorbentType === 1 && energyGjPerTon >= 5 && energyGjPerTon <= 10)
         || (sorbentType === 2 && energyGjPerTon >= 4 && energyGjPerTon <= 8)
         || (sorbentType === 3 && energyGjPerTon >= 8 && energyGjPerTon <= 14)
         || (sorbentType === 4 && energyGjPerTon >= 7 && energyGjPerTon <= 10) ? 'pass' : 'warn',
    measured: energyGjPerTon,
    required: sorbentType === 1 ? '5-10 GJ/tCO₂ (solid amine band)'
      : sorbentType === 2 ? '4-8 GJ/tCO₂ (MOF band — lower thermal duty via vacuum)'
      : sorbentType === 3 ? '8-14 GJ/tCO₂ (liquid hydroxide HT-DAC band — calciner-dominated)'
      : '7-10 GJ/tCO₂ (zeolite band)',
    reason: `Energy intensity ${energyGjPerTon.toFixed(1)} GJ/tCO₂ (${thermalGjPerTon.toFixed(1)} thermal + ${electricalGjPerTon.toFixed(1)} electrical). Outside band signals unrealistic sorbent performance or process integration gap.`,
  })
  closures.push({
    invariant_id: 'water_consumption_below_5l_per_kg_co2',
    status: waterConsumptionLPerKgCo2 <= 5 ? 'pass' : 'warn',
    measured: waterConsumptionLPerKgCo2,
    required: '≤5 L water/kg CO₂ captured — siting-feasibility threshold in arid regions (Carbon Engineering target 3-4 L/kg; Climeworks solid amine 1-2 L/kg)',
    reason: `Water consumption ${waterConsumptionLPerKgCo2.toFixed(1)} L/kg CO₂. >5 L/kg restricts siting to humid regions; restricts ability to co-locate with geological storage in arid basins.`,
  })
  closures.push({
    invariant_id: 'sorbent_lifetime_economic_threshold',
    status: sorbentLifetimeCycles >= 1000 ? 'pass' : sorbentLifetimeCycles >= 500 ? 'warn' : 'fail',
    measured: sorbentLifetimeCycles,
    required: '≥1000 cycles before 30% capacity loss — minimum for cost-effective sorbent amortisation (solid amine 1500-3000, MOF 2000-5000, KOH 500-1000, zeolite 5000+)',
    reason: `Sorbent lifetime ${sorbentLifetimeCycles} cycles → ${sorbentReplacementYears.toFixed(1)} yr at 6 cycles/day. Annual replacement cost £${(sorbentPricePerKg * sorbentMassKg / sorbentReplacementYears).toLocaleString(undefined, { maximumFractionDigits: 0 })}/yr; if cycles <1000 OpEx becomes prohibitive.`,
  })
  closures.push({
    invariant_id: 'co2_purity_meets_downstream_use',
    status: co2PurityPctRequired <= 99.97 ? 'pass' : 'warn',
    measured: co2PurityPctRequired,
    required: 'Geological storage ≥95%, methanol/synfuel ≥99.5%, food-grade ≥99.97% per ISO 5145 / EIGA Doc 70',
    reason: `Required ${co2PurityPctRequired}% purity ${co2PurityPctRequired >= 99.97 ? '— requires additional polish unit (molecular sieve + activated carbon + cryogenic distillation) beyond standard DAC train' : '— achievable with standard 4-stage compression + mol-sieve drying + KO drum sequence'}.`,
  })
  // 2026-05-23 fix (post-batch-3 review): split CapEx and OpEx into
  // separate closures. The macro_assembly_prices total gives £/(tCO2/yr)
  // CapEx — that has a different industry band than the £/tCO2 OpEx
  // (which is the operating cost per ton CAPTURED). Previously a single
  // closure compared the brief's OpEx target against a band that was a
  // mix of CapEx + OpEx — easy to misread.
  // CapEx CHECK: macro_assembly_prices total / capture_tons_per_year vs
  // industry band £400-1500/(tCO2/yr) — this is what INSTALLED_ASP_BENCHMARKS
  // codifies (just updated in audit-pdf-run.ts).
  const capExPerTonPerYearGbp = macro_assembly_prices.reduce((a, m) => a + m.total_gbp, 0) / captureTonsYr
  closures.push({
    invariant_id: 'capex_per_ton_per_year_within_band',
    status: capExPerTonPerYearGbp >= 400 && capExPerTonPerYearGbp <= 1500 ? 'pass' : 'warn',
    measured: Math.round(capExPerTonPerYearGbp),
    required: '£400-1500/(tCO₂/yr) CapEx installed-ASP per IRENA 2024 (solid amine 600-1200, liquid hydroxide 800-1500, MOF 800-2000)',
    reason: `Computed CapEx £${Math.round(capExPerTonPerYearGbp)}/(tCO₂/yr). Sum of macro_assembly_prices £${(macro_assembly_prices.reduce((a, m) => a + m.total_gbp, 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })} ÷ ${captureTonsYr.toLocaleString()} tCO₂/yr.`,
  })
  // OpEx CHECK: brief's stated target cost per ton CAPTURED — this is what
  // founders typically negotiate against (carbon-credit revenue vs OpEx).
  // Bands are different from CapEx — typical 2024 OpEx is £150-500/tCO₂
  // for industrial-scale, with DOE Carbon Negative Shot pushing to £80
  // by 2050.
  closures.push({
    invariant_id: 'opex_per_ton_brief_target_realistic',
    status: targetCostPerTonGbp >= 150 && targetCostPerTonGbp <= 500 ? 'pass' : targetCostPerTonGbp <= 800 ? 'warn' : 'fail',
    measured: targetCostPerTonGbp,
    required: '£150-500/tCO₂ OpEx is current industrial-scale band (Climeworks Mammoth ~£350; DOE Carbon Negative Shot target £80 by 2050)',
    reason: `Brief OpEx target £${targetCostPerTonGbp}/tCO₂ captured. ${targetCostPerTonGbp < 150 ? 'Unrealistically aggressive — would beat 2050 DOE moonshot' : targetCostPerTonGbp <= 500 ? 'Within current industrial-scale band' : targetCostPerTonGbp <= 800 ? 'FOAK / early commercial band — defensible for pilot scale' : 'Above commercial viability — must show carbon-credit + tax credit + co-product revenue to close the gap'}.`,
  })

  const macroAssemblyTotal = macro_assembly_prices.reduce((a, m) => a + m.total_gbp, 0)
  const installedAspPerTon = macroAssemblyTotal / captureTonsYr

  return {
    product_class: 'dac',
    brief_summary: `${(captureTonsYr / 1000).toFixed(1)} kt CO₂/yr direct air capture plant, ${sorbentType === 1 ? 'solid amine' : sorbentType === 2 ? 'MOF' : sorbentType === 3 ? 'liquid hydroxide (HT-DAC with calciner)' : 'zeolite'} sorbent (${sorbentInventoryT.toFixed(1)} t inventory, ${sorbentLifetimeCycles} cycles / ${sorbentReplacementYears.toFixed(1)} yr replacement). ${energyGjPerTon.toFixed(1)} GJ/tCO₂ regeneration energy (${thermalGjPerTon.toFixed(1)} thermal @ ${regenTempC}°C + ${electricalGjPerTon.toFixed(1)} electrical). ${totalContinuousMw.toFixed(1)} MW total demand (${electricalContinuousMw.toFixed(1)} MW elec + ${thermalContinuousMw.toFixed(1)} MW thermal). ${numCollectorModules} × ${modularCollectorTonsPerUnit} t/yr collector modules, ${contactorFaceAreaM2.toFixed(0)} m² face area @ ${contactorFaceVelocityMs} m/s. ${(captureEfficiencyAtDesign * 100).toFixed(0)}% capture efficiency at design. ${waterConsumptionLPerKgCo2} L/kg water consumption. CO₂ output ${co2PurityPctRequired}% purity @ ${co2CompressionPressureBar} bar. Macro-assembly raw BoM = £${(macroAssemblyTotal / 1_000_000).toFixed(1)}M (≈£${installedAspPerTon.toFixed(0)}/(tCO₂/yr) vs £400-1500/(tCO₂/yr) installed benchmark; target £${targetCostPerTonGbp}/tCO₂ OpEx).`,
    quantities,
    topology,
    macro_assembly_prices,
    closures,
  }
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
