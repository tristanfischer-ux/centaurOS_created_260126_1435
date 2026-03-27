/**
 * @file cost-optimisation-engine.ts — Deterministic cost alternative exploration
 *
 * @description Explores material/process alternatives for a given module's
 * diagnostic answers. Uses existing engineering data and cost constants to
 * compute relative costs instantly (<100ms, no API calls). Returns ranked
 * alternatives with trade-off analysis (cost, strength, weight, tolerance,
 * supplier availability).
 *
 * FLOW: diagnostic answers → compatible combos → deterministic cost → trade-offs → ranked list
 *
 * @related
 * - Compatibility: src/lib/cad-lab/diagnostic-mappings.ts
 * - Cost constants: src/lib/cad-lab-cost-constants.ts
 * - Materials DB: src/lib/engineering-data/materials.ts
 * - Processes DB: src/lib/engineering-data/processes.ts
 */

import {
  getMaterialCompatibilityForProcess,
  getProcessCompatibilityForMaterial,
  DIAG_MATERIAL_TO_DB_IDS,
  DIAG_PROCESS_TO_DB_IDS,
  DIAG_TOLERANCE_TO_MM,
} from "@/lib/cad-lab/diagnostic-mappings"
import {
  MATERIAL_COST_PER_KG,
  PROCESS_HOURLY_RATE,
  HOURS_PER_KG,
  TOOLING_COST,
  TOLERANCE_MULTIPLIER,
  FINISH_MULTIPLIER,
  ENVIRONMENT_MULTIPLIER,
} from "@/lib/cad-lab-cost-constants"
import { MATERIALS } from "@/lib/engineering-data/materials"
import { PROCESSES } from "@/lib/engineering-data/processes"

// ─── Types ───────────────────────────────────────────────────────────

export interface CostAlternative {
  /** Diagnostic process name (e.g., "CNC Machining") */
  process: string
  /** Diagnostic material name (e.g., "Aluminum 6061") */
  material: string
  /** Whether this is the user's current selection */
  isBaseline: boolean
  /** Deterministic cost estimate in GBP per unit */
  estimatedCostPerUnit: number
  /** Percentage change vs baseline (negative = cheaper) */
  costDeltaPercent: number
  /** Trade-off analysis vs baseline */
  tradeoffs: {
    /** Yield strength ratio vs baseline (>1 = stronger) */
    strengthRatio: number
    /** Whether this process can achieve the required tolerance */
    toleranceCapable: boolean
    /** Supplier availability from technique enrichments */
    supplierAvailability: "high" | "medium" | "low" | "unknown"
    /** Weight change vs baseline (positive = heavier) */
    weightDeltaPercent: number
  }
  /** One-line explanation of this alternative */
  reasoning: string
}

export interface CostOptimisationResult {
  moduleId: string
  moduleName: string
  baselineCostPerUnit: number
  alternatives: CostAlternative[]
}

/** Supplier count data from technique enrichments (optional) */
export interface SupplierCountMap {
  [processName: string]: number
}

// ─── Helpers ─────────────────────────────────────────────────────────

const USD_TO_GBP = 0.79

const materialIndex = new Map(MATERIALS.map((m) => [m.id, m]))
const processIndex = new Map(PROCESSES.map((p) => [p.id, p]))

/** Get the average yield strength for a diagnostic material class */
function getMaterialStrength(materialName: string): number | null {
  const ids = DIAG_MATERIAL_TO_DB_IDS[materialName]
  if (!ids || ids.length === 0) return null
  const strengths = ids
    .map((id) => materialIndex.get(id)?.yield_strength_mpa)
    .filter((s): s is number => s != null)
  if (strengths.length === 0) return null
  return strengths.reduce((a, b) => a + b, 0) / strengths.length
}

/** Get the average density for a diagnostic material class */
function getMaterialDensity(materialName: string): number | null {
  const ids = DIAG_MATERIAL_TO_DB_IDS[materialName]
  if (!ids || ids.length === 0) return null
  const densities = ids
    .map((id) => materialIndex.get(id)?.density_kg_m3)
    .filter((d): d is number => d != null)
  if (densities.length === 0) return null
  return densities.reduce((a, b) => a + b, 0) / densities.length
}

/** Check if a process can achieve a given tolerance (mm) */
function canProcessAchieveTolerance(
  processName: string,
  requiredToleranceMm: number,
): boolean {
  const ids = DIAG_PROCESS_TO_DB_IDS[processName]
  if (!ids || ids.length === 0) return true // Unknown process = assume yes
  // Process is capable if ANY of its sub-processes can achieve the tolerance
  return ids.some((id) => {
    const proc = processIndex.get(id)
    return proc != null && proc.tolerance_tight_mm <= requiredToleranceMm
  })
}

