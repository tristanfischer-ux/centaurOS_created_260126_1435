/**
 * Radical Schema — First Light spike
 *
 * Hierarchy (low to high):
 *   Radical → Character → [+ Modifier] → Archetype → CatalogueEntry
 *   (Archetype is the mandatory council-mandated layer between Modifier and CatalogueEntry)
 *
 * Grammar rules fire against Archetype, not against MPNs.
 */

// ---------------------------------------------------------------------------
// Schema versioning — Phase 0 addition (council mandate)
// ---------------------------------------------------------------------------

/**
 * Current version of the Radical spec.
 * Bump the major version when the tree structure changes incompatibly.
 * Bump minor for additive changes (new optional fields).
 * Patch for clarifications with no structural impact.
 */
export const CURRENT_RADICAL_SPEC_VERSION = "1.0.0"

/**
 * Version compatibility range: versions with the same major are compatible.
 */
export function isVersionCompatible(version: string): boolean {
  const currentMajor = parseInt(CURRENT_RADICAL_SPEC_VERSION.split('.')[0], 10)
  const loadedMajor = parseInt((version || '0').split('.')[0], 10)
  return loadedMajor === currentMajor
}

export type PropertyValue = number | string | boolean
export type PropertyMap = Record<string, PropertyValue>

// ---------------------------------------------------------------------------
// Radical — semantic primitive (~50–200 in full library; 5 in First Light)
// ---------------------------------------------------------------------------
export type Radical = {
  id: string // e.g. "steel", "copper", "electrical_conducting_function"
  category: "material" | "function" | "energy_form" | "state_of_matter"
  properties: PropertyMap // e.g. { density_kg_m3: 7850, marine_corrosion_resistant: false }
}

// ---------------------------------------------------------------------------
// Character — composite of 2–4 radicals; a function-class
// ---------------------------------------------------------------------------
export type Character = {
  id: string // e.g. "steel_bolt", "copper_wire"
  radicals: string[] // refs by Radical.id
  properties: PropertyMap // character-specific overrides on top of radicals
  function: string // e.g. "fastening", "conducting"
}

// ---------------------------------------------------------------------------
// Modifier — grade/size/rating that overrides properties when attached
// ---------------------------------------------------------------------------
export type Modifier = {
  id: string // e.g. "M8", "316L_grade", "IP67"
  category: "size" | "grade" | "rating" | "tolerance" | "certification"
  properties: PropertyMap // overrides applied when modifier attaches to an archetype
}

// ---------------------------------------------------------------------------
// Archetype — council-mandated parametric layer (Character + Modifiers)
// The "designed-with" layer engineers actually work in. Grammar fires HERE.
// ---------------------------------------------------------------------------
export type Archetype = {
  id: string // e.g. "M8x30_316L_socket_head_bolt"
  character: string // ref by Character.id
  modifiers: string[] // refs by Modifier.id, applied in declared order
  // resolved properties are computed via getResolvedProperties(); not stored here
}

// ---------------------------------------------------------------------------
// CatalogueEntry — an MPN instance of an Archetype (volatile: price, EOL)
// ---------------------------------------------------------------------------
export type CatalogueEntry = {
  id: string // e.g. "mcmaster_91290A115"
  archetype: string // ref by Archetype.id
  manufacturer: string
  mpn: string
  unit_price_gbp: number | null
  lead_weeks: number | null
  eol_date: string | null
}

// ---------------------------------------------------------------------------
// The full in-memory library (no persistence in First Light)
// ---------------------------------------------------------------------------
export type RadicalLibrary = {
  radicals: Map<string, Radical>
  characters: Map<string, Character>
  modifiers: Map<string, Modifier>
  archetypes: Map<string, Archetype>
  catalogueEntries: Map<string, CatalogueEntry>
}

// ---------------------------------------------------------------------------
// Composition — a tree of Archetype instances with multiplicity
// ---------------------------------------------------------------------------
export type CompositionNode = {
  archetypeId: string
  quantity: number
  children: CompositionNode[]
  // Electrical node metadata (for KCL checks)
  electricalNode?: {
    nodeId: string
    current_in_A: number // positive = current flowing into this node
    current_out_A: number // positive = current flowing out of this node
  }
}

export type Composition = {
  id: string
  description: string
  root: CompositionNode
  // flat environment tags (e.g. "marine", "indoor")
  environment: string[]
}

// ---------------------------------------------------------------------------
// RadicalTree — versioned root container (Phase 0 addition)
// The tree is the serialisable, storable unit that carries spec version.
// A Composition is the in-memory representation; RadicalTree is the
// at-rest / over-the-wire representation.
// ---------------------------------------------------------------------------

export type RadicalTree = {
  /**
   * Version of the Radical spec this tree was authored against.
   * Used by the version-compatibility check in property-api.ts.
   * Format: "MAJOR.MINOR.PATCH" (semver).
   */
  radical_spec_version: string
  composition: Composition
  /**
   * Optional metadata for audit trails.
   */
  meta?: {
    created_at?: string
    product_slug?: string
    pipeline_run_id?: string
    authored_by?: string
  }
}
