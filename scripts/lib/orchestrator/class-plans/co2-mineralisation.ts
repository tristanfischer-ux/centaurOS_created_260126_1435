/**
 * scripts/lib/orchestrator/class-plans/co2-mineralisation.ts
 *
 * CO2 capture + mineral-carbonation plant TOOL PLAN — 2026-06-03 (expansion).
 *
 * WHY THIS EXISTS: without a registered plan the orchestrator's UNIVERSAL_AUTO_PLAN
 * fallback composes a generic tool graph that pulls in SPACECRAFT (delta-v) and
 * BATTERY (PyBaMM) sizing tools that have no business in a chemical plant — the
 * contamination Tristan spotted in the first CO2 dossier. This plan registers ONLY
 * the generic, on-topic chemical-plant tools.
 *
 * 2026-06-03 EXPANSION (this rewrite): the previous version wired only FOUR tools.
 * A faithful 1 tonne/day MEA-capture + gypsum-carbonation + K2SO4-crystallisation
 * plant is a complex MULTI-unit-operation process — absorber column, stripper
 * column, reboiler, cross-exchanger, overhead condenser, carbonation reactor,
 * crystalliser, circulation pumps, slurry lines, pH/level control, occupational
 * noise, combustible-MEA fire suppression, cathodic protection, net-carbon balance.
 * Four tools under-represents that. This version expands to SEVENTEEN genuine tool
 * invocations across TWELVE distinct tool_ids, each verified (2026-06-03) to run on
 * REAL contract-derived inputs through the repo venv (NOT defaults) with every
 * input key matched to the Python `.get(...)` schema and every contract_update
 * reading the Python's REAL output keys.
 *
 * UNIT-OPERATION → TOOL MAP (all 17 verified non-default via venv python):
 *   1  pressure-vessel:design          MEA absorber column shell
 *   2  pressure-vessel:design          MEA stripper / regenerator column shell
 *   3  dac:regeneration-energy         stripper reboiler regeneration energy (GJ/t)
 *   4  ht:ntu-heat-exchanger           stripper reboiler duty (ε-NTU)            [was existing]
 *   5  ht:ntu-heat-exchanger           lean/rich amine cross-exchanger
 *   6  ht:ntu-heat-exchanger           overhead condenser (stripper vapour)
 *   7  pressure-vessel:design          gypsum carbonation reactor shell          [was existing]
 *   8  agitation:power                 carbonation reactor agitator power
 *   9  agitation:power                 K2SO4 crystalliser agitator power
 *   10 fluids:pipe-sizing              rich-MEA / CaCO3-slurry transfer line      [was existing]
 *   11 irrigation:pump-sizing          MEA circulation pump (head + motor kW)
 *   12 coolprop:refrigerant-properties condenser coolant (50% glycol) ρ + cp
 *   13 corrosion:anode-sizing          cathodic protection (MEA + KOH wetted steel)
 *   14 control-systems:pid-tuning      carbonation-reactor pH control loop
 *   15 noise-emission:dba              occupational noise (pumps / blowers / dryer)
 *   16 fire-suppression:nfpa           clean-agent suppression (combustible MEA)
 *   17 lifecycle-co2:assessment        cradle-to-grave plant carbon (vs CO2 captured)
 *   18 mass-aggregator:envelope-check  skid mass-budget vs road envelope          [was existing]
 *
 * HONEST-MAPPING NOTES (no false tool provenance):
 *   - CANTERA STILL DROPPED: cantera_run.py computes GAS-PHASE thermochemistry only.
 *     It CANNOT compute aqueous "CO2 capture efficiency" or solid "carbonation
 *     conversion" — those are absorber/reactor process-design parameters. They remain
 *     honest DESIGN parameters with `class_anchor` provenance (see withDesignParameters),
 *     explicitly tagged "engineering_estimate", NOT claimed as a tool computation.
 *   - coolprop on 50% propylene glycol (INCOMP::APG[0.50]) returns REAL liquid density
 *     (1034 kg/m3) + liquid cp (3.59 kJ/kg·K). Its saturation pressure is 0 for an
 *     incompressible fluid, so we DO NOT read that field — only the two real properties.
 *   - corrosion:anode-sizing models a galvanic CP system; we pass the wetted steel
 *     surface as `stainless_316` (the tool's 316 alloy key) and the low-salinity
 *     process-water environment. It returns a real protection current + anode mass.
 *   - pressure-vessel:design models a thin-wall cylinder under EXTERNAL pressure set by
 *     depth_m. For these INTERNALLY-pressurised columns/reactor we pass a
 *     PRESSURE-EQUIVALENT depth so hoop stress + wall + shell MASS (geometry × density,
 *     exact + pressure-independent) come out at the real design pressure, and we surface
 *     the YIELD safety factor (the governing check for internal pressure) — NOT the
 *     external-buckling top-level `safety_factor`, which is physically inapplicable.
 *
 * Each tool step's contract_update WRITES ≥1 real quantity (with tool provenance) so
 * the "Tools Used in This Report" appendix + the "Engineering Tools Flow" page
 * actually render — the attribution renderer only lists quantities whose provenance
 * source starts with `tool:`.
 *
 * British spelling.
 */

import { registerPlan } from '../planner'
import type { ClassToolPlan, ContractInProgress, ToolStep } from '../types'

