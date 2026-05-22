/**
 * scripts/lib/orchestrator/class-plans/heat-pump-residential.ts
 *
 * HEAT PUMP RESIDENTIAL/COMMERCIAL TOOL PLAN — hand-tuned 2026-05-22
 * (Build #20b).
 *
 * Pattern: BESS reference (bess.ts). Each tool step reads SPECIFIC
 * named fields from the EngineeringContract (not the generic
 * `{contract_quantities: c.quantities}` blob), and emits canonical
 * quantity names (not `<tool>__<field>` prefixed). Macro assembly
 * prices are appended where the tool's output naturally derives a
 * BoM line (compressor, heat exchanger, fan coil, refrigerant
 * circuit, etc.).
 *
 * Tool sequence (17 steps):
 *
 *   Class-specific:
 *     1. coolprop:refrigerant-properties    — R290/R32/R513A props at A2/W35
 *     2. refrigeration-cycle:cop            — COP @ rated point + cycle Q_evap/Q_cond
 *     3. ht:ntu-heat-exchanger              — indoor BPHE + outdoor finned-coil sizing
 *     4. psychrolib:humid-air               — psychrometrics for defrost + dehumid
 *     5. defrost-cycle:model                — frost-melt energy + frequency
 *     6. dehumidification:sizing            — dehumid load for retrofit application
 *     7. fan-coil:sizing                    — indoor fan-coil air flow + dP
 *     8. scop:seasonal                      — SCOP per EN 14825 bin method
 *     9. eer-seer:calc                      — EER/SEER per ANSI/AHRI 210/240
 *    10. building-envelope:heat-loss        — load match vs envelope U×A
 *    11. hvac:load-sizing                   — application-level sizing
 *    12. noise-emission:dba                 — A-weighted sound power @ 1 m
 *    13. pandapower:grid-integration        — 3-phase supply for ≥30 kW
 *
 *   Universal (6):
 *    14. regulatory-cert-cost:lookup        — MCS / CE / PED cert cost
 *    15. lifecycle-co2:assessment           — full LCA incl. refrigerant GWP
 *    16. supply-chain-risk:scoring          — compressor + EEV sourcing
 *    17. reliability-fmea:system            — rotational + refrigerant FMEA
 *    18. cybersecurity-threat-model:stride  — smart-controller threat model
 *    19. transport-logistics:routing        — UK two-person lift constraint
 *
 *   Mass aggregator (1):
 *    20. mass-aggregator:envelope-check
 *
 * Coupled pairs (fixed-point solver):
 *   - coolprop ↔ refrigeration-cycle (refrigerant props affect cycle COP)
 *   - refrigeration-cycle ↔ ht (compressor displacement affects HX duty)
 */

import { registerPlan } from '../planner'
import { ruleClosure, ruleQuantityRatio, ruleRange } from '../verifier'
import type { ClassToolPlan, ContractInProgress, ToolStep } from '../types'

void ruleClosure

// ---------------------------------------------------------------------------
// 1. coolprop:refrigerant-properties — R290 properties at A2/W35
// ---------------------------------------------------------------------------

