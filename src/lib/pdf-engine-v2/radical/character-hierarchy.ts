/**
 * @file character-hierarchy.ts — Deterministic parent-mapping for the Radical library
 *
 * Extracted from the Week 2–5 decomposition JSONs.
 * Every character maps to a canonical "word" (subsystem group), and every
 * word maps to a canonical "sentence" (top-level module).
 *
 * This file is the ONLY source of truth for tree-building hierarchy.
 * It is intentionally side-effect-free — pure constant exports only.
 *
 * Hierarchy (bottom-up):
 *   character  →  word (subsystem group)  →  sentence (top-level module)
 *
 * For Phase 1: BESS is fully populated.
 * Heat-pump, vfarm, drone, EV-charger, bioreactor, edge-AI, AUV, CGM, HAPS
 * characters are included where their module assignments are clear from the
 * week-3/4/5 decomposition JSONs.
 *
 * EXTENSION RULE:
 *   When a new character is commissioned (Week N), add it here under the
 *   appropriate word and sentence. Do NOT hard-code hierarchy inside the
 *   structural-builder — this file is the single source.
 */

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

/**
 * Canonical product-class keys used for cross-domain leakage prevention.
 *
 * These are the SHORT keys used in `HierarchySentence.allowed_classes` and
 * matched by `normaliseProductClass()`. They are NOT the same as the free-form
 * classification strings the LLM emits (e.g. "battery_energy_storage",
 * "30 kW monobloc air-to-water heat pump"). The normaliser collapses all of
 * those down to the keys below.
 *
 * If you add a new product class, you MUST:
 *   1. Add the key here.
 *   2. Add a `cls.includes(...)` branch in `normaliseProductClass()`.
 *   3. Tag every relevant sentence with the new key in `allowed_classes`.
 */
export type ProductClass =
  | 'bess'
  | 'heat_pump'
  | 'vfarm'
  | 'drone'
  | 'ev_charger'
  | 'bioreactor'
  | 'edge_ai'
  | 'auv'
  | 'cgm'
  | 'haps'

/** A "word" is a subsystem group (e.g. "battery_string" within "battery_rack_assembly"). */
export interface HierarchyWord {
  /** snake_case subsystem group ID */
  id: string
  /** Human-readable label */
  label: string
  /** The sentence-level module this word belongs to */
  sentence_id: string
  /** Characters (function-class IDs) that belong to this word */
  characters: string[]
}

/** A "sentence" is a top-level module (e.g. "battery_rack_assembly"). */
export interface HierarchySentence {
  /** snake_case module ID — matches the `module` field in decomposition JSONs */
  id: string
  /** Human-readable label */
  label: string
  /** All word IDs that belong to this sentence */
  words: string[]
  /**
   * Whitelist of product classes that may legitimately use this sentence as a
   * destination. The structural builder filters out wrong-class matches at the
   * character → word resolution step, preventing wrong-domain leakage
   * (e.g. `refrigerant_circuit` showing up on an AUV/drone/HAPS BOM because
   * `copper_wire` happens to live in `refrigerant_distribution` first).
   *
   * MUST be set on every sentence. Use ALL_PRODUCT_CLASSES for genuinely
   * cross-domain sentences. An empty array means "no class can use this"
   * (treated as a configuration error by the filter).
   *
   * Phase B Iter 1 (Bug P0-7 / 2026-05-11): added to plug the universality
   * leakage detected by the engine-accuracy-scorecard.
   */
  allowed_classes: ProductClass[]
}

/** Convenience constant for sentences that genuinely apply to every class. */
export const ALL_PRODUCT_CLASSES: ProductClass[] = [
  'bess',
  'heat_pump',
  'vfarm',
  'drone',
  'ev_charger',
  'bioreactor',
  'edge_ai',
  'auv',
  'cgm',
  'haps',
]

/**
 * Normalise the free-form classification string emitted by the LLM (e.g.
 * "battery_energy_storage", "30 kW air-to-water heat pump", "haps_001",
 * "Modular Indoor Vertical Farm Unit") to one of the canonical
 * `ProductClass` keys. Returns null when no rule matches — callers should
 * skip the allowed_classes filter rather than block the build.
 *
 * The matching rules MIRROR `deriveClassMandatoryCharacters()` in
 * `structural-builder.ts`. Keep them in sync.
 */
export function normaliseProductClass(classification: string): ProductClass | null {
  const cls = classification.toLowerCase()

  if (cls === 'battery_energy_storage' || cls === 'bess' || cls.includes('energy_storage')) return 'bess'
  if (cls.includes('drone') || cls.includes('uav') || cls.includes('quadcopter') || cls.includes('multirotor')) return 'drone'
  if (cls.includes('cgm') || cls.includes('glucose') || cls.includes('wearable') || cls.includes('biosensor')) return 'cgm'
  if (cls.includes('heat_pump') || cls.includes('thermal_system') || cls.includes('heat pump')) return 'heat_pump'
  if (cls.includes('vertical_farm') || cls.includes('farm') || cls.includes('cea') || cls.includes('greenhouse')) return 'vfarm'
  if (cls.includes('ev_charger') || cls.includes('charger') || cls.includes('ev charger')) return 'ev_charger'
  if (cls.includes('bioreactor') || cls.includes('ferment')) return 'bioreactor'
  if (cls.includes('edge_ai') || cls.includes('edge ai') || cls.includes('server') || cls.includes('compute')) return 'edge_ai'
  if (cls.includes('auv') || cls.includes('underwater') || cls.includes('subsea') || cls.includes('rov')) return 'auv'
  if (cls.includes('haps') || cls.includes('stratospheric') || cls.includes('pseudo-satellite')) return 'haps'

  return null
}

// ---------------------------------------------------------------------------
// Sentences (top-level modules)
// Ordered roughly as they appear in a BESS BOM — deterministic sort is done
// by the builder, not here.
// ---------------------------------------------------------------------------

