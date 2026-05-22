/**
 * scripts/lib/orchestrator/emitters/cnc-machine.ts
 *
 * CNC machining centre DETERMINISTIC EMITTER — BESS-quality per
 * the 2026-05-22 hand-tuning batch.
 *
 * Industry references: DMG Mori NHX 5000, Mazak VTC-800/30 SR,
 * Haas VF-2SS, Doosan DNM 4500, Heidenhain TNC 640 control class.
 * Envelope: 2-50 kW spindle, 3-axis or 5-axis. Default 15 kW
 * 3-axis VMC with 18 krpm BT40 spindle.
 *
 * Reproducibility contract: pure function, no I/O, all numerical
 * fields read from contract.quantities. LLM narrator fills prose
 * fields later.
 *
 * Modules emitted (10): bed_frame_machine_tool, x_y_z_axis_servos,
 *   spindle_assembly, atc_tool_changer, coolant_chip_management,
 *   controller_cnc, safety_enclosure_doors, electrical_cabinet,
 *   hmi_jog_pendant, foundation_levelling.
 */

import type {
  BriefEnvelope,
  ContractInProgress,
  ParsedConstraints,
} from '../types'
import type { DesignJSON, DesignModule } from '../assembler'
import { registerAssembler } from '../assembler'

// ---------------------------------------------------------------------------
// LOCAL TYPES (mirror DeterministicDesign)
// ---------------------------------------------------------------------------

interface ModifierCharacter { kind: string; value: string; unit?: string }
interface ContentCharacter {
  character_id: string
  name_human: string
  function_radical_primary: string | null
  function_radical_secondary: string | null
  material_radical_primary: string | null
  material_radical_secondary: string | null
}
interface Word { id: string; name_human: string; content_character: ContentCharacter; modifier_characters: ModifierCharacter[] }
interface SubModule { id: string; name_human: string; english_sentence: string; rad_syntax: string; role_verb: string; topology_clause: string; words: Word[] }

