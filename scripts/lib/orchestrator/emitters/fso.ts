/**
 * scripts/lib/orchestrator/emitters/fso.ts
 *
 * Deterministic structural emitter for fso class (free-space optical
 * comms terminal, point-to-point).
 *
 * Reference systems: Mynaric CONDOR Mk3 / Cailabs TILBA-ATMO /
 * SA Photonics 100GFSO-class commercial FSO terminals.
 *
 * Modules (10):
 *  1.  optical_head_telescope        (aperture, primary + secondary mirror, fine steering mirror)
 *  2.  laser_source_modulator        (PCSEL/DFB + EAM modulator)
 *  3.  photon_detector_avalanche     (APD/coherent receiver + TIA)
 *  4.  gimbal_pointing_mechanism     (coarse 2-axis gimbal)
 *  5.  electronics_DSP               (FPGA + ASIC DSP card)
 *  6.  atmospheric_compensation_AO   (MPLC + deformable mirror)
 *  7.  thermal_management            (cold-plate + heat-pipe + fan)
 *  8.  weatherproof_enclosure        (IP65 housing + heater)
 *  9.  control_software              (acquisition / tracking / link)
 * 10.  ground_interface              (fibre patch panel + Ethernet)
 */

import { registerAssembler } from '../assembler'
import type { DesignJSON, DesignModule, ClassEmitter } from '../assembler'
import type { ContractInProgress } from '../types'

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function q(c: ContractInProgress, key: string, fallback: number): number {
  const v = c.quantities?.[key]?.value
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

interface FsoParams {
  dataRateGbps: number
  rangeKm: number
  wavelengthNm: number
  apertureMm: number
  txPowerW: number
  rxSensitivityDbm: number
  fadeMarginDb: number
  pointingJitterUrad: number
  acquisitionTimeS: number
  thermalRejectionW: number
  totalMassKg: number
}

function deriveParams(c: ContractInProgress): FsoParams {
  return {
    dataRateGbps: q(c, 'data_rate_gbps', 10),
    rangeKm: q(c, 'link_range_km', 100),
    wavelengthNm: q(c, 'wavelength_nm', 1550),
    apertureMm: q(c, 'aperture_diameter_mm', 100),
    txPowerW: q(c, 'tx_power_w', 1.0),
    rxSensitivityDbm: q(c, 'receiver_sensitivity_dbm', -40),
    fadeMarginDb: q(c, 'fade_margin_db', 10),
    pointingJitterUrad: q(c, 'pointing_jitter_urad', 3),
    acquisitionTimeS: q(c, 'acquisition_time_s', 30),
    thermalRejectionW: q(c, 'thermal_rejection_min_w', 60),
    totalMassKg: q(c, 'total_system_mass_kg', 45),
  }
}

// ---------------------------------------------------------------------------
// MODULES
// ---------------------------------------------------------------------------

function emitOpticalHeadTelescope(p: FsoParams): DesignModule {
  return {
    module: 'optical_head_telescope',
    module_brief: `${p.apertureMm} mm aperture Cassegrain with fine steering mirror + ${p.wavelengthNm} nm corrector group.`,
    overview_paragraph_en: '',
    derived_parameters: { aperture_mm: p.apertureMm, wavelength_nm: p.wavelengthNm },
    allowed_radicals: ['optical_sensing_function', 'silica_glass', 'aluminium'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'cassegrain_telescope',
        name_human: 'Cassegrain telescope',
        rad_syntax: `primary_mirror (×1, ${p.apertureMm}mm, Cu-coated) ⊙ secondary_mirror (×1) ⊙ fine_steering_mirror (×1, piezo)`,
        role_verb: 'collects',
        topology_clause: 'on-axis Cassegrain + downstream MEMS FSM',
        english_sentence: '',
        words: [
          {
            id: 'primary_mirror_word',
            name_human: 'primary mirror',
            content_character: { character_id: 'primary_mirror', name_human: 'primary mirror', function_radical_primary: 'optical_sensing_function', material_radical_primary: 'silica_glass' },
            modifier_characters: [
              { kind: 'quantity', value: '×1' },
              { kind: 'dimension', value: String(p.apertureMm), unit: 'mm dia' },
              { kind: 'form', value: 'enhanced Au-coated' },
            ],
          },
          {
            id: 'fine_steering_mirror_word',
            name_human: 'fine steering mirror',
            content_character: { character_id: 'fine_steering_mirror', name_human: 'fine steering mirror', function_radical_primary: 'mechanical_actuation_function', material_radical_primary: 'silica_glass' },
            modifier_characters: [
              { kind: 'quantity', value: '×1' },
              { kind: 'form', value: 'PI S-340 piezo tip-tilt' },
              { kind: 'dimension', value: '5', unit: 'kHz bandwidth' },
            ],
          },
        ],
      },
    ],
  }
}