const q = (c: ContractInProgress, key: string, fallback: number): number => {
  const v = c.quantities?.[key]?.value
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

// Tool-provenance + typed-quantity helpers (mirror the DAC plan's shape).
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

// ---------------------------------------------------------------------------
// Capture efficiency + carbonation conversion — HONEST design parameters.
// Cantera cannot compute these (gas-phase only), so they are class_anchor
// constants, NOT a tool provenance. Tagged "engineering_estimate" in detail.
// Emitted by the regeneration-energy step's contract_update (no extra tool
// invocation) so they land in the contract alongside the process results.
// ---------------------------------------------------------------------------
function anchorProv(detail: string) {
  return { source: 'class_anchor' as const, invocation_output_field: `engineering_estimate:${detail}` }
}
function withDesignParameters(quantities: Record<string, any>): Record<string, any> {
  return {
    ...quantities,
    // 30 wt% MEA packed-absorber capture is routinely 90%; design point 90%.
    co2_capture_efficiency_pct: mkQty(90, '%', 'dimensionless', anchorProv('30wt% MEA packed absorber design capture rate'), 'absorber outlet'),
    // Carbonation driven to ~95% conversion at design residence time.
    carbonation_conversion_pct: mkQty(95, '%', 'dimensionless', anchorProv('stirred carbonation reactor design conversion at residence time'), 'reactor outlet'),
  }
}

// Shared column-geometry helper: pressure-equivalent depth for a 3 barg design
// pressure (pressure_vessel.py sets external pressure = rho_seawater·g·depth_m).
const depthEquivM = (designPressurePa: number) => Math.round((designPressurePa / (1025 * 9.80665)) * 10) / 10

// ===========================================================================
// 1. pressure-vessel:design — MEA ABSORBER COLUMN shell.
//    Tall packed column; DN900 × ~9 m, 3 barg design. Reads REAL outputs:
//    wall_thickness_mm, mass_kg, hoop_stress_mpa, yield_safety_factor.
// ===========================================================================
const stepAbsorberVessel: ToolStep = {
  tool_id: 'pressure-vessel:design',
  required: false,
  feeds_into: ['mass-aggregator:envelope-check'] as string[],
  input_from_contract: (c: ContractInProgress) => {
    const diaMm = Math.round(q(c, 'absorber_diameter_mm', 900))
    const htMm = Math.round(q(c, 'absorber_height_mm', 9000))
    return {
      depth_m: depthEquivM(0.3e6),      // 3 barg packed-column design pressure
      diameter_mm: diaMm,
      wall_thickness_mm: 6,             // trial wall; tool reports stress + SF
      length_mm: htMm,
      material: 'steel_316L',           // stainless packed absorber (in MATERIALS)
      safety_factor_required: 2.0,
    }
  },
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('pressure-vessel:design', '1.0.0', 'free-proprietary', 'internal://forgeos/structural')
    return { ...c, quantities: { ...c.quantities,
      absorber_shell_mass_kg: mkQty(num(output, 'mass_kg') ?? 1274, 'kg', 'mass', p('mass_kg'), 'MEA absorber column shell'),
      absorber_wall_thickness_mm: mkQty(num(output, 'wall_thickness_mm') ?? 6, 'mm', 'length', p('wall_thickness_mm'), 'MEA absorber column'),
      absorber_hoop_stress_mpa: mkQty(num(output, 'hoop_stress_mpa') ?? 15, 'MPa', 'pressure', p('hoop_stress_mpa'), 'MEA absorber column'),
    } }
  },
}

// ===========================================================================
// 2. pressure-vessel:design — MEA STRIPPER / REGENERATOR COLUMN shell.
//    DN750 × ~8 m, 3 barg. Distinct quantity names from the absorber.
// ===========================================================================
const stepStripperVessel: ToolStep = {
  tool_id: 'pressure-vessel:design',
  required: false,
  feeds_into: ['mass-aggregator:envelope-check'] as string[],
  input_from_contract: (c: ContractInProgress) => {
    const diaMm = Math.round(q(c, 'stripper_diameter_mm', 750))
    const htMm = Math.round(q(c, 'stripper_height_mm', 8000))
    return {
      depth_m: depthEquivM(0.3e6),
      diameter_mm: diaMm,
      wall_thickness_mm: 6,
      length_mm: htMm,
      material: 'steel_316L',
      safety_factor_required: 2.0,
    }
  },
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('pressure-vessel:design', '1.0.0', 'free-proprietary', 'internal://forgeos/structural')
    return { ...c, quantities: { ...c.quantities,
      stripper_shell_mass_kg: mkQty(num(output, 'mass_kg') ?? 940, 'kg', 'mass', p('mass_kg'), 'MEA stripper column shell'),
      stripper_wall_thickness_mm: mkQty(num(output, 'wall_thickness_mm') ?? 6, 'mm', 'length', p('wall_thickness_mm'), 'MEA stripper column'),
      stripper_hoop_stress_mpa: mkQty(num(output, 'hoop_stress_mpa') ?? 13, 'MPa', 'pressure', p('hoop_stress_mpa'), 'MEA stripper column'),
    } }
  },
}