function q(contract: ContractInProgress, key: string, fallback: number): number {
  const v = (contract.quantities as Record<string, { value: number } | undefined>)?.[key]?.value
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function fmtQty(n: number): string {
  if (Number.isInteger(n)) return `×${n}`
  return `×${n.toFixed(2)}`
}

function mod(kind: string, value: string, unit?: string): ModifierCharacter { return unit !== undefined ? { kind, value, unit } : { kind, value } }

function cc(character_id: string, name_human: string, fp: string | null, mp: string | null, fs: string | null = null, ms: string | null = null): ContentCharacter {
  return { character_id, name_human, function_radical_primary: fp, function_radical_secondary: fs, material_radical_primary: mp, material_radical_secondary: ms }
}

function word(id: string, name_human: string, content: ContentCharacter, modifiers: ModifierCharacter[]): Word {
  // Universal fix #A (2026-05-22): strip literal " word" suffix from name_human.
  const cleanName = name_human.replace(/\s+word$/i, '')
  return { id, name_human: cleanName, content_character: content, modifier_characters: modifiers }
}

function synthRad(words: Word[]): string {
  return words
    .map((w) => {
      const m = [...w.modifier_characters].sort((a, b) => (a.kind === 'quantity' ? -1 : b.kind === 'quantity' ? 1 : 0))
      const tokens = m.map((x) => (x.unit ? `${x.value}${x.unit}` : x.value))
      return tokens.length === 0 ? w.content_character.character_id : `${w.content_character.character_id} (${tokens.join(', ')})`
    })
    .join(' ⊙ ')
}

function makeSub(id: string, name: string, role: string, topology: string, words: Word[]): SubModule {
  return { id, name_human: name, english_sentence: '', rad_syntax: synthRad(words), role_verb: role, topology_clause: topology, words }
}

// ---------------------------------------------------------------------------
// PARAMS
// ---------------------------------------------------------------------------

interface CncParams {
  spindlePowerKw: number
  maxSpindleRpm: number
  rapidTraverseMmMin: number
  axesCount: number
  isFiveAxis: boolean
  bedTravelXMm: number
  bedTravelYMm: number
  bedTravelZMm: number
  atcSlots: number
  coolantTankL: number
  busVoltageV: number
  motorContinuousA: number
}

function deriveParams(c: ContractInProgress): CncParams {
  const spindlePowerKw = q(c, 'rated_spindle_power_kw', 15)
  const maxSpindleRpm = q(c, 'max_spindle_rpm', 18000)
  const rapidTraverseMmMin = q(c, 'rapid_traverse_mm_per_min', 30000)
  const axesCount = Math.max(3, Math.round(q(c, 'axes_count', 3)))
  const isFiveAxis = axesCount >= 5
  // Travel scaling: 600×500×550 mm for 15 kW VMC; +50 mm per kW above 15.
  const baseTravel = 600
  const travelScale = Math.max(0, spindlePowerKw - 15) * 50
  const bedTravelXMm = q(c, 'bed_travel_x_mm', baseTravel + travelScale)
  const bedTravelYMm = q(c, 'bed_travel_y_mm', 500 + travelScale)
  const bedTravelZMm = q(c, 'bed_travel_z_mm', 550 + travelScale)
  // ATC: ≥30 slots for VMC-class.
  const atcSlots = Math.max(20, Math.round(q(c, 'atc_slot_count', isFiveAxis ? 60 : 30)))
  const coolantTankL = q(c, 'coolant_tank_l', 200 + spindlePowerKw * 8)
  const busVoltageV = q(c, 'cabinet_bus_voltage_v', 400)
  const motorContinuousA = q(c, 'servo_continuous_a', spindlePowerKw * 2.5)
  return { spindlePowerKw, maxSpindleRpm, rapidTraverseMmMin, axesCount, isFiveAxis, bedTravelXMm, bedTravelYMm, bedTravelZMm, atcSlots, coolantTankL, busVoltageV, motorContinuousA }
}

// ---------------------------------------------------------------------------
// 1. bed_frame_machine_tool
// ---------------------------------------------------------------------------

function emitBedFrame(p: CncParams): DesignModule {
  const bedFrame = makeSub(
    'cast_iron_bed',
    'cast iron bed',
    'supports',
    `monolithic Meehanite cast-iron bed with ${p.bedTravelXMm.toFixed(0)} × ${p.bedTravelYMm.toFixed(0)} mm working area`,
    [
      word(
        'meehanite_cast_iron_bed_word',
        'Meehanite cast iron bed',
        cc('meehanite_cast_iron_bed', 'Meehanite cast iron bed', 'mechanical_actuation_function', 'cast_iron'),
        [
          mod('quantity', '×1'),
          mod('form', 'monolithic stress-relieved'),
          mod('capacity', String(Math.round(p.spindlePowerKw * 250)), 'kg static load'),
        ],
      ),
      word(
        't_slot_table_word',
        'T-slot table',
        cc('t_slot_table', 'T-slot work table', 'mechanical_actuation_function', 'cast_iron'),
        [
          mod('quantity', '×1'),
          mod('dimension', `${p.bedTravelXMm.toFixed(0)}×${p.bedTravelYMm.toFixed(0)}`, 'mm'),
          mod('form', '14H7 5-slot'),
          mod('regulatory', 'DIN 650'),
        ],
      ),
      word(
        'frame_column_word',
        'frame column',
        cc('frame_column', 'frame column', null, 'cast_iron'),
        [
          mod('quantity', '×1'),
          mod('form', 'box-section Y-column'),
        ],
      ),
      word(
        'machine_levelling_pad_word',
        'machine levelling pad',
        cc('machine_levelling_pad', 'machine levelling pad', 'mechanical_actuation_function', 'steel'),
        [
          mod('quantity', '×6'),
          mod('form', 'wedge-jack'),
          mod('capacity', '5000', 'kg each'),
        ],
      ),
    ],
  )

  return {
    module: 'bed_frame_machine_tool',
    module_brief: `Monolithic stress-relieved Meehanite cast-iron bed (${Math.round(p.spindlePowerKw * 250)} kg load) with ${p.bedTravelXMm.toFixed(0)} × ${p.bedTravelYMm.toFixed(0)} mm T-slot work table (DIN 650 14H7 5-slot) on six 5000 kg wedge-jack levelling pads.`,
    overview_paragraph_en: '',
    derived_parameters: {
      bed_travel_x_mm: p.bedTravelXMm,
      bed_travel_y_mm: p.bedTravelYMm,
      bed_travel_z_mm: p.bedTravelZMm,
      load_capacity_kg: p.spindlePowerKw * 250,
    },
    allowed_radicals: [
      'mechanical_actuation_function',
      'cast_iron',
      'steel',
    ],
    applicability_confidence: 'high',
    sub_modules: [bedFrame] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 2. x_y_z_axis_servos
// ---------------------------------------------------------------------------

function emitAxisServos(p: CncParams): DesignModule {
  const linearServo = makeSub(
    'linear_axis_servo',
    'linear axis servo',
    'positions',
    `${p.axesCount}-axis Yaskawa/Heidenhain absolute servo drives on linear guideways`,
    [
      word(
        'ac_servo_motor_word',
        'AC servo motor',
        cc('ac_servo_motor', 'AC servo motor', 'electric_motor_function', 'silicon_steel'),
        [
          mod('quantity', fmtQty(p.axesCount)),
          mod('form', 'Yaskawa Sigma-7 / Heidenhain QSY'),
          mod('capacity', '5', 'kW each'),
          mod('regulatory', 'EN 60034-1'),
        ],
      ),
      word(
        'absolute_encoder_word',
        'absolute encoder',
        cc('absolute_encoder', 'absolute encoder', 'optical_sensing_function', 'silicon'),
        [
          mod('quantity', fmtQty(p.axesCount)),
          mod('form', '24-bit BiSS-C'),
          mod('regulatory', 'EnDat 2.2'),
        ],
      ),
      word(
        'ballscrew_drive_word',
        'ballscrew drive',
        cc('ballscrew_drive', 'ballscrew drive', 'mechanical_actuation_function', 'steel'),
        [
          mod('quantity', fmtQty(p.axesCount)),
          mod('form', 'NSK ground C3 32 mm'),
          mod('dimension', '10', 'mm lead'),
        ],
      ),
      word(
        'linear_guideway_hgr45_word',
        'linear guideway HGR45',
        cc('linear_guideway_hgr45', 'linear guideway HGR45', 'mechanical_actuation_function', 'steel'),
        [
          mod('quantity', '×6'),
          mod('form', 'Hiwin HGR45 profile rail'),
          mod('regulatory', 'ISO 12090'),
        ],
      ),
      word(
        'servo_drive_yaskawa_word',
        'Yaskawa servo drive',
        cc('servo_drive_yaskawa', 'Yaskawa servo drive', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', fmtQty(p.axesCount)),
          mod('form', 'SGD7S-7R6A'),
          mod('capacity', String(p.motorContinuousA.toFixed(0)), 'A'),
        ],
      ),
      word(
        'machine_bellows_cover_word',
        'machine bellows cover',
        cc('machine_bellows_cover', 'machine bellows cover', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×3'),
          mod('form', 'accordion neoprene'),
        ],
      ),
    ],
  )

  return {
    module: 'x_y_z_axis_servos',
    module_brief: `${p.axesCount}-axis Yaskawa Sigma-7 / Heidenhain QSY absolute AC servos (5 kW each) driving NSK ground C3 32 mm ballscrews on Hiwin HGR45 linear guideways with neoprene bellows protection; ${p.rapidTraverseMmMin.toFixed(0)} mm/min rapid traverse.`,
    overview_paragraph_en: '',
    derived_parameters: {
      axes_count: p.axesCount,
      rapid_traverse_mm_min: p.rapidTraverseMmMin,
      servo_continuous_a: p.motorContinuousA,
      is_five_axis: p.isFiveAxis ? 1 : 0,
    },
    allowed_radicals: [
      'electric_motor_function',
      'mechanical_actuation_function',
      'silicon_semiconductor_function',
      'optical_sensing_function',
      'silicon_steel',
      'steel',
    ],
    applicability_confidence: 'high',
    sub_modules: [linearServo] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 3. spindle_assembly
// ---------------------------------------------------------------------------

function emitSpindleAssembly(p: CncParams): DesignModule {
  const spindle = makeSub(
    'motorised_spindle',
    'motorised spindle',
    'rotates',
    `${p.spindlePowerKw.toFixed(0)} kW BT40 / HSK-A63 motorised spindle, ${p.maxSpindleRpm.toFixed(0)} max rpm`,
    [
      word(
        'motorised_spindle_unit_word',
        'motorised spindle unit',
        cc('motorised_spindle_unit', 'motorised spindle unit', 'electric_motor_function', 'tool_steel'),
        [
          mod('quantity', '×1'),
          mod('capacity', String(p.spindlePowerKw.toFixed(0)), 'kW'),
          mod('dimension', String(p.maxSpindleRpm.toFixed(0)), 'rpm'),
          mod('form', p.isFiveAxis ? 'HSK-A63 5-axis' : 'BT40 V-flange'),
          mod('regulatory', 'ISO 7388-1'),
        ],
      ),
      word(
        'ceramic_hybrid_bearing_word',
        'ceramic hybrid bearing',
        cc('ceramic_hybrid_bearing', 'ceramic hybrid bearing', 'mechanical_actuation_function', 'silicon_nitride'),
        [
          mod('quantity', '×4'),
          mod('form', 'SKF 70xx series ABEC-7'),
          mod('regulatory', 'ISO 492 P4'),
        ],
      ),
      word(
        'spindle_oil_chiller_word',
        'spindle oil chiller',
        cc('spindle_oil_chiller', 'spindle oil chiller', 'thermal_transfer_function', 'aluminium_alloy'),
        [
          mod('quantity', '×1'),
          mod('capacity', String(Math.round(p.spindlePowerKw * 0.10)), 'kW heat'),
          mod('form', 'Habor / Hyfra closed-loop'),
        ],
      ),
      word(
        'spindle_drawbar_word',
        'spindle drawbar',
        cc('spindle_drawbar', 'spindle drawbar', 'mechanical_actuation_function', 'tool_steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'Belleville stack'),
          mod('capacity', '15', 'kN clamping'),
        ],
      ),
      word(
        'spindle_taper_clean_air_word',
        'spindle taper clean-air',
        cc('spindle_taper_clean_air', 'spindle taper clean-air', 'fluid_flow_state', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'compressed-air through-taper'),
          mod('capacity', '6', 'bar'),
        ],
      ),
    ],
  )

  return {
    module: 'spindle_assembly',
    module_brief: `${p.spindlePowerKw.toFixed(0)} kW motorised spindle (${p.maxSpindleRpm.toFixed(0)} rpm, ${p.isFiveAxis ? 'HSK-A63' : 'BT40 V-flange'}) on SKF 70xx ABEC-7 ceramic hybrid bearings, oil-chiller cooled at ${Math.round(p.spindlePowerKw * 0.10)} kW thermal removal, 15 kN Belleville drawbar clamping.`,
    overview_paragraph_en: '',
    derived_parameters: {
      spindle_power_kw: p.spindlePowerKw,
      max_spindle_rpm: p.maxSpindleRpm,
      spindle_taper: p.isFiveAxis ? 0 : 40,
      heat_rejection_kw: p.spindlePowerKw * 0.10,
    },
    allowed_radicals: [
      'electric_motor_function',
      'mechanical_actuation_function',
      'thermal_transfer_function',
      'fluid_flow_state',
      'tool_steel',
      'silicon_nitride',
    ],
    applicability_confidence: 'high',
    sub_modules: [spindle] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 4. atc_tool_changer
// ---------------------------------------------------------------------------

function emitAtcToolChanger(p: CncParams): DesignModule {
  const atc = makeSub(
    'tool_carousel',
    'tool carousel',
    'changes',
    `${p.atcSlots}-slot carousel ATC with cam-driven swing-arm exchange (target <3 s tool-to-tool)`,
    [
      word(
        'tool_carousel_chain_word',
        'tool carousel chain',
        cc('tool_carousel_chain', 'tool carousel chain', 'mechanical_actuation_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', `${p.atcSlots}-position chain magazine`),
          mod('regulatory', 'DIN 8589'),
        ],
      ),
      word(
        'atc_swing_arm_word',
        'ATC swing-arm',
        cc('atc_swing_arm', 'ATC swing-arm', 'mechanical_actuation_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'cam-indexer'),
          mod('lifecycle', '3 s tool-to-tool'),
        ],
      ),
      word(
        'tool_holder_bt40_word',
        p.isFiveAxis ? 'HSK-A63 tool holder word' : 'BT40 tool holder',
        cc(p.isFiveAxis ? 'tool_holder_hsk_a63' : 'tool_holder_bt40', p.isFiveAxis ? 'HSK-A63 tool holder' : 'BT40 tool holder', 'mechanical_actuation_function', 'tool_steel'),
        [
          mod('quantity', fmtQty(p.atcSlots)),
          mod('form', p.isFiveAxis ? 'HSK-A63' : 'BT40 ISO 7388'),
        ],
      ),
      word(
        'tool_pull_stud_word',
        'tool pull-stud',
        cc('tool_pull_stud', 'tool pull-stud', 'mechanical_actuation_function', 'tool_steel'),
        [
          mod('quantity', fmtQty(p.atcSlots)),
          mod('form', 'P40T-A or HSK-A63 grippers'),
        ],
      ),
    ],
  )

  return {
    module: 'atc_tool_changer',
    module_brief: `${p.atcSlots}-slot chain-type ATC magazine with cam-driven swing-arm achieving 3 s tool-to-tool exchange, populated with ${p.isFiveAxis ? 'HSK-A63' : 'BT40 ISO 7388'} tool holders.`,
    overview_paragraph_en: '',
    derived_parameters: {
      atc_slot_count: p.atcSlots,
      tool_change_time_s: 3,
    },
    allowed_radicals: [
      'mechanical_actuation_function',
      'tool_steel',
      'steel',
    ],
    applicability_confidence: 'high',
    sub_modules: [atc] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 5. coolant_chip_management
// ---------------------------------------------------------------------------

function emitCoolantChipManagement(p: CncParams): DesignModule {
  const coolant = makeSub(
    'flood_coolant_system',
    'flood coolant system',
    'cools',
    `${p.coolantTankL.toFixed(0)} L sump + 7 bar through-spindle coolant + paper-band filtration`,
    [
      word(
        'coolant_tank_word',
        'coolant tank',
        cc('coolant_tank', 'coolant tank', 'fluid_flow_state', 'steel'),
        [
          mod('quantity', '×1'),
          mod('capacity', String(p.coolantTankL.toFixed(0)), 'L'),
          mod('form', 'welded sump'),
        ],
      ),
      word(
        'coolant_pump_flood_word',
        'flood coolant pump',
        cc('coolant_pump_flood', 'flood coolant pump', 'fluid_flow_state', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'Grundfos MTR / CRN'),
          mod('capacity', '120', 'L/min @ 7 bar'),
        ],
      ),
      word(
        'coolant_pump_through_spindle_word',
        'through-spindle coolant pump',
        cc('coolant_pump_through_spindle', 'through-spindle coolant pump', 'fluid_flow_state', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'high-pressure Showa Giken'),
          mod('capacity', '70', 'bar'),
        ],
      ),
      word(
        'chip_conveyor_hinge_belt_word',
        'hinge-belt chip conveyor',
        cc('chip_conveyor_hinge_belt', 'hinge-belt chip conveyor', 'mechanical_actuation_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'lateral discharge'),
        ],
      ),
      word(
        'paper_band_filter_word',
        'paper-band coolant filter',
        cc('paper_band_filter', 'paper-band coolant filter', null, 'paper_fibre'),
        [
          mod('quantity', '×1'),
          mod('form', '25 µm dual-roll'),
        ],
      ),
      word(
        'mist_extractor_word',
        'coolant mist extractor',
        cc('mist_extractor', 'coolant mist extractor', 'fluid_flow_state', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'Donaldson Torit M-Series'),
          mod('regulatory', 'EN 16798'),
        ],
      ),
    ],
  )

  return {
    module: 'coolant_chip_management',
    module_brief: `${p.coolantTankL.toFixed(0)} L sump + Grundfos MTR/CRN flood pump (120 L/min @ 7 bar) plus 70 bar Showa Giken through-spindle high-pressure circuit, hinge-belt chip conveyor and 25 µm paper-band coolant filter with Donaldson Torit mist extractor.`,
    overview_paragraph_en: '',
    derived_parameters: {
      coolant_tank_l: p.coolantTankL,
      coolant_flow_l_min: 120,
      thru_spindle_pressure_bar: 70,
    },
    allowed_radicals: [
      'fluid_flow_state',
      'mechanical_actuation_function',
      'steel',
    ],
    applicability_confidence: 'high',
    sub_modules: [coolant] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 6. controller_cnc
// ---------------------------------------------------------------------------

function emitControllerCnc(p: CncParams): DesignModule {
  const ctrl = makeSub(
    'cnc_controller_unit',
    'CNC controller unit',
    'commands',
    'Heidenhain TNC 640 / Siemens Sinumerik / Fanuc 32i class motion controller',
    [
      word(
        'cnc_controller_word',
        'CNC controller',
        cc('cnc_controller', 'CNC controller', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', p.isFiveAxis ? 'Heidenhain TNC 640 5-axis' : 'Siemens Sinumerik 828D / Fanuc 32i'),
          mod('regulatory', 'IEC 61131-3'),
        ],
      ),
      word(
        'safety_plc_word',
        'safety PLC',
        cc('safety_plc', 'safety PLC', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'Pilz PNOZmulti / Siemens F-CPU'),
          mod('regulatory', 'EN 13849 PL d'),
        ],
      ),
      word(
        'ethercat_io_bus_word',
        'EtherCAT I/O bus',
        cc('ethercat_io_bus', 'EtherCAT I/O bus', 'electrical_conducting_function', 'copper'),
        [
          mod('quantity', '×1'),
          mod('form', 'Beckhoff EK1100 + EL terminals'),
          mod('regulatory', 'IEC 61784-2 CPF3'),
        ],
      ),
      word(
        'spindle_drive_inverter_word',
        'spindle drive inverter',
        cc('spindle_drive_inverter', 'spindle drive inverter', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'Siemens Sinamics S120'),
          mod('capacity', String(p.spindlePowerKw.toFixed(0)), 'kW'),
        ],
      ),
    ],
  )

  return {
    module: 'controller_cnc',
    module_brief: `Heidenhain TNC 640 (5-axis) or Siemens Sinumerik 828D / Fanuc 32i motion controller paired with Pilz / Siemens F-CPU safety PLC (EN 13849 PL d) on a Beckhoff EtherCAT EK1100 I/O backbone, Sinamics S120 spindle drive rated to ${p.spindlePowerKw.toFixed(0)} kW.`,
    overview_paragraph_en: '',
    derived_parameters: {
      axes_count: p.axesCount,
      spindle_power_kw: p.spindlePowerKw,
    },
    allowed_radicals: [
      'silicon_semiconductor_function',
      'electrical_conducting_function',
      'copper',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [ctrl] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 7. safety_enclosure_doors
// ---------------------------------------------------------------------------

function emitSafetyEnclosure(p: CncParams): DesignModule {
  const enclosure = makeSub(
    'machine_enclosure',
    'machine enclosure',
    'contains',
    'fully-enclosed cabin with interlocked sliding door + polycarbonate viewport',
    [
      word(
        'sheet_steel_panel_word',
        'sheet steel enclosure panel',
        cc('sheet_steel_panel', 'sheet steel enclosure panel', null, 'steel'),
        [
          mod('quantity', '×6'),
          mod('dimension', '2', 'mm'),
          mod('form', 'powder-coated'),
        ],
      ),
      word(
        'polycarbonate_viewport_word',
        'polycarbonate viewport',
        cc('polycarbonate_viewport', 'polycarbonate viewport', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×2'),
          mod('dimension', '12', 'mm'),
          mod('regulatory', 'EN 12415 Class B'),
        ],
      ),
      word(
        'sliding_door_interlock_word',
        'sliding door interlock',
        cc('sliding_door_interlock', 'sliding door interlock', 'electromechanical_switching_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'Schmersal AZM-300 solenoid'),
          mod('regulatory', 'EN 60204-1 + ISO 14119'),
        ],
      ),
      word(
        'emergency_stop_red_word',
        'red emergency stop',
        cc('emergency_stop_red', 'red emergency stop', 'electromechanical_switching_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×4'),
          mod('form', 'Eaton M22-PV mushroom'),
          mod('regulatory', 'EN ISO 13850'),
        ],
      ),
      word(
        'fire_suppression_co2_word',
        'CO₂ fire suppression',
        cc('fire_suppression_co2', 'CO₂ fire suppression', 'chemical_sensing_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'Firetrace tubing detection'),
          mod('regulatory', 'NFPA 12'),
        ],
      ),
    ],
  )

  return {
    module: 'safety_enclosure_doors',
    module_brief: `Fully enclosed 2 mm sheet-steel cabin with 12 mm polycarbonate EN 12415 Class B viewports, Schmersal AZM-300 solenoid interlocked sliding door, four Eaton M22-PV emergency stops and Firetrace CO₂ in-machine fire suppression.`,
    overview_paragraph_en: '',
    derived_parameters: {
      enclosure_class: p.spindlePowerKw >= 25 ? 2 : 1,
      estop_count: 4,
    },
    allowed_radicals: [
      'electromechanical_switching_function',
      'chemical_sensing_function',
      'steel',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [enclosure] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 8. electrical_cabinet
// ---------------------------------------------------------------------------

function emitElectricalCabinet(p: CncParams): DesignModule {
  const cabinet = makeSub(
    'electrical_cabinet_assembly',
    'electrical cabinet assembly',
    'distributes',
    `IP55 Rittal cabinet with 400 V 3-phase + 24 V DC backplane, air-conditioned`,
    [
      word(
        'rittal_cabinet_word',
        'Rittal cabinet',
        cc('rittal_cabinet', 'Rittal cabinet', null, 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'TS 8806 IP55'),
          mod('regulatory', 'EN 62208'),
        ],
      ),
      word(
        'main_disconnect_word',
        'main disconnect',
        cc('main_disconnect', 'main disconnect', 'electromechanical_switching_function', 'copper'),
        [
          mod('quantity', '×1'),
          mod('form', 'rotary lockable handle'),
          mod('capacity', '125', 'A'),
        ],
      ),
      word(
        'mcb_motor_protection_word',
        'motor protection MCB',
        cc('mcb_motor_protection', 'motor protection MCB', 'electromechanical_switching_function', 'copper'),
        [
          mod('quantity', fmtQty(p.axesCount + 1)),
          mod('form', 'Schneider GV2-ME'),
          mod('regulatory', 'IEC 60947-4-1'),
        ],
      ),
      word(
        'cabinet_air_conditioner_word',
        'cabinet air conditioner',
        cc('cabinet_air_conditioner', 'cabinet air conditioner', 'thermal_transfer_function', 'aluminium_alloy'),
        [
          mod('quantity', '×1'),
          mod('form', 'Rittal SK 3304'),
          mod('capacity', '1', 'kW cooling'),
        ],
      ),
      word(
        'psu_24v_dc_word',
        '24 V DC PSU',
        cc('psu_24v_dc', '24 V DC PSU', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('capacity', '20', 'A'),
          mod('form', 'Phoenix Contact QUINT4'),
        ],
      ),
    ],
  )

  return {
    module: 'electrical_cabinet',
    module_brief: `Rittal TS 8806 IP55 enclosure housing 125 A rotary main disconnect, ${p.axesCount + 1}× Schneider GV2-ME motor protection MCBs, 1 kW Rittal SK 3304 air conditioner and 20 A Phoenix Contact QUINT4 24 V DC supply.`,
    overview_paragraph_en: '',
    derived_parameters: {
      cabinet_bus_voltage_v: p.busVoltageV,
      cabinet_cooling_kw: 1,
    },
    allowed_radicals: [
      'silicon_semiconductor_function',
      'electromechanical_switching_function',
      'thermal_transfer_function',
      'copper',
      'steel',
    ],
    applicability_confidence: 'high',
    sub_modules: [cabinet] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 9. hmi_jog_pendant
// ---------------------------------------------------------------------------

function emitHmiJogPendant(p: CncParams): DesignModule {
  const hmi = makeSub(
    'cnc_hmi_console',
    'CNC HMI console',
    'displays',
    '19" full-keyboard HMI + wireless jog pendant',
    [
      word(
        'hmi_19in_panel_word',
        '19" HMI panel',
        cc('hmi_19in_panel', '19" HMI panel', 'optical_sensing_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', p.isFiveAxis ? 'Heidenhain TNC 640 19" IPS' : 'Siemens MCP 483 / Fanuc PANEL i'),
          mod('regulatory', 'IP54'),
        ],
      ),
      word(
        'jog_pendant_handwheel_word',
        'jog pendant handwheel',
        cc('jog_pendant_handwheel', 'jog pendant handwheel', 'electromechanical_switching_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'Heidenhain HR 550FS wireless'),
          mod('regulatory', 'EN 13849 PL d'),
        ],
      ),
      word(
        'feed_override_switch_word',
        'feed override switch',
        cc('feed_override_switch', 'feed override switch', 'electromechanical_switching_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×2'),
          mod('form', '23-position rotary'),
        ],
      ),
      word(
        'cycle_start_button_word',
        'cycle-start button',
        cc('cycle_start_button', 'cycle-start button', 'electromechanical_switching_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'illuminated green'),
        ],
      ),
    ],
  )

  return {
    module: 'hmi_jog_pendant',
    module_brief: `Heidenhain HR 550FS wireless jog pendant (EN 13849 PL d) paired with a panel-mount 19" IPS HMI carrying the CNC keyboard, two 23-position feed-override switches and an illuminated cycle-start button.`,
    overview_paragraph_en: '',
    derived_parameters: {
      hmi_in: 19,
    },
    allowed_radicals: [
      'optical_sensing_function',
      'electromechanical_switching_function',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [hmi] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 10. foundation_levelling
// ---------------------------------------------------------------------------

function emitFoundationLevelling(p: CncParams): DesignModule {
  const foundation = makeSub(
    'machine_foundation',
    'machine foundation',
    'isolates',
    'reinforced concrete pad + vibration-isolating wedge-jack feet',
    [
      word(
        'reinforced_concrete_pad_word',
        'reinforced concrete pad',
        cc('reinforced_concrete_pad', 'reinforced concrete pad', null, 'concrete'),
        [
          mod('quantity', '×1'),
          mod('dimension', '200', 'mm thick'),
          mod('regulatory', 'EN 1992-1-1 (Eurocode 2)'),
        ],
      ),
      word(
        'wedge_jack_levelling_foot_word',
        'wedge-jack levelling foot',
        cc('wedge_jack_levelling_foot', 'wedge-jack levelling foot', 'mechanical_actuation_function', 'steel'),
        [
          mod('quantity', '×6'),
          mod('form', 'AirLoc 1108 KSPL'),
          mod('capacity', '5000', 'kg each'),
        ],
      ),
      word(
        'vibration_isolation_pad_word',
        'vibration isolation pad',
        cc('vibration_isolation_pad', 'vibration isolation pad', 'mechanical_actuation_function', 'polymer_elastomer'),
        [
          mod('quantity', '×6'),
          mod('form', 'sorbothane'),
        ],
      ),
      word(
        'precision_levelling_block_word',
        'precision levelling block',
        cc('precision_levelling_block', 'precision levelling block', 'mechanical_actuation_function', 'steel'),
        [
          mod('quantity', '×4'),
          mod('form', '0.02 mm/m precision'),
          mod('regulatory', 'DIN 876'),
        ],
      ),
    ],
  )

  return {
    module: 'foundation_levelling',
    module_brief: `200 mm Eurocode 2 reinforced-concrete pad supports six 5000 kg AirLoc 1108 KSPL wedge-jack levelling feet on sorbothane vibration-isolation pads, with four DIN 876 0.02 mm/m precision levelling blocks for fine adjust.`,
    overview_paragraph_en: '',
    derived_parameters: {
      foundation_thickness_mm: 200,
      levelling_precision_mm_per_m: 0.02,
      machine_dry_mass_kg: Math.round(p.spindlePowerKw * 250),
    },
    allowed_radicals: [
      'mechanical_actuation_function',
      'concrete',
      'polymer_elastomer',
      'steel',
    ],
    applicability_confidence: 'high',
    sub_modules: [foundation] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// CROSS-MODULE GRAMMAR LINKS
// ---------------------------------------------------------------------------

function emitGrammarLinks(_p: CncParams): unknown[] {
  return [
    { from_module: 'controller_cnc', to_module: 'x_y_z_axis_servos', mechanism: 'ethercat_bus', type: 'mutual', detail: 'EtherCAT 1 ms position loop' },
    { from_module: 'controller_cnc', to_module: 'spindle_assembly', mechanism: 'profinet_or_drive_bus', type: 'mutual', detail: 'Sinamics S120 spindle drive bus' },
    { from_module: 'controller_cnc', to_module: 'atc_tool_changer', mechanism: 'plc_io', type: 'directional', detail: 'tool-pot selection + swing-arm sequencing' },
    { from_module: 'controller_cnc', to_module: 'coolant_chip_management', mechanism: 'plc_io', type: 'directional', detail: 'coolant M7/M8/M9 + chip-conveyor enable' },
    { from_module: 'controller_cnc', to_module: 'safety_enclosure_doors', mechanism: 'safety_bus', type: 'mutual', detail: 'AZM-300 door lock + 4× E-stop into Pilz PNOZmulti' },
    { from_module: 'electrical_cabinet', to_module: 'controller_cnc', mechanism: 'power_bus', type: 'directional', detail: '400 V 3-phase + 24 V DC backplane' },
    { from_module: 'electrical_cabinet', to_module: 'x_y_z_axis_servos', mechanism: 'power_bus', type: 'directional', detail: '400 V DC link to servo drives' },
    { from_module: 'electrical_cabinet', to_module: 'spindle_assembly', mechanism: 'power_bus', type: 'directional', detail: 'Sinamics S120 to spindle motor' },
    { from_module: 'bed_frame_machine_tool', to_module: 'x_y_z_axis_servos', mechanism: 'mechanical_mount', type: 'directional', detail: 'linear guideways bolt to bed + column' },
    { from_module: 'bed_frame_machine_tool', to_module: 'spindle_assembly', mechanism: 'mechanical_mount', type: 'directional', detail: 'spindle head rides on Z-axis column' },
    { from_module: 'safety_enclosure_doors', to_module: 'bed_frame_machine_tool', mechanism: 'mechanical_mount', type: 'directional', detail: 'enclosure frame bolts to bed base' },
    { from_module: 'foundation_levelling', to_module: 'bed_frame_machine_tool', mechanism: 'mechanical_mount', type: 'directional', detail: 'machine rests on six wedge-jack feet over concrete pad' },
    { from_module: 'hmi_jog_pendant', to_module: 'controller_cnc', mechanism: 'usb_ethernet', type: 'mutual', detail: 'HR 550FS handwheel over wireless, panel HMI over Ethernet' },
    { from_module: 'coolant_chip_management', to_module: 'safety_enclosure_doors', mechanism: 'fluid_containment', type: 'directional', detail: 'enclosure contains coolant + chip debris within machine cabin' },
  ]
}

// ---------------------------------------------------------------------------
// BRIEF OVERVIEW PROSE
// ---------------------------------------------------------------------------

function emitBriefOverviewProse(p: CncParams): DesignJSON['brief_overview_prose'] {
  return {
    overview_and_context: '',
    mission_statement: `Deliver a ${p.isFiveAxis ? '5-axis simultaneous' : '3-axis'} CNC machining centre with a ${p.spindlePowerKw.toFixed(0)} kW ${p.maxSpindleRpm.toFixed(0)} rpm motorised spindle, ${p.bedTravelXMm.toFixed(0)} × ${p.bedTravelYMm.toFixed(0)} × ${p.bedTravelZMm.toFixed(0)} mm travel and ${p.atcSlots}-slot ATC, certified to EN 60204-1 + EN 12417.`,
    target_customers: '',
    why_now: '',
  }
}

// ---------------------------------------------------------------------------
// PUBLIC EMITTER ENTRY POINT
// ---------------------------------------------------------------------------

export function emitCncMachineDesign(
  contract: ContractInProgress,
  _brief: ParsedConstraints,
  _envelope: BriefEnvelope,
): DesignJSON {
  const p = deriveParams(contract)
  const modules: DesignModule[] = [
    emitBedFrame(p),
    emitAxisServos(p),
    emitSpindleAssembly(p),
    emitAtcToolChanger(p),
    emitCoolantChipManagement(p),
    emitControllerCnc(p),
    emitSafetyEnclosure(p),
    emitElectricalCabinet(p),
    emitHmiJogPendant(p),
    emitFoundationLevelling(p),
  ]
  return {
    modules,
    cross_module_grammar_links: emitGrammarLinks(p),
    excluded_modules: [],
    rationale_excluded: 'All 10 canonical CNC modules apply to the 2-50 kW 3-axis or 5-axis envelope.',
    brief_overview_prose: emitBriefOverviewProse(p),
  }
}

registerAssembler('cnc_machine', emitCncMachineDesign)
registerAssembler('cnc_machine/milling_3axis', emitCncMachineDesign)
registerAssembler('cnc_machine/milling_5axis', emitCncMachineDesign)
