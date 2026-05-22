/**
 * scripts/lib/orchestrator/emitters/e_bike.ts
 *
 * e-BIKE DETERMINISTIC EMITTER — electric bicycle, 250-750 W motor,
 * 14-36 V battery. Real parts: Bosch Performance Line CX mid-drive,
 * Shimano EP8 / Brose S Mag, Samsung INR21700-50E cells, Magura MT5
 * brakes, Brose CTM controller, MAHLE X20 hub motor.
 */

import { registerAssembler } from '../assembler'
import type { ClassEmitter, DesignJSON } from '../assembler'
import type { ContractInProgress } from '../types'

type ModifierCharacter = { kind: string; value: string; unit?: string }

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
  const v = (contract.quantities as Record<string, { value?: number }> | undefined)?.[key]?.value
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
): ContentCharacter {
  return { character_id, name_human, function_radical_primary: fp, function_radical_secondary: null, material_radical_primary: mp, material_radical_secondary: null }
}

function word(id: string, name_human: string, content: ContentCharacter, modifiers: ModifierCharacter[]): Word {
  // Universal fix #A (2026-05-22): strip literal " word" suffix from name_human.
  const cleanName = name_human.replace(/\s+word$/i, '')
  return { id, name_human: cleanName, content_character: content, modifier_characters: modifiers }
}

function synthesizeRadSyntax(words: Word[]): string {
  return words
    .map((w) => {
      const tokens = w.modifier_characters
        .slice()
        .sort((a, b) => (a.kind === 'quantity' ? -1 : b.kind === 'quantity' ? 1 : 0))
        .map((m) => (m.unit ? `${m.value}${m.unit}` : m.value))
      if (tokens.length === 0) return w.content_character.character_id
      return `${w.content_character.character_id} (${tokens.join(', ')})`
    })
    .join(' ⊙ ')
}

function makeSubModule(id: string, name_human: string, role_verb: string, topology_clause: string, words: Word[]): SubModule {
  return { id, name_human, english_sentence: '', rad_syntax: synthesizeRadSyntax(words), role_verb, topology_clause, words }
}

// ---------------------------------------------------------------------------
// PARAMS
// ---------------------------------------------------------------------------

interface EbikeParams {
  motorW: number
  batteryKwh: number
  rangeKm: number
  totalMassKg: number
  // Tool-derived
  cellCount: number
  packVoltageV: number
  packMassKg: number
  maxSpeedKmh: number
  gearRatio: number
  motorRpm: number
  maxThrustN: number
  rollingResistanceN: number
  totalDragN: number
  totalPowerRequiredW: number
  batteryPowerRequiredW: number
}

function deriveEbikeParams(c: ContractInProgress): EbikeParams {
  const motorW = q(c, 'rated_motor_power_w', 250)
  const batteryKwh = q(c, 'battery_kwh', 0.5)
  const rangeKm = q(c, 'range_km', 80)
  const totalMassKg = q(c, 'total_mass_kg', 25)

  // Tool-derived
  const cellCount = Math.max(1, Math.round(q(c, 'cell_count', batteryKwh * 1000 / 3.7 / 4.9)))
  const packVoltageV = q(c, 'battery_v', 36)
  const packMassKg = q(c, 'pack_mass_kg', batteryKwh * 6)  // ~150 Wh/kg pack
  const maxSpeedKmh = q(c, 'max_speed_kmh', 25)
  const gearRatio = q(c, 'gear_ratio', 2.73)
  const motorRpm = q(c, 'motor_rpm_at_speed', 950)
  const maxThrustN = q(c, 'max_thrust_n', 130)
  const rollingResistanceN = q(c, 'rolling_drag_n', 6.5)
  const totalDragN = q(c, 'total_drag_n', 25)
  const totalPowerRequiredW = q(c, 'total_power_required_w', 196)
  const batteryPowerRequiredW = q(c, 'battery_power_required_w', motorW)

  return {
    motorW, batteryKwh, rangeKm, totalMassKg,
    cellCount, packVoltageV, packMassKg,
    maxSpeedKmh, gearRatio, motorRpm, maxThrustN,
    rollingResistanceN, totalDragN, totalPowerRequiredW, batteryPowerRequiredW,
  }
}