function emitLaserSourceModulator(p: FsoParams): DesignModule {
  return {
    module: 'laser_source_modulator',
    module_brief: `${p.txPowerW.toFixed(1)} W PCSEL @ ${p.wavelengthNm} nm + InP EAM modulator @ ${p.dataRateGbps.toFixed(0)} Gbps.`,
    overview_paragraph_en: '',
    derived_parameters: { tx_power_w: p.txPowerW, wavelength_nm: p.wavelengthNm, data_rate_gbps: p.dataRateGbps },
    allowed_radicals: ['photonics_emission_function', 'indium_phosphide', 'silica_glass'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'laser_diode_assembly',
        name_human: 'laser diode assembly',
        rad_syntax: `pcsel_laser_diode (×1, ${p.wavelengthNm}nm, ${p.txPowerW}W) ⊙ eam_modulator (×1, ${p.dataRateGbps}Gbps)`,
        role_verb: 'emits',
        topology_clause: 'CW PCSEL → EAM modulator → boost EDFA',
        english_sentence: '',
        words: [
          {
            id: 'pcsel_laser_word',
            name_human: 'PCSEL laser',
            content_character: { character_id: 'pcsel_laser_diode', name_human: 'PCSEL laser diode', function_radical_primary: 'photonics_emission_function', material_radical_primary: 'indium_phosphide' },
            modifier_characters: [
              { kind: 'quantity', value: '×1' },
              { kind: 'dimension', value: String(p.wavelengthNm), unit: 'nm' },
              { kind: 'capacity', value: String(p.txPowerW), unit: 'W' },
              { kind: 'form', value: 'photonic-crystal surface-emitting' },
            ],
          },
          {
            id: 'eam_modulator_word',
            name_human: 'EAM modulator',
            content_character: { character_id: 'eam_modulator', name_human: 'electro-absorption modulator', function_radical_primary: 'photonics_emission_function', material_radical_primary: 'indium_phosphide' },
            modifier_characters: [
              { kind: 'quantity', value: '×1' },
              { kind: 'capacity', value: String(p.dataRateGbps), unit: 'Gbps' },
              { kind: 'form', value: 'InGaAsP InP MQW' },
            ],
          },
        ],
      },
    ],
  }
}

function emitPhotonDetectorAvalanche(p: FsoParams): DesignModule {
  return {
    module: 'photon_detector_avalanche',
    module_brief: `Coherent receiver (90° hybrid + balanced PD) ${p.rxSensitivityDbm.toFixed(0)} dBm sensitivity @ BER 1e-9.`,
    overview_paragraph_en: '',
    derived_parameters: { sensitivity_dbm: p.rxSensitivityDbm },
    allowed_radicals: ['optical_sensing_function', 'indium_gallium_arsenide', 'silica_glass'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'coherent_receiver',
        name_human: 'coherent receiver',
        rad_syntax: 'optical_hybrid_90deg (×1) ⊙ balanced_pd_pair (×2) ⊙ tia_amp (×4)',
        role_verb: 'detects',
        topology_clause: 'free-space → SMF → 90° hybrid → balanced PD',
        english_sentence: '',
        words: [
          {
            id: 'balanced_pd_word',
            name_human: 'balanced photodiode pair',
            content_character: { character_id: 'balanced_pd_pair', name_human: 'balanced photodiode pair', function_radical_primary: 'optical_sensing_function', material_radical_primary: 'indium_gallium_arsenide' },
            modifier_characters: [
              { kind: 'quantity', value: '×2' },
              { kind: 'capacity', value: '40', unit: 'GHz' },
              { kind: 'form', value: 'InGaAs PIN balanced' },
            ],
          },
        ],
      },
    ],
  }
}