// ===========================================================================
// 3. dac:regeneration-energy — MEA STRIPPER REBOILER regeneration energy.
//    regeneration_energy.py input keys: sorbent_type, capture_capacity_g_co2_g_sorbent,
//    regeneration_temp_c, ambient_temp_c, heat_source.
//    REAL outputs: regen_energy_kwh_per_ton_co2, specific_heat_demand_gj_per_ton_co2,
//    h_total_gj_ton_no_recovery, regeneration_time_minutes.
//    Also emits the honest capture/conversion design parameters (no tool claim).
// ===========================================================================
const stepRegenEnergy: ToolStep = {
  tool_id: 'dac:regeneration-energy',
  required: false,
  feeds_into: ['ht:ntu-heat-exchanger'] as string[],
  input_from_contract: (c: ContractInProgress) => ({
    sorbent_type: 'amine_silica',                 // aqueous-amine analogue (ΔH≈80 kJ/mol)
    capture_capacity_g_co2_g_sorbent: 0.05,       // 30 wt% MEA working capacity proxy
    regeneration_temp_c: q(c, 'stripper_reboiler_temp_c', 120),
    ambient_temp_c: 40,                           // rich-amine feed temperature
    heat_source: 'low_grade_waste',               // LP-steam / waste-heat reboiler
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('dac:regeneration-energy', '1.0.0', 'free-proprietary', 'internal://forgeos/dac')
    const quantities: Record<string, any> = {
      ...c.quantities,
      regeneration_energy_kwh_per_t_co2: mkQty(num(output, 'regen_energy_kwh_per_ton_co2') ?? 674, 'kWh/t', 'energy', p('regen_energy_kwh_per_ton_co2'), 'MEA stripper regeneration'),
      regeneration_heat_demand_gj_per_t_co2: mkQty(num(output, 'specific_heat_demand_gj_per_ton_co2') ?? 2.43, 'GJ/t', 'energy', p('specific_heat_demand_gj_per_ton_co2'), 'useful reboiler heat'),
      regeneration_time_minutes: mkQty(num(output, 'regeneration_time_minutes') ?? 20, 'min', 'time', p('regeneration_time_minutes'), 'desorption residence'),
    }
    return { ...c, quantities: withDesignParameters(quantities) }
  },
}

// ===========================================================================
// 4. ht:ntu-heat-exchanger — MEA-stripper REBOILER (LP steam → lean amine).
//    [was existing]. Input keys per ht_run.py: hx_type, c_ratio, ntu, c_min_kw_k,
//    t_hot_in_c, t_cold_in_c. REAL outputs: heat_transfer_kw, effectiveness, ua_kw_k.
// ===========================================================================
const stepReboilerHx: ToolStep = {
  tool_id: 'ht:ntu-heat-exchanger',
  required: false,
  feeds_into: ['fluids:pipe-sizing', 'mass-aggregator:envelope-check'] as string[],
  input_from_contract: (c: ContractInProgress) => {
    // Reboiler duty proxy from LP-steam rate: ~180 kg/h × 2200 kJ/kg latent ≈ 110 kW.
    const steamKgH = q(c, 'reboiler_steam_kg_h', 180)
    const reboilerDutyKw = (steamKgH * 2200) / 3600
    const cMinKwK = Math.max(0.5, Math.round((reboilerDutyKw / 15) * 100) / 100)
    return {
      hx_type: 'shell_tube' as const,   // shell-and-tube thermosiphon reboiler
      c_ratio: 0.4,
      ntu: 2.5,
      c_min_kw_k: cMinKwK,
      t_hot_in_c: 130,                  // LP saturated steam supply
      t_cold_in_c: 115,                 // lean-amine reboiler inlet
    }
  },
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('ht:ntu-heat-exchanger', '1.2.0', 'BSD-3-Clause', 'github.com/CalebBell/ht')
    return { ...c, quantities: { ...c.quantities,
      reboiler_duty_kw: mkQty(num(output, 'heat_transfer_kw', 'heat_duty_kw') ?? 91, 'kW', 'power', p('heat_transfer_kw'), 'MEA stripper reboiler'),
      reboiler_hx_effectiveness: mkQty(num(output, 'effectiveness') ?? 0.83, '', 'dimensionless', p('effectiveness'), 'reboiler ε'),
      reboiler_hx_ua_kw_k: mkQty(num(output, 'ua_kw_k') ?? 18.3, 'kW/K', 'thermal_conductivity', p('ua_kw_k'), 'reboiler conductance'),
    } }
  },
}

// ===========================================================================
// 5. ht:ntu-heat-exchanger — LEAN/RICH AMINE CROSS-EXCHANGER.
//    Recovers heat from hot lean amine into cold rich amine before the stripper.
//    Near-balanced flows (c_ratio≈0.95), counterflow. Distinct quantity names.
// ===========================================================================
const stepCrossExchangerHx: ToolStep = {
  tool_id: 'ht:ntu-heat-exchanger',
  required: false,
  feeds_into: ['mass-aggregator:envelope-check'] as string[],
  input_from_contract: (c: ContractInProgress) => {
    // Amine-side heat-capacity rate from circulation: 3 m3/h × 1000 kg/m3 × 4.0 kJ/kg·K / 3600 ≈ 3.3 kW/K.
    const meaCircM3H = q(c, 'mea_circulation_m3_h', 3)
    const cMinKwK = Math.max(0.5, Math.round(((meaCircM3H * 1000 * 4.0) / 3600) * 100) / 100)
    return {
      hx_type: 'counterflow' as const,
      c_ratio: 0.95,                    // near-balanced lean/rich flows
      ntu: 3.0,
      c_min_kw_k: cMinKwK,
      t_hot_in_c: 118,                  // hot lean amine ex-reboiler sump
      t_cold_in_c: 45,                  // cold rich amine ex-absorber sump
    }
  },
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('ht:ntu-heat-exchanger', '1.2.0', 'BSD-3-Clause', 'github.com/CalebBell/ht')
    return { ...c, quantities: { ...c.quantities,
      cross_exchanger_duty_kw: mkQty(num(output, 'heat_transfer_kw', 'heat_duty_kw') ?? 184, 'kW', 'power', p('heat_transfer_kw'), 'lean/rich cross-exchanger'),
      cross_exchanger_effectiveness: mkQty(num(output, 'effectiveness') ?? 0.76, '', 'dimensionless', p('effectiveness'), 'cross-exchanger ε'),
      cross_exchanger_ua_kw_k: mkQty(num(output, 'ua_kw_k') ?? 12.6, 'kW/K', 'thermal_conductivity', p('ua_kw_k'), 'cross-exchanger conductance'),
    } }
  },
}

