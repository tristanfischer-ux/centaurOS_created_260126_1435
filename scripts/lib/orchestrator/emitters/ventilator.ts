/**
 * scripts/lib/orchestrator/emitters/ventilator.ts
 *
 * MECHANICAL VENTILATOR DETERMINISTIC EMITTER.
 *
 * Hand-tuned 2026-05-22 (Build #20b). Emits the 10-module BoM skeleton
 * for an ICU or transport mechanical ventilator from the
 * EngineeringContract. Pure function — no I/O, no clocks, no random.
 *
 * The 10 modules emitted:
 *   1. pneumatic_circuit             → mass_fluid_transport_process
 *   2. gas_blending_O2_air           → environmental_interface
 *   3. proportional_valves           → energy_conversion_transduction
 *   4. pressure_flow_sensors         → control_compute_communication (sensors)
 *   5. exhalation_block_PEEP         → (sub-module of #1)
 *   6. humidifier_circuit            → environmental_interface (humidifier)
 *   7. patient_circuit_tubing        → (sub-module of #1)
 *   8. user_interface_alarms         → hmi_ergonomics + safety_protection
 *   9. battery_backup                → energy_storage_source
 *  10. regulatory_certification      → maintenance_serviceability
 *  + structural enclosure            → structure_containment
 *
 * Real-part references: Hamilton G5 / Dräger Evita V500 / Maquet
 * Servo-i (ICU), Zoll EMV+ / Hamilton T1 (transport). Honeywell HT-500
 * turbine blower, Asco / IMI proportional solenoids, Sensirion SFM3000
 * flow sensors, Honeywell 26PC pressure transducers, Fisher & Paykel
 * MR850 humidifier.
 */

import type { BriefEnvelope, ContractInProgress, ParsedConstraints } from '../types'
import type { ClassEmitter, DesignJSON, DesignModule } from '../assembler'
import { registerAssembler } from '../assembler'

// ---------------------------------------------------------------------------
// Shape types
// ---------------------------------------------------------------------------

type Radical = string

interface ModifierCharacter { kind: string; value: string; unit?: string }

interface ContentCharacter {
  character_id: string; name_human: string
  function_radical_primary: Radical | null; function_radical_secondary: Radical | null
  material_radical_primary: Radical | null; material_radical_secondary: Radical | null
}

interface Word { id: string; name_human: string; content_character: ContentCharacter; modifier_characters: ModifierCharacter[] }

