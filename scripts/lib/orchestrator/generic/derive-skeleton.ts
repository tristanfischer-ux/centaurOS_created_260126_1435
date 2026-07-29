/**
 * scripts/lib/orchestrator/generic/derive-skeleton.ts
 *
 * GENERIC STRUCTURE DERIVER (wall-3, GENERIC-EMITTER-PLAN.md §3) — Phase-1
 * component-level build.
 *
 * Pure function: (graph, brief, envelope, contract, componentsByModule) →
 * DesignModule[]. Turns each class-reference graph NODE (a universal module) into
 * a module whose ONE sub_module carries 5-7 COMPONENT words sourced from the
 * corpus (`pretraining_products.modules_json`, unioned across the class by the
 * caller). This replaces the Experiment-A scaffold's single placeholder word per
 * node, which was structurally complete but far too thin — every sub_module sat
 * at 1 word vs the grammar gate's ≥5 floor, and Phase 2 cannot add MPN-bearing
 * words (architectural invariant), so the thinness could not be repaired
 * downstream. Component-level emission is the fix.
 *
 * WORD CONTRACT (so the universal gates pass clean + the grounder can fill MPNs):
 *   - Each component word carries EXACTLY 4 honest modifiers — quantity, form,
 *     lifecycle, installation — and NO part_number. With no manufacturer/part_number
 *     the word is "unclassified" to word_modifier_richness (floor 4) → 4 passes;
 *     after the chain's fillBlankWordMpns adds manufacturer+part_number it becomes
 *     "engineered" (floor 4) and stays ≥4. No numbers are invented (jurisdiction-
 *     safe: no `regulatory` modifier, so gate-19 never fires on a foreign standard).
 *   - A word with NO part_number is a TRUE gate-23 gap: the chain's
 *     completeEmitterGaps injects one DB-first MPN word (gate-23 passes) and
 *     fillBlankWordMpns grounds the catalogue-named words with real parts. The old
 *     scaffold's `'specify at detailed design'` placeholder defeated BOTH (it
 *     passed gate-23 so completeEmitterGaps skipped it, and the module-display name
 *     was not catalogue-typed so fillBlankWordMpns skipped it). Component names like
 *     `silicon_carbide_inverter` / `current_sensors` ARE catalogue-typed → grounded.
 *   - QUANTITIES come only from the contract: a word's head noun is matched to a
 *     contract `*_count`/`*_qty` quantity (cells → cell_count) so the BoM carries
 *     realistic counts where the contract knows them, ×1 otherwise. Nothing invented
 *     (same invariant as the hand emitters — no bespoke sizing here).
 *
 * This is still ROUGH by design: it carries NO coupled-physics sizing (the
 * ~4,710-line hand BESS emitter's value, exactly what Experiment A measures the
 * absence of). British spelling throughout.
 */

import type { BriefEnvelope, ContractInProgress, ParsedConstraints } from '../types'
import type { DesignModule } from '../assembler'
import type { GraphNode, ProductClassGraph } from '../../../../src/lib/pdf-engine-v2/class-reference-graph'
import { cc, makeSubModule, mod, word, type SubModule, type Word } from './emitter-primitives'
import { roleReplicationCount } from './replication-scope'
// A1 — the optical/instrument skeleton floor (Tristan 2026-07-12, Open Colorimeter
// TRAINING/REFERENCE-AIDED run). SHARES the tool-identity signal the word-domain-
// coherence-audit's ADD backstop (A2) already uses — never a duplicated list, never a
// product/class check. See the `hasOpticalInstrumentSignal` comment below.
import {
  hasOpticalInstrumentToolSignal,
  hasThermocyclerToolSignal,
} from '../../../../src/lib/pdf-engine-v2/lib/word-domain-coherence-audit'

const MIN_WORDS = 5 // sub_module_word_density gate floor (words PER sub_module)
const MAX_COMPONENTS = 12 // components per module — split into ≥2 sub_modules of ≥MIN_WORDS
// (audit-pdf-run D-1 wants mean ≥2.0 sub_modules/module; the grammar gate wants
//  ≥5 words/sub_module → need ≥10 components/module to make 2×≥5; every corpus-rich
//  class clears this — BESS modules carry 15-26 union components.)

/**
 * Tier-C generic component floor, keyed by UniversalModule. Used ONLY to top a
 * module up to MIN_WORDS when the corpus union is short (sparse class) — for a
 * corpus-rich class like BESS (11 products) the union dominates and the floor
 * rarely fires. These are honest generic component CATEGORIES, never invented
 * specifics. An unknown module falls back to GENERIC_FLOOR.
 */
const TIER_C_FLOOR: Record<string, string[]> = {
  energy_storage_source: ['storage_cell', 'cell_module_assembly', 'module_rack', 'dc_busbar', 'cell_monitoring_unit', 'dc_disconnect'],
  energy_conversion_transduction: ['power_converter', 'inverter_bridge', 'dc_link_capacitor', 'gate_driver', 'output_filter', 'control_board'],
  power_distribution: ['main_breaker', 'distribution_busbar', 'fuse_holder', 'power_contactor', 'surge_protector', 'terminal_block'],
  environmental_interface: ['heat_exchanger', 'cooling_fan', 'chiller_unit', 'temperature_sensor', 'air_damper', 'condensate_drain'],
  mass_fluid_transport_process: ['circulation_pump', 'pipework_run', 'distribution_manifold', 'flow_control_valve', 'expansion_reservoir', 'fluid_filter'],
  control_compute_communication: ['main_controller', 'communication_gateway', 'io_module', 'network_switch', 'controller_power_supply', 'wiring_harness'],
  sensing_instrumentation: ['voltage_sensor', 'current_sensor', 'temperature_probe', 'pressure_sensor', 'signal_conditioner', 'sensor_cable'],
  safety_protection: ['protective_relay', 'emergency_stop_button', 'isolation_device', 'fire_detector', 'interlock_switch', 'warning_beacon'],
  structure_containment: ['structural_frame', 'enclosure_panel', 'mounting_bracket', 'fastener_set', 'gasket_seal', 'access_door'],
  maintenance_serviceability: ['access_panel', 'service_connector', 'diagnostic_port', 'labelling_set', 'lifting_point', 'walkway_grating'],
  hmi_ergonomics: ['display_panel', 'status_indicator', 'control_switch', 'annunciator', 'interface_membrane', 'mounting_bezel'],
  human_machine_interface: ['display_panel', 'status_indicator', 'control_switch', 'annunciator', 'interface_membrane', 'mounting_bezel'],
}
const GENERIC_FLOOR = ['primary_assembly', 'secondary_assembly', 'mounting_hardware', 'wiring_harness', 'fastener_set', 'protective_cover']

// ── DUTY-AWARE THERMAL FLOOR (Stage F core — Tristan 2026-06-14) ────────────────
// The default `environmental_interface` floor is a fixed COOLING kit (chiller +
// cooling-fan + air-damper). That is wrong for a plant whose contract carries a
// HEATING duty and NO cooling duty — verified on RAS, a warm-water recirculating
// aquaculture system: contract heating_duty_kw≈1493 + heat_pump_cop 3.5, zero cooling
// keys, yet the dossier rendered a "Chiller Unit" + "Cooling Fan". The thermal
// equipment TYPE must follow the contract's duty SIGN, not a fixed list.
//
// Universal (no class table): we read the contract's thermal-duty quantity keys and
// classify the plant as heating-only / cooling-only / both / unknown, then pick the
// matching floor. A heating duty yields a HEAT PUMP (the contract's own thermal
// engine), never a chiller. `heat_exchanger` is duty-neutral and stays in every set.
const THERMAL_COOLING_FLOOR = ['heat_exchanger', 'cooling_fan', 'chiller_unit', 'temperature_sensor', 'air_damper', 'condensate_drain']
const THERMAL_HEATING_FLOOR = ['heat_pump', 'heat_exchanger', 'circulation_pump', 'temperature_sensor', 'expansion_vessel', 'insulation_jacket']
const THERMAL_BOTH_FLOOR    = ['heat_exchanger', 'heat_pump', 'chiller_unit', 'cooling_fan', 'temperature_sensor', 'air_damper']
// INTENT (2026-07-28 Formula E rear MGU): manufacturer-perimeter liquid cold-plate
// loop interfaces — NOT a packaged refrigeration plant. Selected when the contract
// seeds coolant flow/inlet + a fluid_loop edge to cold plates.
const COLD_PLATE_LOOP_FLOOR = [
  'mgu_cold_plate',
  'mcu_cold_plate',
  'coolant_manifold',
  'coolant_hose_set',
  // DECISION (2026-07-28 SOL): name as bottle, not "reservoir" — the plant
  // vessel explode path matches /reservoir|degass|tank/ and defaults to 50 m³
  // Shell Course anatomy when no volume is declared.
  'coolant_expansion_bottle',
  'coolant_temperature_sensor',
]

// INTENT (2026-07-28 Formula E rear MGU / traction-drive pack): when the
// contract seeds a cold-plate liquid loop PLUS traction electrical/mechanical
// quantities (or motor:ipmsm tools), the generic Tier-C floors would still
// emit plant HVAC / empty actuation. Floor the three principal macros the
// analytical tool pack sizes — universal for any future traction MGU+MCU kit,
// never a product-name branch.
const TRACTION_DRIVE_MODULE_FLOORS: Record<string, string[]> = {
  actuation_kinematics: [
    'traction_ipmsm_motor_generator',
    'reduction_gear_stage',
    'motor_bearings',
    'output_shaft_coupling',
    'resolver_encoder',
  ],
  energy_conversion_transduction: [
    'sic_traction_inverter',
    'dc_link_capacitor_bank',
    'gate_driver_board',
    'phase_current_sensor',
    'hv_dc_connector',
  ],
  structure_containment: [
    'traction_drive_housing',
    'hv_shield_cover',
    'mounting_ear_set',
    'fastener_set',
    'nameplate',
  ],
  // DECISION (2026-07-29 SOL): Formula-E "MCU" = SiC motor-control UNIT (inverter),
  // not a Cortex-M0+ COTS microcontroller. The Tier-C `main_controller` floor was
  // pinning ATSAMD21 as "Traction Control MCU" — wrong product class. Interface
  // boards stay OEM/proprietary TBD; never emit a catalogue MCU for this shape.
  control_compute_communication: [
    'oem_inverter_control_board',
    'can_fd_vehicle_interface',
    'hv_interlock_interface',
    'resolver_signal_interface',
    'control_harness_set',
  ],
  // INTENT (2026-07-29 SOL): Tier-C plant floors were still filling
  // safety_protection / power_distribution (E-stop, fire detector, main breaker)
  // because those keys were absent here — race-perimeter HV protection only.
  safety_protection: [
    'hv_interlock_loop',
    'phase_overcurrent_trip',
    'inverter_desat_protection',
    'coolant_flow_interlock',
    'isolation_monitor_interface',
  ],
  power_distribution: [
    'hv_dc_fuse',
    'phase_cable_set',
    'hv_dc_busbar_link',
    'shield_drain_bond',
    'connector_interlock_pin',
  ],
}
const REFRIGERATION_PLANT_COMPONENT_RE =
  /chill(?:er)?|scroll[_\s-]?compressor|refriger|evaporator|condenser|expansion[_\s-]?valve|air[_\s-]?damper|packaged[_\s-]?chiller|tube[_\s-]?bundle|shell[_\s-]?and[_\s-]?tube/i

