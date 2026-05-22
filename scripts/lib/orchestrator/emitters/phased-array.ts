/**
 * scripts/lib/orchestrator/emitters/phased-array.ts
 *
 * Deterministic structural emitter for phased_array class (electronically-
 * steered flat-panel RF antenna).
 *
 * Reference systems: Kymeta U8 / ALL.SPACE Smart Hub Terminal /
 * SatixFy Sxr5-class commercial phased-array terminal.
 *
 * Modules (10):
 *  1.  rf_aperture_elements          (array of patch antenna elements)
 *  2.  beamforming_network           (analog/digital beamforming ICs)
 *  3.  transmit_receive_modules      (TRX module per element)
 *  4.  power_amplifier_array         (GaN MMIC array)
 *  5.  controller_FPGA               (beamforming controller FPGA)
 *  6.  calibration_loop              (mutual coupling calibration network)
 *  7.  thermal_management            (liquid cold-plate + chassis fans)
 *  8.  dc_power_supply               (high-current DC supply for PAs)
 *  9.  enclosure_radome              (RF-transparent radome + housing)
 * 10.  comms_interface               (Ethernet + 10 Gbps optical backhaul)
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

function fmt(n: number): string {
  if (Number.isInteger(n)) return `×${n}`
  return `×${n.toFixed(2)}`
}

interface PaParams {
  numElements: number
  frequencyGhz: number
  scanAngleDeg: number
  eirpDbw: number
  apertureM2: number
  arrayGainDbi: number
  beamwidthDeg: number
  sidelobeLevelDb: number
  thermalRejectionW: number
  shieldingDb: number
  totalMassKg: number
}

function deriveParams(c: ContractInProgress): PaParams {
  return {
    numElements: Math.max(4, Math.round(q(c, 'num_elements', 256))),
    frequencyGhz: q(c, 'operating_frequency_ghz', 28),
    scanAngleDeg: q(c, 'scan_angle_max_deg', 60),
    eirpDbw: q(c, 'eirp_dbw', 40),
    apertureM2: q(c, 'aperture_area_m2', 0.25),
    arrayGainDbi: q(c, 'array_gain_dbi', 25),
    beamwidthDeg: q(c, 'beamwidth_deg', 2.0),
    sidelobeLevelDb: q(c, 'sidelobe_level_db', -22),
    thermalRejectionW: q(c, 'thermal_rejection_min_w', 150),
    shieldingDb: q(c, 'shielding_db', 40),
    totalMassKg: q(c, 'total_system_mass_kg', 18),
  }
}

// ---------------------------------------------------------------------------
// MODULES
// ---------------------------------------------------------------------------

function emitRfApertureElements(p: PaParams): DesignModule {
  return {
    module: 'rf_aperture_elements',
    module_brief: `${p.numElements}-element microstrip patch array @ ${p.frequencyGhz.toFixed(1)} GHz, λ/2 spacing, ${p.apertureM2.toFixed(2)} m² aperture.`,
    overview_paragraph_en: '',
    derived_parameters: { num_elements: p.numElements, aperture_m2: p.apertureM2, frequency_ghz: p.frequencyGhz },
    allowed_radicals: ['electromagnetic_radiation_function', 'copper', 'pcb_substrate'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'patch_array',
        name_human: 'patch array',
        rad_syntax: `microstrip_patch_element (${fmt(p.numElements)}, Cu/Rogers) ⊙ feed_via (${fmt(p.numElements)})`,
        role_verb: 'radiates',
        topology_clause: `${p.numElements} patches on multilayer Rogers RO4350B`,
        english_sentence: '',
        words: [
          {
            id: 'microstrip_patch_word',
            name_human: 'microstrip patch element',
            content_character: { character_id: 'microstrip_patch_element', name_human: 'microstrip patch element', function_radical_primary: 'electromagnetic_radiation_function', material_radical_primary: 'copper' },
            modifier_characters: [
              { kind: 'quantity', value: fmt(p.numElements) },
              { kind: 'dimension', value: String(p.frequencyGhz), unit: 'GHz centre' },
              { kind: 'form', value: 'square Cu patch on Rogers RO4350B' },
            ],
          },
          {
            id: 'feed_via_word',
            name_human: 'feed via',
            content_character: { character_id: 'feed_via', name_human: 'feed via', function_radical_primary: 'electrical_conducting_function', material_radical_primary: 'copper' },
            modifier_characters: [
              { kind: 'quantity', value: fmt(p.numElements) },
              { kind: 'form', value: '0.2 mm plated through-hole' },
            ],
          },
        ],
      },
    ],
  }
}

function emitBeamformingNetwork(p: PaParams): DesignModule {
  const beamformerCount = Math.ceil(p.numElements / 16)
  return {
    module: 'beamforming_network',
    module_brief: `${beamformerCount}× 16-channel Anokiwave AWMF-0156 beamforming ICs with 4-bit phase + 5-bit gain control.`,
    overview_paragraph_en: '',
    derived_parameters: { beamformer_ic_count: beamformerCount, channels_per_ic: 16 },
    allowed_radicals: ['silicon_semiconductor_function', 'digital_logic_function'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'beamformer_ic_set',
        name_human: 'beamformer IC set',
        rad_syntax: `anokiwave_awmf_0156 (${fmt(beamformerCount)}, 16ch, 28GHz)`,
        role_verb: 'phases',
        topology_clause: '16-channel beamformer ICs tile the array',
        english_sentence: '',
        words: [
          {
            id: 'beamformer_ic_word',
            name_human: 'beamformer IC',
            content_character: { character_id: 'anokiwave_awmf_0156', name_human: 'Anokiwave AWMF-0156 beamformer', function_radical_primary: 'silicon_semiconductor_function', material_radical_primary: 'polymer_thermoplastic' },
            modifier_characters: [
              { kind: 'quantity', value: fmt(beamformerCount) },
              { kind: 'form', value: 'SiGe BiCMOS beamformer IC' },
              { kind: 'dimension', value: '16', unit: 'channels' },
            ],
          },
        ],
      },
    ],
  }
}

function emitTransmitReceiveModules(p: PaParams): DesignModule {
  return {
    module: 'transmit_receive_modules',
    module_brief: `${p.numElements} per-element T/R modules with SP4T switch + LNA + DPA structure.`,
    overview_paragraph_en: '',
    derived_parameters: { trx_module_count: p.numElements },
    allowed_radicals: ['silicon_semiconductor_function', 'gallium_arsenide', 'gallium_nitride'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'trx_module_set',
        name_human: 'T/R module set',
        rad_syntax: `trx_module_per_element (${fmt(p.numElements)}, GaN PA + GaAs LNA + SP4T)`,
        role_verb: 'switches',
        topology_clause: 'per-element T/R duplexed via SP4T',
        english_sentence: '',
        words: [
          {
            id: 'trx_module_word',
            name_human: 'T/R module',
            content_character: { character_id: 'trx_module_per_element', name_human: 'T/R module', function_radical_primary: 'silicon_semiconductor_function', material_radical_primary: 'gallium_arsenide' },
            modifier_characters: [
              { kind: 'quantity', value: fmt(p.numElements) },
              { kind: 'form', value: 'integrated GaN PA + GaAs LNA + SP4T' },
            ],
          },
        ],
      },
    ],
  }
}

function emitPowerAmplifierArray(p: PaParams): DesignModule {
  const paCount = p.numElements
  return {
    module: 'power_amplifier_array',
    module_brief: `${paCount}× Qorvo TGA2624 GaN MMIC power amplifier (~250 mW per element).`,
    overview_paragraph_en: '',
    derived_parameters: { pa_count: paCount },
    allowed_radicals: ['silicon_semiconductor_function', 'gallium_nitride'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'pa_set',
        name_human: 'power amplifier set',
        rad_syntax: `qorvo_tga2624_pa (${fmt(paCount)}, GaN HEMT, 28GHz)`,
        role_verb: 'amplifies',
        topology_clause: 'per-element GaN PA driven by beamformer IC',
        english_sentence: '',
        words: [
          {
            id: 'qorvo_tga2624_word',
            name_human: 'Qorvo TGA2624 PA',
            content_character: { character_id: 'qorvo_tga2624_pa', name_human: 'Qorvo TGA2624 PA', function_radical_primary: 'silicon_semiconductor_function', material_radical_primary: 'gallium_nitride' },
            modifier_characters: [
              { kind: 'quantity', value: fmt(paCount) },
              { kind: 'form', value: 'GaN HEMT power MMIC' },
              { kind: 'capacity', value: '250', unit: 'mW typical' },
            ],
          },
        ],
      },
    ],
  }
}

function emitControllerFPGA(_p: PaParams): DesignModule {
  return {
    module: 'controller_FPGA',
    module_brief: 'Xilinx Zynq UltraScale+ MPSoC controller running beamforming firmware + telemetry.',
    overview_paragraph_en: '',
    derived_parameters: { fpga_count: 1 },
    allowed_radicals: ['silicon_semiconductor_function', 'digital_logic_function'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'zynq_controller',
        name_human: 'Zynq controller',
        rad_syntax: 'zynq_ultrascale_mpsoc (×1) ⊙ ddr4_ram (×2, 4GB)',
        role_verb: 'controls',
        topology_clause: 'PS+PL configuration, beamforming over AXI',
        english_sentence: '',
        words: [
          {
            id: 'zynq_word',
            name_human: 'Zynq UltraScale+',
            content_character: { character_id: 'zynq_ultrascale_mpsoc', name_human: 'Zynq UltraScale+ MPSoC', function_radical_primary: 'silicon_semiconductor_function', material_radical_primary: 'polymer_thermoplastic' },
            modifier_characters: [
              { kind: 'quantity', value: '×1' },
              { kind: 'form', value: 'Xilinx XCZU9EG' },
              { kind: 'regulatory', value: 'CE / FCC Part 15B' },
            ],
          },
        ],
      },
    ],
  }
}

function emitCalibrationLoop(_p: PaParams): DesignModule {
  return {
    module: 'calibration_loop',
    module_brief: 'On-chip mutual coupling calibration network with reference test signal injection.',
    overview_paragraph_en: '',
    derived_parameters: { calibration_channels: 4 },
    allowed_radicals: ['electromagnetic_radiation_function', 'copper', 'silicon_semiconductor_function'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'cal_network',
        name_human: 'calibration network',
        rad_syntax: 'reference_signal_oscillator (×1) ⊙ coupling_network_pcb (×1) ⊙ cal_receiver (×4)',
        role_verb: 'calibrates',
        topology_clause: 'reference oscillator + coupling probes per quadrant',
        english_sentence: '',
        words: [
          {
            id: 'reference_oscillator_word',
            name_human: 'reference oscillator',
            content_character: { character_id: 'reference_signal_oscillator', name_human: 'reference signal oscillator', function_radical_primary: 'electromagnetic_radiation_function', material_radical_primary: 'silicon_semiconductor_function' },
            modifier_characters: [
              { kind: 'quantity', value: '×1' },
              { kind: 'form', value: 'OCXO 100 MHz + PLL synthesiser' },
            ],
          },
        ],
      },
    ],
  }
}

function emitThermalManagement(p: PaParams): DesignModule {
  return {
    module: 'thermal_management',
    module_brief: `Liquid cold-plate + 2× axial fans rejecting ${p.thermalRejectionW.toFixed(0)} W from GaN PAs.`,
    overview_paragraph_en: '',
    derived_parameters: { rejection_w: p.thermalRejectionW },
    allowed_radicals: ['thermal_transfer_function', 'aluminium', 'copper'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'thermal_loop',
        name_human: 'thermal loop',
        rad_syntax: 'aluminium_cold_plate (×1) ⊙ axial_fan (×2) ⊙ thermal_interface_material (×1)',
        role_verb: 'rejects',
        topology_clause: 'GaN PAs → TIM → cold-plate → finned heat-sink → fans',
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

function emitDcPowerSupply(p: PaParams): DesignModule {
  return {
    module: 'dc_power_supply',
    module_brief: `350 W DC supply (28V → 5V/12V buck) feeding ${p.numElements} TRX modules.`,
    overview_paragraph_en: '',
    derived_parameters: { dc_supply_w: 350 },
    allowed_radicals: ['silicon_semiconductor_function', 'electrical_conducting_function'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'psu_module',
        name_human: 'PSU module',
        rad_syntax: 'isolated_dcdc_brick (×2, 28V/12V/5V) ⊙ pol_regulator (×8)',
        role_verb: 'powers',
        topology_clause: '28V battery → DC-DC bricks → POL regulators per ASIC',
        english_sentence: '',
        words: [
          {
            id: 'dcdc_brick_word',
            name_human: 'DC-DC brick',
            content_character: { character_id: 'isolated_dcdc_brick', name_human: 'isolated DC-DC brick', function_radical_primary: 'silicon_semiconductor_function', material_radical_primary: 'polymer_thermoplastic' },
            modifier_characters: [
              { kind: 'quantity', value: '×2' },
              { kind: 'form', value: 'Vicor DCM3623 brick' },
              { kind: 'capacity', value: '350', unit: 'W' },
            ],
          },
        ],
      },
    ],
  }
}

function emitEnclosureRadome(p: PaParams): DesignModule {
  return {
    module: 'enclosure_radome',
    module_brief: `RF-transparent radome + aluminium housing, IP65 sealed, ${p.shieldingDb.toFixed(0)} dB EMI shielding.`,
    overview_paragraph_en: '',
    derived_parameters: { shielding_db: p.shieldingDb },
    allowed_radicals: ['mechanical_function', 'polymer_thermoplastic', 'aluminium'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'radome_assembly',
        name_human: 'radome assembly',
        rad_syntax: `tpu_radome (×1, 28GHz) ⊙ aluminium_chassis (×1, IP65) ⊙ rf_gasket (×1)`,
        role_verb: 'protects',
        topology_clause: 'TPU radome bonded to Al chassis with IP65 gasket',
        english_sentence: '',
        words: [
          {
            id: 'tpu_radome_word',
            name_human: 'TPU radome',
            content_character: { character_id: 'tpu_radome', name_human: 'TPU radome', function_radical_primary: 'mechanical_function', material_radical_primary: 'polymer_thermoplastic' },
            modifier_characters: [
              { kind: 'quantity', value: '×1' },
              { kind: 'form', value: 'thermoplastic polyurethane' },
              { kind: 'dimension', value: String(p.frequencyGhz), unit: 'GHz tuned' },
            ],
          },
        ],
      },
    ],
  }
}

function emitCommsInterface(_p: PaParams): DesignModule {
  return {
    module: 'comms_interface',
    module_brief: '10 GbE optical SFP+ backhaul + RJ45 management + RS-485 BIT interface.',
    overview_paragraph_en: '',
    derived_parameters: { ethernet_gbps: 10 },
    allowed_radicals: ['electrical_conducting_function', 'silica_glass', 'digital_logic_function'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'comms_port_set',
        name_human: 'comms port set',
        rad_syntax: 'sfp_plus_optical_module (×1, 10G) ⊙ rj45_eth_port (×1) ⊙ rs485_bit_port (×1)',
        role_verb: 'connects',
        topology_clause: 'backhaul + management + BIT ports',
        english_sentence: '',
        words: [
          {
            id: 'sfp_plus_word',
            name_human: 'SFP+',
            content_character: { character_id: 'sfp_plus_optical_module', name_human: 'SFP+ optical module', function_radical_primary: 'optical_sensing_function', material_radical_primary: 'silica_glass' },
            modifier_characters: [
              { kind: 'quantity', value: '×1' },
              { kind: 'capacity', value: '10', unit: 'Gbps' },
              { kind: 'form', value: '10GBASE-SR LC' },
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

function emitCrossModuleGrammarLinks(_p: PaParams): Array<{ from_module: string; to_module: string; mechanism: string; type: 'mutual' | 'directional'; detail?: string }> {
  return [
    { from_module: 'rf_aperture_elements', to_module: 'transmit_receive_modules', mechanism: 'rf_path', type: 'mutual', detail: 'per-element T/R' },
    { from_module: 'transmit_receive_modules', to_module: 'power_amplifier_array', mechanism: 'rf_path', type: 'directional', detail: 'PA before TX antenna port' },
    { from_module: 'beamforming_network', to_module: 'transmit_receive_modules', mechanism: 'rf_control', type: 'directional', detail: 'beamformer IC sets phase + gain per element' },
    { from_module: 'controller_FPGA', to_module: 'beamforming_network', mechanism: 'control_bus', type: 'directional', detail: 'SPI/AXI control to beamformer ICs' },
    { from_module: 'calibration_loop', to_module: 'beamforming_network', mechanism: 'calibration_feedback', type: 'mutual', detail: 'closed-loop phase/gain calibration' },
    { from_module: 'thermal_management', to_module: 'power_amplifier_array', mechanism: 'thermal_anchor', type: 'directional', detail: 'cold-plate under PAs' },
    { from_module: 'dc_power_supply', to_module: 'power_amplifier_array', mechanism: 'electrical_power', type: 'directional', detail: 'PA drain bias' },
    { from_module: 'dc_power_supply', to_module: 'controller_FPGA', mechanism: 'electrical_power', type: 'directional', detail: 'FPGA core + IO' },
    { from_module: 'enclosure_radome', to_module: 'rf_aperture_elements', mechanism: 'mechanical_containment', type: 'directional', detail: 'TPU radome over array' },
    { from_module: 'comms_interface', to_module: 'controller_FPGA', mechanism: 'data_link', type: 'mutual', detail: 'SFP+ backhaul to FPGA' },
  ]
}

// ---------------------------------------------------------------------------
// PUBLIC EMITTER
// ---------------------------------------------------------------------------

const emitPhasedArrayDesign: ClassEmitter = (contract, _brief, _envelope): DesignJSON => {
  const p = deriveParams(contract)
  const modules: DesignModule[] = [
    emitRfApertureElements(p),
    emitBeamformingNetwork(p),
    emitTransmitReceiveModules(p),
    emitPowerAmplifierArray(p),
    emitControllerFPGA(p),
    emitCalibrationLoop(p),
    emitThermalManagement(p),
    emitDcPowerSupply(p),
    emitEnclosureRadome(p),
    emitCommsInterface(p),
  ]
  return {
    modules,
    cross_module_grammar_links: emitCrossModuleGrammarLinks(p),
    excluded_modules: [],
    rationale_excluded: 'All 10 modules apply to commercial flat-panel electronically-steered phased-array antennas.',
    brief_overview_prose: {
      overview_and_context: '',
      mission_statement: `Steer a ${p.beamwidthDeg.toFixed(1)}° HPBW beam over ±${p.scanAngleDeg.toFixed(0)}° at ${p.frequencyGhz.toFixed(1)} GHz with EIRP ${p.eirpDbw.toFixed(0)} dBW from a ${p.apertureM2.toFixed(2)} m² ${p.numElements}-element flat-panel array.`,
      target_customers: '',
      why_now: '',
    },
  }
}

registerAssembler('phased_array', emitPhasedArrayDesign)