/** Parse batch size string to numeric midpoint */
function parseBatchSize(batchStr: string): number {
  const match = batchStr.match(/(\d+)\s*[-–]\s*(\d+)/)
  if (match) return (parseInt(match[1]) + parseInt(match[2])) / 2
  const singleMatch = batchStr.match(/(\d+)\+/)
  if (singleMatch) return parseInt(singleMatch[1])
  return 10 // Default to prototyping
}

/** Compute deterministic cost for a process/material combo */
function computeCost(
  process: string,
  material: string,
  massKg: number,
  batchSize: number,
  tolerance: string,
  finish: string,
  environment: string,
): number {
  const matCost = (MATERIAL_COST_PER_KG[material] ?? 20) * massKg * USD_TO_GBP
  const hourlyRate = PROCESS_HOURLY_RATE[process] ?? 50
  const hoursPerKg = HOURS_PER_KG[process] ?? 3
  const processCost = hourlyRate * hoursPerKg * massKg * USD_TO_GBP
  const toolingAmortized = ((TOOLING_COST[process] ?? 0) * USD_TO_GBP) / batchSize

  const tolMult = TOLERANCE_MULTIPLIER[tolerance] ?? 1.15
  const finMult = FINISH_MULTIPLIER[finish] ?? 1.0
  const envMult = ENVIRONMENT_MULTIPLIER[environment] ?? 1.0

  return (matCost + processCost + toolingAmortized) * tolMult * finMult * envMult
}

/** Generate a one-line reasoning string */
function generateReasoning(
  process: string,
  material: string,
  isBaseline: boolean,
  costDelta: number,
  tradeoffs: CostAlternative["tradeoffs"],
): string {
  if (isBaseline) return "Your current selection."

  const parts: string[] = []

  if (costDelta < -20) parts.push("significantly cheaper")
  else if (costDelta < -5) parts.push("cheaper")
  else if (costDelta > 20) parts.push("significantly more expensive")
  else if (costDelta > 5) parts.push("more expensive")
  else parts.push("similar cost")

  if (tradeoffs.strengthRatio > 1.3) parts.push("stronger")
  else if (tradeoffs.strengthRatio < 0.7) parts.push("weaker")

  if (tradeoffs.weightDeltaPercent > 20) parts.push("heavier")
  else if (tradeoffs.weightDeltaPercent < -20) parts.push("lighter")

  if (!tradeoffs.toleranceCapable) parts.push("may not meet tolerance")

  return `${process} + ${material}: ${parts.join(", ")}.`
}

// ─── Main Engine ─────────────────────────────────────────────────────

/**
 * Generates ranked material/process alternatives for a module.
 *
 * @param moduleId - Module identifier
 * @param moduleName - Human-readable module name
 * @param diagnosticAnswers - The 6 diagnostic dimensions for this module
 * @param estimatedMassKg - Estimated module mass (defaults to 0.5kg)
 * @param supplierCounts - Optional supplier count per process from technique enrichments
 * @param aiBaselineCost - Optional Haiku AI estimate for the baseline. When provided,
 *   all alternatives are scaled so the baseline matches this value, keeping delta
 *   percentages relative to what the user actually sees in the cost estimate panel.
 * @returns Ranked alternatives including the baseline, sorted by cost
 */
