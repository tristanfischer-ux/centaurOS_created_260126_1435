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
  dimension_basis: 'metre_length' | 'metre_wingspan' | 'square_metre' | 'kwh_capacity' | 'litre_volume' | 'cubic_metre' | 'kg_mass'
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

export function buildContract(productClass: string, parsedBrief: any): EngineeringContract | null {
  const builder = ARCHETYPE_REGISTRY[productClass]
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

  // Macro-assembly pricing — placeholder; real prices land when Engine B
  // wiring happens in plan-mode session.
  const macro_assembly_prices: MacroAssemblyPrice[] = []

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

registerArchetype('haps', (_brief: any) => {
  // TODO: 50m wing → wing-area calculator → battery kWh from endurance × cruise
  //       power → solar W from battery / sun-hours → composite spar mass from
  //       wing area × areal-density → mass closure → cost from £/m wingspan.
  return {
    product_class: 'haps',
    brief_summary: 'HAPS — Contract scaffold pending full per-class calculator',
    quantities: {},
    topology: [],
    macro_assembly_prices: [],
    closures: [{ invariant_id: 'haps_archetype_pending', status: 'warn', measured: null, required: 'archetype calculator not yet implemented', reason: 'Stub — see Task #100' }],
  }
})

registerArchetype('vertical_farm', (_brief: any) => {
  // TODO: canopy m² → tier count → LED power from PPFD × area → HVAC
  //       cooling kW from LED + auxiliary loads → CO2 dosing from canopy →
  //       water from biomass yield.
  return {
    product_class: 'vertical_farm',
    brief_summary: 'Vertical farm — Contract scaffold pending full per-class calculator',
    quantities: {},
    topology: [],
    macro_assembly_prices: [],
    closures: [{ invariant_id: 'vf_archetype_pending', status: 'warn', measured: null, required: 'archetype calculator not yet implemented', reason: 'Stub — see Task #100' }],
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