const stepCoolprop: ToolStep = {
  tool_id: 'coolprop:refrigerant-properties',
  required: true,
  feeds_into: ['refrigeration-cycle:cop'] as string[],
  input_from_contract: (c: any) => ({
    // R290 is default for 2026+ new builds; brief may force R32.
    fluid: 'r290',
    // Temperature at compressor discharge (cond_saturation + 5°C superheat)
    temperature_c: (c.quantities?.cond_saturation_c?.value ?? 50) + 5,
    // Pressure at condenser saturation (≈ 17 bar for R290 @ 50°C)
    pressure_bar: 17,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:coolprop:refrigerant-properties' as const,
      tool_id: 'coolprop:refrigerant-properties',
      tool_version: '7.2.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'coolprop.org',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { latent_heat_kj_kg?: number | null; cp_liquid_kj_kgk?: number | null; density_liquid_kg_m3?: number | null }
    const updates: Record<string, any> = {}
    if (out.latent_heat_kj_kg !== null && out.latent_heat_kj_kg !== undefined && Number.isFinite(out.latent_heat_kj_kg)) {
      updates.refrigerant_latent_heat_kj_kg = {
        value: out.latent_heat_kj_kg, unit: 'kJ/kg', family: 'energy' as const,
        basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 2,
        temporal_resolution_s: null, condition: 'R290 @ cond saturation',
        provenance: prov('latent_heat_kj_kg'),
      }
    }
    if (out.cp_liquid_kj_kgk !== null && out.cp_liquid_kj_kgk !== undefined && Number.isFinite(out.cp_liquid_kj_kgk)) {
      updates.refrigerant_cp_liquid_kj_kgk = {
        value: out.cp_liquid_kj_kgk, unit: 'kJ/(kg·K)', family: 'energy' as const,
        basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 2,
        temporal_resolution_s: null, condition: 'R290 liquid @ cond saturation',
        provenance: prov('cp_liquid_kj_kgk'),
      }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// ---------------------------------------------------------------------------
// 2. refrigeration-cycle:cop — vapour-compression cycle @ A2/W35
// ---------------------------------------------------------------------------

const stepRefrigCycle: ToolStep = {
  tool_id: 'refrigeration-cycle:cop',
  required: true,
  feeds_into: ['ht:ntu-heat-exchanger', 'eer-seer:calc', 'scop:seasonal'] as string[],
  input_from_contract: (c: any) => ({
    refrigerant: 'r290',
    evap_temp_c: c.quantities?.evap_saturation_c?.value ?? -12,
    cond_temp_c: c.quantities?.cond_saturation_c?.value ?? 50,
    cooling_capacity_kw: c.quantities?.rated_thermal_kw?.value ?? 12,
    superheat_k: 5,
    subcool_k: 5,
    isentropic_efficiency: 0.70,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:refrigeration-cycle:cop' as const,
      tool_id: 'refrigeration-cycle:cop',
      tool_version: '1.0.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'internal://forgeos/orchestrator',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as {
      cop_heating?: number; cop_cooling?: number; compressor_power_kw?: number;
      mass_flow_kg_s?: number; refrigerant_charge_kg?: number;
    }
    const thermalKw = (c.quantities?.rated_thermal_kw?.value as number) ?? 12
    // Build #20-cleanup (2026-05-22): source_detail is not on TypedQuantity;
    // it lives on provenance.invocation_output_field OR is sometimes attached
    // by class plans as an ad-hoc property on the provenance object.
    const refrigerantSourceText = String(
      c.quantities?.refrigerant?.provenance?.invocation_output_field
      ?? (c.quantities?.refrigerant?.provenance as any)?.source_detail
      ?? '',
    )
    const refrigerantId = refrigerantSourceText.match(/r290|r32|r513a/i)?.[0]?.toLowerCase() ?? 'r290'
    // Compressor macro: £100/kW thermal for hermetic rotary/scroll
    const compressorMacro = {
      word_name: 'refrigerant_compressor',
      unit_price_gbp: 100,
      dimension_basis: 'kw_power' as const,
      dimension_value: thermalKw,
      total_gbp: 100 * thermalKw,
      source_detail: `refrigeration-cycle-derived: £100/kW × ${thermalKw.toFixed(1)} kW thermal (hermetic rotary or scroll, ${refrigerantId.toUpperCase()}-rated)`,
    }
    const updates: Record<string, any> = {}
    if (out.cop_heating !== undefined && Number.isFinite(out.cop_heating)) {
      updates.cop_rated_computed = {
        value: out.cop_heating, unit: '', family: 'dimensionless' as const,
        basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 5,
        temporal_resolution_s: null, condition: 'A2/W35 vapour-compression',
        provenance: prov('cop_heating'),
      }
    }
    if (out.compressor_power_kw !== undefined && Number.isFinite(out.compressor_power_kw)) {
      updates.compressor_power_kw = {
        value: out.compressor_power_kw, unit: 'kW', family: 'power' as const,
        basis: 'continuous' as const, scope: 'module' as const, uncertainty_pct: 5,
        temporal_resolution_s: null, condition: 'A2/W35',
        provenance: prov('compressor_power_kw'),
      }
    }
    if (out.mass_flow_kg_s !== undefined && Number.isFinite(out.mass_flow_kg_s)) {
      updates.refrigerant_mass_flow_kg_s = {
        value: out.mass_flow_kg_s, unit: 'kg/s', family: 'flow_rate' as const,
        basis: 'continuous' as const, scope: 'system' as const, uncertainty_pct: 5,
        temporal_resolution_s: null, condition: 'A2/W35',
        provenance: prov('mass_flow_kg_s'),
      }
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'refrigerant_compressor'),
        compressorMacro,
      ],
      quantities: { ...c.quantities, ...updates },
    }
  },
}

// ---------------------------------------------------------------------------
// 3. ht:ntu-heat-exchanger — sizes the indoor BPHE + outdoor finned-coil
// ---------------------------------------------------------------------------

const stepHt: ToolStep = {
  tool_id: 'ht:ntu-heat-exchanger',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    duty_kw: c.quantities?.rated_thermal_kw?.value ?? 12,
    hot_fluid_in_c: c.quantities?.cond_saturation_c?.value ?? 50,
    hot_fluid_out_c: 40,  // water-side flow temperature
    cold_fluid_in_c: 30,  // return water
    cold_fluid_out_c: 40,
    hot_fluid: 'r290',
    cold_fluid: 'water',
    arrangement: 'counter_flow',
    overall_u_w_m2k: 3500,  // BPHE typical
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:ht:ntu-heat-exchanger' as const,
      tool_id: 'ht:ntu-heat-exchanger',
      tool_version: '1.2.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'github.com/CalebBell/ht',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { ntu?: number; effectiveness?: number; area_m2?: number }
    const thermalKw = (c.quantities?.rated_thermal_kw?.value as number) ?? 12
    // Indoor (water-side) BPHE macro: £30/kW
    const indoorHxMacro = {
      word_name: 'indoor_heat_exchanger',
      unit_price_gbp: 30,
      dimension_basis: 'kw_power' as const,
      dimension_value: thermalKw,
      total_gbp: 30 * thermalKw,
      source_detail: `ht-derived: £30/kW × ${thermalKw.toFixed(1)} kW (stainless brazed-plate water-side, NTU-sized)`,
    }
    // Outdoor (air-side) finned-tube macro: £45/kW
    const outdoorHxMacro = {
      word_name: 'outdoor_heat_exchanger',
      unit_price_gbp: 45,
      dimension_basis: 'kw_power' as const,
      dimension_value: thermalKw,
      total_gbp: 45 * thermalKw,
      source_detail: `ht-derived: £45/kW × ${thermalKw.toFixed(1)} kW (Cu/Al fin-tube cross-flow, marine-coated)`,
    }
    const updates: Record<string, any> = {}
    if (out.area_m2 !== undefined && Number.isFinite(out.area_m2)) {
      updates.indoor_hx_area_m2_computed = {
        value: out.area_m2, unit: 'm²', family: 'area' as const,
        basis: 'rated' as const, scope: 'module' as const, uncertainty_pct: 10,
        temporal_resolution_s: null, condition: 'BPHE, U=3500 W/m²K',
        provenance: prov('area_m2'),
      }
    }
    if (out.effectiveness !== undefined && Number.isFinite(out.effectiveness)) {
      updates.hx_effectiveness = {
        value: out.effectiveness, unit: '', family: 'dimensionless' as const,
        basis: 'rated' as const, scope: 'module' as const, uncertainty_pct: 5,
        temporal_resolution_s: null, condition: 'NTU-ε method',
        provenance: prov('effectiveness'),
      }
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'indoor_heat_exchanger' && m.word_name !== 'outdoor_heat_exchanger'),
        indoorHxMacro,
        outdoorHxMacro,
      ],
      quantities: { ...c.quantities, ...updates },
    }
  },
}