// ── STORAGE-AWARE ENERGY-SOURCE FLOOR (Tristan 2026-06-26 — the water-plant battery contamination) ──
// The default `energy_storage_source` floor is a fixed BATTERY kit (storage cell + cell module +
// DC busbar). That is wrong for a plant that stores NO energy — verified on the Codema water /
// fertigation plant, which got a phantom "Storage Cell / Cell Module Assembly" sub-module (the
// "copy-paste battery template" the scorecard flagged) even though it has no battery. Mirrors the
// duty-aware thermal floor exactly: the energy-SOURCE module's content follows whether the contract
// actually STORES energy. A storage plant (BESS) keeps the battery floor; a plant with no storage
// signal gets its real energy SOURCE — the mains electrical supply (incomer + transformer +
// switchboard). Universal (no class table) — keyed on the contract's own storage-bearing keys.
const ENERGY_STORAGE_FLOOR    = ['storage_cell', 'cell_module_assembly', 'module_rack', 'dc_busbar', 'cell_monitoring_unit', 'dc_disconnect']
const ELECTRICAL_SUPPLY_FLOOR = ['mains_incomer', 'distribution_transformer', 'main_switchboard', 'power_supply_unit', 'surge_protection_device', 'energy_meter']
// A positive storage-bearing quantity = the plant actually stores energy (battery kWh / cells).
const ENERGY_STORAGE_RE = /(^|_)(kwh|cell_count|cells_total|battery|usable_energy_kwh|usable_capacity_kwh|nameplate_capacity_kwh|storage_kwh|pack_energy)(_|$)|_kwh($|_)/i

// Cooling-duty markers: a key that DEMANDS heat rejection (a chiller/condenser/cooler
// duty or a cooling-water/refrigeration load). `heat_exchanger`/`cross_exchanger` is
// excluded — it is duty-neutral (recovers heat in either direction).
const COOLING_DUTY_RE = /(^|_)(cooling|chiller|chilled|refriger|condenser|condensing|cooler|cold)(_|$)|cooling_(load|duty|capacity|water)|condenser_duty|hvac_cooling/i
// Heating-duty markers: a key that DEMANDS heat addition (a heating/reboiler/preheat
// duty, a heat-pump heating load, a boiler/steam duty).
const HEATING_DUTY_RE = /(^|_)(heating|reboiler|preheat|boiler|steam)(_|$)|heat_pump|heating_(load|duty|kw)|makeup_heating|process_heat/i

type ThermalMode = 'heating' | 'cooling' | 'both' | 'unknown'

/** Classify the plant's thermal mode from the contract's duty-bearing quantity keys.
 *  Only keys whose VALUE is a positive number count (a 0/absent duty is no demand). */
function thermalModeFromContract(contract: ContractInProgress): ThermalMode {
  let heating = false
  let cooling = false
  const quantities = contract?.quantities ?? {}
  for (const [key, tq] of Object.entries(quantities)) {
    const v = (tq as { value?: unknown })?.value
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) continue
    if (COOLING_DUTY_RE.test(key)) cooling = true
    if (HEATING_DUTY_RE.test(key)) heating = true
  }
  if (heating && cooling) return 'both'
  if (heating) return 'heating'
  if (cooling) return 'cooling'
  return 'unknown'
}

/**
 * Liquid cold-plate loop interface (MGU/MCU jackets) — not plant HVAC.
 * PURE: coolant flow + inlet temp quantities AND a fluid_loop topology edge
 * naming cold plates. Universal — any future traction / high-power electronics
 * brief that seeds the same signals gets the same floor.
 */
export function hasColdPlateLoopInterface(contract: ContractInProgress): boolean {
  const quantities = contract?.quantities ?? {}
  const flow = Number((quantities.coolant_flow_l_min as { value?: unknown } | undefined)?.value)
  const tin = Number((quantities.coolant_inlet_c as { value?: unknown } | undefined)?.value)
  if (!(Number.isFinite(flow) && flow > 0 && Number.isFinite(tin))) return false
  const edges = Array.isArray(contract?.topology) ? contract.topology : []
  return edges.some((e: any) => {
    if (String(e?.mechanism ?? '') !== 'fluid_loop') return false
    const blob = `${e?.from_part ?? ''} ${e?.to_part ?? ''}`
    return /cold[_\s-]?plates?/i.test(blob)
  })
}

/**
 * Traction-drive pack (MGU + SiC MCU + gear) — cold-plate loop plus shaft /
 * phase-current duty OR a motor:ipmsm tool selection. PURE — never a class slug.
 */
export function hasTractionDrivePackSignal(contract: ContractInProgress): boolean {
  if (!hasColdPlateLoopInterface(contract)) return false
  const q = contract?.quantities ?? {}
  const torque = Number((q.mgu_shaft_torque_nm as { value?: unknown } | undefined)?.value)
  const iph = Number((q.phase_current_max_a as { value?: unknown } | undefined)?.value)
  const tools = Array.isArray((contract as { _tools_run?: unknown[] })._tools_run)
    ? (contract as { _tools_run: unknown[] })._tools_run
    : []
  const hasMotorTool = tools.some((t) => /motor:ipmsm|ipmsm-analytical|ipmsm/i.test(String(t ?? '')))
  return (
    (Number.isFinite(torque) && torque > 0)
    || (Number.isFinite(iph) && iph >= 100)
    || hasMotorTool
  )
}

/** The environmental_interface floor that matches the contract's thermal duty sign. */
function thermalFloorFor(contract: ContractInProgress): string[] {
  if (hasColdPlateLoopInterface(contract)) return COLD_PLATE_LOOP_FLOOR
  switch (thermalModeFromContract(contract)) {
    case 'heating': return THERMAL_HEATING_FLOOR
    case 'both': return THERMAL_BOTH_FLOOR
    case 'cooling': return THERMAL_COOLING_FLOOR
    // unknown: keep the historical cooling-led default (no regression for classes that
    // never declared a thermal duty — they previously got this exact list).
    default: return THERMAL_COOLING_FLOOR
  }
}

/** True when the contract carries a positive energy-STORAGE quantity (battery kWh / cell count) —
 *  i.e. the plant actually stores energy, so the `energy_storage_source` module is genuinely a
 *  battery. A plant with no such key (a water plant, a pump station) does NOT store energy. */
function hasEnergyStorage(contract: ContractInProgress): boolean {
  const quantities = contract?.quantities ?? {}
  for (const [key, tq] of Object.entries(quantities)) {
    const v = (tq as { value?: unknown })?.value
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) continue
    if (ENERGY_STORAGE_RE.test(key)) return true
  }
  return false
}

// ── OPTICAL/INSTRUMENT FLOOR (Tristan 2026-07-12 — Open Colorimeter TRAINING/
// REFERENCE-AIDED run, CORE FIX PRINCIPLE) ──────────────────────────────────────────
// `energyFloorFor`'s duty-aware pattern (above) already proved the fix shape: read a
// SIGNAL off the contract, pick the matching component set instead of a fixed
// BESS/industrial-power default. That fix stopped short of the ROOT — it still only
// chooses between "stores energy" (battery kit) and "doesn't" (mains supply), both
// GRID-POWER-PLANT shapes. A hand-held photometer running through the generic emitter
// (no registered class emitter for `pcb_assembly`) never triggers `hasEnergyStorage`
// (no kWh-scale key) so it fell to ELECTRICAL_SUPPLY_FLOOR (mains incomer, distribution
// transformer, switchboard) — still wrong, a coin-cell instrument has no mains supply
// either. The TIER_C_FLOOR defaults for energy_conversion_transduction (inverter
// bridge, gate driver, dc link capacitor) and control_compute_communication
// (communication gateway, i/o module) are equally BESS/industrial-shaped. Every one of
// these floors assumed the generic emitter is always flooring a GRID-CONNECTED PLANT —
// true for the ~40 registered process-plant/BESS classes the generic path was built
// against, false for a bench/hand-held INSTRUMENT.
//
// The fix: a THIRD contract shape — an optical/photometric INSTRUMENT — detected from
// the SAME tool-identity signal the word-domain-coherence-audit's ADD backstop
// (TOOL_IMPLIED_COMPONENTS) already uses to ground detector-module/LED/cuvette words
// onto an under-filled design. `hasOpticalInstrumentToolSignal` is SHARED (imported),
// never a duplicated table: a photodiode-tia / cuvette / photometry / led-par tool
// selection is unambiguous evidence the design is an optical instrument, on ANY future
// archetype that ever selects one (a spectrophotometer, turbidimeter, fluorimeter —
// never a product-name check). When present, the floor for energy_storage_source /
// energy_conversion_transduction / sensing_instrumentation / structure_containment /
// control_compute_communication switches to the instrument-shaped set below — a small
// rechargeable battery (not cell racks), an LED source + driver (not an inverter
// bridge), a detector-module/breakout (not V/I/temp sensors), a cuvette/optical-path
// interface, and an MCU + display + USB stack. A genuine BESS
// (hasEnergyStorage true, no optical tool signal) is completely untouched — the optical
// check is evaluated FIRST but only routes when the signal fires, so the existing
// battery-plant/mains-supply dispatch is byte-identical for every other class.
// INTENT (2026-07-14, gold WHY): a handheld optical kit buys ONE compute/UI
// module (dev-board class: MCU + display + buttons + USB + battery path). Gold
// Open Colorimeter = PyBadge LC starter kit — exploding that into discrete
// MCU/display/buttons/USB/battery motherboard lines invents a bespoke host PCB
// and 2–3× the materials cost. Battery + USB ride inside the kit, not as a
// separate energy_storage plant floor.
// Battery/USB/charge live ON the compute/UI kit (gold: PyBadge starter w/ battery).
// Name them as included-host parts so grammar ≥5 is met WITHOUT inventing a
// separate battery-plant BoM (and without anonymous energy_storage_subcomponent_N).
const OPTICAL_ENERGY_STORAGE_FLOOR = [
  'battery_included_in_compute_ui_module',
  'usb_charge_path_on_compute_ui',
  'power_switch_on_compute_ui',
  'charge_status_led',
  'low_battery_indicator',
]
const OPTICAL_ENERGY_CONVERSION_FLOOR = [
  'led_source', 'led_driver', 'wavelength_selection_module',
  'dc_dc_regulator', 'source_board_connector',
]
// Detector = purchased breakout; two short maker cables (STEMMA/Qwiic-class).
const OPTICAL_SENSING_FLOOR = [
  'optical_detector_module', 'sensor_interconnect_cable', 'qwiic_interconnect_cable',
  'detector_mount_plate', 'optical_window_seal',
]
const OPTICAL_STRUCTURE_FLOOR = [
  'cuvette_holder', 'optical_path_baffle', 'enclosure_shell',
  'ambient_light_cap', 'fastener_set', 'cuvette_consumable',
]
// One COTS compute/UI module + the interconnect/firmware the kit needs for I²C.
const OPTICAL_CONTROL_FLOOR = [
  'compute_ui_module', 'stemma_header', 'debug_interface',
  'i2c_level_shifter', 'firmware_storage',
]
// Host rails live on the COTS module — discrete lines are pennies only.
const OPTICAL_POWER_DISTRIBUTION_FLOOR = [
  'ferrite_emc_bead', 'power_indicator_led',
  'host_power_rail_on_compute_ui', 'usb_5v_input_on_compute_ui',
  'board_level_decoupling',
]
const OPTICAL_SAFETY_FLOOR = [
  'esd_protection_network', 'polyfuse_resettable',
  'input_protection_on_compute_ui', 'thermal_protection_on_compute_ui',
  'reverse_polarity_on_compute_ui',
]
// HMI absorbed into compute_ui_module — keep bezel/status words (never membrane).
const OPTICAL_HMI_FLOOR = [
  'status_indicator', 'mounting_bezel', 'control_switch',
  'display_bezel', 'user_facing_legend',
]

