/**
 * scripts/lib/orchestrator/class-plans/phased-array.ts
 *
 * ELECTRONICALLY-STEERED FLAT-PANEL RF ANTENNA TOOL PLAN — BESS-quality 2026-05-22.
 *
 * Models a Kymeta U8 / ALL.SPACE Smart Hub-class flat-panel phased array.
 * Reference architectures:
 *   - Kymeta U8 (Ku-band, MTSAT, 50W transmit, electronically steered)
 *   - ALL.SPACE Smart Hub Terminal (Ka-band, dual-aperture, 1.5° beamwidth)
 *   - SatixFy Sxr5 (Ku-band, beamforming-IC steered, vehicular)
 *
 * Tools wired (14):
 *   1. phased-array-antenna:radiation-pattern — array factor, beamwidth, EIRP
 *   2. beamforming-codebook:dft-hybrid       — codebook size, scan loss
 *   3. calibration-imperfection:phase-gain   — quiescent calibration budget
 *   4. rf-mems-beamsteering:design           — MEMS phase shifter response
 *   5. ngspice:pcs-simulation                — RF front-end small-signal sim
 *   6. link-budget:rf                        — uplink/downlink Friis budget
 *   7. control-systems:pid-tuning            — beam steering closed loop
 *   8. thermal-envelope:ladder               — panel thermal envelope
 *   9. ht:ntu-heat-exchanger                 — heat-rejection cold-plate sizing
 *  10. enclosure-emc:margin                  — EMI margin (CE / FCC Part 15)
 *  11. mass-aggregator:envelope-check
 *  12-17. 6 universal tools
 *
 * Consistency rules (8):
 *   - phased_array.sidelobe_level_db        ≤ -20 dB
 *   - phased_array.gain_loss_db             ≤ 0.5 dB (scan loss at max scan)
 *   - phased_array.beamwidth_deg            in [0.3, 5] (HPBW)
 *   - phased_array.eirp_dbw                 ≥ 30 dBW (commercial baseline)
 *   - phased_array.calibration_residual_deg ≤ 5° (phase calibration)
 *   - phased_array.thermal_panel_drift_db   ≤ 0.5 dB across -20…+55°C
 *   - phased_array.scan_angle_max_deg       ≥ 45° (commercial expectation)
 *   - phased_array.shielding_db             ≥ 40 dB (FCC Part 15 emissions)
 */

import { registerPlan } from '../planner'
import { ruleRange, ruleQuantityRatio, ruleClosure } from '../verifier'
import type { ClassToolPlan, ContractInProgress, ToolStep } from '../types'

void ruleClosure
void ruleQuantityRatio

// ---------------------------------------------------------------------------
// TOOL STEPS
// ---------------------------------------------------------------------------

// 1. phased-array-antenna:radiation-pattern.
const stepPhasedArrayAntenna: ToolStep = {
  tool_id: 'phased-array-antenna:radiation-pattern',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    num_elements: c.quantities?.num_elements?.value ?? 256,
    element_spacing_lambda: 0.5,
    frequency_ghz: c.quantities?.operating_frequency_ghz?.value ?? 28,
    aperture_area_m2: c.quantities?.aperture_area_m2?.value ?? 0.25,
    scan_angle_deg: c.quantities?.scan_angle_max_deg?.value ?? 60,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as {
      array_gain_dbi?: number
      beamwidth_deg?: number
      sidelobe_level_db?: number
      gain_loss_at_scan_db?: number
      eirp_dbw?: number
    }
    const prov = (f: string) => ({ source: 'tool:phased-array-antenna:radiation-pattern' as const, tool_id: 'phased-array-antenna:radiation-pattern', tool_version: '1.0.0', tool_license: 'MIT' as const, tool_source_url: 'internal://forgeos/phased-array-antenna', invocation_output_field: f, duration_ms: 0 })
    const updates: Record<string, any> = {}
    if (typeof out?.array_gain_dbi === 'number') {
      updates.array_gain_dbi = { value: out.array_gain_dbi, unit: 'dBi', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'boresight, ideal calibration', provenance: prov('array_gain_dbi') }
    }
    if (typeof out?.beamwidth_deg === 'number') {
      updates.beamwidth_deg = { value: out.beamwidth_deg, unit: '°', family: 'angle', basis: 'rated', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'HPBW boresight', provenance: prov('beamwidth_deg') }
    }
    if (typeof out?.sidelobe_level_db === 'number') {
      updates.sidelobe_level_db = { value: out.sidelobe_level_db, unit: 'dB', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'peak SLL after Taylor weighting', provenance: prov('sidelobe_level_db') }
    }
    if (typeof out?.gain_loss_at_scan_db === 'number') {
      updates.gain_loss_db = { value: out.gain_loss_at_scan_db, unit: 'dB', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'at max scan angle', provenance: prov('gain_loss_at_scan_db') }
    }
    if (typeof out?.eirp_dbw === 'number') {
      updates.eirp_dbw_calc = { value: out.eirp_dbw, unit: 'dBW', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'array gain + total TX power', provenance: prov('eirp_dbw') }
    }
    // Aperture macro priced by area (£8000/m² for Ku-band, £14000/m² for Ka).
    const area = c.quantities?.aperture_area_m2?.value ?? 0.25
    const freq = c.quantities?.operating_frequency_ghz?.value ?? 28
    const pricePerM2 = freq >= 18 ? 14000 : 8000
    const apertureMacro = {
      word_name: 'phased_array_aperture',
      unit_price_gbp: pricePerM2,
      dimension_basis: 'square_metre' as const,
      dimension_value: area,
      total_gbp: pricePerM2 * area,
      source_detail: `phased-array-derived: £${pricePerM2}/m² × ${area} m² = £${(pricePerM2 * area).toLocaleString()} (PCB array @ ${freq.toFixed(1)} GHz, ${out?.array_gain_dbi?.toFixed(1) ?? '?'} dBi)`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'phased_array_aperture'),
        apertureMacro,
      ],
      quantities: { ...c.quantities, ...updates },
    }
  },
}

