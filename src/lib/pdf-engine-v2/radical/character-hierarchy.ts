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
}

// ---------------------------------------------------------------------------
// Sentences (top-level modules)
// Ordered roughly as they appear in a BESS BOM — deterministic sort is done
// by the builder, not here.
// ---------------------------------------------------------------------------

export const SENTENCES: HierarchySentence[] = [
  // ── BESS ─────────────────────────────────────────────────────────────────
  {
    id: 'battery_rack_assembly',
    label: 'Battery Rack Assembly',
    words: ['cell_string', 'rack_structure'],
  },
  {
    id: 'battery_management_system_bms',
    label: 'Battery Management System (BMS)',
    words: ['bms_master', 'bms_slave'],
  },
  {
    id: 'power_conversion_system_pcs',
    label: 'Power Conversion System (PCS)',
    words: ['pcs_inverter_group', 'grid_transformer_group'],
  },
  {
    id: 'dc_distribution_switchgear',
    label: 'DC Distribution and Switchgear',
    words: ['dc_switching', 'dc_protection', 'dc_buswork'],
  },
  {
    id: 'thermal_management_system',
    label: 'Thermal Management System',
    words: ['active_cooling', 'passive_insulation'],
  },
  {
    id: 'fire_detection_and_suppression_system_fss',
    label: 'Fire Detection and Suppression System (FSS)',
    words: ['suppression_hardware', 'detection_sensors'],
  },
  {
    id: 'energy_management_system_ems_scada',
    label: 'Energy Management System / SCADA',
    words: ['ems_compute', 'ems_network'],
  },
  {
    id: 'container_enclosure_fit_out',
    label: 'Container Enclosure and Fit-Out',
    words: ['container_access', 'container_services'],
  },
  // ── Heat pump ─────────────────────────────────────────────────────────────
  {
    id: 'refrigerant_circuit',
    label: 'Refrigerant Circuit',
    words: ['refrigerant_cycle', 'refrigerant_distribution'],
  },
  {
    id: 'hydronic_circuit',
    label: 'Hydronic Circuit',
    words: ['hydronic_flow', 'hydronic_connections'],
  },
  {
    id: 'heat_pump_controls',
    label: 'Heat Pump Controls',
    words: ['hp_controls_compute'],
  },
  {
    id: 'heat_pump_enclosure',
    label: 'Heat Pump Enclosure and Frame',
    words: ['hp_enclosure_structure'],
  },
  // ── Vertical farm ─────────────────────────────────────────────────────────
  {
    id: 'growing_rack_system',
    label: 'Growing Rack System',
    words: ['rack_structure_vfarm'],
  },
  {
    id: 'lighting_system',
    label: 'Lighting System',
    words: ['lighting_fixtures'],
  },
  {
    id: 'fertigation_loop',
    label: 'Fertigation Loop',
    words: ['fertigation_flow'],
  },
  {
    id: 'hvac_co2_system',
    label: 'HVAC / CO2 Dosing System',
    words: ['hvac_flow', 'co2_dosing'],
  },
  // ── Drone / UAV ───────────────────────────────────────────────────────────
  {
    id: 'airframe_structure',
    label: 'Airframe Structure',
    words: ['airframe_body'],
  },
  {
    id: 'propulsion_system',
    label: 'Propulsion System',
    words: ['propulsion_motors'],
  },
  {
    id: 'flight_computer',
    label: 'Flight Computer and Avionics',
    words: ['avionics_compute'],
  },
  // ── EV Charger ───────────────────────────────────────────────────────────
  {
    id: 'charger_power_conversion',
    label: 'Charger Power Conversion',
    words: ['charger_pcs'],
  },
  {
    id: 'charger_enclosure',
    label: 'Charger Enclosure',
    words: ['charger_enclosure_structure'],
  },
  // ── Bioreactor ────────────────────────────────────────────────────────────
  {
    id: 'bioreactor_vessel',
    label: 'Bioreactor Vessel',
    words: ['bioreactor_vessel_body'],
  },
  {
    id: 'bioreactor_controls',
    label: 'Bioreactor Controls and Sensing',
    words: ['bioreactor_sensing'],
  },
  // ── Edge AI / AUV / CGM / HAPS ────────────────────────────────────────────
  {
    id: 'edge_compute_system',
    label: 'Edge Compute System',
    words: ['edge_compute_hardware'],
  },
  {
    id: 'hull_and_buoyancy',
    label: 'Hull and Buoyancy System',
    words: ['hull_structure'],
  },
  {
    id: 'biosensor_system',
    label: 'Biosensor System',
    words: ['biosensor_hardware'],
  },
  // Bug P0-5 fix (2026-05-11): a medical wearable (CGM patch) is not a
  // submarine — it must NOT decompose under hull_and_buoyancy. This sentence
  // is the wearable-specific enclosure with biocompatibility and disposable-
  // patch sub-archetypes.
  {
    id: 'medical_wearable_enclosure',
    label: 'Medical Wearable Enclosure',
    words: ['wearable_housing', 'wearable_skin_interface'],
  },
  {
    id: 'haps_airframe',
    label: 'HAPS Airframe',
    words: ['haps_structure'],
  },
]