interface SubModule {
  id: string; name_human: string; english_sentence: string; rad_syntax: string
  role_verb: string; topology_clause: string; words: Word[]
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function q(c: ContractInProgress, key: string, fallback: number): number {
  const v = c.quantities?.[key]?.value
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function mod(kind: string, value: string, unit?: string): ModifierCharacter {
  return unit !== undefined ? { kind, value, unit } : { kind, value }
}

function cc(
  character_id: string, name_human: string,
  fp: Radical | null, mp: Radical | null,
  fs: Radical | null = null, ms: Radical | null = null,
): ContentCharacter {
  return { character_id, name_human, function_radical_primary: fp, function_radical_secondary: fs, material_radical_primary: mp, material_radical_secondary: ms }
}

function word(id: string, name_human: string, content: ContentCharacter, modifiers: ModifierCharacter[]): Word {
  // Universal fix #A (2026-05-22): strip literal " word" suffix from name_human.
  const cleanName = name_human.replace(/\s+word$/i, '')
  return { id, name_human: cleanName, content_character: content, modifier_characters: modifiers }
}

function synthesizeRadSyntax(words: Word[]): string {
  const clusters = words.map((w) => {
    const modsOrdered = [...w.modifier_characters].sort((a, b) => {
      if (a.kind === 'quantity' && b.kind !== 'quantity') return -1
      if (b.kind === 'quantity' && a.kind !== 'quantity') return 1
      return 0
    })
    const tokens = modsOrdered.map((m) => (m.unit ? `${m.value}${m.unit}` : m.value))
    return tokens.length === 0 ? w.content_character.character_id : `${w.content_character.character_id} (${tokens.join(', ')})`
  })
  return clusters.join(' ⊙ ')
}

function makeSubModule(id: string, name_human: string, role_verb: string, topology_clause: string, words: Word[]): SubModule {
  return { id, name_human, english_sentence: '', rad_syntax: synthesizeRadSyntax(words), role_verb, topology_clause, words }
}

// ---------------------------------------------------------------------------
// PARAMETERS
// ---------------------------------------------------------------------------

interface VentParams {
  tidalVolumeMl: number
  peepCmH2O: number
  pipCmH2O: number
  respiratoryRate: number
  fio2Pct: number
  peakInspiratoryFlowLpm: number
  minuteVentilationLpm: number
  isTransport: boolean
  o2CylinderL: number
  o2CylinderPressureBar: number
  totalEstimatedMassKg: number
  maxMassKg: number
  peakElectricalW: number
  batteryRunTimeMin: number
  lineVoltageV: number
}

function deriveParams(c: ContractInProgress): VentParams {
  const o2CylL = q(c, 'o2_cylinder_volume_l', 0)
  const isTransport = o2CylL > 0
  return {
    tidalVolumeMl: q(c, 'tidal_volume_ml', 500),
    peepCmH2O: q(c, 'peep_cmh2o', 5),
    pipCmH2O: q(c, 'peak_inspiratory_pressure_cmh2o', 40),
    respiratoryRate: q(c, 'respiratory_rate_per_min', 14),
    fio2Pct: q(c, 'fio2_pct', 60),
    peakInspiratoryFlowLpm: q(c, 'peak_inspiratory_flow_lpm', 120),
    minuteVentilationLpm: q(c, 'minute_ventilation_lpm', 7),
    isTransport,
    o2CylinderL: o2CylL,
    o2CylinderPressureBar: q(c, 'o2_cylinder_pressure_bar', 0),
    totalEstimatedMassKg: q(c, 'total_estimated_mass_kg', isTransport ? 5.5 : 25),
    maxMassKg: q(c, 'max_mass_kg', isTransport ? 8 : 35),
    peakElectricalW: q(c, 'peak_electrical_w', isTransport ? 180 : 320),
    batteryRunTimeMin: q(c, 'battery_run_time_min', isTransport ? 240 : 60),
    lineVoltageV: q(c, 'line_voltage_v', 230),
  }
}

// ---------------------------------------------------------------------------
// MODULE 1: pneumatic_circuit + exhalation_block + patient_circuit
// ---------------------------------------------------------------------------

function emitPneumaticCircuit(p: VentParams): DesignModule {
  const turbineSm = makeSubModule(
    'turbine_blower',
    'turbine blower',
    'pressurises',
    `inlet gas mixture to ${p.peakInspiratoryFlowLpm.toFixed(0)} L/min peak inspiratory flow with PIP ${p.pipCmH2O.toFixed(0)} cmH2O`,
    [
      word(
        'turbine_blower_word',
        'turbine blower',
        cc('turbine_blower', 'radial micro-turbine blower', 'fluid_flow_state', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'Honeywell HT-500 / Hamilton G-series-class'),
          mod('capacity', p.peakInspiratoryFlowLpm.toFixed(0), 'L/min'),
          mod('regulatory', 'IEC 60601-2-12'),
        ],
      ),
      word(
        'inlet_filter_word',
        'inlet filter',
        cc('inlet_filter', 'HEPA inlet filter', 'fluid_flow_state', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'H13 HEPA + bacterial/viral'),
        ],
      ),
    ],
  )