export function generateAlternatives(
  moduleId: string,
  moduleName: string,
  diagnosticAnswers: Record<string, string>,
  estimatedMassKg: number = 0.5,
  supplierCounts?: SupplierCountMap,
  aiBaselineCost?: number,
): CostOptimisationResult {
  const baseProcess = diagnosticAnswers.mfg_process ?? "Other"
  const baseMaterial = diagnosticAnswers.material ?? "Other"
  const tolerance = diagnosticAnswers.tolerance ?? "Standard (±0.5mm)"
  const finish = diagnosticAnswers.finish ?? "As-manufactured"
  const batchSize = diagnosticAnswers.batch_size ?? "1-10 (prototyping)"
  const environment = diagnosticAnswers.environment ?? "Indoor (office)"

  const requiredToleranceMm = DIAG_TOLERANCE_TO_MM[tolerance] ?? 0.5
  const batchNum = parseBatchSize(batchSize)

  // Get baseline properties for comparison
  const baseStrength = getMaterialStrength(baseMaterial)
  const baseDensity = getMaterialDensity(baseMaterial)
  const baseCost = computeCost(
    baseProcess,
    baseMaterial,
    estimatedMassKg,
    batchNum,
    tolerance,
    finish,
    environment,
  )

  // Build candidate set
  const candidates = new Map<string, { process: string; material: string }>()

  // Always include baseline
  candidates.set(`${baseProcess}|${baseMaterial}`, {
    process: baseProcess,
    material: baseMaterial,
  })

  // Same process, different compatible materials
  const matCompat = getMaterialCompatibilityForProcess(baseProcess)
  for (const [mat, status] of Object.entries(matCompat)) {
    if (status === "compatible" && mat !== baseMaterial) {
      candidates.set(`${baseProcess}|${mat}`, {
        process: baseProcess,
        material: mat,
      })
    }
  }

  // Different compatible processes, same material
  const procCompat = getProcessCompatibilityForMaterial(baseMaterial)
  for (const [proc, status] of Object.entries(procCompat)) {
    if (status === "compatible" && proc !== baseProcess) {
      candidates.set(`${proc}|${baseMaterial}`, {
        process: proc,
        material: baseMaterial,
      })
    }
  }

  // Cross-product: for each major process, add its most common material.
  // INTENT: Surfaces alternatives like "CNC + Aluminium" when starting from "FDM + PLA",
  // where neither axis alone finds good candidates.
  const MAJOR_COMBOS: Array<[string, string]> = [
    ["CNC Machining", "Aluminum 6061"],
    ["Sheet Metal", "Aluminum 6061"],
    ["Sheet Metal", "Steel (mild)"],
    ["Injection Molding", "ABS/Nylon"],
    ["FDM 3D Print", "PLA/PETG"],
    ["Casting", "Aluminum 6061"],
  ]
  for (const [proc, mat] of MAJOR_COMBOS) {
    const key = `${proc}|${mat}`
    if (!candidates.has(key) && proc !== baseProcess && candidates.size < 12) {
      // Verify compatibility before adding
      const compat = getMaterialCompatibilityForProcess(proc)
      if (compat[mat] === "compatible") {
        candidates.set(key, { process: proc, material: mat })
      }
    }
  }

  // INTENT: When the Haiku AI estimate is available, scale all deterministic costs
  // so the baseline matches the AI value. This keeps the alternatives panel consistent
  // with the cost estimate the user already sees. Delta percentages stay the same
  // (they're relative), but absolute values align with the AI estimate.
  const scaleFactor =
    aiBaselineCost != null && aiBaselineCost > 0 && baseCost > 0
      ? aiBaselineCost / baseCost
      : 1

  // Score and rank
  const alternatives: CostAlternative[] = []

  for (const [, candidate] of candidates) {
    const isBaseline =
      candidate.process === baseProcess && candidate.material === baseMaterial
    const rawCost = computeCost(
      candidate.process,
      candidate.material,
      estimatedMassKg,
      batchNum,
      tolerance,
      finish,
      environment,
    )
    const cost = rawCost * scaleFactor
    const costDelta = baseCost > 0 ? ((rawCost - baseCost) / baseCost) * 100 : 0

    // Strength comparison
    const altStrength = getMaterialStrength(candidate.material)
    const strengthRatio =
      baseStrength && altStrength ? altStrength / baseStrength : 1.0

    // Weight comparison (different material density → different part weight)
    const altDensity = getMaterialDensity(candidate.material)
    const weightDelta =
      baseDensity && altDensity
        ? ((altDensity - baseDensity) / baseDensity) * 100
        : 0

    // Tolerance capability
    const toleranceCapable = canProcessAchieveTolerance(
      candidate.process,
      requiredToleranceMm,
    )

    // Supplier availability
    let supplierAvailability: CostAlternative["tradeoffs"]["supplierAvailability"] = "unknown"
    if (supplierCounts) {
      const count = supplierCounts[candidate.process] ?? 0
      if (count >= 20) supplierAvailability = "high"
      else if (count >= 5) supplierAvailability = "medium"
      else if (count > 0) supplierAvailability = "low"
    }

    const tradeoffs = {
      strengthRatio: Math.round(strengthRatio * 100) / 100,
      toleranceCapable,
      supplierAvailability,
      weightDeltaPercent: Math.round(weightDelta),
    }

    alternatives.push({
      process: candidate.process,
      material: candidate.material,
      isBaseline,
      estimatedCostPerUnit: Math.round(cost * 100) / 100,
      costDeltaPercent: Math.round(costDelta),
      tradeoffs,
      reasoning: generateReasoning(
        candidate.process,
        candidate.material,
        isBaseline,
        costDelta,
        tradeoffs,
      ),
    })
  }

  // Sort: baseline first, then by cost ascending
  alternatives.sort((a, b) => {
    if (a.isBaseline) return -1
    if (b.isBaseline) return 1
    return a.estimatedCostPerUnit - b.estimatedCostPerUnit
  })

  // Cap at 6 alternatives (baseline + 5 best)
  const capped = alternatives.slice(0, 6)

  return {
    moduleId,
    moduleName,
    baselineCostPerUnit: Math.round(baseCost * scaleFactor * 100) / 100,
    alternatives: capped,
  }
}
