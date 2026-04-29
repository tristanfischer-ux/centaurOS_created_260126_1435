/**
 * @file topology-validation.ts — Validates structural integrity of the
 * decomposition graph after Max returns modules and connections.
 *
 * @description Council fix 2B (3/6: GPT-5.5 + DeepSeek + Kimi).
 * Three checks:
 *   1. Duplicate module IDs → hard block (would cause silent overwrites
 *      downstream in JSONB keyed by moduleId).
 *   2. Dangling connection references → hard block (connection references
 *      a module that doesn't exist in the modules array).
 *   3. Orphan modules → warning only (modules with no connections to any
 *      other module — common for standalone sub-assemblies, not necessarily
 *      a bug, but worth surfacing).
 *
 * Pure function — no server-side dependencies, no database access.
 */

import type { ModuleConnection } from "@/lib/cad-lab-types"

export interface TopologyValidationResult {
  /** True when no hard errors were found (warnings are OK). */
  valid: boolean
  /** Hard errors that block storing the decomposition. */
  errors: string[]
  /** Soft warnings (orphan modules, etc.) — logged but don't block. */
  warnings: string[]
}

/**
 * Validates the topology of a decomposition graph.
 *
 * @param modules - Array of objects with at least an `id` field.
 * @param connections - Optional array of inter-module connections.
 * @returns Validation result with errors (blocking) and warnings (non-blocking).
 */
export function validateDecompositionTopology(
  modules: ReadonlyArray<{ id: string }>,
  connections?: ReadonlyArray<ModuleConnection>,
): TopologyValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // ── 1. Check for duplicate module IDs ───────────────────────────────
  const idCounts = new Map<string, number>()
  for (const mod of modules) {
    idCounts.set(mod.id, (idCounts.get(mod.id) ?? 0) + 1)
  }
  for (const [id, count] of idCounts) {
    if (count > 1) {
      errors.push(`Duplicate module id "${id}" appears ${count} times`)
    }
  }

  // ── 2. Check connection references ──────────────────────────────────
  if (connections && connections.length > 0) {
    const moduleIds = new Set(modules.map((m) => m.id))
    const connectedIds = new Set<string>()

    for (const conn of connections) {
      if (!moduleIds.has(conn.from)) {
        errors.push(
          `Connection references non-existent source module "${conn.from}"`,
        )
      } else {
        connectedIds.add(conn.from)
      }

      if (!moduleIds.has(conn.to)) {
        errors.push(
          `Connection references non-existent target module "${conn.to}"`,
        )
      } else {
        connectedIds.add(conn.to)
      }
    }

    // ── 3. Check for orphan modules ─────────────────────────────────
    // Only meaningful when connections exist — if there are no connections
    // at all, every module is trivially "orphan" and the warning is noise.
    for (const mod of modules) {
      if (!connectedIds.has(mod.id)) {
        warnings.push(
          `Module "${mod.id}" has no connections to any other module (orphan)`,
        )
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}
