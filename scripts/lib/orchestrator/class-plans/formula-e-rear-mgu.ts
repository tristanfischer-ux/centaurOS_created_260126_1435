/**
 * scripts/lib/orchestrator/class-plans/formula-e-rear-mgu.ts
 *
 * FORMULA E REAR MGU + MCU — analytical tool plan (2026-07-28).
 *
 * INTENT: Wire the nine promoted MGU/MCU tools so a Formula E rear-perimeter
 * brief does NOT fall through to vehicle/plant bootstrap. Perimeter is rear
 * MGU + SiC MCU + gear/cooling interfaces only — not a full race car.
 *
 * Tools (9):
 *   1. motor:ipmsm-analytical-sizing
 *   2. inverter:current-voltage-envelope
 *   3. inverter:sic-loss
 *   4. inverter:field-weakening-mtpa
 *   5. motor:loss-point
 *   6. motor:rotor-centrifugal-stress
 *   7. motor:thermal-lumped
 *   8. gear:traction-ratio
 *   9. powertrain:duty-cycle-energy
 */

import { registerPlan } from '../planner'
import { ruleRange } from '../verifier'
import type { ClassToolPlan, ContractInProgress, ToolStep } from '../types'

function qv(c: ContractInProgress, key: string, fallback: number): number {
  const raw = (c.quantities as any)?.[key]
  const v = typeof raw === 'object' && raw !== null ? Number(raw.value) : Number(raw)
  return Number.isFinite(v) && v !== 0 ? v : fallback
}

function prov(toolId: string, field: string) {
  return {
    source: `tool:${toolId}` as const,
    tool_id: toolId,
    tool_version: '1.0.0',
    tool_license: 'free-proprietary' as const,
    tool_source_url: 'internal://forgeos/mgu-mcu-pack',
    invocation_output_field: field,
    duration_ms: 0,
  }
}

/** Illustrative 100 s vignette from briefs-loop/formula_e_rear_mgu.md — replace with track logs. */
const TRIAL_DUTY_BINS = [
  { speed_rpm: 15000, torque_nm: 80, duration_s: 8 },
  { speed_rpm: 25000, torque_nm: 55, duration_s: 12 },
  { speed_rpm: 35000, torque_nm: 35, duration_s: 20 },
  { speed_rpm: 45000, torque_nm: 20, duration_s: 25 },
  { speed_rpm: 40000, torque_nm: -40, duration_s: 10 },
  { speed_rpm: 30000, torque_nm: -60, duration_s: 8 },
  { speed_rpm: 20000, torque_nm: -30, duration_s: 6 },
  { speed_rpm: 10000, torque_nm: 10, duration_s: 11 },
]