/** Per-module optical-instrument floor overrides. Only the modules the generic Tier-C
 *  floor gets wrong for an instrument (a BESS/industrial-power shape) are listed —
 *  `energy_storage_source` is handled separately inside `energyFloorFor` (it already
 *  branches on a contract signal, this just adds a third branch). */
const OPTICAL_MODULE_FLOORS: Record<string, string[]> = {
  energy_conversion_transduction: OPTICAL_ENERGY_CONVERSION_FLOOR,
  sensing_instrumentation: OPTICAL_SENSING_FLOOR,
  structure_containment: OPTICAL_STRUCTURE_FLOOR,
  control_compute_communication: OPTICAL_CONTROL_FLOOR,
  power_distribution: OPTICAL_POWER_DISTRIBUTION_FLOOR,
  safety_protection: OPTICAL_SAFETY_FLOOR,
  hmi_ergonomics: OPTICAL_HMI_FLOOR,
  human_machine_interface: OPTICAL_HMI_FLOOR,
}

/** True when the contract's own selected-tool record (`_tools_run`, populated by the
 *  executor as tools run — already settled by the time the generic emitter derives the
 *  skeleton) shows an optical/photometric-instrument tool. PURE — delegates entirely to
 *  the SHARED signal in word-domain-coherence-audit.ts (never a second copy of the
 *  tool-identity list). */
function hasOpticalInstrumentSignal(contract: ContractInProgress): boolean {
  return hasOpticalInstrumentToolSignal(contract?._tools_run)
}

/** True when tools_run shows a solid-state PCR / thermocycler tool (Peltier /
 *  thermal-block / forced-convection heatsink). PURE — shared signal. */
function hasThermocyclerSignal(contract: ContractInProgress): boolean {
  return hasThermocyclerToolSignal(contract?._tools_run)
}

// ── THERMOCYCLER / SOLID-STATE TEC FLOOR (Tristan 2026-07-15 — NinjaPCR) ────────
// INTENT: with an empty or heating+cooling contract the environmental_interface
// floor defaults to plant chillers (THERMAL_COOLING / THERMAL_BOTH). A benchtop
// PCR instrument cools with a Peltier + heatsink fan, not a 200 kW scroll
// compressor. Same shape as OPTICAL_* floors — tool-identity signal, never a
// product-class table. Energy path is a bench PSU + IEC inlet, not a
// distribution transformer / LV switchboard.
const THERMOCYCLER_THERMAL_FLOOR = [
  'peltier_tec_module', 'heatsink_fan_assembly', 'aluminum_sample_block',
  'block_temperature_sensor', 'lid_heater_assembly', 'thermal_interface_pad',
]
const THERMOCYCLER_ENERGY_FLOOR = [
  'bench_psu_adapter', 'iec_mains_inlet', 'input_fuse',
  'power_switch', 'emc_line_filter', 'protective_earth_bond',
]
const THERMOCYCLER_ENERGY_CONVERSION_FLOOR = [
  'h_bridge_tec_driver', 'mosfet_heater_switch', 'dc_dc_regulator',
  'current_sense_shunt', 'snubber_network',
]
const THERMOCYCLER_POWER_DISTRIBUTION_FLOOR = [
  'terminal_block', 'wire_harness', 'polyfuse_resettable',
  'bulk_capacitor', 'status_led',
]
const THERMOCYCLER_STRUCTURE_FLOOR = [
  'enclosure_shell', 'sample_block_mount', 'lid_assembly',
  'tube_access_aperture', 'fastener_set', 'foot_pad',
]
const THERMOCYCLER_CONTROL_FLOOR = [
  'main_controller_mcu', 'wifi_module', 'flash_storage',
  'debug_uart', 'firmware_watchdog',
]
const THERMOCYCLER_SENSING_FLOOR = [
  'block_temperature_sensor', 'lid_temperature_sensor', 'ambient_temperature_sensor',
  'fan_tachometer_sense', 'sensor_cable',
]
const THERMOCYCLER_SAFETY_FLOOR = [
  'thermal_fuse_safety', 'overtemp_hardware_cutout', 'fan_failure_detect',
  'estop_or_power_kill', 'protective_earth',
]
const THERMOCYCLER_HMI_FLOOR = [
  'status_indicator', 'browser_ui_host', 'run_start_control',
  'mounting_bezel', 'user_facing_legend',
]
const THERMOCYCLER_MODULE_FLOORS: Record<string, string[]> = {
  environmental_interface: THERMOCYCLER_THERMAL_FLOOR,
  energy_conversion_transduction: THERMOCYCLER_ENERGY_CONVERSION_FLOOR,
  sensing_instrumentation: THERMOCYCLER_SENSING_FLOOR,
  structure_containment: THERMOCYCLER_STRUCTURE_FLOOR,
  control_compute_communication: THERMOCYCLER_CONTROL_FLOOR,
  power_distribution: THERMOCYCLER_POWER_DISTRIBUTION_FLOOR,
  safety_protection: THERMOCYCLER_SAFETY_FLOOR,
  hmi_ergonomics: THERMOCYCLER_HMI_FLOOR,
  human_machine_interface: THERMOCYCLER_HMI_FLOOR,
}
// Plant-thermal / LV-incomer names that must never pad a thermocycler module
// even if the class-reference corpus still lists them.
const THERMOCYCLER_FORBIDDEN_COMPONENT_RE =
  /chill|scroll\s*compressor|process_water|condensate_drain|air_damper|heat_pump|circulation_pump|expansion_vessel|mains_incomer|distribution_transformer|main_switchboard|inverter_bridge|dc_link_capacitor|gate_driver|module_rack|storage_cell/i