// 2. beamforming-codebook:dft-hybrid.
const stepBeamformingCodebook: ToolStep = {
  tool_id: 'beamforming-codebook:dft-hybrid',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    num_elements: c.quantities?.num_elements?.value ?? 256,
    scan_range_deg: c.quantities?.scan_angle_max_deg?.value ?? 60,
    quantisation_bits: 4,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { codebook_size?: number; quantisation_loss_db?: number; scan_resolution_deg?: number }
    const prov = (f: string) => ({ source: 'tool:beamforming-codebook:dft-hybrid' as const, tool_id: 'beamforming-codebook:dft-hybrid', tool_version: '1.0.0', tool_license: 'MIT' as const, tool_source_url: 'internal://forgeos/beamforming-codebook', invocation_output_field: f, duration_ms: 0 })
    const updates: Record<string, any> = {}
    if (typeof out?.codebook_size === 'number') {
      updates.codebook_size = { value: out.codebook_size, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'DFT + perturbation', provenance: prov('codebook_size') }
    }
    if (typeof out?.quantisation_loss_db === 'number') {
      updates.quantisation_loss_db = { value: out.quantisation_loss_db, unit: 'dB', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: '4-bit phase shifters', provenance: prov('quantisation_loss_db') }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// 3. calibration-imperfection:phase-gain.
const stepCalibrationImperfection: ToolStep = {
  tool_id: 'calibration-imperfection:phase-gain',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    num_elements: c.quantities?.num_elements?.value ?? 256,
    phase_rms_target_deg: c.quantities?.phase_rms_target_deg?.value ?? 5,
    gain_rms_target_db: 0.5,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { phase_residual_rms_deg?: number; gain_residual_rms_db?: number; sidelobe_inflation_db?: number }
    const prov = (f: string) => ({ source: 'tool:calibration-imperfection:phase-gain' as const, tool_id: 'calibration-imperfection:phase-gain', tool_version: '1.0.0', tool_license: 'MIT' as const, tool_source_url: 'internal://forgeos/calibration-imperfection', invocation_output_field: f, duration_ms: 0 })
    const updates: Record<string, any> = {}
    if (typeof out?.phase_residual_rms_deg === 'number') {
      updates.calibration_residual_deg = { value: out.phase_residual_rms_deg, unit: '°', family: 'angle', basis: 'rms', scope: 'system', uncertainty_pct: 15, temporal_resolution_s: null, condition: 'post quiescent calibration', provenance: prov('phase_residual_rms_deg') }
    }
    if (typeof out?.sidelobe_inflation_db === 'number') {
      updates.sidelobe_inflation_db = { value: out.sidelobe_inflation_db, unit: 'dB', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'expected SLL increase', provenance: prov('sidelobe_inflation_db') }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// 4. rf-mems-beamsteering:design.
const stepRfMemsBeamsteering: ToolStep = {
  tool_id: 'rf-mems-beamsteering:design',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    frequency_ghz: c.quantities?.operating_frequency_ghz?.value ?? 28,
    bits: 4,
    target_isolation_db: 30,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { switching_time_us?: number; insertion_loss_db?: number; isolation_db?: number; power_handling_dbm?: number }
    const prov = (f: string) => ({ source: 'tool:rf-mems-beamsteering:design' as const, tool_id: 'rf-mems-beamsteering:design', tool_version: '1.0.0', tool_license: 'MIT' as const, tool_source_url: 'internal://forgeos/rf-mems', invocation_output_field: f, duration_ms: 0 })
    const updates: Record<string, any> = {}
    if (typeof out?.switching_time_us === 'number') {
      updates.beamsteering_switching_us = { value: out.switching_time_us, unit: 'µs', family: 'time', basis: 'rated', scope: 'subassembly', uncertainty_pct: 15, temporal_resolution_s: null, condition: 'state-to-state MEMS settle', provenance: prov('switching_time_us') }
    }
    if (typeof out?.insertion_loss_db === 'number') {
      updates.beamsteering_insertion_loss_db = { value: out.insertion_loss_db, unit: 'dB', family: 'dimensionless', basis: 'rated', scope: 'subassembly', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'per phase-shifter cell', provenance: prov('insertion_loss_db') }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// 5. ngspice — RF front-end small-signal sim.
const stepNgspice: ToolStep = {
  tool_id: 'ngspice:pcs-simulation',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    rated_power_kw: 0.1,  // 100 W panel power
    dc_bus_voltage_v: 48,
    ac_output_voltage_v: 1,  // dummy — used as RF chain placeholder
    topology: 'sic_two_level' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { dc_link_ripple_pct?: number; inverter_efficiency_pct?: number }
    const prov = (f: string) => ({ source: 'tool:ngspice:pcs-simulation' as const, tool_id: 'ngspice:pcs-simulation', tool_version: '46', tool_license: 'GPL-3.0' as const, tool_source_url: 'ngspice.sourceforge.io', invocation_output_field: f, duration_ms: 0 })
    const updates: Record<string, any> = {}
    if (typeof out?.inverter_efficiency_pct === 'number') {
      updates.rf_chain_dc_efficiency_pct = { value: out.inverter_efficiency_pct, unit: '%', family: 'dimensionless', basis: 'rated', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'DC supply for power amps', provenance: prov('inverter_efficiency_pct') }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// 6. link-budget:rf — Friis budget for satellite uplink.
const stepLinkBudgetRf: ToolStep = {
  tool_id: 'link-budget:rf',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    frequency_ghz: c.quantities?.operating_frequency_ghz?.value ?? 28,
    range_km: c.quantities?.link_range_km?.value ?? 36000,  // GEO default
    tx_eirp_dbw: c.quantities?.eirp_dbw?.value ?? 40,
    rx_gt_db_k: 18,
    bandwidth_mhz: c.quantities?.bandwidth_mhz?.value ?? 100,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { received_signal_dbw?: number; cnr_db?: number; link_margin_db?: number }
    const prov = (f: string) => ({ source: 'tool:link-budget:rf' as const, tool_id: 'link-budget:rf', tool_version: '1.0.0', tool_license: 'MIT' as const, tool_source_url: 'internal://forgeos/link-budget', invocation_output_field: f, duration_ms: 0 })
    const updates: Record<string, any> = {}
    if (typeof out?.cnr_db === 'number') {
      updates.cnr_db = { value: out.cnr_db, unit: 'dB', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'clear-sky', provenance: prov('cnr_db') }
    }
    if (typeof out?.link_margin_db === 'number') {
      updates.rf_link_margin_db = { value: out.link_margin_db, unit: 'dB', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'over threshold C/N', provenance: prov('link_margin_db') }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// 7. control-systems — PID for beam steering closed loop.
const stepControlSystems: ToolStep = {
  tool_id: 'control-systems:pid-tuning',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({
    plant_time_constant_s: 0.001,
    target_setpoint_deg: 0,
    target_ripple_deg: 0.1,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { settling_time_s?: number }
    const prov = (f: string) => ({ source: 'tool:control-systems:pid-tuning' as const, tool_id: 'control-systems:pid-tuning', tool_version: '0.10.2', tool_license: 'BSD-3-Clause' as const, tool_source_url: 'python-control.org', invocation_output_field: f, duration_ms: 0 })
    const updates: Record<string, any> = {}
    if (typeof out?.settling_time_s === 'number') {
      updates.beam_steering_settling_s = { value: out.settling_time_s, unit: 's', family: 'time', basis: 'rated', scope: 'system', uncertainty_pct: 15, temporal_resolution_s: null, condition: 'closed-loop beam-pointing', provenance: prov('settling_time_s') }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// 8. thermal-envelope.
const stepThermalEnvelope: ToolStep = {
  tool_id: 'thermal-envelope:ladder',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({
    laser_dissipation_w: 0,
    electronics_dissipation_w: 150,  // 150W front-end PA dissipation
    operating_temp_max_c: 55,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { required_cooling_w?: number; max_junction_c?: number; panel_drift_db?: number }
    const prov = (f: string) => ({ source: 'tool:thermal-envelope:ladder' as const, tool_id: 'thermal-envelope:ladder', tool_version: '1.0.0', tool_license: 'MIT' as const, tool_source_url: 'internal://forgeos/thermal-envelope', invocation_output_field: f, duration_ms: 0 })
    const updates: Record<string, any> = {}
    if (typeof out?.required_cooling_w === 'number') {
      updates.thermal_rejection_min_w = { value: out.required_cooling_w, unit: 'W', family: 'power', basis: 'continuous', scope: 'system', uncertainty_pct: 15, temporal_resolution_s: null, condition: '55°C ambient', provenance: prov('required_cooling_w') }
    }
    if (typeof out?.panel_drift_db === 'number') {
      updates.thermal_panel_drift_db = { value: out.panel_drift_db, unit: 'dB', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 20, temporal_resolution_s: null, condition: 'gain drift -20…+55°C', provenance: prov('panel_drift_db') }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// 9. ht — cold-plate sizing.
const stepHtCold: ToolStep = {
  tool_id: 'ht:ntu-heat-exchanger',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    hot_side_w: c.quantities?.thermal_rejection_min_w?.value ?? 150,
    coolant_inlet_c: 25,
    coolant_outlet_target_c: 35,
    ambient_c: 55,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { area_m2?: number; ntu?: number; mass_kg?: number }
    const prov = (f: string) => ({ source: 'tool:ht:ntu-heat-exchanger' as const, tool_id: 'ht:ntu-heat-exchanger', tool_version: '1.2.0', tool_license: 'MIT' as const, tool_source_url: 'github.com/CalebBell/ht', invocation_output_field: f, duration_ms: 0 })
    const updates: Record<string, any> = {}
    if (typeof out?.area_m2 === 'number') {
      updates.cold_plate_area_m2 = { value: out.area_m2, unit: 'm²', family: 'area', basis: 'rated', scope: 'subassembly', uncertainty_pct: 15, temporal_resolution_s: null, condition: 'plate-fin Al6061', provenance: prov('area_m2') }
    }
    if (typeof out?.mass_kg === 'number') {
      updates.cold_plate_mass_kg = { value: out.mass_kg, unit: 'kg', family: 'mass', basis: 'dry', scope: 'subassembly', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'finished plate', provenance: prov('mass_kg') }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// 10. enclosure-emc.
const stepEnclosureEmc: ToolStep = {
  tool_id: 'enclosure-emc:margin',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({
    target_attenuation_db: 40,
    frequency_low_ghz: 1,
    frequency_high_ghz: 40,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { shielding_attenuation_db?: number; enclosure_mass_kg?: number }
    const prov = (f: string) => ({ source: 'tool:enclosure-emc:margin' as const, tool_id: 'enclosure-emc:margin', tool_version: '1.0.0', tool_license: 'MIT' as const, tool_source_url: 'internal://forgeos/emc', invocation_output_field: f, duration_ms: 0 })
    const updates: Record<string, any> = {}
    if (typeof out?.shielding_attenuation_db === 'number') {
      updates.shielding_db = { value: out.shielding_attenuation_db, unit: 'dB', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: '1-40 GHz, FCC Part 15', provenance: prov('shielding_attenuation_db') }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// 11. mass-aggregator.
const stepMassAggregator: ToolStep = {
  tool_id: 'mass-aggregator:envelope-check',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    aperture_mass_kg: 4,
    rfic_module_mass_kg: 6,
    cold_plate_mass_kg: c.quantities?.cold_plate_mass_kg?.value ?? 5,
    psu_mass_kg: 4,
    radome_mass_kg: 3,
    max_mass_kg_envelope: c.envelope?.max_mass_kg?.value ?? 35,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { total_system_mass_kg?: number; mass_budget_utilisation_pct?: number }
    const prov = (f: string) => ({ source: 'tool:mass-aggregator:envelope-check' as const, tool_id: 'mass-aggregator:envelope-check', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/orchestrator', invocation_output_field: f, duration_ms: 0 })
    const updates: Record<string, any> = {}
    if (typeof out?.total_system_mass_kg === 'number') {
      updates.total_system_mass_kg = { value: out.total_system_mass_kg, unit: 'kg', family: 'mass', basis: 'dry', scope: 'system', uncertainty_pct: 8, temporal_resolution_s: null, condition: 'all-up incl. radome', provenance: prov('total_system_mass_kg') }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// universal helpers
function mkUniversalStep(tool_id: string): ToolStep {
  return {
    tool_id,
    required: false,
    feeds_into: [] as string[],
    input_from_contract: (c: any) => ({ contract_quantities: c.quantities ?? {} }),
    contract_update: (c: ContractInProgress, output: any) => {
      const prov = (f: string) => ({ source: `tool:${tool_id}` as any, tool_id, invocation_output_field: f, duration_ms: 0 })
      const updates: Record<string, any> = {}
      if (output && typeof output === 'object') {
        for (const [k, v] of Object.entries(output as Record<string, unknown>)) {
          if (typeof v === 'number' && Number.isFinite(v) && !k.startsWith('_')) {
            const key = `${tool_id.replace(/[:\-]/g, '_')}__${k}`
            updates[key] = {
              value: v,
              unit: '',
              family: 'dimensionless' as const,
              basis: 'rated' as const,
              scope: 'system' as const,
              uncertainty_pct: 0,
              temporal_resolution_s: null,
              condition: null,
              provenance: prov(k),
            }
          }
        }
      }
      return { ...c, quantities: { ...c.quantities, ...updates } }
    },
  }
}

// ---------------------------------------------------------------------------
// CONSISTENCY RULES (8)
// ---------------------------------------------------------------------------

const rules = [
  ruleRange('phased_array.sidelobe_level_db', 'Peak sidelobe level ≤ -20 dB (Taylor-weighted)', 'sidelobe_level_db', -100, -20, 'warning'),
  ruleRange('phased_array.gain_loss_db', 'Scan-loss gain reduction ≤ 0.5 dB', 'gain_loss_db', 0, 0.5, 'info'),
  ruleRange('phased_array.beamwidth_deg', 'HPBW in [0.3, 5]°', 'beamwidth_deg', 0.3, 5, 'info'),
  ruleRange('phased_array.eirp_dbw', 'EIRP ≥ 30 dBW (commercial baseline)', 'eirp_dbw', 30, 100, 'warning'),
  ruleRange('phased_array.calibration_residual_deg', 'Phase calibration residual ≤ 5°', 'calibration_residual_deg', 0, 5, 'warning'),
  ruleRange('phased_array.scan_angle_max_deg', 'Max scan angle ≥ 45° (commercial expectation)', 'scan_angle_max_deg', 45, 90, 'info'),
  ruleRange('phased_array.shielding_db', 'Enclosure shielding ≥ 40 dB (FCC Part 15)', 'shielding_db', 40, 120, 'warning'),
  ruleRange('phased_array.thermal_panel_drift_db', 'Thermal gain drift ≤ 0.5 dB across -20…+55°C', 'thermal_panel_drift_db', 0, 0.5, 'info'),
]

// ---------------------------------------------------------------------------
// PLAN REGISTRATION
// ---------------------------------------------------------------------------

export const PHASED_ARRAY_PLAN: ClassToolPlan = {
  id: 'phased-array:beam-steering',
  envelope_predicate: (e) => e.class === 'phased_array',
  tools: [
    stepPhasedArrayAntenna,
    stepBeamformingCodebook,
    stepCalibrationImperfection,
    stepRfMemsBeamsteering,
    stepNgspice,
    stepLinkBudgetRf,
    stepControlSystems,
    stepThermalEnvelope,
    stepHtCold,
    stepEnclosureEmc,
    stepMassAggregator,
    mkUniversalStep('regulatory-cert-cost:lookup'),
    mkUniversalStep('lifecycle-co2:assessment'),
    mkUniversalStep('supply-chain-risk:scoring'),
    mkUniversalStep('reliability-fmea:system'),
    mkUniversalStep('cybersecurity-threat-model:stride'),
    mkUniversalStep('transport-logistics:routing'),
  ],
  coupled_pairs: [
    ['phased-array-antenna:radiation-pattern', 'calibration-imperfection:phase-gain'],
    ['beamforming-codebook:dft-hybrid', 'rf-mems-beamsteering:design'],
  ] as Array<[string, string]>,
  max_iterations: 5,
  convergence_tolerance_pct: 2.0,
  consistency_rules: rules,
}

registerPlan(PHASED_ARRAY_PLAN)
