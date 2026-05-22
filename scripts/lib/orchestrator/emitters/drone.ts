/**
 * scripts/lib/orchestrator/emitters/drone.ts
 *
 * DRONE DETERMINISTIC EMITTER — multirotor quadcopter, 250 g to 25 kg
 * payload class. Targets consumer / commercial / agricultural / inspection
 * use cases. Real parts: T-Motor brushless motors, Hobbywing ESCs,
 * Pixhawk/CubePilot flight controllers, Tattu LiPo packs, Gremsy/DJI
 * gimbals, FLIR/Leddar lidar, Ouster solid-state LiDAR.
 */

import { registerAssembler } from '../assembler'
import type { ClassEmitter, DesignJSON } from '../assembler'
import type { ContractInProgress } from '../types'

// ---------------------------------------------------------------------------
// Local types (same shapes as haps.ts)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

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
  return {
    character_id,
    name_human,
    function_radical_primary: fp,
    function_radical_secondary: null,
    material_radical_primary: mp,
    material_radical_secondary: null,
  }
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

function makeSubModule(
  id: string,
  name_human: string,
  role_verb: string,
  topology_clause: string,
  words: Word[],
): SubModule {
  return { id, name_human, english_sentence: '', rad_syntax: synthesizeRadSyntax(words), role_verb, topology_clause, words }
}

// ---------------------------------------------------------------------------
// PARAMS
// ---------------------------------------------------------------------------

interface DroneParams {
  mtowKg: number
  motorCount: number
  rotorDiameterM: number
  payloadKg: number
  batteryKwh: number
  batteryMassKg: number
  airframeMassKg: number
  totalEstimatedMassKg: number
  hoverPowerKw: number
  cruisePowerKw: number
  perMotorThrustN: number
  endurance_min: number
  // Tool-derived
  motorKv: number
  hoverRpm: number
  hoverPowerPerMotorW: number
  hoverThrustPerMotorN: number
  thrustToWeightRatio: number
  packVoltageV: number
  gustNTotalG: number
  obstacleSensorRangeM: number
  insPositionDriftMM: number
  rfLinkMarginDb: number
}

function deriveDroneParams(c: ContractInProgress): DroneParams {
  const mtowKg = q(c, 'mtow_kg', 1.8)
  const motorCount = Math.max(3, Math.round(q(c, 'motor_count', 4)))
  const rotorDiameterM = q(c, 'rotor_diameter_m', 0.20)
  const payloadKg = q(c, 'payload_kg', 0.4)
  const batteryKwh = q(c, 'battery_capacity_kwh', 0.077)
  const batteryMassKg = q(c, 'battery_mass_kg', 0.39)
  const airframeMassKg = q(c, 'airframe_mass_kg', 0.45)
  const totalEstimatedMassKg = q(c, 'total_estimated_mass_kg', 1.8)
  const hoverPowerKw = q(c, 'hover_power_kw', 0.4)
  const cruisePowerKw = q(c, 'cruise_power_kw', 0.28)
  const perMotorThrustN = q(c, 'per_motor_thrust_n', 6.6)
  const endurance_min = q(c, 'computed_endurance_min', 22)

  const motorKv = q(c, 'motor_kv', 920)
  const hoverRpm = q(c, 'hover_rpm', 7800)
  const hoverPowerPerMotorW = q(c, 'hover_power_per_motor_w', hoverPowerKw * 1000 / motorCount)
  const hoverThrustPerMotorN = q(c, 'hover_thrust_per_motor_n', mtowKg * 9.81 / motorCount)
  const thrustToWeightRatio = q(c, 'thrust_to_weight_ratio', 2.0)
  const packVoltageV = q(c, 'battery_voltage', 14.8)
  const gustNTotalG = q(c, 'n_total_g', 2.5)
  const obstacleSensorRangeM = q(c, 'max_range_m', 40)
  const insPositionDriftMM = q(c, 'position_drift_per_min_m', 5) * 1000
  const rfLinkMarginDb = q(c, 'rf_link_margin_db', 12)

  return {
    mtowKg, motorCount, rotorDiameterM, payloadKg, batteryKwh, batteryMassKg,
    airframeMassKg, totalEstimatedMassKg, hoverPowerKw, cruisePowerKw,
    perMotorThrustN, endurance_min, motorKv, hoverRpm, hoverPowerPerMotorW,
    hoverThrustPerMotorN, thrustToWeightRatio, packVoltageV, gustNTotalG,
    obstacleSensorRangeM, insPositionDriftMM, rfLinkMarginDb,
  }
}

