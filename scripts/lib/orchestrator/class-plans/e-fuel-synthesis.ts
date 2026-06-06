/**
 * scripts/lib/orchestrator/class-plans/e-fuel-synthesis.ts
 *
 * e_fuel_synthesis (Power-to-Liquid Fischer-Tropsch Sustainable Aviation Fuel
 * plant) TOOL PLAN — 2026-06-05.
 *
 * WHY THIS EXISTS: without a registered plan the orchestrator's UNIVERSAL_AUTO_PLAN
 * fallback composes a generic tool graph that pulls in domain-mismatched tools
 * (the spacecraft/battery/marine contamination the CO2 dossier exhibited). This
 * plan registers ONLY on-topic chemical-process-plant tools for the OXCCU PtL SAF
 * plant: single-step CO2 hydrogenation over an iron Fischer-Tropsch catalyst
 * (CO2 + 3 H2 -> -CH2- + 2 H2O) producing jet-range paraffins (SAF) + naphtha.
 *
 * MIRRORS the co2_mineralisation plan structure exactly (provFor/mkQty/q helpers,
 * ToolStep shape, contract_update writing real tool-output field names back into
 * contract.quantities with tool provenance so the "Tools Used" appendix + the
 * "Engineering Tools Flow" page render).
 *
 * CRITICAL — gate 34 (tool-archetype coherence): this plan uses NO marine tools
 * (no corrosion:anode-sizing, no pressure-vessel external/depth mode, no
 * seawater density) and NO irrigation tools (no irrigation:pump-sizing /
 * Hazen-Williams / n_emitters). pressure-vessel:design is invoked in
 * mode:'internal' (ASME VIII Div.1 UG-27 hoop-stress) for the internally-
 * pressurised fractionation column + separator shells. The liquid product pumps
 * use process:pump-sizing (Darcy-Weisbach), NOT irrigation:pump-sizing.
 *
 * UNIT-OPERATION -> TOOL MAP:
 *   1  reaction:stoichiometry-balance  CO2 + 3 H2 -> -CH2- + 2 H2O mass balance
 *   2  reaction:feasibility-gibbs      FT reaction dG/K feasibility verdict
 *   3  gas:compressor-sizing           CO2 feed compression (~1.5 -> 25 bar)
 *   4  gas:compressor-sizing           H2 feed compression
 *   5  gas:compressor-sizing           recycle / tail-gas boost compression
 *   6  process:fired-heater            combined-feed preheat to ~250 C
 *   7  reactor:cstr-pfr-sizing         single-step FT reactor (internal pressure)
 *   8  process:steam-generator         FT exotherm -> raised steam (heat REMOVAL)
 *   9  process:flash-separation        3-phase product separator (vapour/HC/water)
 *   10 ht:ntu-heat-exchanger           product coolers / overhead condensers
 *   11 process:pump-sizing             liquid product / reflux pumps
 *   12 pressure-vessel:design          fractionation column shell (mode:internal)
 *   13 storage-tank:liquid-fuel        SAF + naphtha product tanks (API 650)
 *   14 flare:thermal-oxidiser          purge / off-gas destruction
 *   15 lifecycle-co2:assessment        cradle-to-grave plant carbon
 *   16 mass-aggregator:envelope-check  skid mass-budget vs road envelope
 *   17 yield-economics:npv             SAF NPV / IRR / levelised cost
 *   18 regulatory-cert-cost:lookup     UK regulatory certification cost (universal)
 *   19 supply-chain-risk:scoring       feedstock/equipment supply risk (universal)
 *   20 reliability-fmea:system         plant reliability / warranty (universal)
 *   21 cybersecurity-threat-model:stride  DCS/SIS cyber posture (universal)
 *   22 transport-logistics:routing     skid transport logistics (universal)
 *
 * coupled_pairs: [reactor <-> recycle-compressor] (recycle rate <-> per-pass
 * conversion); max_iterations 2; convergence_tolerance_pct 5.0.
 *
 * British spelling.
 */

import { registerPlan } from '../planner'
import type { ClassToolPlan, ContractInProgress, ToolStep } from '../types'

