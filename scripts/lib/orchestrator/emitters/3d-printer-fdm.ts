/**
 * scripts/lib/orchestrator/emitters/3d-printer-fdm.ts
 *
 * 3D PRINTER (fused-deposition) DETERMINISTIC EMITTER — BESS-quality
 * per the 2026-05-22 hand-tuning batch.
 *
 * Industry references: Prusa MK4S, Bambu Lab X1-Carbon, Ultimaker S7
 * (desktop tier), Stratasys F900, Markforged FX20 (industrial tier).
 * Default envelope: 220×220×250 mm desktop FDM with single direct-drive
 * extruder + heated chamber. Industrial extension uses motorised X-Y
 * gantry + actively heated chamber.
 *
 * Reproducibility contract: pure function, no I/O, all numerical fields
 * read from contract.quantities. LLM narrator fills prose fields later.
 *
 * Modules emitted (8): x_y_axis_motion, z_axis_motion, hot_end_extruder,
 *   heated_chamber_enclosure, controller_pcb, filament_handling_feeder,
 *   cooling_fans, ui_display_touch.
 */

import type {
  BriefEnvelope,
  ContractInProgress,
  ParsedConstraints,
} from '../types'
import type { DesignJSON, DesignModule } from '../assembler'
import { registerAssembler } from '../assembler'

// ---------------------------------------------------------------------------
// LOCAL TYPES (mirror DeterministicDesign structure)
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
interface Word {
  id: string
  name_human: string
  content_character: ContentCharacter
  modifier_characters: ModifierCharacter[]
}
interface SubModule {
  id: string
  name_human: string
  english_sentence: string
  rad_syntax: string
  role_verb: string
  topology_clause: string
  words: Word[]
}

function q(contract: ContractInProgress, key: string, fallback: number): number {
  const v = (contract.quantities as Record<string, { value: number } | undefined>)?.[key]?.value
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function fmtQty(n: number): string {
  if (Number.isInteger(n)) return `×${n}`
  return `×${n.toFixed(2)}`
}

function mod(kind: string, value: string, unit?: string): ModifierCharacter {
  return unit !== undefined ? { kind, value, unit } : { kind, value }
}

function cc(
  character_id: string,
  name_human: string,
  fp: string | null,
  mp: string | null,
  fs: string | null = null,
  ms: string | null = null,
): ContentCharacter {
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
      const modsOrdered = [...w.modifier_characters].sort((a, b) => {
        if (a.kind === 'quantity' && b.kind !== 'quantity') return -1
        if (b.kind === 'quantity' && a.kind !== 'quantity') return 1
        return 0
      })
      const tokens = modsOrdered.map((m) => (m.unit ? `${m.value}${m.unit}` : m.value))
      if (tokens.length === 0) return w.content_character.character_id
      return `${w.content_character.character_id} (${tokens.join(', ')})`
    })
    .join(' ⊙ ')
}

function makeSub(id: string, name: string, role: string, topology: string, words: Word[]): SubModule {
  return { id, name_human: name, english_sentence: '', rad_syntax: synthRad(words), role_verb: role, topology_clause: topology, words }
}

// ---------------------------------------------------------------------------
// PARAMS — reads from contract, falls back to Prusa MK4S-class defaults.
// ---------------------------------------------------------------------------

interface FdmParams {
  buildVolumeL: number
  buildX: number
  buildY: number
  buildZ: number
  nozzleTempC: number
  bedTempC: number
  chamberTempC: number
  maxPrintSpeedMmS: number
  filamentDiameterMm: number
  isIndustrial: boolean
  axesCount: number
}

