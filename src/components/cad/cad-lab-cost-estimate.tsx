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
  PoundSterling,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Info,
} from "lucide-react"
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { chartColors } from "@/lib/chart-colors"
import type { CadLabModule } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"
import {
  MATERIAL_COST_PER_KG,
  MATERIAL_COST_CONFIDENCE,
  PROCESS_HOURLY_RATE,
  HOURS_PER_KG,
  TOOLING_COST,
  parseBatchSize,
  getModuleMassKg,
} from "@/lib/cad-lab-cost-constants"

// ─── Chart Colors ───────────────────────────────────────────────────

const COLOR_MATERIAL = chartColors[0]  // Orange
const COLOR_PROCESS = chartColors[1]   // Blue
const COLOR_TOOLING = chartColors[3]   // Amber
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
  /** Whether the material cost is an estimate (not backed by engineering DB) */
  isCostEstimated: boolean
  /** Material cost per kg rate */
  materialCostPerKg: number
  /** Processing hours per kg */
  hoursPerKg: number
  /** Processing hourly rate */
  hourlyRate: number
  /** Total tooling cost (before amortization) */
  toolingTotal: number
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

      // Get mass from CAD result or keyword-estimate from module text
      const moduleText = [mod.name, mod.purpose, ...mod.keyParts].join(" ")
      const { massKg, isEstimated } = getModuleMassKg(
        mod.result?.massProperties?.massKg,
        mod.result?.massGrams,
        undefined,
        moduleText,
      )

      const materialCostPerKg = MATERIAL_COST_PER_KG[material] ?? 20
      const isCostEstimated = (MATERIAL_COST_CONFIDENCE[material] ?? "estimate") === "estimate"
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
        isCostEstimated,
        materialCostPerKg,
        hoursPerKg,
        hourlyRate,
        toolingTotal,
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
            <PoundSterling className="h-4 w-4" />
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
            <PoundSterling className="h-4 w-4" />
            Cost Estimation
            <span className="text-xs font-normal font-mono text-foreground bg-muted px-2 py-0.5 rounded">
              £{systemTotal.toFixed(2)} / unit
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
              <span>Some modules use keyword-estimated mass. Generate CAD for more accurate costs.</span>
            </div>
          )}

          {/* ── Charts ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Cost breakdown donut */}
            <div className="p-4 border rounded-lg">
              <p className="text-xs font-semibold text-foreground mb-3">Cost Composition</p>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Material", value: totalMaterialCost, color: COLOR_MATERIAL },
                        { name: "Processing", value: totalProcessCost, color: COLOR_PROCESS },
                        { name: "Tooling", value: totalToolingCost, color: COLOR_TOOLING },
                      ].filter((d) => d.value > 0)}
                      dataKey="value"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {[
                        { name: "Material", value: totalMaterialCost, color: COLOR_MATERIAL },
                        { name: "Processing", value: totalProcessCost, color: COLOR_PROCESS },
                        { name: "Tooling", value: totalToolingCost, color: COLOR_TOOLING },
                      ]
                        .filter((d) => d.value > 0)
                        .map((d, i) => (
                          <Cell key={i} fill={d.color} />
                        ))}
                    </Pie>
                    <Tooltip content={<CostDonutTooltip total={systemTotal} />} />
                    <Legend
                      verticalAlign="bottom"
                      height={28}
                      formatter={(value: string) => (
                        <span className="text-[10px] text-muted-foreground">{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Cost by module — horizontal stacked bar */}
            {costs.length > 0 && (
              <div className="p-4 border rounded-lg">
                <p className="text-xs font-semibold text-foreground mb-3">Cost by Module</p>
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={costs
                        .slice()
                        .sort((a, b) => b.totalPerUnit - a.totalPerUnit)
                        .map((c) => ({
                          name: c.moduleName.length > 16
                            ? `${c.moduleName.slice(0, 14)}…`
                            : c.moduleName,
                          material: c.materialCost,
                          process: c.processCost,
                          tooling: c.toolingCostPerUnit,
                        }))}
                      layout="vertical"
                      margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis
                        type="category"
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10 }}
                        width={80}
                      />
                      <Tooltip content={<ModuleBarTooltip />} cursor={{ fill: "hsl(var(--muted))" }} />
                      <Bar dataKey="material" stackId="cost" fill={COLOR_MATERIAL} radius={[0, 0, 0, 0]} barSize={14} name="Material" />
                      <Bar dataKey="process" stackId="cost" fill={COLOR_PROCESS} radius={[0, 0, 0, 0]} barSize={14} name="Processing" />
                      <Bar dataKey="tooling" stackId="cost" fill={COLOR_TOOLING} radius={[0, 4, 4, 0]} barSize={14} name="Tooling" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          {/* Cost breakdown table */}
          <div className="border rounded-md overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th scope="col" className="text-left p-2 font-semibold text-muted-foreground">Module</th>
                  <th scope="col" className="text-right p-2 font-semibold text-muted-foreground">Raw Material</th>
                  <th scope="col" className="text-right p-2 font-semibold text-muted-foreground">Processing</th>
                  <th scope="col" className="text-right p-2 font-semibold text-muted-foreground">Tooling</th>
                  <th scope="col" className="text-right p-2 font-semibold text-foreground">Total</th>
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
                        {c.process} · {c.material} · {c.massKg.toFixed(1)}kg
                      </div>
                    </td>
                    <td className="p-2 text-right font-mono text-foreground">
                      <span className="inline-flex items-center gap-1 justify-end">
                        £{c.materialCost.toFixed(2)}
                        {c.isCostEstimated && (
                          <span title="Cost is approximate — material not in engineering database">
                            <Info className="h-3 w-3 text-muted-foreground" />
                          </span>
                        )}
                      </span>
                      <div className="text-[9px] text-muted-foreground mt-0.5">
                        {c.massKg.toFixed(1)}kg × £{c.materialCostPerKg}/kg
                      </div>
                    </td>
                    <td className="p-2 text-right font-mono text-foreground">
                      £{c.processCost.toFixed(2)}
                      <div className="text-[9px] text-muted-foreground mt-0.5">
                        {c.massKg.toFixed(1)}kg × {c.hoursPerKg}hr/kg × £{c.hourlyRate}/hr
                      </div>
                    </td>
                    <td className="p-2 text-right font-mono text-foreground">
                      {c.toolingCostPerUnit > 0 ? `£${c.toolingCostPerUnit.toFixed(2)}` : "—"}
                      {c.toolingTotal > 0 && (
                        <div className="text-[9px] text-muted-foreground mt-0.5">
                          £{c.toolingTotal} ÷ {c.batchSize} units
                        </div>
                      )}
                    </td>
                    <td className="p-2 text-right font-mono font-semibold text-foreground">£{c.totalPerUnit.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2">
                  <td className="p-2 font-semibold text-foreground">System Total</td>
                  <td className="p-2 text-right font-mono font-semibold text-foreground">£{totalMaterialCost.toFixed(2)}</td>
                  <td className="p-2 text-right font-mono font-semibold text-foreground">£{totalProcessCost.toFixed(2)}</td>
                  <td className="p-2 text-right font-mono font-semibold text-foreground">
                    {totalToolingCost > 0 ? `£${totalToolingCost.toFixed(2)}` : "—"}
                  </td>
                  <td className="p-2 text-right font-mono font-bold text-foreground text-sm">£{systemTotal.toFixed(2)}</td>
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
                  £{systemTotal.toFixed(2)}
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

// ─── Chart Tooltips ──────────────────────────────────────────────────

interface DonutTooltipPayload {
  name: string
  value: number
  payload: { fill: string }
}

/** Custom tooltip for the cost composition donut chart. */
function CostDonutTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean
  payload?: DonutTooltipPayload[]
  total: number
}): React.ReactNode {
  if (!active || !payload?.length) return null
  const item = payload[0]
  const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0"
  return (
    <div className="bg-background p-2 border rounded-lg shadow-lg text-xs">
      <p className="font-medium text-foreground">{item.name}</p>
      <p className="text-muted-foreground font-mono">
        £{item.value.toFixed(2)} ({pct}%)
      </p>
    </div>
  )
}

interface BarTooltipPayload {
  name: string
  value: number
  color: string
  dataKey: string
}

/** Custom tooltip for the cost-by-module stacked bar chart. */
function ModuleBarTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: BarTooltipPayload[]
  label?: string
}): React.ReactNode {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (p.value || 0), 0)
  return (
    <div className="bg-background p-2 border rounded-lg shadow-lg text-xs">
      <p className="font-medium text-foreground mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="text-muted-foreground">
          <span style={{ color: p.color }}>●</span>{" "}
          {p.name}: £{p.value.toFixed(2)}
        </p>
      ))}
      <p className="font-semibold text-foreground mt-1 border-t pt-1">
        Total: £{total.toFixed(2)}
      </p>
    </div>
  )
}