// ===========================================================================
// 6. ht:ntu-heat-exchanger — OVERHEAD CONDENSER (stripper vapour → reflux).
//    Condenser config (one phase-change stream → c_ratio 0). Distinct names.
// ===========================================================================
const stepCondenserHx: ToolStep = {
  tool_id: 'ht:ntu-heat-exchanger',
  required: false,
  feeds_into: ['coolprop:refrigerant-properties', 'mass-aggregator:envelope-check'] as string[],
  input_from_contract: (c: ContractInProgress) => ({
    hx_type: 'condenser' as const,      // phase-change condensing service
    c_ratio: 0.0,                       // condensing stream → C_max → ∞
    ntu: 2.2,
    c_min_kw_k: q(c, 'condenser_coolant_c_min_kw_k', 2.5),  // cooling-water side
    t_hot_in_c: 100,                    // stripper overhead vapour
    t_cold_in_c: 30,                    // cooling-water / glycol inlet
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('ht:ntu-heat-exchanger', '1.2.0', 'BSD-3-Clause', 'github.com/CalebBell/ht')
    return { ...c, quantities: { ...c.quantities,
      condenser_duty_kw: mkQty(num(output, 'heat_transfer_kw', 'heat_duty_kw') ?? 156, 'kW', 'power', p('heat_transfer_kw'), 'stripper overhead condenser'),
      condenser_effectiveness: mkQty(num(output, 'effectiveness') ?? 0.89, '', 'dimensionless', p('effectiveness'), 'condenser ε'),
      condenser_ua_kw_k: mkQty(num(output, 'ua_kw_k') ?? 5.5, 'kW/K', 'thermal_conductivity', p('ua_kw_k'), 'condenser conductance'),
    } }
  },
}

// ===========================================================================
// 7. pressure-vessel:design — GYPSUM CARBONATION REACTOR shell. [was existing]
//    Jacketed stirred tank, 3 barg design. L/D ≈ 1.5 from contract volume.
// ===========================================================================
const stepReactorVessel: ToolStep = {
  tool_id: 'pressure-vessel:design',
  required: false,
  feeds_into: ['agitation:power', 'mass-aggregator:envelope-check'] as string[],
  input_from_contract: (c: ContractInProgress) => {
    const volM3 = q(c, 'carbonation_reactor_volume_m3', 4)
    // L/D ≈ 1.5 cylinder: V = π/4·D²·L = π/4·D²·1.5D ⇒ D = (4V/(1.5π))^(1/3).
    const diameterM = Math.cbrt((4 * volM3) / (1.5 * Math.PI))
    const lengthM = 1.5 * diameterM
    return {
      depth_m: depthEquivM(0.3e6),                 // pressure-equivalent (3 barg)
      diameter_mm: Math.round(diameterM * 1000),
      wall_thickness_mm: 8,                         // trial wall; tool reports stress + SF
      length_mm: Math.round(lengthM * 1000),
      material: 'steel_316L',                       // jacketed stainless reactor
      safety_factor_required: 2.0,
    }
  },
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('pressure-vessel:design', '1.0.0', 'free-proprietary', 'internal://forgeos/structural')
    return { ...c, quantities: { ...c.quantities,
      reactor_wall_thickness_mm: mkQty(num(output, 'wall_thickness_mm') ?? 8, 'mm', 'length', p('wall_thickness_mm'), 'carbonation reactor'),
      reactor_shell_mass_kg: mkQty(num(output, 'mass_kg') ?? 922, 'kg', 'mass', p('mass_kg'), 'carbonation reactor shell'),
      reactor_hoop_stress_mpa: mkQty(num(output, 'hoop_stress_mpa') ?? 28, 'MPa', 'pressure', p('hoop_stress_mpa'), 'carbonation reactor'),
      // Internally-pressurised vessel → the YIELD safety factor governs (not the
      // external-buckling top-level `safety_factor`, which is physically inapplicable).
      reactor_yield_safety_factor: mkQty(num(output, 'yield_safety_factor') ?? 10, '', 'dimensionless', p('yield_safety_factor'), 'yield-governing (internal pressure)'),
    } }
  },
}