export const SENTENCES: HierarchySentence[] = [
  // ── BESS ─────────────────────────────────────────────────────────────────
  // Phase B Iter 2 (2026-05-11): all BESS sentences expanded for depth.
  // BoM target: 80-120 leaves vs ~21 from Iter 1.
  {
    id: 'battery_rack_assembly',
    label: 'Battery Rack Assembly',
    words: ['cell_string', 'rack_structure'],
    allowed_classes: ['bess'],
  },
  {
    id: 'battery_management_system_bms',
    label: 'Battery Management System (BMS)',
    // Iter 2: split into master / slave / communication words. A real BMS has
    // a master controller + isolators + current shunt; slave monitor ICs + balance
    // resistors + thermistors per rack; CAN/RS-485 transceivers + harness for
    // inter-rack comms. The single-pcb_controller stub massively under-counted.
    words: ['bms_master', 'bms_slave', 'bms_communication'],
    allowed_classes: ['bess'],
  },
  {
    id: 'power_conversion_system_pcs',
    label: 'Power Conversion System (PCS)',
    // Iter 2: add DC-link cap bank + IGBT power modules + AC filter + bushings.
    words: ['pcs_inverter_group', 'grid_transformer_group', 'pcs_power_stage', 'pcs_ac_filter'],
    allowed_classes: ['bess'],
  },
  {
    id: 'dc_distribution_switchgear',
    label: 'DC Distribution and Switchgear',
    // Iter 2: add earthing/grounding word (surge arrester, earth bus, EFR).
    words: ['dc_switching', 'dc_protection', 'dc_buswork', 'dc_earthing'],
    // BESS only — EV chargers have their own AC/DC distribution under charger_pcs.
    allowed_classes: ['bess'],
  },
  {
    id: 'thermal_management_system',
    label: 'Thermal Management System',
    // Iter 2: add hydraulic word (pump, reservoir, sensor) and cold-plate.
    words: ['active_cooling', 'passive_insulation', 'cooling_hydraulics'],
    // Active liquid cooling + insulation: BESS, edge AI server racks, EV chargers
    // (DC fast chargers liquid-cooled), HAPS payload thermal. NOT heat pump (it
    // has its own refrigerant_circuit / hydronic_circuit).
    allowed_classes: ['bess', 'edge_ai', 'ev_charger', 'haps'],
  },
  {
    id: 'fire_detection_and_suppression_system_fss',
    label: 'Fire Detection and Suppression System (FSS)',
    // Iter 2: add nozzle/discharge word + control panel word.
    words: ['suppression_hardware', 'detection_sensors', 'suppression_discharge', 'fss_panel'],
    // BESS-style fire suppression (NOVEC, gas detect, arc detect, suppression
    // pressure vessel). Also legitimate on EV chargers (containerised DC fast
    // chargers carry similar suppression). NOT bioreactors / vfarm / drones —
    // those have CO2 sensors / smoke sensors but NOT BESS-grade FSS.
    allowed_classes: ['bess', 'ev_charger'],
  },
  {
    id: 'energy_management_system_ems_scada',
    label: 'Energy Management System / SCADA',
    // Iter 2: add power supply word + metering word + monitoring word.
    words: ['ems_compute', 'ems_network', 'ems_power', 'ems_metering'],
    allowed_classes: ['bess'],
  },
  {
    id: 'container_enclosure_fit_out',
    label: 'Container Enclosure and Fit-Out',
    // Iter 2: add HVAC, lighting/power, security/access, earthing words.
    words: ['container_access', 'container_services', 'container_hvac', 'container_aux_power', 'container_security'],
    // Containerised systems: BESS containers, containerised EV chargers,
    // bioreactor skids (single-use bioreactor cleanrooms), vertical farm
    // shipping-container farms. NOT vehicle/airframe classes.
    allowed_classes: ['bess', 'ev_charger', 'bioreactor', 'vfarm'],
  },
  // ── Heat pump ─────────────────────────────────────────────────────────────
  {
    id: 'refrigerant_circuit',
    label: 'Refrigerant Circuit',
    words: ['refrigerant_cycle', 'compressor_word', 'heat_exchanger_word', 'expansion_valve_word', 'pressure_monitoring_word', 'fan_word', 'refrigerant_distribution'],
    allowed_classes: ['heat_pump'],
  },
  {
    id: 'hydronic_circuit',
    label: 'Hydronic Circuit',
    // Iter 2: add pump + safety + manifold words. Real hydronic circuit has
    // a circulator pump, pressure-relief valve, expansion vessel, isolation
    // valves, manifold/distributor, and pressure/temp gauge.
    words: ['hydronic_flow', 'hydronic_connections', 'hydronic_pump', 'hydronic_safety', 'hydronic_manifold'],
    allowed_classes: ['heat_pump'],
  },
  {
    id: 'heat_pump_controls',
    label: 'Heat Pump Controls',
    // Iter 2: split into compute + HMI + sensor + protection words.
    words: ['hp_controls_compute', 'hp_controls_hmi', 'hp_controls_sensors', 'hp_controls_protection'],
    allowed_classes: ['heat_pump'],
  },
  {
    id: 'heat_pump_enclosure',
    label: 'Heat Pump Enclosure and Frame',
    // Iter 2: add mounting / vibration + drainage words.
    words: ['hp_enclosure_structure', 'hp_enclosure_mounting', 'hp_enclosure_drainage'],
    allowed_classes: ['heat_pump'],
  },
  // ── Vertical farm ─────────────────────────────────────────────────────────
  // Iter 2 (2026-05-11): expanded each sentence with realistic ancillary
  // hardware — a vfarm has a tier irrigation manifold + drains + sensors,
  // not just a pump.
  {
    id: 'growing_rack_system',
    label: 'Growing Rack System',
    words: ['rack_structure_vfarm', 'tray_and_grow_media'],
    allowed_classes: ['vfarm'],
  },
  {
    id: 'lighting_system',
    label: 'Lighting System',
    words: ['lighting_fixtures', 'lighting_drivers'],
    allowed_classes: ['vfarm'],
  },
  {
    id: 'fertigation_loop',
    label: 'Fertigation Loop',
    words: ['fertigation_flow', 'fertigation_dosing', 'fertigation_sensors'],
    allowed_classes: ['vfarm'],
  },
  {
    id: 'hvac_co2_system',
    label: 'HVAC / CO2 Dosing System',
    words: ['hvac_flow', 'co2_dosing', 'hvac_filtration'],
    allowed_classes: ['vfarm'],
  },
  // ── Drone / UAV ───────────────────────────────────────────────────────────
  // Iter 2: real drone airframe has spar + landing skid + battery tray;
  // propulsion has motor + ESC + propeller; avionics has IMU + GPS + radio.
  {
    id: 'airframe_structure',
    label: 'Airframe Structure',
    words: ['airframe_body', 'airframe_landing', 'airframe_payload_bay'],
    allowed_classes: ['drone'],
  },
  {
    id: 'propulsion_system',
    label: 'Propulsion System',
    // Electric propulsion (motors + wiring) is shared between drones, AUVs
    // (thrusters), and HAPS (electric prop motors).
    // Iter 2: add propeller, retention, motor mount/bearing words.
    words: ['propulsion_motors', 'propulsion_propeller', 'propulsion_drive_train'],
    allowed_classes: ['drone', 'auv', 'haps'],
  },
  {
    id: 'flight_computer',
    label: 'Flight Computer and Avionics',
    // Avionics / nav-compute is shared by drones, AUVs (mission computer), HAPS.
    // Iter 2: add IMU/sensors + GNSS/radio + power management words.
    words: ['avionics_compute', 'avionics_imu_sensors', 'avionics_gnss_radio', 'avionics_power'],
    allowed_classes: ['drone', 'auv', 'haps'],
  },
  // ── EV Charger ───────────────────────────────────────────────────────────
  // Iter 2: a real DC fast charger has rectifier + DC-DC + filters + connector
  // assembly + HMI + payment + safety circuits. The 1-word stub was a sketch.
  {
    id: 'charger_power_conversion',
    label: 'Charger Power Conversion',
    words: ['charger_pcs', 'charger_dc_dc', 'charger_input_filter', 'charger_dc_link'],
    allowed_classes: ['ev_charger'],
  },
  {
    id: 'charger_enclosure',
    label: 'Charger Enclosure',
    words: ['charger_enclosure_structure', 'charger_hmi_payment', 'charger_safety', 'charger_cable_assembly'],
    allowed_classes: ['ev_charger'],
  },
  // ── Bioreactor ────────────────────────────────────────────────────────────
  // Iter 2: bioreactor_vessel needs CIP/SIP ports + sight glass + harvest
  // valve + sample port. Sensing needs pH + DO + level + foam separately.
  {
    id: 'bioreactor_vessel',
    label: 'Bioreactor Vessel',
    words: ['bioreactor_vessel_body', 'bioreactor_ports_and_valves', 'bioreactor_inspection'],
    allowed_classes: ['bioreactor'],
  },
  {
    id: 'bioreactor_controls',
    label: 'Bioreactor Controls and Sensing',
    words: ['bioreactor_sensing', 'bioreactor_process_control', 'bioreactor_calibration_loop'],
    allowed_classes: ['bioreactor'],
  },
  // Phase B Iter 1 (2026-05-11): bioprocess-specific sentence covering the
  // sterile-process subsystems that distinguish a single-use bioreactor skid
  // from a generic stirred tank: the agitator/impeller drive, sparger gas
  // delivery, single-use bag/sterilisation interface, and integrated thermal
  // jacket. bioreactor_vessel + bioreactor_controls only cover the static
  // body and the sensor stack — they miss the bioprocess machinery itself.
  {
    id: 'bioprocess_vessel',
    label: 'Bioprocess Vessel',
    words: ['agitation_drive_word', 'gas_sparger_word', 'thermal_jacket_word', 'single_use_bag_word'],
    allowed_classes: ['bioreactor'],
  },
  // ── Edge AI / AUV / CGM / HAPS ────────────────────────────────────────────
  // Iter 2: edge compute needs a power-stage word + thermal word for
  // the GPU/TPU board and storage (M.2 NVMe + DDR5).
  {
    id: 'edge_compute_system',
    label: 'Edge Compute System',
    words: ['edge_compute_hardware', 'edge_compute_storage', 'edge_compute_power', 'edge_compute_thermal'],
    // The on-board compute substrate is shared by edge AI servers, AUVs and
    // HAPS payloads. CGM has its own biosensor_system.
    allowed_classes: ['edge_ai', 'auv', 'haps'],
  },
  {
    id: 'hull_and_buoyancy',
    label: 'Hull and Buoyancy System',
    // Iter 2: AUV hull also has a frame, fairing, and mounting brackets
    // (subsea_pressure_vessel handles the depth-rated end caps + ballast).
    words: ['hull_structure', 'hull_frame_and_brackets', 'hull_fairing'],
    allowed_classes: ['auv'],
  },
  // Phase B Iter 1 (2026-05-11): domain-specific AUV sentence to deepen the
  // tree beyond hull_structure. A real AUV's pressure-vessel section is its
  // single most expensive subsystem (pressure-rated end caps, dive-rated
  // O-ring seals, ballast/buoyancy). hull_and_buoyancy currently flattens
  // the whole vehicle into one structural word; this sentence splits out
  // the pressure-vessel-specific characters that gate dive depth.
  {
    id: 'subsea_pressure_vessel',
    label: 'Subsea Pressure Vessel',
    words: ['pressure_hull_word', 'buoyancy_compensation_word'],
    allowed_classes: ['auv'],
  },
  {
    id: 'biosensor_system',
    label: 'Biosensor System',
    // Iter 2: a real CGM has electrode + analogue front-end + BLE SoC + antenna +
    // crystal + battery + accelerometer. Single-word stub was too thin.
    words: ['biosensor_hardware', 'biosensor_radio', 'biosensor_power', 'biosensor_motion'],
    allowed_classes: ['cgm'],
  },
  // Bug P0-5 fix (2026-05-11): a medical wearable (CGM patch) is not a
  // submarine — it must NOT decompose under hull_and_buoyancy. This sentence
  // is the wearable-specific enclosure with biocompatibility and disposable-
  // patch sub-archetypes.
  {
    id: 'medical_wearable_enclosure',
    label: 'Medical Wearable Enclosure',
    // Iter 2: a CGM patch has overmould + adhesive patch + applicator interface
    // + insertion needle. Two single-character words too thin.
    words: ['wearable_housing', 'wearable_skin_interface', 'wearable_applicator', 'wearable_overmould'],
    allowed_classes: ['cgm'],
  },
  {
    id: 'haps_airframe',
    label: 'HAPS Airframe',
    // Iter 2: HAPS airframe has ribs + skin + control surfaces (elevons,
    // ailerons) + servo actuators + mass-balance hardware.
    words: ['haps_structure', 'haps_control_surfaces', 'haps_servos'],
    allowed_classes: ['haps'],
  },
  // Phase B Iter 1 (2026-05-11): HAPS-specific power+thermal sentence. Real
  // HAPS aircraft (Airbus Zephyr, BAE PHASA-35, ESA-funded designs) are
  // defined by their wing-integrated photovoltaic array + Li-S/Li-ion night-
  // storage battery + ultra-light composite spar. The composite spar IS the
  // primary load path — and the PV array IS the wing skin. This sentence
  // captures the energy/airframe-coupled subsystem that has no analogue in
  // any other product class.
  {
    id: 'solar_electric_airframe',
    label: 'Solar-Electric Airframe',
    words: ['composite_spar_word', 'photovoltaic_array_word', 'night_storage_battery_word'],
    allowed_classes: ['haps'],
  },
]

