/**
 * @file cad-lab-cost-estimate.tsx — Per-module and system-level cost estimation.
 *
 * @description Calculates rough manufacturing cost estimates from:
 * - Material volume/mass from CAD results
 * - Manufacturing process from diagnostics
 * - Batch size from diagnostics
 * - Lead time from modules
 *
 * Uses a lookup table of approximate costs per process × material class.
 * Estimates are educational/rough — intended to give founders a ballpark,
 * not a binding quote.
 *
 * @component
 *
 * @example
 * <CadLabCostEstimate
 *   modules={modules}
 *   diagnosticAnswers={diagnosticAnswers}
 * />
 */

"use client"

import { useMemo, useState } from "react"
import {
  DollarSign,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Info,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { CadLabModule } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"

// ─── Cost Lookup Tables ─────────────────────────────────────────────

/**
 * Approximate material cost per kilogram by material class.
 *
 * @security None — public data, engineering estimates only.
 */
const MATERIAL_COST_PER_KG: Record<string, number> = {
  "PLA/PETG": 25,
  "ABS/Nylon": 35,
  "Aluminium": 8,
  "Steel/Iron": 4,
  "Stainless Steel": 12,
  "Copper/Brass": 18,
  "Titanium": 80,
  "Carbon Fiber Composite": 60,
  "CFRP/GFRP": 60,
  "Wood/Plywood": 3,
  "Silicone/Rubber": 15,
  "Glass/Ceramic": 10,
  "PCB/Electronic": 0, // Process-driven, not material-driven
  "Other": 20,
}

/**
 * Approximate hourly rate by manufacturing process.
 * Includes machine time + operator cost estimates.
 */
const PROCESS_HOURLY_RATE: Record<string, number> = {
  "FDM 3D Print": 15,
  "SLA/Resin Print": 25,
  "SLS/Powder Print": 40,
  "CNC Machining": 85,
  "Sheet Metal": 60,
  "Injection Molding": 0, // Amortized per-unit, handled separately
  "Casting": 45,
  "Manual/Assembly": 40,
  "Other": 50,
}

/**
 * Estimated processing hours per kg by process.
 * Very rough — real values depend on geometry complexity.
 */
const HOURS_PER_KG: Record<string, number> = {
  "FDM 3D Print": 8,
  "SLA/Resin Print": 6,
  "SLS/Powder Print": 4,
  "CNC Machining": 3,
  "Sheet Metal": 1.5,
  "Injection Molding": 0.02, // Very fast per unit
  "Casting": 2,
  "Manual/Assembly": 5,
  "Other": 3,
}

/**
 * Tooling cost by process. One-time cost amortized over batch.
 */
const TOOLING_COST: Record<string, number> = {
  "FDM 3D Print": 0,
  "SLA/Resin Print": 0,
  "SLS/Powder Print": 0,
  "CNC Machining": 200,
  "Sheet Metal": 500,
  "Injection Molding": 5000,
  "Casting": 1500,
  "Manual/Assembly": 0,
  "Other": 0,
}

// ─── Types ──────────────────────────────────────────────────────────

interface ModuleCost {
  /** Module ID */
  moduleId: string
  /** Module name */
  moduleName: string
  /** Estimated material cost per unit */
  materialCost: number
  /** Estimated processing cost per unit */
  processCost: number
  /** Tooling cost (one-time, amortized over batch) */
  toolingCostPerUnit: number
  /** Total per-unit cost */
  totalPerUnit: number
  /** Mass in kg (from CAD or estimated) */
  massKg: number
  /** Manufacturing process */
  process: string
  /** Material class */
  material: string
  /** Batch size */
  batchSize: number
  /** Whether this is an estimate with low data confidence */
  isEstimated: boolean
}

// ─── Component ──────────────────────────────────────────────────────

interface CadLabCostEstimateProps {
  /** Decomposed modules with optional CAD results */
  modules: CadLabModule[]
  /** Diagnostic answers per module */
  diagnosticAnswers: DiagnosticAnswers
}

/**
 * CadLabCostEstimate — Per-module and system-level cost estimation dashboard.
 *
 * @description Shows a cost breakdown table with material, process, and tooling
 * costs for each module, plus a system total and per-unit cost at batch volume.
 * Estimates are based on diagnostic answers (manufacturing process, material,
 * batch size) and CAD mass properties when available.
 */
export function CadLabCostEstimate({
  modules,
  diagnosticAnswers,
}: CadLabCostEstimateProps): React.ReactNode {
  const [isExpanded, setIsExpanded] = useState(true)

  const costs = useMemo((): ModuleCost[] => {
    return modules.map((mod) => {
      const answers = diagnosticAnswers[mod.id] || {}
      const process = answers.mfg_process || "Other"
      const material = answers.material || "Other"
      const batchSizeStr = answers.batch_size || "1-10 (prototyping)"
      const batchSize = parseBatchSize(batchSizeStr)

      // Get mass from CAD result or estimate from module data
      let massKg = 0
      let isEstimated = true

      if (mod.result?.massProperties?.massKg) {
        massKg = mod.result.massProperties.massKg
        isEstimated = false
      } else if (mod.result?.massGrams) {
        massKg = mod.result.massGrams / 1000
        isEstimated = false
      } else {
        // Rough estimate: 0.2 kg per module for unknown
        massKg = 0.2
      }

      const materialCostPerKg = MATERIAL_COST_PER_KG[material] ?? 20
      const materialCost = massKg * materialCostPerKg

      const hourlyRate = PROCESS_HOURLY_RATE[process] ?? 50
      const hoursPerKg = HOURS_PER_KG[process] ?? 3
      const processCost = massKg * hoursPerKg * hourlyRate

      const toolingTotal = TOOLING_COST[process] ?? 0
      const toolingCostPerUnit = batchSize > 0 ? toolingTotal / batchSize : toolingTotal

      const totalPerUnit = materialCost + processCost + toolingCostPerUnit

      return {
        moduleId: mod.id,
        moduleName: mod.name,
        materialCost,
        processCost,
        toolingCostPerUnit,
        totalPerUnit,
        massKg,
        process,
        material,
        batchSize,
        isEstimated,
      }
    })
  }, [modules, diagnosticAnswers])

  const systemTotal = costs.reduce((sum, c) => sum + c.totalPerUnit, 0)
  const totalMaterialCost = costs.reduce((sum, c) => sum + c.materialCost, 0)
  const totalProcessCost = costs.reduce((sum, c) => sum + c.processCost, 0)
  const totalToolingCost = costs.reduce((sum, c) => sum + c.toolingCostPerUnit, 0)
  const maxBatch = Math.max(...costs.map((c) => c.batchSize), 1)
  const hasAnyEstimates = costs.some((c) => c.isEstimated)
  const hasDiagnostics = Object.keys(diagnosticAnswers).length > 0

  if (!hasDiagnostics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Cost Estimation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Complete the engineering diagnostics above to generate cost estimates. Manufacturing process, material, and batch size are needed.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center justify-between w-full text-left"
        >
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Cost Estimation
            <span className="text-xs font-normal font-mono text-foreground bg-muted px-2 py-0.5 rounded">
              ${systemTotal.toFixed(2)} / unit
            </span>
          </CardTitle>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4">
          {hasAnyEstimates && (
            <div className="flex items-start gap-2 p-3 bg-status-warning-light rounded text-xs text-status-warning-dark">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <span>Some modules use estimated mass (0.2 kg default). Generate CAD for more accurate costs.</span>
            </div>
          )}

          {/* Cost breakdown table */}
          <div className="border rounded-md overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-2 font-semibold text-muted-foreground">Module</th>
                  <th className="text-right p-2 font-semibold text-muted-foreground">Material</th>
                  <th className="text-right p-2 font-semibold text-muted-foreground">Process</th>
                  <th className="text-right p-2 font-semibold text-muted-foreground">Tooling</th>
                  <th className="text-right p-2 font-semibold text-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {costs.map((c) => (
                  <tr key={c.moduleId} className="border-b last:border-b-0">
                    <td className="p-2 font-medium text-foreground">
                      <div className="flex items-center gap-1.5">
                        {c.moduleName}
                        {c.isEstimated && (
                          <span className="text-[10px] font-mono text-status-warning" title="Mass estimated">~</span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                        {c.process} · {c.material} · {(c.massKg * 1000).toFixed(0)}g
                      </div>
                    </td>
                    <td className="p-2 text-right font-mono text-foreground">${c.materialCost.toFixed(2)}</td>
                    <td className="p-2 text-right font-mono text-foreground">${c.processCost.toFixed(2)}</td>
                    <td className="p-2 text-right font-mono text-foreground">
                      {c.toolingCostPerUnit > 0 ? `$${c.toolingCostPerUnit.toFixed(2)}` : "—"}
                    </td>
                    <td className="p-2 text-right font-mono font-semibold text-foreground">${c.totalPerUnit.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2">
                  <td className="p-2 font-semibold text-foreground">System Total</td>
                  <td className="p-2 text-right font-mono font-semibold text-foreground">${totalMaterialCost.toFixed(2)}</td>
                  <td className="p-2 text-right font-mono font-semibold text-foreground">${totalProcessCost.toFixed(2)}</td>
                  <td className="p-2 text-right font-mono font-semibold text-foreground">
                    {totalToolingCost > 0 ? `$${totalToolingCost.toFixed(2)}` : "—"}
                  </td>
                  <td className="p-2 text-right font-mono font-bold text-foreground text-sm">${systemTotal.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Per-unit at volume */}
          {maxBatch > 10 && (
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded text-sm">
              <Info className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-muted-foreground">
                At batch of <span className="font-semibold text-foreground">{maxBatch}</span> units:
                per-unit system cost ≈ <span className={cn("font-semibold font-mono text-foreground")}>
                  ${systemTotal.toFixed(2)}
                </span>
                {" "}(tooling amortized)
              </span>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground">
            Costs are rough estimates based on material mass × process rates. Actual quotes from suppliers will differ.
            Generate CAD models for mass-based accuracy.
          </p>
        </CardContent>
      )}
    </Card>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Parse batch size from diagnostic answer string.
 *
 * @param batchStr - e.g. "1-10 (prototyping)" or "100-1000 (pilot)"
 * @returns Midpoint of the range
 */
function parseBatchSize(batchStr: string): number {
  const match = batchStr.match(/(\d+)-(\d+)/)
  if (match) {
    const low = parseInt(match[1], 10)
    const high = parseInt(match[2], 10)
    return Math.round((low + high) / 2)
  }
  const singleMatch = batchStr.match(/(\d+)\+?/)
  if (singleMatch) return parseInt(singleMatch[1], 10)
  return 5
}