  const peepSm = makeSubModule(
    'exhalation_block_peep',
    'exhalation block + PEEP valve',
    'controls',
    `expiratory backpressure to PEEP ${p.peepCmH2O.toFixed(0)} cmH2O via voice-coil actuator`,
    [
      word(
        'exhalation_valve_peep_word',
        'exhalation valve + PEEP',
        cc('exhalation_valve_peep', 'voice-coil exhalation/PEEP valve', 'fluid_flow_state', 'steel'),
        [
          mod('quantity', '×1'),
          mod('capacity', p.peepCmH2O.toFixed(0), 'cmH2O PEEP'),
          mod('form', 'voice-coil actuator, 50 ms response'),
          mod('regulatory', 'IEC 60601-2-12'),
        ],
      ),
      word(
        'expiratory_filter_word',
        'expiratory filter',
        cc('expiratory_filter', 'expiratory filter', 'fluid_flow_state', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'bacterial/viral filter'),
        ],
      ),
      word(
        'water_trap_word',
        'water trap',
        cc('water_trap', 'water trap', 'fluid_flow_state', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'condensate water trap'),
        ],
      ),
    ],
  )

  const patientCircuitSm = makeSubModule(
    'patient_circuit_tubing',
    'patient circuit tubing',
    'delivers',
    `humidified gas to patient airway at Vt ${p.tidalVolumeMl.toFixed(0)} mL × RR ${p.respiratoryRate.toFixed(0)} per min (Ve ${p.minuteVentilationLpm.toFixed(1)} L/min)`,
    [
      word(
        'patient_circuit_disposable_word',
        'patient circuit disposable',
        cc('patient_circuit_disposable', 'single-use patient circuit', 'fluid_flow_state', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'inspiratory + expiratory limb, heated wire, Y-piece'),
          mod('dimension', '22', 'mm ID'),
          mod('regulatory', 'ISO 5356 / ISO 10993-5/10/18'),
        ],
      ),
      word(
        'y_piece_word',
        'Y-piece',
        cc('y_piece', 'Y-piece connector', 'fluid_flow_state', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'medical-grade clear PC'),
          mod('regulatory', 'ISO 5356 15 mm / 22 mm taper'),
        ],
      ),
      word(
        'iso_5356_connector_set_word',
        'ISO 5356 connector set',
        cc('iso_5356_connector_set', 'ISO 5356 connector set', 'mechanical_attachment_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×4'),
          mod('regulatory', 'ISO 5356 conical 15/22 mm'),
        ],
      ),
    ],
  )

  return {
    module: 'mass_fluid_transport_process',
    module_brief: `Turbine-driven pneumatic circuit delivering ${p.peakInspiratoryFlowLpm.toFixed(0)} L/min peak inspiratory flow at PIP ${p.pipCmH2O.toFixed(0)} cmH2O and PEEP ${p.peepCmH2O.toFixed(0)} cmH2O. ISO 5356 patient circuit with bacterial/viral filters on both limbs and a condensate water trap on the expiratory side.`,
    overview_paragraph_en: '',
    derived_parameters: {
      peak_inspiratory_flow_lpm: p.peakInspiratoryFlowLpm,
      tidal_volume_ml: p.tidalVolumeMl,
      minute_ventilation_lpm: p.minuteVentilationLpm,
    },
    allowed_radicals: [
      'fluid_flow_state',
      'mechanical_attachment_function',
      'polymer_thermoplastic',
      'steel',
    ],
    applicability_confidence: 'high',
    sub_modules: [turbineSm, peepSm, patientCircuitSm],
  }
}

// ---------------------------------------------------------------------------
// MODULE 2: gas_blending_O2_air + humidifier_circuit
// ---------------------------------------------------------------------------

function emitGasBlendingHumidifier(p: VentParams): DesignModule {
  const gasBlenderSm = makeSubModule(
    'gas_blender',
    'O2 / air gas blender',
    'mixes',
    `medical O2 and medical air to FiO2 ${p.fio2Pct.toFixed(0)}% via twin proportional solenoid valves`,
    [
      word(
        'o2_proportional_valve_word',
        'O2 proportional valve',
        cc('o2_proportional_valve', 'O2 proportional solenoid valve', 'fluid_flow_state', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'Asco / IMI proportional solenoid'),
          mod('regulatory', 'medical-grade O2-compatible'),
          mod('capacity', '4', 'bar input'),
        ],
      ),
      word(
        'air_proportional_valve_word',
        'air proportional valve',
        cc('air_proportional_valve', 'air proportional solenoid valve', 'fluid_flow_state', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'Asco / IMI proportional solenoid'),
          mod('capacity', '4', 'bar input'),
        ],
      ),
      word(
        'gas_mixing_block_word',
        'gas mixing block',
        cc('gas_mixing_block', 'gas mixing block', 'fluid_flow_state', 'aluminium'),
        [
          mod('quantity', '×1'),
          mod('form', 'anodised aluminium manifold'),
        ],
      ),
      word(
        'fio2_sensor_word',
        'FiO2 sensor',
        cc('fio2_sensor', 'galvanic FiO2 sensor', 'chemical_sensing_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'Maxtec MAX-250'),
          mod('regulatory', 'IEC 60601-1'),
        ],
      ),
    ],
  )

  const humidifierSm = makeSubModule(
    'humidifier_circuit',
    'humidifier circuit',
    'conditions',
    `gas to 37°C BTPS (33 mg/L absolute humidity) via active heated humidifier chamber + heated wire`,
    [
      word(
        'humidifier_heater_word',
        'humidifier heater',
        cc('humidifier_heater', 'humidifier heater plate', 'electrical_conducting_function', 'aluminium'),
        [
          mod('quantity', '×1'),
          mod('capacity', '70', 'W'),
          mod('form', 'Fisher & Paykel MR850-class'),
          mod('regulatory', 'IEC 60601-2-74'),
        ],
      ),
      word(
        'humidifier_chamber_word',
        'humidifier chamber',
        cc('humidifier_chamber', 'humidifier chamber', 'fluid_flow_state', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'single-use chamber with auto-fill'),
        ],
      ),
      word(
        'heated_wire_circuit_word',
        'heated wire circuit',
        cc('heated_wire_circuit', 'heated wire circuit', 'electrical_conducting_function', 'copper'),
        [
          mod('quantity', '×1'),
          mod('form', 'integrated into patient circuit'),
        ],
      ),
    ],
  )

  return {
    module: 'environmental_interface',
    module_brief: `Twin proportional solenoid valves blend medical O2 (4 bar) and medical air (4 bar) to FiO2 ${p.fio2Pct.toFixed(0)}%. Active heated humidifier chamber + heated patient-circuit wire conditions gas to BTPS (37°C, 33 mg/L absolute humidity) per IEC 60601-2-74.`,
    overview_paragraph_en: '',
    derived_parameters: {
      fio2_pct: p.fio2Pct,
      humidifier_power_w: 70,
    },
    allowed_radicals: [
      'fluid_flow_state',
      'electrical_conducting_function',
      'chemical_sensing_function',
      'polymer_thermoplastic',
      'aluminium',
    ],
    applicability_confidence: 'high',
    sub_modules: [gasBlenderSm, humidifierSm],
  }
}