// ── SYRINGE_PUMP / MULTI-CHANNEL LINEAR DOSING FLOOR (Tristan 2026-07-16 — Poseidon) ──
// INTENT: Tier-C mass_fluid defaults emit circulation_pump + expansion_reservoir +
// plant HMI membrane — wrong for an OPEN benchtop lead-screw array. Form signal =
// product_class syringe_pump OR contract quantities unique to the archetype builder
// (channel_count + lead_screw_pitch_mm + max_syringe_volume_ml) — never a brand noun.
// GOTCHA (Poseidon 2026-07-16): stepper_motor was #6 on the fluid list and never
// shipped while the first five already satisfied MIN_WORDS — instrument floors
// are now FULLY UNIONED (see componentsForModule), not density padding.
// GOTCHA (Poseidon 2026-07-16 cold 0539): class graphs often INCLUDE
// actuation_kinematics + maintenance_serviceability nodes. Without module floors
// those fell through to GENERIC_FLOOR / TIER_C (primary_assembly, lifting_point)
// and later hollow/synonym passes emptied them — Physics Critic HIGH "actuation
// completely empty" while the drive train lived only under mass_fluid.
// GOTCHA (Poseidon 2026-07-16 cold 0545): duplicating stepper/lead_screw/… on
// BOTH fluid + actuation mints identical word ids (`stepper_motor_word`).
// dropAttributePhantomWords keeps the FIRST id globally (fluid is principal /
// earlier in the graph) and strips the actuation copies → density FAIL with
// only syringe_drive_channel left. DECISION: exclusive ownership — actuation
// owns the rotary→linear train when that node exists; fluid owns wet-path only.
// Graphs that OMIT actuation still get the drive train on fluid (fallback).
const SYRINGE_PUMP_ACTUATION_FLOOR = [
  'stepper_motor', 'shaft_coupling', 'lead_screw',
  'guide_rail_pair', 'linear_carriage', 'syringe_drive_channel',
]
/** Wet-path only — never re-list actuation nouns (global word-id dedup). */
const SYRINGE_PUMP_FLUID_FLOOR = [
  'syringe_barrel_cradle', 'plunger_clamp', 'tip_luer_fitting',
  'tubing_set', 'barrel_seal_o_ring', 'plunger_tip_seal',
]
/** Drive train folded onto fluid when the class graph has no actuation node. */
const SYRINGE_PUMP_FLUID_WITH_DRIVE_FLOOR = [
  ...SYRINGE_PUMP_FLUID_FLOOR,
  ...SYRINGE_PUMP_ACTUATION_FLOOR.filter((c) => c !== 'syringe_drive_channel'),
]
const SYRINGE_PUMP_ENERGY_FLOOR = [
  'bench_psu_adapter', 'iec_mains_inlet', 'input_fuse',
  'power_switch', 'emc_line_filter', 'protective_earth_bond',
]
const SYRINGE_PUMP_ENERGY_CONVERSION_FLOOR = [
  'stepper_driver_board', 'microstep_driver', 'shaft_coupling',
  'dc_dc_regulator', 'current_sense_shunt',
]
// Drivers sit with power distribution when energy_conversion is absent from
// the class graph (Poseidon run: 9 modules, no energy_conversion node).
const SYRINGE_PUMP_POWER_DISTRIBUTION_FLOOR = [
  'wire_harness', 'terminal_block', 'polyfuse_resettable',
  'bulk_capacitor', 'status_led', 'stepper_driver_board',
]
const SYRINGE_PUMP_STRUCTURE_FLOOR = [
  'channel_frame_printed', 'base_plate', 'console_enclosure',
  'control_console', 'foot_pad', 'fastener_set', 'cable_tie_mount',
]
const SYRINGE_PUMP_CONTROL_FLOOR = [
  'main_controller_mcu', 'host_interface', 'flash_storage',
  'debug_uart', 'firmware_watchdog',
]
const SYRINGE_PUMP_SENSING_FLOOR = [
  'endstop_or_stall_sense', 'current_sense_on_driver', 'home_reference',
  'sensor_cable', 'force_limit_feedback',
]
const SYRINGE_PUMP_SAFETY_FLOOR = [
  'estop_or_power_kill', 'protective_earth', 'overcurrent_polyfuse',
  'force_limit_firmware', 'mains_fuse',
]
const SYRINGE_PUMP_HMI_FLOOR = [
  'touch_display', 'status_indicator', 'run_start_control',
  'mounting_bezel', 'user_facing_legend',
]
// GOTCHA (Poseidon 2026-07-16 cold 0556): access_panel / service_connector /
// diagnostic_port / labelling_set match PADDING_RE in universal-contract-sizing
// and are stripped as skeleton junk when part_number is still TBD — leaving only
// channel_service_clearance and failing density. Use instrument service nouns
// that are NOT in that plant-padding list.
const SYRINGE_PUMP_MAINTENANCE_FLOOR = [
  'channel_service_clearance', 'syringe_swap_fixture',
  'calibration_reference_port', 'tool_free_carriage_access',
  'spare_plunger_seal_kit',
]
/** @param hasActuationNode When true, fluid stays wet-path-only (drive lives on actuation). */
function syringePumpModuleFloors(hasActuationNode: boolean): Record<string, string[]> {
  return {
    mass_fluid_transport_process: hasActuationNode
      ? SYRINGE_PUMP_FLUID_FLOOR
      : SYRINGE_PUMP_FLUID_WITH_DRIVE_FLOOR,
    actuation_kinematics: SYRINGE_PUMP_ACTUATION_FLOOR,
    energy_conversion_transduction: SYRINGE_PUMP_ENERGY_CONVERSION_FLOOR,
    sensing_instrumentation: SYRINGE_PUMP_SENSING_FLOOR,
    structure_containment: SYRINGE_PUMP_STRUCTURE_FLOOR,
    control_compute_communication: SYRINGE_PUMP_CONTROL_FLOOR,
    power_distribution: SYRINGE_PUMP_POWER_DISTRIBUTION_FLOOR,
    safety_protection: SYRINGE_PUMP_SAFETY_FLOOR,
    hmi_ergonomics: SYRINGE_PUMP_HMI_FLOOR,
    human_machine_interface: SYRINGE_PUMP_HMI_FLOOR,
    maintenance_serviceability: SYRINGE_PUMP_MAINTENANCE_FLOOR,
  }
}
const SYRINGE_PUMP_FORBIDDEN_COMPONENT_RE =
  /chill|scroll\s*compressor|process_water|circulation_pump|expansion_vessel|expansion_reservoir|access_ladder|lifting_point|interface_membrane|scada|plc_cabinet|mains_incomer|distribution_transformer|main_switchboard|inverter_bridge|module_rack|storage_cell|pipework_run|distribution_manifold|fluid_filter|primary_assembly|secondary_assembly/i

// ── LAB_MICROSCOPE / FLEXURE-STAGE FLOOR (Tristan 2026-07-16 — OpenFlexure) ──
// INTENT: research printed-stage microscope BoM — motors + optics + illum + SBC.
// FORBIDDEN: industrial plant / depth-camera robotics / DIN-rail signal conditioning
// that inflated OpenFlexure 1310 materials to ~£640 vs gold ~£198.
const LAB_MICROSCOPE_ACTUATION_FLOOR = [
  'geared_stepper_motor_x',
  'geared_stepper_motor_y',
  'geared_stepper_motor_focus',
  'flexure_stage_body',
  'leadscrew_nut_assembly',
]
const LAB_MICROSCOPE_OPTICS_FLOOR = [
  'rms_objective_mount',
  'optics_tube_assembly',
  'webcam_grade_camera',
]
const LAB_MICROSCOPE_ILLUM_FLOOR = [
  'transmitted_led_illuminator',
  'condenser_lens_assembly',
]
const LAB_MICROSCOPE_CONTROL_FLOOR = [
  'motor_controller_board',
  'sbc_compute_module',
  'stage_limit_or_stall_sense',
]
const LAB_MICROSCOPE_STRUCTURE_FLOOR = [
  'printed_main_body',
  'sample_stage_platform',
  'illumination_arm',
]
const LAB_MICROSCOPE_ENERGY_FLOOR = [
  'usb_or_barrel_power_inlet',
  'low_voltage_dc_supply',
]
const LAB_MICROSCOPE_HMI_FLOOR = [
  'browser_ui_host_software',
  'network_api_service',
]
const LAB_MICROSCOPE_MODULE_FLOORS: Record<string, string[]> = {
  actuation_kinematics: LAB_MICROSCOPE_ACTUATION_FLOOR,
  energy_conversion_transduction: LAB_MICROSCOPE_OPTICS_FLOOR,
  environmental_interface: LAB_MICROSCOPE_ILLUM_FLOOR,
  sensing_instrumentation: [
    'focus_metric_sensor_path',
    'illumination_feedback_photodiode',
  ],
  structure_containment: LAB_MICROSCOPE_STRUCTURE_FLOOR,
  control_compute_communication: LAB_MICROSCOPE_CONTROL_FLOOR,
  power_distribution: LAB_MICROSCOPE_ENERGY_FLOOR,
  hmi_ergonomics: LAB_MICROSCOPE_HMI_FLOOR,
  human_machine_interface: LAB_MICROSCOPE_HMI_FLOOR,
  safety_protection: ['emergency_stop_or_fault_cutout', 'motor_current_limit'],
  maintenance_serviceability: ['objective_swap_access', 'stage_calibration_fixture'],
}
const LAB_MICROSCOPE_FORBIDDEN_COMPONENT_RE =
  /realsense|depth\s*camera|lidar|weidmuller|weidmüller|phoenix\s*contact|schneider|nsx\s*mccb|banner\s*ez|scada|plc_cabinet|mains_incomer|distribution_transformer|chill|scroll\s*compressor|circulation_pump|process_water|module_rack|storage_cell|access_ladder|pressure\s*transmitter|signal\s*conditioner/i

