/**
 * @file class-reference-graphs/automated-guided-vehicle-agv.ts — K10 typed
 * graph for automated guided vehicles (AGVs, 100-25000 kg payload class).
 *
 * @description Models a wheeled / tugger / forklift-style AGV at the
 * 100-25000 kg payload class — Daifuku J600, Toyota Geek+, Mecalux SkyPod,
 * Locus Origin, Otto 100/600/1500, KUKA KMP1500i, JBT AutoBox, Bastian
 * SmartMover. AGV combines wheeled mobility + (often) lift mechanism +
 * safety scanner — extends the `industrial_robot_arm` graph into mobile
 * robotics. Tests three K10 paths simultaneously:
 *   - `actuation_kinematics` (wheel drive motors + steering motor + optional
 *     lift / mast / conveyor / clamp / pivot manipulator).
 *   - `energy_storage_source` (LFP / AGM / TPPL traction battery + auto-
 *     charging contactor system + opportunity-charge dock).
 *   - `safety_protection` (safety laser scanner SICK S300 / Pilz / Sick
 *     microScan3 + bumper / mat / E-stop ring; PL-d / Cat 3 architecture
 *     per ISO 3691-4 / EN 1525).
 *
 * AGV's `actuation_kinematics` carries a wheeled-mobility subsystem that
 * doesn't fit cleanly into the 12-module UniversalModule set — it groups
 * with `actuation_kinematics` because differential / mecanum / steered-
 * wheel drives are kinematic actuators, but the wheel + chassis + suspension
 * stack is also structurally part of `structure_containment`. Flagged in
 * scope_notes for council review.
 *
 * @sources Corpus values from `pretraining_extracted_specs` joined to
 * `pretraining_spec_documents WHERE product_class='automated_guided_vehicle_agv'`
 * at ~/.forge-truth/forge-truth.db (10 datasheets — Daifuku Webb /
 * Mecalux / Otto / KUKA KMP / Bastian). Industrial-truck standards from
 * corpus: EN 12053 (sound), ANSI B56.5 (US driverless industrial truck),
 * IEC 60825-1 (laser scanner), IEEE 802.11 (wireless).
 *
 * @corpus-coverage-2026-05-18
 *   - Payload: 340 kg (small mobile robot) / 600 / 885 / 1134 / 1451 /
 *     1500 / 1600 / 1814 / 2041 / 2268 / 2500 kg / 6000 kg / 22000 kg /
 *     65000 kg (heavy transfer-car) — corpus direct.
 *   - Battery: 24 V DC LFP / AGM-TPPL; 180 / 204 / 500 Ah capacity;
 *     LiFePO4 cycle life 1,200,000 Ah vs AGM 300,000 Ah — corpus direct.
 *   - Auto charging: 80 / 140 / 180 A; manual 25 A — corpus direct.
 *   - Drive motor: 1.0 / 1.8 kW S2 60min rating; lift motor 3 kW S3 10% —
 *     corpus direct.
 *   - Speed: 0.9-2.3 m/s (1.5 m/s loaded typical); 8 km/h auto-mode —
 *     corpus direct.
 *   - Gradeability: 6% loaded / 10% unloaded — corpus direct.
 *   - Stopping accuracy: ±10 / ±15 / ±30 mm — corpus direct.
 *   - Sound: <70 dB(A) — corpus direct.
 *   - IP / IK: not specified by all vendors — industry typical IP43-IP54.
 *   - Standards: ANSI B56.5, JIS D6802, EN 12053, IEC 60825-1 (laser
 *     scanner Class 1), IEEE 802.11a/b/g/n/ac (corpus), CE + UKCA + FDA —
 *     corpus direct.
 *
 * @scope-2026-05-18
 *   - Free-ranging AGV / AMR (Autonomous Mobile Robot) class — both share
 *     the K10 module set. SLAM-navigated AMRs (Otto, Locus) and tape-
 *     guided / wire-guided AGVs (Daifuku, Bastian) converge on the same
 *     graph; navigation method is a sensing_instrumentation variation.
 *   - Indoor warehouse / factory-floor use. Outdoor heavy-duty (autonomous
 *     terminal trucks, AGV-Q with up to 65 t per corpus) is supported via
 *     the wider payload envelope.
 *   - Wheeled mobility (differential / mecanum / steered) — tracked AGVs,
 *     legged robots, and aerial drones are OUT of scope.
 *   - Lift / mast / conveyor / clamp / tugger / forklift end-effectors all
 *     treated as `actuation_kinematics` lift subsystem; corpus payload
 *     covers conveyor + lift + tugger variants.
 *   - Safety-rated PL-d / SIL-2 architecture per ISO 3691-4 (driverless
 *     industrial trucks) / EN 1525 (legacy) / ANSI B56.5 / RIA R15.08
 *     (mobile robot safety).
 */

