/**
 * scripts/lib/orchestrator/emitters/humanoid.ts
 *
 * HUMANOID ROBOT deterministic emitter — 2026-05-22.
 *
 * 12 modules: head_perception_sensors, neck_pan_tilt, shoulder_arm_joints,
 * hand_dexterous_fingers, torso_central_compute, hip_pelvis_joints,
 * knee_ankle_joints, foot_terrain_sensor, battery_pack, BMS_thermal_loop,
 * wireless_command_link, regulatory_safety.
 *
 * Industry refs: Figure 02 (52 kg, 7-DOF arms, 16-DOF hands), Apollo
 * (72 kg, 30 actuators), Atlas-2 (electric, 89 kg), Optimus Gen-2
 * (57 kg, 11-DOF hands). Joint actuators typically QDD (quasi-direct
 * drive) brushless motors with planetary gearheads at hips/knees,
 * harmonic-drive at shoulders/elbows.
 */

import { registerAssembler } from '../assembler'
import type { ClassEmitter, DesignJSON, DesignModule } from '../assembler'
import type { ContractInProgress } from '../types'

// Re-declare minimal types locally
interface Mod { kind: string; value: string; unit?: string }
interface CC { character_id: string; name_human: string;
  function_radical_primary: string | null; function_radical_secondary: string | null;
  material_radical_primary: string | null; material_radical_secondary: string | null }
interface W { id: string; name_human: string; content_character: CC; modifier_characters: Mod[] }
interface SM { id: string; name_human: string; english_sentence: string; rad_syntax: string;
  role_verb: string; topology_clause: string; words: W[] }

function q(c: ContractInProgress, key: string, fallback: number): number {
  const v = c.quantities?.[key]?.value
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}
function fmtQty(n: number): string { return Number.isInteger(n) ? `×${n}` : `×${n.toFixed(2)}` }
function mod(k: string, v: string, u?: string): Mod { return u !== undefined ? { kind: k, value: v, unit: u } : { kind: k, value: v } }
function cc(id: string, n: string, fp: string | null, mp: string | null, fs: string | null = null, ms: string | null = null): CC {
  return { character_id: id, name_human: n, function_radical_primary: fp, function_radical_secondary: fs, material_radical_primary: mp, material_radical_secondary: ms }
}
function word(id: string, n: string, c: CC, m: Mod[]): W {
  // Universal fix #A (2026-05-22): strip literal " word" suffix from name_human.
  const cleanName = n.replace(/\s+word$/i, '')
  return { id, name_human: cleanName, content_character: c, modifier_characters: m }
}
function rad(ws: W[]): string {
  return ws.map(w => {
    const o = [...w.modifier_characters].sort((a, b) => a.kind === 'quantity' ? -1 : b.kind === 'quantity' ? 1 : 0)
    const toks = o.map(m => m.unit ? `${m.value}${m.unit}` : m.value)
    return toks.length === 0 ? w.content_character.character_id : `${w.content_character.character_id} (${toks.join(', ')})`
  }).join(' ⊙ ')
}
function makeSub(id: string, n: string, role: string, top: string, ws: W[]): SM {
  return { id, name_human: n, english_sentence: '', rad_syntax: rad(ws), role_verb: role, topology_clause: top, words: ws }
}

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

interface HumParams {
  totalMassKg: number
  heightM: number
  payloadKg: number
  cellCount: number
  packKwh: number
  packMassKg: number
  motorPowerKw: number
  peakKneeNm: number
  peakHipNm: number
  peakShoulderNm: number
  peakElbowNm: number
  zmpMarginMm: number
  dexterityIndex: number
  runtimeHrs: number
  fingerDof: number
  jointCount: number
}

function deriveParams(c: ContractInProgress): HumParams {
  return {
    totalMassKg: q(c, 'total_mass_kg', 60),
    heightM: q(c, 'height_m', 1.7),
    payloadKg: q(c, 'payload_mass_kg', 25),
    cellCount: Math.max(1, Math.round(q(c, 'cell_count', 270))),
    packKwh: q(c, 'nameplate_capacity_kwh', 5.0),
    packMassKg: q(c, 'total_cell_mass_kg', 17),
    motorPowerKw: q(c, 'total_motor_power_kw', 1.5),
    peakKneeNm: q(c, 'peak_knee_torque_nm', 280),
    peakHipNm: q(c, 'peak_hip_torque_nm', 320),
    peakShoulderNm: q(c, 'peak_shoulder_torque_nm', 120),
    peakElbowNm: q(c, 'peak_elbow_torque_nm', 80),
    zmpMarginMm: q(c, 'zmp_margin_mm', 35),
    dexterityIndex: q(c, 'dexterity_index', 0.72),
    runtimeHrs: q(c, 'battery_runtime_hours', 4.5),
    fingerDof: Math.max(1, Math.round(q(c, 'finger_dof', 11))),
    jointCount: Math.max(1, Math.round(q(c, 'joint_count', 36))),
  }
}