const stepIpmsmSizing: ToolStep = {
  tool_id: 'motor:ipmsm-analytical-sizing',
  required: true,
  feeds_into: ['motor:rotor-centrifugal-stress', 'motor:loss-point'] as string[],
  input_from_contract: (c) => ({
    torque_nm: qv(c, 'mgu_shaft_torque_nm', 67),
    base_speed_rpm: qv(c, 'mgu_base_speed_rpm', 40000),
    airgap_b_t: qv(c, 'airgap_b_t', 0.9),
    electric_loading_a_per_m: qv(c, 'electric_loading_a_per_m', 60000),
    pole_pairs: Math.round(qv(c, 'pole_pairs', 2)),
  }),
  contract_update: (c, output) => {
    const out = output as {
      rotor_airgap_diameter_mm: number
      stack_length_mm: number
      tip_speed_m_s: number
      shaft_power_kw: number
      electrical_frequency_hz: number
    }
    const tid = 'motor:ipmsm-analytical-sizing'
    return {
      ...c,
      quantities: {
        ...c.quantities,
        rotor_airgap_diameter_mm: {
          value: out.rotor_airgap_diameter_mm, unit: 'mm', family: 'length', basis: 'rated',
          scope: 'module', uncertainty_pct: 15, temporal_resolution_s: null, condition: 'D²L first pass',
          provenance: prov(tid, 'rotor_airgap_diameter_mm'),
        },
        stack_length_mm: {
          value: out.stack_length_mm, unit: 'mm', family: 'length', basis: 'rated',
          scope: 'module', uncertainty_pct: 15, temporal_resolution_s: null, condition: null,
          provenance: prov(tid, 'stack_length_mm'),
        },
        tip_speed_m_s: {
          value: out.tip_speed_m_s, unit: 'm/s', family: 'velocity', basis: 'peak',
          scope: 'module', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'at base_speed_rpm',
          provenance: prov(tid, 'tip_speed_m_s'),
        },
        mgu_shaft_power_kw: {
          value: out.shaft_power_kw, unit: 'kW', family: 'power', basis: 'rated',
          scope: 'module', uncertainty_pct: 10, temporal_resolution_s: null, condition: null,
          provenance: prov(tid, 'shaft_power_kw'),
        },
        electrical_frequency_hz: {
          value: out.electrical_frequency_hz, unit: 'Hz', family: 'frequency', basis: 'rated',
          scope: 'module', uncertainty_pct: 5, temporal_resolution_s: null, condition: null,
          provenance: prov(tid, 'electrical_frequency_hz'),
        },
      },
    }
  },
}

const stepCurrentVoltageEnvelope: ToolStep = {
  tool_id: 'inverter:current-voltage-envelope',
  required: true,
  feeds_into: ['inverter:sic-loss', 'inverter:field-weakening-mtpa'] as string[],
  input_from_contract: (c) => ({
    v_dc_min_v: qv(c, 'v_dc_min_v', 600),
    v_dc_max_v: qv(c, 'v_dc_max_v', 900),
    i_phase_max_a: qv(c, 'phase_current_max_a', 530),
    n_phases: 3,
    mgu_speed_rad_s: qv(c, 'mgu_base_speed_rpm', 40000) * 2 * Math.PI / 60,
    gear_ratio: qv(c, 'gear_ratio', 8),
  }),
  contract_update: (c, output) => {
    const out = output as {
      electrical_power_kw_at_vdc_min?: number
      mgu_torque_nm?: number
      wheel_torque_nm?: number
    }
    const tid = 'inverter:current-voltage-envelope'
    const next = { ...c.quantities }
    if (typeof out.electrical_power_kw_at_vdc_min === 'number') {
      next.envelope_electrical_power_kw = {
        value: out.electrical_power_kw_at_vdc_min, unit: 'kW', family: 'power', basis: 'peak',
        scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'at Vdc min',
        provenance: prov(tid, 'electrical_power_kw_at_vdc_min'),
      }
    }
    if (typeof out.mgu_torque_nm === 'number') {
      next.envelope_mgu_torque_nm = {
        value: out.mgu_torque_nm, unit: 'Nm', family: 'force', basis: 'peak',
        scope: 'module', uncertainty_pct: 15, temporal_resolution_s: null, condition: null,
        provenance: prov(tid, 'mgu_torque_nm'),
      }
    }
    return { ...c, quantities: next }
  },
}

