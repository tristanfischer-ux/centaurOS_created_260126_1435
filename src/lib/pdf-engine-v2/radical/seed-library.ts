/**
 * Radical Seed Library — First Light spike
 *
 * Hard-coded, no persistence. Contains:
 *   5 radicals
 *  10 characters
 *   5 modifiers
 *  10 archetypes
 *   6 grammar rules (imported from grammar.ts)
 *
 * Radicals (per council V2 suggestion):
 *   steel, copper, polymer_thermoplastic, electrical_conducting_function, solid_state_of_matter
 */

import type { RadicalLibrary, Radical, Character, Modifier, Archetype, CatalogueEntry } from "./schema.js"
import {
  KCL_NODE_BALANCE,
  GALVANIC_ALUMINIUM_COPPER_CONTACT,
  VOLTAGE_DERATE_80PCT,
  MASS_BALANCE_CLOSED_LOOP,
  THERMAL_CAPACITY_VS_LOAD,
  MATERIAL_MARINE_CORROSION,
} from "./grammar.js"

export { KCL_NODE_BALANCE, GALVANIC_ALUMINIUM_COPPER_CONTACT, VOLTAGE_DERATE_80PCT, MASS_BALANCE_CLOSED_LOOP, THERMAL_CAPACITY_VS_LOAD, MATERIAL_MARINE_CORROSION }

// ---------------------------------------------------------------------------
// Radicals (5)
// ---------------------------------------------------------------------------

const radicals: Radical[] = [
  {
    id: "steel",
    category: "material",
    properties: {
      density_kg_m3: 7850,
      // density in g/cm³ for kill criterion 1 (7850 kg/m³ = 7.85 g/cm³)
      density_g_cm3: 7.85,
      tensile_strength_mpa: 400,
      conductivity_w_mk: 50,
      primary_material: "steel",
      marine_corrosion_resistant: false,
      max_service_temp_c: 500,
    },
  },
  {
    id: "copper",
    category: "material",
    properties: {
      density_kg_m3: 8960,
      density_g_cm3: 8.96,
      tensile_strength_mpa: 210,
      conductivity_w_mk: 385,
      electrical_resistivity_ohm_m: 1.68e-8,
      primary_material: "copper",
      marine_corrosion_resistant: true,
      max_service_temp_c: 200,
    },
  },
  {
    id: "polymer_thermoplastic",
    category: "material",
    properties: {
      density_kg_m3: 1100,
      density_g_cm3: 1.1,
      tensile_strength_mpa: 50,
      conductivity_w_mk: 0.2,
      primary_material: "polymer",
      marine_corrosion_resistant: true,
      max_service_temp_c: 120,
      electrically_insulating: true,
    },
  },
  {
    id: "electrical_conducting_function",
    category: "function",
    properties: {
      function_class: "electrical_conduction",
      requires_conductor_material: true,
      min_conductivity_w_mk: 0.1,
    },
  },
  {
    id: "solid_state_of_matter",
    category: "state_of_matter",
    properties: {
      phase: "solid",
      compressible: false,
      flow_capable: false,
    },
  },
]

// ---------------------------------------------------------------------------
// Characters (10)
// ---------------------------------------------------------------------------

const characters: Character[] = [
  {
    id: "steel_bolt",
    radicals: ["steel", "solid_state_of_matter"],
    properties: {
      component_type: "fastener",
      thread_system: "metric",
    },
    function: "fastening",
  },
  {
    id: "copper_wire",
    radicals: ["copper", "electrical_conducting_function", "solid_state_of_matter"],
    properties: {
      component_type: "wire",
      insulation_class: "standard",
    },
    function: "conducting",
  },
  {
    id: "aluminium_extrusion",
    radicals: ["solid_state_of_matter"],
    properties: {
      component_type: "structural_extrusion",
      primary_material: "aluminium",
      density_kg_m3: 2700,
      density_g_cm3: 2.7,
      tensile_strength_mpa: 270,
      marine_corrosion_resistant: true,
    },
    function: "structural_support",
  },
  {
    id: "polymer_gasket",
    radicals: ["polymer_thermoplastic", "solid_state_of_matter"],
    properties: {
      component_type: "gasket",
      sealing_type: "static",
    },
    function: "sealing",
  },
  {
    id: "steel_plate",
    radicals: ["steel", "solid_state_of_matter"],
    properties: {
      component_type: "structural_plate",
    },
    function: "structural_support",
  },
  {
    id: "copper_busbar",
    radicals: ["copper", "electrical_conducting_function", "solid_state_of_matter"],
    properties: {
      component_type: "busbar",
      current_rating_A: 400,
    },
    function: "power_distribution",
  },
  {
    id: "polymer_enclosure",
    radicals: ["polymer_thermoplastic", "solid_state_of_matter"],
    properties: {
      component_type: "enclosure",
    },
    function: "environmental_protection",
  },
  {
    id: "steel_threaded_rod",
    radicals: ["steel", "solid_state_of_matter"],
    properties: {
      component_type: "threaded_rod",
      thread_system: "metric",
    },
    function: "fastening",
  },
  {
    id: "aluminium_heatsink",
    radicals: ["solid_state_of_matter"],
    properties: {
      component_type: "heatsink",
      primary_material: "aluminium",
      density_kg_m3: 2700,
      density_g_cm3: 2.7,
      marine_corrosion_resistant: true,
      conductivity_w_mk: 205,
    },
    function: "thermal_management",
  },
  {
    id: "copper_terminal",
    radicals: ["copper", "electrical_conducting_function", "solid_state_of_matter"],
    properties: {
      component_type: "terminal",
      current_rating_A: 50,
    },
    function: "electrical_connection",
  },
]

