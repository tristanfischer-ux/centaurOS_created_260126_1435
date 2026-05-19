/**
 * @file class-reference-graphs/vfd-motor-drive.ts — K10 typed graph for
 * variable-frequency drives (VFDs / AC motor controllers).
 *
 * @description Models an industrial VFD at the 0.37-160 kW class (Siemens
 * Sinamics G120, ABB ACS580/880, Schneider Altivar 71/630, Yaskawa GA800).
 * Three-phase input, three-phase variable-frequency output driving a
 * connected induction or PMSM motor. PROFIdrive / PROFINET / EtherCAT /
 * CANopen field bus.
 *
 * @sources Corpus values from `pretraining_extracted_specs` joined to
 * `pretraining_spec_documents WHERE product_class='vfd-motor-drive'` in
 * ~/.forge-truth/forge-truth.db. Industry-standard PROFIdrive profile
 * (IEC 61800-7-303) and IEC 61800-5-2 functional safety (STO/SS1/SBC).
 *
 * @corpus-coverage-2026-05-18
 *   - Rated line supply voltage: 380-480 V, 500-600 V, 660-690 V (corpus
 *     direct, Siemens G120 r0208).
 *   - Rated motor voltage range: 0-20,000 V rms (G120 limit; typical
 *     400 V / 690 V).
 *   - Rated motor current: 0-10,000 A rms (G120 limit; typical 10-300 A).
 *   - Rated motor power: 0-100,000 kW (G120 limit; typical 0.37-160 kW).
 *   - Rated motor frequency: 0-650 Hz (G120 limit; typical 50/60 Hz line,
 *     0-300 Hz output).
 *   - Encoder filter / ramp / zero-speed measuring — corpus direct.
 *   - PROFIBUS address range 1-126 (corpus).
 *   - PROFINET / PROFIdrive / PROFIsafe / CANopen / EtherNet/IP — corpus
 *     standards table.
 *   - STO/SBC/SS1 debounce + delay times — corpus direct (IEC 61800-5-2
 *     functional safety).
 *   - UL 508C, EN 60204 — corpus direct.
 *
 * @scope-2026-05-18
 *   - Low-voltage industrial VFD (≤690 V). MV drives (3.3 kV / 6.6 kV /
 *     11 kV) have different cooling, isolation, and capacitor-bank
 *     architectures and warrant their own graph.
 *   - Cabinet-mount / IP20 / IP55 — wall-mount and DIN-rail variants share
 *     edges.
 *   - Encoder OPTIONAL — sensorless vector control is common; encoder
 *     adds precision for positioning / regenerative applications.
 */

import { registerClassReferenceGraph, type ProductClassGraph } from '../class-reference-graph.js'