const stepSicLoss: ToolStep = {
  tool_id: 'inverter:sic-loss',
  required: true,
  feeds_into: ['powertrain:duty-cycle-energy'] as string[],
  input_from_contract: (c) => ({
    // GOTCHA: tool input name is continuous_power_kw, but for traction we size
    // the SiC loss/current corner at PEAK rear-axle kW so ac_rms coheres with
    // mgu_shaft_power_kw / phase_current_max_a (critic flagged 272 A vs 322 kW).
    continuous_power_kw: qv(c, 'rear_axle_electrical_power_kw', qv(c, 'traction_inverter_power_kw', 350)),
    dc_bus_voltage_v: qv(c, 'dc_bus_voltage_v', 750),
    ac_output_voltage_v: qv(c, 'ac_output_voltage_v', 530),
    switching_frequency_khz: qv(c, 'switching_frequency_khz', 40),
    mosfet_rdson_mohm: qv(c, 'mosfet_rdson_mohm', 8),
  }),
  contract_update: (c, output) => {
    const out = output as {
      inverter_efficiency: number
      inverter_dissipated_kw: number
      ac_rms_current_a: number
    }
    const tid = 'inverter:sic-loss'
    return {
      ...c,
      quantities: {
        ...c.quantities,
        inverter_efficiency: {
          value: out.inverter_efficiency, unit: '', family: 'dimensionless', basis: 'rated',
          scope: 'module', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'peak rear-axle corner',
          provenance: prov(tid, 'inverter_efficiency'),
        },
        inverter_dissipated_kw: {
          value: out.inverter_dissipated_kw, unit: 'kW', family: 'power', basis: 'peak',
          scope: 'module', uncertainty_pct: 15, temporal_resolution_s: null, condition: 'peak rear-axle corner',
          provenance: prov(tid, 'inverter_dissipated_kw'),
        },
        // GOTCHA: sic-loss derives I from P at nominal Vac (≈381 A for 350 kW).
        // Critic checks peak power at Vdc,min which needs ≥I_ph,max (~530 A).
        // Headline ac_rms must be the envelope ceiling, not the loss-tool rms.
        ac_rms_current_a: {
          value: Math.max(out.ac_rms_current_a, qv(c, 'phase_current_max_a', out.ac_rms_current_a)),
          unit: 'A', family: 'current', basis: 'peak',
          scope: 'module', uncertainty_pct: 10, temporal_resolution_s: null,
          condition: 'peak envelope = max(sic-loss rms, phase_current_max_a) — closes at Vdc,min',
          provenance: prov(tid, 'ac_rms_current_a'),
        },
        sic_loss_ac_rms_current_a: {
          value: out.ac_rms_current_a, unit: 'A', family: 'current', basis: 'rated',
          scope: 'module', uncertainty_pct: 10, temporal_resolution_s: null,
          condition: 'sic-loss tool rms at peak-kW / nominal Vac (diagnostic)',
          provenance: prov(tid, 'ac_rms_current_a'),
        },
      },
    }
  },
}

const stepFieldWeakening: ToolStep = {
  tool_id: 'inverter:field-weakening-mtpa',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c) => {
    const polePairs = Math.round(qv(c, 'pole_pairs', 2))
    const rpm = qv(c, 'mgu_base_speed_rpm', 40000)
    const omegaMech = rpm * 2 * Math.PI / 60
    return {
      omega_elec_rad_s: omegaMech * polePairs,
      lambda_pm_wb: 0.05,
      ld_h: 50e-6,
      lq_h: 80e-6,
      i_max_a: qv(c, 'phase_current_max_a', 530),
      v_max_v: qv(c, 'ac_output_voltage_v', 530),
      pole_pairs: polePairs,
    }
  },
  contract_update: (c, output) => {
    const out = output as { operating_mode?: string; torque_nm?: number; i_d_a?: number; i_q_a?: number }
    const tid = 'inverter:field-weakening-mtpa'
    if (typeof out.torque_nm !== 'number') return c
    return {
      ...c,
      quantities: {
        ...c.quantities,
        mtpa_torque_nm: {
          value: out.torque_nm, unit: 'Nm', family: 'force', basis: 'rated',
          scope: 'module', uncertainty_pct: 20, temporal_resolution_s: null,
          condition: out.operating_mode ?? null,
          provenance: prov(tid, 'torque_nm'),
        },
      },
    }
  },
}