function emitGimbalPointingMechanism(_p: FsoParams): DesignModule {
  return {
    module: 'gimbal_pointing_mechanism',
    module_brief: '2-axis coarse gimbal, ±90° azimuth × ±60° elevation, 30°/s slew.',
    overview_paragraph_en: '',
    derived_parameters: { az_range_deg: 180, el_range_deg: 120, slew_deg_s: 30 },
    allowed_radicals: ['mechanical_actuation_function', 'aluminium', 'steel'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'two_axis_gimbal',
        name_human: '2-axis gimbal',
        rad_syntax: 'brushless_dc_motor (×2) ⊙ harmonic_drive (×2) ⊙ optical_encoder (×2)',
        role_verb: 'points',
        topology_clause: 'azimuth + elevation gear-driven',
        english_sentence: '',
        words: [
          {
            id: 'brushless_motor_word',
            name_human: 'brushless DC motor',
            content_character: { character_id: 'brushless_dc_motor', name_human: 'brushless DC motor', function_radical_primary: 'mechanical_actuation_function', material_radical_primary: 'steel' },
            modifier_characters: [
              { kind: 'quantity', value: '×2' },
              { kind: 'form', value: 'Maxon EC-i 40' },
              { kind: 'capacity', value: '50', unit: 'W' },
            ],
          },
          {
            id: 'harmonic_drive_word',
            name_human: 'harmonic drive',
            content_character: { character_id: 'harmonic_drive', name_human: 'harmonic drive', function_radical_primary: 'mechanical_actuation_function', material_radical_primary: 'steel' },
            modifier_characters: [
              { kind: 'quantity', value: '×2' },
              { kind: 'form', value: 'Harmonic Drive CSF-25-100' },
            ],
          },
        ],
      },
    ],
  }
}

function emitElectronicsDSP(p: FsoParams): DesignModule {
  return {
    module: 'electronics_DSP',
    module_brief: `Xilinx Versal AI-Core FPGA + custom DSP ASIC for ${p.dataRateGbps.toFixed(0)} Gbps coherent demod + FEC.`,
    overview_paragraph_en: '',
    derived_parameters: { data_rate_gbps: p.dataRateGbps },
    allowed_radicals: ['silicon_semiconductor_function', 'digital_logic_function'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'dsp_card',
        name_human: 'DSP card',
        rad_syntax: 'xilinx_versal_ai_core (×1) ⊙ dsp_asic (×1)',
        role_verb: 'processes',
        topology_clause: 'ADC → DSP → FEC pipeline',
        english_sentence: '',
        words: [
          {
            id: 'xilinx_versal_word',
            name_human: 'Xilinx Versal',
            content_character: { character_id: 'xilinx_versal_ai_core', name_human: 'Xilinx Versal AI Core', function_radical_primary: 'silicon_semiconductor_function', material_radical_primary: 'polymer_thermoplastic' },
            modifier_characters: [
              { kind: 'quantity', value: '×1' },
              { kind: 'form', value: 'VCK5000 dev card' },
              { kind: 'capacity', value: '64', unit: 'Gb/s I/O' },
            ],
          },
        ],
      },
    ],
  }
}

function emitAtmosphericCompensationAO(_p: FsoParams): DesignModule {
  return {
    module: 'atmospheric_compensation_AO',
    module_brief: 'Cailabs MPLC multi-plane light conversion + 64-actuator deformable mirror.',
    overview_paragraph_en: '',
    derived_parameters: { ao_actuator_count: 64 },
    allowed_radicals: ['optical_sensing_function', 'silica_glass', 'piezo_ceramic'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'ao_assembly',
        name_human: 'AO assembly',
        rad_syntax: 'mplc_phase_plate_set (×1) ⊙ deformable_mirror (×1, 64-actuator) ⊙ wavefront_sensor (×1, SH)',
        role_verb: 'corrects',
        topology_clause: 'wavefront sensor → DM closed loop @ 1 kHz',
        english_sentence: '',
        words: [
          {
            id: 'mplc_phase_plate_word',
            name_human: 'MPLC phase plate',
            content_character: { character_id: 'mplc_phase_plate_set', name_human: 'MPLC phase plate set', function_radical_primary: 'optical_sensing_function', material_radical_primary: 'silica_glass' },
            modifier_characters: [
              { kind: 'quantity', value: '×1' },
              { kind: 'form', value: 'Cailabs TILBA-ATMO MPLC stack' },
            ],
          },
          {
            id: 'deformable_mirror_word',
            name_human: 'deformable mirror',
            content_character: { character_id: 'deformable_mirror', name_human: 'deformable mirror', function_radical_primary: 'mechanical_actuation_function', material_radical_primary: 'piezo_ceramic' },
            modifier_characters: [
              { kind: 'quantity', value: '×1' },
              { kind: 'dimension', value: '64', unit: 'actuators' },
              { kind: 'form', value: 'Boston Micromachines Multi-DM' },
            ],
          },
        ],
      },
    ],
  }
}