// ---------------------------------------------------------------------------
// Words (subsystem groups within sentences)
// ---------------------------------------------------------------------------

export const WORDS: HierarchyWord[] = [
  // ── battery_rack_assembly ─────────────────────────────────────────────────
  // Iter 2: cell-string ancillaries (busbar links, compression pads, cell-top
  // cap), rack ancillaries (casters, earthing strap, lifting eye).
  {
    id: 'cell_string',
    label: 'Cell String',
    sentence_id: 'battery_rack_assembly',
    characters: ['lfp_prismatic_cell', 'cell_busbar_link', 'cell_compression_pad', 'cell_top_cap_assembly'],
  },
  {
    id: 'rack_structure',
    label: 'Rack Structure',
    sentence_id: 'battery_rack_assembly',
    characters: ['steel_rack_frame', 'rack_caster_wheel', 'rack_earthing_strap', 'rack_lifting_eye'],
  },
  // ── battery_management_system_bms ────────────────────────────────────────
  // Iter 2: split BMS into master + slave + comm, each with realistic part
  // counts. Master = controller + isolators + current shunt + voltage divider +
  // ESD diode + connector. Slave = cell-monitor IC + balance resistor +
  // thermistor + cell-tap connector. Comm = CAN transceiver + isolation IC +
  // harness + bus termination.
  {
    id: 'bms_master',
    label: 'BMS Master Controller',
    sentence_id: 'battery_management_system_bms',
    characters: ['pcb_controller', 'bms_isolation_ic', 'current_shunt_resistor', 'voltage_divider_resistor', 'esd_protection_diode', 'bms_master_connector'],
  },
  {
    id: 'bms_slave',
    label: 'BMS Slave Cell Monitors',
    sentence_id: 'battery_management_system_bms',
    // pcb_controller also used here — word distinguishes the role; cell-monitor
    // ICs (LTC6804/MAX17841 class), per-cell balance resistor, NTC thermistor
    // and cell-tap harness connector populate the slave board.
    characters: ['pcb_controller', 'bms_slave_monitor_ic', 'cell_balance_resistor', 'cell_thermistor_ntc', 'cell_tap_connector'],
  },
  {
    id: 'bms_communication',
    label: 'BMS Communication Bus',
    sentence_id: 'battery_management_system_bms',
    characters: ['can_transceiver_ic', 'isolation_transceiver_ic', 'bms_can_harness', 'can_termination_resistor'],
  },
  // ── power_conversion_system_pcs ──────────────────────────────────────────
  // Iter 2: add IGBT power stage + DC-link cap bank + AC filter + grid bushing.
  {
    id: 'pcs_inverter_group',
    label: 'PCS Inverter Group',
    sentence_id: 'power_conversion_system_pcs',
    characters: ['power_converter'],
  },
  {
    id: 'grid_transformer_group',
    label: 'Grid Step-up Transformer',
    sentence_id: 'power_conversion_system_pcs',
    // Iter 2 council fix (GLM): add ac_circuit_breaker (Siemens 3AH5 /
    // ABB VD4 class) for grid-side fault isolation. circuit_breaker in
    // dc_protection is DC-rated; grid side needs a separate AC unit.
    characters: ['transformer', 'transformer_bushing', 'tap_changer_assembly', 'ac_circuit_breaker'],
  },
  {
    id: 'pcs_power_stage',
    label: 'PCS Power Stage',
    sentence_id: 'power_conversion_system_pcs',
    // Iter 2 council fix (Gemini): gate_drive_isolated_dcdc added — IGBT
    // gate drivers need an isolated +15V/-8V supply (Murata MGJ2 / Recom
    // RxxP21503D class). Without it the gate driver board can't fire.
    characters: ['igbt_power_module', 'gate_driver_board', 'gate_drive_isolated_dcdc', 'dc_link_capacitor', 'snubber_capacitor'],
  },
  {
    id: 'pcs_ac_filter',
    label: 'PCS AC Filter and EMI',
    sentence_id: 'power_conversion_system_pcs',
    characters: ['ac_filter_inductor', 'ac_filter_capacitor', 'ac_emi_filter'],
  },
  // ── dc_distribution_switchgear ───────────────────────────────────────────
  // Iter 2: add fuse + isolator detail, surge arrester, earthing busbar, EFR.
  {
    id: 'dc_switching',
    label: 'DC Switching',
    sentence_id: 'dc_distribution_switchgear',
    characters: ['dc_contactor', 'dc_isolator_switch', 'dc_fuse_holder', 'dc_fuse_link'],
  },
  {
    id: 'dc_protection',
    label: 'DC Protection',
    sentence_id: 'dc_distribution_switchgear',
    characters: ['circuit_breaker', 'protection_relay', 'resistor', 'pre_charge_contactor'],
  },
  {
    id: 'dc_buswork',
    label: 'DC Buswork',
    sentence_id: 'dc_distribution_switchgear',
    characters: ['copper_busbar', 'busbar_support_insulator', 'busbar_heat_shrink'],
  },
  {
    id: 'dc_earthing',
    label: 'DC Earthing and Surge Protection',
    sentence_id: 'dc_distribution_switchgear',
    // Iter 2 council fix (Gemini): rename earth_fault_relay to
    // insulation_monitoring_device — Bender ISOMETER on a floating-IT BESS
    // DC bus is an IMD, not a passive EFR. The MPN hint and Grade-D entry
    // already named the Bender unit; the ID now matches the function.
    // Iter 2 council fix (Grok+Gemini+GLM): earthing_electrode_rod moved
    // here from container_security — earth rods are part of the bonding
    // and earthing system, not the security subsystem.
    characters: ['surge_arrester_dc', 'earthing_busbar', 'insulation_monitoring_device', 'earthing_lug', 'earthing_electrode_rod'],
  },
  // ── thermal_management_system ────────────────────────────────────────────
  // Iter 2: split out hydraulics (pump + reservoir + sensor) and cold plate.
  {
    id: 'active_cooling',
    label: 'Active Liquid Cooling',
    sentence_id: 'thermal_management_system',
    characters: ['liquid_cooling_system', 'cold_plate', 'coolant_distribution_manifold'],
  },
  {
    id: 'passive_insulation',
    label: 'Passive Thermal Insulation',
    sentence_id: 'thermal_management_system',
    characters: ['thermal_insulation_panel', 'aluminium_heatsink', 'thermal_interface_material'],
  },
  {
    id: 'cooling_hydraulics',
    label: 'Coolant Hydraulics',
    sentence_id: 'thermal_management_system',
    characters: ['coolant_pump', 'coolant_reservoir_tank', 'coolant_temperature_sensor', 'coolant_flow_switch'],
  },
  // ── fire_detection_and_suppression_system_fss ────────────────────────────
  // Iter 2: add discharge-side hardware (nozzle, manifold) and FSS panel.
  {
    id: 'suppression_hardware',
    label: 'Suppression Hardware',
    sentence_id: 'fire_detection_and_suppression_system_fss',
    characters: ['fire_suppression_system', 'pressure_vessel', 'pressure_gauge_fss'],
  },
  {
    id: 'detection_sensors',
    label: 'Detection Sensors',
    sentence_id: 'fire_detection_and_suppression_system_fss',
    characters: ['gas_sensor', 'optical_arc_sensor', 'smoke_detector_aspirating', 'thermal_linear_detector'],
  },
  {
    id: 'suppression_discharge',
    label: 'Suppression Discharge Hardware',
    sentence_id: 'fire_detection_and_suppression_system_fss',
    characters: ['suppression_nozzle', 'suppression_discharge_pipe', 'manual_pull_station'],
  },
  {
    id: 'fss_panel',
    label: 'FSS Control Panel',
    sentence_id: 'fire_detection_and_suppression_system_fss',
    characters: ['fss_control_panel', 'fss_alarm_strobe', 'fss_warning_horn'],
  },
  // ── energy_management_system_ems_scada ───────────────────────────────────
  // Iter 2: split into compute / network / power / metering. EMS panel needs
  // its own 24 V PSU, a cellular gateway, revenue-grade meter + CTs.
  {
    id: 'ems_compute',
    label: 'EMS / SCADA Compute',
    sentence_id: 'energy_management_system_ems_scada',
    characters: ['ems_controller', 'ems_hmi_panel'],
  },
  {
    id: 'ems_network',
    label: 'EMS Network Infrastructure',
    sentence_id: 'energy_management_system_ems_scada',
    characters: ['network_switch', 'power_converter', 'ems_gateway_modem', 'ems_fibre_patch_panel'],
  },
  {
    id: 'ems_power',
    label: 'EMS Power Supply',
    sentence_id: 'energy_management_system_ems_scada',
    characters: ['ems_psu_24v', 'ups_module', 'mcb_low_voltage'],
  },
  {
    id: 'ems_metering',
    label: 'Revenue Metering and Monitoring',
    sentence_id: 'energy_management_system_ems_scada',
    characters: ['revenue_meter', 'metering_ct', 'monitoring_relay'],
  },
  // ── container_enclosure_fit_out ──────────────────────────────────────────
  // Iter 2: a real BESS container has internal HVAC, lighting, sockets,
  // CCTV, intrusion sensors, access reader, and earthing electrodes.
  {
    id: 'container_access',
    label: 'Container Access',
    sentence_id: 'container_enclosure_fit_out',
    characters: ['steel_door', 'door_intrusion_switch', 'access_control_reader'],
  },
  {
    id: 'container_services',
    label: 'Container Services',
    sentence_id: 'container_enclosure_fit_out',
    // Iter 2 council fix (GLM): container_iso_shell added — the literal
    // ISO 20'/40' steel container the BoM is named after. Was implicit
    // before via switchboard_enclosure but a real BESS BoM lists it as a
    // distinct line item (~£8-12k for a custom-fit-out 40' container).
    characters: ['cable_transit_frame', 'switchboard_enclosure', 'thermal_insulation_panel', 'cable_tray', 'cable_gland', 'container_iso_shell'],
  },
  {
    id: 'container_hvac',
    label: 'Container HVAC',
    sentence_id: 'container_enclosure_fit_out',
    characters: ['hvac_split_unit', 'hvac_condensate_pump', 'hvac_thermostat'],
  },
  {
    id: 'container_aux_power',
    label: 'Container Auxiliary Power and Lighting',
    sentence_id: 'container_enclosure_fit_out',
    characters: ['interior_led_luminaire', 'emergency_light', 'convenience_outlet', 'distribution_board_aux'],
  },
  {
    id: 'container_security',
    label: 'Container Security',
    sentence_id: 'container_enclosure_fit_out',
    // Iter 2 council fix (Grok+Gemini+GLM): earthing_electrode_rod moved
    // to dc_earthing — it's site bonding/earthing, not security. Replaced
    // with PIR intrusion detector to give the security word real depth.
    characters: ['cctv_camera', 'intrusion_detector_pir'],
  },
  // ── refrigerant_circuit ──────────────────────────────────────────────────
  // Bug P0-6 fix (2026-05-11): a real 30 kW R290 heat pump's refrigerant
  // circuit decomposes into compressor + heat exchanger + expansion valve +
  // pressure monitoring + fan, not just "liquid_cooling_system".
  {
    id: 'refrigerant_cycle',
    label: 'Refrigerant Cycle',
    sentence_id: 'refrigerant_circuit',
    characters: ['liquid_cooling_system'],
  },
  {
    id: 'compressor_word',
    label: 'Compressor',
    sentence_id: 'refrigerant_circuit',
    characters: ['compressor_unit', 'refrigerant_lubricant'],
  },
  {
    id: 'heat_exchanger_word',
    label: 'Heat Exchanger',
    sentence_id: 'refrigerant_circuit',
    characters: ['evaporator', 'condenser'],
  },
  {
    id: 'expansion_valve_word',
    label: 'Expansion Valve and Drier',
    sentence_id: 'refrigerant_circuit',
    characters: ['txv_or_eev', 'refrigerant_drier_filter'],
  },
  {
    id: 'pressure_monitoring_word',
    label: 'Pressure Monitoring',
    sentence_id: 'refrigerant_circuit',
    characters: ['high_pressure_transducer', 'low_pressure_transducer', 'safety_pressure_switch'],
  },
  {
    id: 'fan_word',
    label: 'EC Fan',
    sentence_id: 'refrigerant_circuit',
    characters: ['ec_fan_motor', 'fan_impeller'],
  },
  {
    id: 'refrigerant_distribution',
    label: 'Refrigerant Distribution',
    sentence_id: 'refrigerant_circuit',
    characters: ['copper_wire', 'polymer_gasket'],
  },
  // ── hydronic_circuit ─────────────────────────────────────────────────────
  // Iter 2: real hydronic side has circulator pump + expansion vessel + PRV +
  // isolation valves + manifold + flow/temp gauge.
  {
    id: 'hydronic_flow',
    label: 'Hydronic Flow',
    sentence_id: 'hydronic_circuit',
    characters: ['liquid_cooling_system', 'hydronic_flow_meter'],
  },
  {
    id: 'hydronic_connections',
    label: 'Hydronic Connections',
    sentence_id: 'hydronic_circuit',
    characters: ['copper_terminal', 'polymer_gasket', 'copper_wire', 'hydronic_isolation_valve'],
  },
  {
    id: 'hydronic_pump',
    label: 'Hydronic Circulator Pump',
    sentence_id: 'hydronic_circuit',
    characters: ['hydronic_circulator_pump', 'pump_motor_capacitor'],
  },
  {
    id: 'hydronic_safety',
    label: 'Hydronic Safety',
    sentence_id: 'hydronic_circuit',
    characters: ['expansion_vessel', 'pressure_relief_valve', 'air_separator_vent'],
  },
  {
    id: 'hydronic_manifold',
    label: 'Hydronic Manifold and Distribution',
    sentence_id: 'hydronic_circuit',
    characters: ['hydronic_manifold', 'thermal_balance_valve', 'hydronic_pressure_gauge'],
  },
  // ── heat_pump_controls ───────────────────────────────────────────────────
  // Iter 2: split into compute / HMI / sensors / protection.
  {
    id: 'hp_controls_compute',
    label: 'HP Controls Compute',
    sentence_id: 'heat_pump_controls',
    characters: ['pcb_controller', 'hp_relay_board'],
  },
  {
    id: 'hp_controls_hmi',
    label: 'HP Controls HMI',
    sentence_id: 'heat_pump_controls',
    characters: ['hp_hmi_display', 'hp_user_interface_pcb'],
  },
  {
    id: 'hp_controls_sensors',
    label: 'HP Controls Sensors',
    sentence_id: 'heat_pump_controls',
    characters: ['water_temperature_sensor_ntc', 'outdoor_temp_sensor', 'defrost_sensor'],
  },
  {
    id: 'hp_controls_protection',
    label: 'HP Controls Protection',
    sentence_id: 'heat_pump_controls',
    characters: ['safety_relay_compressor', 'flow_switch_safety', 'high_limit_thermostat'],
  },
  // ── heat_pump_enclosure ──────────────────────────────────────────────────
  // Iter 2: add mounting / vibration isolators + drainage / drip tray.
  {
    id: 'hp_enclosure_structure',
    label: 'HP Enclosure and Frame',
    sentence_id: 'heat_pump_enclosure',
    characters: ['polymer_enclosure', 'aluminium_extrusion', 'steel_plate', 'steel_bolt'],
  },
  {
    id: 'hp_enclosure_mounting',
    label: 'HP Mounting and Vibration Isolation',
    sentence_id: 'heat_pump_enclosure',
    characters: ['vibration_isolator_mount', 'wall_bracket_assembly'],
  },
  {
    id: 'hp_enclosure_drainage',
    label: 'HP Condensate Drainage',
    sentence_id: 'heat_pump_enclosure',
    characters: ['condensate_drip_tray', 'condensate_drain_hose', 'condensate_heater_strip'],
  },
  // ── growing_rack_system ──────────────────────────────────────────────────
  // Iter 2: add tray + grow media (rockwool/coco/peat puck), pump fittings.
  {
    id: 'rack_structure_vfarm',
    label: 'Growing Rack Structure',
    sentence_id: 'growing_rack_system',
    characters: ['aluminium_extrusion', 'steel_bolt', 'rack_caster_wheel'],
  },
  {
    id: 'tray_and_grow_media',
    label: 'Growing Tray and Media',
    sentence_id: 'growing_rack_system',
    characters: ['growing_tray_polymer', 'grow_media_rockwool'],
  },
  // ── lighting_system ──────────────────────────────────────────────────────
  // Iter 2: split LED fixture from driver/PSU.
  {
    id: 'lighting_fixtures',
    label: 'Lighting Fixtures',
    sentence_id: 'lighting_system',
    characters: ['pcb_controller', 'copper_wire', 'led_grow_module'],
  },
  {
    id: 'lighting_drivers',
    label: 'Lighting Drivers',
    sentence_id: 'lighting_system',
    characters: ['led_constant_current_driver', 'lighting_dali_controller'],
  },
  // ── fertigation_loop ─────────────────────────────────────────────────────
  // Iter 2: dosing pump, EC/pH sensors.
  {
    id: 'fertigation_flow',
    label: 'Fertigation Flow',
    sentence_id: 'fertigation_loop',
    characters: ['liquid_cooling_system', 'polymer_gasket', 'copper_wire'],
  },
  {
    id: 'fertigation_dosing',
    label: 'Fertigation Dosing',
    sentence_id: 'fertigation_loop',
    characters: ['nutrient_dosing_pump', 'nutrient_reservoir_tank'],
  },
  {
    id: 'fertigation_sensors',
    label: 'Fertigation Sensors',
    sentence_id: 'fertigation_loop',
    characters: ['ec_conductivity_sensor', 'ph_sensor_inline', 'water_temperature_sensor_ntc'],
  },
  // ── hvac_co2_system ──────────────────────────────────────────────────────
  {
    id: 'hvac_flow',
    label: 'HVAC Flow',
    sentence_id: 'hvac_co2_system',
    characters: ['liquid_cooling_system', 'copper_wire', 'duct_fan_ec'],
  },
  {
    id: 'co2_dosing',
    label: 'CO2 Dosing',
    sentence_id: 'hvac_co2_system',
    characters: ['pressure_vessel', 'gas_sensor', 'co2_solenoid_valve'],
  },
  {
    id: 'hvac_filtration',
    label: 'HVAC Filtration',
    sentence_id: 'hvac_co2_system',
    characters: ['hepa_filter_element', 'pre_filter_g4'],
  },
  // ── airframe_structure ────────────────────────────────────────────────────
  // Iter 2: a real drone airframe has spar + landing gear + battery tray +
  // payload bay, plus a battery hold-down strap.
  {
    id: 'airframe_body',
    label: 'Airframe Body',
    sentence_id: 'airframe_structure',
    characters: ['aluminium_extrusion', 'steel_bolt', 'polymer_enclosure', 'carbon_fibre_arm'],
  },
  {
    id: 'airframe_landing',
    label: 'Landing Gear',
    sentence_id: 'airframe_structure',
    characters: ['landing_skid_polymer', 'landing_gear_strut'],
  },
  {
    id: 'airframe_payload_bay',
    label: 'Payload Bay and Battery Tray',
    sentence_id: 'airframe_structure',
    characters: ['battery_tray_polymer', 'battery_strap_velcro', 'payload_release_servo'],
  },
  // ── propulsion_system ────────────────────────────────────────────────────
  // Iter 2: split out propeller + drive train (motor mount, bearing).
  {
    id: 'propulsion_motors',
    label: 'Propulsion Motors',
    sentence_id: 'propulsion_system',
    characters: ['power_converter', 'copper_wire', 'brushless_dc_motor', 'electronic_speed_controller'],
  },
  {
    id: 'propulsion_propeller',
    label: 'Propeller and Hub',
    sentence_id: 'propulsion_system',
    characters: ['propeller_carbon_blade', 'propeller_retention_nut', 'propeller_hub'],
  },
  {
    id: 'propulsion_drive_train',
    label: 'Motor Mount and Bearing',
    sentence_id: 'propulsion_system',
    characters: ['motor_mount_aluminium', 'motor_bearing_set', 'propulsion_current_sensor'],
  },
  // ── flight_computer ──────────────────────────────────────────────────────
  // Iter 2: split out IMU/sensors, GNSS/radio, power management.
  {
    id: 'avionics_compute',
    label: 'Avionics Compute',
    sentence_id: 'flight_computer',
    characters: ['pcb_controller', 'network_switch'],
  },
  {
    id: 'avionics_imu_sensors',
    label: 'IMU and Sensor Stack',
    sentence_id: 'flight_computer',
    characters: ['imu_6dof_module', 'magnetometer_3axis', 'barometer_pressure_sensor'],
  },
  {
    id: 'avionics_gnss_radio',
    label: 'GNSS and Telemetry Radios',
    sentence_id: 'flight_computer',
    characters: ['gnss_receiver_module', 'telemetry_radio_modem', 'rc_receiver_module', 'antenna_pcb'],
  },
  {
    id: 'avionics_power',
    label: 'Avionics Power Management',
    sentence_id: 'flight_computer',
    characters: ['avionics_pdb', 'avionics_bec_5v', 'avionics_current_sensor'],
  },
  // ── charger_power_conversion ─────────────────────────────────────────────
  // Iter 2: split into rectifier (PFC), DC-DC, input filter, DC-link.
  {
    id: 'charger_pcs',
    label: 'Charger PCS',
    sentence_id: 'charger_power_conversion',
    characters: ['power_converter', 'transformer', 'circuit_breaker', 'pfc_inductor'],
  },
  {
    id: 'charger_dc_dc',
    label: 'Charger DC-DC Stage',
    sentence_id: 'charger_power_conversion',
    characters: ['dc_dc_module', 'igbt_power_module', 'gate_driver_board'],
  },
  {
    id: 'charger_input_filter',
    label: 'Charger Input Filter',
    sentence_id: 'charger_power_conversion',
    characters: ['ac_emi_filter', 'inrush_current_limiter', 'input_contactor'],
  },
  {
    id: 'charger_dc_link',
    label: 'Charger DC Link',
    sentence_id: 'charger_power_conversion',
    characters: ['dc_link_capacitor', 'dc_link_busbar', 'dc_link_voltage_sensor'],
  },
  // ── charger_enclosure ────────────────────────────────────────────────────
  // Iter 2: HMI + payment + safety + cable assembly + RCD/RFID.
  {
    id: 'charger_enclosure_structure',
    label: 'Charger Enclosure',
    sentence_id: 'charger_enclosure',
    characters: ['switchboard_enclosure', 'polymer_enclosure'],
  },
  {
    id: 'charger_hmi_payment',
    label: 'Charger HMI and Payment',
    sentence_id: 'charger_enclosure',
    characters: ['hmi_capacitive_touch_panel', 'rfid_reader_module', 'payment_terminal_module'],
  },
  {
    id: 'charger_safety',
    label: 'Charger Safety Circuits',
    sentence_id: 'charger_enclosure',
    characters: ['rcd_type_b_module', 'emergency_stop_button', 'door_interlock_switch'],
  },
  {
    id: 'charger_cable_assembly',
    label: 'Charger Cable and Connector',
    sentence_id: 'charger_enclosure',
    characters: ['ccs_charging_cable', 'ccs_connector_assembly', 'cable_management_arm'],
  },
  // ── bioreactor_vessel ────────────────────────────────────────────────────
  // Iter 2: real bioreactor vessel needs sample/CIP/SIP ports + sight glass.
  {
    id: 'bioreactor_vessel_body',
    label: 'Bioreactor Vessel Body',
    sentence_id: 'bioreactor_vessel',
    characters: ['pressure_vessel', 'polymer_gasket', 'steel_plate'],
  },
  {
    id: 'bioreactor_ports_and_valves',
    label: 'Bioreactor Ports and Valves',
    sentence_id: 'bioreactor_vessel',
    characters: ['cip_sip_port_assembly', 'sample_port_aseptic', 'harvest_valve_sanitary', 'tri_clamp_fitting'],
  },
  {
    id: 'bioreactor_inspection',
    label: 'Bioreactor Inspection and Lighting',
    sentence_id: 'bioreactor_vessel',
    characters: ['sight_glass_assembly', 'vessel_inspection_light'],
  },
  // ── bioreactor_controls ──────────────────────────────────────────────────
  // Iter 2: split into sensors / process controllers / calibration loop.
  {
    id: 'bioreactor_sensing',
    label: 'Bioreactor Sensing',
    sentence_id: 'bioreactor_controls',
    characters: ['gas_sensor', 'pcb_controller', 'optical_arc_sensor', 'ph_probe_sterilisable', 'do_probe_optical', 'level_sensor_capacitive'],
  },
  {
    id: 'bioreactor_process_control',
    label: 'Bioreactor Process Control',
    sentence_id: 'bioreactor_controls',
    characters: ['mass_flow_controller_gas', 'peristaltic_dosing_pump', 'foam_breaker_actuator'],
  },
  {
    id: 'bioreactor_calibration_loop',
    label: 'Bioreactor Calibration Loop',
    sentence_id: 'bioreactor_controls',
    characters: ['calibration_buffer_kit', 'temperature_calibration_probe'],
  },
  // ── bioprocess_vessel (Phase B Iter 1, 2026-05-11) ───────────────────────
  // Sterile bioprocess machinery: agitator drive, sparger, thermal jacket,
  // single-use bag interface. New function-class IDs:
  //   - 'sterile_agitator_drive' (electromechanical_switching_function +
  //     mechanical_kinetic_function radicals)
  //   - 'gas_sparger_assembly' (chemical_sensing_function + fluid_flow_state)
  //   - 'thermal_jacket' (thermal_transfer_function + steel)
  //   - 'single_use_biocompatible_bag' (polymer_thermoplastic, sterile-grade)
  //   - 'sterile_filter_membrane' (polymer_thermoplastic, 0.2 um filter)
  // All ride existing radicals.
  {
    id: 'agitation_drive_word',
    label: 'Sterile Agitator Drive',
    sentence_id: 'bioprocess_vessel',
    characters: ['sterile_agitator_drive', 'pcb_controller'],
  },
  {
    id: 'gas_sparger_word',
    label: 'Gas Sparger and Sterile Filter',
    sentence_id: 'bioprocess_vessel',
    characters: ['gas_sparger_assembly', 'sterile_filter_membrane', 'gas_sensor'],
  },
  {
    id: 'thermal_jacket_word',
    label: 'Integrated Thermal Jacket',
    sentence_id: 'bioprocess_vessel',
    characters: ['thermal_jacket', 'steel_plate'],
  },
  {
    id: 'single_use_bag_word',
    label: 'Single-Use Biocompatible Bag',
    sentence_id: 'bioprocess_vessel',
    characters: ['single_use_biocompatible_bag', 'polymer_gasket'],
  },
  // ── edge_compute_system ──────────────────────────────────────────────────
  // Iter 2: real edge AI server has GPU + storage (NVMe) + DDR5 + PSU + fan.
  {
    id: 'edge_compute_hardware',
    label: 'Edge Compute Hardware',
    sentence_id: 'edge_compute_system',
    characters: ['pcb_controller', 'network_switch', 'copper_wire', 'gpu_accelerator_module', 'ddr5_dimm_module'],
  },
  {
    id: 'edge_compute_storage',
    label: 'Edge Compute Storage',
    sentence_id: 'edge_compute_system',
    characters: ['nvme_ssd_module', 'sata_storage_drive'],
  },
  {
    id: 'edge_compute_power',
    label: 'Edge Compute Power Supply',
    sentence_id: 'edge_compute_system',
    characters: ['server_psu_redundant', 'pdu_rack_outlet'],
  },
  {
    id: 'edge_compute_thermal',
    label: 'Edge Compute Thermal',
    sentence_id: 'edge_compute_system',
    characters: ['cooling_fan_axial', 'thermal_interface_material'],
  },
  // ── hull_and_buoyancy ────────────────────────────────────────────────────
  // Iter 2: AUV hull also has frame + brackets + fairing.
  {
    id: 'hull_structure',
    label: 'Hull Structure',
    sentence_id: 'hull_and_buoyancy',
    characters: ['polymer_enclosure', 'aluminium_extrusion', 'polymer_gasket'],
  },
  {
    id: 'hull_frame_and_brackets',
    label: 'Hull Frame and Brackets',
    sentence_id: 'hull_and_buoyancy',
    characters: ['hull_internal_frame', 'instrument_mount_bracket'],
  },
  {
    id: 'hull_fairing',
    label: 'Hull Fairing',
    sentence_id: 'hull_and_buoyancy',
    characters: ['hydrodynamic_fairing', 'antifouling_coating'],
  },
  // ── subsea_pressure_vessel (Phase B Iter 1, 2026-05-11) ──────────────────
  // Pressure-rated end caps + dive-rated O-rings + structural ribs. Reuses
  // existing characters (no new radicals) plus two new function-class IDs:
  //   - 'pressure_rated_endcap' (pressure_vessel_function + steel/aluminium)
  //   - 'dive_oring_seal' (polymer_thermoplastic + sealing function)
  // Both ride on existing radicals via the convention used elsewhere in this
  // file — full Character entries are not required for hierarchy routing.
  {
    id: 'pressure_hull_word',
    label: 'Pressure Hull and End Caps',
    sentence_id: 'subsea_pressure_vessel',
    characters: ['pressure_rated_endcap', 'dive_oring_seal', 'aluminium_extrusion', 'pressure_vessel'],
  },
  {
    id: 'buoyancy_compensation_word',
    label: 'Buoyancy Compensation and Ballast',
    sentence_id: 'subsea_pressure_vessel',
    // Syntactic foam block + ballast trim weight + buoyancy control valve.
    // Reuses steel_plate (trim weights) + polymer_gasket (foam encapsulation seals).
    characters: ['syntactic_foam_block', 'ballast_trim_weight', 'steel_plate', 'polymer_gasket'],
  },
  // ── biosensor_system ─────────────────────────────────────────────────────
  // Iter 2: real CGM hardware = electrode + AFE + BLE SoC + antenna + crystal +
  // battery + accelerometer. Single-word stub was a sketch.
  {
    id: 'biosensor_hardware',
    label: 'Biosensor Hardware',
    sentence_id: 'biosensor_system',
    characters: ['pcb_controller', 'copper_wire', 'glucose_electrode_strip', 'analogue_front_end_ic'],
  },
  {
    id: 'biosensor_radio',
    label: 'Biosensor Radio and Antenna',
    sentence_id: 'biosensor_system',
    characters: ['ble_soc_module', 'antenna_pcb', 'radio_crystal_oscillator'],
  },
  {
    id: 'biosensor_power',
    label: 'Biosensor Power',
    sentence_id: 'biosensor_system',
    characters: ['coin_cell_battery_cr1632', 'biosensor_regulator_ldo'],
  },
  {
    id: 'biosensor_motion',
    label: 'Biosensor Motion Sensing',
    sentence_id: 'biosensor_system',
    characters: ['accelerometer_3axis_lp'],
  },
  // ── medical_wearable_enclosure ───────────────────────────────────────────
  // Bug P0-5 fix: CGM-class enclosure characters must NOT map to
  // hull_structure (under hull_and_buoyancy / AUV).
  // Iter 2: a CGM patch has overmould (silicone) + adhesive patch + applicator
  // interface + insertion needle.
  {
    id: 'wearable_housing',
    label: 'Wearable Housing',
    sentence_id: 'medical_wearable_enclosure',
    characters: ['polymer_enclosure'],
  },
  {
    id: 'wearable_skin_interface',
    label: 'Skin Interface and Sealing',
    sentence_id: 'medical_wearable_enclosure',
    characters: ['polymer_gasket', 'adhesive_skin_patch'],
  },
  {
    id: 'wearable_applicator',
    label: 'Wearable Applicator',
    sentence_id: 'medical_wearable_enclosure',
    characters: ['applicator_housing_polymer', 'insertion_needle_assembly'],
  },
  {
    id: 'wearable_overmould',
    label: 'Wearable Overmould',
    sentence_id: 'medical_wearable_enclosure',
    characters: ['silicone_overmould', 'biocompatible_label_layer'],
  },
  // ── haps_airframe ────────────────────────────────────────────────────────
  // Iter 2: add ribs / control surfaces / servos.
  {
    id: 'haps_structure',
    label: 'HAPS Airframe Structure',
    sentence_id: 'haps_airframe',
    characters: ['aluminium_extrusion', 'steel_bolt', 'polymer_enclosure', 'haps_rib_assembly', 'haps_skin_film'],
  },
  {
    id: 'haps_control_surfaces',
    label: 'HAPS Control Surfaces',
    sentence_id: 'haps_airframe',
    characters: ['haps_elevon_assembly', 'haps_aileron_assembly', 'mass_balance_weight'],
  },
  {
    id: 'haps_servos',
    label: 'HAPS Servo Actuators',
    sentence_id: 'haps_airframe',
    characters: ['servo_actuator_high_torque', 'servo_pushrod_carbon'],
  },
  // ── solar_electric_airframe (Phase B Iter 1, 2026-05-11) ─────────────────
  // Wing-integrated PV + composite spar + Li-S night-storage battery —
  // tightly coupled airframe-energy subsystem unique to HAPS / stratospheric
  // pseudo-satellite craft. New function-class IDs:
  //   - 'composite_spar' (carbon_fibre_composite radical, structural)
  //   - 'wing_integrated_pv_module' (silicon_semiconductor_function +
  //     optical_transduction_function radicals — already in library)
  //   - 'lithium_sulfur_night_battery' (electrochemical_energy_function radical)
  //   - 'mppt_charge_controller' (silicon_semiconductor_function +
  //     digital_logic_function radicals)
  // All characters reuse the 22 existing radicals via the same string-only
  // hierarchy convention used by the heat-pump and AUV characters.
  {
    id: 'composite_spar_word',
    label: 'Composite Spar and Wing Skin',
    sentence_id: 'solar_electric_airframe',
    characters: ['composite_spar', 'aluminium_extrusion', 'polymer_enclosure'],
  },
  {
    id: 'photovoltaic_array_word',
    label: 'Wing-Integrated Photovoltaic Array',
    sentence_id: 'solar_electric_airframe',
    characters: ['wing_integrated_pv_module', 'mppt_charge_controller', 'copper_wire'],
  },
  {
    id: 'night_storage_battery_word',
    label: 'Night-Storage Battery Pack',
    sentence_id: 'solar_electric_airframe',
    characters: ['lithium_sulfur_night_battery', 'pcb_controller'],
  },
  // ── Seed-only characters with no domain-specific parent yet ──────────────
  // These appear in multiple product classes — they route to their nearest sentence
  // via the word that contains them. Fallback for builder: 'unknown_subsystem'.
  {
    id: 'steel_bolt_generic',
    label: 'Generic Steel Fasteners',
    sentence_id: 'container_enclosure_fit_out',
    characters: ['steel_bolt', 'steel_threaded_rod'],
  },
  {
    id: 'copper_wire_generic',
    label: 'Generic Cable Runs',
    sentence_id: 'container_enclosure_fit_out',
    characters: ['copper_wire', 'copper_terminal'],
  },
]