// ---------------------------------------------------------------------------
// Words (subsystem groups within sentences)
// ---------------------------------------------------------------------------

export const WORDS: HierarchyWord[] = [
  // ── battery_rack_assembly ─────────────────────────────────────────────────
  {
    id: 'cell_string',
    label: 'Cell String',
    sentence_id: 'battery_rack_assembly',
    characters: ['lfp_prismatic_cell'],
  },
  {
    id: 'rack_structure',
    label: 'Rack Structure',
    sentence_id: 'battery_rack_assembly',
    characters: ['steel_rack_frame'],
  },
  // ── battery_management_system_bms ────────────────────────────────────────
  {
    id: 'bms_master',
    label: 'BMS Master Controller',
    sentence_id: 'battery_management_system_bms',
    characters: ['pcb_controller'],
  },
  {
    id: 'bms_slave',
    label: 'BMS Slave Cell Monitors',
    sentence_id: 'battery_management_system_bms',
    // pcb_controller also used here — word distinguishes the role
    characters: ['pcb_controller'],
  },
  // ── power_conversion_system_pcs ──────────────────────────────────────────
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
    characters: ['transformer'],
  },
  // ── dc_distribution_switchgear ───────────────────────────────────────────
  {
    id: 'dc_switching',
    label: 'DC Switching',
    sentence_id: 'dc_distribution_switchgear',
    characters: ['dc_contactor'],
  },
  {
    id: 'dc_protection',
    label: 'DC Protection',
    sentence_id: 'dc_distribution_switchgear',
    characters: ['circuit_breaker', 'protection_relay', 'resistor'],
  },
  {
    id: 'dc_buswork',
    label: 'DC Buswork',
    sentence_id: 'dc_distribution_switchgear',
    characters: ['copper_busbar'],
  },
  // ── thermal_management_system ────────────────────────────────────────────
  {
    id: 'active_cooling',
    label: 'Active Liquid Cooling',
    sentence_id: 'thermal_management_system',
    characters: ['liquid_cooling_system'],
  },
  {
    id: 'passive_insulation',
    label: 'Passive Thermal Insulation',
    sentence_id: 'thermal_management_system',
    characters: ['thermal_insulation_panel', 'aluminium_heatsink'],
  },
  // ── fire_detection_and_suppression_system_fss ────────────────────────────
  {
    id: 'suppression_hardware',
    label: 'Suppression Hardware',
    sentence_id: 'fire_detection_and_suppression_system_fss',
    characters: ['fire_suppression_system', 'pressure_vessel'],
  },
  {
    id: 'detection_sensors',
    label: 'Detection Sensors',
    sentence_id: 'fire_detection_and_suppression_system_fss',
    characters: ['gas_sensor', 'optical_arc_sensor'],
  },
  // ── energy_management_system_ems_scada ───────────────────────────────────
  {
    id: 'ems_compute',
    label: 'EMS / SCADA Compute',
    sentence_id: 'energy_management_system_ems_scada',
    characters: ['ems_controller'],
  },
  {
    id: 'ems_network',
    label: 'EMS Network Infrastructure',
    sentence_id: 'energy_management_system_ems_scada',
    characters: ['network_switch', 'power_converter'],
  },
  // ── container_enclosure_fit_out ──────────────────────────────────────────
  {
    id: 'container_access',
    label: 'Container Access',
    sentence_id: 'container_enclosure_fit_out',
    characters: ['steel_door'],
  },
  {
    id: 'container_services',
    label: 'Container Services',
    sentence_id: 'container_enclosure_fit_out',
    characters: ['cable_transit_frame', 'switchboard_enclosure', 'thermal_insulation_panel'],
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
  {
    id: 'hydronic_flow',
    label: 'Hydronic Flow',
    sentence_id: 'hydronic_circuit',
    characters: ['liquid_cooling_system'],
  },
  {
    id: 'hydronic_connections',
    label: 'Hydronic Connections',
    sentence_id: 'hydronic_circuit',
    characters: ['copper_terminal', 'polymer_gasket', 'copper_wire'],
  },
  // ── heat_pump_controls ───────────────────────────────────────────────────
  {
    id: 'hp_controls_compute',
    label: 'HP Controls Compute',
    sentence_id: 'heat_pump_controls',
    characters: ['pcb_controller'],
  },
  // ── heat_pump_enclosure ──────────────────────────────────────────────────
  {
    id: 'hp_enclosure_structure',
    label: 'HP Enclosure and Frame',
    sentence_id: 'heat_pump_enclosure',
    characters: ['polymer_enclosure', 'aluminium_extrusion', 'steel_plate', 'steel_bolt'],
  },
  // ── growing_rack_system ──────────────────────────────────────────────────
  {
    id: 'rack_structure_vfarm',
    label: 'Growing Rack Structure',
    sentence_id: 'growing_rack_system',
    characters: ['aluminium_extrusion', 'steel_bolt'],
  },
  // ── lighting_system ──────────────────────────────────────────────────────
  {
    id: 'lighting_fixtures',
    label: 'Lighting Fixtures',
    sentence_id: 'lighting_system',
    characters: ['pcb_controller', 'copper_wire'],
  },
  // ── fertigation_loop ─────────────────────────────────────────────────────
  {
    id: 'fertigation_flow',
    label: 'Fertigation Flow',
    sentence_id: 'fertigation_loop',
    characters: ['liquid_cooling_system', 'polymer_gasket', 'copper_wire'],
  },
  // ── hvac_co2_system ──────────────────────────────────────────────────────
  {
    id: 'hvac_flow',
    label: 'HVAC Flow',
    sentence_id: 'hvac_co2_system',
    characters: ['liquid_cooling_system', 'copper_wire'],
  },
  {
    id: 'co2_dosing',
    label: 'CO2 Dosing',
    sentence_id: 'hvac_co2_system',
    characters: ['pressure_vessel', 'gas_sensor'],
  },
  // ── airframe_structure ────────────────────────────────────────────────────
  {
    id: 'airframe_body',
    label: 'Airframe Body',
    sentence_id: 'airframe_structure',
    characters: ['aluminium_extrusion', 'steel_bolt', 'polymer_enclosure'],
  },
  // ── propulsion_system ────────────────────────────────────────────────────
  {
    id: 'propulsion_motors',
    label: 'Propulsion Motors',
    sentence_id: 'propulsion_system',
    characters: ['power_converter', 'copper_wire'],
  },
  // ── flight_computer ──────────────────────────────────────────────────────
  {
    id: 'avionics_compute',
    label: 'Avionics Compute',
    sentence_id: 'flight_computer',
    characters: ['pcb_controller', 'network_switch'],
  },
  // ── charger_power_conversion ─────────────────────────────────────────────
  {
    id: 'charger_pcs',
    label: 'Charger PCS',
    sentence_id: 'charger_power_conversion',
    characters: ['power_converter', 'transformer', 'circuit_breaker'],
  },
  // ── charger_enclosure ────────────────────────────────────────────────────
  {
    id: 'charger_enclosure_structure',
    label: 'Charger Enclosure',
    sentence_id: 'charger_enclosure',
    characters: ['switchboard_enclosure', 'polymer_enclosure'],
  },
  // ── bioreactor_vessel ────────────────────────────────────────────────────
  {
    id: 'bioreactor_vessel_body',
    label: 'Bioreactor Vessel Body',
    sentence_id: 'bioreactor_vessel',
    characters: ['pressure_vessel', 'polymer_gasket', 'steel_plate'],
  },
  // ── bioreactor_controls ──────────────────────────────────────────────────
  {
    id: 'bioreactor_sensing',
    label: 'Bioreactor Sensing',
    sentence_id: 'bioreactor_controls',
    characters: ['gas_sensor', 'pcb_controller', 'optical_arc_sensor'],
  },
  // ── edge_compute_system ──────────────────────────────────────────────────
  {
    id: 'edge_compute_hardware',
    label: 'Edge Compute Hardware',
    sentence_id: 'edge_compute_system',
    characters: ['pcb_controller', 'network_switch', 'copper_wire'],
  },
  // ── hull_and_buoyancy ────────────────────────────────────────────────────
  {
    id: 'hull_structure',
    label: 'Hull Structure',
    sentence_id: 'hull_and_buoyancy',
    characters: ['polymer_enclosure', 'aluminium_extrusion', 'polymer_gasket'],
  },
  // ── biosensor_system ─────────────────────────────────────────────────────
  {
    id: 'biosensor_hardware',
    label: 'Biosensor Hardware',
    sentence_id: 'biosensor_system',
    characters: ['pcb_controller', 'copper_wire'],
  },
  // ── medical_wearable_enclosure ───────────────────────────────────────────
  // Bug P0-5 fix: CGM-class enclosure characters must NOT map to
  // hull_structure (under hull_and_buoyancy / AUV).
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
    characters: ['polymer_gasket'],
  },
  // ── haps_airframe ────────────────────────────────────────────────────────
  {
    id: 'haps_structure',
    label: 'HAPS Airframe Structure',
    sentence_id: 'haps_airframe',
    characters: ['aluminium_extrusion', 'steel_bolt', 'polymer_enclosure'],
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