// ---------------------------------------------------------------------------
// 1. head_perception_sensors
// ---------------------------------------------------------------------------

function emitHeadPerceptionSensors(_p: HumParams): DesignModule {
  const cam = makeSub('rgbd_camera_pair', 'RGB-D stereo camera pair', 'perceives',
    '2× Intel RealSense D435 stereo depth + 5MP RGB at 90 fps', [
    word('rgbd_camera_word', 'RGB-D stereo camera',
      cc('rgbd_camera', 'RGB-D stereo camera', 'optical_sensing_function', 'polymer_thermoplastic'),
      [mod('quantity', '×2'), mod('form', 'Intel RealSense D435'), mod('capacity', '90', 'fps'), mod('regulatory', 'IEC 60825-1 Class 1')]),
    word('imu_9dof_word', 'IMU 9-DOF',
      cc('imu_9dof', 'IMU 9-DOF', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×1'), mod('form', 'Bosch BMI088 + magnetometer'), mod('capacity', '2000', 'Hz')]),
    word('microphone_array_word', 'microphone array',
      cc('microphone_array', 'microphone array', 'optical_sensing_function', 'polymer_thermoplastic'),
      [mod('quantity', '×4'), mod('form', 'MEMS far-field')]),
    // BESS L2 fan-out 2026-05-24: aggregate `sensor_suite` word so the
    // engineering-contract.ts macro propagates through the strict matcher in
    // scripts/render-minimal-pdf.tsx:885-927. Aggregates cameras + IMU +
    // microphones + foot F/T + ToF lidar across the body.
    word('sensor_suite_word', 'sensor suite',
      cc('sensor_suite', 'sensor suite', 'optical_sensing_function', 'polymer_thermoplastic'),
      [mod('quantity', '×1'),
       mod('form', 'RGB-D cameras + 9-DOF IMU + 4-mic array + foot F/T + ToF lidar aggregate')]),
  ])

  return {
    module: 'control_compute_communication',
    module_brief: 'Head houses stereo RGB-D vision, 9-DOF IMU, and 4-mic far-field array. Total ~3W draw.',
    overview_paragraph_en: '',
    derived_parameters: { camera_count: 2, mic_count: 4 },
    allowed_radicals: ['optical_sensing_function', 'silicon_semiconductor_function', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [cam],
  }
}

// ---------------------------------------------------------------------------
// 2. neck_pan_tilt
// ---------------------------------------------------------------------------

function emitNeckPanTilt(_p: HumParams): DesignModule {
  const neck = makeSub('neck_pan_tilt_actuator', 'neck pan-tilt actuator', 'orients',
    '2-DOF pan/tilt for head positioning, ±90° pan ±60° tilt', [
    word('neck_servo_motor_word', 'neck servo motor',
      cc('neck_servo_motor', 'neck servo motor', 'electromechanical_switching_function', 'steel'),
      [mod('quantity', '×2'), mod('form', 'Dynamixel XH540'), mod('capacity', '10', 'N·m')]),
    // BESS L2 fan-out 2026-05-24: aggregate `waist_neck_actuators` word so
    // the engineering-contract.ts macro propagates through the strict matcher
    // in scripts/render-minimal-pdf.tsx:885-927. Pairs neck pan/tilt with
    // 3 waist actuators per the contract dofWaistNeck=5 budget.
    word('waist_neck_actuators_word', 'waist neck actuators',
      cc('waist_neck_actuators', 'waist + neck actuators', 'electromechanical_switching_function', 'steel'),
      [mod('quantity', '×5'),
       mod('form', 'series-elastic 5-30 N·m + pan/tilt neck servos for sensor orientation')]),
  ])

  return {
    module: 'mass_fluid_transport_process',
    module_brief: 'Neck pan-tilt: 2-DOF Dynamixel-class servos providing ±90° pan and ±60° tilt for head orientation.',
    overview_paragraph_en: '',
    derived_parameters: { neck_dof: 2 },
    allowed_radicals: ['electromechanical_switching_function', 'steel', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [neck],
  }
}

// ---------------------------------------------------------------------------
// 3. shoulder_arm_joints
// ---------------------------------------------------------------------------

function emitShoulderArmJoints(p: HumParams): DesignModule {
  const shoulder = makeSub('shoulder_qdd_actuator', 'shoulder QDD actuator', 'articulates',
    `7-DOF arm with QDD brushless motors + harmonic-drive at shoulder, ${p.peakShoulderNm.toFixed(0)} N·m peak`, [
    word('shoulder_qdd_motor_word', 'shoulder QDD motor',
      cc('shoulder_qdd_motor', 'shoulder QDD brushless motor', 'electromechanical_switching_function', 'steel'),
      [mod('quantity', '×6'),
       mod('form', 'T-Motor U10 Pro / Apptronik custom QDD'),
       mod('capacity', String(Math.round(p.peakShoulderNm)), 'N·m')]),
    word('harmonic_drive_word', 'harmonic drive',
      cc('harmonic_drive', 'harmonic drive reducer', 'electromechanical_switching_function', 'steel'),
      [mod('quantity', '×6'),
       mod('form', 'CSF-25-160 / Leaderdrive YDH-32'),
       mod('capacity', '160', ':1')]),
    word('elbow_actuator_word', 'elbow actuator',
      cc('elbow_actuator', 'elbow actuator', 'electromechanical_switching_function', 'steel'),
      [mod('quantity', '×2'),
       mod('capacity', String(Math.round(p.peakElbowNm)), 'N·m')]),
    // BESS L2 fan-out 2026-05-24: aggregate `arm_actuator_assembly` word so
    // the engineering-contract.ts macro propagates through the strict matcher
    // in scripts/render-minimal-pdf.tsx:885-927.
    word('arm_actuator_assembly_word', 'arm actuator assembly',
      cc('arm_actuator_assembly', 'arm actuator assembly', 'electromechanical_switching_function', 'steel'),
      [mod('quantity', '×14'),
       mod('form', '7-DOF bilateral: harmonic-drive shoulder + elbow + wrist actuators 10-80 N·m'),
       mod('capacity', String(Math.round(p.peakShoulderNm)), 'N·m')]),
  ])

  return {
    module: 'energy_conversion_transduction',
    module_brief: `7-DOF arms (×2): 6 QDD brushless + harmonic drive at shoulder/elbow yielding ${p.peakShoulderNm.toFixed(0)} N·m peak at shoulder and ${p.peakElbowNm.toFixed(0)} N·m at elbow.`,
    overview_paragraph_en: '',
    derived_parameters: {
      arm_dof: 7,
      peak_shoulder_torque_nm: p.peakShoulderNm,
      peak_elbow_torque_nm: p.peakElbowNm,
    },
    allowed_radicals: ['electromechanical_switching_function', 'steel', 'aluminium', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [shoulder],
  }
}

// ---------------------------------------------------------------------------
// 4. hand_dexterous_fingers
// ---------------------------------------------------------------------------

function emitHandDexterousFingers(p: HumParams): DesignModule {
  const hand = makeSub('dexterous_hand', 'dexterous 5-finger hand', 'grasps',
    `${p.fingerDof}-DOF tendon-driven hands (×2) with tactile sensing`, [
    word('tendon_drive_motor_word', 'tendon drive motor',
      cc('tendon_drive_motor', 'tendon drive motor', 'electromechanical_switching_function', 'steel'),
      [mod('quantity', fmtQty(p.fingerDof * 2)),
       mod('form', 'Maxon EC-flat 32 + Spectra cable'),
       mod('capacity', '5', 'N·m')]),
    word('fingertip_tactile_sensor_word', 'fingertip tactile sensor',
      cc('fingertip_tactile_sensor', 'fingertip tactile sensor', 'optical_sensing_function', 'polymer_thermoplastic'),
      [mod('quantity', '×10'),
       mod('form', 'GelSight Mini / capacitive array')]),
    // BESS L2 fan-out 2026-05-24: aggregate `hand_finger_actuators` +
    // `end_effector_hands` words so the engineering-contract.ts macros
    // propagate through the strict matcher in
    // scripts/render-minimal-pdf.tsx:885-927.
    word('hand_finger_actuators_word', 'hand finger actuators',
      cc('hand_finger_actuators', 'hand finger actuators', 'electromechanical_switching_function', 'steel'),
      [mod('quantity', fmtQty(p.fingerDof * 2)),
       mod('form', 'tendon-driven 0.5-5 N·m miniature actuators per finger DOF (×2 hands)')]),
    word('end_effector_hands_word', 'end effector hands',
      cc('end_effector_hands', 'end effector dexterous hands', 'electromechanical_switching_function', 'steel'),
      [mod('quantity', '×2'),
       mod('form', p.fingerDof >= 10 ? '5-finger dexterous hand with tendon-driven fingers + tactile sensors per fingertip' : '2-finger underactuated gripper for power-grasp')]),
  ])

  return {
    module: 'hmi_ergonomics',
    module_brief: `Dexterous hands: 5 fingers × ${p.fingerDof}-DOF tendon driven across both hands with capacitive + GelSight tactile feedback at each fingertip.`,
    overview_paragraph_en: '',
    derived_parameters: { finger_dof: p.fingerDof, tactile_sensors: 10 },
    allowed_radicals: ['electromechanical_switching_function', 'optical_sensing_function', 'steel', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [hand],
  }
}

// ---------------------------------------------------------------------------
// 5. torso_central_compute
// ---------------------------------------------------------------------------

function emitTorsoCentralCompute(_p: HumParams): DesignModule {
  const compute = makeSub('central_compute', 'central compute', 'orchestrates',
    'NVIDIA Jetson AGX Orin + dedicated motor controller MCU per limb', [
    word('jetson_compute_word', 'Jetson AGX compute',
      cc('jetson_agx_orin', 'NVIDIA Jetson AGX Orin', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×1'),
       mod('form', '64 GB AGX Orin'),
       mod('capacity', '275', 'TOPS')]),
    word('motor_controller_mcu_word', 'motor controller MCU',
      cc('motor_controller_mcu', 'motor controller MCU', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×6'),
       mod('form', 'STM32H7 + FOC'),
       mod('capacity', '480', 'MHz')]),
  ])

  return {
    module: 'control_compute_communication',
    module_brief: 'Torso houses NVIDIA Jetson AGX Orin (275 TOPS) for perception + planning, and six STM32H7 motor controller MCUs for distributed field-oriented control.',
    overview_paragraph_en: '',
    derived_parameters: { compute_tops: 275, mcu_count: 6 },
    allowed_radicals: ['silicon_semiconductor_function', 'electrical_conducting_function', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [compute],
  }
}

// ---------------------------------------------------------------------------
// 6. hip_pelvis_joints
// ---------------------------------------------------------------------------

function emitHipPelvisJoints(p: HumParams): DesignModule {
  const hip = makeSub('hip_qdd_actuator', 'hip QDD actuator', 'articulates',
    `3-DOF hip joints (×2) with ${p.peakHipNm.toFixed(0)} N·m peak at flexion/extension`, [
    word('hip_qdd_motor_word', 'hip QDD motor',
      cc('hip_qdd_motor', 'hip QDD brushless motor', 'electromechanical_switching_function', 'steel'),
      [mod('quantity', '×6'),
       mod('form', 'T-Motor AK80-64 / custom QDD'),
       mod('capacity', String(Math.round(p.peakHipNm)), 'N·m')]),
    word('hip_planetary_gear_word', 'hip planetary gearbox',
      cc('hip_planetary_gear', 'hip planetary gearbox', 'electromechanical_switching_function', 'steel'),
      [mod('quantity', '×6'),
       mod('form', 'planetary 9:1'),
       mod('regulatory', 'AGMA Class 10')]),
  ])

  return {
    module: 'energy_conversion_transduction',
    module_brief: `Hip: 3-DOF per leg with QDD brushless motors + 9:1 planetary gearboxes delivering ${p.peakHipNm.toFixed(0)} N·m peak.`,
    overview_paragraph_en: '',
    derived_parameters: { hip_dof_per_leg: 3, peak_hip_torque_nm: p.peakHipNm },
    allowed_radicals: ['electromechanical_switching_function', 'steel', 'aluminium'],
    applicability_confidence: 'high',
    sub_modules: [hip],
  }
}

// ---------------------------------------------------------------------------
// 7. knee_ankle_joints
// ---------------------------------------------------------------------------

function emitKneeAnkleJoints(p: HumParams): DesignModule {
  const knee = makeSub('knee_qdd_actuator', 'knee QDD actuator', 'articulates',
    `1-DOF knee with parallel elastic element, ${p.peakKneeNm.toFixed(0)} N·m peak`, [
    word('knee_qdd_motor_word', 'knee QDD motor',
      cc('knee_qdd_motor', 'knee QDD brushless motor', 'electromechanical_switching_function', 'steel'),
      [mod('quantity', '×2'),
       mod('capacity', String(Math.round(p.peakKneeNm)), 'N·m'),
       mod('form', 'T-Motor AK80-64')]),
    word('knee_parallel_spring_word', 'knee parallel elastic spring',
      cc('knee_parallel_spring', 'knee parallel elastic spring', 'electromechanical_switching_function', 'steel'),
      [mod('quantity', '×2'),
       mod('form', 'torsion spring'),
       mod('capacity', '15', 'N·m/rad')]),
    word('ankle_actuator_word', 'ankle actuator',
      cc('ankle_actuator', 'ankle actuator', 'electromechanical_switching_function', 'steel'),
      [mod('quantity', '×4'),
       mod('form', '2-DOF parallel actuator'),
       mod('capacity', '150', 'N·m')]),
    // BESS L2 fan-out 2026-05-24: aggregate `leg_actuator_assembly` word so
    // the engineering-contract.ts macro propagates through the strict matcher
    // in scripts/render-minimal-pdf.tsx:885-927. Aggregates 12 leg actuators
    // (hip3 + knee + ankle2 per leg × 2 legs).
    word('leg_actuator_assembly_word', 'leg actuator assembly',
      cc('leg_actuator_assembly', 'leg actuator assembly', 'electromechanical_switching_function', 'steel'),
      [mod('quantity', '×12'),
       mod('form', 'QDD brushless 50-200 N·m: hip3 + knee + ankle2 per leg, FOC servo drive with absolute encoder'),
       mod('capacity', String(Math.round(p.peakHipNm)), 'N·m')]),
  ])

  return {
    module: 'energy_conversion_transduction',
    module_brief: `Knee + ankle: 1-DOF knee with parallel elastic spring (${p.peakKneeNm.toFixed(0)} N·m), 2-DOF ankle parallel-actuator at 150 N·m peak.`,
    overview_paragraph_en: '',
    derived_parameters: { knee_dof_per_leg: 1, ankle_dof_per_leg: 2, peak_knee_torque_nm: p.peakKneeNm },
    allowed_radicals: ['electromechanical_switching_function', 'steel', 'aluminium'],
    applicability_confidence: 'high',
    sub_modules: [knee],
  }
}

// ---------------------------------------------------------------------------
// 8. foot_terrain_sensor
// ---------------------------------------------------------------------------

function emitFootTerrainSensor(p: HumParams): DesignModule {
  const foot = makeSub('foot_sole_assembly', 'foot sole assembly', 'contacts',
    `250×100 mm foot with 6-axis F/T sensor + tactile pressure pad, ${p.zmpMarginMm.toFixed(0)} mm ZMP margin`, [
    word('foot_sole_word', 'foot sole',
      cc('foot_sole', 'foot sole', 'electromechanical_switching_function', 'polymer_thermoplastic'),
      [mod('quantity', '×2'),
       mod('form', 'rubber tread + aluminium core'),
       mod('dimension', '250', 'mm length')]),
    word('foot_ft_sensor_word', 'foot 6-axis F/T sensor',
      cc('foot_ft_sensor', 'foot 6-axis force/torque sensor', 'optical_sensing_function', 'steel'),
      [mod('quantity', '×2'),
       mod('form', 'ATI Mini45'),
       mod('capacity', '660', 'N')]),
    word('foot_pressure_pad_word', 'foot pressure pad',
      cc('foot_pressure_pad', 'foot pressure pad', 'optical_sensing_function', 'polymer_thermoplastic'),
      [mod('quantity', '×2'),
       mod('form', 'Tekscan F-Scan')]),
    // BESS L2 fan-out 2026-05-24: aggregate `structural_frame` word so the
    // engineering-contract.ts macro propagates through the strict matcher in
    // scripts/render-minimal-pdf.tsx:885-927. Whole-body chassis (7075-T6
    // aluminium or CFRP-hybrid for the consumer/light variant).
    word('structural_frame_word', 'structural frame',
      cc('structural_frame', 'structural frame', 'electromechanical_switching_function', 'aluminium'),
      [mod('quantity', '×1'),
       mod('form', '7075-T6 aluminium machined/cast structural members + steel fasteners (consumer variant: CFRP shells + aluminium endplates)')]),
  ])

  return {
    module: 'environmental_interface',
    module_brief: `Foot soles (×2): rubber tread on aluminium core, 6-axis F/T sensor and pressure pad each. ZMP margin ${p.zmpMarginMm.toFixed(0)} mm at design walking gait.`,
    overview_paragraph_en: '',
    derived_parameters: { foot_count: 2, zmp_margin_mm: p.zmpMarginMm },
    allowed_radicals: ['electromechanical_switching_function', 'optical_sensing_function', 'aluminium', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [foot],
  }
}

// ---------------------------------------------------------------------------
// 9. battery_pack
// ---------------------------------------------------------------------------

function emitBatteryPack(p: HumParams): DesignModule {
  const pack = makeSub('battery_pack_lion', 'Li-ion battery pack', 'stores',
    `${p.packKwh.toFixed(2)} kWh NMC811 21700-class pack of ${p.cellCount} cells in a backpack form factor`, [
    word('humanoid_battery_cell_word', '21700 NMC811 cell',
      cc('humanoid_battery_cell', '21700 NMC811 cell', 'electrochemical_energy_function', 'lithium_iron_phosphate_chemistry'),
      [mod('quantity', fmtQty(p.cellCount)),
       mod('form', '21700 cylindrical'),
       mod('capacity', '5', 'Ah'),
       mod('regulatory', 'UN 38.3 + IEC 62133')]),
    word('pack_busbar_copper_word', 'pack busbar copper',
      cc('pack_busbar_copper', 'pack busbar copper', 'electrical_conducting_function', 'copper'),
      [mod('quantity', '×8'),
       mod('form', '0.3 mm nickel-plated copper')]),
    word('pack_enclosure_word', 'pack enclosure',
      cc('pack_enclosure', 'pack enclosure', 'electromechanical_switching_function', 'aluminium'),
      [mod('quantity', '×1'),
       mod('form', 'aluminium 6061 + EPDM gasket'),
       mod('regulatory', 'IP54')]),
    // BESS L2 fan-out 2026-05-24: aggregate `lithium_ion_battery_pack` +
    // `enclosure_skin_panels` words so the engineering-contract.ts macros
    // propagate through the strict matcher in
    // scripts/render-minimal-pdf.tsx:885-927.
    word('lithium_ion_battery_word', 'lithium-ion battery',
      cc('lithium_ion_battery', 'lithium-ion battery', 'electrochemical_energy_function', 'lithium_iron_phosphate_chemistry'),
      [mod('quantity', '×1'),
       mod('form', `48 V Li-ion 18650/21700 pouch (${p.packKwh.toFixed(2)} kWh at 220 Wh/kg pack-level)`),
       mod('capacity', p.packKwh.toFixed(2), 'kWh')]),
    word('enclosure_skin_panels_word', 'enclosure skin panels',
      cc('enclosure_skin_panels', 'enclosure skin panels', 'electromechanical_switching_function', 'polymer_thermoplastic'),
      [mod('quantity', '×1'),
       mod('form', 'moulded polycarbonate / soft TPE skin shells (IP54 dust + water spray rating; ISO 13482 force-limited for consumer variant)')]),
  ])

  return {
    module: 'energy_storage_source',
    module_brief: `${p.packKwh.toFixed(2)} kWh battery pack: ${p.cellCount}× 21700 NMC811 cells in a backpack-mount aluminium enclosure with copper busbars; ${p.runtimeHrs.toFixed(1)} hour runtime at typical duty cycle.`,
    overview_paragraph_en: '',
    derived_parameters: {
      capacity_kwh: p.packKwh,
      cell_count: p.cellCount,
      runtime_hours: p.runtimeHrs,
    },
    allowed_radicals: ['electrochemical_energy_function', 'electrical_conducting_function', 'aluminium', 'copper', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [pack],
  }
}

// ---------------------------------------------------------------------------
// 10. BMS_thermal_loop
// ---------------------------------------------------------------------------

function emitBmsThermalLoop(_p: HumParams): DesignModule {
  const bms = makeSub('bms_master_slave', 'BMS master + slave', 'monitors',
    'BMS master + 2 slave boards monitor pack voltage, temperature, current', [
    word('bms_master_word', 'BMS master',
      cc('bms_master_humanoid', 'BMS master', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×1'),
       mod('form', 'STM32G4 + ISL94202'),
       mod('regulatory', 'ISO 26262 ASIL-B')]),
    word('bms_slave_word', 'BMS slave',
      cc('bms_slave_humanoid', 'BMS slave', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×2'),
       mod('form', 'ISL94212 16-channel')]),
    word('pack_thermistor_word', 'pack thermistor',
      cc('pack_thermistor', 'pack thermistor', 'thermal_transfer_function', 'ceramic'),
      [mod('quantity', '×8'),
       mod('form', 'NTC 10k')]),
    // BESS L2 fan-out 2026-05-24: aggregate `thermal_management_cooling`
    // word so the engineering-contract.ts macro propagates through the
    // strict matcher in scripts/render-minimal-pdf.tsx:885-927.
    word('thermal_management_cooling_word', 'thermal management cooling',
      cc('thermal_management_cooling', 'thermal management cooling loop', 'thermal_transfer_function', 'aluminium'),
      [mod('quantity', '×1'),
       mod('form', 'forced-air blower + heat-pipe to chassis skin for battery and motor drives'),
       mod('regulatory', 'ISO 13482 <60°C surface temp limit')]),
  ])

  return {
    module: 'safety_protection',
    module_brief: 'BMS architecture: STM32G4-class master + 2× ISL94212 slaves with 8 pack thermistors. ISO 26262 ASIL-B functional safety target.',
    overview_paragraph_en: '',
    derived_parameters: { bms_slave_count: 2, thermistor_count: 8 },
    allowed_radicals: ['silicon_semiconductor_function', 'thermal_transfer_function', 'ceramic', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [bms],
  }
}

// ---------------------------------------------------------------------------
// 11. wireless_command_link
// ---------------------------------------------------------------------------

function emitWirelessCommandLink(_p: HumParams): DesignModule {
  const wifi = makeSub('wifi_5g_modem', 'WiFi 6 + 5G modem', 'communicates',
    'WiFi 6 dual-band + 5G NR-Lite C-band cellular for cloud teleop and fleet management', [
    word('wifi6_modem_word', 'WiFi 6 modem',
      cc('wifi6_modem', 'WiFi 6 modem', 'optical_sensing_function', 'polymer_thermoplastic'),
      [mod('quantity', '×1'),
       mod('form', 'Intel AX210'),
       mod('capacity', '2.4', 'Gbps')]),
    word('cellular_5g_modem_word', '5G modem',
      cc('cellular_5g_modem', '5G NR modem', 'optical_sensing_function', 'polymer_thermoplastic'),
      [mod('quantity', '×1'),
       mod('form', 'Quectel RM520N'),
       mod('capacity', '4', 'Gbps')]),
    word('antenna_word', 'antenna',
      cc('humanoid_antenna', 'helical antenna', 'optical_sensing_function', 'copper'),
      [mod('quantity', '×2'),
       mod('form', 'dual-band helical'),
       mod('capacity', '3', 'dBi')]),
  ])

  return {
    module: 'maintenance_serviceability',
    module_brief: 'Wireless: WiFi 6 (2.4 Gbps) + 5G NR-Lite cellular (4 Gbps) dual-stack with 3 dBi helical antennas. Supports remote teleop and fleet OTA updates.',
    overview_paragraph_en: '',
    derived_parameters: { wifi_speed_gbps: 2.4, cellular_speed_gbps: 4 },
    allowed_radicals: ['optical_sensing_function', 'silicon_semiconductor_function', 'copper', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [wifi],
  }
}

// ---------------------------------------------------------------------------
// 12. regulatory_safety
// ---------------------------------------------------------------------------

function emitRegulatorySafety(_p: HumParams): DesignModule {
  const certifs = makeSub('safety_certifications', 'safety certifications', 'certifies',
    'ISO 13482 personal-care robot + ISO 10218 industrial robot + IEC 61508 functional safety + IEC 62443 industrial cybersecurity', [
    word('iso13482_label_word', 'ISO 13482 label',
      cc('iso13482_label', 'ISO 13482 personal-care robot label', null, 'polymer_thermoplastic'),
      [mod('quantity', '×1'),
       mod('regulatory', 'ISO 13482:2014')]),
    word('safety_estop_word', 'safety e-stop',
      cc('safety_estop_humanoid', 'safety e-stop button', 'electromechanical_switching_function', 'polymer_thermoplastic'),
      [mod('quantity', '×3'),
       mod('form', 'palm + back + remote'),
       mod('regulatory', 'ISO 13850 PLe')]),
  ])

  return {
    module: 'maintenance_serviceability',
    module_brief: 'Safety basis: ISO 13482 + ISO 10218 + IEC 61508 + IEC 62443. Three redundant e-stop locations (palm, back, remote) and PLe-rated emergency stop circuits.',
    overview_paragraph_en: '',
    derived_parameters: { estop_count: 3 },
    allowed_radicals: ['electromechanical_switching_function', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [certifs],
  }
}

// ---------------------------------------------------------------------------
// Cross-module grammar links
// ---------------------------------------------------------------------------

function emitCrossModuleGrammarLinks(p: HumParams) {
  return [
    { from_module: 'energy_storage_source', to_module: 'energy_conversion_transduction',
      mechanism: 'electrical_bus', type: 'directional' as const,
      detail: `48 V DC bus from pack to motor drivers at ${p.motorPowerKw.toFixed(2)} kW continuous` },
    { from_module: 'control_compute_communication', to_module: 'energy_conversion_transduction',
      mechanism: 'data', type: 'directional' as const,
      detail: 'CAN-FD command + telemetry from Jetson to STM32H7 motor controllers' },
    { from_module: 'control_compute_communication', to_module: 'mass_fluid_transport_process',
      mechanism: 'data', type: 'directional' as const, detail: 'neck pan-tilt control loop' },
    { from_module: 'environmental_interface', to_module: 'control_compute_communication',
      mechanism: 'data', type: 'directional' as const, detail: 'F/T sensor + pressure pad → balance control' },
    { from_module: 'control_compute_communication', to_module: 'hmi_ergonomics',
      mechanism: 'data', type: 'mutual' as const, detail: 'tactile feedback ↔ grasp planner' },
    { from_module: 'safety_protection', to_module: 'energy_storage_source',
      mechanism: 'control', type: 'directional' as const, detail: 'BMS supervises pack' },
    { from_module: 'maintenance_serviceability', to_module: 'control_compute_communication',
      mechanism: 'data', type: 'mutual' as const, detail: 'WiFi 6 + 5G cellular telemetry / OTA' },
  ]
}

// ---------------------------------------------------------------------------
// PUBLIC EMITTER
// ---------------------------------------------------------------------------

const emitter: ClassEmitter = (contract, _brief, _envelope): DesignJSON => {
  const p = deriveParams(contract)
  const modules: DesignModule[] = [
    emitHeadPerceptionSensors(p),
    emitNeckPanTilt(p),
    emitShoulderArmJoints(p),
    emitHandDexterousFingers(p),
    emitTorsoCentralCompute(p),
    emitHipPelvisJoints(p),
    emitKneeAnkleJoints(p),
    emitFootTerrainSensor(p),
    emitBatteryPack(p),
    emitBmsThermalLoop(p),
    emitWirelessCommandLink(p),
    emitRegulatorySafety(p),
  ]
  return {
    modules,
    cross_module_grammar_links: emitCrossModuleGrammarLinks(p),
    excluded_modules: [],
    rationale_excluded: 'All 12 humanoid modules apply.',
    brief_overview_prose: {
      overview_and_context: '',
      mission_statement: `Bipedal humanoid robot, ${p.totalMassKg.toFixed(0)} kg, ${p.heightM.toFixed(2)} m tall, ${p.payloadKg.toFixed(0)} kg payload, with ${p.jointCount} DOF and ${p.runtimeHrs.toFixed(1)} hour runtime from a ${p.packKwh.toFixed(2)} kWh NMC811 21700-class pack. ZMP margin ${p.zmpMarginMm.toFixed(0)} mm, dexterity ${p.dexterityIndex.toFixed(2)}.`,
      target_customers: '',
      why_now: '',
    },
  }
}

registerAssembler('humanoid', emitter)
registerAssembler('humanoid/biped', emitter)
