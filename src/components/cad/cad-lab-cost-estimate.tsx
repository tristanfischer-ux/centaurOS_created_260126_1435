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
  parseBatchSize,
  getModuleMassKg,
} from "@/lib/cad-lab-cost-constants"
import { findMaterial } from "@/lib/engineering-data"

// ─── Chart Colors ───────────────────────────────────────────────────

const COLOR_MATERIAL = chartColors[0]  // Orange
const COLOR_PROCESS = chartColors[1]   // Blue
const COLOR_TOOLING = chartColors[3]   // Amber

/**
 * Maps diagnostic material class strings → engineering database material IDs.
 * Uses the primary/representative material for each class to get real cost data.
 *
 * FLOW: Diagnostic UI → class string → this map → engineering database → real cost
 */
const DIAGNOSTIC_MATERIAL_TO_DB_ID: Record<string, string> = {
  "PLA/PETG": "pla",
  "ABS/Nylon": "abs",
  "Resin (standard)": "pla",              // SLA resin cost ≈ PLA filament
  "Aluminum 6061": "al-6061-t6",
  "Aluminium": "al-6061-t6",
  "Steel (mild)": "steel-1018",
  "Steel/Iron": "steel-1018",
  "Stainless Steel": "ss-304",
  "Titanium": "ti-6al-4v",
  "Copper/Brass": "copper-c110",
  "Carbon Fiber": "cf-woven-3k",
  "Carbon Fiber Composite": "cf-woven-3k",
  "CFRP/GFRP": "cf-woven-3k",
}

/**
 * Resolves material cost per kg from the engineering database.
 * Falls back to hardcoded estimates for materials not in the DB.
 *
 * @param diagnosticMaterial - Material class string from diagnostics UI
 * @returns Cost per kg in USD (midpoint of range from DB, or hardcoded fallback)
 */
function getMaterialCostPerKg(diagnosticMaterial: string): number {
  // Try engineering database first via diagnostic mapping
  const dbId = DIAGNOSTIC_MATERIAL_TO_DB_ID[diagnosticMaterial]
  if (dbId) {
    const mat = findMaterial(dbId)
    if (mat) {
      return (mat.cost_per_kg_usd.low + mat.cost_per_kg_usd.high) / 2
    }
  }

  // Fallback for materials not in engineering database
  return MATERIAL_COST_FALLBACK[diagnosticMaterial] ?? 20
}

/** Fallback costs for materials not covered by the engineering database. */
const MATERIAL_COST_FALLBACK: Record<string, number> = {
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
      const { massKg, isEstimated } = getModuleMassKg(
        mod.result?.massProperties?.massKg,
        mod.result?.massGrams,
      )

      const materialCostPerKg = getMaterialCostPerKg(material)
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
                        { name: "Material", value: totalMaterialCost },
                        { name: "Processing", value: totalProcessCost },
                        { name: "Tooling", value: totalToolingCost },
                      ].filter((d) => d.value > 0)}
                      dataKey="value"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {[
                        { value: totalMaterialCost, color: COLOR_MATERIAL },
                        { value: totalProcessCost, color: COLOR_PROCESS },
                        { value: totalToolingCost, color: COLOR_TOOLING },
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
                  <th scope="col" className="text-right p-2 font-semibold text-muted-foreground">Material</th>
                  <th scope="col" className="text-right p-2 font-semibold text-muted-foreground">Process</th>
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
        ${item.value.toFixed(2)} ({pct}%)
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
          {p.name}: ${p.value.toFixed(2)}
        </p>
      ))}
      <p className="font-semibold text-foreground mt-1 border-t pt-1">
        Total: ${total.toFixed(2)}
      </p>
    </div>
  )
}

