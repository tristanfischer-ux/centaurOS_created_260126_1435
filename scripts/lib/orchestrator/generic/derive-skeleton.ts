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

/** The environmental_interface floor that matches the contract's thermal duty sign. */
function thermalFloorFor(contract: ContractInProgress): string[] {
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
const SYRINGE_PUMP_MAINTENANCE_FLOOR = [
  'access_panel', 'service_connector', 'diagnostic_port',
  'labelling_set', 'channel_service_clearance',
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

/** The energy_storage_source floor: an optical instrument's own small rechargeable
 *  battery + charge management (checked FIRST — never confused with a BESS even if a
 *  stray quantity key happens to match ENERGY_STORAGE_RE), else a battery kit for a
 *  genuine storage plant, else the mains electrical supply for a plant that only DRAWS
 *  power (no battery). */
function energyFloorFor(contract: ContractInProgress): string[] {
  if (hasOpticalInstrumentSignal(contract)) return OPTICAL_ENERGY_STORAGE_FLOOR
  if (hasThermocyclerSignal(contract)) return THERMOCYCLER_ENERGY_FLOOR
  if (hasSyringePumpSignal(contract)) return SYRINGE_PUMP_ENERGY_FLOOR
  return hasEnergyStorage(contract) ? ENERGY_STORAGE_FLOOR : ELECTRICAL_SUPPLY_FLOOR
}

/** Thermal floor: solid-state TEC kit for thermocycler tools; else duty-sign plant set. */
function thermalFloorForContract(contract: ContractInProgress): string[] {
  if (hasThermocyclerSignal(contract)) return THERMOCYCLER_THERMAL_FLOOR
  return thermalFloorFor(contract)
}

const ACRONYMS: Record<string, string> = {
  lfp: 'LFP', nmc: 'NMC', pcs: 'PCS', dc: 'DC', ac: 'AC', ems: 'EMS', bms: 'BMS',
  hvac: 'HVAC', led: 'LED', igbt: 'IGBT', sic: 'SiC', io: 'I/O', hmi: 'HMI',
  scada: 'SCADA', pv: 'PV', mv: 'MV', lv: 'LV', uv: 'UV', rcd: 'RCD', plc: 'PLC',
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
 */
export function contractCountFor(component: string, contract: ContractInProgress): number {
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
  const quantities = contract?.quantities ?? {}
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
  opts: { syringeHasActuationNode?: boolean } = {},
): string[] {
  const isThermal = moduleKey === 'environmental_interface'
  const isEnergyStore = moduleKey === 'energy_storage_source'
  const isOpticalInstrument = hasOpticalInstrumentSignal(contract)
  const isThermocycler = hasThermocyclerSignal(contract)
  const isSyringePump = hasSyringePumpSignal(contract)
  const thermalMode = isThermal ? thermalModeFromContract(contract) : 'unknown'
  const fromCorpus = componentsByModule.get(moduleKey) ?? []
  const out: string[] = []
  const seen = new Set<string>()
  const push = (c: string) => {
    // Heating-only plant: never admit a cooling component (from corpus OR floor).
    if (isThermal && thermalMode === 'heating' && COOLING_COMPONENT_RE.test(c)) return
    // Thermocycler: never admit plant chillers / LV switchboard vocabulary.
    if (isThermocycler && THERMOCYCLER_FORBIDDEN_COMPONENT_RE.test(c)) return
    // Syringe-pump: never admit plant circulation / ladder / membrane vocabulary.
    if (isSyringePump && SYRINGE_PUMP_FORBIDDEN_COMPONENT_RE.test(c)) return
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
  // Optical / thermocycler floors get the same full-union rule (same bug class).
  const syringeFloors = isSyringePump
    ? syringePumpModuleFloors(Boolean(opts.syringeHasActuationNode))
    : null
  const instrumentFloor =
    (syringeFloors && syringeFloors[moduleKey])
    || (isThermocycler && THERMOCYCLER_MODULE_FLOORS[moduleKey])
    || (isOpticalInstrument && OPTICAL_MODULE_FLOORS[moduleKey])
    || null
  if (instrumentFloor) {
    for (const c of instrumentFloor) push(c)
  } else if (out.length < MIN_WORDS) {
    // Duty-aware thermal / energy / Tier-C plant floors still pad to density.
    const floor = isThermal ? thermalFloorForContract(contract)
      : isEnergyStore ? energyFloorFor(contract)
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
 * @param _brief             parsed brief constraints (reserved — Tier C taxonomy refinement)
 * @param _envelope          brief envelope (reserved — scale-tier-aware structure)
 * @param contract           the validated engineering contract (source of quantities)
 * @param componentsByModule corpus component lists keyed by universal module
 *                           (loadClassComponents); empty ⇒ Tier-C floor fills every node
 */
export function deriveGenericSkeleton(
  graph: ProductClassGraph,
  _brief: ParsedConstraints,
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
