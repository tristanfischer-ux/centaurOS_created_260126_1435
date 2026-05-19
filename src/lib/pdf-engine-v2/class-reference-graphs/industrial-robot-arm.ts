/**
 * @file class-reference-graphs/industrial-robot-arm.ts — K10 typed graph for
 * 6-axis industrial robot arms.
 *
 * @description Models a serial-kinematic 6-axis articulated industrial robot
 * at the 3-50 kg payload class (ABB IRB 1100 / 2400 / 6700, Fanuc M-10/20i /
 * M-710iC / M-2000iA, KUKA KR series, Yaskawa Motoman GP, Universal Robots
 * UR5e/UR10e/UR16e as cobot variant). Comprises the manipulator (robot arm
 * itself), the controller cabinet (drive amplifiers + safety controller +
 * field bus master), and the teach pendant. End-of-arm tooling (gripper,
 * welder, dispenser) is OUT of scope — it varies per cell. SCARA,
 * delta/parallel-kinematic, and cartesian gantry robots are different
 * mechanical archetypes and live in separate graphs when seeded.
 *
 * @sources Corpus values from `pretraining_extracted_specs` joined to
 * `pretraining_spec_documents WHERE product_class='industrial_robot_arm'` in
 * ~/.forge-truth/forge-truth.db (22 datasheets, well-covered).
 *
 * @corpus-coverage-2026-05-18
 *   - Controlled axes: 6 (corpus direct; some 5-axis variants).
 *   - Controller power source: 100-240 VAC single-phase (small/cobot) or
 *     200-600 VAC 3-phase (industrial) — corpus direct.
 *   - Average power consumption: 100-2500 W — corpus direct.
 *   - Air supply: 6-8 bar via 4 or 6.5 mm hose — corpus direct.
 *   - Customer signal: 24 V tool I/O at 1-2 A (single/dual pin) — corpus.
 *   - Tool I/O voltage: 12/24 V — corpus direct.
 *   - Manipulator cable: 3, 7, 15, 22, 30 m options — corpus direct.
 *   - Teach pendant cable: 4.5 m — corpus direct.
 *   - Payload: 0.3-2300 kg (huge spread; typical 3-50 kg) — corpus direct.
 *   - Reach: 280-3734 mm — corpus direct.
 *   - Repeatability: ISO 9283 (corpus standards).
 *   - IP rating: IP30 (controller) / IP54 (robot standard) / IP67
 *     (FoundryPlus / cleanroom variants) — corpus.
 *   - Safety functions: 17 (corpus) per ISO 10218-1 + ISO 13849-1 PLd
 *     Cat 3 / SIL 2.
 *   - Standards: ISO 10218-1, ISO 9283, ISO 9787, EN 60204-1, ANSI/RIA R15.06,
 *     EN ISO 13849-1, EN ISO 13850, ANSI/UL 1740 — corpus.
 *
 * @scope-2026-05-18
 *   - Industrial 6-axis (ABB IRB / Fanuc M / KUKA KR / Yaskawa GP).
 *   - Cobot variants (UR, FANUC CR, KUKA iiwa) share the same module set
 *     plus a force-torque sensor at the wrist — OPTIONAL edge below.
 *   - End-effector (gripper/welder/dispenser) is OUT of scope — modelled as
 *     an external actuator the robot's tool flange interfaces to.
 *   - Vision systems, conveyor synchronisation, and PLC integration are
 *     external — the field-bus edge from `control_compute_communication`
 *     to the outside world covers the integration boundary.
 */

import { registerClassReferenceGraph, type ProductClassGraph } from '../class-reference-graph.js'