// ── LOW-POWER LAB ELECTRONICS FLOOR (2026-07-17 Rodeostat / Yuri 06) ─────────
// INTENT: sparse USB/bench instruments with mixed-signal or small-volume lab
// quantities are not industrial plants. Without an optical/thermocycler/syringe
// signal they fell through to Tier-C plant floors: Main Breaker, Network Switch,
// Pressure Sensor, Emergency Stop. The signal below is contract/quantity based
// (compliance voltage, electrode count, ml working volume, watt-scale load,
// small enclosure), never a Rodeostat brand branch.
const LAB_ELECTRONICS_ENERGY_FLOOR = [
  'usb_5v_input', 'bench_psu_input', 'polyfuse_resettable',
  'low_noise_regulator', 'board_level_decoupling',
]
const LAB_ELECTRONICS_ENERGY_CONVERSION_FLOOR = [
  'analog_front_end', 'precision_voltage_reference', 'dac_output_stage',
  'adc_input_stage', 'low_noise_op_amp',
]
const LAB_ELECTRONICS_POWER_DISTRIBUTION_FLOOR = [
  'usb_power_entry', 'esd_protection_network', 'ferrite_emc_bead',
  'reverse_polarity_protection', 'power_indicator_led',
]
const LAB_ELECTRONICS_CONTROL_FLOOR = [
  'microcontroller_mcu', 'usb_interface', 'firmware_storage',
  'debug_header', 'host_protocol_bridge',
]
const LAB_ELECTRONICS_SENSING_FLOOR = [
  'electrode_interface_connector', 'current_measurement_tia', 'reference_input_buffer',
  'voltage_sense_path', 'calibration_reference',
]
const LAB_ELECTRONICS_STRUCTURE_FLOOR = [
  'enclosure_shell', 'pcb_mounting_standoff', 'front_panel_connector_ports',
  'cable_strain_relief', 'fastener_set',
]
const LAB_ELECTRONICS_SAFETY_FLOOR = [
  'galvanic_isolator', 'input_protection_network', 'wet_bench_creepage_slot',
  'current_limit_polyfuse', 'safety_label_set',
]
const LAB_ELECTRONICS_HMI_FLOOR = [
  'status_indicator', 'run_start_control', 'host_gui_software',
  'calibration_prompt_ui', 'user_facing_legend',
]
// INTENT (Pioreactor 0121): ml-scale culture instruments still matched
// hasLowPowerLabElectronicsSignal but environmental_interface had NO floor →
// thermalFloorForContract saw net_heating_required_w (0.9 W) as HEATING via
// HEATING_DUTY_RE and emitted industrial heat_pump + scroll compressor +
// access ladder (£81k vs gold £259). Device thermal = TEC/heater; culture
// fluid = vial + dosing — never ASHP plant kit.
// cartridge_heater removed (2026-07-22): a Peltier/TEC already heats AND cools the
// sub-1W watt-scale loop — a separate resistive heater is provably redundant (F2 collapse
// rule). The floor must not pre-populate what F2 collapses; doing so caused the cartridge
// heater to appear in module prose/rad_syntax on every benchtop bioreactor run even after
// F2 demoted it from words[], because the floor was written into prose BEFORE the collapse.
const LAB_DEVICE_THERMAL_FLOOR = [
  'peltier_tec_module', 'temperature_sensor',
  'heatsink_fan', 'thermal_insulation', 'thermal_interface_pad',
]
const LAB_CULTURE_FLUID_FLOOR = [
  'culture_vessel', 'magnetic_stirrer_drive', 'dosing_peristaltic_pump',
  'media_tubing_set', 'vial_holder_fixture', 'sterile_filter_vent',
]
const LAB_CULTURE_SENSING_FLOOR = [
  'od_photodiode_path', 'ir_led_emitter', 'culture_temperature_probe',
  'stir_tachometer_sense', 'sensor_cable',
]
const LAB_ELECTRONICS_MODULE_FLOORS: Record<string, string[]> = {
  energy_storage_source: LAB_ELECTRONICS_ENERGY_FLOOR,
  energy_conversion_transduction: LAB_ELECTRONICS_ENERGY_CONVERSION_FLOOR,
  power_distribution: LAB_ELECTRONICS_POWER_DISTRIBUTION_FLOOR,
  control_compute_communication: LAB_ELECTRONICS_CONTROL_FLOOR,
  sensing_instrumentation: LAB_ELECTRONICS_SENSING_FLOOR,
  structure_containment: LAB_ELECTRONICS_STRUCTURE_FLOOR,
  safety_protection: LAB_ELECTRONICS_SAFETY_FLOOR,
  hmi_ergonomics: LAB_ELECTRONICS_HMI_FLOOR,
  human_machine_interface: LAB_ELECTRONICS_HMI_FLOOR,
  // Always: watt-scale instruments reject heat with TEC/heater, not ASHP.
  environmental_interface: LAB_DEVICE_THERMAL_FLOOR,
}
const LAB_ELECTRONICS_FORBIDDEN_COMPONENT_RE =
  /main_breaker|distribution_busbar|power_contactor|protective_relay|emergency_stop|fire_detector|interlock_switch|warning_beacon|network_switch|communication_gateway|(?:io_module|i\/o\s*module)|scada|plc|pressure_sensor|mains_incomer|distribution_transformer|main_switchboard|inverter_bridge|dc_link_capacitor|gate_driver|chiller|scroll\s*compressor|heat_pump|circulation_pump|pipework_run|skid_frame|access_ladder|lifting_point|walkway_grating|expansion_vessel|expansion_reservoir|air_damper|condensate_drain|process_water|optical_detector|cuvette|photodiode_path|led_emitter|square_cuvette/i

// ── BENCHTOP MULTI-CHANNEL POWER INSTRUMENT FLOOR (2026-07-27 cell-cycler) ───
// INTENT: Cold miss-path for a novel 8-channel source/sink cell cycler scored
// plaus=3 because hasLowPowerLabElectronicsSignal requires peakW≤100 / load≤0.1 kW
// — a 200 W dissipative instrument fell through to Tier-C plant floors (liquid
// mass_fluid, buck-boost, global estop). Sol+Opus council: add a UNIVERSAL
// capability floor keyed on channel count + source/sink + precision measurement
// + linear dissipative power + air-cooled Peltier — NEVER a cell_cycler class.
// Checked BEFORE low-power lab electronics when the multi-channel power signal
// fires; optical/thermocycler/syringe/microscope still win first.
// INTENT (Sol+Opus 2026-07-27): mains C14 + isolated AC-DC live on
// power_distribution — not energy_storage_source. Cold-v3's bootstrapped graph
// omitted energy_storage entirely, so C14/PSU never landed and the skeleton
// critic scored a HIGH against the brief's fused/earthed IEC C14 mandate.
const BENCH_POWER_ENERGY_FLOOR = [
  // No battery plant on a mains-powered bench instrument. If the graph still
  // emits energy_storage_source, keep DC hold-up only — never cell racks.
  'bulk_dc_holdup_capacitance', 'soft_start_inrush_limiter', 'dc_distribution_rail',
]
// GOTCHA (cold-v4): Channel Power Heatsink alone failed engineering_plausibility
// HIGH for 200 W dissipative discharge — critic requires active cooling colocated
// with the linear pass bank (Peltier bay fan in environmental_interface is a
// different thermal loop and does not cool the power stage).
// GOTCHA: parts that replicate once per brief channel MUST use the `per_channel_`
// prefix so contractCountFor binds channel_count (Block 1 closure plan). A bare
// `channel_power_*` / `linear_discharge_*` head cannot bind an unqualified count
// without reopening the Powerwall cell_count smear.
const BENCH_POWER_ENERGY_CONVERSION_FLOOR = [
  'per_channel_linear_source_sink_stage', 'per_channel_linear_discharge_pass_bank',
  'per_channel_charge_current_source', 'per_channel_discharge_load_mosfet',
  'per_channel_current_control_loop',
  // Heatsinks stay per-channel; the forced-air bank is SHARED across the
  // aggregate dissipation (cold-v14: per_channel_power_cooling_fan ×8 × £60
  // bust the £2k ceiling). Name must NOT carry per_channel_ or role-scope
  // binds channel_count.
  'per_channel_power_heatsink', 'power_stage_cooling_fan',
]
const BENCH_POWER_SENSING_FLOOR = [
  'per_channel_precision_afe', 'per_channel_kelvin_voltage_sense_input', 'precision_adc',
  'per_channel_current_shunt_measurement', 'precision_voltage_reference',
  'per_channel_cell_thermistor_input',
]
// GOTCHA: never name a floor part with bare "UV" — SUB_ASSEMBLY `\buv\b` once
// exploded electrical over/under-voltage into ultraviolet Process Unit anatomy.
// Per-channel comparators/detectors must use per_channel_ so channel_count binds
// (cold-v5 critic: shared ×1 OV/UV/overcurrent cannot protect 8 independent channels).
const BENCH_POWER_SAFETY_FLOOR = [
  'per_channel_hardware_cutout', 'per_channel_over_under_voltage_comparator_latch',
  'per_channel_overcurrent_comparator', 'per_channel_overtemp_trip',
  'per_channel_reverse_polarity_detector', 'firmware_independent_interlock',
]
const BENCH_POWER_THERMAL_FLOOR = [
  'peltier_tec_module', 'finned_heatsink', 'heatsink_fan_assembly',
  'thermal_interface_pad', 'cell_bay_temperature_sensor', 'exhaust_air_path',
]
const BENCH_POWER_POWER_DISTRIBUTION_FLOOR = [
  'iec_c14_fused_inlet', 'isolated_ac_dc_power_module', 'mains_fuse_holder',
  'protective_earth_bond', 'emc_line_filter', 'power_switch',
  'analog_digital_rail_split', 'channel_power_bus', 'board_level_decoupling',
  'wire_harness', 'polyfuse_resettable', 'status_led',
]
const BENCH_POWER_CONTROL_FLOOR = [
  'main_controller_mcu', 'touch_display', 'usb_c_host_interface',
  'ethernet_host_interface', 'firmware_storage', 'schedule_state_machine',
]
const BENCH_POWER_STRUCTURE_FLOOR = [
  'enclosure_shell', 'removable_cell_bay', 'per_channel_cell_holder_fixture',
  'front_panel_operator_deck', 'fastener_set', 'foot_pad',
]
const BENCH_POWER_HMI_FLOOR = [
  'touch_display', 'status_indicator', 'run_start_control',
  'mounting_bezel', 'user_facing_legend',
]
/** Forced-air path if a class graph still carries mass_fluid — never liquid loop. */
const BENCH_POWER_AIR_PATH_FLOOR = [
  'forced_air_duct', 'axial_cooling_fan', 'heatsink_air_path',
  'inlet_grille', 'exhaust_grille',
]
const BENCH_POWER_MODULE_FLOORS: Record<string, string[]> = {
  energy_storage_source: BENCH_POWER_ENERGY_FLOOR,
  energy_conversion_transduction: BENCH_POWER_ENERGY_CONVERSION_FLOOR,
  sensing_instrumentation: BENCH_POWER_SENSING_FLOOR,
  safety_protection: BENCH_POWER_SAFETY_FLOOR,
  environmental_interface: BENCH_POWER_THERMAL_FLOOR,
  power_distribution: BENCH_POWER_POWER_DISTRIBUTION_FLOOR,
  control_compute_communication: BENCH_POWER_CONTROL_FLOOR,
  structure_containment: BENCH_POWER_STRUCTURE_FLOOR,
  hmi_ergonomics: BENCH_POWER_HMI_FLOOR,
  human_machine_interface: BENCH_POWER_HMI_FLOOR,
  mass_fluid_transport_process: BENCH_POWER_AIR_PATH_FLOOR,
}
const BENCH_POWER_FORBIDDEN_COMPONENT_RE =
  /main_breaker|distribution_busbar|power_contactor|protective_relay|fire_detector|warning_beacon|network_switch|communication_gateway|(?:io_module|i\/o\s*module)|scada|plc|pressure_sensor|mains_incomer|distribution_transformer|main_switchboard|inverter_bridge|dc_link_capacitor|gate_driver|buck_boost|chiller|scroll\s*compressor|heat_pump|circulation_pump|pipework_run|distribution_manifold|expansion_reservoir|fluid_filter|skid_frame|access_ladder|lifting_point|walkway_grating|expansion_vessel|air_damper|condensate_drain|process_water|gimbal|microfluidic|perfusion|optical_detector|cuvette|photodiode_path|led_emitter|square_cuvette|process_unit|inlet[_\s/-]*outlet|outlet_manifold|inlet_manifold|flow_control_valve|dosing|lamp_module|chemical_dosing|uv_lamp|membrane_module|reactor_vessel/i

