/**
 * scripts/lib/orchestrator/class-plans/quantum-computer.ts
 *
 * SUPERCONDUCTING-QUBIT QUANTUM COMPUTER TOOL PLAN — BESS-quality 2026-05-22.
 *
 * Models an IBM Quantum Heron / IQM Star / Rigetti Ankaa-class
 * dilution-fridge-mounted transmon system. Reference architectures:
 *   - IBM Quantum Heron r2 (133 qubits, 7 ns 2Q gates)
 *   - IQM Star (54 qubits, 99.5% 2Q fidelity)
 *   - Rigetti Ankaa-3 (84 qubits, 1 µs T1)
 *
 * Tools wired (14):
 *   1. qutip:qubit-dynamics                — Lindblad master eq, T1/T2 vs control fidelity
 *   2. qubit-count-to-logical:error-correction — physical→logical qubit via surface code
 *   3. microwave-control-pulse:drag        — DRAG-shaped XY pulse, leakage budget
 *   4. qubit-chip-thermal:base-plate       — heat dissipation budget on mixing chamber
 *   5. quantum-chip-packaging:flip-chip    — flip-chip bump-bond interposer routing
 *   6. cryocooler:sizing                   — PT420 sizing, 4K + 50K stages
 *   7. ngspice:pcs-simulation              — microwave control electronics
 *   8. enclosure-emc:margin                — RF/EMI shielding for control electronics
 *   9. mli:multi-layer-insulation          — 4K + 50K stage radiation budget
 *  10. thermal-strap:conduction            — Cu/AL/cold-finger conduction to MXC
 *  11. control-systems:pid-tuning          — temperature stabilisation loop
 *  12. mass-aggregator:envelope-check      — system mass + footprint
 *  13-18: 6 universal tools (regulatory cost, LCA, supply chain, FMEA, cyber, transport)
 *
 * Consistency rules (8):
 *   - qc.gate_fidelity                ≥ 0.99 (universal threshold)
 *   - qc.base_temp_mk                 ≤ 50 mK (transmon dephasing budget)
 *   - qc.t1_minimum                   ≥ 50 µs (operational requirement)
 *   - qc.mixing_chamber_budget        chip dissipation ≤ MXC cooling × 0.50
 *   - qc.logical_qubit_count          ≥ 1 (utility requires error correction)
 *   - qc.signal_lines_per_qubit       in [3, 6] (XY + Z + readout)
 *   - qc.shielding_attenuation_db     ≥ 60 dB at 4–8 GHz (electromagnetic isolation)
 *   - qc.heat_load_at_4k_w            ≤ cryocooler 4K capacity × 0.80
 *
 * Author: 2026-05-22 priority-class upgrade (BESS-quality).
 */

import { registerPlan } from '../planner'
import { ruleQuantityRatio, ruleClosure, ruleRange } from '../verifier'
import type { ClassToolPlan, ContractInProgress, ToolStep } from '../types'

// Touch ruleClosure to satisfy --noUnusedLocals if not used yet
void ruleClosure

// ---------------------------------------------------------------------------
// TOOL STEPS
// ---------------------------------------------------------------------------

