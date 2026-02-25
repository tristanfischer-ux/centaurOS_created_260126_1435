/**
 * @file index.ts — Engineering data query API.
 *
 * @description Unified access to materials, processes, and standard parts
 * databases. Provides cross-domain queries for specialist tools and
 * design validation.
 *
 * @related
 * - Materials: src/lib/engineering-data/materials.ts
 * - Processes: src/lib/engineering-data/processes.ts
 * - Standard parts: src/lib/engineering-data/standard-parts.ts
 * - Tool handlers: src/lib/agents/tools/handlers/engineering-compute.ts
 */

export * from "./materials"
export * from "./processes"
export * from "./standard-parts"

import { findMaterial, MATERIALS } from "./materials"
import type { MaterialProperty } from "./materials"
import { findProcess, PROCESSES } from "./processes"
import type { ProcessConstraints } from "./processes"

// ─── Cross-domain Queries ────────────────────────────────────────────

/**
 * Get all manufacturing processes compatible with a given material.
 *
 * @param materialId - Material identifier (e.g., "al-6061-t6")
 * @returns Processes whose compatible_materials list includes this material
 */
export function getCompatibleProcessesForMaterial(
    materialId: string,
): ProcessConstraints[] {
    const mat = findMaterial(materialId)
    if (!mat) return []

    return PROCESSES.filter((proc) =>
        proc.compatible_materials.includes(mat.id),
    )
}

/**
 * Get all materials compatible with a given manufacturing process.
 *
 * @param processId - Process identifier (e.g., "fdm", "cnc-3-axis")
 * @returns Materials listed in the process's compatible_materials
 */
export function getCompatibleMaterialsForProcess(
    processId: string,
): MaterialProperty[] {
    const proc = findProcess(processId)
    if (!proc) return []

    return MATERIALS.filter((mat) =>
        proc.compatible_materials.includes(mat.id),
    )
}

/**
 * Validate whether a material-process combination is feasible.
 *
 * @param materialId - Material identifier
 * @param processId - Process identifier
 * @returns Object with compatible boolean and reason string
 */
export function validateMaterialProcessPair(
    materialId: string,
    processId: string,
): { compatible: boolean; reason?: string } {
    const mat = findMaterial(materialId)
    if (!mat) {
        return { compatible: false, reason: `Material "${materialId}" not found in database.` }
    }

    const proc = findProcess(processId)
    if (!proc) {
        return { compatible: false, reason: `Process "${processId}" not found in database.` }
    }

    const isCompatible = proc.compatible_materials.includes(mat.id)

    if (isCompatible) {
        return { compatible: true }
    }

    return {
        compatible: false,
        reason: `${mat.name} is not compatible with ${proc.name}. Compatible materials for ${proc.name}: ${proc.compatible_materials.join(", ")}`,
    }
}
