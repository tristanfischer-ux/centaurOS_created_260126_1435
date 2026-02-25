/**
 * @file cad-lab-raw-materials.tsx — Raw material cost breakdown and value-add analysis.
 *
 * @description Centerpiece visual for The Forge review page. Aggregates raw
 * material costs across all modules, shows value-add margin (gap between raw
 * material cost and total manufacturing cost), and renders rich charts:
 * - Donut chart of material cost distribution
 * - Horizontal stacked bar showing cost composition (material / processing / tooling)
 * - Detailed material breakdown table with per-material stats
 *
 * Uses the same cost constants and formulas as cad-lab-cost-estimate.tsx.
 * Includes CSV export for procurement handoff.
 *
 * @component
 *
 * @example
 * <CadLabRawMaterials
 *   modules={modules}
 *   diagnosticAnswers={diagnosticAnswers}
 * />
 */

"use client"

import { useMemo, useCallback } from "react"
import { Download, Gem, Factory, AlertTriangle } from "lucide-react"
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { CadLabModule } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"
import {
  MATERIAL_COST_PER_KG,
  PROCESS_HOURLY_RATE,
  HOURS_PER_KG,
  TOOLING_COST,
  parseBatchSize,
  getModuleMassKg,
} from "@/lib/cad-lab-cost-constants"
import { getChartColor } from "@/lib/chart-colors"
import { trackFeatureUse } from "@/hooks/useActivityTracker"

// ─── Types ──────────────────────────────────────────────────────────

interface RawMaterialRow {
  material: string
  totalKg: number
  costPerKg: number
  totalCost: number
  moduleCount: number
  modules: string[]
}

interface RawMaterialsSummary {
  rows: RawMaterialRow[]
  totalRawCost: number
  totalProcessingCost: number
  totalToolingCost: number
  totalManufacturingCost: number
  valueAddMargin: number
  valueAddAbsolute: number
  hasAnyEstimates: boolean
}

// ─── Component ──────────────────────────────────────────────────────

interface CadLabRawMaterialsProps {
  /** Decomposed modules with optional CAD results */
  modules: CadLabModule[]
  /** Diagnostic answers per module */
  diagnosticAnswers: DiagnosticAnswers
}

/**
 * CadLabRawMaterials — raw material cost breakdown and value-add analysis.
 *
 * @description Aggregates material costs across modules, computes value-add
 * margin, and renders hero metrics, donut chart, cost composition bar, and
 * a detailed materials table with CSV export.
 */