function emitThermalManagement(p: FsoParams): DesignModule {
  return {
    module: 'thermal_management',
    module_brief: `Cold-plate + heat-pipe + axial fan rejecting ${p.thermalRejectionW.toFixed(0)} W.`,
    overview_paragraph_en: '',
    derived_parameters: { rejection_w: p.thermalRejectionW },
    allowed_radicals: ['thermal_transfer_function', 'aluminium', 'copper'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'thermal_loop',
        name_human: 'thermal loop',
        rad_syntax: 'aluminium_cold_plate (×1) ⊙ copper_heat_pipe (×4) ⊙ axial_fan (×2)',
        role_verb: 'rejects',
        topology_clause: 'optics bench → cold-plate → heat-pipe → fin → fan',
        english_sentence: '',
        words: [
          {
            id: 'aluminium_cold_plate_word',
            name_human: 'aluminium cold plate',
            content_character: { character_id: 'aluminium_cold_plate', name_human: 'aluminium cold plate', function_radical_primary: 'thermal_transfer_function', material_radical_primary: 'aluminium' },
            modifier_characters: [
              { kind: 'quantity', value: '×1' },
              { kind: 'form', value: 'plate-fin Al6061' },
              { kind: 'capacity', value: String(p.thermalRejectionW), unit: 'W' },
            ],
          },
        ],
      },
    ],
  }
}

function emitWeatherproofEnclosure(_p: FsoParams): DesignModule {
  return {
    module: 'weatherproof_enclosure',
    module_brief: 'IP65 sealed enclosure with thermostat heater and breather valve.',
    overview_paragraph_en: '',
    derived_parameters: { ip_rating: 65 },
    allowed_radicals: ['mechanical_function', 'aluminium', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'enclosure_housing',
        name_human: 'enclosure housing',
        rad_syntax: 'aluminium_housing (×1, IP65) ⊙ thermostat_heater (×1, 50W) ⊙ breather_valve (×1)',
        role_verb: 'protects',
        topology_clause: 'IP65 sealed Al housing with humidity control',
        english_sentence: '',
        words: [
          {
            id: 'enclosure_housing_word',
            name_human: 'enclosure housing',
            content_character: { character_id: 'aluminium_housing', name_human: 'aluminium housing', function_radical_primary: 'mechanical_function', material_radical_primary: 'aluminium' },
            modifier_characters: [
              { kind: 'quantity', value: '×1' },
              { kind: 'regulatory', value: 'IP65 IEC 60529' },
              { kind: 'form', value: 'cast Al alloy' },
            ],
          },
        ],
      },
    ],
  }
}

function emitControlSoftware(_p: FsoParams): DesignModule {
  return {
    module: 'control_software',
    module_brief: 'Embedded Linux ATP pipeline: acquisition spiral, tracking PID, link management.',
    overview_paragraph_en: '',
    derived_parameters: { tasks: 4 },
    allowed_radicals: ['digital_logic_function'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'atp_pipeline',
        name_human: 'ATP pipeline',
        rad_syntax: 'embedded_linux_runtime (×1) ⊙ atp_acquisition_task (×1) ⊙ atp_tracking_pid (×1)',
        role_verb: 'orchestrates',
        topology_clause: 'real-time priority ATP loop',
        english_sentence: '',
        words: [
          {
            id: 'embedded_linux_word',
            name_human: 'embedded Linux runtime',
            content_character: { character_id: 'embedded_linux_runtime', name_human: 'embedded Linux runtime', function_radical_primary: 'digital_logic_function', material_radical_primary: null },
            modifier_characters: [
              { kind: 'quantity', value: '×1' },
              { kind: 'form', value: 'Yocto-built kernel 6.6' },
            ],
          },
        ],
      },
    ],
  }
}