function deriveParams(c: ContractInProgress): FdmParams {
  const buildVolumeL = q(c, 'build_volume_l', 12)  // 220×220×250 mm ≈ 12 L
  // Heuristic split: cube-root build volume to side length in mm.
  const cube = Math.cbrt(buildVolumeL * 1000) * 10  // mm
  const buildX = Math.max(100, cube)
  const buildY = Math.max(100, cube)
  const buildZ = Math.max(100, cube)
  const nozzleTempC = q(c, 'nozzle_temp_c', 260)
  const bedTempC = q(c, 'bed_temp_c', 100)
  // Industrial-class chamber heating (PEEK/PEKK) typically 70-180 °C.
  const chamberTempC = q(c, 'chamber_temp_c', nozzleTempC >= 350 ? 120 : 50)
  const maxPrintSpeedMmS = q(c, 'max_print_speed_mm_s', 200)
  const filamentDiameterMm = q(c, 'filament_diameter_mm', 1.75)
  // Industrial threshold: chamber actively heated AND nozzle ≥350 °C OR buildVolume ≥ 100 L.
  const isIndustrial = buildVolumeL >= 100 || nozzleTempC >= 350
  // Cartesian 3-axis (X/Y/Z) is default. CoreXY adds 1.
  const axesCount = 3
  return { buildVolumeL, buildX, buildY, buildZ, nozzleTempC, bedTempC, chamberTempC, maxPrintSpeedMmS, filamentDiameterMm, isIndustrial, axesCount }
}

// ---------------------------------------------------------------------------
// 1. x_y_axis_motion
// ---------------------------------------------------------------------------

