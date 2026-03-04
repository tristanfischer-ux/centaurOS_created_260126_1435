/**
 * @file cad-lab-cost-estimate.tsx — Per-module and system-level cost estimation.
 *
 * @description Calculates rough manufacturing cost estimates from:
 * - Material volume/mass from CAD results
 * - Manufacturing process from diagnostics
 * - Batch size from diagnostics
 * - Lead time from modules
 *
 * Uses a lookup table of approximate costs per process x material class.
 * Estimates are educational/rough — intended to give founders a ballpark,
 * not a binding quote.
 *
 * @component
 *
 * @example
 * <CadLabCostEstimate
 *   modules={modules}
 *   diagnosticAnswers={diagnosticAnswers}
 *   onCostOverride={(moduleId, overrides) => { ... }}
 * />
 */

"use client"

import { useMemo, useState, useCallback } from "react"
import {
  PoundSterling,
  ChevronDown,
  ChevronRight,
  Info,
  Pencil,
  RotateCcw,
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
  LabelList,
} from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/format"
import { chartColors } from "@/lib/chart-colors"
import type { CadLabModule, EarlyCostEstimate } from "@/lib/cad-lab-types"
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
  /** Default (lookup table) values for reset */
  defaults: {
    materialCostPerKg: number
    hoursPerKg: number
    hourlyRate: number
    massKg: number
  }
  /** Whether any cost overrides are active */
  hasOverrides: boolean
  /** Current overrides from the module (for merging in cell popovers) */
  existingOverrides?: CadLabModule["costOverrides"]
}

// ─── Component ──────────────────────────────────────────────────────

