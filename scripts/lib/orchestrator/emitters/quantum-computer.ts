/**
 * scripts/lib/orchestrator/emitters/quantum-computer.ts
 *
 * Deterministic structural emitter for quantum_computer class.
 *
 * Reference systems: IBM Quantum Heron r2 / IQM Star / Rigetti Ankaa-3.
 * The emitter consumes the validated EngineeringContract + tool outputs
 * and produces a DesignJSON skeleton with 12 modules covering every
 * subsystem of a dilution-fridge-mounted superconducting QC:
 *
 *  1.  qubit_chip_die                  (transmon array, flip-chip bumps)
 *  2.  signal_lines_microwave          (semirigid coax + attenuators)
 *  3.  attenuator_chain                (-20/-20/-10/-10 dB per stage)
 *  4.  control_electronics_AWG         (Quantum Machines OPX1000 class)
 *  5.  dilution_fridge_interface       (mixing chamber plate mounting)
 *  6.  magnetic_shielding_assembly     (mu-metal + Cu inner)
 *  7.  EMI_shielding_enclosure         (1U rack)
 *  8.  vibration_isolation             (active + passive)
 *  9.  helium_handling                 (compressor + circulation)
 * 10.  host_classical_compute          (HPC controller + storage)
 * 11.  calibration_software            (Qiskit / IQM-cocoa)
 * 12.  regulatory_export_control       (Wassenaar / EAR)
 *
 * The LLM narrator is invoked AFTER this emitter and fills the
 * `overview_paragraph_en`, `english_sentence`, and `brief_overview_prose.*`
 * placeholders.
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

interface QcParams {
  physicalQubits: number
  logicalQubits: number
  qubitFreqGhz: number
  baseTempMk: number
  gateFidelity: number
  signalLinesPerQubit: number
  totalSignalLines: number
  chipDissipationUw: number
  mxcCoolingUw: number
  cryocoolerCapacity4kW: number
  cryocoolerCapacity50kW: number
  cooldownTimeHr: number
  t1Us: number
  totalMassKg: number
  enclosureShieldingDb: number
}

function deriveParams(c: ContractInProgress): QcParams {
  const physicalQubits = Math.max(1, Math.round(q(c, 'physical_qubit_count', 100)))
  const logicalQubits = Math.max(0, Math.round(q(c, 'logical_qubit_count', Math.floor(physicalQubits / 17))))
  const qubitFreqGhz = q(c, 'qubit_frequency_ghz', 5.0)
  const baseTempMk = q(c, 'base_plate_temp_mk', 20)
  const gateFidelity = q(c, 'gate_fidelity', 0.999)
  const signalLinesPerQubit = 4
  const totalSignalLines = physicalQubits * signalLinesPerQubit
  const chipDissipationUw = q(c, 'chip_dissipation_uw', 10)
  const mxcCoolingUw = q(c, 'mxc_required_cooling_uw', 400)
  const cryocoolerCapacity4kW = q(c, 'capacity_at_4k_w', 1.5)
  const cryocoolerCapacity50kW = q(c, 'capacity_at_50k_w', 40)
  const cooldownTimeHr = 24
  const t1Us = q(c, 't1_coherence_time_us', 100)
  const totalMassKg = q(c, 'total_system_mass_kg', 850)
  const enclosureShieldingDb = q(c, 'shielding_attenuation_db', 80)
  return {
    physicalQubits,
    logicalQubits,
    qubitFreqGhz,
    baseTempMk,
    gateFidelity,
    signalLinesPerQubit,
    totalSignalLines,
    chipDissipationUw,
    mxcCoolingUw,
    cryocoolerCapacity4kW,
    cryocoolerCapacity50kW,
    cooldownTimeHr,
    t1Us,
    totalMassKg,
    enclosureShieldingDb,
  }
}

// ---------------------------------------------------------------------------
// MODULES
// ---------------------------------------------------------------------------

function emitQubitChipDie(p: QcParams): DesignModule {
  return {
    module: 'qubit_chip_die',
    module_brief: `${p.physicalQubits}-transmon flip-chip die at ${p.qubitFreqGhz.toFixed(2)} GHz, ${(p.gateFidelity * 100).toFixed(2)}% 2Q gate fidelity, T1 = ${p.t1Us.toFixed(0)} µs.`,
    overview_paragraph_en: '',
    derived_parameters: {
      physical_qubit_count: p.physicalQubits,
      qubit_frequency_ghz: p.qubitFreqGhz,
      gate_fidelity: p.gateFidelity,
      t1_us: p.t1Us,
    },
    allowed_radicals: ['silicon_semiconductor_function', 'superconducting_function', 'aluminium', 'silicon_substrate'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'transmon_array',
        name_human: 'transmon array',
        rad_syntax: `transmon_qubit (${fmt(p.physicalQubits)}, 5GHz, Al) ⊙ flip_chip_bumps (${fmt(p.physicalQubits * 20)}, In)`,
        role_verb: 'computes',
        topology_clause: `${p.physicalQubits} fixed-frequency transmons on Si substrate`,
        english_sentence: '',
        words: [
          {
            id: 'transmon_qubit_word',
            name_human: 'transmon qubit',
            content_character: { character_id: 'transmon_qubit', name_human: 'transmon qubit', function_radical_primary: 'superconducting_function', material_radical_primary: 'aluminium' },
            modifier_characters: [
              { kind: 'quantity', value: fmt(p.physicalQubits) },
              { kind: 'dimension', value: String(p.qubitFreqGhz), unit: 'GHz' },
              { kind: 'tolerance', value: '5', unit: 'MHz' },
              { kind: 'form', value: 'fixed-frequency tunable coupler' },
            ],
          },
          {
            id: 'flip_chip_bump_word',
            name_human: 'flip-chip bump',
            content_character: { character_id: 'flip_chip_bump', name_human: 'flip-chip bump', function_radical_primary: 'electrical_conducting_function', material_radical_primary: 'indium' },
            modifier_characters: [
              { kind: 'quantity', value: fmt(p.physicalQubits * 20) },
              { kind: 'dimension', value: '25', unit: 'µm pitch' },
              { kind: 'form', value: 'In/Sn solder' },
            ],
          },
          {
            id: 'silicon_substrate_word',
            name_human: 'silicon substrate',
            content_character: { character_id: 'silicon_substrate', name_human: 'silicon substrate', function_radical_primary: 'silicon_semiconductor_function', material_radical_primary: 'silicon_substrate' },
            modifier_characters: [
              { kind: 'quantity', value: '×1' },
              { kind: 'dimension', value: '8', unit: 'mm' },
              { kind: 'form', value: 'high-resistivity Si <100>' },
            ],
          },
        ],
      },
    ],
  }
}

function emitSignalLinesMicrowave(p: QcParams): DesignModule {
  return {
    module: 'signal_lines_microwave',
    module_brief: `${p.totalSignalLines} semirigid coax lines (${p.signalLinesPerQubit}/qubit: XY drive + Z bias + readout in/out) from 300K to MXC plate.`,
    overview_paragraph_en: '',
    derived_parameters: {
      total_signal_lines: p.totalSignalLines,
      lines_per_qubit: p.signalLinesPerQubit,
    },
    allowed_radicals: ['electrical_conducting_function', 'superconducting_function', 'copper', 'niobium_titanium'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'semirigid_coax',
        name_human: 'semirigid coax',
        rad_syntax: `nbti_coax_line (${fmt(p.totalSignalLines)}, 0.085in, 4K-MXC)`,
        role_verb: 'routes',
        topology_clause: `${p.totalSignalLines} lines through 300K, 50K, 4K, still, MXC stages`,
        english_sentence: '',
        words: [
          {
            id: 'nbti_coax_word',
            name_human: 'NbTi superconducting coax',
            content_character: { character_id: 'nbti_coax_line', name_human: 'NbTi superconducting coax', function_radical_primary: 'superconducting_function', material_radical_primary: 'niobium_titanium' },
            modifier_characters: [
              { kind: 'quantity', value: fmt(p.totalSignalLines) },
              { kind: 'dimension', value: '0.085', unit: 'in OD' },
              { kind: 'form', value: 'NbTi inner + cupronickel outer' },
            ],
          },
        ],
      },
    ],
  }
}

function emitAttenuatorChain(p: QcParams): DesignModule {
  const totalAttenuators = p.physicalQubits * 4
  const paramAmps = Math.max(1, Math.ceil(p.physicalQubits / 4))
  return {
    module: 'attenuator_chain',
    module_brief: `${totalAttenuators} cryogenic attenuators (-20/-20/-10/-10 dB per stage) + ${paramAmps} parametric amplifiers (HEMT/JPA) to suppress Johnson noise on drive lines and quantum-limit readout SNR.`,
    overview_paragraph_en: '',
    derived_parameters: { attenuator_count: totalAttenuators, parametric_amplifier_count: paramAmps },
    allowed_radicals: ['electrical_conducting_function', 'superconducting_function', 'copper', 'ceramic'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'cryo_attenuator_set',
        name_human: 'cryo attenuator set',
        rad_syntax: `cryo_attenuator (${fmt(totalAttenuators)}, XMA, SMA)`,
        role_verb: 'attenuates',
        topology_clause: `4-stage chain per drive line, total -60 dB room-temp to MXC`,
        english_sentence: '',
        words: [
          {
            id: 'cryo_attenuator_word',
            name_human: 'cryo attenuator',
            content_character: { character_id: 'cryo_attenuator', name_human: 'cryogenic attenuator', function_radical_primary: 'electrical_conducting_function', material_radical_primary: 'copper' },
            modifier_characters: [
              { kind: 'quantity', value: fmt(totalAttenuators) },
              { kind: 'form', value: 'XMA 2082-6234 series' },
              { kind: 'dimension', value: '20', unit: 'dB' },
            ],
          },
        ],
      },
      {
        id: 'parametric_amplifier_set',
        name_human: 'parametric amplifier set',
        rad_syntax: `parametric_amplifier (${fmt(paramAmps)}, HEMT or JPA, quantum-limited)`,
        role_verb: 'amplifies',
        topology_clause: `one parametric amp per 4 readout-multiplexed qubits at MXC stage`,
        english_sentence: '',
        words: [
          {
            id: 'parametric_amplifier_word',
            name_human: 'parametric amplifier',
            content_character: { character_id: 'parametric_amplifier', name_human: 'parametric amplifier', function_radical_primary: 'superconducting_function', material_radical_primary: 'niobium_titanium' },
            modifier_characters: [
              { kind: 'quantity', value: fmt(paramAmps) },
              { kind: 'form', value: 'Low Noise Factory HEMT or in-house JPA' },
              { kind: 'dimension', value: '20', unit: 'dB gain' },
              { kind: 'capacity', value: '4-8', unit: 'GHz' },
            ],
          },
        ],
      },
    ],
  }
}

function emitControlElectronicsAWG(p: QcParams): DesignModule {
  const awgChannels = Math.ceil(p.physicalQubits / 8) * 8
  return {
    module: 'control_electronics_AWG',
    module_brief: `${awgChannels}-channel AWG + readout electronics (Quantum Machines OPX1000-class), 1 GS/s output rate.`,
    overview_paragraph_en: '',
    derived_parameters: { awg_channel_count: awgChannels },
    allowed_radicals: ['silicon_semiconductor_function', 'digital_logic_function', 'electrical_conducting_function'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'qm_opx_chassis',
        name_human: 'Quantum Machines OPX1000 chassis',
        rad_syntax: `qm_opx1000_chassis (${fmt(Math.ceil(awgChannels / 16))}) ⊙ awg_output_card (${fmt(Math.ceil(awgChannels / 8))})`,
        role_verb: 'orchestrates',
        topology_clause: 'rack-mounted real-time quantum control unit',
        english_sentence: '',
        words: [
          {
            id: 'qm_opx1000_word',
            name_human: 'Quantum Machines OPX1000',
            content_character: { character_id: 'qm_opx1000_chassis', name_human: 'Quantum Machines OPX1000 chassis', function_radical_primary: 'silicon_semiconductor_function', material_radical_primary: 'polymer_thermoplastic' },
            modifier_characters: [
              { kind: 'quantity', value: fmt(Math.ceil(awgChannels / 16)) },
              { kind: 'form', value: '19" 5U chassis' },
              { kind: 'regulatory', value: 'CE / FCC Part 15B' },
            ],
          },
        ],
      },
    ],
  }
}

function emitDilutionFridgeInterface(p: QcParams): DesignModule {
  return {
    module: 'dilution_fridge_interface',
    module_brief: `Bluefors LD400 / Oxford Triton 500 dilution refrigerator with MXC plate mount, ${p.baseTempMk.toFixed(0)} mK base, MXC cooling ${p.mxcCoolingUw.toFixed(0)} µW.`,
    overview_paragraph_en: '',
    derived_parameters: { base_temp_mk: p.baseTempMk, mxc_cooling_uw: p.mxcCoolingUw },
    allowed_radicals: ['thermal_transfer_function', 'copper', 'aluminium'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'dilution_refrigerator_assembly',
        name_human: 'dilution refrigerator',
        rad_syntax: 'dilution_refrigerator (×1, Bluefors LD400 / Oxford Triton 500)',
        role_verb: 'cools',
        topology_clause: `turnkey wet/dry dilution fridge with ${p.baseTempMk.toFixed(0)} mK base + ${p.mxcCoolingUw.toFixed(0)} µW MXC cooling`,
        english_sentence: '',
        words: [
          {
            id: 'dilution_refrigerator_word',
            name_human: 'dilution refrigerator',
            content_character: { character_id: 'dilution_refrigerator', name_human: 'dilution refrigerator', function_radical_primary: 'thermal_transfer_function', material_radical_primary: 'steel' },
            modifier_characters: [
              { kind: 'quantity', value: '×1' },
              { kind: 'capacity', value: String(p.mxcCoolingUw.toFixed(0)), unit: 'µW @ 100 mK' },
              { kind: 'form', value: 'Bluefors LD400 / Oxford Triton 500 turnkey' },
              { kind: 'regulatory', value: 'CE / PED 2014/68/EU pressure vessel' },
            ],
          },
        ],
      },
      {
        id: 'mxc_mounting_plate',
        name_human: 'MXC mounting plate',
        rad_syntax: 'mxc_plate_ofhc_cu (×1, 250mm, Au-plated)',
        role_verb: 'mounts',
        topology_clause: 'OFHC Cu plate fastened to dilution fridge mixing chamber',
        english_sentence: '',
        words: [
          {
            id: 'mxc_plate_word',
            name_human: 'MXC plate',
            content_character: { character_id: 'mxc_plate_ofhc_cu', name_human: 'OFHC Cu MXC plate', function_radical_primary: 'thermal_transfer_function', material_radical_primary: 'copper' },
            modifier_characters: [
              { kind: 'quantity', value: '×1' },
              { kind: 'dimension', value: '250', unit: 'mm dia' },
              { kind: 'form', value: 'Au-plated OFHC Cu' },
            ],
          },
        ],
      },
    ],
  }
}

function emitMagneticShieldingAssembly(_p: QcParams): DesignModule {
  return {
    module: 'magnetic_shielding_assembly',
    module_brief: 'Multi-layer mu-metal + Cryoperm-10 + inner Cu shield to attenuate ambient B-field <1 µT at MXC.',
    overview_paragraph_en: '',
    derived_parameters: { layer_count: 3 },
    allowed_radicals: ['magnetic_coupling_function', 'mu_metal_material', 'copper'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'mu_metal_can',
        name_human: 'mu-metal cryocan',
        rad_syntax: 'mu_metal_can (×1, Cryoperm-10) ⊙ inner_cu_shield (×1, OFHC)',
        role_verb: 'shields',
        topology_clause: 'concentric cylindrical shields surrounding qubit chip',
        english_sentence: '',
        words: [
          {
            id: 'mu_metal_word',
            name_human: 'mu-metal cryocan',
            content_character: { character_id: 'mu_metal_can', name_human: 'mu-metal cryocan', function_radical_primary: 'magnetic_coupling_function', material_radical_primary: 'mu_metal_material' },
            modifier_characters: [
              { kind: 'quantity', value: '×1' },
              { kind: 'form', value: 'Cryoperm-10' },
              { kind: 'dimension', value: '1.5', unit: 'mm wall' },
            ],
          },
        ],
      },
    ],
  }
}

function emitEMIShieldingEnclosure(p: QcParams): DesignModule {
  return {
    module: 'EMI_shielding_enclosure',
    module_brief: `1U rack EMI enclosure for control electronics, ${p.enclosureShieldingDb.toFixed(0)} dB attenuation 4-8 GHz.`,
    overview_paragraph_en: '',
    derived_parameters: { shielding_db: p.enclosureShieldingDb },
    allowed_radicals: ['magnetic_coupling_function', 'aluminium', 'copper'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'rack_enclosure',
        name_human: 'rack enclosure',
        rad_syntax: 'rack_19in_5u (×1, Al + Cu beryllium gasket)',
        role_verb: 'shields',
        topology_clause: 'isolates control RF chain from cryostat',
        english_sentence: '',
        words: [
          {
            id: 'rack_enclosure_word',
            name_human: 'rack enclosure',
            content_character: { character_id: 'rack_enclosure', name_human: 'EMI rack enclosure', function_radical_primary: 'magnetic_coupling_function', material_radical_primary: 'aluminium' },
            modifier_characters: [
              { kind: 'quantity', value: '×1' },
              { kind: 'form', value: '19" 5U' },
              { kind: 'dimension', value: String(p.enclosureShieldingDb), unit: 'dB attenuation' },
            ],
          },
        ],
      },
    ],
  }
}

function emitVibrationIsolation(_p: QcParams): DesignModule {
  return {
    module: 'vibration_isolation',
    module_brief: 'Pneumatic isolation table + active vibration cancellation for sub-µg coupling to chip.',
    overview_paragraph_en: '',
    derived_parameters: { isolation_corner_hz: 1.5 },
    allowed_radicals: ['mechanical_damping_function', 'steel', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'pneumatic_isolator_set',
        name_human: 'pneumatic isolator set',
        rad_syntax: 'pneumatic_isolator (×4) ⊙ active_cancellation_actuator (×4, piezo)',
        role_verb: 'isolates',
        topology_clause: '4-corner pneumatic + 4-axis active cancellation',
        english_sentence: '',
        words: [
          {
            id: 'pneumatic_isolator_word',
            name_human: 'pneumatic isolator',
            content_character: { character_id: 'pneumatic_isolator', name_human: 'pneumatic isolator', function_radical_primary: 'mechanical_damping_function', material_radical_primary: 'steel' },
            modifier_characters: [
              { kind: 'quantity', value: '×4' },
              { kind: 'form', value: 'Newport S-2000A' },
              { kind: 'dimension', value: '1.5', unit: 'Hz corner' },
            ],
          },
        ],
      },
    ],
  }
}

function emitHeliumHandling(_p: QcParams): DesignModule {
  return {
    module: 'helium_handling',
    module_brief: 'Cryomech CPA1110 compressor + 4He pre-cooling loop + 3He/4He mixing chamber circulation.',
    overview_paragraph_en: '',
    derived_parameters: { compressor_count: 1 },
    allowed_radicals: ['fluid_flow_state', 'helium_gas', 'steel'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'helium_compressor',
        name_human: 'helium compressor',
        rad_syntax: 'cryomech_cpa1110 (×1, 11kW)',
        role_verb: 'circulates',
        topology_clause: '4He pre-cooler + 3He/4He mixture pump',
        english_sentence: '',
        words: [
          {
            id: 'cryomech_cpa1110_word',
            name_human: 'Cryomech CPA1110',
            content_character: { character_id: 'cryomech_cpa1110', name_human: 'Cryomech CPA1110', function_radical_primary: 'fluid_flow_state', material_radical_primary: 'steel' },
            modifier_characters: [
              { kind: 'quantity', value: '×1' },
              { kind: 'capacity', value: '11', unit: 'kW input' },
              { kind: 'form', value: 'water-cooled compressor' },
            ],
          },
        ],
      },
    ],
  }
}

function emitHostClassicalCompute(_p: QcParams): DesignModule {
  return {
    module: 'host_classical_compute',
    module_brief: 'Linux x86 server, 2× Xeon, 256 GB RAM, 100 Gb Ethernet to OPX1000.',
    overview_paragraph_en: '',
    derived_parameters: { ram_gb: 256, ethernet_gbps: 100 },
    allowed_radicals: ['silicon_semiconductor_function', 'digital_logic_function'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'host_server',
        name_human: 'host server',
        rad_syntax: 'dell_r760 (×1) ⊙ ethernet_100gbe_nic (×1)',
        role_verb: 'orchestrates',
        topology_clause: 'OPX → host over QDR Ethernet',
        english_sentence: '',
        words: [
          {
            id: 'dell_r760_word',
            name_human: 'Dell PowerEdge R760',
            content_character: { character_id: 'dell_r760', name_human: 'Dell PowerEdge R760', function_radical_primary: 'silicon_semiconductor_function', material_radical_primary: 'polymer_thermoplastic' },
            modifier_characters: [
              { kind: 'quantity', value: '×1' },
              { kind: 'form', value: 'Dell R760, 2× Xeon Gold 6448Y' },
              { kind: 'capacity', value: '256', unit: 'GB DDR5' },
            ],
          },
        ],
      },
    ],
  }
}

function emitCalibrationSoftware(_p: QcParams): DesignModule {
  return {
    module: 'calibration_software',
    module_brief: 'Qiskit Experiments + IQM-Cocoa calibration suite + Qua control language pipelines.',
    overview_paragraph_en: '',
    derived_parameters: { stages: 12 },
    allowed_radicals: ['digital_logic_function'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'qiskit_experiments',
        name_human: 'Qiskit Experiments',
        rad_syntax: 'qiskit_experiments_runtime (×1)',
        role_verb: 'calibrates',
        topology_clause: 'nightly Rabi, T1, T2*, randomised benchmarking',
        english_sentence: '',
        words: [
          {
            id: 'qiskit_experiments_word',
            name_human: 'Qiskit Experiments',
            content_character: { character_id: 'qiskit_experiments_runtime', name_human: 'Qiskit Experiments runtime', function_radical_primary: 'digital_logic_function', material_radical_primary: null },
            modifier_characters: [
              { kind: 'quantity', value: '×1' },
              { kind: 'form', value: 'IBM Qiskit Experiments 0.6' },
              { kind: 'regulatory', value: 'Apache-2.0' },
            ],
          },
        ],
      },
    ],
  }
}

function emitRegulatoryExportControl(_p: QcParams): DesignModule {
  return {
    module: 'regulatory_export_control',
    module_brief: 'Wassenaar Cat. 3A001 export control + EAR ECCN 4A993 dual-use compliance.',
    overview_paragraph_en: '',
    derived_parameters: { mandatory_count: 3 },
    allowed_radicals: ['regulatory_function'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'export_control_pack',
        name_human: 'export control pack',
        rad_syntax: 'wassenaar_3a001 (×1) ⊙ ear_4a993 (×1)',
        role_verb: 'declares',
        topology_clause: 'shipping documentation + customs declarations',
        english_sentence: '',
        words: [
          {
            id: 'wassenaar_3a001_word',
            name_human: 'Wassenaar 3A001',
            content_character: { character_id: 'wassenaar_3a001', name_human: 'Wassenaar 3A001 classification', function_radical_primary: 'regulatory_function', material_radical_primary: null },
            modifier_characters: [
              { kind: 'quantity', value: '×1' },
              { kind: 'regulatory', value: 'Wassenaar Cat. 3A001' },
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

function emitCrossModuleGrammarLinks(p: QcParams): Array<{ from_module: string; to_module: string; mechanism: string; type: 'mutual' | 'directional'; detail?: string }> {
  return [
    { from_module: 'qubit_chip_die', to_module: 'signal_lines_microwave', mechanism: 'microwave_drive', type: 'mutual', detail: `${p.totalSignalLines} coax connections` },
    { from_module: 'signal_lines_microwave', to_module: 'attenuator_chain', mechanism: 'rf_signal', type: 'directional', detail: '4-stage cryo attenuation' },
    { from_module: 'control_electronics_AWG', to_module: 'signal_lines_microwave', mechanism: 'rf_drive', type: 'directional', detail: 'AWG → cryostat input ports' },
    { from_module: 'dilution_fridge_interface', to_module: 'qubit_chip_die', mechanism: 'thermal_anchor', type: 'mutual', detail: `MXC plate ${p.baseTempMk.toFixed(0)} mK` },
    { from_module: 'magnetic_shielding_assembly', to_module: 'qubit_chip_die', mechanism: 'magnetic_isolation', type: 'directional', detail: 'multi-layer mu-metal + Cryoperm' },
    { from_module: 'helium_handling', to_module: 'dilution_fridge_interface', mechanism: 'helium_circulation', type: 'mutual', detail: 'Cryomech CPA1110 compressor loop' },
    { from_module: 'EMI_shielding_enclosure', to_module: 'control_electronics_AWG', mechanism: 'rf_shielding', type: 'directional', detail: 'enclosure ≥80 dB at qubit frequency' },
    { from_module: 'vibration_isolation', to_module: 'dilution_fridge_interface', mechanism: 'mechanical_damping', type: 'directional', detail: 'pneumatic + active <1 Hz' },
    { from_module: 'host_classical_compute', to_module: 'control_electronics_AWG', mechanism: 'ethernet_link', type: 'mutual', detail: '100 Gb QDR Ethernet' },
    { from_module: 'calibration_software', to_module: 'host_classical_compute', mechanism: 'software_runtime', type: 'directional', detail: 'Qiskit + IQM-cocoa containers' },
    { from_module: 'regulatory_export_control', to_module: 'qubit_chip_die', mechanism: 'export_declaration', type: 'directional', detail: 'Wassenaar 3A001 chip declaration' },
  ]
}

// ---------------------------------------------------------------------------
// PUBLIC EMITTER
// ---------------------------------------------------------------------------

const emitQuantumComputerDesign: ClassEmitter = (contract, _brief, _envelope): DesignJSON => {
  const p = deriveParams(contract)
  const modules: DesignModule[] = [
    emitQubitChipDie(p),
    emitSignalLinesMicrowave(p),
    emitAttenuatorChain(p),
    emitControlElectronicsAWG(p),
    emitDilutionFridgeInterface(p),
    emitMagneticShieldingAssembly(p),
    emitEMIShieldingEnclosure(p),
    emitVibrationIsolation(p),
    emitHeliumHandling(p),
    emitHostClassicalCompute(p),
    emitCalibrationSoftware(p),
    emitRegulatoryExportControl(p),
  ]
  return {
    modules,
    cross_module_grammar_links: emitCrossModuleGrammarLinks(p),
    excluded_modules: [],
    rationale_excluded: 'All 12 modules apply to dilution-fridge-mounted superconducting QC.',
    brief_overview_prose: {
      overview_and_context: '',
      mission_statement: `Deliver ${p.physicalQubits} physical qubits (~${p.logicalQubits} logical) at ${(p.gateFidelity * 100).toFixed(2)}% 2Q gate fidelity in a single rack-integrated dilution-fridge platform.`,
      target_customers: '',
      why_now: '',
    },
  }
}

registerAssembler('quantum_computer', emitQuantumComputerDesign)