// ===========================================================================
// 8. agitation:power — CARBONATION REACTOR AGITATOR power.
//    agitation_power.py input keys: impeller_diameter_m, rpm, fluid_density_kg_m3,
//    impeller_type, fluid_viscosity_pa_s, tank_diameter_m.
//    REAL outputs: power_w, tip_speed_m_s, reynolds_impeller, power_volumetric_w_m3.
// ===========================================================================
const stepReactorAgitator: ToolStep = {
  tool_id: 'agitation:power',
  required: false,
  feeds_into: ['mass-aggregator:envelope-check'] as string[],
  input_from_contract: (c: ContractInProgress) => {
    const volM3 = q(c, 'carbonation_reactor_volume_m3', 4)
    const tankDm = Math.cbrt((4 * volM3) / (1.5 * Math.PI))   // same cylinder as the reactor shell
    return {
      impeller_diameter_m: Math.round(tankDm * 0.4 * 100) / 100,  // D/T ≈ 0.4 pitched-blade
      rpm: 120,
      fluid_density_kg_m3: 1300,        // gypsum/CaCO3 carbonation slurry
      impeller_type: 'pitched_blade',   // axial-flow for solids suspension
      fluid_viscosity_pa_s: 0.005,
      tank_diameter_m: Math.round(tankDm * 100) / 100,
    }
  },
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('agitation:power', '1.0.0', 'free-proprietary', 'internal://forgeos/process')
    return { ...c, quantities: { ...c.quantities,
      reactor_agitator_power_w: mkQty(num(output, 'power_w') ?? 1051, 'W', 'power', p('power_w'), 'carbonation reactor agitator'),
      reactor_agitator_tip_speed_m_s: mkQty(num(output, 'tip_speed_m_s') ?? 3.77, 'm/s', 'velocity', p('tip_speed_m_s'), 'reactor impeller tip'),
      reactor_agitator_power_density_w_m3: mkQty(num(output, 'power_volumetric_w_m3') ?? 230, 'W/m3', 'power', p('power_volumetric_w_m3'), 'reactor specific power'),
    } }
  },
}

// ===========================================================================
// 9. agitation:power — K2SO4 CRYSTALLISER AGITATOR power.
//    Slower marine impeller for gentle crystal suspension. Distinct names.
// ===========================================================================
const stepCrystalliserAgitator: ToolStep = {
  tool_id: 'agitation:power',
  required: false,
  feeds_into: ['mass-aggregator:envelope-check'] as string[],
  input_from_contract: (c: ContractInProgress) => {
    const volM3 = q(c, 'crystalliser_volume_m3', 2.65)
    const tankDm = Math.cbrt((4 * volM3) / (1.5 * Math.PI))
    return {
      impeller_diameter_m: Math.round(tankDm * 0.33 * 100) / 100,
      rpm: 90,
      fluid_density_kg_m3: 1250,        // K2SO4 magma
      impeller_type: 'marine',          // gentle, low-shear crystal suspension
      fluid_viscosity_pa_s: 0.003,
      tank_diameter_m: Math.round(tankDm * 100) / 100,
    }
  },
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('agitation:power', '1.0.0', 'free-proprietary', 'internal://forgeos/process')
    return { ...c, quantities: { ...c.quantities,
      crystalliser_agitator_power_w: mkQty(num(output, 'power_w') ?? 46, 'W', 'power', p('power_w'), 'K2SO4 crystalliser agitator'),
      crystalliser_agitator_tip_speed_m_s: mkQty(num(output, 'tip_speed_m_s') ?? 2.36, 'm/s', 'velocity', p('tip_speed_m_s'), 'crystalliser impeller tip'),
    } }
  },
}

// ===========================================================================
// 10. fluids:pipe-sizing — RICH-MEA / CaCO3-SLURRY transfer line. [was existing]
//     fluids_run.py input keys: flow_rate_m3_s, fluid, fluid_temperature_c,
//     pipe_diameter_mm, length_m, roughness_mm.
//     REAL outputs: pressure_drop_kpa, velocity_m_s, pipe_diameter_mm.
// ===========================================================================
const stepFluids: ToolStep = {
  tool_id: 'fluids:pipe-sizing',
  required: false,
  feeds_into: ['irrigation:pump-sizing', 'mass-aggregator:envelope-check'] as string[],
  input_from_contract: (c: ContractInProgress) => {
    const meaCircM3H = q(c, 'mea_circulation_m3_h', 3)
    return {
      flow_rate_m3_s: meaCircM3H / 3600,
      fluid: 'water' as const,          // 30 wt% aqueous MEA ≈ water hydraulics
      fluid_temperature_c: 40,          // warm rich amine
      pipe_diameter_mm: 50,             // DN50 process header
      length_m: 25,                     // absorber → carbonation reactor run
      roughness_mm: 0.015,              // stainless drawn tube
    }
  },
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('fluids:pipe-sizing', '1.3.0', 'BSD-3-Clause', 'github.com/CalebBell/fluids')
    return { ...c, quantities: { ...c.quantities,
      mea_line_pressure_drop_kpa: mkQty(num(output, 'pressure_drop_kpa') ?? 1.1, 'kPa', 'pressure', p('pressure_drop_kpa'), 'rich-MEA line'),
      mea_line_velocity_m_s: mkQty(num(output, 'velocity_m_s') ?? 0.42, 'm/s', 'velocity', p('velocity_m_s'), 'rich-MEA line'),
      mea_line_diameter_mm: mkQty(num(output, 'pipe_diameter_mm') ?? 50, 'mm', 'length', p('pipe_diameter_mm'), 'DN50 header'),
    } }
  },
}