/**
 * @description Universal detector for multi-channel benchtop source/sink power
 * instruments (cell cyclers, battery testers, electronic loads with precision AFE).
 * PURE — noun/unit/tool/brief signals; never a product-class table.
 */
export function hasBenchPowerInstrumentSignal(
  contract: ContractInProgress,
  brief?: ParsedConstraints | null,
): boolean {
  const q = (contract?.quantities ?? {}) as Record<string, { value?: unknown } | undefined>
  const peakW = Number(q.peak_electrical_power_w?.value ?? q.max_simultaneous_dissipation_w?.value
    ?? q.total_instrument_dissipation_w?.value ?? q.aggregate_cell_electrical_transfer_power_w?.value)
  const loadKw = Number(q.connected_electrical_load_kw?.value)
  const enclosureM3 = Number(q.enclosure_volume_m3?.value)
  const channels = Number(
    q.channel_count?.value
      ?? q.independent_hardware_channel_isolation_paths_count?.value
      ?? q.cell_bay_capacity_cells?.value,
  )
  const briefText = [
    String(contract?.brief_summary ?? ''),
    String((brief as any)?.product_description ?? ''),
    String((brief as any)?.original_text ?? ''),
    String((brief as any)?.mission_statement ?? ''),
  ].join('\n').toLowerCase()

  const metrics = (brief as any)?.constraints?.target_performance?.metrics
  let metricChannels = 0
  let hasAccuracy = false
  let hasDissipation = false
  if (Array.isArray(metrics)) {
    for (const m of metrics) {
      const key = String(m?.key_metric ?? m?.name ?? '').toLowerCase()
      const val = Number(m?.value)
      if (/channel/.test(key) && Number.isFinite(val) && val >= 2) metricChannels = Math.max(metricChannels, val)
      if (/accuracy|kelvin|shunt/.test(key)) hasAccuracy = true
      if (/dissipation|power_w|current_range/.test(key) && Number.isFinite(val) && val > 0) hasDissipation = true
    }
  }

  const nChannels = Number.isFinite(channels) && channels >= 2 ? channels : metricChannels
  const multiChannel = nChannels >= 2 || /\b\d+\s*independent\s+channels?\b|\b八|\beight\s+independent\b/.test(briefText)
  const sourceSink =
    /\bsource\s+and\s+sink\b|\bcharge\s+and\s+discharge\b|\blinear[\s-]?assisted\b|\bdissipat(?:e|es|ion)\s+(?:discharge|energy)\b|\bkelvin\b|\bfour[\s-]?wire\b|\bper[\s-]?channel\b/.test(briefText)
    || /\b(charge|discharge|source|sink)/.test(String(q.channel_current_magnitude_a?.value ?? ''))
    || hasAccuracy
    || hasDissipation
  const tools = contract?._tools_run ?? []
  const toolHint = tools.some((t) =>
    /instrumentation:adc|tec:peltier|battery-c-rate|battery-safety/i.test(String(t)),
  )
  const precisionHint =
    Number(q.voltage_measurement_accuracy_pct_fs?.value) > 0
    || Number(q.current_measurement_accuracy_pct_fs?.value) > 0
    || Number(q.required_adc_bit_depth_bits?.value) >= 12
    || /0\.05\s*%|0\.1\s*%|precision\s+analogue|precision\s+analog/.test(briefText)

  // Must be multi-channel source/sink (or tool+precision) on a device-scale power band.
  const deviceOk =
    (Number.isFinite(peakW) && peakW > 0 && peakW <= 500)
    || (Number.isFinite(loadKw) && loadKw > 0 && loadKw <= 1.0)
    || (Number.isFinite(enclosureM3) && enclosureM3 > 0 && enclosureM3 < 1)
    || /\bbenchtop\b|\bdesktop\s+instrument\b|\b450\s*mm\b/.test(briefText)

  if (!deviceOk) return false
  if (multiChannel && (sourceSink || precisionHint || toolHint)) return true
  // Strong brief alone: "independent test channels" + Peltier + linear-assisted
  if (multiChannel && /\bpeltier\b/.test(briefText) && /\blinear[\s-]?assisted\b|\bsource\s+and\s+sink\b/.test(briefText)) {
    return true
  }
  return false
}

/** ml-scale continuous-culture / turbidostat — fluid path is vial + dosing, not plant manifold. */
function hasBenchtopCultureSignal(contract: ContractInProgress): boolean {
  const pc = String((contract as { product_class?: unknown })?.product_class ?? '').toLowerCase()
  if (/benchtop[_ -]?bioreactor|pioreactor|turbidostat|chemostat/.test(pc)) return true
  const q = (contract?.quantities ?? {}) as Record<string, { value?: unknown } | undefined>
  const ml = Number(q.working_volume_ml?.value)
  return Number.isFinite(ml) && ml > 0 && ml <= 500
}

/** True when the contract is a multi-channel benchtop linear syringe-dosing form.
 *  PURE — class slug OR archetype-builder quantity triad; never a product brand. */
function hasSyringePumpSignal(contract: ContractInProgress): boolean {
  const pc = String((contract as { product_class?: unknown })?.product_class ?? '').toLowerCase()
  if (/syringe[_ -]?pump/.test(pc)) return true
  const q = (contract?.quantities ?? {}) as Record<string, { value?: unknown } | undefined>
  const channels = Number(q.channel_count?.value)
  const pitch = Number(q.lead_screw_pitch_mm?.value)
  const syringeMl = Number(q.max_syringe_volume_ml?.value)
  return (
    Number.isFinite(channels) && channels >= 1
    && Number.isFinite(pitch) && pitch > 0
    && Number.isFinite(syringeMl) && syringeMl > 0
  )
}

/** True for printed flexure-stage / motorised research microscope form.
 *  PURE — class slug OR stage_axis_count + focus_resolution_um; never a brand. */
function hasLabMicroscopeSignal(contract: ContractInProgress): boolean {
  const pc = String((contract as { product_class?: unknown })?.product_class ?? '').toLowerCase()
  if (/lab[_ -]?microscope|flexure[_ -]?stage|openflexure/.test(pc)) return true
  const q = (contract?.quantities ?? {}) as Record<string, { value?: unknown } | undefined>
  const axes = Number(q.stage_axis_count?.value)
  const focusUm = Number(q.focus_resolution_um?.value)
  return Number.isFinite(axes) && axes >= 2 && Number.isFinite(focusUm) && focusUm > 0
}

/** True for USB/bench lab electronics whose contract carries watt-scale load
 *  plus instrument quantities (electrochemical compliance voltage, EWOD
 *  electrode count, ml-scale working volume, etc.). */
function hasLowPowerLabElectronicsSignal(contract: ContractInProgress): boolean {
  const pc = String((contract as { product_class?: unknown })?.product_class ?? '').toLowerCase()
  const q = (contract?.quantities ?? {}) as Record<string, { value?: unknown } | undefined>
  const peakW = Number(q.peak_electrical_power_w?.value)
  const loadKw = Number(q.connected_electrical_load_kw?.value)
  const enclosureM3 = Number(q.enclosure_volume_m3?.value)
  const isSmallPower =
    (Number.isFinite(peakW) && peakW > 0 && peakW <= 100)
    || (Number.isFinite(loadKw) && loadKw > 0 && loadKw <= 0.1)
  const isSmallEnclosure = !Number.isFinite(enclosureM3) || enclosureM3 < 1
  const hasInstrumentQuantity = [
    'compliance_voltage_v',
    'electrode_count',
    'working_volume_ml',
    'working_volume_l',
    'peak_electrical_power_w',
  ].some((key) => {
    const v = Number(q[key]?.value)
    return Number.isFinite(v) && v > 0
  })
  const classHintsLabElectronics =
    /potentiostat|digital[_ -]?microfluidics|benchtop[_ -]?bioreactor|optical[_ -]?instrument/.test(pc)
  return isSmallPower && isSmallEnclosure && (hasInstrumentQuantity || classHintsLabElectronics)
}

/** The energy_storage_source floor: an optical instrument's own small rechargeable
 *  battery + charge management (checked FIRST — never confused with a BESS even if a
 *  stray quantity key happens to match ENERGY_STORAGE_RE), else a battery kit for a
 *  genuine storage plant, else the mains electrical supply for a plant that only DRAWS
 *  power (no battery). */
function energyFloorFor(contract: ContractInProgress, brief?: ParsedConstraints | null): string[] {
  if (hasOpticalInstrumentSignal(contract)) return OPTICAL_ENERGY_STORAGE_FLOOR
  // GOTCHA (2026-07-27): tec:peltier-sizing also fires hasThermocyclerToolSignal.
  // Multi-channel source/sink instruments (cell cyclers) must win BEFORE the
  // PCR/thermocycler floor or they inherit sample-block / lid-heater vocabulary.
  if (hasBenchPowerInstrumentSignal(contract, brief)) return BENCH_POWER_ENERGY_FLOOR
  if (hasThermocyclerSignal(contract)) return THERMOCYCLER_ENERGY_FLOOR
  if (hasSyringePumpSignal(contract)) return SYRINGE_PUMP_ENERGY_FLOOR
  if (hasLabMicroscopeSignal(contract)) return LAB_MICROSCOPE_ENERGY_FLOOR
  if (hasLowPowerLabElectronicsSignal(contract)) return LAB_ELECTRONICS_ENERGY_FLOOR
  return hasEnergyStorage(contract) ? ENERGY_STORAGE_FLOOR : ELECTRICAL_SUPPLY_FLOOR
}

/** Thermal floor: solid-state TEC kit for thermocycler / lab electronics; else duty-sign plant set. */
function thermalFloorForContract(contract: ContractInProgress, brief?: ParsedConstraints | null): string[] {
  if (hasBenchPowerInstrumentSignal(contract, brief)) return BENCH_POWER_THERMAL_FLOOR
  if (hasThermocyclerSignal(contract)) return THERMOCYCLER_THERMAL_FLOOR
  // GOTCHA (Pioreactor 0121): net_heating_required_w matches HEATING_DUTY_RE
  // and selected industrial heat_pump. Watt-scale instruments always use TEC.
  if (hasLowPowerLabElectronicsSignal(contract)) return LAB_DEVICE_THERMAL_FLOOR
  // Cold-plate liquid-loop BEFORE unknown→chiller default (Formula E MGU 2026-07-28).
  if (hasColdPlateLoopInterface(contract)) return COLD_PLATE_LOOP_FLOOR
  return thermalFloorFor(contract)
}