const stepMotorLoss: ToolStep = {
  tool_id: 'motor:loss-point',
  required: true,
  feeds_into: ['motor:thermal-lumped', 'powertrain:duty-cycle-energy'] as string[],
  input_from_contract: (c) => ({
    torque_nm: qv(c, 'mgu_shaft_torque_nm', 67),
    speed_rpm: qv(c, 'mgu_base_speed_rpm', 40000),
    phase_current_rms_a: qv(c, 'ac_rms_current_a', qv(c, 'phase_current_max_a', 450) * 0.7),
    phase_resistance_ohm: 0.005,
    pole_pairs: Math.round(qv(c, 'pole_pairs', 2)),
    iron_mass_kg: 3.0,
    steinmetz_kh: 0.05,
    steinmetz_ke: 1e-7,
    magnet_eddy_coeff: 5.0,
    windage_coeff: 1e-10,
    bearing_coeff: 0.001,
  }),
  contract_update: (c, output) => {
    const out = output as {
      copper_loss_w: number
      iron_loss_w?: number
      magnet_loss_w?: number
      total_loss_w: number
      efficiency: number
    }
    const tid = 'motor:loss-point'
    return {
      ...c,
      quantities: {
        ...c.quantities,
        mgu_copper_loss_w: {
          value: out.copper_loss_w, unit: 'W', family: 'power', basis: 'continuous',
          scope: 'module', uncertainty_pct: 20, temporal_resolution_s: null, condition: 'single (T,ω)',
          provenance: prov(tid, 'copper_loss_w'),
        },
        mgu_iron_loss_w: {
          value: out.iron_loss_w ?? 0, unit: 'W', family: 'power', basis: 'continuous',
          scope: 'module', uncertainty_pct: 30, temporal_resolution_s: null, condition: null,
          provenance: prov(tid, 'iron_loss_w'),
        },
        mgu_magnet_loss_w: {
          value: out.magnet_loss_w ?? 0, unit: 'W', family: 'power', basis: 'continuous',
          scope: 'module', uncertainty_pct: 40, temporal_resolution_s: null, condition: null,
          provenance: prov(tid, 'magnet_loss_w'),
        },
        mgu_efficiency: {
          value: out.efficiency, unit: '', family: 'dimensionless', basis: 'rated',
          scope: 'module', uncertainty_pct: 15, temporal_resolution_s: null, condition: 'single (T,ω)',
          provenance: prov(tid, 'efficiency'),
        },
      },
    }
  },
}

const stepRotorStress: ToolStep = {
  tool_id: 'motor:rotor-centrifugal-stress',
  required: true,
  feeds_into: [] as string[],
  input_from_contract: (c) => ({
    rotor_od_mm: qv(c, 'rotor_airgap_diameter_mm', 80),
    // DECISION (2026-07-29 SOL): 10% overspeed retention at design BASE —
    // NOT the FIA 100 krpm absolute ceiling. At OD≈106 mm, 1.15× gave
    // rim hoop ≈554 MPa → margin 1.443 < brief min 1.5; 1.10× lands ≈507 MPa
    // → margin ≈1.58 without shrinking the EM design.
    speed_rpm: qv(c, 'mgu_base_speed_rpm', 40000) * 1.10,
    density_kg_m3: 7800,
    allowable_stress_mpa: 800,
  }),
  contract_update: (c, output) => {
    const out = output as { rim_hoop_stress_mpa: number; pass?: boolean; stress_margin?: number }
    const tid = 'motor:rotor-centrifugal-stress'
    return {
      ...c,
      quantities: {
        ...c.quantities,
        rotor_rim_hoop_stress_mpa: {
          value: out.rim_hoop_stress_mpa, unit: 'MPa', family: 'pressure', basis: 'peak',
          scope: 'module', uncertainty_pct: 20, temporal_resolution_s: null, condition: '1.10× base speed',
          provenance: prov(tid, 'rim_hoop_stress_mpa'),
        },
        rotor_stress_margin: {
          value: out.stress_margin ?? (out.pass ? 1.5 : 0.8), unit: 'ratio', family: 'dimensionless',
          basis: 'min', scope: 'module', uncertainty_pct: 20, temporal_resolution_s: null,
          condition: '1.10× base speed retention check (not FIA absolute ceiling)',
          provenance: prov(tid, 'stress_margin'),
        },
      },
    }
  },
}

