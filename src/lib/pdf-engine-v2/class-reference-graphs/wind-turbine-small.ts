/**
 * @file class-reference-graphs/wind-turbine-small.ts — K10 typed graph for
 * small wind turbines (~1-100 kW, IEC 61400-2 "small turbine" scope).
 *
 * @description Models a small horizontal-axis wind turbine at the 1-100 kW
 * class — typically 3-blade upwind, direct-drive PMSG or geared induction,
 * passive yaw or active yaw, passive pitch (stall) or active electric pitch.
 * Suppliers: Bergey Excel 15, Northern Power 100, Ryse E10, Skystream 3.7,
 * Aeolos H-30, SD Wind Energy SD6. Distinct from utility-scale (1-15 MW —
 * see `wind_turbine_nacelle` corpus class which informs typical PMSG /
 * gearbox / yaw architecture).
 *
 * @sources Utility-scale `wind_turbine_nacelle` corpus (8 datasheets at
 * ~/.forge-truth/forge-truth.db) supplies the topology priors (rotor +
 * nacelle + yaw + brake + pitch + generator + tower). Small-turbine
 * specifics (passive yaw, direct-drive PMSG, downwind variant) come from
 * IEC 61400-2 and MCS (UK Microgeneration Certification Scheme) practice.
 *
 * @corpus-coverage-2026-05-18
 *   - Rotor diameter: utility 117-236 m (corpus); small 2-22 m (IEC 61400-2
 *     classifies "small" as rotor area ≤200 m² i.e. diameter ≤16 m).
 *   - Cut-in / cut-out wind speed: 3 m/s / 25 m/s (corpus, applies to small).
 *   - Rated power: utility 4000-6000 kW corpus; small 1-100 kW.
 *   - Operating temp: -20 to +45 °C (corpus, applies).
 *   - Sound: 106 dB(A) sound power utility corpus; small typically 50-55
 *     dB(A) at 60 m hub for residential planning consent.
 *   - Generator: PMSG direct-drive typical at small scale (vs DFIG / SCIG
 *     gearbox utility); rated voltage 240-480 V AC vs utility 690 V.
 *   - Standards: IEC 61400-1 utility (corpus); IEC 61400-2 small turbine;
 *     IEC 61400-12 power-performance; MCS-006 UK microgeneration; AWEA
 *     9.1-2009 US.
 *
 * @scope-2026-05-18
 *   - Horizontal-axis wind turbine (HAWT) at 1-100 kW. Vertical-axis (VAWT,
 *     Darrieus / Savonius) has different rotor + yaw kinematics — separate
 *     graph candidate.
 *   - Upwind 3-blade configuration assumed (Bergey Excel-class is downwind
 *     — accommodate via passive-yaw note).
 *   - Direct-drive PMSG or geared induction — both share K10 module set.
 *   - Grid-tied (with on-site inverter) is the standard residential /
 *     small-commercial case. Off-grid battery-tied is a configuration
 *     variant — `power_distribution` edge accommodates both.
 *   - Distributed-wind ≤500 kW (IEC class 1-4) — utility-scale ≥1 MW is
 *     OUT of scope (see future `wind_turbine_utility` graph if added).
 */

import { registerClassReferenceGraph, type ProductClassGraph } from '../class-reference-graph.js'