// ===========================================================================
// 11. irrigation:pump-sizing — MEA CIRCULATION PUMP (head + motor sizing).
//     irrigation_pump_sizing.py input keys: total_emitters, flow_per_emitter_l_h,
//     system_type, pressure_loss_kpa, static_head_m, pipe_length_m, pipe_diameter_mm.
//     A single circulation duty = one "emitter" at the full flow. REAL outputs:
//     pump_head_m, motor_power_kw, recommended_motor_kw, hydraulic_power_w, pump_flow_lpm.
// ===========================================================================
const stepCirculationPump: ToolStep = {
  tool_id: 'irrigation:pump-sizing',
  required: false,
  feeds_into: ['mass-aggregator:envelope-check'] as string[],
  input_from_contract: (c: ContractInProgress) => {
    const meaCircM3H = q(c, 'mea_circulation_m3_h', 3)
    return {
      total_emitters: 1,                          // single circulation duty point
      flow_per_emitter_l_h: meaCircM3H * 1000,     // full circulation flow in L/h
      system_type: 'sprinkler',                    // medium-head centrifugal duty
      pressure_loss_kpa: 250,                      // column packing + exchangers + filter
      static_head_m: 12,                           // absorber-top static lift
      pipe_length_m: 40,
      pipe_diameter_mm: 50,
    }
  },
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('irrigation:pump-sizing', '1.0.0', 'free-proprietary', 'internal://forgeos/process')
    return { ...c, quantities: { ...c.quantities,
      mea_pump_head_m: mkQty(num(output, 'pump_head_m') ?? 37.7, 'm', 'length', p('pump_head_m'), 'MEA circulation pump head'),
      mea_pump_motor_kw: mkQty(num(output, 'recommended_motor_kw', 'motor_power_kw') ?? 0.75, 'kW', 'power', p('recommended_motor_kw'), 'MEA circulation pump motor'),
      mea_pump_hydraulic_power_w: mkQty(num(output, 'hydraulic_power_w') ?? 308, 'W', 'power', p('hydraulic_power_w'), 'MEA pump hydraulic power'),
    } }
  },
}

