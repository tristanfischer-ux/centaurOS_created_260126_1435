/**
 * @file cost-estimate-engine.ts — Pure rule-based cost estimation engine.
 *
 * @description Calculates instant manufacturing cost estimates from diagnostic
 * answers and module data. Client-safe (no server imports, no DB calls).
 * Uses constants from cad-lab-cost-constants.ts which are derived from the
 * engineering database where possible.
 *
 * INTENT: Give founders a fast, deterministic cost preview before requesting
 * formal supplier quotes. Not a replacement for actual quotes — a directional
 * signal to inform RFQ budgets.
 */

import {
  MATERIAL_COST_PER_KG,
  MATERIAL_COST_CONFIDENCE,
  PROCESS_HOURLY_RATE,
  HOURS_PER_KG,
  TOOLING_COST,
  TOLERANCE_MULTIPLIER,
  FINISH_MULTIPLIER,
  ENVIRONMENT_MULTIPLIER,
  parseBatchSize,
  type CostConfidence,
} from "@/lib/cad-lab-cost-constants"

// ─── Types ───────────────────────────────────────────────────────────

export interface CostEstimateInput {
  name: string
  process: string | null
  material: string | null
  tolerance: string | null
  finish: string | null
  environment: string | null
  batchSize: string | null
  massKg: number
  massIsEstimated: boolean
  /** simple/moderate/complex — derived from keyParts count or module complexity */
  complexity?: "simple" | "moderate" | "complex"
}

export interface CostEstimateBreakdown {
  processCost: number
  materialCost: number
  tolerancePremium: number
  finishPremium: number
  environmentPremium: number
  toolingCostPerUnit: number
  setupCostPerUnit: number
}

export interface CostEstimate {
  unitCostGbp: number
  minGbp: number
  maxGbp: number
  totalMinGbp: number
  totalMaxGbp: number
  quantity: number
  confidence: "high" | "medium" | "low"
  breakdown: CostEstimateBreakdown
  leadTimeDays: { min: number; max: number }
}

// ─── Constants ───────────────────────────────────────────────────────

const COMPLEXITY_MULTIPLIER: Record<string, number> = {
  simple: 0.7,
  moderate: 1.0,
  complex: 1.5,
}

const SETUP_COST: Record<string, number> = {
  "CNC Machining": 50,
  "Sheet Metal": 30,
  "Injection Molding": 500,
  "Casting": 40,
  "FDM 3D Print": 0,
  "SLA/Resin Print": 0,
  "SLS/Powder Print": 0,
  "Manual/Assembly": 0,
  "Other": 0,
}

const LEAD_TIME_DAYS: Record<string, { min: number; max: number }> = {
  "CNC Machining": { min: 5, max: 15 },
  "Sheet Metal": { min: 5, max: 10 },
  "Injection Molding": { min: 15, max: 40 },
  "FDM 3D Print": { min: 2, max: 5 },
  "SLA/Resin Print": { min: 3, max: 7 },
  "SLS/Powder Print": { min: 5, max: 10 },
  "Casting": { min: 10, max: 25 },
  "Manual/Assembly": { min: 5, max: 15 },
  "Other": { min: 5, max: 20 },
}

// ─── Engine ──────────────────────────────────────────────────────────

/**
 * Estimate the manufacturing cost for a single part/module.
 *
 * @param input - Part specification from diagnostics + mass data
 * @returns Cost estimate with range, breakdown, and confidence
 */