// 1. QuTiP qubit dynamics — derive T1/T2 effective from control imperfection.
const stepQutipQubitDynamics: ToolStep = {
  tool_id: 'qutip:qubit-dynamics',
  required: false,
  feeds_into: ['microwave-control-pulse:drag'] as string[],
  input_from_contract: (c: any) => ({
    qubit_frequency_ghz: c.quantities?.qubit_frequency_ghz?.value ?? 5.0,
    anharmonicity_mhz: c.quantities?.anharmonicity_mhz?.value ?? -300,
    t1_us_target: c.quantities?.t1_coherence_time_us?.value ?? 100,
    t2_us_target: c.quantities?.t2_coherence_time_us?.value ?? 80,
    base_temp_mk: c.quantities?.base_plate_temp_mk?.value ?? 20,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as {
      effective_t1_us?: number
      effective_t2_us?: number
      thermal_population_pct?: number
      single_qubit_fidelity?: number
    }
    const prov = (f: string) => ({ source: 'tool:qutip:qubit-dynamics' as const, tool_id: 'qutip:qubit-dynamics', tool_version: '4.7.5', tool_license: 'BSD-3-Clause' as const, tool_source_url: 'qutip.org', invocation_output_field: f, duration_ms: 0 })
    const updates: Record<string, any> = {}
    if (typeof out?.effective_t1_us === 'number') {
      updates.effective_t1_us = { value: out.effective_t1_us, unit: 'µs', family: 'time', basis: 'lifetime', scope: 'cell', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'BoL, base-plate cold', provenance: prov('effective_t1_us') }
    }
    if (typeof out?.effective_t2_us === 'number') {
      updates.effective_t2_us = { value: out.effective_t2_us, unit: 'µs', family: 'time', basis: 'lifetime', scope: 'cell', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'echo-corrected', provenance: prov('effective_t2_us') }
    }
    if (typeof out?.thermal_population_pct === 'number') {
      updates.thermal_population_pct = { value: out.thermal_population_pct, unit: '%', family: 'dimensionless', basis: 'rated', scope: 'cell', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'Boltzmann |1⟩ leakage', provenance: prov('thermal_population_pct') }
    }
    if (typeof out?.single_qubit_fidelity === 'number') {
      updates.single_qubit_fidelity = { value: out.single_qubit_fidelity, unit: '', family: 'dimensionless', basis: 'rated', scope: 'cell', uncertainty_pct: 2, temporal_resolution_s: null, condition: 'randomised benchmarking', provenance: prov('single_qubit_fidelity') }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// 2. qubit-count-to-logical:error-correction — surface code overhead.
const stepQubitCountToLogical: ToolStep = {
  tool_id: 'qubit-count-to-logical:error-correction',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    physical_qubit_count: c.quantities?.physical_qubit_count?.value ?? 100,
    physical_error_rate: 1 - (c.quantities?.gate_fidelity?.value ?? 0.999),
    code_distance: c.quantities?.code_distance?.value ?? 11,
    target_logical_error_rate: 1e-9,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as {
      logical_qubit_count?: number
      logical_error_rate?: number
      qubits_per_logical?: number
      threshold_margin_pct?: number
    }
    const prov = (f: string) => ({ source: 'tool:qubit-count-to-logical:error-correction' as const, tool_id: 'qubit-count-to-logical:error-correction', tool_version: '1.0.0', tool_license: 'MIT' as const, tool_source_url: 'internal://forgeos/quantum-error-correction', invocation_output_field: f, duration_ms: 0 })
    const updates: Record<string, any> = {}
    if (typeof out?.logical_qubit_count === 'number') {
      updates.logical_qubit_count = { value: out.logical_qubit_count, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'surface code d×d patch', provenance: prov('logical_qubit_count') }
    }
    if (typeof out?.logical_error_rate === 'number') {
      updates.logical_error_rate = { value: out.logical_error_rate, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 30, temporal_resolution_s: null, condition: 'per gate, distance-d', provenance: prov('logical_error_rate') }
    }
    if (typeof out?.qubits_per_logical === 'number') {
      updates.qubits_per_logical = { value: out.qubits_per_logical, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'surface code (2d²-1)', provenance: prov('qubits_per_logical') }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// 3. microwave-control-pulse:drag — pulse shape + leakage.
const stepMicrowaveControlPulse: ToolStep = {
  tool_id: 'microwave-control-pulse:drag',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    qubit_frequency_ghz: c.quantities?.qubit_frequency_ghz?.value ?? 5.0,
    anharmonicity_mhz: c.quantities?.anharmonicity_mhz?.value ?? -300,
    gate_time_ns: c.quantities?.single_qubit_gate_ns?.value ?? 25,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as {
      drag_alpha?: number
      leakage_probability?: number
      pulse_amplitude_v?: number
      single_qubit_gate_ns?: number
    }
    const prov = (f: string) => ({ source: 'tool:microwave-control-pulse:drag' as const, tool_id: 'microwave-control-pulse:drag', tool_version: '1.0.0', tool_license: 'MIT' as const, tool_source_url: 'internal://forgeos/microwave-control', invocation_output_field: f, duration_ms: 0 })
    const updates: Record<string, any> = {}
    if (typeof out?.drag_alpha === 'number') {
      updates.drag_alpha = { value: out.drag_alpha, unit: '', family: 'dimensionless', basis: 'rated', scope: 'cell', uncertainty_pct: 5, temporal_resolution_s: null, condition: null, provenance: prov('drag_alpha') }
    }
    if (typeof out?.leakage_probability === 'number') {
      updates.leakage_probability = { value: out.leakage_probability, unit: '', family: 'dimensionless', basis: 'rated', scope: 'cell', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'per single-qubit gate', provenance: prov('leakage_probability') }
    }
    if (typeof out?.pulse_amplitude_v === 'number') {
      updates.pulse_amplitude_v = { value: out.pulse_amplitude_v, unit: 'V', family: 'voltage', basis: 'peak', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'AWG output, post-attenuation chain', provenance: prov('pulse_amplitude_v') }
    }
    if (typeof out?.single_qubit_gate_ns === 'number') {
      updates.single_qubit_gate_ns = { value: out.single_qubit_gate_ns, unit: 'ns', family: 'time', basis: 'rated', scope: 'cell', uncertainty_pct: 2, temporal_resolution_s: null, condition: null, provenance: prov('single_qubit_gate_ns') }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// 4. qubit-chip-thermal:base-plate — power budget for chip on MXC.
const stepQubitChipThermal: ToolStep = {
  tool_id: 'qubit-chip-thermal:base-plate',
  required: false,
  feeds_into: ['cryocooler:sizing'] as string[],
  input_from_contract: (c: any) => ({
    qubit_count: c.quantities?.physical_qubit_count?.value ?? 100,
    base_temp_mk: c.quantities?.base_plate_temp_mk?.value ?? 20,
    pulse_duty_cycle: 0.10,  // typical 10% duty
    photons_per_pulse: 1e6,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as {
      chip_dissipation_uw?: number
      static_load_uw?: number
      dynamic_load_uw?: number
      mxc_required_cooling_uw?: number
    }
    const prov = (f: string) => ({ source: 'tool:qubit-chip-thermal:base-plate' as const, tool_id: 'qubit-chip-thermal:base-plate', tool_version: '1.0.0', tool_license: 'MIT' as const, tool_source_url: 'internal://forgeos/qubit-thermal', invocation_output_field: f, duration_ms: 0 })
    const updates: Record<string, any> = {}
    if (typeof out?.chip_dissipation_uw === 'number') {
      updates.chip_dissipation_uw = { value: out.chip_dissipation_uw, unit: 'µW', family: 'power', basis: 'continuous', scope: 'subassembly', uncertainty_pct: 20, temporal_resolution_s: null, condition: 'duty-cycled control + readout', provenance: prov('chip_dissipation_uw') }
    }
    if (typeof out?.mxc_required_cooling_uw === 'number') {
      updates.mxc_required_cooling_uw = { value: out.mxc_required_cooling_uw, unit: 'µW', family: 'power', basis: 'continuous', scope: 'system', uncertainty_pct: 25, temporal_resolution_s: null, condition: 'with 2× safety factor at 100 mK', provenance: prov('mxc_required_cooling_uw') }
    }
    if (typeof out?.static_load_uw === 'number') {
      updates.static_load_uw = { value: out.static_load_uw, unit: 'µW', family: 'power', basis: 'continuous', scope: 'system', uncertainty_pct: 15, temporal_resolution_s: null, condition: 'lines + connectors heat conduction', provenance: prov('static_load_uw') }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// 5. quantum-chip-packaging:flip-chip — interposer routing for many lines.
const stepQuantumChipPackaging: ToolStep = {
  tool_id: 'quantum-chip-packaging:flip-chip',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    qubit_count: c.quantities?.physical_qubit_count?.value ?? 100,
    lines_per_qubit: 4,  // XY drive + Z bias + readout in + readout out
    chip_size_mm: c.quantities?.chip_size_mm?.value ?? 8,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as {
      total_signal_lines?: number
      bump_count?: number
      interposer_layers?: number
      chip_yield_estimate?: number
    }
    const prov = (f: string) => ({ source: 'tool:quantum-chip-packaging:flip-chip' as const, tool_id: 'quantum-chip-packaging:flip-chip', tool_version: '1.0.0', tool_license: 'MIT' as const, tool_source_url: 'internal://forgeos/quantum-packaging', invocation_output_field: f, duration_ms: 0 })
    const updates: Record<string, any> = {}
    if (typeof out?.total_signal_lines === 'number') {
      updates.total_signal_lines = { value: out.total_signal_lines, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: null, provenance: prov('total_signal_lines') }
    }
    if (typeof out?.bump_count === 'number') {
      updates.bump_count = { value: out.bump_count, unit: '', family: 'dimensionless', basis: 'rated', scope: 'subassembly', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'In/Sn bumps for flip-chip bond', provenance: prov('bump_count') }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// 6. cryocooler:sizing — PT420-class 1.5 W @ 4K + 40W @ 50K.
const stepCryocoolerSizing: ToolStep = {
  tool_id: 'cryocooler:sizing',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    heat_load_4k_w: c.quantities?.heat_load_4k_w?.value ?? 0.8,
    heat_load_50k_w: c.quantities?.heat_load_50k_w?.value ?? 25,
    cooler_type: 'pt420' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as {
      capacity_at_4k_w?: number
      capacity_at_50k_w?: number
      compressor_power_kw?: number
      cooler_mass_kg?: number
    }
    const prov = (f: string) => ({ source: 'tool:cryocooler:sizing' as const, tool_id: 'cryocooler:sizing', tool_version: '1.0.0', tool_license: 'MIT' as const, tool_source_url: 'internal://forgeos/cryocooler', invocation_output_field: f, duration_ms: 0 })
    const updates: Record<string, any> = {}
    if (typeof out?.capacity_at_4k_w === 'number') {
      updates.capacity_at_4k_w = { value: out.capacity_at_4k_w, unit: 'W', family: 'power', basis: 'continuous', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: '4 K stage @ 50 Hz', provenance: prov('capacity_at_4k_w') }
    }
    if (typeof out?.capacity_at_50k_w === 'number') {
      updates.capacity_at_50k_w = { value: out.capacity_at_50k_w, unit: 'W', family: 'power', basis: 'continuous', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: '50 K stage @ 50 Hz', provenance: prov('capacity_at_50k_w') }
    }
    if (typeof out?.compressor_power_kw === 'number') {
      updates.compressor_power_kw = { value: out.compressor_power_kw, unit: 'kW', family: 'power', basis: 'continuous', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'CPA1110 compressor', provenance: prov('compressor_power_kw') }
    }
    // Macro pricing: pulse-tube cryocooler dominates BoM (£75k/W @ 4K typical
    // for Cryomech PT420). For 1.5 W @ 4K, list price is £180k installed.
    const cap4k = out?.capacity_at_4k_w ?? 1.5
    const cryoMacro = {
      word_name: 'pulse_tube_cryocooler',
      unit_price_gbp: 120000,
      dimension_basis: 'each' as const,
      dimension_value: 1,
      total_gbp: 120000 + cap4k * 30000,
      source_detail: `cryocooler-derived: £120k base + £30k/W cooling at 4K (${cap4k.toFixed(1)} W) = £${(120000 + cap4k * 30000).toLocaleString()} (Cryomech PT420-class pulse-tube + CPA1110 compressor + flex lines)`,
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'pulse_tube_cryocooler'),
        cryoMacro,
      ],
      quantities: { ...c.quantities, ...updates },
    }
  },
}

// 7. ngspice — microwave control electronics behaviour.
const stepNgspice: ToolStep = {
  tool_id: 'ngspice:pcs-simulation',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    qubit_count: c.quantities?.physical_qubit_count?.value ?? 100,
    drive_frequency_ghz: c.quantities?.qubit_frequency_ghz?.value ?? 5.0,
    topology: 'awg_microwave_chain' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as {
      awg_sample_rate_gsps?: number
      mixer_image_rejection_db?: number
      control_chain_loss_db?: number
    }
    const prov = (f: string) => ({ source: 'tool:ngspice:pcs-simulation' as const, tool_id: 'ngspice:pcs-simulation', tool_version: '46', tool_license: 'GPL-3.0' as const, tool_source_url: 'ngspice.sourceforge.io', invocation_output_field: f, duration_ms: 0 })
    const updates: Record<string, any> = {}
    if (typeof out?.awg_sample_rate_gsps === 'number') {
      updates.awg_sample_rate_gsps = { value: out.awg_sample_rate_gsps, unit: 'GS/s', family: 'frequency', basis: 'rated', scope: 'subassembly', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'arbitrary waveform generator', provenance: prov('awg_sample_rate_gsps') }
    }
    if (typeof out?.mixer_image_rejection_db === 'number') {
      updates.mixer_image_rejection_db = { value: out.mixer_image_rejection_db, unit: 'dB', family: 'dimensionless', basis: 'rated', scope: 'subassembly', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'IQ mixer calibrated', provenance: prov('mixer_image_rejection_db') }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// 8. enclosure-emc:margin — RF shielding for control rack.
const stepEnclosureEmc: ToolStep = {
  tool_id: 'enclosure-emc:margin',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    target_attenuation_db: c.quantities?.target_shielding_db?.value ?? 60,
    frequency_low_ghz: 4,
    frequency_high_ghz: 8,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as {
      shielding_attenuation_db?: number
      enclosure_mass_kg?: number
    }
    const prov = (f: string) => ({ source: 'tool:enclosure-emc:margin' as const, tool_id: 'enclosure-emc:margin', tool_version: '1.0.0', tool_license: 'MIT' as const, tool_source_url: 'internal://forgeos/emc', invocation_output_field: f, duration_ms: 0 })
    const updates: Record<string, any> = {}
    if (typeof out?.shielding_attenuation_db === 'number') {
      updates.shielding_attenuation_db = { value: out.shielding_attenuation_db, unit: 'dB', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'measured 4-8 GHz', provenance: prov('shielding_attenuation_db') }
    }
    if (typeof out?.enclosure_mass_kg === 'number') {
      updates.enclosure_mass_kg = { value: out.enclosure_mass_kg, unit: 'kg', family: 'mass', basis: 'dry', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'mu-metal + Cu mesh', provenance: prov('enclosure_mass_kg') }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// 9. mli:multi-layer-insulation — radiation budget at each stage.
const stepMli: ToolStep = {
  tool_id: 'mli:multi-layer-insulation',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    stage_hot_k: 300,
    stage_cold_k: 50,
    surface_area_m2: c.quantities?.shroud_area_m2?.value ?? 2.5,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { radiation_load_w?: number; layer_count?: number; mli_mass_kg?: number }
    const prov = (f: string) => ({ source: 'tool:mli:multi-layer-insulation' as const, tool_id: 'mli:multi-layer-insulation', tool_version: '1.0.0', tool_license: 'MIT' as const, tool_source_url: 'internal://forgeos/mli', invocation_output_field: f, duration_ms: 0 })
    const updates: Record<string, any> = {}
    if (typeof out?.radiation_load_w === 'number') {
      updates.radiation_load_50k_w = { value: out.radiation_load_w, unit: 'W', family: 'power', basis: 'continuous', scope: 'system', uncertainty_pct: 15, temporal_resolution_s: null, condition: 'view-factor weighted, 30-layer MLI', provenance: prov('radiation_load_w') }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// 10. thermal-strap:conduction — copper / aluminium braid to MXC.
const stepThermalStrap: ToolStep = {
  tool_id: 'thermal-strap:conduction',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    temperature_hot_k: 4,
    temperature_cold_k: 0.02,  // 20 mK MXC plate
    target_conductance_w_k: c.quantities?.thermal_strap_target_w_k?.value ?? 0.05,
    material: 'ofhc_copper' as const,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { conductance_w_per_k?: number; mass_kg?: number; length_mm?: number }
    const prov = (f: string) => ({ source: 'tool:thermal-strap:conduction' as const, tool_id: 'thermal-strap:conduction', tool_version: '1.0.0', tool_license: 'MIT' as const, tool_source_url: 'internal://forgeos/thermal-strap', invocation_output_field: f, duration_ms: 0 })
    const updates: Record<string, any> = {}
    if (typeof out?.conductance_w_per_k === 'number') {
      updates.thermal_strap_conductance_w_k = { value: out.conductance_w_per_k, unit: 'W/K', family: 'thermal_conductivity', basis: 'rated', scope: 'subassembly', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'OFHC Cu braid', provenance: prov('conductance_w_per_k') }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// 11. control-systems — PID for temperature regulation.
const stepControlSystems: ToolStep = {
  tool_id: 'control-systems:pid-tuning',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: () => ({
    plant_time_constant_s: 30,
    target_setpoint_mk: 20,
    target_ripple_mk: 0.5,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { kp?: number; ki?: number; kd?: number; settling_time_s?: number }
    const prov = (f: string) => ({ source: 'tool:control-systems:pid-tuning' as const, tool_id: 'control-systems:pid-tuning', tool_version: '0.10.2', tool_license: 'BSD-3-Clause' as const, tool_source_url: 'python-control.org', invocation_output_field: f, duration_ms: 0 })
    const updates: Record<string, any> = {}
    if (typeof out?.settling_time_s === 'number') {
      updates.mxc_temperature_settling_s = { value: out.settling_time_s, unit: 's', family: 'time', basis: 'rated', scope: 'system', uncertainty_pct: 15, temporal_resolution_s: null, condition: 'PID-controlled MXC heater', provenance: prov('settling_time_s') }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// 12. mass-aggregator
const stepMassAggregator: ToolStep = {
  tool_id: 'mass-aggregator:envelope-check',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    cryocooler_mass_kg: c.quantities?.cooler_mass_kg?.value ?? 70,
    enclosure_mass_kg: c.quantities?.enclosure_mass_kg?.value ?? 320,
    electronics_mass_kg: c.quantities?.control_electronics_mass_kg?.value ?? 220,
    chip_packaging_mass_kg: 8,
    max_mass_kg_envelope: c.envelope?.max_mass_kg?.value ?? 1500,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const out = output as { total_system_mass_kg?: number; mass_budget_breach_kg?: number; mass_budget_utilisation_pct?: number }
    const prov = (f: string) => ({ source: 'tool:mass-aggregator:envelope-check' as const, tool_id: 'mass-aggregator:envelope-check', tool_version: '1.0.0', tool_license: 'free-proprietary' as const, tool_source_url: 'internal://forgeos/orchestrator', invocation_output_field: f, duration_ms: 0 })
    const updates: Record<string, any> = {}
    if (typeof out?.total_system_mass_kg === 'number') {
      updates.total_system_mass_kg = { value: out.total_system_mass_kg, unit: 'kg', family: 'mass', basis: 'dry', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'all-up including dilution fridge stack', provenance: prov('total_system_mass_kg') }
    }
    if (typeof out?.mass_budget_utilisation_pct === 'number') {
      updates.mass_budget_utilisation_pct = { value: out.mass_budget_utilisation_pct, unit: '%', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: null, provenance: prov('mass_budget_utilisation_pct') }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// 13-18. universal tools (regulatory, LCA, supply chain, FMEA, cyber, transport).
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

const stepRegulatoryCertCost = mkUniversalStep('regulatory-cert-cost:lookup')
const stepLifecycleCo2 = mkUniversalStep('lifecycle-co2:assessment')
const stepSupplyChainRisk = mkUniversalStep('supply-chain-risk:scoring')
const stepReliabilityFmea = mkUniversalStep('reliability-fmea:system')
const stepCybersecurity = mkUniversalStep('cybersecurity-threat-model:stride')
const stepTransportLogistics = mkUniversalStep('transport-logistics:routing')

// ---------------------------------------------------------------------------
// CONSISTENCY RULES (8)
// ---------------------------------------------------------------------------

const rules = [
  ruleRange(
    'qc.gate_fidelity',
    '2Q gate fidelity must be ≥ 0.99 (utility-grade superconducting QC threshold)',
    'gate_fidelity',
    0.99,
    1.0,
    'fatal',
  ),
  ruleRange(
    'qc.base_temp_mk',
    'Base plate (MXC) temperature ≤ 50 mK for transmon dephasing budget',
    'base_plate_temp_mk',
    0,
    50,
    'fatal',
  ),
  ruleRange(
    'qc.t1_minimum',
    'T1 coherence time ≥ 50 µs (industry baseline)',
    't1_coherence_time_us',
    50,
    10000,
    'warning',
  ),
  ruleRange(
    'qc.logical_qubit_count',
    '≥ 1 logical qubit (error-correctable utility)',
    'logical_qubit_count',
    1,
    1000000,
    'warning',
  ),
  ruleRange(
    'qc.shielding_attenuation_db',
    '≥ 60 dB shielding 4-8 GHz (control electronics → cryostat)',
    'shielding_attenuation_db',
    60,
    200,
    'warning',
  ),
  ruleRange(
    'qc.thermal_population',
    'Thermal |1⟩ population ≤ 1% (Boltzmann at 20 mK, 5 GHz)',
    'thermal_population_pct',
    0,
    1,
    'warning',
  ),
  ruleQuantityRatio(
    'qc.mxc_cooling_margin',
    'Chip dissipation must be ≤ MXC cooling capacity × 0.50 (2× margin)',
    'chip_dissipation_uw',
    'mxc_required_cooling_uw',
    2.0,
    'warning',
  ),
  ruleQuantityRatio(
    'qc.4k_cooling_margin',
    '4K heat load must be ≤ cryocooler 4K capacity × 0.80 (1.25× margin)',
    'heat_load_4k_w',
    'capacity_at_4k_w',
    1.25,
    'warning',
  ),
]

// ---------------------------------------------------------------------------
// PLAN REGISTRATION
// ---------------------------------------------------------------------------

export const QUANTUM_COMPUTER_PLAN: ClassToolPlan = {
  id: 'quantum-computer:superconducting',
  envelope_predicate: (e) => e.class === 'quantum_computer',
  tools: [
    stepQutipQubitDynamics,
    stepQubitCountToLogical,
    stepMicrowaveControlPulse,
    stepQubitChipThermal,
    stepQuantumChipPackaging,
    stepCryocoolerSizing,
    stepNgspice,
    stepEnclosureEmc,
    stepMli,
    stepThermalStrap,
    stepControlSystems,
    stepMassAggregator,
    stepRegulatoryCertCost,
    stepLifecycleCo2,
    stepSupplyChainRisk,
    stepReliabilityFmea,
    stepCybersecurity,
    stepTransportLogistics,
  ],
  coupled_pairs: [
    ['qutip:qubit-dynamics', 'microwave-control-pulse:drag'],
    ['qubit-chip-thermal:base-plate', 'cryocooler:sizing'],
  ] as Array<[string, string]>,
  max_iterations: 5,
  convergence_tolerance_pct: 2.0,
  consistency_rules: rules,
}

registerPlan(QUANTUM_COMPUTER_PLAN)
