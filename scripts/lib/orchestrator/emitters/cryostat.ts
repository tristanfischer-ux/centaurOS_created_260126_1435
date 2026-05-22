/**
 * scripts/lib/orchestrator/emitters/cryostat.ts
 *
 * Deterministic structural emitter for cryostat class.
 *
 * Reference systems: Bluefors LD400 / Oxford Instruments Triton 500 /
 * JT Cryostat NanoQT-class commercial dilution refrigerator.
 *
 * Modules (10):
 *  1.  vacuum_chamber               (IVC + OVC, indium-sealed)
 *  2.  pulse_tube_pre_cooler        (Cryomech PT415-RM, 1.5 W @ 4K)
 *  3.  helium_3_circulation_loop    (3He inventory + cold trap)
 *  4.  dilution_unit                (still + heat exchanger + MXC plate)
 *  5.  sample_holder_mounting       (sample-space puck + thermalisation)
 *  6.  magnetic_field_coils         (NbTi solenoid, optional)
 *  7.  vibration_isolation          (decoupled compressor mount)
 *  8.  pump_compressor              (3He/4He turbomolecular + scroll)
 *  9.  control_electronics          (temperature monitor + heater driver)
 * 10.  gas_handling_system          (recovery + storage + purification)
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

interface CryoParams {
  baseTempMk: number
  coolingPower100mKUw: number
  coolingPower20mKUw: number
  sampleSpaceMm: number
  he3FlowUmolS: number
  he3InventoryL: number
  cryocoolerCap4kW: number
  cryocoolerCap50kW: number
  magneticShieldingDb: number
  vacuumLeakRate: number
  pumpCount: number
  totalMassKg: number
}

function deriveParams(c: ContractInProgress): CryoParams {
  return {
    baseTempMk: q(c, 'actual_base_temp_mk', q(c, 'base_temp_mk', 20)),
    coolingPower100mKUw: q(c, 'cooling_power_uw_at_100mK', 400),
    coolingPower20mKUw: q(c, 'cooling_power_uw_at_20mK', 10),
    sampleSpaceMm: q(c, 'sample_space_mm', 100),
    he3FlowUmolS: q(c, 'he3_flow_umol_s', 600),
    he3InventoryL: q(c, 'he3_inventory_litres_stp', 25),
    cryocoolerCap4kW: q(c, 'capacity_at_4k_w', 1.5),
    cryocoolerCap50kW: q(c, 'capacity_at_50k_w', 40),
    magneticShieldingDb: q(c, 'magnetic_shielding_db', 40),
    vacuumLeakRate: q(c, 'vacuum_leak_rate_mbar_l_s', 1e-9),
    pumpCount: 3,
    totalMassKg: q(c, 'total_system_mass_kg', 720),
  }
}

// ---------------------------------------------------------------------------
// MODULES
// ---------------------------------------------------------------------------

function emitVacuumChamber(p: CryoParams): DesignModule {
  return {
    module: 'vacuum_chamber',
    module_brief: `Inner + outer vacuum chambers (IVC/OVC) with indium-sealed flanges, leak rate ≤ ${p.vacuumLeakRate.toExponential(0)} mbar·L/s.`,
    overview_paragraph_en: '',
    derived_parameters: { leak_rate_mbar_l_s: p.vacuumLeakRate, sample_space_mm: p.sampleSpaceMm },
    allowed_radicals: ['pressure_vessel_function', 'aluminium', 'indium'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'ivc_ovc_assembly',
        name_human: 'IVC + OVC assembly',
        rad_syntax: 'aluminium_vacuum_chamber (×2, 500mm dia) ⊙ indium_seal_o_ring (×8)',
        role_verb: 'isolates',
        topology_clause: 'concentric Al chambers, OVC at 50K, IVC at 4K',
        english_sentence: '',
        words: [
          {
            id: 'aluminium_vacuum_chamber_word',
            name_human: 'aluminium vacuum chamber',
            content_character: { character_id: 'aluminium_vacuum_chamber', name_human: 'aluminium vacuum chamber', function_radical_primary: 'pressure_vessel_function', material_radical_primary: 'aluminium' },
            modifier_characters: [
              { kind: 'quantity', value: '×2' },
              { kind: 'dimension', value: '500', unit: 'mm dia' },
              { kind: 'form', value: 'Al 6061-T6' },
              { kind: 'regulatory', value: 'ASME VIII Div. 1' },
            ],
          },
          {
            id: 'indium_seal_word',
            name_human: 'indium seal',
            content_character: { character_id: 'indium_seal_o_ring', name_human: 'indium seal O-ring', function_radical_primary: 'pressure_vessel_function', material_radical_primary: 'indium' },
            modifier_characters: [
              { kind: 'quantity', value: '×8' },
              { kind: 'form', value: '1.0 mm In wire seal' },
            ],
          },
        ],
      },
    ],
  }
}

function emitPulseTubePreCooler(p: CryoParams): DesignModule {
  return {
    module: 'pulse_tube_pre_cooler',
    module_brief: `Cryomech PT415-RM-class pulse tube, ${p.cryocoolerCap4kW.toFixed(1)} W @ 4K, ${p.cryocoolerCap50kW.toFixed(0)} W @ 50K.`,
    overview_paragraph_en: '',
    derived_parameters: { capacity_4k_w: p.cryocoolerCap4kW, capacity_50k_w: p.cryocoolerCap50kW },
    allowed_radicals: ['thermal_transfer_function', 'helium_gas', 'steel'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'pulse_tube_cold_head',
        name_human: 'pulse tube cold head',
        rad_syntax: 'cryomech_pt415rm_cold_head (×1) ⊙ flex_line_pair (×2)',
        role_verb: 'pre-cools',
        topology_clause: '2-stage GM-style pulse tube',
        english_sentence: '',
        words: [
          {
            id: 'cryomech_pt415rm_word',
            name_human: 'Cryomech PT415-RM',
            content_character: { character_id: 'cryomech_pt415rm_cold_head', name_human: 'Cryomech PT415-RM cold head', function_radical_primary: 'thermal_transfer_function', material_radical_primary: 'steel' },
            modifier_characters: [
              { kind: 'quantity', value: '×1' },
              { kind: 'capacity', value: String(p.cryocoolerCap4kW), unit: 'W @ 4K' },
              { kind: 'form', value: 'remote-motor pulse tube' },
            ],
          },
        ],
      },
    ],
  }
}

function emitHelium3CirculationLoop(p: CryoParams): DesignModule {
  return {
    module: 'helium_3_circulation_loop',
    module_brief: `Sealed 3He/4He mixture, ${p.he3InventoryL.toFixed(0)} L STP inventory, ${p.he3FlowUmolS.toFixed(0)} µmol/s circulation.`,
    overview_paragraph_en: '',
    derived_parameters: { he3_flow_umol_s: p.he3FlowUmolS, he3_inventory_litres_stp: p.he3InventoryL },
    allowed_radicals: ['fluid_flow_state', 'helium_gas', 'steel'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'he3_storage_dump',
        name_human: '3He storage dump',
        rad_syntax: `he3_dump_tank (×1, ${fmt(p.he3InventoryL)}L STP) ⊙ ln2_cold_trap (×1)`,
        role_verb: 'stores',
        topology_clause: 'sealed gas reservoir + LN2 cold trap purification',
        english_sentence: '',
        words: [
          {
            id: 'he3_dump_tank_word',
            name_human: '3He dump tank',
            content_character: { character_id: 'he3_dump_tank', name_human: '3He dump tank', function_radical_primary: 'pressure_vessel_function', material_radical_primary: 'steel' },
            modifier_characters: [
              { kind: 'quantity', value: '×1' },
              { kind: 'capacity', value: String(p.he3InventoryL), unit: 'L STP' },
              { kind: 'form', value: 'stainless steel sealed reservoir' },
            ],
          },
        ],
      },
    ],
  }
}

function emitDilutionUnit(p: CryoParams): DesignModule {
  return {
    module: 'dilution_unit',
    module_brief: `Au-plated Cu still + sintered Ag heat exchanger + MXC plate, ${p.coolingPower100mKUw.toFixed(0)} µW @ 100 mK, ${p.baseTempMk.toFixed(0)} mK base.`,
    overview_paragraph_en: '',
    derived_parameters: { base_temp_mk: p.baseTempMk, cooling_power_100mK_uw: p.coolingPower100mKUw },
    allowed_radicals: ['thermal_transfer_function', 'copper', 'silver'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'still_and_heat_exchanger',
        name_human: 'still + heat exchanger',
        rad_syntax: 'au_plated_cu_still (×1) ⊙ sintered_ag_heat_exchanger (×3) ⊙ mxc_cu_plate (×1)',
        role_verb: 'cools',
        topology_clause: 'still ~700 mK → heat exchanger → MXC plate ~20 mK',
        english_sentence: '',
        words: [
          {
            id: 'au_cu_still_word',
            name_human: 'gold-plated Cu still',
            content_character: { character_id: 'au_plated_cu_still', name_human: 'gold-plated Cu still', function_radical_primary: 'thermal_transfer_function', material_radical_primary: 'copper' },
            modifier_characters: [
              { kind: 'quantity', value: '×1' },
              { kind: 'form', value: 'Au-plated OFHC Cu, 200 mm long' },
            ],
          },
          {
            id: 'sintered_ag_word',
            name_human: 'sintered Ag heat exchanger',
            content_character: { character_id: 'sintered_ag_heat_exchanger', name_human: 'sintered Ag heat exchanger', function_radical_primary: 'thermal_transfer_function', material_radical_primary: 'silver' },
            modifier_characters: [
              { kind: 'quantity', value: '×3' },
              { kind: 'form', value: 'discrete continuous heat exchangers' },
            ],
          },
          {
            id: 'mxc_plate_word',
            name_human: 'MXC plate',
            content_character: { character_id: 'mxc_cu_plate', name_human: 'MXC plate', function_radical_primary: 'thermal_transfer_function', material_radical_primary: 'copper' },
            modifier_characters: [
              { kind: 'quantity', value: '×1' },
              { kind: 'dimension', value: '300', unit: 'mm dia' },
              { kind: 'form', value: 'Au-plated OFHC Cu' },
            ],
          },
        ],
      },
    ],
  }
}

function emitSampleHolderMounting(p: CryoParams): DesignModule {
  return {
    module: 'sample_holder_mounting',
    module_brief: `${p.sampleSpaceMm} mm dia sample space with PCB puck and Cu cold-finger thermal anchoring.`,
    overview_paragraph_en: '',
    derived_parameters: { sample_space_mm: p.sampleSpaceMm },
    allowed_radicals: ['thermal_transfer_function', 'copper', 'fr4_substrate'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'sample_puck',
        name_human: 'sample puck',
        rad_syntax: `sample_pcb_puck (×1, ${p.sampleSpaceMm}mm) ⊙ cu_thermal_anchor (×4)`,
        role_verb: 'mounts',
        topology_clause: `${p.sampleSpaceMm} mm puck bolted to MXC plate`,
        english_sentence: '',
        words: [
          {
            id: 'sample_pcb_puck_word',
            name_human: 'sample PCB puck',
            content_character: { character_id: 'sample_pcb_puck', name_human: 'sample PCB puck', function_radical_primary: 'electrical_conducting_function', material_radical_primary: 'fr4_substrate' },
            modifier_characters: [
              { kind: 'quantity', value: '×1' },
              { kind: 'dimension', value: String(p.sampleSpaceMm), unit: 'mm dia' },
              { kind: 'form', value: 'low-loss Rogers 4350B' },
            ],
          },
        ],
      },
    ],
  }
}

function emitMagneticFieldCoils(_p: CryoParams): DesignModule {
  return {
    module: 'magnetic_field_coils',
    module_brief: 'Optional NbTi solenoid for spin-system experiments, 6T @ 4.2K, persistent-mode switch.',
    overview_paragraph_en: '',
    derived_parameters: { field_max_t: 6 },
    allowed_radicals: ['magnetic_coupling_function', 'niobium_titanium', 'copper'],
    applicability_confidence: 'medium',
    sub_modules: [
      {
        id: 'nbti_solenoid',
        name_human: 'NbTi solenoid',
        rad_syntax: 'nbti_main_solenoid (×1, 6T) ⊙ persistent_mode_switch (×1)',
        role_verb: 'magnetises',
        topology_clause: '6T solenoid + persistent-mode heater switch',
        english_sentence: '',
        words: [
          {
            id: 'nbti_solenoid_word',
            name_human: 'NbTi solenoid',
            content_character: { character_id: 'nbti_main_solenoid', name_human: 'NbTi main solenoid', function_radical_primary: 'magnetic_coupling_function', material_radical_primary: 'niobium_titanium' },
            modifier_characters: [
              { kind: 'quantity', value: '×1' },
              { kind: 'capacity', value: '6', unit: 'T' },
              { kind: 'form', value: 'NbTi superconducting wire' },
            ],
          },
        ],
      },
    ],
  }
}

function emitVibrationIsolation(_p: CryoParams): DesignModule {
  return {
    module: 'vibration_isolation',
    module_brief: 'Decoupled compressor mount + braided flex lines + sand-box mass damper.',
    overview_paragraph_en: '',
    derived_parameters: { damping_db_at_2hz: 40 },
    allowed_radicals: ['mechanical_damping_function', 'steel', 'silica_sand'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'compressor_decoupling',
        name_human: 'compressor decoupling',
        rad_syntax: 'flex_helium_line (×2) ⊙ sand_damper_box (×1)',
        role_verb: 'isolates',
        topology_clause: 'pulse-tube cold head decoupled from compressor by 3 m flex lines',
        english_sentence: '',
        words: [
          {
            id: 'flex_helium_line_word',
            name_human: 'flex helium line',
            content_character: { character_id: 'flex_helium_line', name_human: 'flex helium line', function_radical_primary: 'fluid_flow_state', material_radical_primary: 'steel' },
            modifier_characters: [
              { kind: 'quantity', value: '×2' },
              { kind: 'dimension', value: '3', unit: 'm' },
              { kind: 'form', value: 'braided SS304' },
            ],
          },
        ],
      },
    ],
  }
}

function emitPumpCompressor(p: CryoParams): DesignModule {
  return {
    module: 'pump_compressor',
    module_brief: `Cryomech CPA1110 helium compressor + Pfeiffer HiPace 80 turbomolecular + Edwards XDS scroll backing pump (${p.pumpCount} total).`,
    overview_paragraph_en: '',
    derived_parameters: { pump_count: p.pumpCount },
    allowed_radicals: ['fluid_flow_state', 'steel', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'pump_set',
        name_human: 'pump set',
        rad_syntax: 'cryomech_cpa1110 (×1) ⊙ pfeiffer_hipace80 (×1) ⊙ edwards_xds_scroll (×1)',
        role_verb: 'evacuates',
        topology_clause: 'cascade pump rack feeding 3He/4He circulation',
        english_sentence: '',
        words: [
          {
            id: 'cryomech_cpa1110_word',
            name_human: 'Cryomech CPA1110',
            content_character: { character_id: 'cryomech_cpa1110', name_human: 'Cryomech CPA1110 compressor', function_radical_primary: 'fluid_flow_state', material_radical_primary: 'steel' },
            modifier_characters: [
              { kind: 'quantity', value: '×1' },
              { kind: 'capacity', value: '11', unit: 'kW input' },
            ],
          },
          {
            id: 'pfeiffer_hipace80_word',
            name_human: 'Pfeiffer HiPace 80',
            content_character: { character_id: 'pfeiffer_hipace80', name_human: 'Pfeiffer HiPace 80', function_radical_primary: 'fluid_flow_state', material_radical_primary: 'steel' },
            modifier_characters: [
              { kind: 'quantity', value: '×1' },
              { kind: 'capacity', value: '80', unit: 'L/s' },
              { kind: 'form', value: 'turbomolecular' },
            ],
          },
        ],
      },
    ],
  }
}

function emitControlElectronics(_p: CryoParams): DesignModule {
  return {
    module: 'control_electronics',
    module_brief: 'Lakeshore 372 AC resistance bridge + Bluefors temperature-stabiliser module + Stanford SIM900 mainframe.',
    overview_paragraph_en: '',
    derived_parameters: { temperature_channels: 16 },
    allowed_radicals: ['silicon_semiconductor_function', 'electrical_conducting_function'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'lakeshore_372',
        name_human: 'Lakeshore 372 bridge',
        rad_syntax: 'lakeshore_372 (×1) ⊙ bluefors_temperature_stabiliser (×1)',
        role_verb: 'monitors',
        topology_clause: 'Au-plated thermometer reads → resistance bridge → PID heater',
        english_sentence: '',
        words: [
          {
            id: 'lakeshore_372_word',
            name_human: 'Lakeshore 372',
            content_character: { character_id: 'lakeshore_372', name_human: 'Lakeshore 372 AC resistance bridge', function_radical_primary: 'silicon_semiconductor_function', material_radical_primary: 'polymer_thermoplastic' },
            modifier_characters: [
              { kind: 'quantity', value: '×1' },
              { kind: 'form', value: 'Lakeshore 372 AC bridge' },
              { kind: 'regulatory', value: 'CE / FCC Part 15B' },
            ],
          },
        ],
      },
    ],
  }
}

function emitGasHandlingSystem(_p: CryoParams): DesignModule {
  return {
    module: 'gas_handling_system',
    module_brief: 'Manual + automated gas-handling panel with 3He recovery, LN2 cold-trap purification, manifold + pressure gauges.',
    overview_paragraph_en: '',
    derived_parameters: { gauge_count: 4 },
    allowed_radicals: ['fluid_flow_state', 'steel', 'silica_glass'],
    applicability_confidence: 'high',
    sub_modules: [
      {
        id: 'gas_handling_panel',
        name_human: 'gas handling panel',
        rad_syntax: 'manual_valve (×8) ⊙ pneumatic_valve (×4) ⊙ pressure_gauge (×4)',
        role_verb: 'routes',
        topology_clause: '3He/4He recovery and purification panel',
        english_sentence: '',
        words: [
          {
            id: 'pneumatic_valve_word',
            name_human: 'pneumatic valve',
            content_character: { character_id: 'pneumatic_valve', name_human: 'pneumatic valve', function_radical_primary: 'fluid_flow_state', material_radical_primary: 'steel' },
            modifier_characters: [
              { kind: 'quantity', value: '×4' },
              { kind: 'form', value: 'Swagelok 4-PNV' },
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

function emitCrossModuleGrammarLinks(_p: CryoParams): Array<{ from_module: string; to_module: string; mechanism: string; type: 'mutual' | 'directional'; detail?: string }> {
  return [
    { from_module: 'pulse_tube_pre_cooler', to_module: 'dilution_unit', mechanism: 'thermal_anchor', type: 'directional', detail: '4K stage feeds dilution still' },
    { from_module: 'helium_3_circulation_loop', to_module: 'dilution_unit', mechanism: 'helium_circulation', type: 'mutual', detail: '3He flow through mixing chamber' },
    { from_module: 'vacuum_chamber', to_module: 'dilution_unit', mechanism: 'vacuum_isolation', type: 'directional', detail: 'IVC encloses dilution stages' },
    { from_module: 'pump_compressor', to_module: 'helium_3_circulation_loop', mechanism: 'helium_circulation', type: 'directional', detail: 'compressor + turbo cascade' },
    { from_module: 'sample_holder_mounting', to_module: 'dilution_unit', mechanism: 'thermal_anchor', type: 'mutual', detail: 'sample puck bolted to MXC plate' },
    { from_module: 'magnetic_field_coils', to_module: 'sample_holder_mounting', mechanism: 'magnetic_field', type: 'directional', detail: 'solenoid surrounds sample space' },
    { from_module: 'control_electronics', to_module: 'dilution_unit', mechanism: 'sensor_data', type: 'mutual', detail: 'thermometers + heaters' },
    { from_module: 'control_electronics', to_module: 'pump_compressor', mechanism: 'sensor_data', type: 'mutual', detail: 'pump status interlock' },
    { from_module: 'gas_handling_system', to_module: 'helium_3_circulation_loop', mechanism: 'helium_circulation', type: 'directional', detail: 'recovery + storage' },
    { from_module: 'vibration_isolation', to_module: 'pulse_tube_pre_cooler', mechanism: 'mechanical_damping', type: 'directional', detail: 'flex-line decoupling' },
  ]
}

// ---------------------------------------------------------------------------
// PUBLIC EMITTER
// ---------------------------------------------------------------------------

const emitCryostatDesign: ClassEmitter = (contract, _brief, _envelope): DesignJSON => {
  const p = deriveParams(contract)
  const modules: DesignModule[] = [
    emitVacuumChamber(p),
    emitPulseTubePreCooler(p),
    emitHelium3CirculationLoop(p),
    emitDilutionUnit(p),
    emitSampleHolderMounting(p),
    emitMagneticFieldCoils(p),
    emitVibrationIsolation(p),
    emitPumpCompressor(p),
    emitControlElectronics(p),
    emitGasHandlingSystem(p),
  ]
  return {
    modules,
    cross_module_grammar_links: emitCrossModuleGrammarLinks(p),
    excluded_modules: [],
    rationale_excluded: 'All 10 modules apply to commercial dilution refrigerators.',
    brief_overview_prose: {
      overview_and_context: '',
      mission_statement: `Reach ${p.baseTempMk.toFixed(0)} mK base temperature with ${p.coolingPower100mKUw.toFixed(0)} µW @ 100 mK cooling power in a Bluefors LD400 / Oxford Triton 500-class commercial cryostat.`,
      target_customers: '',
      why_now: '',
    },
  }
}

registerAssembler('cryostat', emitCryostatDesign)