export function estimatePartCost(input: CostEstimateInput): CostEstimate {
  const process = input.process ?? "Other"
  const material = input.material ?? "Other"
  const complexity = input.complexity ?? "moderate"
  const quantity = input.batchSize ? parseBatchSize(input.batchSize) : 1

  // Base process cost
  const hoursPerKg = HOURS_PER_KG[process] ?? HOURS_PER_KG["Other"]
  const hourlyRate = PROCESS_HOURLY_RATE[process] ?? PROCESS_HOURLY_RATE["Other"]
  const complexityMult = COMPLEXITY_MULTIPLIER[complexity]
  const processHours = hoursPerKg * input.massKg * complexityMult
  const processCost = hourlyRate * processHours

  // Material cost
  const materialCostPerKg = MATERIAL_COST_PER_KG[material] ?? MATERIAL_COST_PER_KG["Other"]
  const materialCost = materialCostPerKg * input.massKg

  // Base cost before premiums
  const baseCost = processCost + materialCost

  // Premiums (applied as multiplier - 1.0 on base cost)
  const tolMult = input.tolerance ? (TOLERANCE_MULTIPLIER[input.tolerance] ?? 1.0) : 1.0
  const finMult = input.finish ? (FINISH_MULTIPLIER[input.finish] ?? 1.0) : 1.0
  const envMult = input.environment ? (ENVIRONMENT_MULTIPLIER[input.environment] ?? 1.0) : 1.0

  const tolerancePremium = baseCost * (tolMult - 1.0)
  const finishPremium = baseCost * (finMult - 1.0)
  const environmentPremium = baseCost * (envMult - 1.0)

  // Tooling (amortized over quantity)
  const toolingTotal = TOOLING_COST[process] ?? 0
  const toolingCostPerUnit = quantity > 0 ? toolingTotal / quantity : toolingTotal

  // Setup (one-time, amortized)
  const setupTotal = SETUP_COST[process] ?? 0
  const setupCostPerUnit = quantity > 0 ? setupTotal / quantity : setupTotal

  // Unit cost
  const unitCostGbp = baseCost + tolerancePremium + finishPremium + environmentPremium + toolingCostPerUnit + setupCostPerUnit

  // Confidence scoring
  const materialConfidence: CostConfidence = MATERIAL_COST_CONFIDENCE[material] ?? "estimate"
  const hasProcess = input.process !== null
  const hasMaterial = input.material !== null
  const hasMass = !input.massIsEstimated

  let confidence: "high" | "medium" | "low"
  if (hasProcess && hasMaterial && hasMass && materialConfidence === "database") {
    confidence = "high"
  } else if (hasProcess && hasMaterial) {
    confidence = "medium"
  } else {
    confidence = "low"
  }

  // Range based on confidence
  const rangeFactor = confidence === "high" ? 0.15 : confidence === "medium" ? 0.25 : 0.35
  const minGbp = unitCostGbp * (1 - rangeFactor)
  const maxGbp = unitCostGbp * (1 + rangeFactor)

  // Lead time
  const leadTimeDays = LEAD_TIME_DAYS[process] ?? LEAD_TIME_DAYS["Other"]

  return {
    unitCostGbp,
    minGbp,
    maxGbp,
    totalMinGbp: minGbp * quantity,
    totalMaxGbp: maxGbp * quantity,
    quantity,
    confidence,
    breakdown: {
      processCost,
      materialCost,
      tolerancePremium,
      finishPremium,
      environmentPremium,
      toolingCostPerUnit,
      setupCostPerUnit,
    },
    leadTimeDays,
  }
}

/**
 * Estimate the total assembly cost for multiple parts.
 *
 * @param parts - Array of part specifications
 * @returns Aggregate cost estimate
 */
export function estimateAssemblyCost(parts: CostEstimateInput[]): CostEstimate {
  if (parts.length === 0) {
    return {
      unitCostGbp: 0,
      minGbp: 0,
      maxGbp: 0,
      totalMinGbp: 0,
      totalMaxGbp: 0,
      quantity: 1,
      confidence: "low",
      breakdown: {
        processCost: 0,
        materialCost: 0,
        tolerancePremium: 0,
        finishPremium: 0,
        environmentPremium: 0,
        toolingCostPerUnit: 0,
        setupCostPerUnit: 0,
      },
      leadTimeDays: { min: 0, max: 0 },
    }
  }

  const estimates = parts.map(estimatePartCost)

  const totalMin = estimates.reduce((sum, e) => sum + e.totalMinGbp, 0)
  const totalMax = estimates.reduce((sum, e) => sum + e.totalMaxGbp, 0)
  const totalUnit = estimates.reduce((sum, e) => sum + e.unitCostGbp, 0)

  // Aggregate breakdown
  const breakdown: CostEstimateBreakdown = {
    processCost: estimates.reduce((s, e) => s + e.breakdown.processCost, 0),
    materialCost: estimates.reduce((s, e) => s + e.breakdown.materialCost, 0),
    tolerancePremium: estimates.reduce((s, e) => s + e.breakdown.tolerancePremium, 0),
    finishPremium: estimates.reduce((s, e) => s + e.breakdown.finishPremium, 0),
    environmentPremium: estimates.reduce((s, e) => s + e.breakdown.environmentPremium, 0),
    toolingCostPerUnit: estimates.reduce((s, e) => s + e.breakdown.toolingCostPerUnit, 0),
    setupCostPerUnit: estimates.reduce((s, e) => s + e.breakdown.setupCostPerUnit, 0),
  }

  // Worst confidence wins
  const confidences = estimates.map((e) => e.confidence)
  let confidence: "high" | "medium" | "low" = "high"
  if (confidences.includes("low")) confidence = "low"
  else if (confidences.includes("medium")) confidence = "medium"

  // Lead time = max of all parts (parallel manufacturing)
  const leadTimeDays = {
    min: Math.max(...estimates.map((e) => e.leadTimeDays.min)),
    max: Math.max(...estimates.map((e) => e.leadTimeDays.max)),
  }

  // Use quantity from first part as representative
  const quantity = estimates[0].quantity

  return {
    unitCostGbp: totalUnit,
    minGbp: totalMin / (quantity || 1),
    maxGbp: totalMax / (quantity || 1),
    totalMinGbp: totalMin,
    totalMaxGbp: totalMax,
    quantity,
    confidence,
    breakdown,
    leadTimeDays,
  }
}