function emitGroundInterface(p: FsoParams): DesignModule {
  return {
    module: 'ground_interface',
    module_brief: `Fibre patch panel + ${p.dataRateGbps.toFixed(0)} Gbps Ethernet uplink + RJ45 management.`,
    overview_paragraph_en: '',
    derived_parameters: { ethernet_gbps: p.dataRateGbps, fibre_port_count: 4 },
    allowed_radicals: ['electrical_conducting_function', 'silica_glass'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'patch_panel',
        name_human: 'patch panel',
        rad_syntax: 'lc_fibre_patch_panel (×1) ⊙ qsfp28_optical_module (×1)',
        role_verb: 'terminates',
        topology_clause: 'optical → QSFP28 → Ethernet switch',
        english_sentence: '',
        words: [
          {
            id: 'qsfp28_word',
            name_human: 'QSFP28',
            content_character: { character_id: 'qsfp28_optical_module', name_human: 'QSFP28 optical module', function_radical_primary: 'optical_sensing_function', material_radical_primary: 'silica_glass' },
            modifier_characters: [
              { kind: 'quantity', value: '×1' },
              { kind: 'capacity', value: String(p.dataRateGbps), unit: 'Gbps' },
              { kind: 'form', value: '100GBASE-LR4' },
            ],
          },
        ],
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// CROSS-MODULE GRAMMAR LINKS
// ---------------------------------------------------------------------------

function emitCrossModuleGrammarLinks(_p: FsoParams): Array<{ from_module: string; to_module: string; mechanism: string; type: 'mutual' | 'directional'; detail?: string }> {
  return [
    { from_module: 'laser_source_modulator', to_module: 'optical_head_telescope', mechanism: 'optical_path', type: 'directional', detail: 'fibre → free-space launch' },
    { from_module: 'optical_head_telescope', to_module: 'photon_detector_avalanche', mechanism: 'optical_path', type: 'directional', detail: 'rx telescope → SMF → coherent receiver' },
    { from_module: 'atmospheric_compensation_AO', to_module: 'optical_head_telescope', mechanism: 'optical_path', type: 'mutual', detail: 'AO loop in receive path' },
    { from_module: 'electronics_DSP', to_module: 'photon_detector_avalanche', mechanism: 'electrical_signal', type: 'directional', detail: 'PD ADC → DSP' },
    { from_module: 'electronics_DSP', to_module: 'laser_source_modulator', mechanism: 'electrical_signal', type: 'directional', detail: 'DSP → EAM driver' },
    { from_module: 'gimbal_pointing_mechanism', to_module: 'optical_head_telescope', mechanism: 'mechanical_mount', type: 'directional', detail: 'telescope on gimbal yoke' },
    { from_module: 'control_software', to_module: 'gimbal_pointing_mechanism', mechanism: 'control_loop', type: 'directional', detail: 'ATP commands gimbal' },
    { from_module: 'control_software', to_module: 'atmospheric_compensation_AO', mechanism: 'control_loop', type: 'directional', detail: 'AO loop closure' },
    { from_module: 'thermal_management', to_module: 'electronics_DSP', mechanism: 'thermal_anchor', type: 'directional', detail: 'cold-plate under FPGA' },
    { from_module: 'weatherproof_enclosure', to_module: 'optical_head_telescope', mechanism: 'mechanical_containment', type: 'directional', detail: 'sealed window for telescope' },
    { from_module: 'ground_interface', to_module: 'electronics_DSP', mechanism: 'data_link', type: 'mutual', detail: 'QSFP28 backhaul' },
  ]
}

// ---------------------------------------------------------------------------
// PUBLIC EMITTER
// ---------------------------------------------------------------------------

const emitFsoDesign: ClassEmitter = (contract, _brief, _envelope): DesignJSON => {
  const p = deriveParams(contract)
  const modules: DesignModule[] = [
    emitOpticalHeadTelescope(p),
    emitLaserSourceModulator(p),
    emitPhotonDetectorAvalanche(p),
    emitGimbalPointingMechanism(p),
    emitElectronicsDSP(p),
    emitAtmosphericCompensationAO(p),
    emitThermalManagement(p),
    emitWeatherproofEnclosure(p),
    emitControlSoftware(p),
    emitGroundInterface(p),
  ]
  return {
    modules,
    cross_module_grammar_links: emitCrossModuleGrammarLinks(p),
    excluded_modules: [],
    rationale_excluded: 'All 10 modules apply to commercial point-to-point FSO terminals.',
    brief_overview_prose: {
      overview_and_context: '',
      mission_statement: `Carry ${p.dataRateGbps.toFixed(0)} Gbps over ${p.rangeKm.toFixed(0)} km via ${p.wavelengthNm} nm coherent FSO with ${p.fadeMarginDb.toFixed(1)} dB fade margin and ${p.pointingJitterUrad.toFixed(1)} µrad pointing.`,
      target_customers: '',
      why_now: '',
    },
  }
}

registerAssembler('fso', emitFsoDesign)