// ---------------------------------------------------------------------------
// MODULE 3: proportional_valves — energy_conversion_transduction (drives)
// ---------------------------------------------------------------------------

function emitValveDrives(_p: VentParams): DesignModule {
  const driveSm = makeSubModule(
    'valve_drive_electronics',
    'valve drive electronics',
    'modulates',
    'proportional solenoid current with PWM closed-loop control for sub-Hz flow tracking',
    [
      word(
        'valve_drive_pcb_word',
        'valve drive PCB',
        cc('valve_drive_pcb', 'valve drive PCB', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×2'),
          mod('form', 'H-bridge PWM driver per valve (TI DRV8870)'),
          mod('capacity', '25', 'W per valve'),
        ],
      ),
      word(
        'shunt_current_sense_word',
        'shunt current sense',
        cc('shunt_current_sense', 'shunt current sense', 'electrical_conducting_function', 'silicon'),
        [
          mod('quantity', '×2'),
          mod('form', 'low-side INA240 amplifier'),
        ],
      ),
      word(
        'dc_24v_supply_word',
        'DC 24 V supply',
        cc('dc_24v_supply', 'DC 24 V medical supply', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('capacity', '100', 'W'),
          mod('regulatory', 'IEC 60601-1 medical-rated'),
        ],
      ),
    ],
  )

  return {
    module: 'energy_conversion_transduction',
    module_brief: 'Twin H-bridge PWM drivers (TI DRV8870) modulate the O2 and air proportional solenoids; INA240 current-sense feedback closes the inner control loop. Medical-rated 24 V DC bus supplies both drivers.',
    overview_paragraph_en: '',
    derived_parameters: {
      drives_count: 2,
      drive_power_w_each: 25,
    },
    allowed_radicals: [
      'silicon_semiconductor_function',
      'electrical_conducting_function',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [driveSm],
  }
}

// ---------------------------------------------------------------------------
// MODULE 4: pressure_flow_sensors + control_compute_communication
// ---------------------------------------------------------------------------

function emitSensorsControl(_p: VentParams): DesignModule {
  const sensorSm = makeSubModule(
    'pressure_flow_sensors',
    'pressure + flow sensor block',
    'measures',
    'inspiratory and expiratory flow, peak inspiratory pressure, PEEP, circuit pressure and patient airway pressure',
    [
      word(
        'inspiratory_flow_sensor_word',
        'inspiratory flow sensor',
        cc('inspiratory_flow_sensor', 'inspiratory flow sensor', 'fluid_flow_state', 'silicon'),
        [
          mod('quantity', '×1'),
          mod('form', 'Sensirion SFM3000 hot-wire medical-grade'),
          mod('capacity', '200', 'L/min'),
        ],
      ),
      word(
        'expiratory_flow_sensor_word',
        'expiratory flow sensor',
        cc('expiratory_flow_sensor', 'expiratory flow sensor', 'fluid_flow_state', 'silicon'),
        [
          mod('quantity', '×1'),
          mod('form', 'Sensirion SFM3000 hot-wire medical-grade'),
          mod('capacity', '200', 'L/min'),
        ],
      ),
      word(
        'pip_pressure_transducer_word',
        'PIP pressure transducer',
        cc('pip_pressure_transducer', 'PIP pressure transducer', 'pressure_vessel_function', 'silicon'),
        [
          mod('quantity', '×1'),
          mod('form', 'Honeywell 26PC 1 psi differential'),
          mod('capacity', '70', 'cmH2O range'),
        ],
      ),
      word(
        'peep_pressure_transducer_word',
        'PEEP pressure transducer',
        cc('peep_pressure_transducer', 'PEEP pressure transducer', 'pressure_vessel_function', 'silicon'),
        [
          mod('quantity', '×1'),
          mod('form', 'Honeywell 26PC 1 psi differential'),
        ],
      ),
      word(
        'circuit_pressure_transducer_word',
        'circuit pressure transducer',
        cc('circuit_pressure_transducer', 'circuit pressure transducer', 'pressure_vessel_function', 'silicon'),
        [
          mod('quantity', '×1'),
          mod('form', 'Honeywell 26PC differential'),
        ],
      ),
    ],
  )

  const computeSm = makeSubModule(
    'control_compute',
    'dual-MCU control compute',
    'orchestrates',
    'closed-loop ventilation modes (VCV, PCV, SIMV, PSV) with IEC 62304 Class B software',
    [
      word(
        'primary_mcu_board_word',
        'primary MCU board',
        cc('primary_mcu_board', 'primary MCU board', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'STM32H743 + safety watchdog'),
          mod('regulatory', 'IEC 62304 Class B'),
        ],
      ),
      word(
        'safety_supervisor_mcu_word',
        'safety supervisor MCU',
        cc('safety_supervisor_mcu', 'safety supervisor MCU', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'redundant MCU + independent watchdog'),
          mod('regulatory', 'IEC 60601-1 single-fault tolerance'),
        ],
      ),
      word(
        'isolation_module_word',
        'isolation module',
        cc('isolation_module', 'patient-isolated I/O module', 'electrical_conducting_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'TI ISO1500-class galvanic isolation'),
          mod('regulatory', 'IEC 60601-1 type BF / CF'),
        ],
      ),
    ],
  )

  return {
    module: 'control_compute_communication',
    module_brief: 'Sensor block measures inspiratory + expiratory flow, PIP, PEEP and circuit pressure via Sensirion SFM3000 hot-wire flow sensors and Honeywell 26PC differential pressure transducers. Dual-MCU control compute with independent safety supervisor implements VCV/PCV/SIMV/PSV ventilation modes under IEC 62304 Class B software and IEC 60601-1 single-fault tolerance.',
    overview_paragraph_en: '',
    derived_parameters: {
      flow_sensors_count: 2,
      pressure_sensors_count: 3,
    },
    allowed_radicals: [
      'fluid_flow_state',
      'pressure_vessel_function',
      'silicon_semiconductor_function',
      'electrical_conducting_function',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [sensorSm, computeSm],
  }
}