// ---------------------------------------------------------------------------
// Modifiers (5)
// ---------------------------------------------------------------------------

const modifiers: Modifier[] = [
  {
    id: "M8",
    category: "size",
    properties: {
      thread_diameter_mm: 8,
      thread_pitch_mm: 1.25,
      size_designation: "M8",
    },
  },
  {
    id: "M16",
    category: "size",
    properties: {
      thread_diameter_mm: 16,
      thread_pitch_mm: 2.0,
      size_designation: "M16",
    },
  },
  {
    id: "316L_grade",
    category: "grade",
    properties: {
      // Kill criterion 3: this modifier MUST override steel's marine_corrosion_resistant=false → true
      marine_corrosion_resistant: true,
      // Override material details for 316L stainless
      primary_material: "stainless_steel_316L",
      tensile_strength_mpa: 485,
      pren: 26, // Pitting Resistance Equivalent Number (316L ≈ 25–26)
      grade_designation: "316L",
      chloride_resistant: true,
    },
  },
  {
    id: "IP67",
    category: "rating",
    properties: {
      ingress_protection_rating: "IP67",
      dust_proof: true,
      waterproof_depth_m: 1.0,
      waterproof_duration_min: 30,
    },
  },
  {
    id: "tinned_finish",
    category: "grade",
    properties: {
      surface_finish: "tin_plating",
      corrosion_protection: "enhanced",
      solderability: "excellent",
    },
  },
]

// ---------------------------------------------------------------------------
// Archetypes (10)
// ---------------------------------------------------------------------------

const archetypes: Archetype[] = [
  // Kill criterion 3 target: 316L bolt MUST override marine_corrosion_resistant to true
  {
    id: "M8x30_316L_socket_head_bolt",
    character: "steel_bolt",
    modifiers: ["M8", "316L_grade"],
  },
  {
    id: "M16x50_plain_steel_bolt",
    character: "steel_bolt",
    modifiers: ["M16"],
  },
  {
    id: "IP67_polymer_enclosure",
    character: "polymer_enclosure",
    modifiers: ["IP67"],
  },
  {
    id: "bare_polymer_enclosure",
    character: "polymer_enclosure",
    modifiers: [],
  },
  {
    id: "M8x30_plain_steel_bolt",
    character: "steel_bolt",
    modifiers: ["M8"],
  },
  {
    id: "tinned_copper_terminal_50A",
    character: "copper_terminal",
    modifiers: ["tinned_finish"],
  },
  {
    id: "standard_copper_wire",
    character: "copper_wire",
    modifiers: [],
  },
  {
    id: "standard_aluminium_heatsink",
    character: "aluminium_heatsink",
    modifiers: [],
  },
  {
    id: "standard_copper_busbar",
    character: "copper_busbar",
    modifiers: [],
  },
  {
    id: "standard_polymer_gasket",
    character: "polymer_gasket",
    modifiers: [],
  },
]

// ---------------------------------------------------------------------------
// Catalogue entries (minimal — just enough to prove the layer exists)
// ---------------------------------------------------------------------------

const catalogueEntries: CatalogueEntry[] = [
  {
    id: "mcmaster_91290A115",
    archetype: "M8x30_316L_socket_head_bolt",
    manufacturer: "McMaster-Carr",
    mpn: "91290A115",
    unit_price_gbp: 0.43,
    lead_weeks: 1,
    eol_date: null,
  },
  {
    id: "mcmaster_91290A238",
    archetype: "M16x50_plain_steel_bolt",
    manufacturer: "McMaster-Carr",
    mpn: "91290A238",
    unit_price_gbp: 0.81,
    lead_weeks: 1,
    eol_date: null,
  },
]

// ---------------------------------------------------------------------------
// Build and export the library
// ---------------------------------------------------------------------------

export function buildSeedLibrary(): RadicalLibrary {
  const library: RadicalLibrary = {
    radicals: new Map(radicals.map((r) => [r.id, r])),
    characters: new Map(characters.map((c) => [c.id, c])),
    modifiers: new Map(modifiers.map((m) => [m.id, m])),
    archetypes: new Map(archetypes.map((a) => [a.id, a])),
    catalogueEntries: new Map(catalogueEntries.map((e) => [e.id, e])),
  }
  return library
}

export const ALL_GRAMMAR_RULES = [
  KCL_NODE_BALANCE,
  GALVANIC_ALUMINIUM_COPPER_CONTACT,
  VOLTAGE_DERATE_80PCT,
  MASS_BALANCE_CLOSED_LOOP,
  THERMAL_CAPACITY_VS_LOAD,
  MATERIAL_MARINE_CORROSION,
]