// ---------------------------------------------------------------------------
// MODULE 1 — airframe_structure
// ---------------------------------------------------------------------------

function emitAirframeStructure(p: DroneParams) {
  const centralFrame = makeSubModule(
    'central_airframe_chassis',
    'central airframe chassis',
    'carries',
    `CF + foam-core ${p.motorCount}-arm spider chassis, ${p.airframeMassKg.toFixed(2)} kg`,
    [
      word(
        'carbon_fibre_airframe_word',
        'carbon-fibre airframe',
        cc('carbon_fibre_airframe', 'carbon-fibre airframe', 'mechanical_load_function', 'carbon_fibre_composite'),
        [
          mod('quantity', '×1'),
          mod('mass', String(p.airframeMassKg.toFixed(2)), 'kg'),
          mod('form', '3K twill CF top + bottom plate, foam-core arms'),
        ],
      ),
      word(
        'motor_arm_assembly_word',
        'motor arm assembly',
        cc('motor_arm_assembly', 'motor arm assembly', 'mechanical_load_function', 'carbon_fibre_composite'),
        [
          mod('quantity', fmtQty(p.motorCount)),
          mod('form', 'CF tube, foam-core arm, machined Al motor mount'),
        ],
      ),
      word(
        'landing_gear_strut_word',
        'landing gear strut',
        cc('landing_gear_strut', 'landing gear strut', 'mechanical_load_function', 'carbon_fibre_composite'),
        [
          mod('quantity', '×4'),
          mod('form', 'CF strut + polymer foot pad'),
        ],
      ),
    ],
  )

  const propellers = makeSubModule(
    'propeller_set',
    'propeller set',
    'thrusts',
    `${p.motorCount}× carbon-fibre propellers, ${(p.rotorDiameterM * 1000).toFixed(0)} mm diameter`,
    [
      word(
        'cf_propeller_blade_word',
        'CF propeller blade',
        cc('cf_propeller_blade', 'CF propeller blade', 'aerodynamic_lift_function', 'carbon_fibre_composite'),
        [
          mod('quantity', fmtQty(p.motorCount)),
          mod('dimension', String((p.rotorDiameterM * 1000).toFixed(0)), 'mm'),
          mod('form', 'T-Motor F-class 2-blade folding CF'),
        ],
      ),
      word(
        'prop_hub_collet_word',
        'prop hub collet',
        cc('prop_hub_collet', 'prop hub collet', 'mechanical_load_function', 'aluminium'),
        [
          mod('quantity', fmtQty(p.motorCount)),
          mod('form', '5 mm bore Al collet'),
        ],
      ),
    ],
  )

  return {
    module: 'airframe_structure',
    module_brief: `${p.motorCount}-arm CF airframe, ${p.airframeMassKg.toFixed(2)} kg, ${(p.rotorDiameterM * 1000).toFixed(0)} mm folding T-Motor F-class CF propellers. MTOW ${p.mtowKg.toFixed(2)} kg.`,
    overview_paragraph_en: '',
    derived_parameters: {
      mtow_kg: p.mtowKg,
      motor_count: p.motorCount,
      rotor_diameter_m: p.rotorDiameterM,
      airframe_mass_kg: p.airframeMassKg,
    },
    allowed_radicals: [
      'mechanical_load_function',
      'aerodynamic_lift_function',
      'carbon_fibre_composite',
      'aluminium',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [centralFrame, propellers],
  }
}

// ---------------------------------------------------------------------------
// MODULE 2 — motor_prop_array
// ---------------------------------------------------------------------------

function emitMotorPropArray(p: DroneParams) {
  const brushlessMotor = makeSubModule(
    'brushless_motor_array',
    'brushless motor array',
    'rotates',
    `${p.motorCount}× T-Motor MN-class brushless outrunner, ${p.motorKv.toFixed(0)} KV @ ${p.packVoltageV.toFixed(1)} V`,
    [
      word(
        'brushless_motor_outrunner_word',
        'brushless motor outrunner',
        cc('brushless_motor_outrunner', 'brushless motor outrunner', 'electromagnetic_force_function', 'rare_earth_magnet'),
        [
          mod('quantity', fmtQty(p.motorCount)),
          mod('form', 'T-Motor MN-3110 KV700 / KV900 outrunner'),
          mod('capacity', String(p.hoverPowerPerMotorW.toFixed(0)), 'W'),
          mod('dimension', String(p.motorKv.toFixed(0)), 'KV'),
        ],
      ),
      word(
        'motor_bell_rotor_word',
        'motor bell rotor',
        cc('motor_bell_rotor', 'motor bell rotor', 'electromagnetic_force_function', 'rare_earth_magnet'),
        [
          mod('quantity', fmtQty(p.motorCount)),
          mod('form', 'CNC Al bell, N52 NdFeB magnet array'),
        ],
      ),
    ],
  )

  const esc = makeSubModule(
    'esc_distribution',
    'ESC distribution',
    'switches',
    `${p.motorCount}× Hobbywing/T-Motor ESCs, ${(p.hoverPowerPerMotorW / p.packVoltageV * 1.5).toFixed(0)} A peak`,
    [
      word(
        'esc_speed_controller_word',
        'ESC speed controller',
        cc('esc_speed_controller', 'ESC speed controller', 'silicon_semiconductor_function', 'fr4'),
        [
          mod('quantity', fmtQty(p.motorCount)),
          mod('capacity', String((p.hoverPowerPerMotorW / p.packVoltageV * 1.5).toFixed(0)), 'A'),
          mod('form', 'Hobbywing XRotor Pro 40A / T-Motor F45A BLHeli_32'),
        ],
      ),
      word(
        'esc_power_distribution_board_word',
        'ESC power distribution board',
        cc('esc_power_distribution_board', 'ESC power distribution board', 'electrical_conducting_function', 'copper'),
        [
          mod('quantity', '×1'),
          mod('form', '2 oz Cu PDB with current sense'),
        ],
      ),
    ],
  )

  return {
    module: 'motor_prop_array',
    module_brief: `${p.motorCount}× T-Motor MN-class brushless outrunners @ ${p.motorKv.toFixed(0)} KV, hover ${p.hoverThrustPerMotorN.toFixed(1)} N/motor × ${p.motorCount} = ${(p.hoverThrustPerMotorN * p.motorCount).toFixed(1)} N total. Thrust-to-weight ratio ${p.thrustToWeightRatio.toFixed(1)}× at full throttle. Hobbywing XRotor Pro ESCs with BLHeli_32 firmware.`,
    overview_paragraph_en: '',
    derived_parameters: {
      motor_count: p.motorCount,
      motor_kv: p.motorKv,
      hover_rpm: p.hoverRpm,
      hover_power_per_motor_w: p.hoverPowerPerMotorW,
      thrust_to_weight_ratio: p.thrustToWeightRatio,
    },
    allowed_radicals: [
      'electromagnetic_force_function',
      'silicon_semiconductor_function',
      'electrical_conducting_function',
      'rare_earth_magnet',
      'fr4',
      'copper',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [brushlessMotor, esc],
  }
}

// ---------------------------------------------------------------------------
// MODULE 3 — energy_storage_battery (LiPo)
// ---------------------------------------------------------------------------

function emitEnergyStorageBattery(p: DroneParams) {
  const lipoPack = makeSubModule(
    'lipo_battery_pack',
    'LiPo battery pack',
    'stores',
    `${p.batteryKwh.toFixed(3)} kWh Tattu/CNHL high-discharge LiPo, ${p.packVoltageV.toFixed(1)} V`,
    [
      word(
        'lipo_battery_pack_word',
        'LiPo battery pack',
        cc('lipo_battery_pack', 'LiPo battery pack', 'electrochemical_energy_function', 'lithium_polymer_chemistry'),
        [
          mod('quantity', '×1'),
          mod('capacity', String((p.batteryKwh * 1000).toFixed(0)), 'Wh'),
          mod('form', `Tattu 6S ${(p.batteryKwh * 1000 / p.packVoltageV).toFixed(2)} Ah 25C`),
          mod('dimension', String(p.packVoltageV.toFixed(1)), 'V'),
          mod('regulatory', 'UN 38.3'),
          mod('mass', String(p.batteryMassKg.toFixed(2)), 'kg'),
        ],
      ),
      word(
        'xt60_battery_connector_word',
        'XT60 battery connector',
        cc('xt60_battery_connector', 'XT60 battery connector', 'electrical_conducting_function', 'copper'),
        [
          mod('quantity', '×1'),
          mod('form', 'AMASS XT60 male+female pair, 60A continuous'),
        ],
      ),
    ],
  )

  return {
    module: 'energy_storage_battery',
    module_brief: `${(p.batteryKwh * 1000).toFixed(0)} Wh Tattu/CNHL 6S LiPo @ ${p.packVoltageV.toFixed(1)} V, ${p.batteryMassKg.toFixed(2)} kg, 25C continuous discharge. UN 38.3 transport certified. AMASS XT60 connector pair.`,
    overview_paragraph_en: '',
    derived_parameters: {
      battery_capacity_kwh: p.batteryKwh,
      battery_mass_kg: p.batteryMassKg,
      pack_voltage_v: p.packVoltageV,
    },
    allowed_radicals: [
      'electrochemical_energy_function',
      'lithium_polymer_chemistry',
      'electrical_conducting_function',
      'copper',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [lipoPack],
  }
}

// ---------------------------------------------------------------------------
// MODULE 4 — flight_control_avionics
// ---------------------------------------------------------------------------

function emitFlightControlAvionics(p: DroneParams) {
  const fc = makeSubModule(
    'flight_controller_assembly',
    'flight controller assembly',
    'commands',
    'Pixhawk-class IMU + barometer + GNSS + processor for closed-loop attitude control',
    [
      word(
        'flight_controller_pcb_word',
        'flight controller PCB',
        cc('flight_controller_pcb', 'flight controller PCB', 'silicon_semiconductor_function', 'fr4'),
        [
          mod('quantity', '×1'),
          mod('form', 'CubePilot CubeOrange / Pixhawk 6X-class'),
          mod('regulatory', 'DO-178C DAL-D (recommended)'),
        ],
      ),
      word(
        'imu_9_axis_word',
        'IMU 9-axis',
        cc('imu_9_axis', '9-axis IMU', 'inertial_sensing_function', 'silicon_wafer'),
        [
          mod('quantity', '×3'),
          mod('form', 'Bosch BMI088 triple-redundant'),
        ],
      ),
      word(
        'barometer_pressure_sensor_word',
        'barometer pressure sensor',
        cc('barometer_pressure_sensor', 'barometer pressure sensor', 'silicon_semiconductor_function', 'silicon_wafer'),
        [
          mod('quantity', '×2'),
          mod('form', 'TE MS5611 dual'),
        ],
      ),
    ],
  )

  const gimbalControl = makeSubModule(
    'attitude_pid_controller',
    'attitude PID controller',
    'stabilises',
    'closed-loop PID attitude + position controller running PX4 / ArduPilot',
    [
      word(
        'pid_attitude_controller_word',
        'PID attitude controller',
        cc('pid_attitude_controller', 'PID attitude controller', 'silicon_semiconductor_function', null),
        [
          mod('quantity', '×1'),
          mod('form', 'PX4 / ArduPilot autopilot firmware'),
        ],
      ),
    ],
  )

  return {
    module: 'flight_control_avionics',
    module_brief: `CubePilot CubeOrange / Pixhawk 6X-class flight controller, triple-redundant Bosch BMI088 IMU, dual MS5611 barometer. PX4 / ArduPilot autopilot firmware with closed-loop PID attitude controller. Withstands ${p.gustNTotalG.toFixed(1)} g gust load.`,
    overview_paragraph_en: '',
    derived_parameters: {
      imu_count: 3,
      gust_n_total_g: p.gustNTotalG,
    },
    allowed_radicals: [
      'silicon_semiconductor_function',
      'inertial_sensing_function',
      'fr4',
      'silicon_wafer',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [fc, gimbalControl],
  }
}

// ---------------------------------------------------------------------------
// MODULE 5 — sensor_payload_gimbal
// ---------------------------------------------------------------------------

function emitSensorPayloadGimbal(p: DroneParams) {
  const gimbal = makeSubModule(
    'three_axis_gimbal',
    '3-axis brushless gimbal',
    'stabilises',
    'pitch + roll + yaw brushless gimbal for camera payload stabilisation',
    [
      word(
        'three_axis_gimbal_word',
        '3-axis gimbal',
        cc('three_axis_gimbal', '3-axis brushless gimbal', 'electromagnetic_force_function', 'aluminium'),
        [
          mod('quantity', '×1'),
          mod('form', 'Gremsy T7 / DJI Ronin SC-class brushless'),
          mod('regulatory', 'IP43'),
        ],
      ),
      word(
        'gimbal_torque_motor_word',
        'gimbal torque motor',
        cc('gimbal_torque_motor', 'gimbal torque motor', 'electromagnetic_force_function', 'rare_earth_magnet'),
        [
          mod('quantity', '×3'),
          mod('form', 'iPower iBM-3W direct-drive brushless'),
        ],
      ),
    ],
  )

  const cameraPayload = makeSubModule(
    'gimbal_camera_payload',
    'gimbal camera payload',
    'images',
    'optical EO + LWIR thermal camera module on gimbal',
    [
      word(
        'gimbal_camera_payload_word',
        'gimbal camera payload',
        cc('gimbal_camera_payload', 'gimbal camera payload', 'optical_imaging_function', 'silicon_wafer'),
        [
          mod('quantity', '×1'),
          mod('form', 'Sony A7R V / FLIR Vue Pro R 640 thermal'),
          mod('mass', String(p.payloadKg.toFixed(2)), 'kg'),
        ],
      ),
    ],
  )

  return {
    module: 'sensor_payload_gimbal',
    module_brief: `Gremsy T7 / DJI Ronin SC-class 3-axis brushless gimbal stabilising ${p.payloadKg.toFixed(2)} kg Sony A7R V / FLIR Vue Pro R 640 EO+LWIR payload. iPower iBM-3W direct-drive gimbal motors, IP43 weather-sealed.`,
    overview_paragraph_en: '',
    derived_parameters: {
      payload_kg: p.payloadKg,
    },
    allowed_radicals: [
      'electromagnetic_force_function',
      'optical_imaging_function',
      'aluminium',
      'rare_earth_magnet',
      'silicon_wafer',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [gimbal, cameraPayload],
  }
}

// ---------------------------------------------------------------------------
// MODULE 6 — telemetry_comms
// ---------------------------------------------------------------------------

function emitTelemetryComms(p: DroneParams) {
  const radio = makeSubModule(
    'rc_radio_link',
    'RC radio link',
    'commands',
    '2.4 GHz / 915 MHz radio control + telemetry diversity',
    [
      word(
        'rc_radio_receiver_word',
        'RC radio receiver',
        cc('rc_radio_receiver', 'RC radio receiver', 'electromagnetic_radiation_function', 'fr4'),
        [
          mod('quantity', '×2'),
          mod('form', 'ExpressLRS / TBS Crossfire dual-receiver diversity'),
          mod('dimension', '2.4', 'GHz'),
        ],
      ),
      word(
        'transmitter_receiver_pair_word',
        'transmitter receiver pair',
        cc('transmitter_receiver_pair', 'transmitter receiver pair', 'electromagnetic_radiation_function', 'fr4'),
        [
          mod('quantity', '×1'),
          mod('form', 'RadioMaster TX16S MKII / FrSky X20S handset'),
        ],
      ),
    ],
  )

  const fpvVideo = makeSubModule(
    'fpv_video_downlink',
    'FPV video downlink',
    'transmits',
    'low-latency 5.8 GHz analog or DJI O3 digital video downlink',
    [
      word(
        'fpv_video_transmitter_word',
        'FPV video transmitter',
        cc('fpv_video_transmitter', 'FPV video transmitter', 'electromagnetic_radiation_function', 'fr4'),
        [
          mod('quantity', '×1'),
          mod('form', 'DJI O3 Air Unit / TBS Unify Pro HV 1.6W'),
          mod('dimension', '5.8', 'GHz'),
        ],
      ),
      word(
        'fpv_video_camera_word',
        'FPV video camera',
        cc('fpv_video_camera', 'FPV video camera', 'optical_imaging_function', 'silicon_wafer'),
        [
          mod('quantity', '×1'),
          mod('form', 'RunCam Phoenix 2 / DJI O3 cam, 4K @ 120 fps'),
        ],
      ),
    ],
  )

  return {
    module: 'telemetry_comms',
    module_brief: `ExpressLRS / TBS Crossfire dual-receiver RC link with RadioMaster TX16S MKII handset. DJI O3 Air Unit or TBS Unify Pro HV 5.8 GHz video downlink (1.6 W). RF link margin ${p.rfLinkMarginDb.toFixed(1)} dB.`,
    overview_paragraph_en: '',
    derived_parameters: {
      rf_link_margin_db: p.rfLinkMarginDb,
    },
    allowed_radicals: [
      'electromagnetic_radiation_function',
      'optical_imaging_function',
      'fr4',
      'silicon_wafer',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [radio, fpvVideo],
  }
}

// ---------------------------------------------------------------------------
// MODULE 7 — navigation_GPS
// ---------------------------------------------------------------------------

function emitNavigationGPS(p: DroneParams) {
  const gnss = makeSubModule(
    'gnss_receiver_module',
    'GNSS receiver module',
    'positions',
    'multi-band multi-constellation GNSS with RTK capability',
    [
      word(
        'gnss_l1_l2_dual_word',
        'GNSS L1/L2 dual',
        cc('gnss_l1_l2_dual', 'GNSS L1/L2 dual receiver', 'silicon_semiconductor_function', 'fr4'),
        [
          mod('quantity', '×1'),
          mod('form', 'u-blox ZED-F9P RTK / NEO-M9N quad-constellation'),
        ],
      ),
      word(
        'compass_magnetometer_word',
        'compass magnetometer',
        cc('compass_magnetometer', 'compass magnetometer', 'inertial_sensing_function', 'silicon_wafer'),
        [
          mod('quantity', '×1'),
          mod('form', 'IST8310 + RM3100 redundant compass'),
        ],
      ),
    ],
  )

  const ins = makeSubModule(
    'inertial_nav_filter',
    'inertial nav filter',
    'fuses',
    'INS + GNSS Kalman filter for position estimation',
    [
      word(
        'ekf_state_estimator_word',
        'EKF state estimator',
        cc('ekf_state_estimator', 'EKF state estimator', 'silicon_semiconductor_function', null),
        [
          mod('quantity', '×1'),
          mod('form', 'PX4 EKF2 / ArduPilot EKF3'),
          mod('tolerance', String((p.insPositionDriftMM / 1000).toFixed(1)), 'm/min drift'),
        ],
      ),
    ],
  )

  return {
    module: 'navigation_GPS',
    module_brief: `u-blox ZED-F9P RTK / NEO-M9N multi-band GNSS receiver with IST8310 + RM3100 redundant compass. PX4 EKF2 / ArduPilot EKF3 state estimator achieving ${(p.insPositionDriftMM / 1000).toFixed(1)} m/min INS drift in GNSS-denied conditions.`,
    overview_paragraph_en: '',
    derived_parameters: {
      ins_position_drift_m_per_min: p.insPositionDriftMM / 1000,
    },
    allowed_radicals: [
      'silicon_semiconductor_function',
      'inertial_sensing_function',
      'fr4',
      'silicon_wafer',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [gnss, ins],
  }
}

// ---------------------------------------------------------------------------
// MODULE 8 — obstacle_sensing
// ---------------------------------------------------------------------------

function emitObstacleSensing(p: DroneParams) {
  const lidar = makeSubModule(
    'lidar_obstacle_sensor',
    'LiDAR obstacle sensor',
    'detects',
    `time-of-flight LiDAR with ${p.obstacleSensorRangeM.toFixed(0)} m max range`,
    [
      word(
        'lidar_solid_state_word',
        'LiDAR solid-state',
        cc('lidar_solid_state', 'solid-state LiDAR', 'optical_imaging_function', 'silicon_wafer'),
        [
          mod('quantity', '×1'),
          mod('form', 'Ouster OS1-64 / Livox Mid-360 solid-state'),
          mod('dimension', String(p.obstacleSensorRangeM.toFixed(0)), 'm range'),
        ],
      ),
      word(
        'rangefinder_tof_word',
        'rangefinder TOF',
        cc('rangefinder_tof', 'rangefinder TOF', 'optical_imaging_function', 'silicon_wafer'),
        [
          mod('quantity', '×4'),
          mod('form', 'Benewake TF-Luna 8 m TOF (down + ±90° forward)'),
        ],
      ),
    ],
  )

  const vision = makeSubModule(
    'stereo_vision_obstacle',
    'stereo vision obstacle',
    'avoids',
    'forward stereo vision for obstacle avoidance + visual odometry',
    [
      word(
        'stereo_camera_pair_word',
        'stereo camera pair',
        cc('stereo_camera_pair', 'stereo camera pair', 'optical_imaging_function', 'silicon_wafer'),
        [
          mod('quantity', '×1'),
          mod('form', 'Intel RealSense D455 / Luxonis OAK-D Pro'),
        ],
      ),
    ],
  )

  return {
    module: 'obstacle_sensing',
    module_brief: `Ouster OS1-64 / Livox Mid-360 solid-state LiDAR (${p.obstacleSensorRangeM.toFixed(0)} m max range) + Benewake TF-Luna TOF rangefinders + Intel RealSense D455 stereo vision. Continuous SLAM + obstacle avoidance.`,
    overview_paragraph_en: '',
    derived_parameters: {
      obstacle_sensor_range_m: p.obstacleSensorRangeM,
    },
    allowed_radicals: [
      'optical_imaging_function',
      'silicon_wafer',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [lidar, vision],
  }
}

// ---------------------------------------------------------------------------
// MODULE 9 — charging_dock
// ---------------------------------------------------------------------------

function emitChargingDock(p: DroneParams) {
  const charger = makeSubModule(
    'smart_balance_charger',
    'smart balance charger',
    'charges',
    `6S LiPo balance charger sized for ${(p.batteryKwh * 1000).toFixed(0)} Wh pack`,
    [
      word(
        'smart_balance_charger_word',
        'smart balance charger',
        cc('smart_balance_charger', 'smart balance charger', 'silicon_semiconductor_function', 'aluminium'),
        [
          mod('quantity', '×1'),
          mod('capacity', String((p.batteryKwh * 1000 * 2).toFixed(0)), 'W'),
          mod('form', 'ISDT P30 / Hota D6 dual-channel 600 W'),
          mod('regulatory', 'CE LVD'),
        ],
      ),
    ],
  )

  return {
    module: 'charging_dock',
    module_brief: `ISDT P30 / Hota D6 dual-channel 600 W smart balance charger for 6S LiPo packs. CE LVD certified. 0.5C fast charge for rapid mission turnaround.`,
    overview_paragraph_en: '',
    derived_parameters: {
      charger_power_w: p.batteryKwh * 2000,
    },
    allowed_radicals: [
      'silicon_semiconductor_function',
      'aluminium',
    ],
    applicability_confidence: 'medium' as const,
    sub_modules: [charger],
  }
}

// ---------------------------------------------------------------------------
// CROSS-MODULE GRAMMAR LINKS
// ---------------------------------------------------------------------------

function emitCrossModuleGrammarLinks() {
  return [
    { from_module: 'energy_storage_battery', to_module: 'motor_prop_array', mechanism: 'electrical_bus', type: 'directional' as const, detail: 'LiPo pack → PDB → ESCs' },
    { from_module: 'motor_prop_array', to_module: 'airframe_structure', mechanism: 'mechanical', type: 'directional' as const, detail: 'motors mounted on arm tips' },
    { from_module: 'flight_control_avionics', to_module: 'motor_prop_array', mechanism: 'data', type: 'directional' as const, detail: 'PWM/DShot motor commands' },
    { from_module: 'navigation_GPS', to_module: 'flight_control_avionics', mechanism: 'data', type: 'directional' as const, detail: 'position + heading to autopilot' },
    { from_module: 'obstacle_sensing', to_module: 'flight_control_avionics', mechanism: 'data', type: 'directional' as const, detail: 'obstacle map + collision avoidance' },
    { from_module: 'sensor_payload_gimbal', to_module: 'telemetry_comms', mechanism: 'data', type: 'directional' as const, detail: 'video feed → downlink' },
    { from_module: 'telemetry_comms', to_module: 'flight_control_avionics', mechanism: 'data', type: 'mutual' as const, detail: 'RC commands + telemetry' },
    { from_module: 'sensor_payload_gimbal', to_module: 'airframe_structure', mechanism: 'mechanical', type: 'directional' as const, detail: 'gimbal underslung mount' },
    { from_module: 'charging_dock', to_module: 'energy_storage_battery', mechanism: 'electrical_bus', type: 'directional' as const, detail: 'XT60 charge connector' },
  ]
}

// ---------------------------------------------------------------------------
// MAIN EMITTER
// ---------------------------------------------------------------------------

const emitDroneDesign: ClassEmitter = (contract, _brief, _envelope): DesignJSON => {
  const p = deriveDroneParams(contract)
  const modules = [
    emitAirframeStructure(p),
    emitMotorPropArray(p),
    emitEnergyStorageBattery(p),
    emitFlightControlAvionics(p),
    emitSensorPayloadGimbal(p),
    emitTelemetryComms(p),
    emitNavigationGPS(p),
    emitObstacleSensing(p),
    emitChargingDock(p),
  ]
  return {
    modules: modules as unknown as DesignJSON['modules'],
    cross_module_grammar_links: emitCrossModuleGrammarLinks(),
    excluded_modules: [],
    rationale_excluded: 'All 9 canonical modules apply to multirotor drone class.',
    brief_overview_prose: {
      overview_and_context: '',
      mission_statement: `Deliver ${p.endurance_min.toFixed(0)}-minute flight endurance with a ${p.mtowKg.toFixed(2)} kg MTOW ${p.motorCount}-arm multirotor drone, ${(p.batteryKwh * 1000).toFixed(0)} Wh LiPo pack, ${p.payloadKg.toFixed(2)} kg gimbal-stabilised EO+LWIR payload, PX4/ArduPilot autopilot.`,
      target_customers: '',
      why_now: '',
    },
  }
}

registerAssembler('drone', emitDroneDesign)
