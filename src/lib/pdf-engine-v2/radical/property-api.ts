/**
 * Radical Property API — First Light spike
 *
 * Cascade order: radical union → character override → modifier overrides (in declared order)
 *
 * Key design insight from First Light: the cascade is deliberately last-write-wins.
 * Modifiers are the outermost shell, so "316L_grade" can flip a radical-level
 * boolean (marine_corrosion_resistant: false → true) without touching the radical
 * itself. The Archetype is the stable "designed-with" unit that grammar rules query.
 */

import type { Archetype, RadicalLibrary, PropertyMap, RadicalTree } from "./schema.js"
import { CURRENT_RADICAL_SPEC_VERSION, isVersionCompatible } from "./schema.js"

// ---------------------------------------------------------------------------
// Version-compatibility check — Phase 0 addition
// ---------------------------------------------------------------------------

/**
 * Load a RadicalTree with version-compatibility verification.
 *
 * If the tree's spec version is not compatible with CURRENT_RADICAL_SPEC_VERSION:
 * - Logs a warning (does NOT throw — backward-compatible read attempt)
 * - Applies any registered migration if available
 * - Returns the (possibly migrated) tree
 *
 * Throws only if the version is completely unreadable (e.g. version 0.x vs 1.x
 * and no migration is registered).
 */
export function loadRadicalTree(tree: RadicalTree): RadicalTree {
  const version = tree.radical_spec_version ?? "0.0.0"

  if (!isVersionCompatible(version)) {
    console.warn(
      `[property-api] RadicalTree version mismatch: tree is "${version}", ` +
      `current spec is "${CURRENT_RADICAL_SPEC_VERSION}". ` +
      `Attempting backward-compatible read. Check migrations/ if behaviour is unexpected.`
    )

    // Attempt migration lookup
    const migratedTree = attemptMigration(tree, version)
    if (migratedTree) {
      console.warn(`[property-api] Migration applied: "${version}" → "${migratedTree.radical_spec_version}"`)
      return migratedTree
    }

    // No migration registered — warn but continue with best-effort read
    console.warn(
      `[property-api] No migration registered for version "${version}". ` +
      `Proceeding with best-effort read. Some properties may be missing or incorrect.`
    )
  }

  return tree
}

/**
 * Migration registry — maps from-version to migration function.
 * Phase 0 stub: only the v0 → v1 migration slot is registered (no-op for now,
 * since v0 is the flat-list format that predates the tree format).
 */
const MIGRATION_REGISTRY: Record<string, (tree: RadicalTree) => RadicalTree | null> = {
  // "0.x.x" → "1.0.0": flat-list to tree migration (stub — Phase 1 will implement)
  "0": (tree: RadicalTree): RadicalTree | null => {
    console.warn('[property-api] v0→v1 migration: flat-list format detected. Stub only — full migration not yet implemented.')
    // Return null to indicate no migration available for v0
    return null
  },
}

/**
 * Attempt to migrate a tree from an older version to the current spec.
 * Returns the migrated tree, or null if no migration is registered.
 */
function attemptMigration(tree: RadicalTree, fromVersion: string): RadicalTree | null {
  const majorVersion = fromVersion.split('.')[0]
  const migrationFn = MIGRATION_REGISTRY[majorVersion]
  if (!migrationFn) return null
  return migrationFn(tree)
}

// ---------------------------------------------------------------------------
// Core cascade function
// ---------------------------------------------------------------------------

export function getResolvedProperties(
  archetype: Archetype,
  library: RadicalLibrary
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
  library: RadicalLibrary
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