const VFD_MOTOR_DRIVE: ProductClassGraph = {
  product_class: 'vfd-motor-drive',
  display_name: 'Industrial Variable-Frequency Drive (0.37-160 kW)',
  scope_notes:
    'Low-voltage industrial VFD ≤690 V class. Three-phase input, three-phase variable-frequency ' +
    'output to a connected induction or PMSM motor. PROFIdrive / PROFINET / EtherCAT / ' +
    'CANopen field bus. Functional safety per IEC 61800-5-2 (STO/SS1/SBC). MV drives are ' +
    'out of scope.',

  nodes: [
    {
      class: 'energy_conversion_transduction',
      role: 'principal',
      required: true,
      display: 'Rectifier (line) + DC link + IGBT inverter (motor side)',
    },
    {
      class: 'power_distribution',
      role: 'subsystem',
      required: true,
      display: 'Line supply input terminals + motor output terminals + braking resistor circuit',
    },
    {
      class: 'control_compute_communication',
      role: 'subsystem',
      required: true,
      display: 'Control Unit (e.g. CU250S-2 PN) + field bus + DI/DO/AI/AO',
    },
    {
      class: 'sensing_instrumentation',
      role: 'sensor',
      required: true,
      display: 'DC-link voltage sense + motor current sense (Hall) + IGBT temp + heatsink temp',
    },
    {
      class: 'safety_protection',
      role: 'safety',
      required: true,
      display: 'STO / SS1 / SBC functional safety chain (IEC 61800-5-2 SIL 3 / PL e)',
    },
    {
      class: 'environmental_interface',
      role: 'subsystem',
      required: true,
      display: 'Fan-cooled heatsink (small) or liquid-cooled cold plate (large) + cabinet ambient',
    },
    {
      class: 'structure_containment',
      role: 'enclosure',
      required: true,
      display: 'IP20 chassis (cabinet mount) or IP55 enclosure (standalone)',
    },
    {
      class: 'actuation_kinematics',
      role: 'actuator',
      required: true,
      display: 'Connected motor (induction or PMSM) — the load being driven',
    },
    {
      class: 'hmi_ergonomics',
      role: 'subsystem',
      required: false,
      display: 'Local operator panel (BOP) or remote intelligent operator panel (IOP)',
    },
    {
      class: 'maintenance_serviceability',
      role: 'service',
      required: false,
      display: 'DC-link discharge LED + fuse access + filter access + memory card slot',
    },
  ],

  edges: [
    // ── Line supply input ──
    {
      from_class: 'power_distribution',
      to_class: 'energy_conversion_transduction',
      protocol: 'physical',
      mechanism: 'ac_busbar',
      electrical: {
        voltage_nominal_v: 400,
        voltage_range_v: [380, 480],
        ac_or_dc: 'AC',
        ac_phases: 3,
        ac_frequency_hz: 50,
        current_max_a: 250,
      },
      mechanical: { connector: 'cage clamp or stud', cable_type: '3-core SWA or single-core' },
      required: true,
      direction: 'directional',
      notes: 'Three-phase line supply to rectifier input. 380-480 V (LV class) / 500-600 V / 660-690 V (corpus direct). 50 Hz EU / 60 Hz US.',
      source_references: [
        'corpus:r0208 Rated line supply voltage@vfd-motor-drive (380-480 V)',
        'corpus:r0208 Rated line supply voltage@vfd-motor-drive (660-690 V)',
        'standard:IEC 61800-2',
      ],
    },

    // ── Motor output ──
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'actuation_kinematics',
      protocol: 'physical',
      mechanism: 'ac_busbar',
      electrical: {
        voltage_nominal_v: 400,
        voltage_range_v: [0, 480],
        ac_or_dc: 'AC',
        ac_phases: 3,
        ac_frequency_hz: 50, // output is variable: 0-300 Hz typical
        current_max_a: 200,
      },
      mechanical: { connector: 'cage clamp + PE stud', cable_type: 'VFD-rated shielded motor cable' },
      required: true,
      direction: 'directional',
      notes: 'Three-phase variable-frequency output to motor. 0-300 Hz typical (G120 max 650 Hz per corpus). VFD-rated shielded cable required for >10 m runs to avoid bearing-current damage from common-mode dv/dt.',
      source_references: [
        'corpus:p0304 Rated motor voltage@vfd-motor-drive',
        'corpus:p0305 Rated motor current@vfd-motor-drive',
        'corpus:p0310 Rated motor frequency@vfd-motor-drive',
        'standard:IEC 61800-3 EMC (motor cable shielding)',
      ],
    },

    // ── Motor reactor / dv/dt filter / sine filter (OPTIONAL) ──
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'mass_fluid_transport_process',
      protocol: 'physical',
      mechanism: 'ac_busbar',
      required: false,
      direction: 'directional',
      notes: 'Optional motor reactor (1-3 in series per corpus p0235) or sine-wave filter (up to 1000 µF capacitance per corpus p0234). The "mass_fluid_transport_process" classification is loose — the reactor sits in the power path; we tag it here as it carries inductance. NOTE: this edge is intentionally loose — flagged for human review.',
      source_references: [
        'corpus:p0233 Power unit motor reactor inductance range@vfd-motor-drive',
        'corpus:p0234 Sine-wave filter capacitance range@vfd-motor-drive',
      ],
    },

    // ── Braking resistor circuit (OPTIONAL) ──
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'power_distribution',
      protocol: 'physical',
      mechanism: 'dc_busbar',
      electrical: {
        voltage_nominal_v: 750,
        voltage_range_v: [600, 900],
        ac_or_dc: 'DC',
        power_max_w: 20000000,
      },
      required: false,
      direction: 'directional',
      notes: 'Braking chopper switches the DC link onto an external braking resistor for regenerative loads. Corpus p0219: 0.00 - 20000.00 kW range. Optional — only required if the load is overhauling and there is no line regeneration unit.',
      source_references: ['corpus:p0219 Braking resistor power range@vfd-motor-drive'],
    },

    // ── Field bus / control comms ──
    {
      from_class: 'control_compute_communication',
      to_class: 'energy_conversion_transduction',
      protocol: 'PROFINET',
      mechanism: 'modbus_tcp', // closest 26-set match — PROFINET is industrial Ethernet
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 5 },
      mechanical: { connector: 'RJ45', cable_type: 'Cat 5e shielded industrial' },
      required: true,
      direction: 'mutual',
      notes: 'PLC to drive: speed/torque setpoint via PROFIdrive telegram (IEC 61800-7-303). Corpus PROFINET Device ID 0513 hex (G120 CU250S-2). Alternative protocols: EtherCAT (Beckhoff), EtherNet/IP (Rockwell), CANopen, PROFIBUS-DP (legacy).',
      source_references: [
        'corpus:PROFIdrive@vfd-motor-drive',
        'corpus:PROFINET Device ID 0513 hex@vfd-motor-drive',
        'corpus:CANopen@vfd-motor-drive',
        'corpus:EtherNet/IP@vfd-motor-drive',
        'standard:IEC 61800-7-303 (PROFIdrive)',
      ],
    },
    {
      from_class: 'control_compute_communication',
      to_class: 'sensing_instrumentation',
      protocol: 'Analog-thermistor',
      mechanism: 'sensor_feedback',
      required: true,
      direction: 'mutual',
      notes: 'Control Unit reads DC-link voltage (corpus threshold 200 V), motor phase currents via Hall ICs, IGBT junction temp, heatsink temp, motor PTC/KTY/PT1000. Closed-loop vector control needs these every PWM cycle (typically 4-16 kHz).',
      source_references: [
        'corpus:DC link voltage threshold for valid measurement@vfd-motor-drive',
        'corpus:p0292 Power unit temperature alarm threshold@vfd-motor-drive',
        'corpus:p0625 Motor ambient temperature during commissioning@vfd-motor-drive',
      ],
    },
    {
      from_class: 'sensing_instrumentation',
      to_class: 'actuation_kinematics',
      protocol: 'Digital-5V',
      mechanism: 'sensor_feedback',
      mechanical: { connector: 'SUB-D HD15 or M23', cable_type: 'shielded twisted pair' },
      required: false,
      direction: 'mutual',
      notes: 'Optional motor encoder (incremental TTL, sin/cos 1 Vpp, EnDat, SSI, HIPERFACE DSL). Corpus: squarewave encoder filter time 0.04-20.48 µs (p1421), pulse encoder evaluation zero-speed measuring time 0.10-10000 ms (p0492). Required for high-precision positioning / regenerative torque mode; OPTIONAL for general-purpose V/f or sensorless vector.',
      source_references: [
        'corpus:Squarewave encoder filter time@vfd-motor-drive',
        'corpus:Pulse encoder evaluation zero speed measuring time@vfd-motor-drive',
        'industry:HIPERFACE DSL encoder protocol',
      ],
    },

    // ── Functional safety ──
    {
      from_class: 'safety_protection',
      to_class: 'energy_conversion_transduction',
      protocol: 'Digital-24V',
      mechanism: 'safety_isolation',
      electrical: { voltage_nominal_v: 24, ac_or_dc: 'DC' },
      mechanical: { connector: 'screw terminal pluggable', cable_type: '2-channel discrete wired' },
      required: true,
      direction: 'directional',
      notes: 'STO (Safe Torque Off) two-channel 24 V DC input pulls IGBT gate drives low independently of the firmware. SS1 / SBC available per CU spec. Corpus STO/SBC/SS1 debounce 0-100,000 µs, SS1 delay 0-300,000 ms. SIL 3 / PL e per IEC 61800-5-2 + PROFIsafe for networked safety.',
      source_references: [
        'corpus:SI STO/SBC/SS1 debounce time (processor 2)@vfd-motor-drive',
        'corpus:SI Safe Stop 1 delay time (Motor Module)@vfd-motor-drive',
        'corpus:PROFIsafe@vfd-motor-drive',
        'standard:IEC 61800-5-2 functional safety',
        'standard:EN 60204-1 machinery electrical safety',
      ],
    },

    // ── Cooling ──
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'environmental_interface',
      protocol: 'physical',
      mechanism: 'cooling_loop',
      fluid: { medium: 'air', flow_max_lpm: 10000, temperature_max_c: 50 }, // cabinet air, lpm = cfm-equivalent
      mechanical: { mount: 'in-line', connector: 'cabinet stud' },
      required: true,
      direction: 'mutual',
      notes: 'Fan-forced air cooling for the heatsink at the LV class. Cabinet ambient ≤40 °C standard, derated to 50 °C (corpus p0292 alarm threshold). Liquid-cooled cold-plate variants exist for ≥160 kW frames.',
      source_references: [
        'corpus:p0292 Power unit temperature alarm threshold@vfd-motor-drive',
        'corpus:p0294 Power unit I2t alarm threshold@vfd-motor-drive',
        'corpus:p0251 Fan operating hours counter@vfd-motor-drive',
      ],
    },

    // ── Mechanical ──
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'mechanical_mount',
      mechanical: { mount: 'panel', connector: 'M5 or M6 mounting studs' },
      required: true,
      direction: 'mutual',
      notes: 'Frame size 0-9 maps to fixed footprints; mounts to back-plane in MCC cabinet or wall.',
      source_references: ['standard:UL 508C (industrial control)', 'standard:EN 61800-5-1 (electrical safety)'],
    },

    // ── HMI (optional) ──
    {
      from_class: 'control_compute_communication',
      to_class: 'hmi_ergonomics',
      protocol: 'RS-485',
      mechanism: 'hmi_data',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 5 },
      mechanical: { connector: 'RJ45 (drive front)', cable_type: 'patch cable / handheld dongle' },
      required: false,
      direction: 'mutual',
      notes: 'Local Basic Operator Panel (BOP) on the drive face, or detachable Intelligent Operator Panel (IOP) on a flying lead. Smartphone Bluetooth dongle on newer firmware.',
      source_references: ['industry:Siemens G120 BOP/IOP-2 manual'],
    },

    // ── Service ──
    {
      from_class: 'maintenance_serviceability',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'cable_transit',
      mechanical: { mount: 'panel', connector: 'SD card slot + LED indicators' },
      required: false,
      direction: 'mutual',
      notes: 'Memory card slot (parameter clone), DC-link discharge LED (5-minute wait warning), control fuse access. Diagnostic CU detection LED flashes at 2 Hz on fault (corpus).',
      source_references: ['corpus:CU detection LED flash frequency@vfd-motor-drive'],
    },
  ],

  sources_cited: [
    'corpus:vfd-motor-drive (~14 datasheets, 2026-05-18; primarily Siemens Sinamics G120)',
    'standard:IEC 61800-2 (general)',
    'standard:IEC 61800-3 (EMC)',
    'standard:IEC 61800-5-1 (electrical safety)',
    'standard:IEC 61800-5-2 (functional safety — STO/SS1/SBC)',
    'standard:IEC 61800-7-303 (PROFIdrive)',
    'standard:UL 508C',
    'standard:EN 60204-1 (machinery)',
    'industry:Siemens Sinamics G120 CU250S-2 PN manual',
    'industry:ABB ACS580 / ACS880 manual',
    'industry:Schneider Altivar Process ATV630 manual',
  ],
}

registerClassReferenceGraph(VFD_MOTOR_DRIVE)

export { VFD_MOTOR_DRIVE }
