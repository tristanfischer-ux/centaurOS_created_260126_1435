/**
 * @file cad-lab-cost-optimisation.ts — Server action for cost alternative exploration
 *
 * @description Thin wrapper around the deterministic cost optimisation engine.
 * Optionally enriches results with real supplier counts from technique enrichments.
 *
 * @related
 * - Engine: src/lib/cad-lab/cost-optimisation-engine.ts
 * - Technique data: src/actions/manufacturing-techniques.ts
 */

"use server"

import {
  generateAlternatives,
  type CostAlternative,
  type SupplierCountMap,
} from "@/lib/cad-lab/cost-optimisation-engine"
import { getTechniqueInsightsByProcess } from "@/actions/manufacturing-techniques"

export type { CostAlternative }

/**
 * Generates ranked cost alternatives for a module's diagnostic answers.
 * Runs in <200ms (deterministic engine + optional supplier count lookup).
 *
 * @param moduleId - Module identifier
 * @param moduleName - Human-readable module name
 * @param diagnosticAnswers - The 6 diagnostic dimensions
 * @param estimatedMassKg - Module mass estimate (defaults to 0.5kg in engine)
 * @returns Ranked alternatives or error
 */
export async function generateCostAlternatives(
  moduleId: string,
  moduleName: string,
  diagnosticAnswers: Record<string, string>,
  estimatedMassKg?: number,
  /** Haiku AI cost estimate for this module — used as baseline for delta calculations */
  aiCostPerUnit?: number,
): Promise<
  | { alternatives: CostAlternative[]; baselineCostPerUnit: number }
  | { error: string }
> {
  try {
    // First pass: generate alternatives to discover all distinct processes
    const preliminary = generateAlternatives(
      moduleId,
      moduleName,
      diagnosticAnswers,
      estimatedMassKg,
    )

    // Fetch supplier counts for ALL distinct processes in the alternatives
    const distinctProcesses = [
      ...new Set(preliminary.alternatives.map((a) => a.process)),
    ]
    let supplierCounts: SupplierCountMap | undefined
    try {
      const results = await Promise.allSettled(
        distinctProcesses.map(async (proc) => {
          const insights = await getTechniqueInsightsByProcess(proc)
          return insights && typeof insights.totalSupplierCount === "number"
            ? { process: proc, count: insights.totalSupplierCount }
            : null
        }),
      )
      const counts: SupplierCountMap = {}
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) {
          counts[r.value.process] = r.value.count
        }
      }
      if (Object.keys(counts).length > 0) supplierCounts = counts
    } catch {
      // Non-critical — engine works without supplier counts
    }

    // Second pass: re-generate with supplier counts populated
    const result = generateAlternatives(
      moduleId,
      moduleName,
      diagnosticAnswers,
      estimatedMassKg,
      supplierCounts,
      aiCostPerUnit,
    )

    return {
      alternatives: result.alternatives,
      baselineCostPerUnit: aiCostPerUnit ?? result.baselineCostPerUnit,
    }
  } catch (err) {
    console.error("[CostOptimisation] Error generating alternatives:", err)
    return {
      error:
        err instanceof Error ? err.message : "Failed to generate alternatives",
    }
  }
}