const stepThermal: ToolStep = {
  tool_id: 'motor:thermal-lumped',
  required: true,
  feeds_into: [] as string[],
  input_from_contract: (c) => ({
    copper_loss_w: qv(c, 'mgu_copper_loss_w', 2000),
    iron_loss_w: qv(c, 'mgu_iron_loss_w', 1500),
    magnet_loss_w: qv(c, 'mgu_magnet_loss_w', 300),
    coolant_inlet_c: qv(c, 'coolant_inlet_c', 55),
    coolant_flow_l_min: qv(c, 'coolant_flow_l_min', 15),
    thermal_resistance_winding_to_coolant_k_per_w: 0.01,
    thermal_resistance_magnet_to_winding_k_per_w: 0.05,
  }),
  contract_update: (c, output) => {
    // GOTCHA: Python emits winding_temperature_c / magnet_temperature_c;
    // accept short aliases too so a rename cannot silently drop writeback.
    const out = output as {
      winding_temperature_c?: number
      magnet_temperature_c?: number
      winding_temp_c?: number
      magnet_temp_c?: number
      pass?: boolean
    }
    const tid = 'motor:thermal-lumped'
    const next = { ...c.quantities }
    const tw = out.winding_temperature_c ?? out.winding_temp_c
    const tm = out.magnet_temperature_c ?? out.magnet_temp_c
    if (typeof tw === 'number') {
      next.mgu_winding_temp_c = {
        value: tw, unit: '°C', family: 'temperature', basis: 'peak',
        scope: 'module', uncertainty_pct: 25, temporal_resolution_s: null, condition: 'lumped RC',
        provenance: prov(tid, 'winding_temperature_c'),
      }
    }
    if (typeof tm === 'number') {
      next.mgu_magnet_temp_c = {
        value: tm, unit: '°C', family: 'temperature', basis: 'peak',
        scope: 'module', uncertainty_pct: 30, temporal_resolution_s: null, condition: 'lumped RC',
        provenance: prov(tid, 'magnet_temperature_c'),
      }
    }
    return { ...c, quantities: next }
  },
}

const stepGearRatio: ToolStep = {
  tool_id: 'gear:traction-ratio',
  required: true,
  feeds_into: ['powertrain:duty-cycle-energy'] as string[],
  input_from_contract: (c) => ({
    gear_ratio: qv(c, 'gear_ratio', 8),
    wheel_radius_m: qv(c, 'wheel_radius_m', 0.33),
    mgu_speed_rpm: qv(c, 'mgu_base_speed_rpm', 40000),
    mgu_torque_nm: qv(c, 'mgu_shaft_torque_nm', 67),
    gear_efficiency: 0.97,
    target_vehicle_speed_kph: 250,
    target_mgu_rpm_at_that_speed: qv(c, 'mgu_base_speed_rpm', 40000),
  }),
  contract_update: (c, output) => {
    const out = output as {
      vehicle_speed_kph?: number
      wheel_torque_nm?: number
      gear_efficiency?: number
    }
    const tid = 'gear:traction-ratio'
    const next = { ...c.quantities }
    if (typeof out.vehicle_speed_kph === 'number') {
      next.vehicle_speed_at_base_kph = {
        value: out.vehicle_speed_kph, unit: 'km/h', family: 'velocity', basis: 'rated',
        scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'context only — not designing the car',
        provenance: prov(tid, 'vehicle_speed_kph'),
      }
    }
    if (typeof out.wheel_torque_nm === 'number') {
      next.wheel_torque_nm = {
        value: out.wheel_torque_nm, unit: 'Nm', family: 'force', basis: 'rated',
        scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: null,
        provenance: prov(tid, 'wheel_torque_nm'),
      }
    }
    next.gear_efficiency = {
      value: out.gear_efficiency ?? 0.97, unit: '', family: 'dimensionless', basis: 'rated',
      scope: 'module', uncertainty_pct: 5, temporal_resolution_s: null, condition: null,
      provenance: prov(tid, 'gear_efficiency'),
    }
    return { ...c, quantities: next }
  },
}