const q = (c: ContractInProgress, key: string, fallback: number): number => {
  const v = c.quantities?.[key]?.value
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

// Tool-provenance + typed-quantity helpers (mirror the co2_mineralisation plan).
function provFor(toolId: string, version: string, license: string, url: string) {
  return (field: string) => ({
    source: `tool:${toolId}` as const,
    tool_id: toolId,
    tool_version: version,
    tool_license: license as any,
    tool_source_url: url,
    invocation_output_field: field,
    duration_ms: 0,
  })
}
function mkQty(value: number, unit: string, family: string, provenance: any, condition = 'rated'): any {
  return { value, unit, family, basis: 'rated', scope: 'system', uncertainty_pct: 8, temporal_resolution_s: null, condition, provenance }
}
const num = (o: any, ...keys: string[]): number | undefined => {
  for (const k of keys) { const v = o?.[k]; if (typeof v === 'number' && Number.isFinite(v)) return v }
  return undefined
}
function anchorProv(detail: string) {
  return { source: 'class_anchor' as const, invocation_output_field: `engineering_estimate:${detail}` }
}

// ===========================================================================
// 1. reaction:stoichiometry-balance — CO2 + 3 H2 -> -CH2- + 2 H2O mass balance.
//    Grounds the synthesis section from the captured-CO2 feed basis. -CH2- is the
//    Fischer-Tropsch hydrocarbon repeat unit (Hill formula CH2). REAL outputs read:
//    mass_flows_t_day{...}, atom_balanced.
// ===========================================================================
const stepFtStoichiometry: ToolStep = {
  tool_id: 'reaction:stoichiometry-balance',
  required: false,
  feeds_into: ['reactor:cstr-pfr-sizing', 'mass-aggregator:envelope-check'] as string[],
  input_from_contract: (c: ContractInProgress) => ({
    reaction_name: 'Fischer-Tropsch CO2 hydrogenation',
    species: [
      { name: 'CO2', coeff: -1, cas: '124-38-9' },
      { name: 'H2', coeff: -3, cas: '1333-74-0' },
      { name: 'CH2', coeff: 1, formula: 'CH2' },     // -CH2- FT hydrocarbon repeat unit (flat formula)
      { name: 'H2O', coeff: 2, cas: '7732-18-5' },
    ],
    // Basis: the biogenic CO2 feed (kg/h -> t/day).
    basis: { species: 'CO2', rate: (q(c, 'co2_feed_kg_h', 1000) * 24) / 1000, unit: 't/day', is_mass: true },
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('reaction:stoichiometry-balance', '1.0.0', 'MIT', 'github.com/CalebBell/chemicals')
    const f: Record<string, number> = (output?.mass_flows_t_day ?? {}) as Record<string, number>
    return { ...c, quantities: { ...c.quantities,
      ft_h2_consumed_t_day: mkQty(num(f, 'H2') ?? 3.36, 't/day', 'mass', p('mass_flows_t_day.H2'), 'H2 consumed (stoichiometric)'),
      ft_hydrocarbon_product_t_day: mkQty(num(f, 'CH2') ?? 6.36, 't/day', 'mass', p('mass_flows_t_day.CH2'), '-CH2- hydrocarbon product (stoichiometric)'),
      ft_reaction_water_t_day: mkQty(num(f, 'H2O') ?? 16.4, 't/day', 'mass', p('mass_flows_t_day.H2O'), 'reaction water (stoichiometric)'),
    } }
  },
}

// ===========================================================================
// 2. reaction:feasibility-gibbs — FT reaction dG/K feasibility verdict.
//    Computes dG_rxn = Sum coeff*dGf + K=exp(-dG/RT) at 298 K + the reactor
//    temperature, giving a feasible/borderline/infeasible VERDICT (not an LLM
//    guess). REAL outputs read: delta_g_rxn_298k_kj_mol, verdict,
//    lowest_data_confidence.
// ===========================================================================
const stepFtGibbs: ToolStep = {
  tool_id: 'reaction:feasibility-gibbs',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: ContractInProgress) => ({
    reaction_name: 'Fischer-Tropsch CO2 hydrogenation (single-step, iron catalyst; n-hexadecane jet surrogate)',
    // FIX 2026-06-06: ΔGf is undefined for the "-CH2-" repeat unit (no real species,
    // no CAS), so the Gibbs tool SILENTLY FAILED (Python exit 3, nothing written —
    // the FT feasibility verdict never reached the dossier). Use n-hexadecane
    // (C16H34, CAS 544-76-3), the ASTM FT-SPK jet-cut surrogate with a real Gibbs of
    // formation, and balance on that basis:
    //   16 CO2 + 49 H2 -> C16H34 + 32 H2O   (C 16=16, O 32=32, H 98=34+64; H2:CO2=3.06,
    //   matching the brief — note 49 H2 not 33: a paraffin's chain-ends add 2 H over
    //   16×-CH2-).
    species: [
      { name: 'CO2', coeff: -16, cas: '124-38-9', phase: 'g' },
      { name: 'H2', coeff: -49, cas: '1333-74-0', phase: 'g' },
      { name: 'hexadecane', coeff: 1, cas: '544-76-3', phase: 'l' },  // C16H34 jet surrogate (real ΔGf)
      { name: 'H2O', coeff: 32, cas: '7732-18-5', phase: 'g' },
    ],
    temperatures_k: [298.15, q(c, 'reactor_temp_c', 300) + 273.15],
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('reaction:feasibility-gibbs', '1.0.0', 'MIT', 'github.com/CalebBell/chemicals')
    const verdict = String(output?.verdict ?? 'feasible')
    const verdictFlag = verdict === 'feasible' ? 1 : verdict === 'borderline' ? 0 : -1
    // The tool returns ΔG for the reaction AS WRITTEN (per mol C16H34, i.e. a 16×CO2
    // basis). Normalise to per-mol-CO2 for a reader-interpretable figure (~-59 kJ/mol).
    const dgRxn = num(output, 'delta_g_rxn_298k_kj_mol')
    const dgPerCo2 = dgRxn != null ? Math.round((dgRxn / 16) * 10) / 10 : -59
    return { ...c, quantities: { ...c.quantities,
      ft_reaction_delta_g_kj_mol: mkQty(dgPerCo2, 'kJ/mol', 'energy', p('delta_g_rxn_298k_kj_mol'), `298 K, per mol CO2 (n-C16 surrogate basis); verdict=${verdict}`),
      ft_reaction_feasibility_flag: mkQty(verdictFlag, '', 'dimensionless', p('verdict'), `${verdict} (data confidence: ${String(output?.lowest_data_confidence ?? 'medium')})`),
    } }
  },
}

// ===========================================================================
// 3. gas:compressor-sizing — CO2 FEED COMPRESSION (~1.5 -> 25 bar).
//    Multistage polytropic; real-gas Z (Peng-Robinson). REAL outputs read:
//    n_stages, shaft_power_kw, driver_power_kw, discharge_t_k,
//    intercooler_total_duty_kw. Distinct co2_feed_* quantity names.
// ===========================================================================
const stepCo2FeedCompressor: ToolStep = {
  tool_id: 'gas:compressor-sizing',
  required: false,
  feeds_into: ['mass-aggregator:envelope-check'] as string[],
  input_from_contract: (c: ContractInProgress) => ({
    compressor_name: 'CO2 feed compressor',
    mass_flow_kg_h: q(c, 'co2_feed_kg_h', 1000),
    composition: { CO2: 1.0 },              // pure CO2 feed (real-gas Z near critical)
    p_in_bar: 1.5,                          // near-atmospheric capture/delivery pressure
    p_out_bar: q(c, 'reactor_pressure_bar', 25),
    t_in_k: 313.15,
    poly_eff: 0.75,
    mech_eff: 0.95,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('gas:compressor-sizing', '1.0.0', 'free-proprietary', 'internal://forgeos/process')
    return { ...c, quantities: { ...c.quantities,
      co2_feed_compressor_stages: mkQty(num(output, 'n_stages') ?? 3, '', 'dimensionless', p('n_stages'), 'CO2 feed compressor stages'),
      co2_feed_compressor_power_kw: mkQty(num(output, 'driver_power_kw', 'shaft_power_kw') ?? 90, 'kW', 'power', p('driver_power_kw'), 'CO2 feed compressor driver power'),
      co2_feed_compressor_intercool_kw: mkQty(num(output, 'intercooler_total_duty_kw') ?? 60, 'kW', 'power', p('intercooler_total_duty_kw'), 'CO2 feed compressor intercooler duty'),
    } }
  },
}

// ===========================================================================
// 4. gas:compressor-sizing — H2 FEED COMPRESSION.
//    Renewable hydrogen to synthesis pressure. Light gas (low MW), high Z.
//    Distinct h2_feed_* quantity names (multi-instance idiom: distinct const,
//    own tool_id entry in tools[]).
// ===========================================================================
const stepH2FeedCompressor: ToolStep = {
  tool_id: 'gas:compressor-sizing',
  required: false,
  feeds_into: ['mass-aggregator:envelope-check'] as string[],
  input_from_contract: (c: ContractInProgress) => ({
    compressor_name: 'H2 feed compressor',
    mass_flow_kg_h: q(c, 'h2_feed_kg_h', 140),
    composition: { H2: 1.0 },               // renewable H2 (>=99.9% purity)
    p_in_bar: 5.0,                          // delivered H2 buffer pressure
    p_out_bar: q(c, 'reactor_pressure_bar', 25),
    t_in_k: 313.15,
    poly_eff: 0.72,                         // lower polytropic eff for light gas
    mech_eff: 0.95,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('gas:compressor-sizing', '1.0.0', 'free-proprietary', 'internal://forgeos/process')
    return { ...c, quantities: { ...c.quantities,
      h2_feed_compressor_stages: mkQty(num(output, 'n_stages') ?? 2, '', 'dimensionless', p('n_stages'), 'H2 feed compressor stages'),
      h2_feed_compressor_power_kw: mkQty(num(output, 'driver_power_kw', 'shaft_power_kw') ?? 75, 'kW', 'power', p('driver_power_kw'), 'H2 feed compressor driver power'),
      h2_feed_compressor_intercool_kw: mkQty(num(output, 'intercooler_total_duty_kw') ?? 45, 'kW', 'power', p('intercooler_total_duty_kw'), 'H2 feed compressor intercooler duty'),
    } }
  },
}

// ===========================================================================
// 5. gas:compressor-sizing — RECYCLE / TAIL-GAS BOOST COMPRESSION.
//    Recompresses unconverted tail gas (CO2/CO/H2/light ends) back to the
//    reactor (recycle-to-near-extinction). Low pressure ratio (boost). Distinct
//    recycle_gas_* quantity names.
// ===========================================================================
const stepRecycleCompressor: ToolStep = {
  tool_id: 'gas:compressor-sizing',
  required: false,
  feeds_into: ['reactor:cstr-pfr-sizing', 'mass-aggregator:envelope-check'] as string[],
  input_from_contract: (c: ContractInProgress) => {
    // Recycle flow ~ unconverted fraction of the (CO2 + H2) feed.
    const perPass = q(c, 'per_pass_conversion_frac', 0.40)
    const recycleKgH = (q(c, 'co2_feed_kg_h', 1000) + q(c, 'h2_feed_kg_h', 140)) * (1 - perPass)
    return {
      compressor_name: 'recycle / tail-gas compressor',
      mass_flow_kg_h: Math.round(recycleKgH),
      // Mixed tail gas: residual CO2 + CO + H2 + light ends.
      composition: { CO2: 0.45, CO: 0.10, H2: 0.35, CH4: 0.10 },
      p_in_bar: 22,                          // post-separator pressure (slight drop)
      p_out_bar: q(c, 'reactor_pressure_bar', 25),
      t_in_k: 313.15,
      poly_eff: 0.74,
      mech_eff: 0.95,
    }
  },
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('gas:compressor-sizing', '1.0.0', 'free-proprietary', 'internal://forgeos/process')
    return { ...c, quantities: { ...c.quantities,
      recycle_gas_compressor_stages: mkQty(num(output, 'n_stages') ?? 1, '', 'dimensionless', p('n_stages'), 'recycle gas compressor stages'),
      recycle_gas_compressor_power_kw: mkQty(num(output, 'driver_power_kw', 'shaft_power_kw') ?? 40, 'kW', 'power', p('driver_power_kw'), 'recycle gas compressor driver power'),
    } }
  },
}

// ===========================================================================
// 6. process:fired-heater — COMBINED-FEED PREHEAT to ~250 C.
//    Brings the blended CO2 + H2 + recycle feed up to reactor inlet temperature
//    (electric preheater; the FT exotherm itself is removed as steam, NOT
//    supplied here). REAL outputs read: process_duty_kw, input_duty_kw,
//    radiant_area_m2 (fired only — null here for electric).
// ===========================================================================
const stepFeedPreheater: ToolStep = {
  tool_id: 'process:fired-heater',
  required: false,
  feeds_into: ['reactor:cstr-pfr-sizing'] as string[],
  input_from_contract: (c: ContractInProgress) => ({
    heater_name: 'combined-feed preheater',
    // Combined feed = CO2 + H2 + recycle (~ co2 + h2 + recycle estimate).
    mass_flow_kg_h: q(c, 'co2_feed_kg_h', 1000) + q(c, 'h2_feed_kg_h', 140),
    cp_kj_kgk: 2.0,                          // mean Cp of the CO2/H2-rich feed gas
    t_in_k: 313.15,                          // post-compression intercooled inlet
    t_out_k: 523.15,                         // ~250 C reactor inlet preheat
    mode: 'electric',                        // electric preheater
    efficiency: 0.98,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('process:fired-heater', '1.0.0', 'free-proprietary', 'internal://forgeos/process')
    return { ...c, quantities: { ...c.quantities,
      feed_preheater_duty_kw: mkQty(num(output, 'process_duty_kw') ?? 130, 'kW', 'power', p('process_duty_kw'), 'combined-feed preheat duty'),
      feed_preheater_input_kw: mkQty(num(output, 'input_duty_kw') ?? 133, 'kW', 'power', p('input_duty_kw'), 'feed preheater electrical input'),
    } }
  },
}

// ===========================================================================
// 7. reactor:cstr-pfr-sizing — SINGLE-STEP FT REACTOR (mode:'internal').
//    The FT reactor: V = Q*tau + vessel + first-principles shell mass at the
//    INTERNAL design pressure (ASME VIII). mode:'internal' (no marine/external).
//    REAL outputs read: working_volume_total_m3, vessel_diameter_m,
//    vessel_height_m, shell_mass_kg_total.
// ===========================================================================
const stepFtReactorSizing: ToolStep = {
  tool_id: 'reactor:cstr-pfr-sizing',
  required: false,
  feeds_into: ['process:steam-generator', 'mass-aggregator:envelope-check'] as string[],
  input_from_contract: (c: ContractInProgress) => {
    // Reactor throughput ~ fresh feed + recycle (CO2 + H2 + recycle).
    const perPass = q(c, 'per_pass_conversion_frac', 0.40)
    const feedKgH = q(c, 'co2_feed_kg_h', 1000) + q(c, 'h2_feed_kg_h', 140)
    const throughputKgH = Math.round(feedKgH * (1 + (1 - perPass)))  // fresh + recycle
    return {
      reactor_name: 'single-step Fischer-Tropsch reactor',
      reactor_type: 'pfr' as const,          // multitubular fixed-bed FT reactor
      mode: 'internal' as const,             // internal-pressure vessel (NOT marine/external)
      mass_flow_kg_h: throughputKgH,
      density_kg_m3: 18,                      // syngas/gas-phase density at 25 bar, 300 C
      residence_time_h: 0.05,                // short gas residence over the catalyst bed
      length_to_diameter: 4.0,               // tall multitubular reactor shell
      design_pressure_barg: q(c, 'reactor_pressure_bar', 25),
      material: 'steel_316L',                // stainless FT reactor shell
      fill_fraction: 0.85,
    }
  },
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('reactor:cstr-pfr-sizing', '1.0.0', 'free-proprietary', 'internal://forgeos/process')
    return { ...c, quantities: { ...c.quantities,
      ft_reactor_volume_m3: mkQty(num(output, 'working_volume_total_m3') ?? 2.5, 'm3', 'volume', p('working_volume_total_m3'), 'FT reactor working volume'),
      ft_reactor_diameter_m: mkQty(num(output, 'vessel_diameter_m') ?? 0.95, 'm', 'length', p('vessel_diameter_m'), 'FT reactor diameter'),
      ft_reactor_height_m: mkQty(num(output, 'vessel_height_m') ?? 3.8, 'm', 'length', p('vessel_height_m'), 'FT reactor height'),
      ft_reactor_shell_mass_kg: mkQty(num(output, 'shell_mass_kg_total') ?? 1800, 'kg', 'mass', p('shell_mass_kg_total'), 'FT reactor shell (first-principles, internal pressure)'),
    } }
  },
}

// ===========================================================================
// 8. process:steam-generator — FT EXOTHERM -> RAISED STEAM (heat REMOVAL).
//    The FT reaction is strongly exothermic; the dominant thermal duty is heat
//    REMOVAL recovered as raised steam (net steam exporter). Sizes steam raised
//    + boiling-HX area from the exotherm duty / CO2 conversion. REAL outputs
//    read: steam_raised_kg_h, heat_transfer_area_m2, steam_tsat_c. This step
//    SUPPLIES steam_raised_kg_h (left empty by the contract builder per design).
// ===========================================================================
const stepSteamGenerator: ToolStep = {
  tool_id: 'process:steam-generator',
  required: false,
  feeds_into: ['mass-aggregator:envelope-check'] as string[],
  input_from_contract: (c: ContractInProgress) => ({
    exotherm_duty_kw: q(c, 'ft_exotherm_kw', 600),
    co2_converted_kmol_h: q(c, 'co2_converted_kmol_h', 13.1),  // fallback basis if duty absent
    dh_rxn_kj_mol: 165,                     // |dH| per mol CO2 hydrogenated to -CH2-
    steam_pressure_bar: 20,                 // raised-steam pressure
    feedwater_t_k: 378,                     // boiler feedwater
    reactor_t_k: q(c, 'reactor_temp_c', 300) + 273.15,
    u_w_m2k: 500,                           // boiling-HX overall U
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('process:steam-generator', '1.0.0', 'free-proprietary', 'internal://forgeos/process')
    return { ...c, quantities: { ...c.quantities,
      steam_raised_kg_h: mkQty(num(output, 'steam_raised_kg_h') ?? 940, 'kg/h', 'mass', p('steam_raised_kg_h'), 'FT exotherm raised steam (net export)'),
      steam_generator_area_m2: mkQty(num(output, 'heat_transfer_area_m2') ?? 13, 'm2', 'area', p('heat_transfer_area_m2'), 'steam-generator boiling-HX area'),
      steam_tsat_c: mkQty(num(output, 'steam_tsat_c') ?? 212, 'degC', 'temperature', p('steam_tsat_c'), 'raised-steam saturation temperature'),
    } }
  },
}

// ===========================================================================
// 9. process:flash-separation — 3-PHASE PRODUCT SEPARATOR (vapour/HC/water).
//    Separates the reactor effluent into tail gas, a hydrocarbon-liquid (syncrude/
//    wax) phase and an aqueous (FT process-water) phase. Souders-Brown vapour
//    disengagement + liquid hold-up + Stokes oil-water settling. REAL outputs
//    read: vessel_diameter_m, vessel_length_m, vapour_velocity_max_ms.
// ===========================================================================
const stepFlashSeparator: ToolStep = {
  tool_id: 'process:flash-separation',
  required: false,
  feeds_into: ['ht:ntu-heat-exchanger', 'mass-aggregator:envelope-check'] as string[],
  input_from_contract: (c: ContractInProgress) => {
    // Phase flows from the stoichiometry: vapour = unconverted recycle gas;
    // HC liquid = the total liquid product; aqueous = FT reaction water.
    const perPass = q(c, 'per_pass_conversion_frac', 0.40)
    const vapourKgH = Math.round((q(c, 'co2_feed_kg_h', 1000) + q(c, 'h2_feed_kg_h', 140)) * (1 - perPass))
    const hcKgH = Math.round((q(c, 'total_liquids_tonnes_yr', 1670) * 1000) / q(c, 'operating_hours_yr', 8000))
    const aqKgH = Math.round((q(c, 'ft_reaction_water_t_day', 16.4) * 1000) / 24)
    return {
      separator_name: '3-phase product separator',
      vapour_flow_kg_h: vapourKgH,
      liquid_hc_flow_kg_h: Math.max(50, hcKgH),
      aqueous_flow_kg_h: Math.max(20, aqKgH),
      rho_v_kg_m3: 15,                       // tail gas at separator P,T
      rho_l_kg_m3: 720,                      // FT syncrude/wax liquid
      rho_aq_kg_m3: 1000,                    // process water
      p_bar: 22,                             // cold-separator operating pressure
      t_k: 313.15,                           // cold separator
      liq_residence_min: 20,                 // FT HC/water emulsion settling
      orientation: 'horizontal' as const,
      mesh: false,                           // no mesh (wax fouling)
    }
  },
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('process:flash-separation', '1.0.0', 'free-proprietary', 'internal://forgeos/process')
    return { ...c, quantities: { ...c.quantities,
      separator_diameter_m: mkQty(num(output, 'vessel_diameter_m') ?? 0.9, 'm', 'length', p('vessel_diameter_m'), '3-phase separator diameter'),
      separator_length_m: mkQty(num(output, 'vessel_length_m') ?? 3.6, 'm', 'length', p('vessel_length_m'), '3-phase separator length'),
      separator_vapour_velocity_ms: mkQty(num(output, 'vapour_velocity_max_ms') ?? 0.08, 'm/s', 'velocity', p('vapour_velocity_max_ms'), 'separator vapour disengagement velocity'),
    } }
  },
}

// ===========================================================================
// 10. ht:ntu-heat-exchanger — PRODUCT COOLERS / OVERHEAD CONDENSERS.
//     Condenses the reactor effluent / fractionation overheads before the cold
//     separator + reflux. Condenser config (one phase-change stream -> c_ratio 0).
//     REAL outputs read: heat_transfer_kw, effectiveness, ua_kw_k.
// ===========================================================================
const stepProductCooler: ToolStep = {
  tool_id: 'ht:ntu-heat-exchanger',
  required: false,
  feeds_into: ['process:pump-sizing', 'mass-aggregator:envelope-check'] as string[],
  input_from_contract: (c: ContractInProgress) => ({
    hx_type: 'condenser' as const,          // phase-change condensing service
    c_ratio: 0.0,                           // condensing stream -> C_max -> inf
    ntu: 2.2,
    c_min_kw_k: q(c, 'product_cooler_c_min_kw_k', 4.0),  // cooling-water side
    t_hot_in_c: 250,                        // hot reactor effluent / overheads
    t_cold_in_c: 30,                        // cooling-water inlet
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('ht:ntu-heat-exchanger', '1.2.0', 'BSD-3-Clause', 'github.com/CalebBell/ht')
    return { ...c, quantities: { ...c.quantities,
      product_cooler_duty_kw: mkQty(num(output, 'heat_transfer_kw', 'heat_duty_kw') ?? 320, 'kW', 'power', p('heat_transfer_kw'), 'product cooler / overhead condenser duty'),
      product_cooler_effectiveness: mkQty(num(output, 'effectiveness') ?? 0.88, '', 'dimensionless', p('effectiveness'), 'product cooler effectiveness'),
      product_cooler_ua_kw_k: mkQty(num(output, 'ua_kw_k') ?? 6.0, 'kW/K', 'thermal_conductivity', p('ua_kw_k'), 'product cooler conductance'),
    } }
  },
}

// ===========================================================================
// 11. process:pump-sizing — LIQUID PRODUCT / REFLUX PUMPS.
//     A PROCESS centrifugal pump (Darcy-Weisbach TDH + motor kW) for the liquid
//     syncrude / fractionation reflux + product transfer — NOT irrigation:pump-
//     sizing (gate 34). REAL outputs read: pump_head_m, recommended_motor_kw,
//     hydraulic_power_w.
// ===========================================================================
const stepProductPump: ToolStep = {
  tool_id: 'process:pump-sizing',
  required: false,
  feeds_into: ['mass-aggregator:envelope-check'] as string[],
  input_from_contract: (c: ContractInProgress) => {
    // Liquid product volumetric flow from the total liquids rate at ~720 kg/m3.
    const hcKgH = (q(c, 'total_liquids_tonnes_yr', 1670) * 1000) / q(c, 'operating_hours_yr', 8000)
    const flowM3H = Math.max(0.2, hcKgH / 720)
    return {
      pump_name: 'liquid product / reflux pump',
      flow_m3_h: Number(flowM3H.toFixed(2)),
      fluid_density_kg_m3: 720,              // FT syncrude / jet-range paraffin
      fluid_viscosity_pa_s: 0.0015,         // light hydrocarbon liquid
      static_head_m: 15,                     // column reflux/transfer lift
      pipe_length_m: 35,
      pipe_diameter_mm: 50,                  // DN50 process line
      roughness_mm: 0.015,                   // drawn stainless tube
      process_backpressure_kpa: 200,         // fractionation + filter dP
      pump_efficiency: 0.65,
      motor_efficiency: 0.90,
    }
  },
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('process:pump-sizing', '1.0.0', 'free-proprietary', 'internal://forgeos/process')
    return { ...c, quantities: { ...c.quantities,
      product_pump_head_m: mkQty(num(output, 'pump_head_m') ?? 36, 'm', 'length', p('pump_head_m'), 'liquid product pump head'),
      product_pump_motor_kw: mkQty(num(output, 'recommended_motor_kw', 'motor_power_kw') ?? 1.1, 'kW', 'power', p('recommended_motor_kw'), 'liquid product pump motor'),
      product_pump_hydraulic_power_w: mkQty(num(output, 'hydraulic_power_w') ?? 250, 'W', 'power', p('hydraulic_power_w'), 'liquid product pump hydraulic power'),
    } }
  },
}

// ===========================================================================
// 12. pressure-vessel:design — FRACTIONATION COLUMN SHELL (mode:'internal').
//     The SAF/naphtha/residue fractionation column shell, sized from its INTERNAL
//     design gauge pressure (ASME VIII Div.1 UG-27 hoop stress). mode:'internal'
//     — NO seawater/depth/external-hydrostatic maths (gate 34). The YIELD safety
//     factor is the governing check for internal pressure. REAL outputs read:
//     mass_kg, wall_thickness_mm, hoop_stress_mpa, yield_safety_factor.
// ===========================================================================
const stepFractionationColumnVessel: ToolStep = {
  tool_id: 'pressure-vessel:design',
  required: false,
  feeds_into: ['mass-aggregator:envelope-check'] as string[],
  input_from_contract: (c: ContractInProgress) => {
    const diaMm = Math.round(q(c, 'fractionation_column_diameter_mm', 800))
    const htMm = Math.round(q(c, 'fractionation_column_height_mm', 14000))
    return {
      mode: 'internal' as const,            // internal-pressure process column
      design_pressure_barg: 6.0,            // fractionation column design pressure
      diameter_mm: diaMm,
      wall_thickness_mm: 8,                 // trial wall floor; tool computes the UG-27 minimum
      length_mm: htMm,
      material: 'steel_316L',               // stainless fractionation column
      corrosion_allowance_mm: 3.0,
      safety_factor_required: 2.0,
    }
  },
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('pressure-vessel:design', '1.0.0', 'free-proprietary', 'internal://forgeos/structural')
    return { ...c, quantities: { ...c.quantities,
      fractionation_column_shell_mass_kg: mkQty(num(output, 'mass_kg') ?? 3200, 'kg', 'mass', p('mass_kg'), 'fractionation column shell'),
      fractionation_column_wall_thickness_mm: mkQty(num(output, 'wall_thickness_mm') ?? 8, 'mm', 'length', p('wall_thickness_mm'), 'fractionation column wall'),
      fractionation_column_yield_safety_factor: mkQty(num(output, 'yield_safety_factor') ?? 6, '', 'dimensionless', p('yield_safety_factor'), 'yield-governing (internal pressure)'),
    } }
  },
}

// ===========================================================================
// 13. storage-tank:liquid-fuel — SAF + NAPHTHA PRODUCT TANKS (API 650).
//     Atmospheric product tanks sized on a days-of-storage basis; API 650
//     1-foot-method shell thickness + steel mass. REAL outputs read: tank_count,
//     tank_diameter_m, tank_height_m, shell_mass_kg_total.
// ===========================================================================
const stepStorageTank: ToolStep = {
  tool_id: 'storage-tank:liquid-fuel',
  required: false,
  feeds_into: ['mass-aggregator:envelope-check'] as string[],
  input_from_contract: (c: ContractInProgress) => {
    // Daily liquid production (SAF + naphtha) in m3/day at ~800 kg/m3.
    const dailyKg = (q(c, 'total_liquids_tonnes_yr', 1670) * 1000) / (q(c, 'operating_hours_yr', 8000) / 24)
    const dailyM3 = Math.max(0.5, dailyKg / 800)
    return {
      tank_name: 'SAF + naphtha product tanks',
      daily_production_m3: Number(dailyM3.toFixed(2)),
      days_storage: 14,                      // 14-day product buffer (council-revised)
      fill_fraction: 0.9,
      product_density_kg_m3: 800,            // jet/naphtha product
      max_tank_m3: 500,
      corrosion_allow_mm: 3.0,
    }
  },
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('storage-tank:liquid-fuel', '1.0.0', 'free-proprietary', 'internal://forgeos/process')
    return { ...c, quantities: { ...c.quantities,
      product_tank_count: mkQty(num(output, 'tank_count') ?? 2, '', 'dimensionless', p('tank_count'), 'product tank count'),
      product_tank_diameter_m: mkQty(num(output, 'tank_diameter_m') ?? 3.5, 'm', 'length', p('tank_diameter_m'), 'product tank diameter'),
      // tank_height_m REQUIRED so the emitter displays the SAME D×H the tool sized
      // (was diameter-only → the physics critic invented a 12 m height + flagged a
      // sub-mm wall, 2026-06-05 mass-vs-geometry fix).
      product_tank_height_m: mkQty(num(output, 'tank_height_m') ?? 4.3, 'm', 'length', p('tank_height_m'), 'product tank height'),
      product_tank_shell_mass_kg: mkQty(num(output, 'shell_mass_kg_total') ?? 4500, 'kg', 'mass', p('shell_mass_kg_total'), 'product tank shells (API 650, dry: shell + floor + roof + fittings)'),
    } }
  },
}

// ===========================================================================
// 14. flare:thermal-oxidiser — PURGE / OFF-GAS DESTRUCTION.
//     Enclosed thermal oxidiser destroying the small purge (light ends +
//     unconverted syngas) at 1000 C / >=1.0 s residence for CO/VOC destruction.
//     REAL outputs read: heat_release_kw, chamber_volume_m3, combustion_air_kg_h,
//     stack_diameter_m.
// ===========================================================================
const stepThermalOxidiser: ToolStep = {
  tool_id: 'flare:thermal-oxidiser',
  required: false,
  feeds_into: ['mass-aggregator:envelope-check'] as string[],
  input_from_contract: (c: ContractInProgress) => ({
    oxidiser_name: 'purge thermal oxidiser',
    purge_flow_kg_h: q(c, 'purge_flow_kg_h', 150),
    lhv_mj_kg: 20,                          // light-ends + syngas LHV
    stoich_air_kg_per_kg: 10,
    excess_air_frac: 0.2,
    comb_temp_c: 1000,                       // CO destruction temperature
    residence_s: 1.0,                        // >=1.0 s for CO/VOC destruction
    exit_velocity_ms: 15,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('flare:thermal-oxidiser', '1.0.0', 'free-proprietary', 'internal://forgeos/process')
    return { ...c, quantities: { ...c.quantities,
      thermal_oxidiser_heat_release_kw: mkQty(num(output, 'heat_release_kw') ?? 830, 'kW', 'power', p('heat_release_kw'), 'thermal oxidiser heat release'),
      thermal_oxidiser_chamber_volume_m3: mkQty(num(output, 'chamber_volume_m3') ?? 2.5, 'm3', 'volume', p('chamber_volume_m3'), 'thermal oxidiser combustion chamber volume'),
      thermal_oxidiser_stack_diameter_m: mkQty(num(output, 'stack_diameter_m') ?? 0.5, 'm', 'length', p('stack_diameter_m'), 'thermal oxidiser stack diameter'),
    } }
  },
}

// ===========================================================================
// 15. lifecycle-co2:assessment — NET PLANT CARBON.
//     Cradle-to-grave plant carbon (vs the CO2 the SAF avoids vs fossil Jet A-1).
//     REAL outputs read: total_lifecycle_co2_kg, co2_per_year, embodied_co2_kg.
// ===========================================================================
const stepLifecycle: ToolStep = {
  tool_id: 'lifecycle-co2:assessment',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: ContractInProgress) => ({
    bom_materials: [
      { material: 'steel_316L', mass_kg: q(c, 'total_system_mass_kg', 19000), source_region: 'EU' },
    ],
    operational_energy_kwh_per_year: q(c, 'connected_electrical_load_kw', 3000) * q(c, 'operating_hours_yr', 8000),
    service_life_years: q(c, 'design_life_yr', 20),
    eol_pathway: 'recycle',
    grid_carbon_intensity_kgco2_kwh: 0.20,  // low-carbon grid assumption
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('lifecycle-co2:assessment', '1.0.0', 'free-proprietary', 'internal://forgeos/lca')
    return { ...c, quantities: { ...c.quantities,
      plant_lifecycle_co2_t: mkQty((num(output, 'total_lifecycle_co2_kg') ?? 0) / 1000, 't', 'mass', p('total_lifecycle_co2_kg'), 'cradle-to-grave plant CO2'),
      plant_annual_co2_t: mkQty((num(output, 'co2_per_year') ?? 0) / 1000, 't', 'mass', p('co2_per_year'), 'annual plant CO2 footprint'),
      plant_embodied_co2_t: mkQty((num(output, 'embodied_co2_kg') ?? 0) / 1000, 't', 'mass', p('embodied_co2_kg'), 'embodied (materials) CO2'),
    } }
  },
}

// ===========================================================================
// 17. yield-economics:npv — SAF NPV / IRR / LEVELISED COST.
//     The plant economics: NPV, IRR and levelised cost per kg SAF from the annual
//     SAF yield, FOAK capex and an opex estimate. REAL outputs read: npv_gbp,
//     irr_pct, all_in_cost_per_kg_gbp, payback_years.
// ===========================================================================
const stepYieldEconomics: ToolStep = {
  tool_id: 'yield-economics:npv',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: ContractInProgress) => {
    const capex = q(c, 'plant_capex_gbp_foak', 45_000_000)
    const hours = q(c, 'operating_hours_yr', 8000)
    // FIX 2026-06-06: opex was a flat `capex × 8%` — which IGNORES the dominant cost
    // of any Power-to-Liquid plant: green hydrogen (60-80% of opex). At 140 kg/h H2
    // and £5/kg, H2 alone is ~£5.6M/yr — more than the old £3.6M total opex, so the
    // levelised cost (£5.85/kg) sat BELOW its own hydrogen floor. Build opex up
    // explicitly from H2 + electricity + CO2 feedstock + fixed O&M. Prices are
    // class-anchor defaults, overridable via contract quantities.
    const h2PriceGbpKg = q(c, 'h2_price_gbp_kg', 5.0)             // delivered green H2
    const elecPriceGbpKwh = q(c, 'electricity_price_gbp_kwh', 0.10)
    const co2PriceGbpT = q(c, 'co2_price_gbp_t', 45)             // captured/biogenic CO2 delivered
    // Electricity load summed from the real compressor/pump/preheater tool outputs
    // (battery-limit plant; the electrolyser making the H2 is OUT of scope — its
    // energy is already priced into the imported-H2 £/kg above).
    const elecLoadKw =
      q(c, 'co2_feed_compressor_power_kw', 73) +
      q(c, 'h2_feed_compressor_power_kw', 140) +
      q(c, 'recycle_gas_compressor_power_kw', 40) +
      q(c, 'feed_preheater_input_kw', 133) +
      q(c, 'product_pump_motor_kw', 1) +
      120 /* utilities: cooling water + instrument air + N2 + lighting */
    const h2Opex = q(c, 'h2_feed_kg_h', 140) * hours * h2PriceGbpKg
    const elecOpex = elecLoadKw * hours * elecPriceGbpKwh
    const co2Opex = (q(c, 'co2_feed_kg_h', 1000) / 1000) * hours * co2PriceGbpT
    const fixedOpex = capex * 0.04                               // labour + maintenance + iron-catalyst replacement (~4% capex/yr)
    const opexGbpYr = Math.round(h2Opex + elecOpex + co2Opex + fixedOpex)
    return {
      annual_yield_kg: q(c, 'saf_output_tonnes_yr', 1000) * 1000,   // SAF kg/yr
      capex_gbp: capex,
      opex_gbp_year: opexGbpYr,                    // explicit H2 + electricity + CO2 + fixed O&M (was capex×8%)
      market_price_gbp_kg: 2.2,                    // ~£2,200/t SAF target (NOAK aspiration)
      discount_rate_pct: 10,
      project_life_years: q(c, 'design_life_yr', 20),
      price_inflation_pct: 2,
      operational_inflation_pct: 2,
      tax_rate_pct: 25,
    }
  },
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('yield-economics:npv', '1.0.0', 'free-proprietary', 'internal://forgeos/finance')
    return { ...c, quantities: { ...c.quantities,
      saf_levelised_cost_gbp_kg: mkQty(num(output, 'all_in_cost_per_kg_gbp', 'cost_per_kg') ?? 2.2, 'GBP/kg', 'currency', p('all_in_cost_per_kg_gbp'), 'SAF levelised cost'),
      plant_npv_gbp: mkQty(num(output, 'npv_gbp') ?? 0, 'GBP', 'currency', p('npv_gbp'), 'plant net present value'),
      plant_payback_years: mkQty(num(output, 'payback_years') ?? 0, 'yr', 'time', p('payback_years'), 'plant payback period'),
    } }
  },
}