function emitXYAxisMotion(p: FdmParams): DesignModule {
  const stepperCount = p.isIndustrial ? 4 : 2
  const xyMotion = makeSub(
    'corexy_motion_stage',
    'CoreXY motion stage',
    'positions',
    `2-stepper CoreXY belt-driven gantry on linear rails, ${p.maxPrintSpeedMmS.toFixed(0)} mm/s max`,
    [
      word(
        'corexy_stepper_motor_word',
        'CoreXY stepper motor',
        cc('corexy_stepper_motor', 'CoreXY stepper motor', 'electric_motor_function', 'silicon_steel'),
        [
          mod('quantity', fmtQty(stepperCount)),
          mod('form', 'NEMA 17 hybrid'),
          mod('capacity', '0.48', 'Nm'),
          mod('regulatory', 'IEC 60034-1'),
        ],
      ),
      word(
        'gt2_drive_belt_word',
        'GT2 drive belt',
        cc('gt2_drive_belt', 'GT2 drive belt', 'mechanical_actuation_function', 'polymer_elastomer'),
        [
          mod('quantity', '×2'),
          mod('dimension', '6', 'mm width'),
          mod('form', 'fibreglass-reinforced'),
        ],
      ),
      word(
        'linear_rail_mgn12_word',
        'linear rail MGN12',
        cc('linear_rail_mgn12', 'linear rail MGN12', 'mechanical_actuation_function', 'steel'),
        [
          mod('quantity', '×3'),
          mod('dimension', String(p.buildX.toFixed(0)), 'mm length'),
          mod('regulatory', 'ISO 13399'),
        ],
      ),
      word(
        'idler_pulley_word',
        'idler pulley',
        cc('idler_pulley', 'idler pulley', 'mechanical_actuation_function', 'aluminium_alloy'),
        [
          mod('quantity', '×6'),
          mod('form', '20T smooth'),
        ],
      ),
      word(
        'stepper_driver_tmc2209_word',
        'stepper driver TMC2209',
        cc('stepper_driver_tmc2209', 'TMC2209 stepper driver', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', fmtQty(stepperCount)),
          mod('form', 'StealthChop2 256 µstep'),
          mod('capacity', '2.0', 'A RMS'),
        ],
      ),
      // 2026-05-24 (orphan-fix): macro-anchor word for engineering-contract
      // macro `motion_system_gantry` — strict matcher needs ALL semantic
      // tokens (motion, system, gantry) in the word_id. This single line
      // receives the full gantry sub-system macro total.
      word(
        'motion_system_gantry_word',
        'motion system gantry',
        cc('motion_system_gantry', 'motion system gantry', 'mechanical_actuation_function', 'aluminium_alloy'),
        [
          mod('quantity', '×1'),
          mod('form', 'CoreXY belt + linear rail gantry sub-system'),
        ],
      ),
    ],
  )

  return {
    module: 'x_y_axis_motion',
    module_brief: `CoreXY belt + linear-rail X-Y motion stage capable of ${p.maxPrintSpeedMmS.toFixed(0)} mm/s with 2× NEMA 17 steppers and TMC2209 quiet-step drivers across a ${p.buildX.toFixed(0)} × ${p.buildY.toFixed(0)} mm work area.`,
    overview_paragraph_en: '',
    derived_parameters: {
      max_print_speed_mm_s: p.maxPrintSpeedMmS,
      build_x_mm: p.buildX,
      build_y_mm: p.buildY,
      axes_count: p.axesCount,
    },
    allowed_radicals: [
      'electric_motor_function',
      'mechanical_actuation_function',
      'silicon_semiconductor_function',
      'silicon_steel',
      'polymer_elastomer',
    ],
    applicability_confidence: 'high',
    sub_modules: [xyMotion] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 2. z_axis_motion
// ---------------------------------------------------------------------------

function emitZAxisMotion(p: FdmParams): DesignModule {
  const zMotion = makeSub(
    'z_lead_screw_stage',
    'Z lead-screw stage',
    'lifts',
    `dual lead-screw build-plate Z drive, ${p.buildZ.toFixed(0)} mm travel`,
    [
      word(
        'z_stepper_motor_word',
        'Z stepper motor',
        cc('z_stepper_motor', 'Z stepper motor', 'electric_motor_function', 'silicon_steel'),
        [
          mod('quantity', '×2'),
          mod('form', 'NEMA 17 with TR8 lead screw'),
          mod('capacity', '0.45', 'Nm'),
        ],
      ),
      word(
        't8_lead_screw_word',
        'T8 lead screw',
        cc('t8_lead_screw', 'T8 lead screw', 'mechanical_actuation_function', 'steel'),
        [
          mod('quantity', '×2'),
          mod('dimension', String(p.buildZ.toFixed(0)), 'mm'),
          mod('form', '8 mm 2-start'),
        ],
      ),
      word(
        'z_anti_backlash_nut_word',
        'Z anti-backlash nut',
        cc('z_anti_backlash_nut', 'Z anti-backlash nut', 'mechanical_actuation_function', 'brass'),
        [
          mod('quantity', '×2'),
          mod('form', 'spring-loaded'),
        ],
      ),
      word(
        'build_plate_heated_word',
        'heated build plate',
        cc('build_plate_heated', 'heated build plate', 'thermal_transfer_function', 'aluminium_alloy'),
        [
          mod('quantity', '×1'),
          mod('capacity', String(Math.round(p.bedTempC)), '°C max'),
          mod('dimension', `${p.buildX.toFixed(0)}×${p.buildY.toFixed(0)}`, 'mm'),
        ],
      ),
      word(
        'pei_print_sheet_word',
        'PEI print sheet',
        cc('pei_print_sheet', 'PEI print sheet', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'textured/smooth dual-sided'),
        ],
      ),
    ],
  )

  return {
    module: 'z_axis_motion',
    module_brief: `Dual T8 lead-screw Z stage lifts the ${p.buildX.toFixed(0)} × ${p.buildY.toFixed(0)} mm heated build plate over ${p.buildZ.toFixed(0)} mm travel, bed surface PEI-coated for adhesion + release.`,
    overview_paragraph_en: '',
    derived_parameters: {
      build_z_mm: p.buildZ,
      bed_temp_c: p.bedTempC,
    },
    allowed_radicals: [
      'electric_motor_function',
      'mechanical_actuation_function',
      'thermal_transfer_function',
      'aluminium_alloy',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [zMotion] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 3. hot_end_extruder
// ---------------------------------------------------------------------------

function emitHotEndExtruder(p: FdmParams): DesignModule {
  const hotend = makeSub(
    'hotend_assembly',
    'hotend assembly',
    'melts',
    `direct-drive hotend running ${p.nozzleTempC.toFixed(0)} °C`,
    [
      word(
        'heater_block_word',
        'heater block',
        cc('heater_block', 'heater block', 'thermal_transfer_function', 'brass'),
        [
          mod('quantity', '×1'),
          mod('form', 'E3D V6-class brass'),
        ],
      ),
      word(
        'heater_cartridge_word',
        'cartridge heater',
        cc('heater_cartridge', 'cartridge heater', 'thermal_transfer_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('capacity', '50', 'W'),
          mod('dimension', '24', 'V'),
        ],
      ),
      word(
        'thermistor_pt1000_word',
        'PT1000 thermistor',
        cc('thermistor_pt1000', 'PT1000 thermistor', 'thermal_sensing_function', 'platinum'),
        [
          mod('quantity', '×1'),
          mod('form', 'glass-bead PT1000'),
          mod('regulatory', 'DIN EN 60751 Class B'),
        ],
      ),
      word(
        'hardened_steel_nozzle_word',
        'hardened steel nozzle',
        cc('hardened_steel_nozzle', 'hardened steel nozzle', 'mechanical_actuation_function', 'tool_steel'),
        [
          mod('quantity', '×1'),
          mod('dimension', '0.4', 'mm'),
          mod('form', 'CHT high-flow'),
        ],
      ),
      word(
        'titanium_heatbreak_word',
        'titanium heatbreak',
        cc('titanium_heatbreak', 'titanium heatbreak', 'thermal_transfer_function', 'titanium_alloy'),
        [
          mod('quantity', '×1'),
          mod('form', 'bi-metallic Cu-Ti'),
        ],
      ),
      word(
        'extruder_drive_gear_word',
        'extruder drive gear',
        cc('extruder_drive_gear', 'extruder drive gear', 'mechanical_actuation_function', 'tool_steel'),
        [
          mod('quantity', '×2'),
          mod('form', 'dual-drive hardened'),
          mod('dimension', String(p.filamentDiameterMm.toFixed(2)), 'mm filament'),
        ],
      ),
      // 2026-05-24 (orphan-fix): macro-anchor word for engineering-contract
      // macro `extruder_hotend_assembly` — needs both 'extruder' AND 'hotend'
      // substrings in word_id for the strict matcher.
      word(
        'extruder_hotend_assembly_word',
        'extruder hotend assembly',
        cc('extruder_hotend_assembly', 'extruder hotend assembly', 'thermal_transfer_function', 'tool_steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'direct-drive extruder + hotend integrated assembly'),
        ],
      ),
    ],
  )

  return {
    module: 'hot_end_extruder',
    module_brief: `E3D V6-class direct-drive hotend with 50 W cartridge heater, PT1000 thermistor and 0.4 mm CHT high-flow hardened-steel nozzle running ${p.nozzleTempC.toFixed(0)} °C maximum.`,
    overview_paragraph_en: '',
    derived_parameters: {
      nozzle_temp_c: p.nozzleTempC,
      filament_diameter_mm: p.filamentDiameterMm,
      heater_w: 50,
    },
    allowed_radicals: [
      'thermal_transfer_function',
      'mechanical_actuation_function',
      'thermal_sensing_function',
      'brass',
      'tool_steel',
      'titanium_alloy',
    ],
    applicability_confidence: 'high',
    sub_modules: [hotend] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 4. heated_chamber_enclosure
// ---------------------------------------------------------------------------

function emitHeatedChamberEnclosure(p: FdmParams): DesignModule {
  const enclosure = makeSub(
    'enclosure_frame',
    'enclosure frame',
    'encloses',
    `${p.isIndustrial ? 'actively' : 'passively'} heated chamber at ${p.chamberTempC.toFixed(0)} °C`,
    [
      word(
        'frame_extrusion_2020_word',
        'frame extrusion 2020',
        cc('frame_extrusion_2020', 'frame extrusion 2020', null, 'aluminium_alloy'),
        [
          mod('quantity', '×16'),
          mod('form', '2020 V-slot anodised'),
          mod('regulatory', 'ISO 9001'),
        ],
      ),
      word(
        'tempered_glass_panel_word',
        'tempered glass panel',
        cc('tempered_glass_panel', 'tempered glass panel', null, 'glass'),
        [
          mod('quantity', '×4'),
          mod('dimension', '4', 'mm'),
          mod('regulatory', 'EN 12150 toughened'),
        ],
      ),
      word(
        'chamber_door_latch_word',
        'chamber door latch',
        cc('chamber_door_latch', 'chamber door latch', 'electromechanical_switching_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'safety-interlocked'),
          mod('regulatory', 'EN 60204-1'),
        ],
      ),
      // 2026-05-24 (orphan-fix): macro-anchor word for engineering-contract
      // macro `enclosure_filtration` — needs 'filtration' substring in word_id.
      word(
        'enclosure_filtration_word',
        'enclosure filtration',
        cc('enclosure_filtration', 'enclosure filtration', 'fluid_flow_state', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'HEPA + activated-carbon VOC filtration sub-system'),
          mod('regulatory', 'EN ISO 16000-1'),
        ],
      ),
    ],
  )

  const chamberHeating = makeSub(
    'chamber_heating',
    'chamber heating',
    p.isIndustrial ? 'heats' : 'retains',
    p.isIndustrial ? 'forced-air heater + insulation maintains 70-180 °C' : 'passive heat retention from build plate',
    p.isIndustrial
      ? [
          word(
            'chamber_heater_ptc_word',
            'PTC chamber heater',
            cc('chamber_heater_ptc', 'PTC chamber heater', 'thermal_transfer_function', 'ceramic'),
            [
              mod('quantity', '×2'),
              mod('capacity', '600', 'W each'),
              mod('regulatory', 'UL 60730'),
            ],
          ),
          word(
            'chamber_fan_circulation_word',
            'chamber circulation fan',
            cc('chamber_fan_circulation', 'chamber circulation fan', 'fluid_flow_state', 'polymer_thermoplastic'),
            [
              mod('quantity', '×2'),
              mod('form', '120 mm high-temp'),
              mod('capacity', '200', 'CFM'),
            ],
          ),
          word(
            'rockwool_insulation_word',
            'rockwool insulation',
            cc('rockwool_insulation', 'rockwool insulation', null, 'mineral_fibre_material'),
            [
              mod('quantity', '×1'),
              mod('dimension', '25', 'mm'),
              mod('regulatory', 'EN 13501 A1 non-comb.'),
            ],
          ),
        ]
      : [
          word(
            'enclosure_seal_strip_word',
            'enclosure seal strip',
            cc('enclosure_seal_strip', 'enclosure seal strip', null, 'polymer_elastomer'),
            [
              mod('quantity', '×8'),
              mod('form', 'EPDM D-section'),
            ],
          ),
        ],
  )

  return {
    module: 'heated_chamber_enclosure',
    module_brief: p.isIndustrial
      ? `Actively heated chamber: ${600 * 2} W PTC heaters + dual 120 mm circulation fans + 25 mm rockwool insulation maintain ${p.chamberTempC.toFixed(0)} °C for PEEK/PEKK/Ultem prints.`
      : `Passively retained chamber framed in 2020 V-slot aluminium extrusion with 4 mm toughened glass panels and EPDM-sealed doors; bed radiation alone maintains ${p.chamberTempC.toFixed(0)} °C.`,
    overview_paragraph_en: '',
    derived_parameters: {
      chamber_temp_c: p.chamberTempC,
      is_industrial: p.isIndustrial ? 1 : 0,
    },
    allowed_radicals: [
      'thermal_transfer_function',
      'fluid_flow_state',
      'electromechanical_switching_function',
      'aluminium_alloy',
      'glass',
    ],
    applicability_confidence: 'high',
    sub_modules: [enclosure, chamberHeating] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 5. controller_pcb
// ---------------------------------------------------------------------------

function emitControllerPcb(p: FdmParams): DesignModule {
  const ctrl = makeSub(
    'controller_board',
    'controller board',
    'controls',
    'Klipper-class 32-bit MCU + RPI host running motion + thermal loops',
    [
      word(
        'main_mcu_stm32_word',
        'STM32 main MCU',
        cc('main_mcu_stm32', 'STM32 main MCU', 'silicon_semiconductor_function', 'silicon'),
        [
          mod('quantity', '×1'),
          mod('form', 'STM32F407VG / RP2040 dual-issue'),
          mod('capacity', '168', 'MHz'),
        ],
      ),
      word(
        'host_compute_rpi_word',
        'Raspberry Pi host compute',
        cc('host_compute_rpi', 'host compute board', 'silicon_semiconductor_function', 'silicon'),
        [
          mod('quantity', '×1'),
          mod('form', 'Raspberry Pi 4B Klipper host'),
          mod('capacity', '4', 'GB RAM'),
        ],
      ),
      word(
        'psu_24v_word',
        '24 V PSU',
        cc('psu_24v', '24 V PSU', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('capacity', '350', 'W'),
          mod('form', 'Mean Well RSP-350-24'),
          mod('regulatory', 'IEC 60950-1'),
        ],
      ),
      word(
        'mosfet_bed_heater_word',
        'bed heater MOSFET',
        cc('mosfet_bed_heater', 'bed heater MOSFET', 'silicon_semiconductor_function', 'silicon'),
        [
          mod('quantity', '×1'),
          mod('form', 'IRFB3077 N-channel'),
          mod('capacity', '120', 'A'),
        ],
      ),
      word(
        'thermal_fuse_120c_word',
        'thermal fuse',
        cc('thermal_fuse_120c', '120 °C thermal fuse', 'electromechanical_switching_function', 'metal_alloy'),
        [
          mod('quantity', '×2'),
          mod('form', 'one-shot'),
          mod('regulatory', 'UL 60730-2-9'),
        ],
      ),
      // 2026-05-24 (orphan-fix): macro-anchor word for engineering-contract
      // macro `control_board_motherboard` — needs both 'control' and 'board'
      // substrings in word_id.
      word(
        'control_board_motherboard_word',
        'control board motherboard',
        cc('control_board_motherboard', 'control board motherboard', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', '32-bit ARM main control board + motherboard PCB'),
        ],
      ),
    ],
  )

  return {
    module: 'controller_pcb',
    module_brief: `STM32F407VG / RP2040 motion controller plus Raspberry Pi 4B Klipper host on a 350 W Mean Well 24 V supply, with redundant 120 °C thermal fuses on every heater leg.`,
    overview_paragraph_en: '',
    derived_parameters: {
      psu_w: 350,
      bus_voltage_v: 24,
    },
    allowed_radicals: [
      'silicon_semiconductor_function',
      'electromechanical_switching_function',
      'silicon',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [ctrl] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 6. filament_handling_feeder
// ---------------------------------------------------------------------------

function emitFilamentHandling(p: FdmParams): DesignModule {
  const feeder = makeSub(
    'filament_feeder',
    'filament feeder',
    'feeds',
    'spool → drybox → runout sensor → Bowden/direct path',
    [
      word(
        'filament_spool_holder_word',
        'filament spool holder',
        cc('filament_spool_holder', 'filament spool holder', 'mechanical_actuation_function', 'aluminium_alloy'),
        [
          mod('quantity', '×1'),
          mod('form', 'roller-bearing'),
          mod('capacity', '1', 'kg spool'),
        ],
      ),
      word(
        'filament_drybox_word',
        'filament drybox',
        cc('filament_drybox', 'filament drybox', 'thermal_transfer_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'PTC-heated desiccant box'),
          mod('capacity', '60', '°C max'),
        ],
      ),
      word(
        'filament_runout_sensor_word',
        'filament runout sensor',
        cc('filament_runout_sensor', 'filament runout sensor', 'optical_sensing_function', 'silicon'),
        [
          mod('quantity', '×1'),
          mod('form', 'optical lever switch'),
          mod('dimension', String(p.filamentDiameterMm.toFixed(2)), 'mm'),
        ],
      ),
      word(
        'ptfe_bowden_tube_word',
        'PTFE Bowden tube',
        cc('ptfe_bowden_tube', 'PTFE Bowden tube', 'mechanical_actuation_function', 'ptfe_polymer'),
        [
          mod('quantity', '×1'),
          mod('form', 'Capricorn XS 1.9 mm ID'),
        ],
      ),
      // 2026-05-24 (orphan-fix): macro-anchor word for engineering-contract
      // macro `filament_feed_system` — needs both 'filament' and 'feed'
      // substrings in word_id.
      word(
        'filament_feed_system_word',
        'filament feed system',
        cc('filament_feed_system', 'filament feed system', 'mechanical_actuation_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'spool → drybox → runout sensor → Bowden feed sub-system'),
        ],
      ),
    ],
  )

  return {
    module: 'filament_handling_feeder',
    module_brief: `Spool holder + PTC-heated desiccant drybox (60 °C) + optical runout sensor + Capricorn XS PTFE Bowden path feeds ${p.filamentDiameterMm.toFixed(2)} mm filament to the hotend.`,
    overview_paragraph_en: '',
    derived_parameters: {
      filament_diameter_mm: p.filamentDiameterMm,
      drybox_temp_c: 60,
    },
    allowed_radicals: [
      'mechanical_actuation_function',
      'thermal_transfer_function',
      'optical_sensing_function',
      'polymer_thermoplastic',
      'ptfe_polymer',
    ],
    applicability_confidence: 'high',
    sub_modules: [feeder] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 7. cooling_fans
// ---------------------------------------------------------------------------

function emitCoolingFans(_p: FdmParams): DesignModule {
  const fans = makeSub(
    'cooling_fan_set',
    'cooling fan set',
    'cools',
    'part-cooling + hotend-fan + electronics fan loops',
    [
      word(
        'part_cooling_fan_word',
        'part cooling fan',
        cc('part_cooling_fan', 'part cooling fan', 'fluid_flow_state', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', '4015 axial high-pressure'),
          mod('capacity', '12', 'CFM'),
        ],
      ),
      word(
        'hotend_heatsink_fan_word',
        'hotend heatsink fan',
        cc('hotend_heatsink_fan', 'hotend heatsink fan', 'fluid_flow_state', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', '3010 axial'),
          mod('capacity', '5', 'CFM'),
        ],
      ),
      word(
        'electronics_bay_fan_word',
        'electronics bay fan',
        cc('electronics_bay_fan', 'electronics bay fan', 'fluid_flow_state', 'polymer_thermoplastic'),
        [
          mod('quantity', '×2'),
          mod('form', '6010 axial'),
          mod('capacity', '20', 'CFM'),
        ],
      ),
    ],
  )

  return {
    module: 'cooling_fans',
    module_brief: 'Three-loop cooling: 4015 axial part-cooling fan, 3010 hotend heatsink fan, and dual 6010 axial fans extracting heat from the electronics bay.',
    overview_paragraph_en: '',
    derived_parameters: {
      fan_count: 4,
    },
    allowed_radicals: [
      'fluid_flow_state',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [fans] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// 8. ui_display_touch
// ---------------------------------------------------------------------------

function emitUiDisplay(_p: FdmParams): DesignModule {
  const ui = makeSub(
    'touch_display',
    'touch display',
    'displays',
    '7" capacitive touchscreen + emergency stop',
    [
      word(
        'touchscreen_7in_word',
        '7" touchscreen',
        cc('touchscreen_7in', '7" touchscreen', 'optical_sensing_function', 'glass'),
        [
          mod('quantity', '×1'),
          mod('form', '1024×600 IPS capacitive'),
          mod('regulatory', 'EN 60950-1'),
        ],
      ),
      word(
        'ui_rotary_encoder_word',
        'UI rotary encoder',
        cc('ui_rotary_encoder', 'UI rotary encoder', 'electromechanical_switching_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'detent click-push'),
        ],
      ),
      word(
        'estop_mushroom_word',
        'emergency stop mushroom',
        cc('estop_mushroom', 'emergency stop mushroom', 'electromechanical_switching_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'Eaton M22-PV'),
          mod('regulatory', 'EN ISO 13850'),
        ],
      ),
    ],
  )

  return {
    module: 'ui_display_touch',
    module_brief: '7" 1024×600 IPS capacitive touchscreen plus a redundant rotary encoder and Eaton M22-PV mushroom-head emergency stop wired to the safety interlock loop.',
    overview_paragraph_en: '',
    derived_parameters: {
      display_in: 7,
      display_pixels_x: 1024,
      display_pixels_y: 600,
    },
    allowed_radicals: [
      'optical_sensing_function',
      'electromechanical_switching_function',
      'glass',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [ui] as unknown[],
  }
}

// ---------------------------------------------------------------------------
// CROSS-MODULE GRAMMAR LINKS
// ---------------------------------------------------------------------------

function emitGrammarLinks(_p: FdmParams): unknown[] {
  return [
    { from_module: 'controller_pcb', to_module: 'x_y_axis_motion', mechanism: 'step_dir_bus', type: 'directional', detail: 'TMC2209 STEP/DIR + UART to MCU' },
    { from_module: 'controller_pcb', to_module: 'z_axis_motion', mechanism: 'step_dir_bus', type: 'directional', detail: 'Z TMC2209 STEP/DIR + UART' },
    { from_module: 'controller_pcb', to_module: 'hot_end_extruder', mechanism: 'pwm_thermal_loop', type: 'mutual', detail: 'PT1000 → 25 ms PID → cartridge PWM' },
    { from_module: 'controller_pcb', to_module: 'cooling_fans', mechanism: 'pwm_fan_bus', type: 'directional', detail: '4-wire PWM @ 25 kHz to all fan headers' },
    { from_module: 'controller_pcb', to_module: 'ui_display_touch', mechanism: 'usb_uart', type: 'mutual', detail: 'host RPi runs Klipper Web UI' },
    { from_module: 'hot_end_extruder', to_module: 'filament_handling_feeder', mechanism: 'filament_path', type: 'mutual', detail: 'PTFE Bowden routes filament to drive gear' },
    { from_module: 'hot_end_extruder', to_module: 'cooling_fans', mechanism: 'air_path', type: 'mutual', detail: 'part-cooling fan ducted at nozzle tip' },
    { from_module: 'z_axis_motion', to_module: 'heated_chamber_enclosure', mechanism: 'mechanical_mount', type: 'directional', detail: 'bed rides on Z stage inside chamber' },
    { from_module: 'x_y_axis_motion', to_module: 'heated_chamber_enclosure', mechanism: 'mechanical_mount', type: 'directional', detail: 'CoreXY gantry bolts to top-rail of frame' },
    { from_module: 'ui_display_touch', to_module: 'heated_chamber_enclosure', mechanism: 'mechanical_mount', type: 'directional', detail: 'touchscreen panel-mounted on front face' },
  ]
}

// ---------------------------------------------------------------------------
// BRIEF OVERVIEW PROSE
// ---------------------------------------------------------------------------

function emitBriefOverviewProse(p: FdmParams): DesignJSON['brief_overview_prose'] {
  return {
    overview_and_context: '',
    mission_statement: `Deliver a ${p.isIndustrial ? 'industrial' : 'desktop'} fused-deposition 3D printer with a ${p.buildX.toFixed(0)} × ${p.buildY.toFixed(0)} × ${p.buildZ.toFixed(0)} mm build volume, ${p.maxPrintSpeedMmS.toFixed(0)} mm/s max print speed, and a hotend running ${p.nozzleTempC.toFixed(0)} °C / bed at ${p.bedTempC.toFixed(0)} °C${p.isIndustrial ? ` with actively heated ${p.chamberTempC.toFixed(0)} °C chamber` : ''}.`,
    target_customers: '',
    why_now: '',
  }
}

// ---------------------------------------------------------------------------
// PUBLIC EMITTER ENTRY POINT
// ---------------------------------------------------------------------------

export function emitFdmPrinterDesign(
  contract: ContractInProgress,
  _brief: ParsedConstraints,
  _envelope: BriefEnvelope,
): DesignJSON {
  const p = deriveParams(contract)
  const modules: DesignModule[] = [
    emitXYAxisMotion(p),
    emitZAxisMotion(p),
    emitHotEndExtruder(p),
    emitHeatedChamberEnclosure(p),
    emitControllerPcb(p),
    emitFilamentHandling(p),
    emitCoolingFans(p),
    emitUiDisplay(p),
  ]
  return {
    modules,
    cross_module_grammar_links: emitGrammarLinks(p),
    excluded_modules: [],
    rationale_excluded: 'All 8 canonical FDM modules apply to the desktop + industrial tier envelope.',
    brief_overview_prose: emitBriefOverviewProse(p),
  }
}

registerAssembler('3d_printer_fdm', emitFdmPrinterDesign)
registerAssembler('3d_printer_fdm/desktop', emitFdmPrinterDesign)
registerAssembler('3d_printer_fdm/industrial', emitFdmPrinterDesign)
