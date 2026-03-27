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
): Promise<
  | { alternatives: CostAlternative[]; baselineCostPerUnit: number }
  | { error: string }
> {
  try {
    // Fetch real supplier counts for the current process (non-blocking enrichment)
    let supplierCounts: SupplierCountMap | undefined
    const process = diagnosticAnswers.mfg_process
    if (process) {
      try {
        const insights = await getTechniqueInsightsByProcess(process)
        if (insights && typeof insights.totalSupplierCount === "number") {
          supplierCounts = { [process]: insights.totalSupplierCount }
        }
      } catch {
        // Non-critical — engine works without supplier counts
      }
    }

    const result = generateAlternatives(
      moduleId,
      moduleName,
      diagnosticAnswers,
      estimatedMassKg,
      supplierCounts,
    )

    return {
      alternatives: result.alternatives,
      baselineCostPerUnit: result.baselineCostPerUnit,
    }
  } catch (err) {
    console.error("[CostOptimisation] Error generating alternatives:", err)
    return {
      error:
        err instanceof Error ? err.message : "Failed to generate alternatives",
    }
  }
}