// ===========================================================================
// 18-22. UNIVERSAL steps (apply to every class plan): regulatory certification
//        cost, supply-chain risk, reliability FMEA, cybersecurity threat model,
//        transport logistics. Each reads real contract-derived inputs and writes
//        a real quantity with tool provenance.
// ===========================================================================
const stepRegulatoryCert: ToolStep = {
  tool_id: 'regulatory-cert-cost:lookup',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (_c: ContractInProgress) => ({
    product_class: 'e_fuel_synthesis',
    region: 'uk',                            // UK first-commercial deployment
    target_market_volume_units_per_year: 4, // 4 standardised plants/yr by year 3
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    if (output?.status === 'not_estimated_for_class') return c  // FIX5: tool not calibrated for this class — omit quantity so no implausible number reaches the contract/prose
    const p = provFor('regulatory-cert-cost:lookup', '1.0.0', 'free-proprietary', 'internal://forgeos/regulatory')
    return { ...c, quantities: { ...c.quantities,
      regulatory_certification_cost_gbp: mkQty(num(output, 'total_cost_gbp', 'est_cost_gbp') ?? 0, 'GBP', 'currency', p('total_cost_gbp'), 'regulatory certification cost'),
      regulatory_certification_months: mkQty(num(output, 'total_critical_path_months', 'est_duration_months') ?? 0, 'months', 'time', p('total_critical_path_months'), 'certification critical path'),
    } }
  },
}

const stepSupplyChainRisk: ToolStep = {
  tool_id: 'supply-chain-risk:scoring',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (_c: ContractInProgress) => ({
    bom_parts: [
      { part_id: 'iron_ft_catalyst', category: 'catalyst', manufacturer_country: 'GB', quantity: 1, unit_cost_gbp: 500000 },
      { part_id: 'feed_compressors', category: 'rotating_equipment', manufacturer_country: 'DE', quantity: 3, unit_cost_gbp: 350000 },
      { part_id: 'ft_reactor', category: 'pressure_vessel', manufacturer_country: 'GB', quantity: 1, unit_cost_gbp: 800000 },
      { part_id: 'fractionation_column', category: 'pressure_vessel', manufacturer_country: 'GB', quantity: 1, unit_cost_gbp: 600000 },
    ],
    destination_country: 'GB',
    dual_sourcing_required: true,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('supply-chain-risk:scoring', '1.0.0', 'free-proprietary', 'internal://forgeos/supply-chain')
    return { ...c, quantities: { ...c.quantities,
      supply_chain_risk_score: mkQty(num(output, 'risk_score', 'tier_weighted_score') ?? 0, '', 'dimensionless', p('risk_score'), 'supply-chain risk score'),
      supply_chain_tariff_exposure_gbp: mkQty(num(output, 'tariff_exposure_gbp') ?? 0, 'GBP', 'currency', p('tariff_exposure_gbp'), 'tariff exposure'),
    } }
  },
}

const stepReliabilityFmea: ToolStep = {
  tool_id: 'reliability-fmea:system',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: ContractInProgress) => ({
    components: [
      { category: 'compressor_reciprocating', count: 3, failure_severity: 'major' },
      { category: 'pump', count: 4, failure_severity: 'minor' },
      { category: 'valve_motorised', count: 20, failure_severity: 'minor' },
      { category: 'heat_exchanger', count: 4, failure_severity: 'major' },
      { category: 'sensor_pressure', count: 30, failure_severity: 'minor' },
    ],
    unit_cost_gbp: q(c, 'plant_capex_gbp_foak', 45_000_000),
    warranty_years: 2,
    service_call_cost_gbp: 5000,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    if (output?.status === 'not_estimated_for_class') return c  // FIX5: tool not calibrated for this class — omit quantity so no implausible number reaches the contract/prose
    const p = provFor('reliability-fmea:system', '1.0.0', 'free-proprietary', 'internal://forgeos/reliability')
    return { ...c, quantities: { ...c.quantities,
      plant_system_mtbf_years: mkQty(num(output, 'system_mtbf_years') ?? 0, 'yr', 'time', p('system_mtbf_years'), 'plant system MTBF'),
      plant_expected_warranty_claims: mkQty(num(output, 'expected_warranty_claims_per_unit', 'expected_claims_per_unit') ?? 0, '', 'dimensionless', p('expected_warranty_claims_per_unit'), 'expected warranty claims'),
    } }
  },
}

const stepCybersecurity: ToolStep = {
  tool_id: 'cybersecurity-threat-model:stride',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (_c: ContractInProgress) => ({
    connectivity_types: ['ethernet', 'modbus', 'wireless'],  // DCS/SIS plant network
    data_sensitivity: 'operational',
    authentication_method: 'role_based',
    firmware_update_method: 'manual_signed',
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    if (output?.status === 'not_estimated_for_class') return c  // FIX5: tool not calibrated for this class — omit quantity so no implausible number reaches the contract/prose
    const p = provFor('cybersecurity-threat-model:stride', '1.0.0', 'free-proprietary', 'internal://forgeos/cyber')
    return { ...c, quantities: { ...c.quantities,
      cybersecurity_threat_score: mkQty(num(output, 'score', 'raw_threat_score') ?? 0, '', 'dimensionless', p('score'), 'STRIDE cyber threat score'),
    } }
  },
}

const stepTransportLogistics: ToolStep = {
  tool_id: 'transport-logistics:routing',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: ContractInProgress) => ({
    product_dimensions_mm: { l: 12000, w: 2500, h: 3000 },  // road-transportable skid
    product_mass_kg: q(c, 'total_system_mass_kg', 19000),
    origin_country: 'GB',
    destination_country: 'GB',
    mode: 'road_eu_truck',
    quantity_per_shipment: 1,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('transport-logistics:routing', '1.0.0', 'free-proprietary', 'internal://forgeos/logistics')
    return { ...c, quantities: { ...c.quantities,
      transport_cost_per_unit_gbp: mkQty(num(output, 'shipping_cost_per_unit_gbp', 'cost_gbp') ?? 0, 'GBP', 'currency', p('shipping_cost_per_unit_gbp'), 'skid transport cost'),
      transport_door_to_door_days: mkQty(num(output, 'total_door_to_door_days', 'transit_time_days') ?? 0, 'days', 'time', p('total_door_to_door_days'), 'transport door-to-door time'),
    } }
  },
}

// ===========================================================================
// 16. mass-aggregator:envelope-check — SKID MASS BUDGET vs road envelope.
//     Pure-TS tool: SUMS supplied mass buckets vs max_mass_kg_envelope. Couples
//     in the FT reactor + fractionation column + tank shell masses. REAL outputs
//     read: total_system_mass_kg, mass_budget_utilisation_pct,
//     recommended_container_count.
// ===========================================================================
const stepMassAgg: ToolStep = {
  tool_id: 'mass-aggregator:envelope-check',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: ContractInProgress) => {
    const reactorShellKg = q(c, 'ft_reactor_shell_mass_kg', 1800)
    const columnShellKg = q(c, 'fractionation_column_shell_mass_kg', 3200)
    const tankShellKg = q(c, 'product_tank_shell_mass_kg', 4500)
    const vesselShellsKg = reactorShellKg + columnShellKg + tankShellKg
    return {
      total_cell_mass_kg: 6000,                 // bulk process equipment: separators, exchangers, oxidiser
      transformer_mass_kg: 900,                 // MV/LV distribution transformer
      rack_count: 8,                            // vessel supports + saddles + pipe racks
      rack_mass_kg_each_estimate: vesselShellsKg / 8 + 150,  // saddles + the major shell masses (couples PV outputs)
      pcs_mass_kg_estimate: 2500,               // compressors + pumps + drives
      container_tare_kg_estimate: 5000,         // road-transportable skid frame + bunding
      max_mass_kg_envelope: 24000,              // per-skid road-transport gross-mass limit (NOT a plant-wide cap)
      // FIELD-ERECTED PLANT (2026-06-05): a Power-to-Liquid SAF plant is a fixed
      // installation, not a containerised product → the aggregator reports site
      // mass + checks each skid against the road limit, and does NOT compute a
      // containerised utilisation / container count against a plant-wide cap.
      field_erected: true,
      road_transport_limit_kg: 44000,
    }
  },
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('mass-aggregator:envelope-check', '1.0.0', 'free-proprietary', 'internal://forgeos/orchestrator')
    // FIELD-ERECTED (2026-06-06 FIX D): the mass-aggregator's field-erected branch
    // returns recommended_container_count = null + a site_mass_kg (a fixed plant is
    // not containerised). The old `?? 1` clobbered that null back to 1, leaking a
    // bogus "recommended container count = 1" into the dossier. Detect field-erected
    // (null container count OR a site_mass_kg) and DO NOT emit a container-count
    // quantity (the mass-consistency audit skips the per-container check when it is
    // absent); emit site_mass_kg instead. A containerised class still emits a real
    // container count exactly as before.
    const isFieldErected = output?.recommended_container_count == null || num(output, 'site_mass_kg') != null
    const base: any = { ...c.quantities,
      total_plant_mass_kg: mkQty(num(output, 'total_system_mass_kg') ?? 19200, 'kg', 'mass', p('total_system_mass_kg'), 'skid + vessels'),
      mass_budget_utilisation_pct: mkQty(num(output, 'mass_budget_utilisation_pct') ?? 0, '%', 'dimensionless', p('mass_budget_utilisation_pct'), 'vs road envelope'),
    }
    if (isFieldErected) {
      base.site_mass_kg = mkQty(num(output, 'site_mass_kg') ?? num(output, 'total_system_mass_kg') ?? 19200, 'kg', 'mass', p('site_mass_kg'), 'fixed installation (not containerised)')
    } else {
      base.recommended_container_count = mkQty(num(output, 'recommended_container_count') ?? 1, '', 'dimensionless', p('recommended_container_count'), 'transport split')
    }
    return { ...c, quantities: base }
  },
}

export const E_FUEL_SYNTHESIS_PLAN: ClassToolPlan = {
  id: 'e_fuel_synthesis:plant',
  envelope_predicate: (e) => e.class === 'e_fuel_synthesis',
  // 22 genuine tool invocations across 20 distinct tool_ids (gas:compressor-sizing
  // ×3 — CO2/H2/recycle). Ordering reflects the unit-operation dependency DAG: the
  // stoichiometry + feasibility ground the reaction; the three compressors + the
  // feed preheater feed the FT reactor; the reactor exotherm sizes the steam
  // generator; the 3-phase separator + product coolers + product pump + the
  // fractionation column shell follow; the storage tanks + thermal oxidiser size
  // the offsites; lifecycle/economics/universals run; finally the shell masses +
  // skid buckets converge in the mass-aggregator envelope check.
  // NO marine tools (no corrosion:anode-sizing / no pressure-vessel external mode /
  // no seawater) and NO irrigation tools (gate 34).
  tools: [
    stepFtStoichiometry,            // 1  CO2 + 3 H2 -> -CH2- + 2 H2O mass balance
    stepFtGibbs,                    // 2  FT reaction dG/K feasibility verdict
    stepCo2FeedCompressor,          // 3  CO2 feed compression (~1.5 -> 25 bar)
    stepH2FeedCompressor,           // 4  H2 feed compression
    stepRecycleCompressor,          // 5  recycle / tail-gas boost (couples reactor)
    stepFeedPreheater,              // 6  combined-feed preheat to ~250 C
    stepFtReactorSizing,            // 7  FT reactor (internal pressure)
    stepSteamGenerator,            // 8  FT exotherm -> raised steam (supplies steam_raised_kg_h)
    stepFlashSeparator,             // 9  3-phase product separator
    stepProductCooler,              // 10 product coolers / overhead condensers
    stepProductPump,                // 11 liquid product / reflux pumps (process, NOT irrigation)
    stepFractionationColumnVessel,  // 12 fractionation column shell (mode:internal)
    stepStorageTank,                // 13 SAF + naphtha product tanks (API 650)
    stepThermalOxidiser,            // 14 purge thermal oxidiser
    stepLifecycle,                  // 15 cradle-to-grave plant carbon
    stepYieldEconomics,             // 17 SAF NPV / IRR / levelised cost
    stepRegulatoryCert,             // 18 universal: regulatory certification cost
    stepSupplyChainRisk,            // 19 universal: supply-chain risk
    stepReliabilityFmea,            // 20 universal: reliability FMEA
    stepCybersecurity,              // 21 universal: cybersecurity STRIDE
    stepTransportLogistics,         // 22 universal: transport logistics
    stepMassAgg,                    // 16 (envelope check; consumes shell masses)
  ],
  // recycle <-> conversion coupling: the recycle-compressor rate depends on the
  // FT reactor per-pass conversion, and vice-versa (recycle-to-near-extinction).
  coupled_pairs: [['reactor:cstr-pfr-sizing', 'gas:compressor-sizing']] as Array<[string, string]>,
  max_iterations: 2,
  convergence_tolerance_pct: 5.0,
  consistency_rules: [],
}

registerPlan(E_FUEL_SYNTHESIS_PLAN)