interface CadLabCostEstimateProps {
  /** Decomposed modules with optional CAD results */
  modules: CadLabModule[]
  /** Diagnostic answers per module */
  diagnosticAnswers: DiagnosticAnswers
  /** Callback when user edits cost assumptions for a module */
  onCostOverride?: (moduleId: string, overrides: CadLabModule["costOverrides"]) => void
  /** Number of suppliers on the shortlist (for callout banner) */
  shortlistedSupplierCount?: number
  /** Early cost estimates with dimension-based mass (keyed by moduleId) */
  earlyCostEstimates?: Record<string, EarlyCostEstimate>
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
  onCostOverride,
  shortlistedSupplierCount = 0,
  earlyCostEstimates,
}: CadLabCostEstimateProps): React.ReactNode {
  const [isExpanded, setIsExpanded] = useState(true)

  const costs = useMemo((): ModuleCost[] => {
    return modules.map((mod) => {
      const answers = diagnosticAnswers[mod.id] || {}
      const process = answers.mfg_process || "Other"
      const material = answers.material || "Other"
      const batchSizeStr = answers.batch_size || "1-10 (prototyping)"
      const batchSize = parseBatchSize(batchSizeStr)

      // Get mass from CAD result or multi-tier estimation fallback
      const moduleText = [mod.name, mod.purpose, ...mod.keyParts].join(" ")
      const earlyMassKg = earlyCostEstimates?.[mod.id]?.estimatedMassKg
      const { massKg: defaultMassKg, isEstimated } = getModuleMassKg(
        mod.result?.massProperties?.massKg,
        mod.result?.massGrams,
        undefined,
        moduleText,
        mod.estimatedMassKg,
        earlyMassKg,
      )

      // Lookup-table defaults
      const defaultMaterialCostPerKg = MATERIAL_COST_PER_KG[material] ?? 20
      const defaultHoursPerKg = HOURS_PER_KG[process] ?? 3
      const defaultHourlyRate = PROCESS_HOURLY_RATE[process] ?? 50

      // Merge user overrides
      const overrides = mod.costOverrides
      const massKg = overrides?.massKg ?? defaultMassKg
      const materialCostPerKg = overrides?.materialCostPerKg ?? defaultMaterialCostPerKg
      const hoursPerKg = overrides?.hoursPerKg ?? defaultHoursPerKg
      const hourlyRate = overrides?.hourlyRate ?? defaultHourlyRate

      const hasOverrides = !!(overrides?.materialCostPerKg != null || overrides?.hoursPerKg != null || overrides?.hourlyRate != null || overrides?.massKg != null)

      const isCostEstimated = (MATERIAL_COST_CONFIDENCE[material] ?? "estimate") === "estimate"
      const materialCost = massKg * materialCostPerKg

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
        defaults: {
          materialCostPerKg: defaultMaterialCostPerKg,
          hoursPerKg: defaultHoursPerKg,
          hourlyRate: defaultHourlyRate,
          massKg: defaultMassKg,
        },
        hasOverrides,
        existingOverrides: overrides,
      }
    })
  }, [modules, diagnosticAnswers, earlyCostEstimates])

  // Build a stable index map: moduleId → original position (for numbering)
  const moduleIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    modules.forEach((m, i) => map.set(m.id, i + 1))
    return map
  }, [modules])

  const systemTotal = costs.reduce((sum, c) => sum + c.totalPerUnit, 0)
  const totalMaterialCost = costs.reduce((sum, c) => sum + c.materialCost, 0)
  const totalProcessCost = costs.reduce((sum, c) => sum + c.processCost, 0)
  const totalToolingCost = costs.reduce((sum, c) => sum + c.toolingCostPerUnit, 0)
  const maxBatch = Math.max(...costs.map((c) => c.batchSize), 1)
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
              {formatCurrency(systemTotal)} / unit
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
                <div style={{ height: Math.max(180, costs.length * 28 + 20) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={costs
                        .slice()
                        .sort((a, b) => b.totalPerUnit - a.totalPerUnit)
                        .map((c) => {
                          const num = moduleIndexMap.get(c.moduleId) ?? 0
                          const label = `${num}. ${c.moduleName}`
                          return {
                            name: label.length > 26
                              ? `${label.slice(0, 24)}…`
                              : label,
                            material: c.materialCost,
                            process: c.processCost,
                            tooling: c.toolingCostPerUnit,
                          }
                        })}
                      layout="vertical"
                      margin={{ top: 0, right: 60, left: 0, bottom: 0 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis
                        type="category"
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10 }}
                        width={120}
                      />
                      <Tooltip content={<ModuleBarTooltip />} cursor={{ fill: "hsl(var(--muted))" }} />
                      <Bar dataKey="material" stackId="cost" fill={COLOR_MATERIAL} radius={[0, 0, 0, 0]} barSize={14} name="Material" />
                      <Bar dataKey="process" stackId="cost" fill={COLOR_PROCESS} radius={[0, 0, 0, 0]} barSize={14} name="Processing" />
                      <Bar dataKey="tooling" stackId="cost" fill={COLOR_TOOLING} radius={[0, 4, 4, 0]} barSize={14} name="Tooling">
                        <LabelList
                          content={({ x, y, width: w, height: h, ...entry }) => {
                            const d = entry as unknown as { material: number; process: number; tooling: number }
                            const total = (d.material ?? 0) + (d.process ?? 0) + (d.tooling ?? 0)
                            if (total <= 0) return null
                            return (
                              <text
                                x={(x as number) + (w as number) + 4}
                                y={(y as number) + (h as number) / 2}
                                textAnchor="start"
                                dominantBaseline="central"
                                className="fill-muted-foreground"
                                fontSize={10}
                                fontFamily="monospace"
                              >
                                {formatCurrency(total)}
                              </text>
                            )
                          }}
                        />
                      </Bar>
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
                        <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-muted text-[10px] font-bold text-muted-foreground flex-shrink-0">
                          {moduleIndexMap.get(c.moduleId) ?? 0}
                        </span>
                        {c.moduleName}
                        {c.isEstimated && (
                          <span className="text-[10px] font-mono text-status-warning" title="Mass estimated">~</span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5 ml-[26px]">
                        {c.process} · {c.material} · {c.massKg.toFixed(1)}kg
                      </div>
                    </td>
                    <td className="p-2 text-right font-mono text-foreground">
                      <MaterialCostCell cost={c} onCostOverride={onCostOverride} />
                    </td>
                    <td className="p-2 text-right font-mono text-foreground">
                      <ProcessingCostCell cost={c} onCostOverride={onCostOverride} />
                    </td>
                    <td className="p-2 text-right font-mono text-foreground">
                      {c.toolingCostPerUnit > 0 ? formatCurrency(c.toolingCostPerUnit) : "—"}
                      {c.toolingTotal > 0 && (
                        <div className="text-[9px] text-muted-foreground mt-0.5">
                          {formatCurrency(c.toolingTotal)} ÷ {c.batchSize} units
                        </div>
                      )}
                    </td>
                    <td className="p-2 text-right font-mono font-semibold text-foreground">{formatCurrency(c.totalPerUnit)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2">
                  <td className="p-2 font-semibold text-foreground">System Total</td>
                  <td className="p-2 text-right font-mono font-semibold text-foreground">{formatCurrency(totalMaterialCost)}</td>
                  <td className="p-2 text-right font-mono font-semibold text-foreground">{formatCurrency(totalProcessCost)}</td>
                  <td className="p-2 text-right font-mono font-semibold text-foreground">
                    {totalToolingCost > 0 ? formatCurrency(totalToolingCost) : "—"}
                  </td>
                  <td className="p-2 text-right font-mono font-bold text-foreground text-sm">{formatCurrency(systemTotal)}</td>
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
                  {formatCurrency(systemTotal)}
                </span>
                {" "}(tooling amortized)
              </span>
            </div>
          )}

          {/* Shortlist callout */}
          <div className="rounded-lg border border-status-info/30 bg-status-info-light/20 p-3 space-y-1">
            <p className="text-xs font-medium text-foreground">
              These are internal budget estimates based on industry rates.
            </p>
            {shortlistedSupplierCount > 0 ? (
              <p className="text-[11px] text-muted-foreground">
                {shortlistedSupplierCount} supplier{shortlistedSupplierCount !== 1 ? "s" : ""} shortlisted — send RFQs from the Shortlist tab to get real pricing.
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Compare against real supplier quotes on the Shortlist tab.
              </p>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground">
            Costs are rough estimates based on material mass × process rates. Actual quotes from suppliers will differ.
          </p>
        </CardContent>
      )}
    </Card>
  )
}

// ─── Editable Assumption Popovers ───────────────────────────────────

/** Popover trigger + content for editing Raw Material cost assumptions. */
function MaterialCostCell({
  cost: c,
  onCostOverride,
}: {
  cost: ModuleCost
  onCostOverride?: CadLabCostEstimateProps["onCostOverride"]
}): React.ReactNode {
  const [massKg, setMassKg] = useState(c.massKg)
  const [costPerKg, setCostPerKg] = useState(c.materialCostPerKg)

  // Sync local state when props change (e.g. after reset)
  const prevModuleId = useState(c.moduleId)[0]
  if (prevModuleId === c.moduleId && massKg !== c.massKg && costPerKg !== c.materialCostPerKg) {
    setMassKg(c.massKg)
    setCostPerKg(c.materialCostPerKg)
  }

  const handleApply = useCallback(() => {
    if (!onCostOverride) return
    // Build full merged overrides — preserve processing overrides from other popover
    const merged: NonNullable<CadLabModule["costOverrides"]> = { ...c.existingOverrides }
    if (costPerKg !== c.defaults.materialCostPerKg) merged.materialCostPerKg = costPerKg
    else delete merged.materialCostPerKg
    if (massKg !== c.defaults.massKg) merged.massKg = massKg
    else delete merged.massKg
    onCostOverride(c.moduleId, Object.keys(merged).length > 0 ? merged : undefined)
  }, [onCostOverride, c.moduleId, c.defaults.materialCostPerKg, c.defaults.massKg, c.existingOverrides, costPerKg, massKg])

  const handleReset = useCallback(() => {
    setMassKg(c.defaults.massKg)
    setCostPerKg(c.defaults.materialCostPerKg)
    // Preserve processing overrides when resetting material
    const preserved: NonNullable<CadLabModule["costOverrides"]> = {}
    if (c.existingOverrides?.hoursPerKg != null) preserved.hoursPerKg = c.existingOverrides.hoursPerKg
    if (c.existingOverrides?.hourlyRate != null) preserved.hourlyRate = c.existingOverrides.hourlyRate
    onCostOverride?.(c.moduleId, Object.keys(preserved).length > 0 ? preserved : undefined)
  }, [onCostOverride, c.moduleId, c.defaults.massKg, c.defaults.materialCostPerKg, c.existingOverrides])

  const hasMaterialOverride = c.hasOverrides && (c.materialCostPerKg !== c.defaults.materialCostPerKg || c.massKg !== c.defaults.massKg)

  const trigger = (
    <span className="inline-flex items-center gap-1 justify-end">
      <span className={cn(hasMaterialOverride && "text-international-orange")}>
        {formatCurrency(c.materialCost)}
      </span>
      {c.isCostEstimated && !hasMaterialOverride && (
        <span title="Cost is approximate — material not in engineering database">
          <Info className="h-3 w-3 text-muted-foreground" />
        </span>
      )}
      {hasMaterialOverride && (
        <Pencil className="h-2.5 w-2.5 text-international-orange" />
      )}
    </span>
  )

  if (!onCostOverride) {
    return (
      <>
        {trigger}
        <div className="text-[9px] text-muted-foreground mt-0.5">
          {c.massKg.toFixed(1)}kg × £{c.materialCostPerKg}/kg
        </div>
      </>
    )
  }

  return (
    <Popover onOpenChange={(open) => {
      if (open) {
        setMassKg(c.massKg)
        setCostPerKg(c.materialCostPerKg)
      }
    }}>
      <PopoverTrigger asChild>
        <button type="button" className="text-right cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors">
          {trigger}
          <div className="text-[9px] text-muted-foreground mt-0.5">
            {c.massKg.toFixed(1)}kg × £{c.materialCostPerKg}/kg
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3">
        <p className="text-xs font-semibold text-foreground">Raw Material Assumptions</p>
        <p className="text-[10px] text-muted-foreground">mass × cost/kg = total</p>

        <div className="space-y-2">
          <label className="block">
            <span className="text-[10px] text-muted-foreground">Mass (kg)</span>
            <Input
              type="number"
              min={0}
              step={0.1}
              value={massKg}
              onChange={(e) => setMassKg(parseFloat(e.target.value) || 0)}
              onBlur={handleApply}
              className="h-8 text-xs mt-0.5"
            />
          </label>
          <label className="block">
            <span className="text-[10px] text-muted-foreground">Material cost (£/kg)</span>
            <Input
              type="number"
              min={0}
              step={0.5}
              value={costPerKg}
              onChange={(e) => setCostPerKg(parseFloat(e.target.value) || 0)}
              onBlur={handleApply}
              className="h-8 text-xs mt-0.5"
            />
          </label>
        </div>

        <div className="flex items-center justify-between pt-1 border-t">
          <p className="text-[10px] text-muted-foreground font-mono">
            = {formatCurrency(massKg * costPerKg)}
          </p>
          <button
            type="button"
            onClick={handleReset}
            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <RotateCcw className="h-2.5 w-2.5" />
            Reset to default
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** Popover trigger + content for editing Processing cost assumptions. */
function ProcessingCostCell({
  cost: c,
  onCostOverride,
}: {
  cost: ModuleCost
  onCostOverride?: CadLabCostEstimateProps["onCostOverride"]
}): React.ReactNode {
  const [hoursPerKg, setHoursPerKg] = useState(c.hoursPerKg)
  const [hourlyRate, setHourlyRate] = useState(c.hourlyRate)

  const handleApply = useCallback(() => {
    if (!onCostOverride) return
    // Build full merged overrides — preserve material overrides from other popover
    const merged: NonNullable<CadLabModule["costOverrides"]> = { ...c.existingOverrides }
    if (hoursPerKg !== c.defaults.hoursPerKg) merged.hoursPerKg = hoursPerKg
    else delete merged.hoursPerKg
    if (hourlyRate !== c.defaults.hourlyRate) merged.hourlyRate = hourlyRate
    else delete merged.hourlyRate
    onCostOverride(c.moduleId, Object.keys(merged).length > 0 ? merged : undefined)
  }, [onCostOverride, c.moduleId, c.defaults.hoursPerKg, c.defaults.hourlyRate, c.existingOverrides, hoursPerKg, hourlyRate])

  const handleReset = useCallback(() => {
    setHoursPerKg(c.defaults.hoursPerKg)
    setHourlyRate(c.defaults.hourlyRate)
    // Preserve material overrides when resetting processing
    const preserved: NonNullable<CadLabModule["costOverrides"]> = {}
    if (c.existingOverrides?.materialCostPerKg != null) preserved.materialCostPerKg = c.existingOverrides.materialCostPerKg
    if (c.existingOverrides?.massKg != null) preserved.massKg = c.existingOverrides.massKg
    onCostOverride?.(c.moduleId, Object.keys(preserved).length > 0 ? preserved : undefined)
  }, [onCostOverride, c.moduleId, c.defaults.hoursPerKg, c.defaults.hourlyRate, c.existingOverrides])

  const hasProcessOverride = c.hasOverrides && (c.hoursPerKg !== c.defaults.hoursPerKg || c.hourlyRate !== c.defaults.hourlyRate)

  const trigger = (
    <span className={cn(hasProcessOverride && "text-international-orange")}>
      {formatCurrency(c.processCost)}
    </span>
  )

  if (!onCostOverride) {
    return (
      <>
        {trigger}
        <div className="text-[9px] text-muted-foreground mt-0.5">
          {c.massKg.toFixed(1)}kg × {c.hoursPerKg}hr/kg × £{c.hourlyRate}/hr
        </div>
      </>
    )
  }

  return (
    <Popover onOpenChange={(open) => {
      if (open) {
        setHoursPerKg(c.hoursPerKg)
        setHourlyRate(c.hourlyRate)
      }
    }}>
      <PopoverTrigger asChild>
        <button type="button" className="text-right cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors">
          <span className="inline-flex items-center gap-1 justify-end">
            {trigger}
            {hasProcessOverride && (
              <Pencil className="h-2.5 w-2.5 text-international-orange" />
            )}
          </span>
          <div className="text-[9px] text-muted-foreground mt-0.5">
            {c.massKg.toFixed(1)}kg × {c.hoursPerKg}hr/kg × £{c.hourlyRate}/hr
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3">
        <p className="text-xs font-semibold text-foreground">Processing Assumptions</p>
        <p className="text-[10px] text-muted-foreground">mass × hours/kg × £/hr = total</p>

        <div className="space-y-2">
          <label className="block">
            <span className="text-[10px] text-muted-foreground">Hours per kg</span>
            <Input
              type="number"
              min={0}
              step={0.5}
              value={hoursPerKg}
              onChange={(e) => setHoursPerKg(parseFloat(e.target.value) || 0)}
              onBlur={handleApply}
              className="h-8 text-xs mt-0.5"
            />
          </label>
          <label className="block">
            <span className="text-[10px] text-muted-foreground">Hourly rate (£/hr)</span>
            <Input
              type="number"
              min={0}
              step={1}
              value={hourlyRate}
              onChange={(e) => setHourlyRate(parseFloat(e.target.value) || 0)}
              onBlur={handleApply}
              className="h-8 text-xs mt-0.5"
            />
          </label>
        </div>

        <div className="flex items-center justify-between pt-1 border-t">
          <p className="text-[10px] text-muted-foreground font-mono">
            = {formatCurrency(c.massKg * hoursPerKg * hourlyRate)}
          </p>
          <button
            type="button"
            onClick={handleReset}
            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <RotateCcw className="h-2.5 w-2.5" />
            Reset to default
          </button>
        </div>
      </PopoverContent>
    </Popover>
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
        {formatCurrency(item.value)} ({pct}%)
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
          {p.name}: {formatCurrency(p.value)}
        </p>
      ))}
      <p className="font-semibold text-foreground mt-1 border-t pt-1">
        Total: {formatCurrency(total)}
      </p>
    </div>
  )
}