// ---------------------------------------------------------------------------
// MODULE 1 — frame_structure
// ---------------------------------------------------------------------------

function emitFrameStructure(p: EbikeParams) {
  const mainFrame = makeSubModule(
    'main_frame_assembly',
    'main frame assembly',
    'carries',
    `hydroformed Al alloy main frame, ${p.totalMassKg.toFixed(1)} kg total e-bike mass`,
    [
      word('aluminium_frame_hydroformed_word', 'aluminium frame hydroformed',
        cc('aluminium_frame_hydroformed', 'hydroformed Al frame', 'mechanical_load_function', 'aluminium'),
        [mod('quantity', '×1'), mod('form', '6061-T6 hydroformed step-thru'), mod('regulatory', 'EN 15194')]),
      word('rear_seat_stay_word', 'rear seat stay',
        cc('rear_seat_stay', 'rear seat stay', 'mechanical_load_function', 'aluminium'),
        [mod('quantity', '×2'), mod('form', 'integrated dropouts + motor mount')]),
      word('headset_bearing_word', 'headset bearing',
        cc('headset_bearing', 'headset bearing', 'mechanical_load_function', 'steel'),
        [mod('quantity', '×1'), mod('form', 'Cane Creek 40 IS42 tapered')]),
    ],
  )

  const fork = makeSubModule(
    'front_fork_assembly',
    'front fork assembly',
    'absorbs',
    'suspension fork for ride comfort + handling',
    [
      word('suspension_fork_word', 'suspension fork',
        cc('suspension_fork', 'suspension fork', 'mechanical_load_function', 'aluminium'),
        [mod('quantity', '×1'), mod('dimension', '80', 'mm travel'), mod('form', 'RockShox Reba 30/SR Suntour SF18')]),
    ],
  )

  return {
    module: 'frame_structure',
    module_brief: `6061-T6 aluminium hydroformed step-thru frame with integrated motor mount + dropouts, Cane Creek 40 tapered headset, RockShox Reba 30 suspension fork (80 mm travel). EN 15194 e-bike standard compliance.`,
    overview_paragraph_en: '',
    derived_parameters: {
      total_mass_kg: p.totalMassKg,
      frame_material: 'Al-6061-T6',
    },
    allowed_radicals: [
      'mechanical_load_function',
      'aluminium',
      'steel',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [mainFrame, fork],
  }
}

// ---------------------------------------------------------------------------
// MODULE 2 — drive_motor_assembly
// ---------------------------------------------------------------------------

function emitDriveMotorAssembly(p: EbikeParams) {
  const midDriveMotor = makeSubModule(
    'mid_drive_motor',
    'mid-drive motor',
    'powers',
    `${p.motorW.toFixed(0)} W Bosch Performance Line CX mid-drive at bottom bracket`,
    [
      word('mid_drive_motor_word', 'mid-drive motor',
        cc('mid_drive_motor', 'mid-drive motor', 'electromagnetic_force_function', 'rare_earth_magnet'),
        [mod('quantity', '×1'), mod('capacity', String(p.motorW.toFixed(0)), 'W'), mod('form', 'Bosch Performance Line CX Gen4 / Shimano EP8 / Brose S Mag'), mod('dimension', String(p.packVoltageV.toFixed(0)), 'V'), mod('regulatory', 'EN 15194')]),
      word('torque_sensor_pedal_word', 'torque sensor pedal',
        cc('torque_sensor_pedal', 'torque sensor pedal', 'silicon_semiconductor_function', 'silicon_wafer'),
        [mod('quantity', '×1'), mod('form', 'integrated 36-magnet pole-wheel + Hall array')]),
    ],
  )

  return {
    module: 'drive_motor_assembly',
    module_brief: `Bosch Performance Line CX Gen4 / Shimano EP8 mid-drive motor at bottom bracket, ${p.motorW.toFixed(0)} W rated @ ${p.packVoltageV.toFixed(0)} V, peak torque 85 N·m. Integrated 36-magnet pedal torque sensor. EN 15194 certified.`,
    overview_paragraph_en: '',
    derived_parameters: {
      motor_rated_w: p.motorW,
      motor_voltage_v: p.packVoltageV,
      motor_rpm_at_speed: p.motorRpm,
    },
    allowed_radicals: [
      'electromagnetic_force_function',
      'silicon_semiconductor_function',
      'rare_earth_magnet',
      'silicon_wafer',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [midDriveMotor],
  }
}

// ---------------------------------------------------------------------------
// MODULE 3 — battery_pack
// ---------------------------------------------------------------------------

function emitBatteryPack(p: EbikeParams) {
  const batteryPack = makeSubModule(
    'lithium_ion_battery_pack',
    'lithium-ion battery pack',
    'stores',
    `${(p.batteryKwh * 1000).toFixed(0)} Wh removable down-tube Li-ion pack @ ${p.packVoltageV.toFixed(0)} V`,
    [
      word('lithium_18650_cell_word', 'lithium 18650 cell',
        cc('lithium_18650_cell', 'lithium-ion 18650 cell', 'electrochemical_energy_function', 'lithium_nmc_chemistry'),
        [mod('quantity', fmtQty(p.cellCount)), mod('capacity', '4.9', 'Ah'), mod('form', 'Samsung INR21700-50E / LG M50LT'), mod('dimension', '3.7', 'V'), mod('regulatory', 'UN 38.3'), mod('lifecycle', '500 cyc to 80% SoH')]),
      word('battery_pack_enclosure_word', 'battery pack enclosure',
        cc('battery_pack_enclosure', 'battery pack enclosure', 'mechanical_load_function', 'aluminium'),
        [mod('quantity', '×1'), mod('form', 'Bosch PowerTube 500 / 625 / 750 down-tube'), mod('regulatory', 'IPX6')]),
      word('battery_keylock_word', 'battery keylock',
        cc('battery_keylock', 'battery keylock', 'mechanical_load_function', 'steel'),
        [mod('quantity', '×1'), mod('form', 'Abus Plus key + tamper sensor')]),
    ],
  )

  return {
    module: 'battery_pack',
    module_brief: `${(p.batteryKwh * 1000).toFixed(0)} Wh Bosch PowerTube down-tube battery, ${p.packVoltageV.toFixed(0)} V, ${p.cellCount} Samsung INR21700-50E cells (4.9 Ah, 3.7 V nominal). IPX6 sealed, Abus Plus keylock. UN 38.3 transport certified.`,
    overview_paragraph_en: '',
    derived_parameters: {
      battery_kwh: p.batteryKwh,
      cell_count: p.cellCount,
      pack_voltage_v: p.packVoltageV,
      pack_mass_kg: p.packMassKg,
    },
    allowed_radicals: [
      'electrochemical_energy_function',
      'lithium_nmc_chemistry',
      'mechanical_load_function',
      'aluminium',
      'steel',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [batteryPack],
  }
}

// ---------------------------------------------------------------------------
// MODULE 4 — controller_BMS
// ---------------------------------------------------------------------------

function emitControllerBMS(p: EbikeParams) {
  const motorController = makeSubModule(
    'motor_controller',
    'motor controller',
    'controls',
    `motor controller in motor housing, ${(p.motorW / p.packVoltageV).toFixed(0)} A continuous`,
    [
      word('motor_controller_pcb_word', 'motor controller PCB',
        cc('motor_controller_pcb', 'motor controller PCB', 'silicon_semiconductor_function', 'fr4'),
        [mod('quantity', '×1'), mod('capacity', String((p.motorW / p.packVoltageV).toFixed(0)), 'A'), mod('form', 'integrated FOC controller, 6× MOSFET inverter bridge')]),
    ],
  )

  const bms = makeSubModule(
    'battery_management_system',
    'battery management system',
    'monitors',
    'BMS PCB inside battery enclosure with per-cell voltage + thermal sensing',
    [
      word('bms_pcb_word', 'BMS PCB',
        cc('bms_pcb', 'BMS PCB', 'silicon_semiconductor_function', 'fr4'),
        [mod('quantity', '×1'), mod('form', 'BQ76930-class 10S BMS with passive balancing')]),
      word('bms_thermistor_word', 'BMS thermistor',
        cc('bms_thermistor', 'BMS thermistor', 'silicon_semiconductor_function', 'ceramic'),
        [mod('quantity', '×4'), mod('form', 'NTC 10k thermistor per cell group')]),
    ],
  )

  return {
    module: 'controller_BMS',
    module_brief: `Field-oriented control (FOC) motor controller integrated in motor housing, 6× MOSFET inverter bridge, ${(p.motorW / p.packVoltageV).toFixed(0)} A continuous. BQ76930-class 10S BMS PCB in battery enclosure with 4× NTC 10k thermistors and passive cell balancing.`,
    overview_paragraph_en: '',
    derived_parameters: {
      controller_current_a: p.motorW / p.packVoltageV,
      bms_thermistor_count: 4,
    },
    allowed_radicals: [
      'silicon_semiconductor_function',
      'fr4',
      'ceramic',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [motorController, bms],
  }
}

// ---------------------------------------------------------------------------
// MODULE 5 — transmission_gearing
// ---------------------------------------------------------------------------

function emitTransmissionGearing(p: EbikeParams) {
  const drivetrain = makeSubModule(
    'drivetrain_chain_cassette',
    'drivetrain chain cassette',
    'transmits',
    `chain drivetrain with ${p.gearRatio.toFixed(2)}:1 effective gear ratio for ${p.maxSpeedKmh.toFixed(0)} km/h max speed`,
    [
      word('chain_chainring_drivetrain_word', 'chain chainring drivetrain',
        cc('chain_chainring_drivetrain', 'chain chainring drivetrain', 'mechanical_load_function', 'steel'),
        [mod('quantity', '×1'), mod('form', 'KMC e10 EPT 10-speed chain + Shimano CS-M5100 cassette')]),
      word('chainring_alloy_word', 'chainring alloy',
        cc('chainring_alloy', 'chainring alloy', 'mechanical_load_function', 'aluminium'),
        [mod('quantity', '×1'), mod('form', '34T Praxis aluminium chainring')]),
      word('derailleur_rear_word', 'derailleur rear',
        cc('derailleur_rear', 'rear derailleur', 'mechanical_load_function', 'aluminium'),
        [mod('quantity', '×1'), mod('form', 'Shimano Deore RD-M5100 SGS')]),
    ],
  )

  return {
    module: 'transmission_gearing',
    module_brief: `KMC e10 EPT 10-speed chain + Shimano CS-M5100 cassette + 34T Praxis aluminium chainring + Shimano Deore RD-M5100 SGS rear derailleur. Effective gear ratio ${p.gearRatio.toFixed(2)}:1 supporting ${p.maxSpeedKmh.toFixed(0)} km/h max assisted speed.`,
    overview_paragraph_en: '',
    derived_parameters: {
      gear_ratio: p.gearRatio,
      max_speed_kmh: p.maxSpeedKmh,
    },
    allowed_radicals: [
      'mechanical_load_function',
      'steel',
      'aluminium',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [drivetrain],
  }
}

// ---------------------------------------------------------------------------
// MODULE 6 — brakes_safety
// ---------------------------------------------------------------------------

function emitBrakesSafety(p: EbikeParams) {
  const hydraulicDisc = makeSubModule(
    'hydraulic_disc_brakes',
    'hydraulic disc brakes',
    'stops',
    `4-piston hydraulic disc brakes sized for ${p.totalMassKg.toFixed(0)} kg + rider`,
    [
      word('hydraulic_disc_caliper_word', 'hydraulic disc caliper',
        cc('hydraulic_disc_caliper', 'hydraulic disc caliper', 'mechanical_load_function', 'aluminium'),
        [mod('quantity', '×2'), mod('form', 'Magura MT5 4-piston / SRAM Code R'), mod('regulatory', 'ISO 4210-5')]),
      word('brake_rotor_disc_word', 'brake rotor disc',
        cc('brake_rotor_disc', 'brake rotor disc', 'mechanical_load_function', 'steel'),
        [mod('quantity', '×2'), mod('dimension', '203', 'mm'), mod('form', 'Magura Storm HC 203 mm front/180 mm rear')]),
      word('brake_lever_word', 'brake lever',
        cc('brake_lever', 'brake lever', 'mechanical_load_function', 'aluminium'),
        [mod('quantity', '×2'), mod('form', 'Magura MT5 lever + ESI grip')]),
    ],
  )

  return {
    module: 'brakes_safety',
    module_brief: `Magura MT5 4-piston hydraulic disc brakes with 203 mm Magura Storm HC front rotor + 180 mm rear rotor. ISO 4210-5 compliance. Sized for ${p.totalMassKg.toFixed(0)} kg + 80 kg rider braking from ${p.maxSpeedKmh.toFixed(0)} km/h.`,
    overview_paragraph_en: '',
    derived_parameters: {
      rotor_diameter_front_mm: 203,
      rotor_diameter_rear_mm: 180,
    },
    allowed_radicals: [
      'mechanical_load_function',
      'aluminium',
      'steel',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [hydraulicDisc],
  }
}

// ---------------------------------------------------------------------------
// MODULE 7 — electrical_lights_display
// ---------------------------------------------------------------------------

function emitElectricalLightsDisplay(p: EbikeParams) {
  const lighting = makeSubModule(
    'led_lighting_system',
    'LED lighting system',
    'illuminates',
    'StVZO-compliant LED headlight + tail light powered by main battery',
    [
      word('led_headlight_word', 'LED headlight',
        cc('led_headlight', 'LED headlight', 'optical_imaging_function', 'aluminium'),
        [mod('quantity', '×1'), mod('capacity', '70', 'lux'), mod('form', 'Busch+Müller IQ-XS / Lupine SL Mono'), mod('regulatory', 'StVZO TA22')]),
      word('led_tail_light_word', 'LED tail light',
        cc('led_tail_light', 'LED tail light', 'optical_imaging_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'Busch+Müller Toplight Line Senso brake-sensing'), mod('regulatory', 'StVZO')]),
    ],
  )

  const display = makeSubModule(
    'handlebar_display_unit',
    'handlebar display unit',
    'displays',
    'touchscreen display for assist mode + battery SoC + speed + range',
    [
      word('handlebar_display_word', 'handlebar display',
        cc('handlebar_display', 'handlebar display', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'Bosch Kiox 300 / Shimano EW-RS910 colour display'), mod('regulatory', 'IPX7')]),
      word('thumb_remote_word', 'thumb remote',
        cc('thumb_remote', 'thumb remote', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [mod('quantity', '×1'), mod('form', 'Bosch LED Remote / left-hand thumb switch')]),
    ],
  )

  return {
    module: 'electrical_lights_display',
    module_brief: `Busch+Müller IQ-XS 70 lux LED headlight + Toplight Line Senso brake-sensing tail light (StVZO TA22). Bosch Kiox 300 / Shimano EW-RS910 colour display showing assist mode + battery SoC + speed + range. Powered from main battery via DC-DC step-down. Range ${p.rangeKm.toFixed(0)} km @ medium assist.`,
    overview_paragraph_en: '',
    derived_parameters: {
      headlight_lux: 70,
      display_count: 1,
    },
    allowed_radicals: [
      'optical_imaging_function',
      'silicon_semiconductor_function',
      'aluminium',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [lighting, display],
  }
}

// ---------------------------------------------------------------------------
// MODULE 8 — anti_theft_GPS
// ---------------------------------------------------------------------------

function emitAntiTheftGPS(_p: EbikeParams) {
  const gpsTracker = makeSubModule(
    'gps_tracker_unit',
    'GPS tracker unit',
    'tracks',
    'integrated GPS tracker with cellular uplink for anti-theft recovery',
    [
      word('gps_tracker_lte_word', 'GPS tracker LTE',
        cc('gps_tracker_lte', 'GPS tracker LTE', 'silicon_semiconductor_function', 'fr4'),
        [mod('quantity', '×1'), mod('form', 'PowUnity BikeTrax / Vodafone Curve LTE-M'), mod('regulatory', 'CE RED + GDPR')]),
      word('accelerometer_tamper_word', 'accelerometer tamper',
        cc('accelerometer_tamper', 'accelerometer tamper', 'inertial_sensing_function', 'silicon_wafer'),
        [mod('quantity', '×1'), mod('form', 'Bosch BMA250 motion + tamper detection')]),
    ],
  )

  const wheelLock = makeSubModule(
    'frame_wheel_lock',
    'frame wheel lock',
    'immobilises',
    'frame-mounted wheel lock for short-term parking',
    [
      word('frame_wheel_lock_word', 'frame wheel lock',
        cc('frame_wheel_lock', 'frame wheel lock', 'mechanical_load_function', 'steel'),
        [mod('quantity', '×1'), mod('form', 'AXA Defender RL Plug-in 95'), mod('regulatory', 'ART 2-star')]),
    ],
  )

  return {
    module: 'anti_theft_GPS',
    module_brief: `PowUnity BikeTrax / Vodafone Curve LTE-M GPS tracker with Bosch BMA250 motion + tamper detection. AXA Defender RL Plug-in 95 frame wheel lock (ART 2-star). CE RED + GDPR compliant.`,
    overview_paragraph_en: '',
    derived_parameters: {
      gps_tracker_count: 1,
    },
    allowed_radicals: [
      'silicon_semiconductor_function',
      'inertial_sensing_function',
      'mechanical_load_function',
      'fr4',
      'silicon_wafer',
      'steel',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [gpsTracker, wheelLock],
  }
}

// ---------------------------------------------------------------------------
// CROSS-MODULE GRAMMAR LINKS
// ---------------------------------------------------------------------------

function emitCrossModuleGrammarLinks() {
  return [
    { from_module: 'battery_pack', to_module: 'drive_motor_assembly', mechanism: 'electrical_bus', type: 'directional' as const, detail: '36 V DC bus from battery to motor controller' },
    { from_module: 'controller_BMS', to_module: 'drive_motor_assembly', mechanism: 'control', type: 'directional' as const, detail: 'FOC torque command to motor' },
    { from_module: 'controller_BMS', to_module: 'battery_pack', mechanism: 'control', type: 'mutual' as const, detail: 'BMS cell-monitor + balance' },
    { from_module: 'drive_motor_assembly', to_module: 'transmission_gearing', mechanism: 'mechanical', type: 'directional' as const, detail: 'motor torque → chainring → cassette' },
    { from_module: 'transmission_gearing', to_module: 'frame_structure', mechanism: 'mechanical', type: 'directional' as const, detail: 'drivetrain mounted on frame BB' },
    { from_module: 'drive_motor_assembly', to_module: 'frame_structure', mechanism: 'mechanical', type: 'directional' as const, detail: 'motor housing bolted to frame' },
    { from_module: 'brakes_safety', to_module: 'frame_structure', mechanism: 'mechanical', type: 'directional' as const, detail: 'brake calipers mounted on frame + fork' },
    { from_module: 'electrical_lights_display', to_module: 'battery_pack', mechanism: 'electrical_bus', type: 'directional' as const, detail: '5V DC-DC step-down for display + lights' },
    { from_module: 'anti_theft_GPS', to_module: 'frame_structure', mechanism: 'mechanical', type: 'directional' as const, detail: 'GPS tracker hidden in seat tube' },
    { from_module: 'anti_theft_GPS', to_module: 'battery_pack', mechanism: 'electrical_bus', type: 'directional' as const, detail: 'low-power 5V from battery for GPS' },
  ]
}

// ---------------------------------------------------------------------------
// MAIN EMITTER
// ---------------------------------------------------------------------------

const emitEbikeDesign: ClassEmitter = (contract, _brief, _envelope): DesignJSON => {
  const p = deriveEbikeParams(contract)
  const modules = [
    emitFrameStructure(p),
    emitDriveMotorAssembly(p),
    emitBatteryPack(p),
    emitControllerBMS(p),
    emitTransmissionGearing(p),
    emitBrakesSafety(p),
    emitElectricalLightsDisplay(p),
    emitAntiTheftGPS(p),
  ]

  return {
    modules: modules as unknown as DesignJSON['modules'],
    cross_module_grammar_links: emitCrossModuleGrammarLinks(),
    excluded_modules: [],
    rationale_excluded: 'All 8 canonical modules apply to electric bicycle class.',
    brief_overview_prose: {
      overview_and_context: '',
      mission_statement: `Deliver ${p.rangeKm.toFixed(0)} km range at ${p.maxSpeedKmh.toFixed(0)} km/h assisted top speed with a ${p.motorW.toFixed(0)} W Bosch Performance Line CX / Shimano EP8 mid-drive e-bike, ${(p.batteryKwh * 1000).toFixed(0)} Wh removable down-tube battery, EN 15194 + StVZO TA22 certified.`,
      target_customers: '',
      why_now: '',
    },
  }
}

registerAssembler('e_bike', emitEbikeDesign)
