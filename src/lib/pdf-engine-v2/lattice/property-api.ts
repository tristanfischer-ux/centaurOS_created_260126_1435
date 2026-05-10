/**
 * Lattice Property API — First Light spike
 *
 * Cascade order: radical union → character override → modifier overrides (in declared order)
 *
 * Key design insight from First Light: the cascade is deliberately last-write-wins.
 * Modifiers are the outermost shell, so "316L_grade" can flip a radical-level
 * boolean (marine_corrosion_resistant: false → true) without touching the radical
 * itself. The Archetype is the stable "designed-with" unit that grammar rules query.
 */

import type { Archetype, LatticeLibrary, PropertyMap } from "./schema.js"

// ---------------------------------------------------------------------------
// Core cascade function
// ---------------------------------------------------------------------------

export function getResolvedProperties(
  archetype: Archetype,
  library: LatticeLibrary
): PropertyMap {
  const character = library.characters.get(archetype.character)
  if (!character) {
    throw new Error(
      `Character "${archetype.character}" not found in library (archetype: "${archetype.id}")`
    )
  }

  const props: PropertyMap = {}

  // 1. Union of all radicals' properties (first-radical wins on key conflicts here;
  //    character override in step 2 is what engineers actually rely on)
  for (const radicalId of character.radicals) {
    const radical = library.radicals.get(radicalId)
    if (!radical) {
      throw new Error(
        `Radical "${radicalId}" not found in library (character: "${character.id}")`
      )
    }
    Object.assign(props, radical.properties)
  }

  // 2. Character-specific overrides
  Object.assign(props, character.properties)

  // 3. Modifier overrides in declared order (last modifier wins on same key)
  for (const modId of archetype.modifiers) {
    const mod = library.modifiers.get(modId)
    if (!mod) {
      throw new Error(
        `Modifier "${modId}" not found in library (archetype: "${archetype.id}")`
      )
    }
    Object.assign(props, mod.properties)
  }

  return props
}

// ---------------------------------------------------------------------------
// Helper: resolve properties for a named archetype ID (convenience wrapper)
// ---------------------------------------------------------------------------

export function resolveById(
  archetypeId: string,
  library: LatticeLibrary
): PropertyMap {
  const archetype = library.archetypes.get(archetypeId)
  if (!archetype) {
    throw new Error(`Archetype "${archetypeId}" not found in library`)
  }
  return getResolvedProperties(archetype, library)
}

// ---------------------------------------------------------------------------
// Helper: read a single property with type-safe fallback
// ---------------------------------------------------------------------------

export function getProperty<T extends PropertyMap[string]>(
  props: PropertyMap,
  key: string,
  fallback: T
): T {
  const val = props[key]
  return val !== undefined ? (val as T) : fallback
}