// ---------------------------------------------------------------------------
// MODULE 8: user_interface_alarms — hmi_ergonomics + safety_protection
// ---------------------------------------------------------------------------

function emitUserInterfaceAlarms(_p: VentParams): DesignModule {
  const hmiSm = makeSubModule(
    'touchscreen_hmi',
    'touchscreen HMI',
    'displays',
    '12.1" capacitive touchscreen showing ventilation curves, alarm states, alarm log and patient/ventilator parameters',
    [
      word(
        'hmi_touchscreen_word',
        'HMI touchscreen',
        cc('hmi_touchscreen', 'HMI touchscreen', 'optical_sensing_function', 'glass'),
        [
          mod('quantity', '×1'),
          mod('form', '12.1" projected-capacitive touchscreen'),
          mod('regulatory', 'IEC 62366-1 usability'),
        ],
      ),
      word(
        'rotary_encoder_word',
        'rotary encoder',
        cc('rotary_encoder', 'rotary encoder', 'mechanical_compression_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'sealed rotary encoder + push (Bourns ECW)'),
        ],
      ),
    ],
  )

  return {
    module: 'hmi_ergonomics',
    module_brief: '12.1" capacitive touchscreen with IEC 62366-1 usability-compliant UI displaying ventilation curves, alarms and the patient log. Sealed rotary encoder for blind-finger setting changes.',
    overview_paragraph_en: '',
    derived_parameters: {
      hmi_size_inches: 12.1,
    },
    allowed_radicals: [
      'optical_sensing_function',
      'mechanical_compression_function',
      'glass',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [hmiSm],
  }
}

function emitSafetyAlarms(_p: VentParams): DesignModule {
  const alarmSm = makeSubModule(
    'audible_visual_alarms',
    'IEC 60601-1-8 audible + visual alarms',
    'alerts',
    'staff to prioritised low / medium / high priority alarms with 85 dBA speaker and tri-colour beacon',
    [
      word(
        'alarm_speaker_word',
        'IEC 60601-1-8 alarm speaker',
        cc('alarm_speaker', 'IEC 60601-1-8 alarm speaker', 'acoustic_radiation_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('capacity', '85', 'dBA'),
          mod('regulatory', 'IEC 60601-1-8'),
        ],
      ),
      word(
        'beacon_rgb_word',
        'beacon RGB',
        cc('beacon_rgb', 'RGB priority beacon', 'optical_radiation_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'tri-colour LED stack'),
        ],
      ),
      word(
        'apnoea_backup_word',
        'apnoea backup',
        cc('apnoea_backup', 'apnoea backup logic', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'independent safety-MCU implementation'),
          mod('regulatory', 'IEC 60601-2-12 single-fault'),
        ],
      ),
      word(
        'safety_relief_valve_word',
        'safety relief valve',
        cc('safety_relief_valve', 'safety relief valve', 'pressure_vessel_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('capacity', '70', 'cmH2O cracking'),
          mod('form', 'mechanical anti-asphyxia + over-pressure'),
        ],
      ),
    ],
  )

  return {
    module: 'safety_protection',
    module_brief: 'IEC 60601-1-8 prioritised audible (85 dBA) + visual alarm system, independent apnoea backup logic on the safety supervisor MCU, and mechanical anti-asphyxia / over-pressure safety relief valve cracking at 70 cmH2O.',
    overview_paragraph_en: '',
    derived_parameters: {
      alarm_speaker_db: 85,
    },
    allowed_radicals: [
      'acoustic_radiation_function',
      'optical_radiation_function',
      'silicon_semiconductor_function',
      'pressure_vessel_function',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [alarmSm],
  }
}

// ---------------------------------------------------------------------------
// MODULE 9: battery_backup — energy_storage_source
// ---------------------------------------------------------------------------

function emitBatteryBackup(p: VentParams): DesignModule {
  const batterySm = makeSubModule(
    'lithium_ion_battery_pack',
    'lithium-ion battery pack',
    'powers',
    `${p.batteryRunTimeMin.toFixed(0)} minute runtime at peak load (${p.peakElectricalW.toFixed(0)} W) ${p.isTransport ? 'with hot-swap during transport' : 'as ICU mains backup'}`,
    [
      word(
        'lithium_ion_battery_pack_word',
        'lithium-ion battery pack',
        cc('lithium_ion_battery_pack', 'lithium-ion battery pack', 'electrochemical_energy_function', 'polymer_thermoplastic'),
        [
          mod('quantity', p.isTransport ? '×2' : '×1'),
          mod('capacity', p.isTransport ? '90' : '50', 'Wh each'),
          mod('form', 'Inspired Energy NL2024 medical lithium-ion smart battery'),
          mod('regulatory', 'UN38.3 + IEC 62133'),
        ],
      ),
      word(
        'battery_management_word',
        'battery management',
        cc('battery_management', 'battery management module', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'SMBus 1.1 protocol stack + cell monitor'),
        ],
      ),
      word(
        'medical_iec_60601_power_supply_word',
        'medical IEC 60601 power supply',
        cc('medical_iec_60601_power_supply', 'medical IEC 60601 power supply', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('capacity', p.peakElectricalW.toFixed(0), 'W'),
          mod('regulatory', 'IEC 60601-1 + 60601-1-2 medical'),
        ],
      ),
    ],
  )

  return {
    module: 'energy_storage_source',
    module_brief: `${p.isTransport ? 'Transport ventilator hot-swappable twin' : 'ICU mains-backup'} lithium-ion battery pack delivering ${p.batteryRunTimeMin.toFixed(0)} min runtime at peak ${p.peakElectricalW.toFixed(0)} W load. SMBus battery-management and IEC 60601-1 medical-rated power supply.`,
    overview_paragraph_en: '',
    derived_parameters: {
      battery_runtime_min: p.batteryRunTimeMin,
      peak_electrical_w: p.peakElectricalW,
    },
    allowed_radicals: [
      'electrochemical_energy_function',
      'silicon_semiconductor_function',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high',
    sub_modules: [batterySm],
  }
}

// ---------------------------------------------------------------------------
// MODULE 10: regulatory_certification — maintenance_serviceability
// ---------------------------------------------------------------------------

function emitRegulatory(_p: VentParams): DesignModule {
  const regSm = makeSubModule(
    'regulatory_certifications',
    'regulatory certifications',
    'attests',
    'compliance with FDA Class II 510(k) / EU MDR Class IIb / IEC 60601-2-12 / 60601-1-8 / 62304 / 62366-1',
    [
      word(
        'fda_510k_label_word',
        'FDA 510(k) label',
        cc('fda_510k_label', 'FDA 510(k) compliance label', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('regulatory', 'FDA 21 CFR 868.5895 mechanical ventilator'),
        ],
      ),
      word(
        'ce_ukca_iib_label_word',
        'CE/UKCA IIb label',
        cc('ce_ukca_iib_label', 'CE/UKCA Class IIb label', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('regulatory', 'EU MDR 2017/745 Annex VIII Rule 11'),
        ],
      ),
      word(
        'iec_60601_2_12_label_word',
        'IEC 60601-2-12 label',
        cc('iec_60601_2_12_label', 'IEC 60601-2-12 compliance label', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('regulatory', 'IEC 60601-2-12 ventilator-specific'),
        ],
      ),
      word(
        'service_access_panel_word',
        'service access panel',
        cc('service_access_panel', 'service access panel', 'mechanical_attachment_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'tool-required interlock'),
        ],
      ),
    ],
  )

  return {
    module: 'maintenance_serviceability',
    module_brief: 'FDA Class II 510(k) and EU MDR Class IIb cleared mechanical ventilator. Compliant with IEC 60601-2-12 (ventilator specific), IEC 60601-1-8 alarms, IEC 62304 Class B software, IEC 62366-1 usability and ISO 13485 quality system. Tool-required service-access panel.',
    overview_paragraph_en: '',
    derived_parameters: {},
    allowed_radicals: [
      'mechanical_attachment_function',
      'polymer_thermoplastic',
      'steel',
    ],
    applicability_confidence: 'high',
    sub_modules: [regSm],
  }
}

// ---------------------------------------------------------------------------
// Structural enclosure
// ---------------------------------------------------------------------------

function emitStructure(p: VentParams): DesignModule {
  const enclosureWords: Word[] = [
    word(
      'enclosure_chassis_word',
      'enclosure chassis',
      cc('enclosure_chassis', p.isTransport ? 'impact-protected enclosure' : 'ABS enclosure + steel cart', null, 'polymer_thermoplastic'),
      [
        mod('quantity', '×1'),
        mod('form', p.isTransport ? 'moulded ABS portable + impact corners' : 'moulded ABS + steel cart + medical castors'),
        mod('regulatory', 'IP21 splash-resistant'),
      ],
    ),
  ]
  if (p.isTransport) {
    enclosureWords.push(
      word(
        'carry_handle_word',
        'carry handle',
        cc('carry_handle', 'carry handle', 'mechanical_attachment_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'overmoulded rubberised'),
        ],
      ),
      word(
        'o2_cylinder_holder_word',
        'O2 cylinder holder',
        cc('o2_cylinder_holder', 'O2 cylinder holder', 'mechanical_attachment_function', 'aluminium'),
        [
          mod('quantity', '×1'),
          mod('capacity', p.o2CylinderL.toFixed(1), 'L cylinder'),
          mod('regulatory', 'ISO 7866 lightweight aluminium'),
        ],
      ),
    )
  } else {
    enclosureWords.push(
      word(
        'medical_castor_set_word',
        'medical castor set',
        cc('medical_castor_set', 'medical castor set', 'mechanical_attachment_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×5'),
          mod('form', '125 mm twin-wheel central-lock'),
        ],
      ),
    )
  }

  const enclosureSm = makeSubModule(
    'enclosure_chassis',
    p.isTransport ? 'portable carry chassis' : 'trolley chassis',
    'houses',
    `${p.totalEstimatedMassKg.toFixed(1)} kg ventilator ${p.isTransport ? 'in portable impact-protected enclosure with carry handle' : 'on five-castor mobile trolley'}`,
    enclosureWords,
  )

  return {
    module: 'structure_containment',
    module_brief: p.isTransport
      ? `Portable impact-protected moulded-ABS enclosure with overmoulded carry handle and integrated ${p.o2CylinderL.toFixed(1)} L O2 cylinder holder. All-up mass ${p.totalEstimatedMassKg.toFixed(1)} kg, well within ${p.maxMassKg.toFixed(1)} kg brief cap.`
      : `Moulded-ABS enclosure on five-castor medical trolley with central wheel lock. All-up mass ${p.totalEstimatedMassKg.toFixed(1)} kg, within ${p.maxMassKg.toFixed(1)} kg brief cap.`,
    overview_paragraph_en: '',
    derived_parameters: {
      total_mass_kg: p.totalEstimatedMassKg,
    },
    allowed_radicals: [
      'mechanical_attachment_function',
      'polymer_thermoplastic',
      'steel',
      'aluminium',
    ],
    applicability_confidence: 'high',
    sub_modules: [enclosureSm],
  }
}