const INDUSTRIAL_ROBOT_ARM: ProductClassGraph = {
  product_class: 'industrial_robot_arm',
  display_name: 'Industrial 6-Axis Robot Arm (3-50 kg payload, serial-kinematic)',
  scope_notes:
    'Serial-kinematic 6-axis articulated industrial robot at the 3-50 kg payload class. ' +
    'Manipulator + controller cabinet + teach pendant. Cobot variants share the same module ' +
    'set plus an optional wrist force-torque sensor. End-of-arm tooling, vision, and cell ' +
    'integration are OUT of scope — modelled at the controller field-bus boundary.',

  nodes: [
    {
      class: 'actuation_kinematics',
      role: 'principal',
      required: true,
      display: '6 axis-mounted servo motors + harmonic-drive / cycloidal gear reducers + joint brakes',
    },
    {
      class: 'energy_conversion_transduction',
      role: 'subsystem',
      required: true,
      display: 'Controller cabinet — 6 servo-drive amplifiers + DC link + rectifier',
    },
    {
      class: 'control_compute_communication',
      role: 'subsystem',
      required: true,
      display: 'Robot controller (RAPID/RC/KSS) + safety controller (PLd) + field bus master (PROFINET/EtherCAT/EtherNet/IP)',
    },
    {
      class: 'power_distribution',
      role: 'subsystem',
      required: true,
      display: 'AC mains terminals (100-240 V / 200-600 V) + tool I/O 24 V supply + grounding bar',
    },
    {
      class: 'sensing_instrumentation',
      role: 'sensor',
      required: true,
      display: 'Joint encoders (absolute multi-turn) + motor current sense + motor temp + cabinet temp',
    },
    {
      class: 'safety_protection',
      role: 'safety',
      required: true,
      display: 'Safe-stop chain (E-stop, safety mat, light curtain) + safe-torque-off + safe-speed monitor',
    },
    {
      class: 'structure_containment',
      role: 'enclosure',
      required: true,
      display: 'Manipulator cast-aluminium links + IP44/IP54 controller cabinet + cable carrier',
    },
    {
      class: 'environmental_interface',
      role: 'subsystem',
      required: true,
      display: 'Controller fans + cabinet heat exchanger + manipulator IP rating (IP54/IP67 FoundryPlus)',
    },
    {
      class: 'hmi_ergonomics',
      role: 'subsystem',
      required: true,
      display: 'Teach pendant (FlexPendant / iPendant / KCP / smartPAD) + jog dial + enable switch',
    },
    {
      class: 'mass_fluid_transport_process',
      role: 'subsystem',
      required: false,
      display: 'Integrated pneumatic supply (6-8 bar) — optional tool air to end-effector',
    },
    {
      class: 'maintenance_serviceability',
      role: 'service',
      required: false,
      display: 'Gearbox oil drain + grease nipples + mastering pin pockets + battery (encoder absolute home retention)',
    },
  ],

  edges: [
    // ── Mains supply path ──
    {
      from_class: 'power_distribution',
      to_class: 'energy_conversion_transduction',
      protocol: 'physical',
      mechanism: 'ac_busbar',
      electrical: {
        voltage_range_v: [100, 600],
        ac_or_dc: 'AC',
        ac_phases: 3,
        ac_frequency_hz: 50,
        current_max_a: 32,
      },
      mechanical: { connector: 'terminal block', cable_type: '4-core 4-6 mm² SWA' },
      required: true,
      direction: 'directional',
      notes: 'Cabinet mains supply. Corpus 100-240 VAC single-phase (cobots/small) or 200-600 VAC 3-phase (industrial). Frequency 50/60 Hz. Average draw 2.5 kW typical (corpus), peak ~7-10 kW under high-acceleration moves.',
      source_references: [
        'corpus:Control Box power source@industrial_robot_arm (100-240 VAC)',
        'corpus:Supply voltage@industrial_robot_arm (200-600 V)',
        'corpus:Voltage 3phase@industrial_robot_arm (380-575 V)',
        'corpus:Average Power consumption@industrial_robot_arm (2.5 kW)',
        'standard:EN 60204-1',
      ],
    },

    // ── Motor drive path (controller → manipulator) ──
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'actuation_kinematics',
      protocol: 'PWM',
      mechanism: 'ac_busbar',
      electrical: {
        voltage_range_v: [0, 600],
        ac_or_dc: 'AC',
        ac_phases: 3,
        current_max_a: 30,
      },
      mechanical: { connector: 'Harting Han 16/E or proprietary multi-pin', cable_type: 'shielded VFD-rated 4-core power + brake' },
      required: true,
      direction: 'directional',
      notes: '6× independent 3-phase variable-frequency power feeds from drive amplifiers to AC servo motors at each joint, bundled through the manipulator cable. Brake supply 24 V DC pulsed off to release joint brakes. Cable lengths 3/7/15/22/30 m (corpus).',
      source_references: [
        'corpus:Manipulator cable length@industrial_robot_arm (3, 7, 15, 22, 30 m)',
        'industry:ABB IRC5 / Fanuc R-30iB cable spec',
      ],
    },

    // ── Encoder feedback path (manipulator → controller) ──
    {
      from_class: 'sensing_instrumentation',
      to_class: 'control_compute_communication',
      protocol: 'Digital-5V',
      mechanism: 'sensor_feedback',
      electrical: { voltage_nominal_v: 5, ac_or_dc: 'DC' },
      mechanical: { connector: 'shared manipulator cable', cable_type: 'shielded twisted pair (EnDat/HIPERFACE/Yaskawa Sigma)' },
      required: true,
      direction: 'mutual',
      notes: 'Absolute multi-turn encoder per joint reports position (typ. 23-bit single-turn + 16-bit multi-turn) over a serial encoder protocol (EnDat, HIPERFACE DSL, Yaskawa Sigma, Mitsubishi serial). Axis resolution 0.01° (corpus). Position feedback runs every PWM cycle for closed-loop torque/velocity/position control.',
      source_references: [
        'corpus:Axis resolution@industrial_robot_arm (0.01 deg)',
        'corpus:Controlled axes@industrial_robot_arm (6)',
        'industry:HEIDENHAIN EnDat encoder protocol',
      ],
    },

    // ── Field bus / cell integration ──
    {
      from_class: 'control_compute_communication',
      to_class: 'energy_conversion_transduction',
      protocol: 'EtherCAT',
      mechanism: 'modbus_tcp',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 5 },
      mechanical: { connector: 'RJ45', cable_type: 'Cat 5e shielded industrial' },
      required: true,
      direction: 'mutual',
      notes: 'Internal cabinet field bus from main robot controller to the 6 drive amplifiers. Typically EtherCAT (Beckhoff/many), Mechatrolink (Yaskawa), FANUC FSSB, or proprietary high-speed serial. External-facing field bus to PLC: PROFINET / EtherNet/IP / EtherCAT / DeviceNet (per RIA convention).',
      source_references: [
        'industry:PROFINET PROFIdrive profile',
        'industry:EtherCAT servo profile (CiA 402 over EtherCAT)',
        'industry:FANUC FSSB serial bus',
      ],
    },

    // ── Teach pendant (HMI) ──
    {
      from_class: 'control_compute_communication',
      to_class: 'hmi_ergonomics',
      protocol: 'EtherNet/IP',
      mechanism: 'hmi_data',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 24 },
      mechanical: { connector: 'Lemo 19-pin or proprietary', cable_type: '4.5 m flying lead with safety conductors' },
      required: true,
      direction: 'mutual',
      notes: 'Teach pendant (ABB FlexPendant, Fanuc iPendant, KUKA smartPAD, Yaskawa Smart Pendant) carries Ethernet + power + dual-channel E-stop + dual-channel enable switch. Cable 4.5 m (corpus). Pendant weight 1.8 kg (corpus). Three-position enable switch is part of the safety chain — release or full-press both trigger safe-stop.',
      source_references: [
        'corpus:Teach Pendant cable length@industrial_robot_arm (4.5 m)',
        'corpus:Teach Pendant weight@industrial_robot_arm (1.8 kg)',
        'standard:ISO 10218-1 (enabling device)',
        'industry:ABB FlexPendant interface spec',
      ],
    },

    // ── Safety chain ──
    {
      from_class: 'safety_protection',
      to_class: 'energy_conversion_transduction',
      protocol: 'Digital-24V',
      mechanism: 'safety_isolation',
      electrical: { voltage_nominal_v: 24, ac_or_dc: 'DC' },
      mechanical: { connector: 'safety relay terminal block', cable_type: '2-channel dual-redundant 24 V DC' },
      required: true,
      direction: 'directional',
      notes: 'Safe Torque Off (STO) two-channel 24 V DC pulls drive amplifier IGBT gates low independently of firmware on E-stop, safety mat, light curtain, or door interlock. PLd Cat 3 / SIL 2 per ISO 10218-1 + ISO 13849-1. 17 safety functions total (corpus).',
      source_references: [
        'corpus:Safety functions@industrial_robot_arm (17)',
        'standard:ISO 10218-1 (robot safety)',
        'standard:EN ISO 13849-1 (PLd Cat 3)',
        'standard:EN ISO 13850 (E-stop)',
        'standard:ANSI/RIA R15.06',
      ],
    },
    {
      from_class: 'safety_protection',
      to_class: 'control_compute_communication',
      protocol: 'PROFINET',
      mechanism: 'safety_isolation',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 24 },
      required: true,
      direction: 'mutual',
      notes: 'Safe-speed-monitor, safe-zone-monitor, safe-tool-orientation — software safety functions running on the safety co-processor in the controller. Reports state via PROFIsafe / FSoE / CIP Safety to the cell PLC. Mandatory for collaborative speed-and-separation operation per ISO/TS 15066.',
      source_references: [
        'standard:PROFIsafe / CIP Safety / FSoE',
        'standard:ISO/TS 15066 (collaborative)',
        'industry:ABB SafeMove2 / Fanuc Dual Check Safety',
      ],
    },

    // ── Tool I/O (controller → end-effector) ──
    {
      from_class: 'power_distribution',
      to_class: 'control_compute_communication',
      protocol: 'Digital-24V',
      mechanism: 'sensor_feedback',
      electrical: {
        voltage_nominal_v: 24,
        ac_or_dc: 'DC',
        current_max_a: 2,
      },
      mechanical: { connector: 'cabinet I/O screw terminals', cable_type: 'multi-core control cable' },
      required: true,
      direction: 'mutual',
      notes: 'Customer I/O block: 24 V DC at 500 mA signal (corpus), 12/24 V dual-pin tool I/O at 1-2 A (corpus). Routed through the manipulator cable to the wrist for gripper/welder/dispenser control. 8 in / 8 out integrated signals on the upper arm (corpus).',
      source_references: [
        'corpus:Tool I/O power supply voltage@industrial_robot_arm (12/24 V)',
        'corpus:Tool I/O power supply current (Dual pin)@industrial_robot_arm (2 A)',
        'corpus:Customer power/signal current@industrial_robot_arm (500 mA)',
        'corpus:Integrated signals on upper arm In/Out@industrial_robot_arm (8/8)',
      ],
    },

    // ── Pneumatic supply (optional tool air) ──
    {
      from_class: 'mass_fluid_transport_process',
      to_class: 'actuation_kinematics',
      protocol: 'physical',
      mechanism: 'fluid_routing',
      fluid: {
        medium: 'air',
        pressure_max_bar: 8,
        pipe_dn_mm: 6,
      },
      mechanical: { connector: 'push-fit 4 mm or 6.5 mm', cable_type: 'pneumatic hose' },
      required: false,
      direction: 'directional',
      notes: 'OPTIONAL integrated air supply routed through manipulator to wrist for pneumatic grippers / blowers / vacuum cups. Corpus 6-8 bar via 4 mm or 6.5 mm hose. Optional only because some applications (welding, dispensing) need no tool air.',
      source_references: [
        'corpus:Air pressure max@industrial_robot_arm (8 bar)',
        'corpus:Integrated air supply pressure@industrial_robot_arm (6 Bar)',
        'corpus:Air hose diameter@industrial_robot_arm (4 mm)',
        'corpus:Air hose diameter@industrial_robot_arm (6.5 mm)',
      ],
    },

    // ── Cooling ──
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'environmental_interface',
      protocol: 'physical',
      mechanism: 'cooling_loop',
      fluid: { medium: 'air', temperature_max_c: 45 },
      mechanical: { mount: 'in-line', connector: 'cabinet fan tray' },
      required: true,
      direction: 'mutual',
      notes: 'Controller cabinet forced-air cooling for drive amplifier heatsinks. Ambient operating envelope +5 to +45 °C (corpus). Manipulator joints (axes 1-3 carrying largest motors) self-cool via cast-aluminium housing; high-duty applications add wrist fan.',
      source_references: [
        'corpus:Ambient temperature@industrial_robot_arm (0-45 °C)',
        'corpus:Ambient temperature (operation)@industrial_robot_arm (+5 to +45 °C)',
        'corpus:Airborne noise level@industrial_robot_arm (< 70 dB(A))',
      ],
    },

    // ── Mechanical ──
    {
      from_class: 'actuation_kinematics',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'mechanical_mount',
      mechanical: { mount: 'bolted', connector: 'M16 anchor bolts (180x180 base)' },
      required: true,
      direction: 'mutual',
      notes: 'Manipulator base bolts to floor / pedestal / inverted ceiling mount. Base 180×180 mm (corpus). Manipulator weight 20-580 kg depending on payload class. Tool flange ISO 9409-1-50-4-M6 or -80-6-M8 (corpus) for end-effector mounting.',
      source_references: [
        'corpus:Base dimensions@industrial_robot_arm (180 x 180 mm)',
        'corpus:Mechanical weight@industrial_robot_arm',
        'standard:EN ISO-9409-1-50-4-M6 (tool flange)',
        'standard:EN ISO-9409-1-80-6-M8 (tool flange)',
      ],
    },
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'mechanical_mount',
      mechanical: { mount: 'bolted', connector: 'cabinet floor bolts' },
      required: true,
      direction: 'mutual',
      notes: 'Controller cabinet IP44 standalone or IP67 FoundryPlus floor-mount (corpus). Cabinet weight 12 kg (corpus) for small cobot controllers up to 180 kg for industrial. Cable carrier between cabinet and manipulator base routes power + encoder + I/O bundle.',
      source_references: [
        'corpus:Control Box weight@industrial_robot_arm (12 kg)',
        'corpus:Control Box IP classification@industrial_robot_arm (IP44)',
        'corpus:Degree of protection FoundryPlus@industrial_robot_arm (IP67)',
        'standard:IEC 60529 (IP code)',
      ],
    },

    // ── Service ──
    {
      from_class: 'maintenance_serviceability',
      to_class: 'actuation_kinematics',
      protocol: 'physical',
      mechanism: 'cable_transit',
      mechanical: { mount: 'panel', connector: 'grease nipple + drain plug + mastering pin' },
      required: false,
      direction: 'mutual',
      notes: 'Annual inspection ~20 min (corpus). Each axis has a grease nipple and oil drain for the harmonic-drive / cycloidal gear reducer; mastering pin pockets allow re-zero of absolute encoders after battery replacement. Encoder backup battery (3 V CR2/CR2032 lithium) preserves absolute home over power loss.',
      source_references: [
        'corpus:Annual inspection time@industrial_robot_arm (20 minutes)',
        'industry:ABB IRB maintenance schedule',
        'industry:Fanuc R-30iB battery replacement',
      ],
    },
  ],

  sources_cited: [
    'corpus:industrial_robot_arm (~22 datasheets, 2026-05-18; ABB, Fanuc, KUKA, Yaskawa, UR)',
    'standard:ISO 10218-1 (robot safety, industrial)',
    'standard:ISO/TS 15066 (collaborative robots)',
    'standard:ISO 9283 (performance / repeatability)',
    'standard:ISO 9787 (coordinate systems)',
    'standard:ISO 12100 (machinery design)',
    'standard:EN ISO 13849-1 (PLd Cat 3 safety)',
    'standard:EN ISO 13850 (E-stop)',
    'standard:EN 60204-1 (electrical equipment of machines)',
    'standard:ANSI/RIA R15.06 (US robot safety)',
    'standard:ANSI/UL 1740 (US robot safety standard)',
    'standard:EN ISO 9409-1-50-4-M6 (tool flange)',
    'standard:IEC 60529 (IP code)',
    'standard:IEC 61000-6-2/-4 (EMC)',
    'industry:ABB IRB 1100 / 2400 / 6700 datasheets',
    'industry:Fanuc M-10/20i / M-710iC / M-2000iA datasheets',
    'industry:KUKA KR series datasheet',
    'industry:Yaskawa Motoman GP datasheet',
    'industry:Universal Robots UR5e/UR10e/UR16e datasheet (cobot)',
  ],
}

registerClassReferenceGraph(INDUSTRIAL_ROBOT_ARM)

export { INDUSTRIAL_ROBOT_ARM }
