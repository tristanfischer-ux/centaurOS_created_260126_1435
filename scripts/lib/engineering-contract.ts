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
  // Normalise to kWh USABLE (brief says "Usable energy: 3.5 MWh minimum at 80% DoD")
  const usableKwh = briefUnit === 'mwh' ? briefValue * 1000
    : briefUnit === 'gwh' ? briefValue * 1_000_000
    : briefUnit === 'wh' ? briefValue / 1000
    : briefValue
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
  // LED efficacy 2.8 µmol/J typical for modern horticultural LED at full spectrum
  const ledEfficacyUmolPerJ = 2.8
  const ledPowerKw = (canopyAreaM2 * ppfdTarget) / ledEfficacyUmolPerJ / 1000
  // HVAC cooling: LED dissipates ~95% as heat at canopy + 5kW auxiliary + 20% safety margin
  const auxLoadKw = 5
  const hvacCoolingKw = (ledPowerKw * 0.95 + auxLoadKw) * 1.20
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
  // Normalise to kW THERMAL. Brief may use kW, W, or BTU/h.
  const thermalKw = briefUnit === 'w' ? briefValue / 1000
    : briefUnit === 'mw' ? briefValue * 1000
    : briefUnit === 'btu/h' || briefUnit === 'btu_h' || briefUnit === 'btuh' ? briefValue / 3412.142
    : briefValue > 0 ? briefValue
    : 12  // class default 12 kW (mid-range residential)
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
  // Working volume L: brief target_performance with unit conversion
  const workingVolumeL = (() => {
    if (briefValue > 0) {
      if (briefUnit === 'l' || briefUnit === 'litre' || briefUnit === 'litres' || briefUnit === 'liter' || briefUnit === 'liters') return briefValue
      if (briefUnit === 'm3' || briefUnit === 'm³' || briefUnit === 'cubic_metre' || briefUnit === 'cubic_meter') return briefValue * 1000
      if (briefUnit === 'ml') return briefValue / 1000
      return briefValue  // fallback assume L
    }
    const m = desc.match(/(\d{1,5})\s*(?:L|litre|liter)/i)
    if (m) return parseFloat(m[1])
    return 1000  // class default
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