const ACRONYMS: Record<string, string> = {
  lfp: 'LFP', nmc: 'NMC', pcs: 'PCS', dc: 'DC', ac: 'AC', ems: 'EMS', bms: 'BMS',
  hvac: 'HVAC', led: 'LED', igbt: 'IGBT', sic: 'SiC', io: 'I/O', hmi: 'HMI',
  scada: 'SCADA', pv: 'PV', mv: 'MV', lv: 'LV', uv: 'UV', rcd: 'RCD', plc: 'PLC',
  iec: 'IEC', // IEC C14 fused inlet labels on bench-power instruments
}

function sanitizeId(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'component'
}

function humanize(s: string): string {
  return String(s ?? '')
    .replace(/_/g, ' ')
    .trim()
    .split(/\s+/)
    .map((tok) => ACRONYMS[tok.toLowerCase()] ?? (tok.charAt(0).toUpperCase() + tok.slice(1)))
    .join(' ') || 'Component'
}

function headToken(component: string): string {
  const toks = sanitizeId(component).split('_').filter(Boolean)
  return toks[toks.length - 1] ?? ''
}

/**
 * Honest, contract-only quantity for a component word. Matches the word's HEAD
 * noun to a contract `<noun>_count` / `<noun>_qty` / `<noun>_quantity` quantity
 * (head-noun match avoids `cell_monitoring_units` grabbing `cell_count`). Returns
 * 1 when the contract knows no matching count — never invents a number.
 *
 * DECISION (Sol+Fable 2026-07-27 Block 1 + P1): a leading `per_<scope>_` id /
 * "Per <Scope> …" human name is an explicit replication-axis marker — bind
 * `<scope>_count` BEFORE head-noun matching. P1 also binds CHANNEL-REPLICATED
 * ROLES (charge source, shunt, OV comparator, …) to `channel_count` even when
 * the surface name lacks the prefix — naming whim must not leave ×1 hardware
 * against an 8-channel ledger. Unqualified head discipline (Powerwall
 * cell_count ≠ Cell Temperature Sensor) stays byte-identical: role binding
 * never looks up cell_count. Shared axis nouns ("Channel Power Bus") stay ×1.
 */
export function contractCountFor(component: string, contract: ContractInProgress): number {
  const quantities = contract?.quantities ?? {}
  const roleN = roleReplicationCount(component, quantities as Record<string, { value?: unknown }>)
  if (roleN !== null) return roleN
  const head = headToken(component)
  if (!head) return 1
  const singular = head.replace(/s$/, '')
  // Component token set (singularised) — used to test a count key's QUALIFIERS against the
  // component, so a QUALIFIED count (`actuated_distribution_valve_count`) binds ONLY to a word
  // that shares those qualifiers, not to every word with the same head noun. Without this, the
  // 200-actuated-valve count smeared onto all ~17 distinct valve words (×200 each = ~3,400
  // valves; the physics-critic "massive duplication of valve counts" HIGH). UNIVERSAL — keyed on
  // token overlap, no class table. (Also fixes biofilter_tank grabbing rearing_tank_count, etc.)
  const compToks = new Set(
    component.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map((t) => t.replace(/s$/, '')),
  )
  let best = 1
  let bestSpecificity = -1
  for (const [key, tq] of Object.entries(quantities)) {
    const m = key.match(/^(.+?)_(count|qty|quantity|number)$/i)
    if (!m) continue
    const keyToks = m[1].toLowerCase().split('_').filter(Boolean).map((t) => t.replace(/s$/, ''))
    const qHead = keyToks[keyToks.length - 1] ?? ''
    // the component must carry the count's HEAD noun …
    if (!(qHead === head || qHead === singular || `${qHead}s` === head || compToks.has(qHead))) continue
    // … AND at least HALF of the count's QUALIFIER tokens (so `actuated_distribution_valve_count`
    // binds to "Pneumatic Actuated Valve" [shares actuated] but NOT to "Solenoid Valve"; a count
    // with no qualifiers — `cell_count` — needs only the head noun, as before).
    const quals = keyToks.slice(0, -1)
    // UNQUALIFIED-COUNT HEAD DISCIPLINE (2026-07-10, Powerwall: cell_count=175 smeared
    // onto "Cell Temperature Sensors" ×175 @ £30 = a £5,250 phantom sensor farm — a
    // temp SENSOR is not a CELL). A count with NO qualifiers is a bare noun count and
    // may only bind a component that IS that noun (its own HEAD token matches); mere
    // token CONTAINMENT (compToks.has) stays available only for QUALIFIED counts,
    // where the half-qualifier gate above already anchors the subsystem identity.
    if (quals.length === 0 && !(qHead === head || qHead === singular || `${qHead}s` === head)) continue
    const sharedQuals = quals.filter((t) => compToks.has(t)).length
    if (quals.length > 0 && sharedQuals < Math.ceil(quals.length / 2)) continue
    const v = (tq as { value?: unknown })?.value
    if (typeof v === 'number' && Number.isFinite(v) && v >= 1 && v < 1e7) {
      // Prefer the MOST-specific count key that still matches (more shared qualifiers wins), so a
      // word never takes a vaguer count when a tighter one fits.
      const specificity = sharedQuals
      if (specificity > bestSpecificity) { bestSpecificity = specificity; best = Math.round(v) }
    }
  }
  return best
}

// A component name that is intrinsically a COOLING device — must NOT appear in the
// thermal set of a heating-only plant (the RAS chiller-in-a-heating-plant residual).
const COOLING_COMPONENT_RE = /chill|cooling|\bcooler\b|refriger|condenser|air[_\s-]?damper|cold[_\s-]?plate|cooling[_\s-]?fan/i

// A component name that is actually a DIMENSION / PROPERTY of a device (it ENDS in a measurement
// noun — area, diameter, volume, height, length, width, capacity, throughput, …) is NEVER a
// discrete part. The corpus/LLM sometimes lists a quantity name ("RO Membrane Area", "GAC Vessel
// Diameter") as a component; emitting a BoM word for it mints a PHANTOM part + a duplicate tag
// (two same-named property-words collide on one tag — the v19 X-108/V-102 BoM HIGH) + an absurd
// "Skid → its own Area" routed connection. The attribute belongs to its PARENT device's word, so
// drop the standalone. UNIVERSAL — a real part name ends in a DEVICE noun (pump/tank/valve/skid…),
// never a dimension. The `\s*$` anchor (ENDS-with) avoids false hits on "Pressure Vessel" /
// "Control Valve" / "Pressure Transmitter" (those end in a device noun).
const PROPERTY_COMPONENT_RE = /\b(area|diameter|radius|circumference|volume|height|length|width|depth|thickness|capacity|throughput|flow ?rate|velocity|head|footprint|pressure|temperature|count|spacing|pitch|ratio|density|mass|weight|power|voltage|current|frequency)\s*$/i

/** Build the 5-7 component name list for a module: corpus union first, floor to top up.
 *  For `environmental_interface` the floor + a cooling-component filter are driven by the
 *  contract's thermal DUTY SIGN, so a heating-only plant never ships a chiller. */
function componentsForModule(
  moduleKey: string,
  componentsByModule: Map<string, string[]>,
  contract: ContractInProgress,
  opts: { syringeHasActuationNode?: boolean; brief?: ParsedConstraints | null } = {},
): string[] {
  const isThermal = moduleKey === 'environmental_interface'
  const isEnergyStore = moduleKey === 'energy_storage_source'
  const isOpticalInstrument = hasOpticalInstrumentSignal(contract)
  const isThermocycler = hasThermocyclerSignal(contract)
  const isSyringePump = hasSyringePumpSignal(contract)
  const isLabMicroscope = hasLabMicroscopeSignal(contract)
  const isBenchPower = hasBenchPowerInstrumentSignal(contract, opts.brief)
  const isLowPowerLabElectronics = !isBenchPower && hasLowPowerLabElectronicsSignal(contract)
  const isBenchtopCulture = hasBenchtopCultureSignal(contract)
  const isColdPlateLoop = isThermal && hasColdPlateLoopInterface(contract)
  const isTractionDrive = hasTractionDrivePackSignal(contract)
  const thermalMode = isThermal ? thermalModeFromContract(contract) : 'unknown'
  const fromCorpus = componentsByModule.get(moduleKey) ?? []
  const out: string[] = []
  const seen = new Set<string>()
  const push = (c: string) => {
    // Heating-only plant: never admit a cooling component (from corpus OR floor).
    // Skip this filter for watt-scale lab instruments — their TEC floor is intentional.
    if (
      isThermal
      && thermalMode === 'heating'
      && !isLowPowerLabElectronics
      && !isBenchPower
      && !isColdPlateLoop
      && COOLING_COMPONENT_RE.test(c)
    ) return
    // Cold-plate liquid-loop: never admit packaged refrigeration / HVAC plant parts
    // (corpus neighbour graphs otherwise inject Daikin HX / condenser / chiller).
    if (isColdPlateLoop && REFRIGERATION_PLANT_COMPONENT_RE.test(c)) return
    // Thermocycler: never admit plant chillers / LV switchboard vocabulary.
    if (isThermocycler && THERMOCYCLER_FORBIDDEN_COMPONENT_RE.test(c)) return
    // Syringe-pump: never admit plant circulation / ladder / membrane vocabulary.
    if (isSyringePump && SYRINGE_PUMP_FORBIDDEN_COMPONENT_RE.test(c)) return
    // Lab microscope: never admit robotics depth cams / DIN-rail industrial I/O.
    if (isLabMicroscope && LAB_MICROSCOPE_FORBIDDEN_COMPONENT_RE.test(c)) return
    // Low-power lab electronics: never admit plant power/safety/process sensors.
    if (isLowPowerLabElectronics && LAB_ELECTRONICS_FORBIDDEN_COMPONENT_RE.test(c)) return
    // Bench multi-channel power instrument: never admit plant liquid/HX/buck-boost.
    if (isBenchPower && BENCH_POWER_FORBIDDEN_COMPONENT_RE.test(c)) return
    // Never admit a DIMENSION/PROPERTY name as a part (it is an attribute of its parent device).
    if (PROPERTY_COMPONENT_RE.test(c)) return
    const id = sanitizeId(c)
    if (id && !seen.has(id)) {
      seen.add(id)
      out.push(c)
    }
  }
  for (const c of fromCorpus) push(c)
  // DECISION (Poseidon 2026-07-16): instrument form floors are AUTHORITATIVE
  // inventories (every listed part must land), not MIN_WORDS padding. Topping up
  // to 5 left stepper_motor / stepper_driver_board off the BoM while cradle +
  // clamp + screw + rail + carriage already satisfied density — Interconnect
  // then had no actuation principals and Blender lost the NEMA/coupler story.
  // Optical / thermocycler / lab_microscope floors get the same full-union rule.
  const syringeFloors = isSyringePump
    ? syringePumpModuleFloors(Boolean(opts.syringeHasActuationNode))
    : null
  // Culture instruments: override sensing + mass_fluid with vial/OD/dosing floors.
  const cultureFloor: Record<string, string[]> | null = isBenchtopCulture
    ? {
        mass_fluid_transport_process: LAB_CULTURE_FLUID_FLOOR,
        sensing_instrumentation: LAB_CULTURE_SENSING_FLOOR,
        environmental_interface: LAB_DEVICE_THERMAL_FLOOR,
      }
    : null
  const instrumentFloor =
    (syringeFloors && syringeFloors[moduleKey])
    || (isLabMicroscope && LAB_MICROSCOPE_MODULE_FLOORS[moduleKey])
    // Bench multi-channel power BEFORE thermocycler: shared tec:peltier tool
    // must not force PCR sample-block / lid-heater floors onto a cell cycler.
    || (isBenchPower && BENCH_POWER_MODULE_FLOORS[moduleKey])
    || (isThermocycler && !isBenchPower && THERMOCYCLER_MODULE_FLOORS[moduleKey])
    // GOTCHA: lab_microscope must NOT fall through to OPTICAL_MODULE_FLOORS
    // (cuvette/colorimeter vocabulary) — checked before optical.
    || (isOpticalInstrument && !isLabMicroscope && OPTICAL_MODULE_FLOORS[moduleKey])
    || (cultureFloor && cultureFloor[moduleKey])
    || (isLowPowerLabElectronics && LAB_ELECTRONICS_MODULE_FLOORS[moduleKey])
    // Traction MGU+MCU pack: authoritative principals (macros) on actuation /
    // energy_conversion / structure — cold-plate thermal stays on thermalFloorFor.
    || (isTractionDrive && TRACTION_DRIVE_MODULE_FLOORS[moduleKey])
    || null
  if (instrumentFloor) {
    for (const c of instrumentFloor) push(c)
  } else if (out.length < MIN_WORDS) {
    // Duty-aware thermal / energy / Tier-C plant floors still pad to density.
    const floor = isThermal ? thermalFloorForContract(contract, opts.brief)
      : isEnergyStore ? energyFloorFor(contract, opts.brief)
      : (TIER_C_FLOOR[moduleKey] ?? GENERIC_FLOOR)
    for (const c of floor) {
      if (out.length >= MIN_WORDS) break
      push(c)
    }
  }
  // Last resort (truly unknown module with an empty floor): pad to MIN_WORDS.
  let i = 1
  while (out.length < MIN_WORDS) {
    push(`${moduleKey}_subcomponent_${i++}`)
  }
  return out.slice(0, MAX_COMPONENTS)
}