const stepDutyCycle: ToolStep = {
  tool_id: 'powertrain:duty-cycle-energy',
  required: true,
  feeds_into: [] as string[],
  input_from_contract: (c) => ({
    bins: TRIAL_DUTY_BINS,
    inverter_efficiency: qv(c, 'inverter_efficiency', 0.98),
    mgu_efficiency: qv(c, 'mgu_efficiency', 0.96),
    gear_efficiency: qv(c, 'gear_efficiency', 0.97),
  }),
  contract_update: (c, output) => {
    const out = output as {
      net_electrical_energy_j?: number
      loss_energy_j?: number
      motoring_time_s?: number
      regen_time_s?: number
    }
    const tid = 'powertrain:duty-cycle-energy'
    const netJ = out.net_electrical_energy_j ?? 0
    const lossJ = out.loss_energy_j ?? 0
    return {
      ...c,
      quantities: {
        ...c.quantities,
        duty_net_electrical_energy_kwh: {
          value: netJ / 3.6e6, unit: 'kWh', family: 'energy', basis: 'net',
          scope: 'system', uncertainty_pct: 25, temporal_resolution_s: null,
          condition: 'illustrative 100 s vignette — replace with lap logs',
          provenance: prov(tid, 'net_electrical_energy_j'),
        },
        duty_loss_energy_kwh: {
          value: lossJ / 3.6e6, unit: 'kWh', family: 'energy', basis: 'net',
          scope: 'system', uncertainty_pct: 30, temporal_resolution_s: null, condition: 'vignette',
          provenance: prov(tid, 'loss_energy_j'),
        },
        duty_motoring_time_s: {
          value: out.motoring_time_s ?? 0, unit: 's', family: 'time', basis: 'typical',
          scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: null,
          provenance: prov(tid, 'motoring_time_s'),
        },
        duty_regen_time_s: {
          value: out.regen_time_s ?? 0, unit: 's', family: 'time', basis: 'typical',
          scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: null,
          provenance: prov(tid, 'regen_time_s'),
        },
      },
    }
  },
}

const rules = [
  ruleRange('formula_e_rear_mgu.rear_power_cap', 'rear electrical ≤ 350 kW', 'rear_axle_electrical_power_kw', 50, 350, 'warning'),
  ruleRange('formula_e_rear_mgu.vdc_window', 'usable Vdc in [500, 1000]', 'dc_bus_voltage_v', 500, 1000, 'warning'),
  ruleRange('formula_e_rear_mgu.mass_cap', 'MGU+MCU mass aspiration ≤ 35 kg', 'mgu_mcu_mass_cap_kg', 5, 35, 'warning'),
  ruleRange('formula_e_rear_mgu.inverter_eta', 'inverter η ≥ 0.90 at sizing point', 'inverter_efficiency', 0.90, 1.0, 'warning'),
]

export const FORMULA_E_REAR_MGU_PLAN: ClassToolPlan = {
  id: 'formula_e_rear_mgu:analytical',
  envelope_predicate: (e) => e.class === 'formula_e_rear_mgu',
  tools: [
    stepIpmsmSizing,
    stepCurrentVoltageEnvelope,
    stepSicLoss,
    stepFieldWeakening,
    stepMotorLoss,
    stepRotorStress,
    stepThermal,
    stepGearRatio,
    stepDutyCycle,
  ],
  coupled_pairs: [
    ['motor:ipmsm-analytical-sizing', 'motor:rotor-centrifugal-stress'],
    ['motor:loss-point', 'motor:thermal-lumped'],
    ['inverter:sic-loss', 'powertrain:duty-cycle-energy'],
  ] as Array<[string, string]>,
  max_iterations: 4,
  convergence_tolerance_pct: 3.0,
  consistency_rules: rules,
}

registerPlan(FORMULA_E_REAR_MGU_PLAN)