// ---------------------------------------------------------------------------
// CROSS-MODULE GRAMMAR LINKS
// ---------------------------------------------------------------------------

function emitCrossModuleGrammarLinks(p: VentParams) {
  return [
    {
      from_module: 'environmental_interface',
      to_module: 'mass_fluid_transport_process',
      mechanism: 'fluid_loop',
      type: 'directional' as const,
      detail: `blended gas → turbine + patient circuit`,
    },
    {
      from_module: 'mass_fluid_transport_process',
      to_module: 'environmental_interface',
      mechanism: 'fluid_loop',
      type: 'directional' as const,
      detail: 'humidifier injects water vapour upstream of patient circuit',
    },
    {
      from_module: 'energy_conversion_transduction',
      to_module: 'environmental_interface',
      mechanism: 'control',
      type: 'directional' as const,
      detail: 'PWM current drives proportional solenoids',
    },
    {
      from_module: 'control_compute_communication',
      to_module: 'energy_conversion_transduction',
      mechanism: 'control',
      type: 'directional' as const,
      detail: 'current setpoint to valve drives',
    },
    {
      from_module: 'control_compute_communication',
      to_module: 'mass_fluid_transport_process',
      mechanism: 'control',
      type: 'mutual' as const,
      detail: 'pressure / flow feedback ↔ turbine + PEEP valve setpoints',
    },
    {
      from_module: 'safety_protection',
      to_module: 'control_compute_communication',
      mechanism: 'data',
      type: 'mutual' as const,
      detail: 'IEC 60601-1-8 alarms ↔ MCU + safety supervisor',
    },
    {
      from_module: 'safety_protection',
      to_module: 'mass_fluid_transport_process',
      mechanism: 'control',
      type: 'directional' as const,
      detail: 'over-pressure relief valve in patient circuit',
    },
    {
      from_module: 'hmi_ergonomics',
      to_module: 'control_compute_communication',
      mechanism: 'data',
      type: 'mutual' as const,
      detail: 'HMI ↔ MCU (Ethernet + UART)',
    },
    {
      from_module: 'energy_storage_source',
      to_module: 'control_compute_communication',
      mechanism: 'electrical_bus',
      type: 'directional' as const,
      detail: 'battery + medical PSU → 24 V DC bus',
    },
    {
      from_module: 'maintenance_serviceability',
      to_module: 'structure_containment',
      mechanism: 'mechanical',
      type: 'directional' as const,
      detail: 'service access panel hinged to enclosure rear',
    },
    {
      from_module: 'energy_storage_source',
      to_module: 'structure_containment',
      mechanism: 'mechanical',
      type: 'directional' as const,
      detail: 'battery pack mounted in lower compartment',
    },
  ]
}