import { registerClassReferenceGraph, type ProductClassGraph } from '../class-reference-graph.js'

const AUTOMATED_GUIDED_VEHICLE_AGV: ProductClassGraph = {
  product_class: 'automated_guided_vehicle_agv',
  display_name: 'Automated Guided Vehicle / Mobile Robot (100-25000 kg payload)',
  scope_notes:
    'Wheeled AGV or AMR at the 100-25000 kg payload class. Differential / mecanum / ' +
    'steered drive. LFP or AGM 24 V DC traction battery with auto-charge dock. ' +
    'Indoor warehouse / factory-floor + outdoor heavy-duty terminal-truck variants. ' +
    'Tracked, legged, aerial OUT of scope. Edge-case: wheeled-mobility chassis ' +
    "doesn't fit cleanly into 12-module set — grouped under actuation_kinematics " +
    '+ structure_containment but flagged for council review.',

  nodes: [
    {
      class: 'energy_storage_source',
      role: 'principal',
      required: true,
      display: 'Traction battery (LFP / AGM-TPPL, 24 V DC, 180-500 Ah) + onboard BMS + opportunity-charge contactor',
    },
    {
      class: 'energy_conversion_transduction',
      role: 'subsystem',
      required: true,
      display: 'Drive-motor inverter (1-3 kW BLDC per wheel) + lift-motor inverter (S3 10% duty) + DC-DC step-down',
    },
    {
      class: 'actuation_kinematics',
      role: 'actuator',
      required: true,
      display: 'Drive wheels (differential / mecanum / steered) + steering motor + (optional) lift mast / conveyor / clamp',
    },
    {
      class: 'control_compute_communication',
      role: 'subsystem',
      required: true,
      display: 'Navigation controller (SLAM + odometry + path-planner) + WMS / WCS uplink (802.11ac) + fleet manager',
    },
    {
      class: 'sensing_instrumentation',
      role: 'sensor',
      required: true,
      display: 'Lidar (front + 360° dome) + IMU + wheel encoders + cameras + reflective-marker / QR / RFID locators',
    },
    {
      class: 'safety_protection',
      role: 'safety',
      required: true,
      display: 'Safety laser scanner (SICK S300 / microScan3) + bumper / mat + E-stop ring + PL-d controller',
    },
    {
      class: 'structure_containment',
      role: 'enclosure',
      required: true,
      display: 'Steel chassis + suspension + wheel mounts + side / payload deck + protective covers (IP43-IP54)',
    },
    {
      class: 'power_distribution',
      role: 'subsystem',
      required: true,
      display: 'Battery main contactor + auto-charging dock connector + 24 V / 5 V / 12 V instrument bus',
    },
    {
      class: 'environmental_interface',
      role: 'subsystem',
      required: false,
      display: 'Heatsink + fan-cooled drive cabinet + battery vent (AGM) + ambient air-temp probe',
    },
    {
      class: 'maintenance_serviceability',
      role: 'service',
      required: false,
      display: 'Battery hot-swap or auto-dock charging + diagnostic Ethernet port + manual-jog handle / pendant',
    },
    {
      class: 'hmi_ergonomics',
      role: 'subsystem',
      required: false,
      display: 'Onboard status display + audible / LED status indicator + (optional) operator-assist pendant',
    },
  ],

  edges: [
    // ── Power: battery → drive inverter → wheels ──
    {
      from_class: 'energy_storage_source',
      to_class: 'power_distribution',
      protocol: 'physical',
      mechanism: 'dc_busbar',
      electrical: {
        voltage_nominal_v: 24,         // corpus: 24 V DC dominant
        voltage_range_v: [21, 30],     // 21 V LL cutoff, 30 V auto-charge target
        ac_or_dc: 'DC',
        current_max_a: 180,            // corpus: auto-charge up to 180 A
      },
      mechanical: { connector: 'Anderson SB350 / SB175 battery connector', cable_type: '50-95 mm² high-current battery cable' },
      required: true,
      direction: 'mutual',
      notes: '24 V DC traction battery (corpus: LFP / AGM / TPPL options, 180-500 Ah). Main contactor at battery terminal; pre-charge resistor for inverter capacitor inrush. Auto-charging at 80-180 A (corpus) via floor-contact dock pads or Wiferion inductive (40 kHz, 1-3 kW); manual charge 25 A. LFP cycle life 1,200,000 Ah vs AGM 300,000 Ah per corpus.',
      source_references: [
        'corpus:Battery Voltage@automated_guided_vehicle_agv (24 VDC)',
        'corpus:Battery Technology@automated_guided_vehicle_agv (Lithium Iron Phosphate LFP)',
        'corpus:AGM/TPPL Battery Capacity@automated_guided_vehicle_agv (204 AH)',
        'corpus:Lithium Battery Capacity@automated_guided_vehicle_agv (180 AH)',
        'corpus:Battery nominal capacity K5@automated_guided_vehicle_agv (500 Ah)',
        'corpus:Automatic Charging Rate@automated_guided_vehicle_agv (140 amps)',
        'corpus:Charging (Max.)@automated_guided_vehicle_agv (180 amp)',
        'corpus:Lithium Cycle Life@automated_guided_vehicle_agv (1,200,000 AH)',
        'industry:Anderson SB350 battery connector',
        'industry:Wiferion 1-3 kW inductive opportunity charging',
      ],
    },
    {
      from_class: 'power_distribution',
      to_class: 'energy_conversion_transduction',
      protocol: 'physical',
      mechanism: 'dc_busbar',
      electrical: {
        voltage_nominal_v: 24,
        ac_or_dc: 'DC',
        current_max_a: 100,
      },
      mechanical: { connector: 'M8 stud / Wago 285 terminal', cable_type: '16-35 mm² supply cable' },
      required: true,
      direction: 'directional',
      notes: 'Distribution panel feeds drive-motor inverter (1.0-1.8 kW S2 60-min per corpus), lift-motor inverter (3 kW S3 10% per corpus), and DC-DC step-down to 5 V (logic) / 12 V (lidar) / 24 V (instrument) rails. Output current 20 A per corpus (small-AMR class).',
      source_references: [
        'corpus:Drive motor rating@automated_guided_vehicle_agv (1.8 kW)',
        'corpus:Lift motor rating@automated_guided_vehicle_agv (3 kW)',
        'corpus:Motor Power@automated_guided_vehicle_agv (1 kw)',
        'corpus:Rated input power@automated_guided_vehicle_agv (1.0 KW)',
        'corpus:Output current@automated_guided_vehicle_agv (20 A)',
        'corpus:Output voltage@automated_guided_vehicle_agv (30 V)',
      ],
    },
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'actuation_kinematics',
      protocol: 'PWM',
      mechanism: 'contactor_command',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 24, current_max_a: 75 },
      mechanical: { connector: 'M8 motor lead + encoder connector', cable_type: '6-10 mm² 3-phase + sensor twisted pair' },
      required: true,
      direction: 'directional',
      notes: 'Inverter drives BLDC drive motor + (optional) steering motor + (optional) lift motor. Speed 0.9-2.3 m/s (corpus: 1.5 m/s loaded, 2.3 m/s unloaded; up to 8 km/h auto mode). Brake torque 8 Nm per corpus. Wheeled-mobility note: differential / mecanum / steered topology is configured here — single motor per side (differential), 4× motors with mecanum hubs, or 2× drive + 1× steered (Ackermann-like).',
      source_references: [
        'corpus:Speed (loaded)@automated_guided_vehicle_agv (1.5 m/s)',
        'corpus:Speed (unloaded)@automated_guided_vehicle_agv (2.3 m/s)',
        'corpus:Travel speed automatic mode@automated_guided_vehicle_agv (8,0/1,1 km/h)',
        'corpus:Brake Torque@automated_guided_vehicle_agv (8 Nm)',
        'industry:SEW MOVIMOT compact BLDC',
      ],
    },

    // ── Wheels / lift → chassis ──
    {
      from_class: 'actuation_kinematics',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'mechanical_mount',
      mechanical: {
        mount: 'bolted',
        connector: 'wheel hub bearings + lift mast slewing bearing + chassis frame bolts (M12-M20)',
        cable_type: 'welded steel tube frame + Al / steel deck plate',
      },
      required: true,
      direction: 'mutual',
      notes: 'Drive wheels mount on chassis via wheel-hub bearing assembly + suspension (often passive — leaf-spring or rubber dampers; active suspension on heavy-payload variants). Lift mast / conveyor deck / clamp jaws bolt to chassis upper deck. Wheeled-mobility chassis edge: this is where the wheel+drive+chassis topology gets reified — K10 puts wheels under actuation_kinematics but the bearings + suspension + chassis frame structurally belong to structure_containment. Gradeability 6% loaded / 10% unloaded (corpus).',
      source_references: [
        'corpus:Max. gradeability with load@automated_guided_vehicle_agv (6%)',
        'corpus:Max. gradeability without load@automated_guided_vehicle_agv (10%)',
        'corpus:Road surface step difference@automated_guided_vehicle_agv (6 mm)',
        'corpus:Mobile Robot Weight@automated_guided_vehicle_agv (148 kg)',
        'corpus:Service weight@automated_guided_vehicle_agv (1513 kg)',
        'industry:KUKA omniMove mecanum chassis',
      ],
    },

    // ── Navigation: SLAM / lidar / odometry → controller ──
    {
      from_class: 'control_compute_communication',
      to_class: 'sensing_instrumentation',
      protocol: 'EtherNet/IP',
      mechanism: 'sensor_feedback',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 24 },
      mechanical: { connector: 'M12 4-pin D-coded or RJ45', cable_type: 'Cat 5e industrial' },
      required: true,
      direction: 'mutual',
      notes: 'Navigation controller reads front-mounted safety laser scanner (SICK S300 / microScan3 — typ. 270° FOV, 5.5 m range) at ~25 Hz; localisation lidar dome (Velodyne Puck / Hokuyo UST-30LX) for SLAM at 10-20 Hz; IMU (BMI088 / VN-200) at 200 Hz for odometry fusion; wheel encoders (typ. 4096 ppr quadrature); RGB / IR cameras for fiducial-marker recognition; RFID readers for floor-loop guidance (legacy AGV). Obstacle detection range 2.8 m (corpus).',
      source_references: [
        'corpus:Obstacle Detection Range@automated_guided_vehicle_agv (2.8 meters)',
        'corpus:Stoppage accuracy (standard)@automated_guided_vehicle_agv (±30 mm)',
        'corpus:Stoppage accuracy (upgraded)@automated_guided_vehicle_agv (±15 mm)',
        'corpus:Stopping accuracy@automated_guided_vehicle_agv (10 mm)',
        'corpus:Steering Accuracy@automated_guided_vehicle_agv (+/- 12.7 mm)',
        'industry:SICK microScan3 safety laser scanner',
        'industry:Velodyne Puck VLP-16 lidar',
        'standard:IEC 60825-1 laser safety Class 1',
      ],
    },
    {
      from_class: 'control_compute_communication',
      to_class: 'energy_conversion_transduction',
      protocol: 'EtherNet/IP',
      mechanism: 'contactor_command',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 24 },
      required: true,
      direction: 'directional',
      notes: 'Navigation controller commands drive + steer + lift inverter setpoints via EtherCAT, CANopen, or PROFINET — typical industrial fieldbus stack. Speed / torque / position reference at 1 kHz update rate. CiA 402 motion-control profile typical at the inverter end.',
      source_references: [
        'industry:CiA 402 motion control profile',
        'industry:Beckhoff TwinCAT 3 EtherCAT master',
      ],
    },
    {
      from_class: 'control_compute_communication',
      to_class: 'environmental_interface',
      protocol: 'WiFi',
      mechanism: 'modbus_tcp',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 5 },
      mechanical: { connector: 'SMA + 50 Ω coax + dual MIMO antenna', cable_type: 'RG316' },
      required: true,
      direction: 'mutual',
      notes: 'WiFi 802.11a/b/g/n/ac (corpus) uplink to fleet manager / WMS (Warehouse Management System) / WCS (Warehouse Control System). Roaming handoff at 24 GHz / 5 GHz. Order dispatch over MQTT + AGV-Q VDA 5050 protocol (interoperable AGV / AMR comms standard). 4G / 5G LTE backup for outdoor operations.',
      source_references: [
        'corpus:IEEE 802.11a/b/g/n/ac@automated_guided_vehicle_agv',
        'corpus:IEEE 802.11b/g/n@automated_guided_vehicle_agv',
        'industry:VDA 5050 AGV interoperability standard',
        'industry:Cisco Aironet / Aruba 11ac roaming',
      ],
    },

    // ── Safety: laser scanner + bumper + E-stop → PL-d controller ──
    {
      from_class: 'safety_protection',
      to_class: 'actuation_kinematics',
      protocol: 'Digital-24V',
      mechanism: 'safety_isolation',
      electrical: { voltage_nominal_v: 24, ac_or_dc: 'DC', current_max_a: 4 },
      required: true,
      direction: 'directional',
      notes: 'Safety laser scanner protective field (typ. 1500 mm at max speed, dynamic field scaling with velocity) trips drive motor STO (Safe Torque Off) on incursion. Bumper + safety mat redundancy per ISO 3691-4. E-stop ring (typ. 4× corner buttons) + emergency-brake command. PL-d / Cat 3 architecture per EN ISO 13849-1.',
      source_references: [
        'corpus:Sound level@automated_guided_vehicle_agv (<70 dB(A))',
        'corpus:EN12 053@automated_guided_vehicle_agv',
        'corpus:EC 60825-1@automated_guided_vehicle_agv',
        'corpus:ANSI B56.5@automated_guided_vehicle_agv',
        'standard:ISO 3691-4 driverless industrial trucks',
        'standard:ANSI B56.5 driverless industrial trucks',
        'standard:EN 1525 (legacy) AGV safety',
        'standard:EN ISO 13849-1 PL-d Cat 3',
        'standard:RIA R15.08 mobile robot safety',
      ],
    },
    {
      from_class: 'safety_protection',
      to_class: 'sensing_instrumentation',
      protocol: 'Digital-24V',
      mechanism: 'alarm_interlock',
      required: true,
      direction: 'mutual',
      notes: 'Safety scanner + bumper + mat status flows to navigation controller (informative only — physical chain is hard-wired to drive STO). Tilt sensor + crash accelerometer + over-speed alarm + cell-imbalance alarm + temperature alarm all feed the alarm log + fleet manager.',
      source_references: [
        'industry:Pilz PNOZ multi-channel safety relay',
        'standard:ISO 3691-4 functional safety requirements',
      ],
    },

    // ── HMI: onboard status + pendant ──
    {
      from_class: 'control_compute_communication',
      to_class: 'hmi_ergonomics',
      protocol: 'Modbus-TCP',
      mechanism: 'hmi_data',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 24 },
      mechanical: { connector: 'M12 X-coded or RJ45', cable_type: 'Cat 5e + 24 V supply' },
      required: false,
      direction: 'mutual',
      notes: 'Optional touchscreen on the AGV chassis (manual-jog + diagnostic + emergency override). Audible alarm (>70 dB(A) per OSHA) + LED status ring (green / yellow / red / blue beacon). Operator-assist mode for manual-pilot handover (e.g. loading-bay alignment) commanded through pendant or fleet-manager dispatch.',
      source_references: [
        'corpus:Sound level@automated_guided_vehicle_agv (<70 dB(A))',
        'corpus:Display Resolution@automated_guided_vehicle_agv (2048×1536)',
        'standard:OSHA audible alarm threshold',
      ],
    },

    // ── Cooling: passive ──
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'environmental_interface',
      protocol: 'physical',
      mechanism: 'cooling_loop',
      fluid: { medium: 'air', temperature_max_c: 45, temperature_min_c: 0 },
      required: false,
      direction: 'mutual',
      notes: 'Drive + lift inverter heatsink with thermostat-controlled fan tray (40 °C trip). Operating ambient 0-45 °C (corpus). Humidity 20-80% (corpus). Battery vent for AGM (off-gassing) — LFP variants are sealed. IP54 chassis prevents dust ingress to inverter compartment.',
      source_references: [
        'corpus:Operating Temperature@automated_guided_vehicle_agv (0 to 45 °C)',
        'corpus:Operating humidity@automated_guided_vehicle_agv (20~80%)',
        'industry:EBM-papst 92 mm 24 V DC fan',
      ],
    },

    // ── Service: hot-swap battery + diagnostic port ──
    {
      from_class: 'maintenance_serviceability',
      to_class: 'energy_storage_source',
      protocol: 'physical',
      mechanism: 'cable_transit',
      mechanical: { mount: 'panel', connector: 'battery quick-release + auto-charge contact pad' },
      required: false,
      direction: 'mutual',
      notes: 'Hot-swap battery hatch (5-min change-over typical) on legacy AGV; auto-charge dock on modern AMR (battery stays onboard, vehicle drives onto contact-rail pad or Wiferion inductive pad). Battery recharge 90 min full (corpus); 8 h runtime (corpus). Diagnostic Ethernet port (M12 D-coded) for service-tool over EtherNet/IP.',
      source_references: [
        'corpus:Battery Recharge Time@automated_guided_vehicle_agv (90 minutes)',
        'corpus:Battery Run Time@automated_guided_vehicle_agv (8 hours)',
        'corpus:Manual Charge Rate@automated_guided_vehicle_agv (25 amp)',
        'industry:Daifuku auto-charge floor contact rail',
      ],
    },
  ],

  sources_cited: [
    'corpus:automated_guided_vehicle_agv (10 datasheets, 2026-05-18 — Daifuku / Webb / Mecalux / Otto / KUKA KMP)',
    'standard:ISO 3691-4 driverless industrial trucks',
    'standard:ANSI B56.5 driverless industrial trucks',
    'standard:EN 1525 (legacy) automated guided vehicle safety',
    'standard:EN 12053 sound emission',
    'standard:JIS D6802 (Japan AGV)',
    'standard:IEC 60825-1 laser safety',
    'standard:EN ISO 13849-1 PL-d Cat 3 functional safety',
    'standard:RIA R15.08 mobile robot safety',
    'standard:IEEE 802.11a/b/g/n/ac (wireless)',
    'standard:VDA 5050 (AGV interoperability)',
    'industry:Daifuku Webb J600 / SmartCart',
    'industry:KUKA KMP1500i / omniMove mecanum',
    'industry:Otto 100 / 600 / 1500 / 1500H AMR',
    'industry:Locus Origin warehouse AMR',
    'industry:Mecalux Easy WMS + SkyPod AGV',
    'industry:SICK microScan3 / S300 safety laser scanner',
    'industry:Velodyne Puck VLP-16 SLAM lidar',
  ],
}

registerClassReferenceGraph(AUTOMATED_GUIDED_VEHICLE_AGV)

// Register the same graph under AMR slug — Autonomous Mobile Robots
// (Otto, Locus, Mobile Industrial Robots MiR) share the K10 module set
// with classic AGVs; navigation method (SLAM-free vs tape/wire-guided)
// is a sensing_instrumentation variation, not a topology change.
registerClassReferenceGraph({
  ...AUTOMATED_GUIDED_VEHICLE_AGV,
  product_class: 'autonomous_mobile_robot_amr',
  display_name: 'Autonomous Mobile Robot (SLAM-navigated, 100-1500 kg payload)',
})

export { AUTOMATED_GUIDED_VEHICLE_AGV }