export function CadLabRawMaterials({
  modules,
  diagnosticAnswers,
}: CadLabRawMaterialsProps): React.ReactNode {
  // ── Data derivation ──
  const summary = useMemo((): RawMaterialsSummary => {
    const materialMap = new Map<
      string,
      { totalKg: number; costPerKg: number; modules: string[] }
    >()

    let totalProcessingCost = 0
    let totalToolingCost = 0
    let hasAnyEstimates = false

    for (const mod of modules) {
      const answers = diagnosticAnswers[mod.id] || {}
      const material = answers.material || "Other"
      const process = answers.mfg_process || "Other"
      const batchSizeStr = answers.batch_size || "1-10 (prototyping)"
      const batchSize = parseBatchSize(batchSizeStr)

      const { massKg, isEstimated } = getModuleMassKg(
        mod.result?.massProperties?.massKg,
        mod.result?.massGrams,
      )
      if (isEstimated) hasAnyEstimates = true

      // Accumulate material grouping
      const costPerKg = MATERIAL_COST_PER_KG[material] ?? 20
      const existing = materialMap.get(material)
      if (existing) {
        existing.totalKg += massKg
        existing.modules.push(mod.name)
      } else {
        materialMap.set(material, {
          totalKg: massKg,
          costPerKg,
          modules: [mod.name],
        })
      }

      // Processing cost
      const hourlyRate = PROCESS_HOURLY_RATE[process] ?? 50
      const hoursPerKg = HOURS_PER_KG[process] ?? 3
      totalProcessingCost += massKg * hoursPerKg * hourlyRate

      // Tooling cost (amortized over batch)
      const toolingTotal = TOOLING_COST[process] ?? 0
      totalToolingCost += batchSize > 0 ? toolingTotal / batchSize : toolingTotal
    }

    // Build sorted rows
    const rows: RawMaterialRow[] = Array.from(materialMap.entries())
      .map(([material, data]) => ({
        material,
        totalKg: data.totalKg,
        costPerKg: data.costPerKg,
        totalCost: data.totalKg * data.costPerKg,
        moduleCount: data.modules.length,
        modules: data.modules,
      }))
      .sort((a, b) => b.totalCost - a.totalCost)

    const totalRawCost = rows.reduce((sum, r) => sum + r.totalCost, 0)
    const totalManufacturingCost =
      totalRawCost + totalProcessingCost + totalToolingCost

    const valueAddMargin =
      totalManufacturingCost > 0
        ? ((totalManufacturingCost - totalRawCost) / totalManufacturingCost) *
          100
        : 0
    const valueAddAbsolute = totalManufacturingCost - totalRawCost

    return {
      rows,
      totalRawCost,
      totalProcessingCost,
      totalToolingCost,
      totalManufacturingCost,
      valueAddMargin,
      valueAddAbsolute,
      hasAnyEstimates,
    }
  }, [modules, diagnosticAnswers])

  // ── CSV download ──
  const handleDownloadCsv = useCallback(() => {
    const header =
      "material,modules_using,total_kg,cost_per_kg,total_cost,pct_of_raw"
    const csvRows = summary.rows.map((r) => {
      const pct =
        summary.totalRawCost > 0
          ? ((r.totalCost / summary.totalRawCost) * 100).toFixed(1)
          : "0"
      const escape = (s: string) => {
        const escaped = s.replace(/"/g, '""')
        return escaped.includes(",") || escaped.includes('"') || escaped.includes("\n") || escaped.includes("\r")
          ? `"${escaped}"`
          : escaped
      }
      return [
        escape(r.material),
        escape(r.modules.join("; ")),
        r.totalKg.toFixed(3),
        r.costPerKg.toFixed(2),
        r.totalCost.toFixed(2),
        pct,
      ].join(",")
    })

    const csv = "\uFEFF" + [header, ...csvRows].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "raw-materials-breakdown.csv"
    a.click()
    URL.revokeObjectURL(url)

    trackFeatureUse("cad_lab_raw_materials_csv_downloaded", {
      materialCount: summary.rows.length,
      totalRawCost: summary.totalRawCost,
      totalManufacturingCost: summary.totalManufacturingCost,
      valueAddMargin: summary.valueAddMargin,
    })
  }, [summary])

  // ── Helpers ──
  const fmt = (n: number) => `£${n.toFixed(2)}`
  const pct = (n: number, total: number) =>
    total > 0 ? ((n / total) * 100).toFixed(1) : "0"

  // ── Empty state ──
  const hasDiagnostics = Object.keys(diagnosticAnswers).length > 0
  if (!hasDiagnostics || modules.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Gem className="h-4 w-4" />
            Raw Materials Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Complete engineering diagnostics to analyze raw materials. Material
            and batch size specifications are needed for cost breakdown.
          </p>
        </CardContent>
      </Card>
    )
  }

  // ── Chart data ──
  const donutData = summary.rows
    .filter((r) => r.totalCost > 0)
    .map((r, i) => ({
      name: r.material,
      value: r.totalCost,
      modules: r.modules,
      color: getChartColor(i, true),
    }))

  const costCompositionData = [
    {
      name: "Cost Breakdown",
      material: summary.totalRawCost,
      processing: summary.totalProcessingCost,
      tooling: summary.totalToolingCost,
    },
  ]

  const materialPct = pct(summary.totalRawCost, summary.totalManufacturingCost)
  const processingPct = pct(
    summary.totalProcessingCost,
    summary.totalManufacturingCost,
  )
  const toolingPct = pct(
    summary.totalToolingCost,
    summary.totalManufacturingCost,
  )

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Gem className="h-4 w-4" />
            Raw Materials Breakdown
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7"
            onClick={handleDownloadCsv}
          >
            <Download className="h-3 w-3 mr-1" />
            CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ── Estimated mass warning ── */}
        {summary.hasAnyEstimates && (
          <div className="flex items-start gap-2 p-3 bg-status-warning-light rounded text-xs text-status-warning-dark">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            <span>Some modules use estimated mass (0.2 kg fallback). Generate CAD models for more accurate material costs.</span>
          </div>
        )}

        {/* ── Section 1: Hero Metrics ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-muted/30 p-4 rounded-lg">
            <div className="flex items-center gap-1.5 mb-1">
              <Gem className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Raw Materials
              </span>
            </div>
            <p className="text-2xl font-bold font-mono text-foreground">
              {fmt(summary.totalRawCost)}
            </p>
          </div>

          <div className="bg-muted/30 p-4 rounded-lg">
            <div className="flex items-center gap-1.5 mb-1">
              <Factory className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Manufacturing Total
              </span>
            </div>
            <p className="text-2xl font-bold font-mono text-foreground">
              {fmt(summary.totalManufacturingCost)}
            </p>
          </div>

          <div className="bg-muted/30 p-4 rounded-lg">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Value Add by Manufacturer
              </span>
            </div>
            <p
              className={cn(
                "text-2xl font-bold font-mono",
                summary.totalManufacturingCost === 0
                  ? "text-muted-foreground"
                  : summary.valueAddMargin > 60
                    ? "text-status-success"
                    : summary.valueAddMargin >= 30
                      ? "text-status-warning"
                      : "text-destructive",
              )}
            >
              {summary.totalManufacturingCost === 0 ? "N/A" : `${summary.valueAddMargin.toFixed(1)}%`}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Gap between raw materials and finished product
            </p>
          </div>
        </div>

        {/* ── Section 2: Material Cost Donut Chart ── */}
        {donutData.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Material Cost Distribution
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <ResponsiveContainer width="100%" height={200} className="sm:max-w-[240px]">
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {donutData.map((entry) => (
                      <Cell key={`cell-${entry.name}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0].payload as (typeof donutData)[number]
                      return (
                        <div className="bg-background p-2 border rounded-lg shadow-lg text-xs">
                          <p className="font-semibold text-foreground">
                            {d.name}
                          </p>
                          <p className="text-muted-foreground">
                            {fmt(d.value)} (
                            {pct(d.value, summary.totalRawCost)}%)
                          </p>
                          <p className="text-muted-foreground mt-0.5">
                            Used in: {d.modules.join(", ")}
                          </p>
                        </div>
                      )
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Legend beside the chart */}
              <div className="flex flex-col gap-1.5 text-xs">
                {donutData.map((d) => (
                  <div key={d.name} className="flex items-center gap-2">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: d.color }}
                      aria-hidden="true"
                    />
                    <span className="text-foreground font-medium">{d.name}</span>
                    <span className="text-muted-foreground font-mono">
                      {fmt(d.value)} ({pct(d.value, summary.totalRawCost)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Section 3: Value-Add Cost Composition Bar ── */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Cost Composition
          </p>
          <ResponsiveContainer width="100%" height={60}>
            <BarChart
              data={costCompositionData}
              layout="vertical"
              margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
            >
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" hide />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  return (
                    <div className="bg-background p-2 border rounded-lg shadow-lg text-xs space-y-0.5">
                      {payload.map((entry) => (
                        <p key={entry.name} className="text-foreground">
                          <span
                            className="inline-block w-2 h-2 rounded-full mr-1.5"
                            style={{ backgroundColor: entry.color as string }}
                          />
                          {entry.name}: {fmt(entry.value as number)} (
                          {pct(
                            entry.value as number,
                            summary.totalManufacturingCost,
                          )}
                          %)
                        </p>
                      ))}
                    </div>
                  )
                }}
              />
              <Bar
                dataKey="material"
                stackId="cost"
                fill={getChartColor(2)}
                name="Material"
                radius={[4, 0, 0, 4]}
                barSize={28}
              />
              <Bar
                dataKey="processing"
                stackId="cost"
                fill={getChartColor(1)}
                name="Processing"
                barSize={28}
              />
              <Bar
                dataKey="tooling"
                stackId="cost"
                fill={getChartColor(3)}
                name="Tooling"
                radius={[0, 4, 4, 0]}
                barSize={28}
              />
              {/* Legend handled by inline stats below */}
            </BarChart>
          </ResponsiveContainer>

          {/* Inline stats below the bar */}
          <div className="flex items-center gap-4 mt-2 text-xs">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: getChartColor(2) }}
              />
              <span className="text-muted-foreground">
                Raw: {fmt(summary.totalRawCost)} ({materialPct}%)
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: getChartColor(1) }}
              />
              <span className="text-muted-foreground">
                Processing: {fmt(summary.totalProcessingCost)} ({processingPct}
                %)
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: getChartColor(3) }}
              />
              <span className="text-muted-foreground">
                Tooling: {fmt(summary.totalToolingCost)} ({toolingPct}%)
              </span>
            </span>
          </div>
        </div>

        {/* ── Section 4: Raw Materials Table ── */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Material Detail
          </p>
          <div className="border rounded-md overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th scope="col" className="text-left p-2 font-semibold text-muted-foreground">
                    Material
                  </th>
                  <th scope="col" className="text-right p-2 font-semibold text-muted-foreground">
                    Modules
                  </th>
                  <th scope="col" className="text-right p-2 font-semibold text-muted-foreground">
                    Total kg
                  </th>
                  <th scope="col" className="text-right p-2 font-semibold text-muted-foreground">
                    Cost/kg
                  </th>
                  <th scope="col" className="text-right p-2 font-semibold text-muted-foreground">
                    Total Cost
                  </th>
                  <th scope="col" className="text-left p-2 pl-3 font-semibold text-muted-foreground">
                    % of Raw
                  </th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((r, i) => {
                  const rawPct =
                    summary.totalRawCost > 0
                      ? (r.totalCost / summary.totalRawCost) * 100
                      : 0
                  return (
                    <tr
                      key={r.material}
                      className="border-b last:border-b-0"
                    >
                      <td className="p-2 text-sm font-semibold text-foreground">
                        {r.material}
                      </td>
                      <td className="p-2 text-right text-foreground">
                        <span title={r.modules.join(", ")}>
                          {r.moduleCount}
                        </span>
                      </td>
                      <td className="p-2 text-right font-mono text-foreground">
                        {r.totalKg.toFixed(3)}
                      </td>
                      <td className="p-2 text-right font-mono text-foreground">
                        £{r.costPerKg.toFixed(2)}
                      </td>
                      <td className="p-2 text-right font-mono font-semibold text-foreground">
                        {fmt(r.totalCost)}
                      </td>
                      <td className="p-2 pl-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[80px]">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${rawPct}%`,
                                backgroundColor: getChartColor(i, true),
                              }}
                            />
                          </div>
                          <span className="text-muted-foreground font-mono w-10 text-right">
                            {rawPct.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2">
                  <td className="p-2 font-semibold text-foreground">Total</td>
                  <td className="p-2 text-right font-semibold text-foreground">
                    {modules.length}
                  </td>
                  <td className="p-2 text-right font-mono font-semibold text-foreground">
                    {summary.rows
                      .reduce((s, r) => s + r.totalKg, 0)
                      .toFixed(3)}
                  </td>
                  <td className="p-2 text-right text-muted-foreground">
                    &mdash;
                  </td>
                  <td className="p-2 text-right font-mono font-bold text-foreground text-sm">
                    {fmt(summary.totalRawCost)}
                  </td>
                  <td className="p-2 pl-3 font-mono text-muted-foreground">
                    100%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ── Footnote ── */}
        <p className="text-[10px] text-muted-foreground">
          Raw material costs are approximate and based on material class
          averages. Actual supplier pricing will vary by grade, quantity, and
          market conditions.
        </p>
      </CardContent>
    </Card>
  )
}
