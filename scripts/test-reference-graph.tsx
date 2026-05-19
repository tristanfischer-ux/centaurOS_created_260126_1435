#!/usr/bin/env npx tsx
/**
 * @file scripts/test-reference-graph.tsx — K10 Engineering Reference Graph
 * smoke test.
 *
 * @description Loads each seeded ProductClassGraph (BESS utility-scale, heat
 * pump residential, VFD motor drive) and validates a known-good emitted
 * connections set against it. Reports per class:
 *   - matched edges (PASS)
 *   - missing required edges (FAIL)
 *   - extra edges (potentially OK — flagged)
 *   - protocol mismatches (diagnostic only)
 *
 * @usage  npx tsx scripts/test-reference-graph.tsx
 *         npx tsx scripts/test-reference-graph.tsx --class bess-utility-scale
 *         npx tsx scripts/test-reference-graph.tsx --state <path-to-state.json>
 *
 * @data-sources
 *   - BESS: real state.json from `radical-phase5-state-containerised_3_5_mwh_battery_energy_storage.json`
 *     in the repo root (Tristan Iter run output).
 *   - Heat pump / VFD: synthetic emitted connections matching what a
 *     well-formed Stage 1.7 emission would produce, derived from the prose
 *     priors in `class-connections.ts`.
 *
 * @scaffolding-status NOT a CI gate. This is the test rig for K10 itself —
 * once the validator is wired into the live pipeline, the gate runs inside
 * `1.7-module-decomposition.ts` per-emission.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// Import the K10 registry — call ensureGraphsRegistered() before lookups
// to populate CLASS_REFERENCE_GRAPHS lazily (avoids TDZ on per-class files).
import {
  CLASS_REFERENCE_GRAPHS,
  ensureGraphsRegistered,
  getClassReferenceGraph,
  validateConnectionsAgainstGraph,
  type EmittedConnection,
  type GraphValidationResult,
  type ProductClassGraph,
} from '../src/lib/pdf-engine-v2/class-reference-graph'

// ---------------------------------------------------------------------------
// Synthetic emitted connections for classes that don't have a real state.json
// in the repo. These mirror what `class-connections.ts` lists as prose priors;
// the validator's job is to PASS them when they match a typed graph edge and
// FLAG the gaps.
// ---------------------------------------------------------------------------

const HEAT_PUMP_RESIDENTIAL_SYNTHETIC: EmittedConnection[] = [
  // Refrigerant + hydronic circuit
  { from_module: 'energy_conversion_transduction', to_module: 'mass_fluid_transport_process', mechanism: 'refrigerant_line', detail: 'R32 high/low side via compressor + EXV' },
  { from_module: 'mass_fluid_transport_process', to_module: 'environmental_interface', mechanism: 'refrigerant_line', detail: 'outdoor coil + indoor plate HX' },
  { from_module: 'mass_fluid_transport_process', to_module: 'environmental_interface', mechanism: 'fluid_routing', detail: 'hydronic loop to heating circuit' },
  // Power
  { from_module: 'power_distribution', to_module: 'energy_conversion_transduction', mechanism: 'ac_busbar', detail: '230 V 1ph 50 Hz' },
  // Mechanical
  { from_module: 'energy_conversion_transduction', to_module: 'structure_containment', mechanism: 'mechanical_mount', detail: 'vibration isolators' },
  // Control
  { from_module: 'control_compute_communication', to_module: 'energy_conversion_transduction', mechanism: 'contactor_command', detail: 'compressor speed' },
  { from_module: 'control_compute_communication', to_module: 'actuation_kinematics', mechanism: 'contactor_command', detail: 'EXV stepper, fan, pump' },
  { from_module: 'control_compute_communication', to_module: 'sensing_instrumentation', mechanism: 'sensor_feedback', detail: 'PT1000 + HP/LP transducers' },
  // Safety
  { from_module: 'safety_protection', to_module: 'energy_conversion_transduction', mechanism: 'safety_isolation', detail: 'HP switch hard-wired' },
  { from_module: 'safety_protection', to_module: 'sensing_instrumentation', mechanism: 'alarm_interlock', detail: 'R290 leak detect' },
  // HMI
  { from_module: 'control_compute_communication', to_module: 'hmi_ergonomics', mechanism: 'hmi_data', detail: 'wired wall controller' },
]

const VFD_MOTOR_DRIVE_SYNTHETIC: EmittedConnection[] = [
  // Power input + output
  { from_module: 'power_distribution', to_module: 'energy_conversion_transduction', mechanism: 'ac_busbar', detail: '400 V 3ph 50 Hz line' },
  { from_module: 'energy_conversion_transduction', to_module: 'actuation_kinematics', mechanism: 'ac_busbar', detail: 'variable-frequency 0-300 Hz to motor' },
  // Field bus + sensing
  { from_module: 'control_compute_communication', to_module: 'energy_conversion_transduction', mechanism: 'modbus_tcp', detail: 'PROFINET PROFIdrive' },
  { from_module: 'control_compute_communication', to_module: 'sensing_instrumentation', mechanism: 'sensor_feedback', detail: 'DC-link V, motor currents, IGBT temp' },
  { from_module: 'sensing_instrumentation', to_module: 'actuation_kinematics', mechanism: 'sensor_feedback', detail: 'optional encoder' },
  // Functional safety
  { from_module: 'safety_protection', to_module: 'energy_conversion_transduction', mechanism: 'safety_isolation', detail: 'STO 2-channel 24 V DC' },
  // Cooling + mechanical
  { from_module: 'energy_conversion_transduction', to_module: 'environmental_interface', mechanism: 'cooling_loop', detail: 'fan-cooled heatsink' },
  { from_module: 'energy_conversion_transduction', to_module: 'structure_containment', mechanism: 'mechanical_mount', detail: 'M5 stud panel mount' },
  // HMI (optional)
  { from_module: 'control_compute_communication', to_module: 'hmi_ergonomics', mechanism: 'hmi_data', detail: 'BOP/IOP front panel' },
]

const PV_STRING_INVERTER_SYNTHETIC: EmittedConnection[] = [
  // DC input + AC output
  { from_module: 'power_distribution', to_module: 'energy_conversion_transduction', mechanism: 'dc_busbar', detail: 'PV string DC 80-1000 V via MC4 to MPPT boost' },
  { from_module: 'energy_conversion_transduction', to_module: 'power_distribution', mechanism: 'ac_busbar', detail: '400 V 3ph 50 Hz grid-tie' },
  // Control
  { from_module: 'control_compute_communication', to_module: 'energy_conversion_transduction', mechanism: 'contactor_command', detail: 'PWM gate drive (MPPT + bridge)' },
  { from_module: 'control_compute_communication', to_module: 'sensing_instrumentation', mechanism: 'sensor_feedback', detail: 'PV V/I, DC-link V, grid V/I, heatsink temp' },
  { from_module: 'control_compute_communication', to_module: 'environmental_interface', mechanism: 'contactor_command', detail: 'fan PWM speed' },
  // Safety
  { from_module: 'safety_protection', to_module: 'energy_conversion_transduction', mechanism: 'safety_isolation', detail: 'anti-islanding + arc-fault + RCMU' },
  { from_module: 'safety_protection', to_module: 'sensing_instrumentation', mechanism: 'alarm_interlock', detail: 'isolation monitor + arc detect' },
  { from_module: 'safety_protection', to_module: 'power_distribution', mechanism: 'contactor_command', detail: 'rapid shutdown (NEC 690.12) + AC tie-breaker' },
  // Thermal + mechanical
  { from_module: 'energy_conversion_transduction', to_module: 'environmental_interface', mechanism: 'cooling_loop', detail: 'forced-air heatsink' },
  { from_module: 'energy_conversion_transduction', to_module: 'structure_containment', mechanism: 'mechanical_mount', detail: 'die-cast IP65 enclosure + wall bracket' },
  { from_module: 'power_distribution', to_module: 'structure_containment', mechanism: 'cable_transit', detail: 'M25/M32 cable gland (IP65)' },
  // HMI (optional)
  { from_module: 'control_compute_communication', to_module: 'hmi_ergonomics', mechanism: 'modbus_tcp', detail: 'Modbus TCP + SunSpec to cloud' },
]

const INDUSTRIAL_ROBOT_ARM_SYNTHETIC: EmittedConnection[] = [
  // Mains + motor drive
  { from_module: 'power_distribution', to_module: 'energy_conversion_transduction', mechanism: 'ac_busbar', detail: '400 V 3ph mains to drive cabinet' },
  { from_module: 'energy_conversion_transduction', to_module: 'actuation_kinematics', mechanism: 'ac_busbar', detail: '6× 3-phase servo drives + brake supply via manipulator cable' },
  // Encoder feedback
  { from_module: 'sensing_instrumentation', to_module: 'control_compute_communication', mechanism: 'sensor_feedback', detail: 'absolute multi-turn encoder per joint' },
  // Internal field bus
  { from_module: 'control_compute_communication', to_module: 'energy_conversion_transduction', mechanism: 'modbus_tcp', detail: 'EtherCAT / FSSB to drive amplifiers' },
  // Teach pendant
  { from_module: 'control_compute_communication', to_module: 'hmi_ergonomics', mechanism: 'hmi_data', detail: 'FlexPendant / iPendant / smartPAD' },
  // Safety
  { from_module: 'safety_protection', to_module: 'energy_conversion_transduction', mechanism: 'safety_isolation', detail: 'STO + safety mat + light curtain + E-stop' },
  { from_module: 'safety_protection', to_module: 'control_compute_communication', mechanism: 'safety_isolation', detail: 'PROFIsafe safe-speed-monitor' },
  // Tool I/O
  { from_module: 'power_distribution', to_module: 'control_compute_communication', mechanism: 'sensor_feedback', detail: '24 V customer I/O + 12/24 V tool I/O' },
  // Pneumatic (optional)
  { from_module: 'mass_fluid_transport_process', to_module: 'actuation_kinematics', mechanism: 'fluid_routing', detail: 'integrated 6-8 bar air supply to wrist' },
  // Cooling + mechanical
  { from_module: 'energy_conversion_transduction', to_module: 'environmental_interface', mechanism: 'cooling_loop', detail: 'cabinet fan tray' },
  { from_module: 'actuation_kinematics', to_module: 'structure_containment', mechanism: 'mechanical_mount', detail: 'manipulator base M16 anchors' },
  { from_module: 'energy_conversion_transduction', to_module: 'structure_containment', mechanism: 'mechanical_mount', detail: 'controller cabinet floor bolts' },
]

const DC_FAST_EV_CHARGER_SYNTHETIC: EmittedConnection[] = [
  // AC input + DC output
  { from_module: 'power_distribution', to_module: 'energy_conversion_transduction', mechanism: 'ac_busbar', detail: '400/480 V 3ph + N + PE input' },
  { from_module: 'energy_conversion_transduction', to_module: 'power_distribution', mechanism: 'dc_busbar', detail: '150-920 V DC bus to dispenser' },
  { from_module: 'power_distribution', to_module: 'actuation_kinematics', mechanism: 'dc_busbar', detail: 'CCS/CHAdeMO charging cable to vehicle' },
  // Comms
  { from_module: 'control_compute_communication', to_module: 'actuation_kinematics', mechanism: 'modbus_tcp', detail: 'ISO 15118 PLC + CHAdeMO CAN session' },
  { from_module: 'control_compute_communication', to_module: 'hmi_ergonomics', mechanism: 'modbus_tcp', detail: 'OCPP 1.6 JSON over Ethernet / 4G LTE' },
  { from_module: 'control_compute_communication', to_module: 'sensing_instrumentation', mechanism: 'sensor_feedback', detail: 'MID energy meter + DC V/I + connector temp + ground fault' },
  // Safety
  { from_module: 'safety_protection', to_module: 'energy_conversion_transduction', mechanism: 'safety_isolation', detail: 'RCD Type B + insulation monitor + surge' },
  { from_module: 'safety_protection', to_module: 'sensing_instrumentation', mechanism: 'alarm_interlock', detail: 'connector overtemp + isolation + CP/PP fault' },
  // Cooling + cable cooling
  { from_module: 'energy_conversion_transduction', to_module: 'environmental_interface', mechanism: 'cooling_loop', detail: 'forced-air power modules' },
  { from_module: 'mass_fluid_transport_process', to_module: 'power_distribution', mechanism: 'cooling_loop', detail: 'liquid-cooled charging cable (>200 A)' },
  // Mechanical + HMI
  { from_module: 'energy_conversion_transduction', to_module: 'structure_containment', mechanism: 'mechanical_mount', detail: 'M16 anchor bolts to concrete pad' },
  { from_module: 'control_compute_communication', to_module: 'sensing_instrumentation', mechanism: 'hmi_data', detail: '7" touchscreen + LED ring + RFID' },
]

const FUEL_CELL_POWER_MODULE_SYNTHETIC: EmittedConnection[] = [
  // Hydrogen inlet + stack
  { from_module: 'energy_storage_source', to_module: 'mass_fluid_transport_process', mechanism: 'fluid_routing', detail: 'H2 inlet 5-8 barg, ISO 14687 grade D' },
  { from_module: 'mass_fluid_transport_process', to_module: 'energy_conversion_transduction', mechanism: 'fluid_routing', detail: 'humidified air + recirculated H2 to MEA' },
  // Thermal
  { from_module: 'energy_conversion_transduction', to_module: 'environmental_interface', mechanism: 'cooling_loop', detail: 'water-glycol stack cooling, 70 °C nominal' },
  { from_module: 'energy_conversion_transduction', to_module: 'environmental_interface', mechanism: 'fluid_routing', detail: 'cathode exhaust + product water vent' },
  // DC output
  { from_module: 'energy_conversion_transduction', to_module: 'power_distribution', mechanism: 'dc_busbar', detail: 'HV DC 140-750 V via integrated DC-DC' },
  // Control + sensing
  { from_module: 'control_compute_communication', to_module: 'energy_conversion_transduction', mechanism: 'can_bus', detail: 'SAE J1939 stack current + BoP setpoints' },
  { from_module: 'control_compute_communication', to_module: 'mass_fluid_transport_process', mechanism: 'contactor_command', detail: 'air compressor + recirc pump + purge valve' },
  { from_module: 'control_compute_communication', to_module: 'sensing_instrumentation', mechanism: 'sensor_feedback', detail: 'CVM + coolant T + H2 pressure + MAF' },
  // Safety
  { from_module: 'safety_protection', to_module: 'mass_fluid_transport_process', mechanism: 'safety_isolation', detail: 'ESV trip on leak (ISO 23273)' },
  { from_module: 'safety_protection', to_module: 'sensing_instrumentation', mechanism: 'alarm_interlock', detail: 'H2 leak detector + CVM out-of-range' },
  { from_module: 'safety_protection', to_module: 'energy_conversion_transduction', mechanism: 'safety_isolation', detail: 'HV-IL contactor + insulation monitor' },
  // Mechanical
  { from_module: 'energy_conversion_transduction', to_module: 'structure_containment', mechanism: 'mechanical_mount', detail: 'IP67/IP6K9K enclosure + vibration isolators' },
  { from_module: 'power_distribution', to_module: 'structure_containment', mechanism: 'cable_transit', detail: 'HV + LV + CAN cable glands' },
]

const INDUSTRIAL_3D_PRINTER_SYNTHETIC: EmittedConnection[] = [
  // Power
  { from_module: 'power_distribution', to_module: 'energy_conversion_transduction', mechanism: 'ac_busbar', detail: '400 V 3ph 16 A to laser / projector / heater bank' },
  { from_module: 'power_distribution', to_module: 'actuation_kinematics', mechanism: 'dc_busbar', detail: '24-48 V DC stepper / servo supply' },
  // Feedstock + energy at workpiece
  { from_module: 'mass_fluid_transport_process', to_module: 'actuation_kinematics', mechanism: 'fluid_routing', detail: 'powder recoater / resin pump / filament feed' },
  { from_module: 'energy_conversion_transduction', to_module: 'actuation_kinematics', mechanism: 'mechanical_mount', detail: 'galvo scanner / DLP head / hot-end on gantry' },
  // Chamber environment
  { from_module: 'environmental_interface', to_module: 'actuation_kinematics', mechanism: 'air_duct', detail: 'inert N2/Ar purge + fume extraction' },
  // Control
  { from_module: 'control_compute_communication', to_module: 'actuation_kinematics', mechanism: 'modbus_tcp', detail: 'EtherCAT motion + galvo scan' },
  { from_module: 'control_compute_communication', to_module: 'energy_conversion_transduction', mechanism: 'contactor_command', detail: 'laser-on / UV / heater PWM' },
  { from_module: 'control_compute_communication', to_module: 'sensing_instrumentation', mechanism: 'sensor_feedback', detail: 'chamber T/RH + O2 + melt-pool camera + Z encoder' },
  // Safety
  { from_module: 'safety_protection', to_module: 'energy_conversion_transduction', mechanism: 'safety_isolation', detail: 'door interlock cuts laser/UV shutter' },
  { from_module: 'safety_protection', to_module: 'sensing_instrumentation', mechanism: 'alarm_interlock', detail: 'O2 alarm + smoke + dust-explosion mitigation' },
  { from_module: 'safety_protection', to_module: 'environmental_interface', mechanism: 'door_interlock', detail: 'chamber door + extraction damper' },
  // Mechanical
  { from_module: 'actuation_kinematics', to_module: 'structure_containment', mechanism: 'mechanical_mount', detail: 'gantry on precision optical baseplate' },
  { from_module: 'mass_fluid_transport_process', to_module: 'structure_containment', mechanism: 'mechanical_mount', detail: 'powder hopper / resin vat / filament spool mount' },
  // HMI (optional)
  { from_module: 'control_compute_communication', to_module: 'hmi_ergonomics', mechanism: 'hmi_data', detail: 'front-panel touchscreen + Wi-Fi 2.4 GHz' },
]

const HEAT_PUMP_COMMERCIAL_SYNTHETIC: EmittedConnection[] = [
  // Refrigerant circuit
  { from_module: 'energy_conversion_transduction', to_module: 'mass_fluid_transport_process', mechanism: 'refrigerant_line', detail: 'R32/R290/R744 transcritical, scroll/screw compressor' },
  { from_module: 'mass_fluid_transport_process', to_module: 'environmental_interface', mechanism: 'refrigerant_line', detail: 'outdoor V-bank coil + plate HX or shell-and-tube' },
  // Hydronic primary loop
  { from_module: 'mass_fluid_transport_process', to_module: 'environmental_interface', mechanism: 'fluid_routing', detail: 'water-glycol primary loop to building distribution' },
  // Power (3-phase required)
  { from_module: 'power_distribution', to_module: 'energy_conversion_transduction', mechanism: 'ac_busbar', detail: '400 V 3ph 50 Hz mains via MCCB' },
  // Mechanical
  { from_module: 'energy_conversion_transduction', to_module: 'structure_containment', mechanism: 'mechanical_mount', detail: 'galvanised frame + sound enclosure + isolators' },
  // Control + BMS
  { from_module: 'control_compute_communication', to_module: 'energy_conversion_transduction', mechanism: 'contactor_command', detail: 'PLC drives inverter VFD board + EXV + 4-way valve' },
  { from_module: 'control_compute_communication', to_module: 'actuation_kinematics', mechanism: 'contactor_command', detail: 'EXV stepper + EC fan + Wilo Stratos circulator' },
  { from_module: 'control_compute_communication', to_module: 'sensing_instrumentation', mechanism: 'sensor_feedback', detail: 'PT1000 4-wire + HP/LP 4-20 mA + flow switch' },
  { from_module: 'control_compute_communication', to_module: 'hmi_ergonomics', mechanism: 'modbus_tcp', detail: 'BACnet/IP or Modbus TCP to BMS' },
  // Safety
  { from_module: 'safety_protection', to_module: 'energy_conversion_transduction', mechanism: 'safety_isolation', detail: 'HP switch + PED PSV (R744 high-side)' },
  { from_module: 'safety_protection', to_module: 'sensing_instrumentation', mechanism: 'alarm_interlock', detail: 'R744 NDIR leak detector + R290 LEL + over-pressure' },
]

const PV_MODULE_RESIDENTIAL_SYNTHETIC: EmittedConnection[] = [
  // Series-cell DC output
  { from_module: 'energy_conversion_transduction', to_module: 'power_distribution', mechanism: 'dc_busbar', detail: '60/72 c-Si cells in 3 substrings, MC4 pigtails' },
  // Bypass diodes (safety)
  { from_module: 'safety_protection', to_module: 'energy_conversion_transduction', mechanism: 'dc_busbar', detail: '3× Schottky bypass diodes in junction box' },
  // Junction box → frame
  { from_module: 'power_distribution', to_module: 'structure_containment', mechanism: 'mechanical_mount', detail: 'silicone-bonded IP65/68 J-box with MC4 pigtails' },
  // Cells → frame lamination
  { from_module: 'energy_conversion_transduction', to_module: 'structure_containment', mechanism: 'mechanical_mount', detail: 'EVA/POE lamination, anodised Al frame' },
  // Frame → mount rail / PE
  { from_module: 'structure_containment', to_module: 'environmental_interface', mechanism: 'mechanical_mount', detail: 'mid-clamp on Al rail + 6 mm² PE bond + drainage' },
]

const WIND_TURBINE_SMALL_SYNTHETIC: EmittedConnection[] = [
  // Rotor → generator
  { from_module: 'actuation_kinematics', to_module: 'energy_conversion_transduction', mechanism: 'mechanical_mount', detail: 'rotor hub + main shaft to direct-drive PMSG' },
  // Generator → power
  { from_module: 'energy_conversion_transduction', to_module: 'power_distribution', mechanism: 'ac_busbar', detail: 'variable-frequency 240-480 V 3ph to AC-DC-AC inverter' },
  // Rotor / nacelle → tower
  { from_module: 'actuation_kinematics', to_module: 'structure_containment', mechanism: 'mechanical_mount', detail: 'yaw slewing bearing + nacelle bedplate + tower flange' },
  // Control + grid-tie
  { from_module: 'control_compute_communication', to_module: 'energy_conversion_transduction', mechanism: 'modbus_tcp', detail: 'PLC to inverter setpoint per G99 / IEEE 1547' },
  { from_module: 'control_compute_communication', to_module: 'actuation_kinematics', mechanism: 'contactor_command', detail: 'active pitch + active yaw drive commands' },
  { from_module: 'control_compute_communication', to_module: 'sensing_instrumentation', mechanism: 'sensor_feedback', detail: 'anemometer + wind vane + encoder + vibration' },
  // Safety
  { from_module: 'safety_protection', to_module: 'actuation_kinematics', mechanism: 'safety_isolation', detail: 'mechanical brake + pitch-to-feather + furling tail' },
  { from_module: 'safety_protection', to_module: 'energy_conversion_transduction', mechanism: 'safety_isolation', detail: 'dump load + lightning SPD + anti-islanding' },
  { from_module: 'safety_protection', to_module: 'sensing_instrumentation', mechanism: 'alarm_interlock', detail: 'vibration + over-temp + bearing alarm' },
  // Tower cable transit
  { from_module: 'power_distribution', to_module: 'structure_containment', mechanism: 'cable_transit', detail: 'slip-ring / cable-loop yaw + tower SWA down' },
]

const AUV_SUBSEA_SYNTHETIC: EmittedConnection[] = [
  // Power
  { from_module: 'energy_storage_source', to_module: 'energy_conversion_transduction', mechanism: 'dc_busbar', detail: 'pressure-compensated Li-ion 48 V hotel / 300 V thruster' },
  { from_module: 'energy_conversion_transduction', to_module: 'actuation_kinematics', mechanism: 'dc_busbar', detail: 'BLDC drive to ducted prop + control-fin servos' },
  // Pressure hull
  { from_module: 'control_compute_communication', to_module: 'structure_containment', mechanism: 'mechanical_mount', detail: 'electronics in Al/Ti pressure hull, 500-6000 m rated' },
  { from_module: 'energy_storage_source', to_module: 'structure_containment', mechanism: 'mechanical_mount', detail: 'pressure-compensated battery pod + drop-weight cradle' },
  // Ballast (mass-fluid)
  { from_module: 'mass_fluid_transport_process', to_module: 'structure_containment', mechanism: 'fluid_routing', detail: 'VBS oil-bladder + trim tank + drop-weight' },
  // Control
  { from_module: 'control_compute_communication', to_module: 'actuation_kinematics', mechanism: 'can_bus', detail: 'autopilot CANopen to thrusters + fin servos' },
  { from_module: 'control_compute_communication', to_module: 'mass_fluid_transport_process', mechanism: 'contactor_command', detail: 'VBS pump + drop-weight solenoid' },
  { from_module: 'control_compute_communication', to_module: 'sensing_instrumentation', mechanism: 'sensor_feedback', detail: 'INS + DVL + depth + CTD + multibeam sonar' },
  // Comms (acoustic + surface)
  { from_module: 'control_compute_communication', to_module: 'environmental_interface', mechanism: 'sensor_feedback', detail: 'acoustic modem 10 km + WiFi/Iridium surface link' },
  // Safety
  { from_module: 'safety_protection', to_module: 'mass_fluid_transport_process', mechanism: 'safety_isolation', detail: 'pyrotechnic drop-weight release' },
  { from_module: 'safety_protection', to_module: 'sensing_instrumentation', mechanism: 'alarm_interlock', detail: 'hull strain + bilge water + battery over-temp' },
]

const BIOREACTOR_SYNTHETIC: EmittedConnection[] = [
  // Feed + sparger paths
  { from_module: 'mass_fluid_transport_process', to_module: 'structure_containment', mechanism: 'fluid_routing', detail: 'media + buffer + base/acid via Watson-Marlow peristaltic pumps' },
  { from_module: 'environmental_interface', to_module: 'mass_fluid_transport_process', mechanism: 'fluid_routing', detail: 'O2/N2/CO2 MFC sparger inlet at 2-4 bar' },
  // Thermal jacket
  { from_module: 'environmental_interface', to_module: 'structure_containment', mechanism: 'cooling_loop', detail: 'water-glycol jacketed loop, Huber Unichiller 6 °C' },
  // Vessel safety
  { from_module: 'safety_protection', to_module: 'structure_containment', mechanism: 'safety_isolation', detail: 'head-plate PSV + rupture disc + sterile vent filter' },
  { from_module: 'safety_protection', to_module: 'sensing_instrumentation', mechanism: 'alarm_interlock', detail: 'pH drift + DO collapse + foam-out detection' },
  // Control + sensing
  { from_module: 'control_compute_communication', to_module: 'sensing_instrumentation', mechanism: 'sensor_feedback', detail: 'pH + DO + temp + foam + mass-balance + Raman probes' },
  { from_module: 'control_compute_communication', to_module: 'actuation_kinematics', mechanism: 'contactor_command', detail: 'agitator VFD 10-600 rpm; rocking 4-25 rocks/min' },
  { from_module: 'control_compute_communication', to_module: 'mass_fluid_transport_process', mechanism: 'contactor_command', detail: 'feed / harvest / antifoam pumps + sparger MFC' },
  { from_module: 'control_compute_communication', to_module: 'hmi_ergonomics', mechanism: 'modbus_tcp', detail: 'touchscreen + 21 CFR Part 11 audit-trail + DCS uplink' },
  // Mechanical agitator
  { from_module: 'actuation_kinematics', to_module: 'structure_containment', mechanism: 'mechanical_mount', detail: 'magnetic-coupled drive shaft (sterile, no shaft seal)' },
]

const INDUSTRIAL_INSPECTION_DRONE_SYNTHETIC: EmittedConnection[] = [
  // Power: battery → ESC → motor
  { from_module: 'energy_storage_source', to_module: 'energy_conversion_transduction', mechanism: 'dc_busbar', detail: '22.2 V TB60 LiPo to ESC bank' },
  { from_module: 'energy_conversion_transduction', to_module: 'actuation_kinematics', mechanism: 'contactor_command', detail: 'DShot600 ESC to BLDC motor + propeller' },
  { from_module: 'energy_storage_source', to_module: 'power_distribution', mechanism: 'dc_busbar', detail: 'battery pack bay → PDB → 5V/12V/24V rails' },
  // Mechanical
  { from_module: 'actuation_kinematics', to_module: 'structure_containment', mechanism: 'mechanical_mount', detail: 'carbon-fibre arms hold motors under thrust + vibration' },
  // Flight control + sensor + radio
  { from_module: 'control_compute_communication', to_module: 'energy_conversion_transduction', mechanism: 'contactor_command', detail: 'flight controller PWM/DShot to ESCs' },
  { from_module: 'control_compute_communication', to_module: 'sensing_instrumentation', mechanism: 'sensor_feedback', detail: 'IMU + GNSS + baro + mag + vision-positioning + payload' },
  { from_module: 'control_compute_communication', to_module: 'environmental_interface', mechanism: 'hmi_data', detail: 'OcuSync 2.0 / 802.11ax RC link + AES-256 to ground station' },
  // Safety failsafe
  { from_module: 'safety_protection', to_module: 'control_compute_communication', mechanism: 'safety_isolation', detail: 'RTH + geofence + ADS-B + parachute + Remote ID' },
  { from_module: 'safety_protection', to_module: 'energy_storage_source', mechanism: 'alarm_interlock', detail: 'BMS over-temp + cell-imbalance + 72-h fire-discharge state' },
  // Cooling + service
  { from_module: 'energy_conversion_transduction', to_module: 'environmental_interface', mechanism: 'cooling_loop', detail: 'propeller wash forced-air; battery self-heater 10% power <5 °C' },
  { from_module: 'maintenance_serviceability', to_module: 'energy_storage_source', mechanism: 'cable_transit', detail: 'TB60 hot-swap bay + DJI Dock 2 auto-charge' },
]

const AUTOMATED_GUIDED_VEHICLE_AGV_SYNTHETIC: EmittedConnection[] = [
  // Power chain
  { from_module: 'energy_storage_source', to_module: 'power_distribution', mechanism: 'dc_busbar', detail: '24 V DC LFP traction battery + auto-charge dock' },
  { from_module: 'power_distribution', to_module: 'energy_conversion_transduction', mechanism: 'dc_busbar', detail: '24 V to drive + lift inverter + 5V/12V instrument' },
  { from_module: 'energy_conversion_transduction', to_module: 'actuation_kinematics', mechanism: 'contactor_command', detail: 'BLDC drive + steer motor at 0.9-2.3 m/s' },
  // Wheels / lift → chassis
  { from_module: 'actuation_kinematics', to_module: 'structure_containment', mechanism: 'mechanical_mount', detail: 'wheel hubs + suspension + lift mast bolted to steel chassis' },
  // Navigation + sensing
  { from_module: 'control_compute_communication', to_module: 'sensing_instrumentation', mechanism: 'sensor_feedback', detail: 'SLAM lidar + safety scanner + IMU + wheel encoders + RFID' },
  { from_module: 'control_compute_communication', to_module: 'energy_conversion_transduction', mechanism: 'contactor_command', detail: 'EtherCAT / PROFINET to drive + steer + lift inverter' },
  { from_module: 'control_compute_communication', to_module: 'environmental_interface', mechanism: 'modbus_tcp', detail: '802.11ac WiFi + VDA 5050 to fleet manager + WMS' },
  // Safety chain
  { from_module: 'safety_protection', to_module: 'actuation_kinematics', mechanism: 'safety_isolation', detail: 'SICK microScan3 protective field + bumper + E-stop → STO' },
  { from_module: 'safety_protection', to_module: 'sensing_instrumentation', mechanism: 'alarm_interlock', detail: 'tilt + crash accel + over-speed + cell imbalance' },
  // HMI + cooling + service
  { from_module: 'control_compute_communication', to_module: 'hmi_ergonomics', mechanism: 'hmi_data', detail: 'onboard touchscreen + LED status ring + manual-jog pendant' },
  { from_module: 'energy_conversion_transduction', to_module: 'environmental_interface', mechanism: 'cooling_loop', detail: 'thermostat-controlled fan tray on drive cabinet' },
  { from_module: 'maintenance_serviceability', to_module: 'energy_storage_source', mechanism: 'cable_transit', detail: 'hot-swap battery + Wiferion inductive auto-charge' },
]

const CHILLER_SYNTHETIC: EmittedConnection[] = [
  // Refrigerant circuit
  { from_module: 'energy_conversion_transduction', to_module: 'mass_fluid_transport_process', mechanism: 'refrigerant_line', detail: 'R-134a / R-1233zd centrifugal compressor + EXV + economiser' },
  { from_module: 'mass_fluid_transport_process', to_module: 'environmental_interface', mechanism: 'refrigerant_line', detail: 'flooded shell-and-tube evap + condenser' },
  // Chilled-water + condenser-water hydronic
  { from_module: 'mass_fluid_transport_process', to_module: 'environmental_interface', mechanism: 'fluid_routing', detail: 'primary chilled-water loop, LWT -8 to +18 °C' },
  { from_module: 'mass_fluid_transport_process', to_module: 'structure_containment', mechanism: 'fluid_routing', detail: 'condenser water-glycol loop to cooling tower' },
  // 3-phase mains + AFD starter
  { from_module: 'power_distribution', to_module: 'energy_conversion_transduction', mechanism: 'ac_busbar', detail: '460 V 3ph 60 Hz + AFD soft-starter + 115 V control' },
  // Control + BMS
  { from_module: 'control_compute_communication', to_module: 'energy_conversion_transduction', mechanism: 'modbus_tcp', detail: 'OptiView / ProDialog+ controller + AFD speed reference' },
  { from_module: 'control_compute_communication', to_module: 'actuation_kinematics', mechanism: 'contactor_command', detail: 'EXV 480-step + EC fan + 3-way condenser valve' },
  { from_module: 'control_compute_communication', to_module: 'sensing_instrumentation', mechanism: 'sensor_feedback', detail: 'PT100 4-wire + HP/LP 4-20 mA + flow switch + EXV position' },
  { from_module: 'control_compute_communication', to_module: 'hmi_ergonomics', mechanism: 'modbus_tcp', detail: 'BACnet/IP + LonTalk Profile 8040 + Modbus to BMS' },
  // Safety
  { from_module: 'safety_protection', to_module: 'energy_conversion_transduction', mechanism: 'safety_isolation', detail: 'HP/LP switch + discharge over-temp 110 °C + freeze-stat' },
  { from_module: 'safety_protection', to_module: 'sensing_instrumentation', mechanism: 'alarm_interlock', detail: 'refrigerant leak detect + flow-loss + oil-level' },
  // Mechanical mount
  { from_module: 'energy_conversion_transduction', to_module: 'structure_containment', mechanism: 'mechanical_mount', detail: 'skid base + spring isolators + IBC 2018 seismic anchors' },
]

const DISTRIBUTION_TRANSFORMER_SYNTHETIC: EmittedConnection[] = [
  // MV primary + LV secondary windings
  { from_module: 'power_distribution', to_module: 'energy_conversion_transduction', mechanism: 'ac_busbar', detail: '20 kV MV plug-in elbow primary winding' },
  { from_module: 'energy_conversion_transduction', to_module: 'power_distribution', mechanism: 'ac_busbar', detail: '433 V LV secondary terminal block Dyn11' },
  // Cooling
  { from_module: 'energy_conversion_transduction', to_module: 'environmental_interface', mechanism: 'cooling_loop', detail: 'AN dry-type or ONAN/ONAF radiator + thermostat fan on 100 °C' },
  // Safety chain
  { from_module: 'safety_protection', to_module: 'energy_conversion_transduction', mechanism: 'safety_isolation', detail: 'winding over-temp 150 °C trip + Buchholz + ZnO surge arrester' },
  { from_module: 'safety_protection', to_module: 'sensing_instrumentation', mechanism: 'alarm_interlock', detail: 'PT100 winding monitor + oil DGA + EMF 26. BimSchV' },
  // Mechanical / chassis
  { from_module: 'energy_conversion_transduction', to_module: 'structure_containment', mechanism: 'mechanical_mount', detail: 'core + winding bolted to galvanised frame + IBC seismic anchors' },
  { from_module: 'power_distribution', to_module: 'structure_containment', mechanism: 'cable_transit', detail: 'MV cable gland + LV lug compartment + earth bus to ground' },
  // Smart monitor (optional)
  { from_module: 'control_compute_communication', to_module: 'sensing_instrumentation', mechanism: 'modbus_tcp', detail: 'ABB TXpert smart monitor + IEC 61850 + DNP3 to SCADA' },
  // Tap changer + service
  { from_module: 'power_distribution', to_module: 'maintenance_serviceability', mechanism: 'mechanical_mount', detail: 'off-circuit ±2 × 2.5% tap-changer manual handle' },
  { from_module: 'maintenance_serviceability', to_module: 'environmental_interface', mechanism: 'cable_transit', detail: 'oil sampling valve + drain port + silica-gel breather' },
]

const VEHICLE_BATTERY_PACK_SYNTHETIC: EmittedConnection[] = [
  // Power: cells through PD
  { from_module: 'energy_storage_source', to_module: 'power_distribution', mechanism: 'dc_busbar', detail: '400/800 V pack to pyro disconnect + main contactor + MSD' },
  // Thermal canonical chain
  { from_module: 'energy_storage_source', to_module: 'mass_fluid_transport_process', mechanism: 'fluid_routing', detail: 'water-glycol cold-plate manifolds' },
  // Control
  { from_module: 'control_compute_communication', to_module: 'energy_storage_source', mechanism: 'can_bus', detail: 'BMS master + cell-monitor IC daisy-chain (LTC6804)' },
  { from_module: 'control_compute_communication', to_module: 'environmental_interface', mechanism: 'can_bus', detail: 'BMS commands chiller/heater + HVAC priority via J1939' },
  { from_module: 'control_compute_communication', to_module: 'sensing_instrumentation', mechanism: 'sensor_feedback', detail: 'Hall current + IMD insulation + pack-V isolated' },
  // Safety
  { from_module: 'safety_protection', to_module: 'energy_storage_source', mechanism: 'contactor_command', detail: 'HVIL + airbag crash signal trips pyro fuse' },
  { from_module: 'safety_protection', to_module: 'sensing_instrumentation', mechanism: 'alarm_interlock', detail: 'thermal runaway + off-gas + module NTC' },
  { from_module: 'safety_protection', to_module: 'power_distribution', mechanism: 'safety_isolation', detail: 'Manual Service Disconnect + HVIL through MSD' },
  // Mechanical (crash)
  { from_module: 'energy_storage_source', to_module: 'structure_containment', mechanism: 'mechanical_mount', detail: 'cell-to-pack or modular into Al/steel case with bottom shield' },
  { from_module: 'power_distribution', to_module: 'structure_containment', mechanism: 'cable_transit', detail: 'sealed HV gland + Rosenberger H-MTD pack-to-vehicle' },
]

const HYDROGEN_ELECTROLYSER_SYNTHETIC: EmittedConnection[] = [
  // Power
  { from_module: 'power_distribution', to_module: 'energy_conversion_transduction', mechanism: 'dc_busbar', detail: '11-33 kV MV → high-current DC via rectifier (97% η)' },
  // Water in + H2/O2 out
  { from_module: 'energy_storage_source', to_module: 'mass_fluid_transport_process', mechanism: 'fluid_routing', detail: 'demin water 0.8-1.5 L/Nm3 H2 inlet' },
  { from_module: 'energy_conversion_transduction', to_module: 'mass_fluid_transport_process', mechanism: 'fluid_routing', detail: 'stack two-phase outlet to G/L separator + dryer' },
  { from_module: 'mass_fluid_transport_process', to_module: 'energy_storage_source', mechanism: 'fluid_routing', detail: 'dried H2 out 30-40 barg, -75 °C dew point' },
  // Thermal
  { from_module: 'energy_conversion_transduction', to_module: 'environmental_interface', mechanism: 'cooling_loop', detail: 'cooling-water 2500 LPM, 60-70 °C PEM' },
  // Control
  { from_module: 'control_compute_communication', to_module: 'energy_conversion_transduction', mechanism: 'modbus_tcp', detail: 'SIL-2 PLC + IEC 60870-5-104 SCADA' },
  { from_module: 'control_compute_communication', to_module: 'mass_fluid_transport_process', mechanism: 'modbus_tcp', detail: 'feed pump + PSA regen + N2 purge' },
  { from_module: 'control_compute_communication', to_module: 'sensing_instrumentation', mechanism: 'sensor_feedback', detail: 'per-cell V + crossover + dew point + dP' },
  // Safety
  { from_module: 'safety_protection', to_module: 'mass_fluid_transport_process', mechanism: 'safety_isolation', detail: 'SIL-2 isolation valves on LEL + crossover' },
  { from_module: 'safety_protection', to_module: 'sensing_instrumentation', mechanism: 'alarm_interlock', detail: 'ATEX H2 LEL + O2 vent + sump leak' },
  { from_module: 'safety_protection', to_module: 'energy_conversion_transduction', mechanism: 'safety_isolation', detail: 'earth-fault trip + PSV chain' },
  // Mechanical
  { from_module: 'energy_conversion_transduction', to_module: 'structure_containment', mechanism: 'mechanical_mount', detail: 'stack skid bolted in ATEX container' },
  { from_module: 'power_distribution', to_module: 'structure_containment', mechanism: 'cable_transit', detail: 'MV cable gland in non-ATEX rectifier room' },
]

const INSULIN_PUMP_SYNTHETIC: EmittedConnection[] = [
  // Insulin delivery path
  { from_module: 'mass_fluid_transport_process', to_module: 'actuation_kinematics', mechanism: 'fluid_routing', detail: 'reservoir → soft cannula via 35 psi pump' },
  { from_module: 'control_compute_communication', to_module: 'mass_fluid_transport_process', mechanism: 'contactor_command', detail: 'stepper drive 0.05 U pulses every 5 min' },
  { from_module: 'actuation_kinematics', to_module: 'environmental_interface', mechanism: 'mechanical_mount', detail: 'spring-loaded one-shot cannula insertion 4-7 mm SC' },
  // CGM data + Pod-PDM comms
  { from_module: 'sensing_instrumentation', to_module: 'control_compute_communication', mechanism: 'rf_path', detail: 'BLE 2.4 GHz CGM data feed every 5 min' },
  { from_module: 'control_compute_communication', to_module: 'hmi_ergonomics', mechanism: 'rf_path', detail: 'Pod ↔ PDM BLE for bolus + alarms' },
  { from_module: 'control_compute_communication', to_module: 'sensing_instrumentation', mechanism: 'sensor_feedback', detail: 'occlusion + reservoir + ambient sensors' },
  // Safety
  { from_module: 'safety_protection', to_module: 'mass_fluid_transport_process', mechanism: 'safety_isolation', detail: 'auto-suspend on occlusion / PLGS / watchdog' },
  { from_module: 'safety_protection', to_module: 'sensing_instrumentation', mechanism: 'alarm_interlock', detail: 'hypo/hyper threshold from CGM stream' },
  // Power + skin contact
  { from_module: 'energy_storage_source', to_module: 'control_compute_communication', mechanism: 'dc_busbar', detail: 'Pod primary battery + PDM Li-ion' },
  { from_module: 'structure_containment', to_module: 'environmental_interface', mechanism: 'mechanical_mount', detail: '3M medical adhesive 3-day wear (IP28)' },
  // HMI on PDM
  { from_module: 'control_compute_communication', to_module: 'sensing_instrumentation', mechanism: 'hmi_data', detail: 'PDM touchscreen — bolus calc + history' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadEmittedFromBessState(path: string): EmittedConnection[] {
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  const links = raw?.moduleDecomposition?.cross_module_grammar_links
  if (!Array.isArray(links)) {
    throw new Error(`state.json at ${path} has no moduleDecomposition.cross_module_grammar_links[]`)
  }
  return links.map((l: { from_module: string; to_module: string; mechanism: string; detail?: string }) => ({
    from_module: l.from_module,
    to_module: l.to_module,
    mechanism: l.mechanism,
    detail: l.detail,
  }))
}

function pct(num: number, denom: number): string {
  if (denom === 0) return 'n/a'
  return `${Math.round((num / denom) * 100)}%`
}

function reportResult(
  productClass: string,
  graph: ProductClassGraph,
  emitted: EmittedConnection[],
  result: GraphValidationResult,
): void {
  const s = result.summary
  console.log('')
  console.log('═══════════════════════════════════════════════════════════════════════')
  console.log(`▶ ${productClass} — ${graph.display_name}`)
  console.log('═══════════════════════════════════════════════════════════════════════')
  console.log(`  Graph: ${s.graph_node_count} nodes, ${s.graph_edge_count} edges (${s.graph_required_edge_count} required)`)
  console.log(`  Emitted: ${s.emitted_count} connections`)
  console.log('')
  console.log(`  ✓ MATCHED       : ${s.matched_count} / ${s.emitted_count}  (${pct(s.matched_count, s.emitted_count)})`)
  console.log(`  ✗ MISSING-REQ   : ${s.missing_required_count} / ${s.graph_required_edge_count} required graph edges absent  (${pct(s.missing_required_count, s.graph_required_edge_count)})`)
  console.log(`  ? EXTRA         : ${s.extra_count}  (emitted edges with no graph match — review)`)
  console.log(`  ! PROTOCOL-DIFF : ${result.protocol_mismatch.length}  (matched edges with protocol/mechanism delta)`)

  if (result.missing_required.length > 0) {
    console.log('')
    console.log('  --- MISSING REQUIRED EDGES ---')
    for (const e of result.missing_required) {
      const proto = e.protocol ?? e.mechanism ?? '?'
      console.log(`    ✗ ${e.from_class}  ↔ [${proto}]  ${e.to_class}`)
      if (e.notes) console.log(`         ${e.notes.slice(0, 110)}${e.notes.length > 110 ? '…' : ''}`)
    }
  }

  if (result.extra.length > 0) {
    console.log('')
    console.log('  --- EXTRA EMITTED EDGES (not in graph — review) ---')
    for (const e of result.extra) {
      const sig = e.protocol ?? e.mechanism ?? '?'
      console.log(`    ? ${e.from_module}  ↔ [${sig}]  ${e.to_module}${e.detail ? `   (${e.detail})` : ''}`)
    }
  }

  if (result.protocol_mismatch.length > 0) {
    console.log('')
    console.log('  --- PROTOCOL / MECHANISM DELTAS ---')
    for (const m of result.protocol_mismatch) {
      console.log(`    ! ${m.emitted.from_module} → ${m.emitted.to_module}: ${m.reason}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface TestCase {
  productClass: string
  emitted: EmittedConnection[]
  sourceLabel: string
}

async function main() {
  const args = process.argv.slice(2)
  const classArg = (() => {
    const i = args.indexOf('--class')
    return i >= 0 ? args[i + 1] : null
  })()
  const stateArg = (() => {
    const i = args.indexOf('--state')
    return i >= 0 ? args[i + 1] : null
  })()

  console.log('K10 Engineering Reference Graph — test harness')
  await ensureGraphsRegistered()
  console.log(`Registered classes: ${Object.keys(CLASS_REFERENCE_GRAPHS).join(', ')}`)

  // Build test cases.
  const cases: TestCase[] = []

  // BESS — use the real state.json if available.
  const bessStatePath = resolve(
    __dirname,
    '..',
    'radical-phase5-state-containerised_3_5_mwh_battery_energy_storage.json',
  )
  if (existsSync(bessStatePath)) {
    try {
      const emitted = loadEmittedFromBessState(bessStatePath)
      cases.push({
        productClass: 'bess-utility-scale',
        emitted,
        sourceLabel: `repo BESS state.json (${emitted.length} links)`,
      })
    } catch (err) {
      console.warn(`[warn] could not parse BESS state.json: ${err instanceof Error ? err.message : String(err)}`)
    }
  } else {
    console.warn(`[warn] BESS state.json not found at ${bessStatePath} — skipping`)
  }

  // Heat pump — synthetic
  cases.push({
    productClass: 'heat-pump-residential',
    emitted: HEAT_PUMP_RESIDENTIAL_SYNTHETIC,
    sourceLabel: 'synthetic (mirrors class-connections.ts prose prior)',
  })

  // VFD — synthetic
  cases.push({
    productClass: 'vfd-motor-drive',
    emitted: VFD_MOTOR_DRIVE_SYNTHETIC,
    sourceLabel: 'synthetic (mirrors class-connections.ts prose prior)',
  })

  // PV string inverter — synthetic (added 2026-05-18)
  cases.push({
    productClass: 'pv_string_inverter',
    emitted: PV_STRING_INVERTER_SYNTHETIC,
    sourceLabel: 'synthetic (derived from K10 graph edges)',
  })

  // Industrial robot arm — synthetic (added 2026-05-18)
  cases.push({
    productClass: 'industrial_robot_arm',
    emitted: INDUSTRIAL_ROBOT_ARM_SYNTHETIC,
    sourceLabel: 'synthetic (derived from K10 graph edges)',
  })

  // DC fast EV charger — synthetic (added 2026-05-18)
  cases.push({
    productClass: 'dc_fast_ev_charger',
    emitted: DC_FAST_EV_CHARGER_SYNTHETIC,
    sourceLabel: 'synthetic (derived from K10 graph edges)',
  })

  // Insulin pump — synthetic (added 2026-05-18)
  cases.push({
    productClass: 'insulin_pump',
    emitted: INSULIN_PUMP_SYNTHETIC,
    sourceLabel: 'synthetic (derived from K10 graph edges)',
  })

  // Fuel cell power module — synthetic (added 2026-05-18 in "3 classes to 10 coverage" dispatch)
  cases.push({
    productClass: 'fuel_cell_power_module',
    emitted: FUEL_CELL_POWER_MODULE_SYNTHETIC,
    sourceLabel: 'synthetic (derived from K10 graph edges)',
  })

  // Industrial 3D printer — synthetic (added 2026-05-18)
  cases.push({
    productClass: 'industrial_3d_printer',
    emitted: INDUSTRIAL_3D_PRINTER_SYNTHETIC,
    sourceLabel: 'synthetic (derived from K10 graph edges)',
  })

  // Hydrogen electrolyser — synthetic (added 2026-05-18)
  cases.push({
    productClass: 'hydrogen_electrolyser',
    emitted: HYDROGEN_ELECTROLYSER_SYNTHETIC,
    sourceLabel: 'synthetic (derived from K10 graph edges)',
  })

  // Heat pump commercial — synthetic (added 2026-05-18 in "10 → 15 coverage" dispatch)
  cases.push({
    productClass: 'heat-pump-commercial',
    emitted: HEAT_PUMP_COMMERCIAL_SYNTHETIC,
    sourceLabel: 'synthetic (derived from K10 graph edges)',
  })

  // PV module residential — synthetic (added 2026-05-18)
  cases.push({
    productClass: 'pv_module_residential',
    emitted: PV_MODULE_RESIDENTIAL_SYNTHETIC,
    sourceLabel: 'synthetic (derived from K10 graph edges)',
  })

  // Wind turbine small — synthetic (added 2026-05-18)
  cases.push({
    productClass: 'wind_turbine_small',
    emitted: WIND_TURBINE_SMALL_SYNTHETIC,
    sourceLabel: 'synthetic (derived from K10 graph edges)',
  })

  // AUV subsea — synthetic (added 2026-05-18)
  cases.push({
    productClass: 'auv-subsea',
    emitted: AUV_SUBSEA_SYNTHETIC,
    sourceLabel: 'synthetic (derived from K10 graph edges)',
  })

  // Vehicle battery pack — synthetic (added 2026-05-18)
  cases.push({
    productClass: 'vehicle_battery_pack',
    emitted: VEHICLE_BATTERY_PACK_SYNTHETIC,
    sourceLabel: 'synthetic (derived from K10 graph edges)',
  })

  // Bioreactor — synthetic (added 2026-05-18 in "B2: 15 → 20 coverage" dispatch)
  cases.push({
    productClass: 'bioreactor',
    emitted: BIOREACTOR_SYNTHETIC,
    sourceLabel: 'synthetic (derived from K10 graph edges)',
  })

  // Industrial inspection drone — synthetic (added 2026-05-18)
  cases.push({
    productClass: 'industrial_inspection_drone',
    emitted: INDUSTRIAL_INSPECTION_DRONE_SYNTHETIC,
    sourceLabel: 'synthetic (derived from K10 graph edges)',
  })

  // Automated guided vehicle (AGV / AMR) — synthetic (added 2026-05-18)
  cases.push({
    productClass: 'automated_guided_vehicle_agv',
    emitted: AUTOMATED_GUIDED_VEHICLE_AGV_SYNTHETIC,
    sourceLabel: 'synthetic (derived from K10 graph edges)',
  })

  // Industrial chiller — synthetic (added 2026-05-18)
  cases.push({
    productClass: 'chiller',
    emitted: CHILLER_SYNTHETIC,
    sourceLabel: 'synthetic (derived from K10 graph edges)',
  })

  // Distribution transformer — synthetic (added 2026-05-18)
  cases.push({
    productClass: 'distribution_transformer',
    emitted: DISTRIBUTION_TRANSFORMER_SYNTHETIC,
    sourceLabel: 'synthetic (derived from K10 graph edges)',
  })

  // CLI overrides
  let filtered = cases
  if (classArg) {
    filtered = filtered.filter(c => c.productClass === classArg)
    if (filtered.length === 0) {
      console.error(`No test case for class "${classArg}". Registered: ${Object.keys(CLASS_REFERENCE_GRAPHS).join(', ')}`)
      process.exit(2)
    }
  }
  if (stateArg && classArg) {
    if (!existsSync(stateArg)) {
      console.error(`--state file not found: ${stateArg}`)
      process.exit(2)
    }
    filtered[0].emitted = loadEmittedFromBessState(stateArg)
    filtered[0].sourceLabel = `--state ${stateArg}`
  }

  // Run.
  let totalMatched = 0
  let totalRequiredMissing = 0
  let totalExtra = 0
  for (const c of filtered) {
    const graph = getClassReferenceGraph(c.productClass)
    if (!graph) {
      console.error(`[skip] no graph for ${c.productClass}`)
      continue
    }
    console.log(`\n[${c.productClass}] source: ${c.sourceLabel}`)
    const result = validateConnectionsAgainstGraph(c.emitted, graph)
    reportResult(c.productClass, graph, c.emitted, result)
    totalMatched += result.summary.matched_count
    totalRequiredMissing += result.summary.missing_required_count
    totalExtra += result.summary.extra_count
  }

  console.log('')
  console.log('═══════════════════════════════════════════════════════════════════════')
  console.log('▶ ROLL-UP')
  console.log('═══════════════════════════════════════════════════════════════════════')
  console.log(`  Classes tested        : ${filtered.length}`)
  console.log(`  Matched edges (total) : ${totalMatched}`)
  console.log(`  Missing-required total: ${totalRequiredMissing}`)
  console.log(`  Extra emitted total   : ${totalExtra}`)
  console.log('')
  // Exit code reflects FAIL severity. 0 = no required gaps, 1 = at least one missing required.
  process.exit(totalRequiredMissing > 0 ? 1 : 0)
}

main().catch(err => {
  console.error(err)
  process.exit(2)
})