// ---------------------------------------------------------------------------
// 4. psychrolib:humid-air — psychrometric state for defrost + dehumid
// ---------------------------------------------------------------------------

const stepPsychrolib: ToolStep = {
  tool_id: 'psychrolib:humid-air',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    dry_bulb_c: c.quantities?.min_ambient_c?.value ?? -7,  // critical defrost point
    relative_humidity_pct: 85,
    pressure_pa: 101325,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:psychrolib:humid-air' as const,
      tool_id: 'psychrolib:humid-air',
      tool_version: '2.5.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'github.com/psychrometrics/psychrolib',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { humidity_ratio_kg_kg?: number; dew_point_c?: number; enthalpy_kj_kg?: number }
    const updates: Record<string, any> = {}
    if (out.humidity_ratio_kg_kg !== undefined && Number.isFinite(out.humidity_ratio_kg_kg)) {
      updates.ambient_humidity_ratio_kg_kg = {
        value: out.humidity_ratio_kg_kg, unit: 'kg/kg', family: 'dimensionless' as const,
        basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 2,
        temporal_resolution_s: null, condition: '85% RH @ defrost point',
        provenance: prov('humidity_ratio_kg_kg'),
      }
    }
    if (out.dew_point_c !== undefined && Number.isFinite(out.dew_point_c)) {
      updates.ambient_dew_point_c = {
        value: out.dew_point_c, unit: '°C', family: 'temperature' as const,
        basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 2,
        temporal_resolution_s: null, condition: '85% RH',
        provenance: prov('dew_point_c'),
      }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// ---------------------------------------------------------------------------
// 5. defrost-cycle:model — frost-melt energy + cycle frequency
// ---------------------------------------------------------------------------

const stepDefrost: ToolStep = {
  tool_id: 'defrost-cycle:model',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    outdoor_temp_c: c.quantities?.min_ambient_c?.value ?? -7,
    relative_humidity_pct: 85,
    coil_face_area_m2: (c.quantities?.outdoor_hx_area_m2?.value as number) ?? 6,
    cycle_method: 'reverse_cycle',
    thermal_capacity_kw: c.quantities?.rated_thermal_kw?.value ?? 12,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:defrost-cycle:model' as const,
      tool_id: 'defrost-cycle:model',
      tool_version: '1.0.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'internal://forgeos/orchestrator',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { defrost_energy_kwh?: number; defrost_frequency_per_hour?: number; defrost_penalty_pct?: number }
    const updates: Record<string, any> = {}
    if (out.defrost_energy_kwh !== undefined && Number.isFinite(out.defrost_energy_kwh)) {
      updates.defrost_energy_kwh_per_cycle = {
        value: out.defrost_energy_kwh, unit: 'kWh', family: 'energy' as const,
        basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 10,
        temporal_resolution_s: null, condition: 'reverse-cycle defrost @ -7°C, 85% RH',
        provenance: prov('defrost_energy_kwh'),
      }
    }
    if (out.defrost_penalty_pct !== undefined && Number.isFinite(out.defrost_penalty_pct)) {
      updates.defrost_seasonal_penalty_pct = {
        value: out.defrost_penalty_pct, unit: '%', family: 'dimensionless' as const,
        basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 10,
        temporal_resolution_s: null, condition: 'annual avg, UK climate',
        provenance: prov('defrost_penalty_pct'),
      }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// ---------------------------------------------------------------------------
// 6. dehumidification:sizing — for retrofit / commercial application
// ---------------------------------------------------------------------------

const stepDehumid: ToolStep = {
  tool_id: 'dehumidification:sizing',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    moisture_load_kg_h: 5,   // typical small-commercial latent load
    target_rh_pct: 55,
    air_flow_m3_h: 1000,
    inlet_temp_c: 22,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:dehumidification:sizing' as const,
      tool_id: 'dehumidification:sizing',
      tool_version: '1.0.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'internal://forgeos/orchestrator',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { dehumid_capacity_l_day?: number; dehumid_chiller_kw?: number }
    const updates: Record<string, any> = {}
    if (out.dehumid_capacity_l_day !== undefined && Number.isFinite(out.dehumid_capacity_l_day)) {
      updates.dehumidification_capacity_l_day = {
        value: out.dehumid_capacity_l_day, unit: 'L/day', family: 'volume' as const,
        basis: 'continuous' as const, scope: 'system' as const, uncertainty_pct: 10,
        temporal_resolution_s: null, condition: 'inlet 22°C, target 55% RH',
        provenance: prov('dehumid_capacity_l_day'),
      }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// ---------------------------------------------------------------------------
// 7. fan-coil:sizing — indoor fan-coil air-side
// ---------------------------------------------------------------------------

const stepFanCoil: ToolStep = {
  tool_id: 'fan-coil:sizing',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    sensible_heat_kw: c.quantities?.rated_thermal_kw?.value ?? 12,
    air_temp_in_c: 20,
    air_temp_out_c: 35,  // outlet warm air for hydronic-air retrofit
    duct_pressure_pa: 100,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:fan-coil:sizing' as const,
      tool_id: 'fan-coil:sizing',
      tool_version: '1.0.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'internal://forgeos/orchestrator',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { air_flow_m3_h?: number; fan_power_w?: number }
    const updates: Record<string, any> = {}
    if (out.air_flow_m3_h !== undefined && Number.isFinite(out.air_flow_m3_h)) {
      updates.indoor_air_flow_m3_h = {
        value: out.air_flow_m3_h, unit: 'm³/h', family: 'flow_rate' as const,
        basis: 'continuous' as const, scope: 'module' as const, uncertainty_pct: 5,
        temporal_resolution_s: null, condition: '20→35°C ΔT',
        provenance: prov('air_flow_m3_h'),
      }
    }
    if (out.fan_power_w !== undefined && Number.isFinite(out.fan_power_w)) {
      updates.indoor_fan_power_w = {
        value: out.fan_power_w, unit: 'W', family: 'power' as const,
        basis: 'continuous' as const, scope: 'module' as const, uncertainty_pct: 5,
        temporal_resolution_s: null, condition: 'EC fan, 100 Pa duct',
        provenance: prov('fan_power_w'),
      }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// ---------------------------------------------------------------------------
// 8. scop:seasonal — SCOP per EN 14825 bin method
// ---------------------------------------------------------------------------

const stepScop: ToolStep = {
  tool_id: 'scop:seasonal',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    climate_zone: 'average',  // EN 14825: 'warm' | 'average' | 'cold'
    rated_thermal_kw: c.quantities?.rated_thermal_kw?.value ?? 12,
    rated_cop: c.quantities?.cop_rated?.value ?? 3.8,
    cop_at_minus7_c: 2.5,
    flow_temp_c: 35,  // low-temp application H3
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:scop:seasonal' as const,
      tool_id: 'scop:seasonal',
      tool_version: '1.0.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'internal://forgeos/orchestrator',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { scop?: number; etas_pct?: number; annual_energy_kwh?: number }
    const updates: Record<string, any> = {}
    if (out.scop !== undefined && Number.isFinite(out.scop)) {
      updates.scop_computed = {
        value: out.scop, unit: '', family: 'dimensionless' as const,
        basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 5,
        temporal_resolution_s: null, condition: 'EN 14825 Average climate, W35',
        provenance: prov('scop'),
      }
    }
    if (out.etas_pct !== undefined && Number.isFinite(out.etas_pct)) {
      updates.eta_s_seasonal_pct = {
        value: out.etas_pct, unit: '%', family: 'dimensionless' as const,
        basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 5,
        temporal_resolution_s: null, condition: 'ErP energy label',
        provenance: prov('etas_pct'),
      }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// ---------------------------------------------------------------------------
// 9. eer-seer:calc — EER/SEER per ANSI/AHRI 210/240 (cooling mode)
// ---------------------------------------------------------------------------

const stepEerSeer: ToolStep = {
  tool_id: 'eer-seer:calc',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    rated_cooling_kw: (c.quantities?.rated_thermal_kw?.value as number) ?? 12,
    rated_cooling_cop: 3.5,  // typical cooling COP
    standard: 'ahri_210_240',
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:eer-seer:calc' as const,
      tool_id: 'eer-seer:calc',
      tool_version: '1.0.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'internal://forgeos/orchestrator',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { eer?: number; seer?: number }
    const updates: Record<string, any> = {}
    if (out.eer !== undefined && Number.isFinite(out.eer)) {
      updates.eer_rated = {
        value: out.eer, unit: 'BTU/Wh', family: 'dimensionless' as const,
        basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 5,
        temporal_resolution_s: null, condition: 'AHRI 210/240, 35°C ambient',
        provenance: prov('eer'),
      }
    }
    if (out.seer !== undefined && Number.isFinite(out.seer)) {
      updates.seer_seasonal = {
        value: out.seer, unit: 'BTU/Wh', family: 'dimensionless' as const,
        basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 5,
        temporal_resolution_s: null, condition: 'AHRI 210/240 seasonal',
        provenance: prov('seer'),
      }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// ---------------------------------------------------------------------------
// 10. building-envelope:heat-loss — load match vs U×A envelope
// ---------------------------------------------------------------------------

const stepBuildingEnvelope: ToolStep = {
  tool_id: 'building-envelope:heat-loss',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({
    floor_area_m2: 200,   // small commercial default
    u_value_w_m2k: 0.30,  // post-retrofit UK Part L
    indoor_temp_c: 21,
    outdoor_temp_c: -3,   // UK design day
    air_change_per_hour: 0.5,
    ceiling_height_m: 3.0,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:building-envelope:heat-loss' as const,
      tool_id: 'building-envelope:heat-loss',
      tool_version: '1.0.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'internal://forgeos/orchestrator',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { peak_heat_loss_kw?: number; annual_heat_demand_kwh?: number }
    const updates: Record<string, any> = {}
    if (out.peak_heat_loss_kw !== undefined && Number.isFinite(out.peak_heat_loss_kw)) {
      updates.building_peak_heat_loss_kw = {
        value: out.peak_heat_loss_kw, unit: 'kW', family: 'power' as const,
        basis: 'peak' as const, scope: 'site' as const, uncertainty_pct: 10,
        temporal_resolution_s: null, condition: 'UK design day -3°C',
        provenance: prov('peak_heat_loss_kw'),
      }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// ---------------------------------------------------------------------------
// 11. hvac:load-sizing — application-level sizing check
// ---------------------------------------------------------------------------

const stepHvacLoad: ToolStep = {
  tool_id: 'hvac:load-sizing',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    sensible_load_kw: c.quantities?.rated_thermal_kw?.value ?? 12,
    latent_load_kw: 0,
    cop_target: c.quantities?.cop_rated?.value ?? 3.8,
    standard: 'ashrae_2017_ch18',
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:hvac:load-sizing' as const,
      tool_id: 'hvac:load-sizing',
      tool_version: '1.0.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'internal://forgeos/orchestrator',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { sized_capacity_kw?: number; sensible_heat_ratio?: number }
    const updates: Record<string, any> = {}
    if (out.sized_capacity_kw !== undefined && Number.isFinite(out.sized_capacity_kw)) {
      updates.hvac_sized_capacity_kw = {
        value: out.sized_capacity_kw, unit: 'kW', family: 'power' as const,
        basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 5,
        temporal_resolution_s: null, condition: 'ASHRAE 2017 Ch 18',
        provenance: prov('sized_capacity_kw'),
      }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// ---------------------------------------------------------------------------
// 12. noise-emission:dba — A-weighted sound power @ 1 m outdoor side
// ---------------------------------------------------------------------------

const stepNoise: ToolStep = {
  tool_id: 'noise-emission:dba',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    fan_power_w: 200,
    compressor_power_kw: c.quantities?.compressor_power_kw?.value ?? 3,
    rated_thermal_kw: c.quantities?.rated_thermal_kw?.value ?? 12,
    distance_m: 1,
    enclosure_attenuation_db: 8,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:noise-emission:dba' as const,
      tool_id: 'noise-emission:dba',
      tool_version: '1.0.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'internal://forgeos/orchestrator',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { sound_power_dba?: number; sound_pressure_dba?: number }
    const updates: Record<string, any> = {}
    if (out.sound_power_dba !== undefined && Number.isFinite(out.sound_power_dba)) {
      updates.sound_power_dba_computed = {
        value: out.sound_power_dba, unit: 'dBA', family: 'dimensionless' as const,
        basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 3,
        temporal_resolution_s: null, condition: 'EN 12102 Lw',
        provenance: prov('sound_power_dba'),
      }
    }
    if (out.sound_pressure_dba !== undefined && Number.isFinite(out.sound_pressure_dba)) {
      updates.sound_pressure_dba_at_1m = {
        value: out.sound_pressure_dba, unit: 'dBA', family: 'dimensionless' as const,
        basis: 'rated' as const, scope: 'site' as const, uncertainty_pct: 3,
        temporal_resolution_s: null, condition: '1 m outdoor-side',
        provenance: prov('sound_pressure_dba'),
      }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// ---------------------------------------------------------------------------
// 13. pandapower:grid-integration — 3-phase supply for ≥30 kW
// ---------------------------------------------------------------------------

const stepPandapower: ToolStep = {
  tool_id: 'pandapower:grid-integration',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    rated_power_kw: c.quantities?.rated_electrical_kw?.value ?? 3.5,
    pcc_voltage_kv: 0.4,  // 400 V three-phase
    region: 'EU' as const,
    grid_strength: 'strong' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:pandapower:grid-integration' as const,
      tool_id: 'pandapower:grid-integration',
      tool_version: '3.4.0',
      tool_license: 'BSD-3-Clause' as const,
      tool_source_url: 'github.com/e2nIEE/pandapower',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { transformer_rating_kva?: number; line_current_a?: number }
    const updates: Record<string, any> = {}
    if (out.line_current_a !== undefined && Number.isFinite(out.line_current_a)) {
      updates.line_current_a_computed = {
        value: out.line_current_a, unit: 'A', family: 'current' as const,
        basis: 'continuous' as const, scope: 'system' as const, uncertainty_pct: 2,
        temporal_resolution_s: null, condition: 'three-phase 400 V',
        provenance: prov('line_current_a'),
      }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// ---------------------------------------------------------------------------
// Universal step factory — concise (these run BoM-attribution support)
// ---------------------------------------------------------------------------

function universalStep(toolId: string, sourceUrl: string, license: any = 'MIT'): ToolStep {
  const tag = toolId.replace(/[:-]/g, '_')
  return {
    tool_id: toolId,
    required: false,
    feeds_into: [] as string[],
    input_from_contract: (c: any) => ({ contract_quantities: c.quantities ?? {} }),
    contract_update: (c: ContractInProgress, output: any) => {
      const prov = (f: string) => ({
        source: `tool:${toolId}` as const,
        tool_id: toolId,
        tool_version: '1.0.0',
        tool_license: license,
        tool_source_url: sourceUrl,
        invocation_output_field: f,
        duration_ms: 0,
      })
      const updates: Record<string, any> = {}
      if (output && typeof output === 'object') {
        for (const [k, v] of Object.entries(output as Record<string, unknown>)) {
          if (typeof v === 'number' && Number.isFinite(v) && !k.startsWith('_')) {
            updates[`${tag}__${k}`] = {
              value: v, unit: '', family: 'dimensionless' as const,
              basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 0,
              temporal_resolution_s: null, condition: null, provenance: prov(k),
            }
          }
        }
      }
      return { ...c, quantities: { ...c.quantities, ...updates } }
    },
  }
}

const stepRegCert = universalStep('regulatory-cert-cost:lookup', 'internal://forgeos/orchestrator')
const stepLifecycleCo2 = universalStep('lifecycle-co2:assessment', 'internal://forgeos/orchestrator')
const stepSupplyChainRisk = universalStep('supply-chain-risk:scoring', 'internal://forgeos/orchestrator')
const stepReliabilityFmea = universalStep('reliability-fmea:system', 'internal://forgeos/orchestrator')
const stepCyber = universalStep('cybersecurity-threat-model:stride', 'internal://forgeos/orchestrator')
const stepTransport = universalStep('transport-logistics:routing', 'internal://forgeos/orchestrator')

// ---------------------------------------------------------------------------
// Mass aggregator (runs LAST)
// ---------------------------------------------------------------------------

const stepMassAggregator: ToolStep = {
  tool_id: 'mass-aggregator:envelope-check',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => {
    const totalEstimatedMassKg = c.quantities?.total_estimated_mass_kg?.value ?? 300
    const maxMassKgEnvelope = c.quantities?.max_mass_kg?.value ?? 250
    const thermalKw = c.quantities?.rated_thermal_kw?.value ?? 12
    return {
      total_cell_mass_kg: 0,  // no battery in HP
      transformer_mass_kg: null,
      rack_count: 1,
      max_mass_kg_envelope: maxMassKgEnvelope,
      pcs_mass_kg_estimate: 0,
      container_tare_kg_estimate: 0,
      rack_mass_kg_each_estimate: 0,
      additional_mass_kg: totalEstimatedMassKg,
      thermal_kw: thermalKw,
    }
  },
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:mass-aggregator:envelope-check' as const,
      tool_id: 'mass-aggregator:envelope-check',
      tool_version: '1.0.0',
      tool_license: 'free-proprietary' as const,
      tool_source_url: 'internal://forgeos/orchestrator',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { total_system_mass_kg?: number; mass_budget_utilisation_pct?: number; mass_budget_breach_kg?: number }
    const updates: Record<string, any> = {}
    if (out.total_system_mass_kg !== undefined && Number.isFinite(out.total_system_mass_kg)) {
      updates.total_system_mass_kg = {
        value: out.total_system_mass_kg, unit: 'kg', family: 'mass' as const,
        basis: 'empty' as const, scope: 'system' as const, uncertainty_pct: 5,
        temporal_resolution_s: null, condition: 'all-up dry',
        provenance: prov('total_system_mass_kg'),
      }
    }
    if (out.mass_budget_utilisation_pct !== undefined && Number.isFinite(out.mass_budget_utilisation_pct)) {
      updates.mass_budget_utilisation_pct = {
        value: out.mass_budget_utilisation_pct, unit: '%', family: 'dimensionless' as const,
        basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 5,
        temporal_resolution_s: null, condition: null,
        provenance: prov('mass_budget_utilisation_pct'),
      }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// ---------------------------------------------------------------------------
// CONSISTENCY RULES
// ---------------------------------------------------------------------------

const rules = [
  ruleRange(
    'heatpump.rated_thermal_kw_range',
    'rated_thermal_kw within residential/commercial bounds (3-50 kW)',
    'rated_thermal_kw',
    3.0, 50.0,
    'warning',
  ),
  ruleRange(
    'heatpump.cop_rated_minimum',
    'COP_rated must be ≥ 3.0 for ErP A+ class',
    'cop_rated',
    3.0, 6.0,
    'warning',
  ),
  ruleRange(
    'heatpump.scop_minimum',
    'SCOP must be ≥ 3.5 for low-temp H3 zone',
    'scop',
    3.5, 7.0,
    'warning',
  ),
  ruleRange(
    'heatpump.sound_power_dba_range',
    'Sound power dBA within EN 12102 typical bounds',
    'sound_power_dba',
    30.0, 70.0,
    'warning',
  ),
  ruleRange(
    'heatpump.refrigerant_charge_within_limit',
    'Refrigerant charge ≤ Annex CC limit for R290',
    'refrigerant_charge_kg',
    0, 2.0,
    'warning',
  ),
  ruleQuantityRatio(
    'heatpump.electrical_thermal_match',
    'electrical_kw × cop_rated must equal thermal_kw (closure)',
    'rated_electrical_kw',
    'rated_thermal_kw',
    3.0,  // expect ≈ thermal / cop, lhs * cop ≤ rhs
    'info',
  ),
]

// ---------------------------------------------------------------------------
// PLAN REGISTRATION
// ---------------------------------------------------------------------------

export const HEAT_PUMP_RESIDENTIAL_PLAN: ClassToolPlan = {
  id: 'heat_pump_residential:all_scales',
  envelope_predicate: (e) => e.class === 'heat_pump_residential',
  tools: [
    stepCoolprop,
    stepRefrigCycle,
    stepHt,
    stepPsychrolib,
    stepDefrost,
    stepDehumid,
    stepFanCoil,
    stepScop,
    stepEerSeer,
    stepBuildingEnvelope,
    stepHvacLoad,
    stepNoise,
    stepPandapower,
    stepRegCert,
    stepLifecycleCo2,
    stepSupplyChainRisk,
    stepReliabilityFmea,
    stepCyber,
    stepTransport,
    stepMassAggregator,
  ],
  coupled_pairs: [
    ['coolprop:refrigerant-properties', 'refrigeration-cycle:cop'],
    ['refrigeration-cycle:cop', 'ht:ntu-heat-exchanger'],
  ] as Array<[string, string]>,
  max_iterations: 3,
  convergence_tolerance_pct: 5.0,
  consistency_rules: rules,
}

registerPlan(HEAT_PUMP_RESIDENTIAL_PLAN)