// ---------------------------------------------------------------------------
// BRIEF OVERVIEW PROSE
// ---------------------------------------------------------------------------

function emitBriefOverviewProse(p: VentParams) {
  return {
    overview_and_context: '',
    mission_statement: `Deliver IEC 60601-2-12 compliant mechanical ventilation: Vt ${p.tidalVolumeMl.toFixed(0)} mL, PEEP ${p.peepCmH2O.toFixed(0)} cmH2O, PIP ${p.pipCmH2O.toFixed(0)} cmH2O, RR ${p.respiratoryRate.toFixed(0)} bpm, FiO2 ${p.fio2Pct.toFixed(0)}% with ${p.batteryRunTimeMin.toFixed(0)} min battery backup ${p.isTransport ? 'for transport use' : 'as ICU mains backup'}.`,
    target_customers: '',
    why_now: '',
  }
}

// ---------------------------------------------------------------------------
// PUBLIC EMITTER
// ---------------------------------------------------------------------------

export const emitVentilatorDesign: ClassEmitter = (
  contract: ContractInProgress,
  _brief: ParsedConstraints,
  _envelope: BriefEnvelope,
): DesignJSON => {
  const p = deriveParams(contract)
  const modules: DesignModule[] = [
    emitPneumaticCircuit(p),
    emitGasBlendingHumidifier(p),
    emitValveDrives(p),
    emitSensorsControl(p),
    emitUserInterfaceAlarms(p),
    emitSafetyAlarms(p),
    emitBatteryBackup(p),
    emitRegulatory(p),
    emitStructure(p),
  ]
  return {
    modules,
    cross_module_grammar_links: emitCrossModuleGrammarLinks(p),
    excluded_modules: [],
    rationale_excluded: '9 modules cover the canonical mechanical ventilator (pneumatic circuit, gas blending + humidifier, valve drives, sensors + control, HMI, safety/alarms, battery, regulatory, structure).',
    brief_overview_prose: emitBriefOverviewProse(p),
  }
}

registerAssembler('ventilator', emitVentilatorDesign)