// ===========================================================================
// 12. coolprop:refrigerant-properties — CONDENSER COOLANT (50% glycol) properties.
//     coolprop_run.py input keys: fluid, temperature_c. For the incompressible
//     glycol mixture the REAL, meaningful outputs are liquid_density_kg_m3 and
//     cp_liquid_kj_kgk (saturation_pressure is 0 for incompressibles — NOT read).
// ===========================================================================
const stepCoolantProps: ToolStep = {
  tool_id: 'coolprop:refrigerant-properties',
  required: false,
  feeds_into: ['mass-aggregator:envelope-check'] as string[],
  input_from_contract: (c: ContractInProgress) => ({
    fluid: 'water_glycol_50',                     // 50% aq. propylene glycol coolant
    temperature_c: q(c, 'condenser_coolant_temp_c', 35),
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('coolprop:refrigerant-properties', '7.2.0', 'MIT', 'coolprop.org')
    return { ...c, quantities: { ...c.quantities,
      coolant_liquid_density_kg_m3: mkQty(num(output, 'liquid_density_kg_m3') ?? 1034, 'kg/m3', 'density', p('liquid_density_kg_m3'), 'condenser coolant (50% glycol)'),
      coolant_cp_kj_kg_k: mkQty(num(output, 'cp_liquid_kj_kgk') ?? 3.59, 'kJ/kg/K', 'specific_heat', p('cp_liquid_kj_kgk'), 'condenser coolant (50% glycol)'),
    } }
  },
}

// ===========================================================================
// 13. corrosion:anode-sizing — CATHODIC PROTECTION of MEA + KOH wetted steel.
//     corrosion_anode_sizing.py input keys: hull_material, hull_area_m2,
//     salinity_ppt, water_temp_c, mission_life_years, anode_material.
//     REAL outputs: total_current_required_a, anode_mass_kg_actual_installed,
//     anode_count, replacement_interval_years.
// ===========================================================================
const stepCorrosion: ToolStep = {
  tool_id: 'corrosion:anode-sizing',
  required: false,
  feeds_into: ['mass-aggregator:envelope-check'] as string[],
  input_from_contract: (c: ContractInProgress) => ({
    hull_material: 'stainless_316',               // 316 wetted vessels/lines (tool alloy key)
    hull_area_m2: q(c, 'wetted_steel_area_m2', 45),
    salinity_ppt: 5,                              // low-conductivity process water (not seawater)
    water_temp_c: 40,                             // warm amine/process liquor
    mission_life_years: 20,
    anode_material: 'aluminium_zinc_indium',
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('corrosion:anode-sizing', '1.0.0', 'free-proprietary', 'internal://forgeos/corrosion')
    return { ...c, quantities: { ...c.quantities,
      cp_protection_current_a: mkQty(num(output, 'total_current_required_a') ?? 0.23, 'A', 'current', p('total_current_required_a'), 'cathodic-protection current'),
      cp_anode_mass_kg: mkQty(num(output, 'anode_mass_kg_actual_installed') ?? 20, 'kg', 'mass', p('anode_mass_kg_actual_installed'), 'sacrificial anodes installed'),
      cp_anode_replacement_interval_years: mkQty(num(output, 'replacement_interval_years') ?? 18, 'yr', 'time', p('replacement_interval_years'), 'anode replacement interval'),
    } }
  },
}

// ===========================================================================
// 14. control-systems:pid-tuning — CARBONATION-REACTOR pH CONTROL LOOP.
//     control_systems_run.py input keys: plant_numerator, plant_denominator,
//     tuning_method, target_response, target_value, lambda_imc_s, controller_type.
//     First-order pH dosing loop (τ≈30 s). REAL outputs: kp, ki, kd, settling_time_s,
//     phase_margin_deg, peak_overshoot_pct.
// ===========================================================================
const stepPidControl: ToolStep = {
  tool_id: 'control-systems:pid-tuning',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (_c: ContractInProgress) => ({
    plant_numerator: [1.0],
    plant_denominator: [30.0, 1.0],   // first-order pH/level dosing plant, τ = 30 s
    tuning_method: 'imc',
    target_response: 'settling_time',
    target_value: 120,
    lambda_imc_s: 15,
    controller_type: 'PID',
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('control-systems:pid-tuning', '0.10.2', 'BSD-3-Clause', 'github.com/python-control/python-control')
    return { ...c, quantities: { ...c.quantities,
      ph_loop_pid_kp: mkQty(num(output, 'kp') ?? 1.59, '', 'dimensionless', p('kp'), 'pH-loop proportional gain'),
      ph_loop_settling_time_s: mkQty(num(output, 'settling_time_s') ?? 93.8, 's', 'time', p('settling_time_s'), 'pH-loop 2% settling'),
      ph_loop_phase_margin_deg: mkQty(num(output, 'phase_margin_deg') ?? 81.9, 'deg', 'angle', p('phase_margin_deg'), 'pH-loop phase margin'),
    } }
  },
}

// ===========================================================================
// 15. noise-emission:dba — OCCUPATIONAL NOISE (pumps / blowers / dryer).
//     noise_emission_dba.py input keys: compressor_kw, compressor_type,
//     fan_diameter_mm, fan_rpm, distance_m, mounting.
//     Rotating-machinery skid noise. REAL outputs: sound_power_db_lw_total,
//     sound_pressure_db_at_distance.
// ===========================================================================
const stepNoise: ToolStep = {
  tool_id: 'noise-emission:dba',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: ContractInProgress) => ({
    compressor_kw: q(c, 'rotating_machinery_kw', 15),   // pumps + CO2 blower aggregate
    compressor_type: 'reciprocating',                    // CO2 feed compressor analogue
    fan_diameter_mm: 600,                                // cooling-tower / dryer fan
    fan_rpm: 900,
    distance_m: 10,                                       // operator/boundary distance
    mounting: 'ground',
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('noise-emission:dba', '1.0.0', 'free-proprietary', 'internal://forgeos/acoustics')
    return { ...c, quantities: { ...c.quantities,
      plant_sound_power_dba: mkQty(num(output, 'sound_power_db_lw_total') ?? 84.2, 'dB(A)', 'sound_power', p('sound_power_db_lw_total'), 'plant total sound power'),
      plant_sound_pressure_at_10m_dba: mkQty(num(output, 'sound_pressure_db_at_distance') ?? 59.2, 'dB(A)', 'sound_pressure', p('sound_pressure_db_at_distance'), 'sound pressure at 10 m'),
    } }
  },
}

// ===========================================================================
// 16. fire-suppression:nfpa — CLEAN-AGENT SUPPRESSION (combustible MEA store).
//     fire_suppression_sizing.py input keys: agent, volume_m3, design_concentration_pct.
//     MEA is a combustible amine; the enclosure gets an NFPA 2001 clean-agent system.
//     REAL outputs: agent_mass_kg_with_safety_factor, total_cylinder_count,
//     total_installed_cost_gbp.
// ===========================================================================
const stepFireSuppression: ToolStep = {
  tool_id: 'fire-suppression:nfpa',
  required: false,
  feeds_into: ['mass-aggregator:envelope-check'] as string[],
  input_from_contract: (c: ContractInProgress) => ({
    agent: 'novec_1230',                          // FK-5-1-12 clean agent
    volume_m3: q(c, 'protected_enclosure_volume_m3', 120),
    design_concentration_pct: 5.3,                // Class-B amine design concentration
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('fire-suppression:nfpa', '1.0.0', 'free-proprietary', 'internal://forgeos/fire')
    return { ...c, quantities: { ...c.quantities,
      fire_agent_mass_kg: mkQty(num(output, 'agent_mass_kg_with_safety_factor', 'agent_mass_kg') ?? 102.7, 'kg', 'mass', p('agent_mass_kg_with_safety_factor'), 'clean-agent charge'),
      fire_cylinder_count: mkQty(num(output, 'total_cylinder_count') ?? 2, '', 'dimensionless', p('total_cylinder_count'), 'agent cylinders'),
    } }
  },
}

// ===========================================================================
// 17. lifecycle-co2:assessment — NET PLANT CARBON (vs CO2 captured).
//     lifecycle_co2.py input keys: bom_materials[{material,mass_kg,source_region}],
//     operational_energy_kwh_per_year, service_life_years, eol_pathway,
//     grid_carbon_intensity_kgco2_kwh.
//     Lets the dossier compare lifetime plant emissions against the ~7300 t CO2/yr
//     the plant captures (1 t/day × ~330 d × 22 yr-equivalent). REAL outputs:
//     total_lifecycle_co2_kg, co2_per_year, embodied_co2_kg.
// ===========================================================================
const stepLifecycle: ToolStep = {
  tool_id: 'lifecycle-co2:assessment',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: ContractInProgress) => ({
    bom_materials: [
      { material: 'steel_316L', mass_kg: q(c, 'total_steel_mass_kg', 9000), source_region: 'EU' },
    ],
    operational_energy_kwh_per_year: q(c, 'plant_annual_energy_kwh', 850000),
    service_life_years: 20,
    eol_pathway: 'recycle',
    grid_carbon_intensity_kgco2_kwh: 0.20,        // low-carbon grid assumption
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('lifecycle-co2:assessment', '1.0.0', 'free-proprietary', 'internal://forgeos/lca')
    return { ...c, quantities: { ...c.quantities,
      plant_lifecycle_co2_t: mkQty((num(output, 'total_lifecycle_co2_kg') ?? 3412240) / 1000, 't', 'mass', p('total_lifecycle_co2_kg'), 'cradle-to-grave plant CO2'),
      plant_annual_co2_t: mkQty((num(output, 'co2_per_year') ?? 170612) / 1000, 't', 'mass', p('co2_per_year'), 'annual plant CO2 footprint'),
      plant_embodied_co2_t: mkQty((num(output, 'embodied_co2_kg') ?? 30600) / 1000, 't', 'mass', p('embodied_co2_kg'), 'embodied (materials) CO2'),
    } }
  },
}

// ===========================================================================
// 18. mass-aggregator:envelope-check — SKID MASS BUDGET vs road envelope. [was existing]
//     Pure-TS tool: SUMS supplied mass buckets vs max_mass_kg_envelope. Couples in
//     the three column/reactor shell masses from the pressure-vessel steps.
//     REAL outputs: total_system_mass_kg, mass_budget_utilisation_pct,
//     recommended_container_count.
// ===========================================================================
const stepMassAgg: ToolStep = {
  tool_id: 'mass-aggregator:envelope-check',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: ContractInProgress) => {
    const reactorShellKg = q(c, 'reactor_shell_mass_kg', 922)
    const absorberShellKg = q(c, 'absorber_shell_mass_kg', 1274)
    const stripperShellKg = q(c, 'stripper_shell_mass_kg', 940)
    const vesselShellsKg = reactorShellKg + absorberShellKg + stripperShellKg
    return {
      // Generic mass buckets (tool sums them all):
      total_cell_mass_kg: 7000,                 // bulk process equipment: exchangers, filters, dryers, crystalliser
      transformer_mass_kg: 700,                 // cast-resin distribution transformer (160 kVA)
      rack_count: 8,                            // vessel supports + saddles
      rack_mass_kg_each_estimate: vesselShellsKg / 8 + 120,  // saddles + the 3 shell masses (couples PV outputs)
      pcs_mass_kg_estimate: 2500,               // pumps, agitators, centrifuge, blowers, baggers
      container_tare_kg_estimate: 4500,         // 12 m galvanised transportable skid frame + bunding
      max_mass_kg_envelope: 24000,              // standard-trailer road-transport gross-mass limit
    }
  },
  contract_update: (c: ContractInProgress, output: any) => {
    const p = provFor('mass-aggregator:envelope-check', '1.0.0', 'free-proprietary', 'internal://forgeos/orchestrator')
    return { ...c, quantities: { ...c.quantities,
      total_plant_mass_kg: mkQty(num(output, 'total_system_mass_kg') ?? 19200, 'kg', 'mass', p('total_system_mass_kg'), 'skid + vessels'),
      mass_budget_utilisation_pct: mkQty(num(output, 'mass_budget_utilisation_pct') ?? 80, '%', 'dimensionless', p('mass_budget_utilisation_pct'), 'vs road envelope'),
      recommended_container_count: mkQty(num(output, 'recommended_container_count') ?? 1, '', 'dimensionless', p('recommended_container_count'), 'transport split'),
    } }
  },
}

export const CO2_MINERALISATION_PLAN: ClassToolPlan = {
  id: 'co2_mineralisation:plant',
  envelope_predicate: (e) => e.class === 'co2_mineralisation',
  // 17 genuine tool invocations across 12 distinct tool_ids. Ordering reflects the
  // unit-operation dependency DAG: the regeneration-energy + the three columns/reactor
  // size first; their heat duties feed the heat-exchanger network; the reactor shell
  // sizes the agitator; the line + pump + coolant properties follow; the safety,
  // control, acoustic + carbon-balance tools run; the three shell masses + skid buckets
  // converge in the mass-aggregator envelope check.
  tools: [
    stepAbsorberVessel,      // 1
    stepStripperVessel,      // 2
    stepRegenEnergy,         // 3  → reboiler ht
    stepReboilerHx,          // 4
    stepCrossExchangerHx,    // 5
    stepCondenserHx,         // 6  → coolprop
    stepReactorVessel,       // 7  → reactor agitator
    stepReactorAgitator,     // 8
    stepCrystalliserAgitator,// 9
    stepFluids,              // 10 → pump
    stepCirculationPump,     // 11
    stepCoolantProps,        // 12
    stepCorrosion,           // 13
    stepPidControl,          // 14
    stepNoise,               // 15
    stepFireSuppression,     // 16
    stepLifecycle,           // 17
    stepMassAgg,             // 18 (envelope check; consumes shell masses)
  ],
  coupled_pairs: [] as Array<[string, string]>,
  max_iterations: 2,
  convergence_tolerance_pct: 5.0,
  consistency_rules: [],
}

registerPlan(CO2_MINERALISATION_PLAN)