// ---------------------------------------------------------------------------
// Lookup helpers (built once, used by structural-builder)
// ---------------------------------------------------------------------------

/** Map from character ID → all words that contain it. */
export function buildCharacterToWords(): Map<string, HierarchyWord[]> {
  const map = new Map<string, HierarchyWord[]>()
  for (const word of WORDS) {
    for (const charId of word.characters) {
      const existing = map.get(charId) ?? []
      existing.push(word)
      map.set(charId, existing)
    }
  }
  return map
}

/** Map from word ID → sentence. */
export function buildWordToSentence(): Map<string, HierarchySentence> {
  const map = new Map<string, HierarchySentence>()
  const sentenceById = new Map<string, HierarchySentence>(SENTENCES.map(s => [s.id, s]))
  for (const word of WORDS) {
    const sentence = sentenceById.get(word.sentence_id)
    if (sentence) map.set(word.id, sentence)
  }
  return map
}

/** Map from sentence ID → HierarchySentence. */
export const SENTENCE_BY_ID: Map<string, HierarchySentence> = new Map(
  SENTENCES.map(s => [s.id, s])
)

/** Map from word ID → HierarchyWord. */
export const WORD_BY_ID: Map<string, HierarchyWord> = new Map(
  WORDS.map(w => [w.id, w])
)

/** Total character → word mappings in the hierarchy. */
export const HIERARCHY_STATS = {
  sentences: SENTENCES.length,
  words: WORDS.length,
  characterMappings: WORDS.reduce((n, w) => n + w.characters.length, 0),
}