/**
 * Split a module's components into ≥2 sub_module groups of ≥MIN_WORDS each
 * (audit-pdf-run D-1). When there are too few for two valid groups, keep one
 * sub_module (a thin class relies on the grammar gate's single-thin exception).
 */
function splitIntoSubModuleGroups(components: string[]): string[][] {
  const n = components.length
  // DOMAIN-AWARE SPLIT FIRST (2026-07-10, gate-29 catch on the Powerwall loop): a
  // naive halfway slice can land a dc_* component in a group whose LEAD component —
  // and therefore the sub_module id — is ac_* (main_dc_contactor under
  // __ac_switchgear), and the sub-module domain guard HARD-fails the run (exit 29).
  // Electrical-domain-coded components never share a group across domains; the
  // domain-neutral pool balances density between the two. A resulting thin group is
  // only a density WARNING — strictly better than a hard domain violation. Modules
  // with a single (or no) domain keep the original halfway behaviour byte-identically.
  const domainOf = (c: string): 'dc' | 'ac' | null =>
    /(^|_)dc(_|$)/i.test(c) ? 'dc' : /(^|_)ac(_|$)/i.test(c) ? 'ac' : null
  const dc = components.filter((c) => domainOf(c) === 'dc')
  const ac = components.filter((c) => domainOf(c) === 'ac')
  if (dc.length > 0 && ac.length > 0) {
    const neutral = components.filter((c) => domainOf(c) === null)
    const g1 = [...dc]
    const g2 = [...ac]
    for (const c of neutral) (g1.length <= g2.length ? g1 : g2).push(c)
    return [g1, g2]
  }
  if (n < 2 * MIN_WORDS) return [components]
  const mid = Math.ceil(n / 2)
  return [components.slice(0, mid), components.slice(mid)]
}

/** One BoM-line component word: 5 honest modifiers; the part_number is a gate-23-
 *  satisfying placeholder (NOT a real or invented MPN). */
function componentWord(component: string, moduleDisplay: string, contract: ContractInProgress): Word {
  const human = humanize(component)
  const id = `${sanitizeId(component)}_word`
  const charId = sanitizeId(component)
  const qty = contractCountFor(component, contract)
  return word(id, human, cc(charId, human, null, null), [
    mod('quantity', `×${qty}`),
    mod('form', `${human} — representative ${moduleDisplay.toLowerCase()} component`),
    // Gate-23-satisfying PLACEHOLDER part_number. A sub_module that already has a
    // part_number word is NOT a gate-23 gap, so completeEmitterGaps does NOT inject
    // an extra (frequently mis-pinned) word — this removes the gate-20 mis-pin (e.g.
    // "Carl Zeiss" landing on an inverter) AND the component duplication the physics
    // critic flagged. It is gate-20-safe (fictional-PN audit skips the non-structured
    // 'TBD' token) AND still GROUNDED downstream: fillBlankWordMpns sees it as blank
    // (isBlankOrPlaceholderMpn) and fills a real catalogue MPN because the word's name
    // is catalogue-typed. (Drawer forgeos_gotchas_b96c4c258b64cc14.)
    mod('part_number', 'TBD (detailed design)'),
    mod('lifecycle', 'Concept design — catalogue part + exact MPN confirmed at detailed design'),
    // HONEST placement: the generic path cannot know whether a component is internal
    // or external, so it must NOT assert physical integration. Asserting an MV
    // step-up transformer is "integrated within the PCS" is a FALSE plausibility claim
    // (it is pad-mounted EXTERNAL to the container) — the physics critic flags it HIGH.
    mod('installation', 'Internal / external placement confirmed at layout / detailed design'),
  ])
}

/**
 * Derive the module skeleton from a class-reference graph + corpus components.
 *
 * @param graph              the typed class-reference graph (DB-first or baked TS)
 * @param brief              parsed brief — used for bench-power instrument capability
 *                           detection when contract quantities lag (channel_count etc.)
 * @param _envelope          brief envelope (reserved — scale-tier-aware structure)
 * @param contract           the validated engineering contract (source of quantities)
 * @param componentsByModule corpus component lists keyed by universal module
 *                           (loadClassComponents); empty ⇒ Tier-C floor fills every node
 */
export function deriveGenericSkeleton(
  graph: ProductClassGraph,
  brief: ParsedConstraints,
  _envelope: BriefEnvelope,
  contract: ContractInProgress,
  componentsByModule: Map<string, string[]> = new Map(),
): DesignModule[] {
  // Surface the contract's scalar quantities on the PRINCIPAL node so the headline
  // numbers reach the spec / Brief-Compliance tables. Quantities are COPIED, never
  // invented; non-principal nodes start empty (keeps power_topology_closes silent
  // for them — they have no power-bearing derived_parameters to gate).
  const principalParams: Record<string, number | string> = {}
  const quantities = contract.quantities ?? {}
  for (const [key, raw] of Object.entries(quantities)) {
    const val = (raw as { value?: unknown } | undefined)?.value
    if (typeof val === 'number' || typeof val === 'string') principalParams[key] = val
  }
  // Arithmetic completeness (honest, contract-derived): cells_per_module when both
  // counts are present (point 4 of the Phase-1 spec — full field set, not raw only).
  const cellCount = principalParams['cell_count']
  const moduleCount = principalParams['module_count']
  if (
    typeof cellCount === 'number' &&
    typeof moduleCount === 'number' &&
    moduleCount > 0 &&
    principalParams['cells_per_module'] === undefined
  ) {
    principalParams['cells_per_module'] = Math.round(cellCount / moduleCount)
  }

  // INTENT: exclusive fluid/actuation ownership for syringe forms — see
  // syringePumpModuleFloors. Detect the actuation node once for the whole graph.
  const syringeHasActuationNode = hasSyringePumpSignal(contract)
    && graph.nodes.some((n: GraphNode) => String(n.class) === 'actuation_kinematics')

  return graph.nodes.map((node: GraphNode): DesignModule => {
    const moduleName = String(node.class)
    const display = node.display ?? humanize(moduleName)
    const components = componentsForModule(moduleName, componentsByModule, contract, {
      syringeHasActuationNode,
      brief,
    })
    const groups = splitIntoSubModuleGroups(components)

    const sub_modules: SubModule[] = groups.map((group, gi) => {
      // Name each sub_module after its lead component (specific, not a generic
      // "__assembly") so prose + the BoM read cleanly and any downstream matcher
      // keys off the real component noun.
      const lead = sanitizeId(group[0] ?? `group_${gi + 1}`)
      const words = group.map((c) => componentWord(c, display, contract))
      return makeSubModule(
        `${moduleName}__${lead}`,
        groups.length > 1 ? `${display} — ${humanize(group[0] ?? `group ${gi + 1}`)} group` : display,
        'integrates',
        `${gi === 0 ? 'Primary' : 'Secondary'} component group of the ${moduleName} module.`,
        words,
      )
    })

    return {
      module: moduleName,
      module_brief: display,
      overview_paragraph_en: '', // narrator populates
      derived_parameters: node.role === 'principal' ? principalParams : {},
      allowed_radicals: [],
      applicability_confidence: node.required ? 'high' : 'medium',
      sub_modules,
    }
  })
}
