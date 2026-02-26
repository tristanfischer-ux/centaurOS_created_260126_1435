/**
 * @file diagnostic-mappings.ts — Shared diagnostic-to-DB mappings and compatibility queries.
 *
 * @description Single source of truth for mapping diagnostic UI option strings
 * to engineering database IDs. Also provides bidirectional compatibility queries:
 * given a process, which materials are compatible? Given a material, which processes?
 *
 * @related
 * - Validation rules: src/lib/cad-lab/validation-rules.ts (consumes mappings)
 * - Diagnostics UI: src/components/cad/cad-lab-diagnostics.tsx (consumes compatibility)
 * - Process database: src/lib/engineering-data/processes.ts
 * - Material database: src/lib/engineering-data/materials.ts
 */

import { PROCESSES } from "@/lib/engineering-data/processes"

// ─── Diagnostic-to-DB Mappings ──────────────────────────────────────

/**
 * Maps diagnostic process selection strings to engineering DB process IDs.
 *
 * INTENT: The diagnostics UI uses human-friendly names ("FDM 3D Print").
 * The engineering DB uses machine IDs ("fdm"). This bridges them.
 */
export const DIAG_PROCESS_TO_DB_IDS: Record<string, string[]> = {
  "FDM 3D Print": ["fdm"],
  "SLA/Resin Print": ["sla"],
  "SLS/Powder Print": ["sls", "mjf"],
  "CNC Machining": ["cnc-3axis", "cnc-5axis"],
  "Sheet Metal": ["sheet-metal"],
  "Injection Molding": ["injection-molding"],
  "Casting": ["die-casting", "investment-casting", "sand-casting"],
  "Manual/Assembly": [],
  "Other": [],
}

/**
 * Maps diagnostic material selection strings to engineering DB material IDs.
 */
export const DIAG_MATERIAL_TO_DB_IDS: Record<string, string[]> = {
  "PLA/PETG": ["pla", "petg"],
  "ABS/Nylon": ["abs", "nylon-pa6", "nylon-pa12"],
  "Resin (standard)": ["resin-standard", "resin-tough", "resin-flexible", "resin-castable"],
  "Aluminum 6061": ["al-6061-t6"],
  "Steel (mild)": ["steel-1018", "steel-4140"],
  "Stainless Steel": ["ss-304", "ss-316"],
  "Titanium": ["ti-6al-4v"],
  "Copper/Brass": ["cu-c110", "brass-c360"],
  "Carbon Fiber": ["cf-unidirectional", "cf-woven-3k", "cf-chopped-sls"],
  "Wood/Plywood": [],
  "Other": [],
}

/**
 * Maps diagnostic tolerance class to a numeric value in mm.
 */
export const DIAG_TOLERANCE_TO_MM: Record<string, number> = {
  "Loose (±1mm)": 1.0,
  "Standard (±0.5mm)": 0.5,
  "Precision (±0.1mm)": 0.1,
  "Tight (±0.05mm)": 0.05,
  "Ultra-tight (±0.01mm)": 0.01,
}

// ─── Compatibility Types ──────────────────────────────────────────

export type CompatibilityStatus = "compatible" | "incompatible" | "unknown"

// ─── Compatibility Queries ─────────────────────────────────────────

/**
 * For a given diagnostic process name, returns the compatibility status
 * of every diagnostic material option.
 *
 * @param processName - Diagnostic process string (e.g., "FDM 3D Print")
 * @returns Map of material option → compatibility status
 *
 * @example
 * getMaterialCompatibilityForProcess("SLA/Resin Print")
 * // { "PLA/PETG": "incompatible", "Resin (standard)": "compatible", ... }
 */
export function getMaterialCompatibilityForProcess(
  processName: string,
): Record<string, CompatibilityStatus> {
  const result: Record<string, CompatibilityStatus> = {}

  const processIds = DIAG_PROCESS_TO_DB_IDS[processName]
  // No constraints for unmapped/flexible processes — everything is unknown
  if (!processIds || processIds.length === 0) {
    for (const matName of Object.keys(DIAG_MATERIAL_TO_DB_IDS)) {
      result[matName] = "unknown"
    }
    return result
  }

  // Collect ALL compatible material IDs from the selected process(es)
  const compatibleMatIds = new Set<string>()
  for (const pId of processIds) {
    const proc = PROCESSES.find(p => p.id === pId)
    if (proc) {
      for (const matId of proc.compatible_materials) {
        compatibleMatIds.add(matId)
      }
    }
  }

  // Check each diagnostic material option
  for (const [matName, matIds] of Object.entries(DIAG_MATERIAL_TO_DB_IDS)) {
    if (matIds.length === 0) {
      // Can't determine compatibility for unmapped materials
      result[matName] = "unknown"
    } else {
      const anyCompatible = matIds.some(id => compatibleMatIds.has(id))
      result[matName] = anyCompatible ? "compatible" : "incompatible"
    }
  }

  return result
}

/**
 * For a given diagnostic material name, returns the compatibility status
 * of every diagnostic process option.
 *
 * @param materialName - Diagnostic material string (e.g., "Aluminum 6061")
 * @returns Map of process option → compatibility status
 *
 * @example
 * getProcessCompatibilityForMaterial("Aluminum 6061")
 * // { "FDM 3D Print": "incompatible", "CNC Machining": "compatible", ... }
 */
export function getProcessCompatibilityForMaterial(
  materialName: string,
): Record<string, CompatibilityStatus> {
  const result: Record<string, CompatibilityStatus> = {}

  const materialIds = DIAG_MATERIAL_TO_DB_IDS[materialName]
  // Unmapped material — everything is unknown
  if (!materialIds || materialIds.length === 0) {
    for (const procName of Object.keys(DIAG_PROCESS_TO_DB_IDS)) {
      result[procName] = "unknown"
    }
    return result
  }

  // For each diagnostic process, check if any of the material IDs are compatible
  for (const [procName, procIds] of Object.entries(DIAG_PROCESS_TO_DB_IDS)) {
    if (procIds.length === 0) {
      // No constraints for Manual/Assembly or Other
      result[procName] = "unknown"
    } else {
      let anyCompatible = false
      for (const pId of procIds) {
        const proc = PROCESSES.find(p => p.id === pId)
        if (proc && materialIds.some(mId => proc.compatible_materials.includes(mId))) {
          anyCompatible = true
          break
        }
      }
      result[procName] = anyCompatible ? "compatible" : "incompatible"
    }
  }

  return result
}