const WIND_TURBINE_SMALL: ProductClassGraph = {
  product_class: 'wind_turbine_small',
  display_name: 'Small Wind Turbine (1-100 kW, IEC 61400-2)',
  scope_notes:
    'Horizontal-axis 3-blade upwind small wind turbine at the 1-100 kW class. ' +
    'Direct-drive PMSG or geared induction generator. Passive or active yaw. ' +
    'Passive (stall) or active electric pitch. Grid-tied via on-site inverter; ' +
    'off-grid battery-tied variant supported via power_distribution flexibility. ' +
    'VAWT, downwind-only, and utility-scale (≥1 MW) are OUT of scope.',

  nodes: [
    {
      class: 'energy_conversion_transduction',
      role: 'principal',
      required: true,
      display: 'Generator (PMSG direct-drive or induction via gearbox) + AC-DC-AC inverter',
    },
    {
      class: 'actuation_kinematics',
      role: 'subsystem',
      required: true,
      display: 'Rotor + 3 blades + hub + yaw bearing + (active) pitch actuators + (active) yaw drive',
    },
    {
      class: 'structure_containment',
      role: 'enclosure',
      required: true,
      display: 'Nacelle (FRP / aluminium) + tower (lattice 9-30 m or monopole) + foundation',
    },
    {
      class: 'power_distribution',
      role: 'subsystem',
      required: true,
      display: 'Generator AC output + DC link + grid-tie / battery-tie AC output + droop terminals',
    },
    {
      class: 'control_compute_communication',
      role: 'subsystem',
      required: true,
      display: 'Turbine controller (PLC) + SCADA modem (Modbus TCP / 4G) + slip-ring or cable loop',
    },
    {
      class: 'sensing_instrumentation',
      role: 'sensor',
      required: true,
      display: 'Anemometer + wind vane + rotor speed encoder + generator V/I + nacelle T/vibration',
    },
    {
      class: 'safety_protection',
      role: 'safety',
      required: true,
      display: 'Mechanical brake (disc / drum) + electrical dump load + over-speed governor + lightning protection',
    },
    {
      class: 'environmental_interface',
      role: 'subsystem',
      required: false,
      display: 'Nacelle ventilation + air-cooled heatsink + ice-detection (optional cold-climate kit)',
    },
    {
      class: 'maintenance_serviceability',
      role: 'service',
      required: false,
      display: 'Climbing ladder / tower hatch + nacelle service door + lockable down-tower disconnect',
    },
  ],

  edges: [
    // ── Rotor → generator (mechanical / kinematic) ──
    {
      from_class: 'actuation_kinematics',
      to_class: 'energy_conversion_transduction',
      protocol: 'physical',
      mechanism: 'mechanical_mount',
      mechanical: {
        mount: 'bolted',
        connector: 'rotor hub flange (direct-drive) or low-speed coupling (geared)',
        cable_type: 'steel shaft / main bearing',
      },
      required: true,
      direction: 'directional',
      notes: 'Rotor torque transmitted through the main shaft to the generator. Direct-drive PMSG (Bergey, Northern Power) — rotor speed = generator speed (typically 50-300 rpm). Geared (Skystream, Ryse) — gearbox step-up 1:5 to 1:25 to 1500-2000 rpm induction. Rated rotor speed typically 100-300 rpm at small scale.',
      source_references: [
        'corpus:Rotor diameter@wind_turbine_nacelle (117-236 m utility, extrapolated to small ≤16 m per IEC 61400-2)',
        'industry:Bergey Excel 15 direct-drive PMSG datasheet',
        'industry:Northern Power NPS 60/100 PMSG datasheet',
        'standard:IEC 61400-2 small wind turbines',
      ],
    },

    // ── Generator → power distribution (electrical) ──
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'power_distribution',
      protocol: 'physical',
      mechanism: 'ac_busbar',
      electrical: {
        voltage_nominal_v: 400,
        voltage_range_v: [240, 480],
        ac_or_dc: 'AC',
        ac_phases: 3,
        ac_frequency_hz: 50,  // variable in operation — inverter regulates to grid 50/60 Hz
        current_max_a: 150,
      },
      mechanical: { connector: '3-phase terminal block + droop terminals', cable_type: '6-50 mm² SWA' },
      required: true,
      direction: 'directional',
      notes: 'Generator variable-frequency 3-phase AC (50-100 Hz at rated rpm). On-site inverter (AC-DC-AC topology) regulates to grid 50/60 Hz. Off-grid variants feed DC bus directly via rectifier. Rated voltage 240-480 V at small scale (vs utility 690 V from corpus). Grid fuse 100-250 A typical.',
      source_references: [
        'industry:Bergey Excel 15 240 V 3-phase output',
        'industry:Ryse E10 grid-tie inverter spec',
        'standard:IEC 61400-21-1 (power quality)',
        'standard:G99 UK grid-tie (≤16 A/phase auto-connection)',
      ],
    },

    // ── Rotor / blades → structure (mechanical) ──
    {
      from_class: 'actuation_kinematics',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'mechanical_mount',
      mechanical: {
        mount: 'bolted',
        connector: 'yaw bearing (slewing ring) + nacelle bedplate + tower top flange',
      },
      required: true,
      direction: 'mutual',
      notes: 'Nacelle yaws on a slewing-ring bearing atop the tower. Passive yaw: tail vane orients rotor (typical Bergey class). Active yaw: electric yaw drive (Northern Power NPS class) commanded by wind-vane feedback. Tower flange M16-M30 bolts. Foundation: concrete pad or pile per soil class.',
      source_references: [
        'corpus:Tower head mass@wind_turbine_nacelle (360 t utility — extrapolated to small ~1-5 t)',
        'industry:Bergey Excel passive-yaw tail-vane design',
        'industry:Northern Power active electric yaw drive',
        'standard:IEC 61400-2 small turbine structural design',
      ],
    },

    // ── Pitch / yaw drives → actuation_kinematics ──
    // (Already represented above as actuation_kinematics is the actuator node.
    //  The control_compute_communication → actuation_kinematics edge below
    //  covers the command path.)

    // ── Control → generator + actuators ──
    {
      from_class: 'control_compute_communication',
      to_class: 'energy_conversion_transduction',
      protocol: 'Modbus-TCP',
      mechanism: 'modbus_tcp',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 24 },
      mechanical: { connector: 'RJ45 or screw terminal', cable_type: 'Cat 5e or RS-485 twisted pair' },
      required: true,
      direction: 'mutual',
      notes: 'PLC commands inverter active/reactive power setpoint per grid-code (G99 in UK, IEEE 1547 in US). Modbus TCP/IP typical at small scale; CANopen on older inverters. SCADA reports kWh, availability, fault codes.',
      source_references: [
        'industry:ABB / SMA Windy Boy WB inverter Modbus profile',
        'standard:G99 UK grid connection',
        'standard:IEEE 1547 US grid-tie',
      ],
    },
    {
      from_class: 'control_compute_communication',
      to_class: 'actuation_kinematics',
      protocol: 'PWM',
      mechanism: 'contactor_command',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 24 },
      required: true,
      direction: 'directional',
      notes: 'Active-pitch command (electric pitch actuator per blade — typical for ≥30 kW units) and active-yaw command (electric yaw drive). Passive-pitch (stall-regulated, Bergey class) needs no command path — this edge is still required at the system level for yaw command. Pitch step typ. 0.1° resolution. Yaw speed 0.3-1.0°/s.',
      source_references: [
        'industry:Northern Power NPS active-pitch system',
        'industry:Vestas V100 pitch system (utility, scaled)',
      ],
    },
    {
      from_class: 'control_compute_communication',
      to_class: 'sensing_instrumentation',
      protocol: 'Modbus-RTU',
      mechanism: 'sensor_feedback',
      electrical: { ac_or_dc: 'DC', voltage_nominal_v: 24 },
      required: true,
      direction: 'mutual',
      notes: 'PLC reads cup or ultrasonic anemometer + wind vane (typ. NRG #40C / Vector A100K), rotor encoder (incremental 1024 ppr), generator phase V/I, nacelle temperature + 3-axis vibration, tower-top + tower-base accelerometer. RS-485 Modbus-RTU for the deep sensor stack.',
      source_references: [
        'industry:NRG #40C anemometer',
        'industry:Vector Instruments A100K wind vane',
        'standard:IEC 61400-12-1 power performance measurement',
      ],
    },

    // ── Safety chain ──
    {
      from_class: 'safety_protection',
      to_class: 'actuation_kinematics',
      protocol: 'Digital-24V',
      mechanism: 'safety_isolation',
      electrical: { voltage_nominal_v: 24, ac_or_dc: 'DC', current_max_a: 5 },
      required: true,
      direction: 'directional',
      notes: 'Over-speed governor trips: (1) mechanical disc/drum brake on the high-speed shaft (geared) or low-speed shaft (direct-drive); (2) pitch-to-feather command (active-pitch); (3) furling tail rotation (passive). High wind shutdown threshold 25 m/s (corpus). Cut-out 25 m/s with auto-restart at 20 m/s typical.',
      source_references: [
        'corpus:High wind shutdown threshold@wind_turbine_nacelle (25 m/s)',
        'corpus:Cut-out wind speed@wind_turbine_nacelle (25 m/s)',
        'industry:Bergey furling tail safety system',
        'standard:IEC 61400-2 §7.7 protection system',
      ],
    },
    {
      from_class: 'safety_protection',
      to_class: 'energy_conversion_transduction',
      protocol: 'Digital-24V',
      mechanism: 'safety_isolation',
      electrical: { voltage_nominal_v: 24, ac_or_dc: 'DC' },
      required: true,
      direction: 'directional',
      notes: 'Electrical dump-load (resistor bank, typically 110-150% rated power) absorbs generator output on grid-loss or over-speed before the brake engages. Lightning down-conductor bonds tower → blade tip; SPDs at tower base for inverter input. Anti-islanding per G99 / IEEE 1547.',
      source_references: [
        'industry:Bergey Powersync dump-load resistor bank',
        'standard:IEC 61400-24 lightning protection',
        'standard:G99 anti-islanding',
      ],
    },
    {
      from_class: 'safety_protection',
      to_class: 'sensing_instrumentation',
      protocol: 'Analog-thermistor',
      mechanism: 'alarm_interlock',
      required: true,
      direction: 'mutual',
      notes: 'Vibration sensors trip on rotor imbalance (typ. 50 mm/s ISO 10816 zone-D threshold); generator over-temp; bearing temperature; tower oscillation. Triggers the same brake + dump-load chain.',
      source_references: [
        'standard:ISO 10816 vibration severity',
        'industry:Wilcoxon 793 industrial accelerometer',
      ],
    },

    // ── Thermal (nacelle cooling) ──
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'environmental_interface',
      protocol: 'physical',
      mechanism: 'cooling_loop',
      fluid: { medium: 'air', temperature_max_c: 50, temperature_min_c: -20 },
      mechanical: { mount: 'in-line', connector: 'nacelle vent louvres + fan' },
      required: false,
      direction: 'mutual',
      notes: 'Nacelle ventilation via passive louvres + thermostatically-controlled fan. Direct-drive PMSG passive cooled at small scale (no forced air for ≤30 kW). Operating temp -20 to +45 °C (corpus). Cold-climate kit: heater + ice-detect anemometer.',
      source_references: [
        'corpus:Standard operating temperature range@wind_turbine_nacelle (-20 to +45 °C)',
        'industry:Bergey nacelle passive cooling',
      ],
    },

    // ── Power distribution → tower (mechanical cable transit) ──
    {
      from_class: 'power_distribution',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'cable_transit',
      mechanical: { mount: 'in-line', connector: 'slip-ring (active yaw) or cable loop (passive)', cable_type: '3+1 SWA + comms' },
      required: true,
      direction: 'mutual',
      notes: 'Power + comms cables run down through the yaw axis to the tower base. Active-yaw: slip-ring (typ. Moog or Mersen, 3-phase + comms). Passive-yaw: cable loop with limit switch to untwist after ±2 turns. Tower-base disconnect switch is the lockable maintenance isolator.',
      source_references: [
        'industry:Moog SR080 wind-turbine slip ring',
        'industry:Bergey Excel cable-loop yaw arrangement',
        'standard:IEC 61400-2 §7.10 electrical safety',
      ],
    },

    // ── Service ──
    {
      from_class: 'maintenance_serviceability',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'cable_transit',
      mechanical: { mount: 'panel', connector: 'tower hatch + nacelle service door' },
      required: false,
      direction: 'mutual',
      notes: 'Climbing ladder (vertical fixed ladder + fall-arrest rail per EN 353) inside tubular tower; service hatch at nacelle bedplate. Tilt-down towers (lattice, hinged-base monopole) common at ≤30 kW for ground-level service. Down-tower disconnect lockable for MCS / NEC 705 service-isolation requirement.',
      source_references: [
        'standard:EN 353 fall-arrest rail',
        'standard:MCS-006 UK microgeneration service',
        'industry:Bergey tilt-down tower',
      ],
    },
  ],

  sources_cited: [
    'corpus:wind_turbine_nacelle (~8 utility-scale datasheets, 2026-05-18 — extrapolated to small scale)',
    'standard:IEC 61400-1 (large wind turbines — for topology)',
    'standard:IEC 61400-2 (small wind turbines, ≤200 m² rotor area)',
    'standard:IEC 61400-12-1 (power performance)',
    'standard:IEC 61400-21-1 (power quality)',
    'standard:IEC 61400-24 (lightning protection)',
    'standard:G99 (UK grid connection)',
    'standard:IEEE 1547 (US grid-tie)',
    'standard:MCS-006 (UK Microgeneration Certification Scheme)',
    'standard:AWEA 9.1-2009 (US small wind certification)',
    'standard:ISO 10816 (vibration severity)',
    'standard:EN 353 (fall-arrest rail)',
    'industry:Bergey Excel 15 / Excel 6',
    'industry:Northern Power NPS 60 / 100',
    'industry:Ryse E10 / Skystream 3.7',
    'industry:SD Wind Energy SD6',
    'industry:NRG / Vector / Wilcoxon sensor datasheets',
  ],
}

registerClassReferenceGraph(WIND_TURBINE_SMALL)

export { WIND_TURBINE_SMALL }
