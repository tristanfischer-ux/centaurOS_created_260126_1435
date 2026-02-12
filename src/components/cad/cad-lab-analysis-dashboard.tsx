/**
 * @file cad-lab-analysis-dashboard.tsx — Engineering analysis dashboard for CAD Lab.
 *
 * @description Aggregates per-module CAD generation results into a system-level
 * engineering summary. Displays total mass, volume, dimensions, DFM readiness,
 * and per-module metrics in a grid format.
 *
 * @component
 *
 * @example
 * <CadLabAnalysisDashboard modules={modules} projectName={subject} />
 */

import {
  Box,
  Scale,
  Ruler,
  Printer,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  BarChart3,
  Info,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import { useState } from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { CadLabModule } from "@/lib/cad-lab-types"

// ─── Types ──────────────────────────────────────────────────────────

interface CadLabAnalysisDashboardProps {
  /** Array of modules (some may have generated results) */
  modules: CadLabModule[]
  /** Project subject for the dashboard title */
  projectName?: string
}

interface SystemMetrics {
  /** Total estimated mass across all generated modules (grams) */
  totalMassG: number
  /** Total volume across all generated modules (mm³) */
  totalVolumeMm3: number
  /** System-level bounding box estimate (max of each axis) */
  systemBbox: { xLen: number; yLen: number; zLen: number }
  /** Number of modules with CAD generated */
  generatedCount: number
  /** Total module count */
  totalCount: number
  /** Number of modules that are printable */
  printableCount: number
  /** Number of modules with DFM issues */
  modulesWithIssues: number
  /** Total DFM issues across all modules */
  totalDfmIssues: number
  /** Critical DFM issue count */
  criticalIssues: number
  /** Maximum lead time in weeks across all modules */
  maxLeadWeeks: number
  /** Total estimated print time (minutes) across printable modules */
  totalPrintTimeMin: number
  /** Total estimated material (grams) across printable modules */
  totalMaterialG: number
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Computes system-level metrics by aggregating per-module results.
 *
 * @param modules - Array of CAD Lab modules
 * @returns Aggregated system metrics
 */
function computeSystemMetrics(modules: CadLabModule[]): SystemMetrics {
  let totalMassG = 0
  let totalVolumeMm3 = 0
  let maxX = 0
  let maxY = 0
  let maxZ = 0
  let generatedCount = 0
  let printableCount = 0
  let modulesWithIssues = 0
  let totalDfmIssues = 0
  let criticalIssues = 0
  let maxLeadWeeks = 0
  let totalPrintTimeMin = 0
  let totalMaterialG = 0

  for (const mod of modules) {
    maxLeadWeeks = Math.max(maxLeadWeeks, mod.leadWeeks)

    if (mod.status !== "generated" || !mod.result) continue
    generatedCount++

    // Mass
    if (mod.result.massGrams) {
      totalMassG += mod.result.massGrams
    } else if (mod.result.massProperties?.massKg) {
      totalMassG += mod.result.massProperties.massKg * 1000
    }

    // Volume
    if (mod.result.volumeMm3) {
      totalVolumeMm3 += mod.result.volumeMm3
    } else if (mod.result.massProperties?.volumeMm3) {
      totalVolumeMm3 += mod.result.massProperties.volumeMm3
    }

    // Bounding box (take max of each axis as rough system envelope)
    if (mod.result.bbox) {
      maxX = Math.max(maxX, mod.result.bbox.xLen)
      maxY = Math.max(maxY, mod.result.bbox.yLen)
      maxZ = Math.max(maxZ, mod.result.bbox.zLen)
    }

    // DFM
    if (mod.result.dfm) {
      if (mod.result.dfm.printable) printableCount++
      const issues = mod.result.dfm.issues || []
      if (issues.length > 0) modulesWithIssues++
      totalDfmIssues += issues.length
      criticalIssues += issues.filter(
        (i) => i.severity === "critical" || i.severity === "error"
      ).length

      if (mod.result.dfm.estimatedPrintTimeMin) {
        totalPrintTimeMin += mod.result.dfm.estimatedPrintTimeMin
      }
      if (mod.result.dfm.estimatedMaterialG) {
        totalMaterialG += mod.result.dfm.estimatedMaterialG
      }
    }
  }

  return {
    totalMassG,
    totalVolumeMm3,
    systemBbox: { xLen: maxX, yLen: maxY, zLen: maxZ },
    generatedCount,
    totalCount: modules.length,
    printableCount,
    modulesWithIssues,
    totalDfmIssues,
    criticalIssues,
    maxLeadWeeks,
    totalPrintTimeMin,
    totalMaterialG,
  }
}

/**
 * Formats grams into a human-readable string.
 *
 * @param g - Mass in grams
 * @returns Formatted mass string (e.g., "1.2 kg" or "450 g")
 */
function formatMass(g: number): string {
  if (g >= 1000) return `${(g / 1000).toFixed(2)} kg`
  return `${g.toFixed(1)} g`
}

/**
 * Formats volume in mm³ into a readable string.
 *
 * @param mm3 - Volume in mm³
 * @returns Formatted volume string (e.g., "1.2 cm³" or "4,500 mm³")
 */
function formatVolume(mm3: number): string {
  if (mm3 >= 1_000_000) return `${(mm3 / 1_000_000_000).toFixed(2)} L`
  if (mm3 >= 1000) return `${(mm3 / 1000).toFixed(1)} cm³`
  return `${mm3.toFixed(0)} mm³`
}

/**
 * Formats minutes into hours and minutes.
 *
 * @param min - Time in minutes
 * @returns Formatted time string (e.g., "2h 15m" or "45m")
 */
function formatTime(min: number): string {
  if (min >= 60) {
    const h = Math.floor(min / 60)
    const m = Math.round(min % 60)
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }
  return `${Math.round(min)}m`
}

/**
 * Returns a manufacturing readiness grade based on DFM results.
 *
 * @param metrics - Aggregated system metrics
 * @returns Grade object with label, color classes, and description
 */
function getManufacturingGrade(metrics: SystemMetrics): {
  label: string
  textColor: string
  bgColor: string
  description: string
} {
  if (metrics.generatedCount === 0) {
    return {
      label: "N/A",
      textColor: "text-muted-foreground",
      bgColor: "bg-muted",
      description: "No modules generated yet",
    }
  }

  if (metrics.criticalIssues > 0) {
    return {
      label: "Needs Work",
      textColor: "text-status-error",
      bgColor: "bg-status-error-light",
      description: `${metrics.criticalIssues} critical issue${metrics.criticalIssues !== 1 ? "s" : ""} found`,
    }
  }

  if (metrics.modulesWithIssues > 0) {
    return {
      label: "Fair",
      textColor: "text-status-warning",
      bgColor: "bg-status-warning-light",
      description: `${metrics.totalDfmIssues} warning${metrics.totalDfmIssues !== 1 ? "s" : ""} across ${metrics.modulesWithIssues} module${metrics.modulesWithIssues !== 1 ? "s" : ""}`,
    }
  }

  if (metrics.printableCount === metrics.generatedCount) {
    return {
      label: "Good",
      textColor: "text-status-success",
      bgColor: "bg-status-success-light",
      description: "All modules pass DFM checks",
    }
  }

  return {
    label: "Partial",
    textColor: "text-status-info",
    bgColor: "bg-status-info-light",
    description: `${metrics.printableCount}/${metrics.generatedCount} modules printable`,
  }
}

// ─── Component ──────────────────────────────────────────────────────

/**
 * CadLabAnalysisDashboard — system-level engineering analysis.
 *
 * @description Shows aggregated metrics from generated modules:
 * total mass, volume, envelope, manufacturing readiness, DFM issues,
 * and per-module breakdown in a table.
 */
export function CadLabAnalysisDashboard({
  modules,
  projectName,
}: CadLabAnalysisDashboardProps): React.ReactNode {
  const [showPerModule, setShowPerModule] = useState(false)
  const metrics = computeSystemMetrics(modules)
  const grade = getManufacturingGrade(metrics)

  // Only show modules that have results for the per-module table
  const generatedModules = modules.filter(
    (m) => m.status === "generated" && m.result
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Engineering Analysis
          {metrics.generatedCount > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              {metrics.generatedCount}/{metrics.totalCount} modules analysed
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status legend */}
        <div className="flex items-center gap-6 text-xs text-muted-foreground">
          <span className="font-medium">Status:</span>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-6 rounded-full bg-status-success" />
            <span>Generated</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-6 rounded-full bg-status-info" />
            <span>Interface Ready</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-6 rounded-full bg-muted-foreground" />
            <span>Pending</span>
          </div>
        </div>

        {/* System summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Total Mass */}
          <div className="space-y-1.5 p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Scale className="h-3.5 w-3.5" />
              System Mass
            </p>
            <p className="text-lg font-semibold text-foreground font-mono">
              {metrics.totalMassG > 0 ? formatMass(metrics.totalMassG) : "—"}
            </p>
          </div>

          {/* Total Volume */}
          <div className="space-y-1.5 p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Box className="h-3.5 w-3.5" />
              Total Volume
            </p>
            <p className="text-lg font-semibold text-foreground font-mono">
              {metrics.totalVolumeMm3 > 0
                ? formatVolume(metrics.totalVolumeMm3)
                : "—"}
            </p>
          </div>

          {/* Envelope */}
          <div className="space-y-1.5 p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Ruler className="h-3.5 w-3.5" />
              Max Envelope
            </p>
            <p className="text-lg font-semibold text-foreground font-mono">
              {metrics.systemBbox.xLen > 0
                ? `${metrics.systemBbox.xLen.toFixed(0)}×${metrics.systemBbox.yLen.toFixed(0)}×${metrics.systemBbox.zLen.toFixed(0)}`
                : "—"}
            </p>
            {metrics.systemBbox.xLen > 0 && (
              <p className="text-[10px] text-muted-foreground">mm (L×W×H)</p>
            )}
          </div>

          {/* Manufacturing Grade */}
          <div className="space-y-1.5 p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Printer className="h-3.5 w-3.5" />
              Mfg. Readiness
            </p>
            <p
              className={cn("text-lg font-semibold font-mono", grade.textColor)}
            >
              {grade.label}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {grade.description}
            </p>
          </div>
        </div>

        {/* Secondary metrics row */}
        {metrics.generatedCount > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <MetricPill
              icon={<Layers className="h-3 w-3" />}
              label="Modules"
              value={`${metrics.generatedCount}/${metrics.totalCount}`}
            />
            <MetricPill
              icon={<Clock className="h-3 w-3" />}
              label="Max Lead"
              value={`${metrics.maxLeadWeeks}w`}
            />
            <MetricPill
              icon={<Printer className="h-3 w-3" />}
              label="Printable"
              value={`${metrics.printableCount}/${metrics.generatedCount}`}
            />
            {metrics.totalPrintTimeMin > 0 && (
              <MetricPill
                icon={<Clock className="h-3 w-3" />}
                label="Print Time"
                value={formatTime(metrics.totalPrintTimeMin)}
              />
            )}
            {metrics.totalMaterialG > 0 && (
              <MetricPill
                icon={<Scale className="h-3 w-3" />}
                label="Material"
                value={formatMass(metrics.totalMaterialG)}
              />
            )}
          </div>
        )}

        {/* DFM Issue Summary */}
        {metrics.totalDfmIssues > 0 && (
          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-status-warning" />
              DFM Issues ({metrics.totalDfmIssues})
            </p>
            <div className="space-y-1">
              {generatedModules.map((mod) => {
                const issues = mod.result?.dfm?.issues || []
                if (issues.length === 0) return null
                return (
                  <div key={mod.id} className="text-xs">
                    <span className="font-medium text-foreground">
                      {mod.name}:
                    </span>{" "}
                    {issues.map((issue, i) => (
                      <span
                        key={i}
                        className={cn(
                          "inline-block px-1.5 py-0.5 rounded mr-1 mb-0.5",
                          issue.severity === "critical" ||
                            issue.severity === "error"
                            ? "bg-status-error-light text-status-error"
                            : issue.severity === "warning"
                              ? "bg-status-warning-light text-status-warning"
                              : "bg-muted text-muted-foreground"
                        )}
                      >
                        {issue.message}
                      </span>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Per-module breakdown toggle */}
        {generatedModules.length > 0 && (
          <div>
            <button
              onClick={() => setShowPerModule(!showPerModule)}
              className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-muted-foreground transition-colors"
            >
              {showPerModule ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              Per-Module Breakdown
            </button>

            {showPerModule && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 font-semibold text-muted-foreground pr-4">
                        Module
                      </th>
                      <th className="pb-2 font-semibold text-muted-foreground pr-4 text-right">
                        Mass
                      </th>
                      <th className="pb-2 font-semibold text-muted-foreground pr-4 text-right">
                        Volume
                      </th>
                      <th className="pb-2 font-semibold text-muted-foreground pr-4 text-right">
                        Dimensions (mm)
                      </th>
                      <th className="pb-2 font-semibold text-muted-foreground pr-4 text-center">
                        Printable
                      </th>
                      <th className="pb-2 font-semibold text-muted-foreground pr-4 text-right">
                        Print Time
                      </th>
                      <th className="pb-2 font-semibold text-muted-foreground text-right">
                        Lead
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {generatedModules.map((mod) => {
                      const r = mod.result
                      const mass = r?.massGrams ?? (r?.massProperties?.massKg ? r.massProperties.massKg * 1000 : null)
                      const volume = r?.volumeMm3 ?? r?.massProperties?.volumeMm3 ?? null
                      const dfm = r?.dfm

                      return (
                        <tr
                          key={mod.id}
                          className="border-b border-muted last:border-0"
                        >
                          <td className="py-2 pr-4">
                            <div className="flex items-center gap-2">
                              <div
                                className={cn(
                                  "h-1.5 w-1.5 rounded-full flex-shrink-0",
                                  dfm?.printable
                                    ? "bg-status-success"
                                    : dfm
                                      ? "bg-status-warning"
                                      : "bg-muted-foreground"
                                )}
                              />
                              <span className="font-medium text-foreground">
                                {mod.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-2 pr-4 text-right font-mono text-foreground">
                            {mass !== null ? formatMass(mass) : "—"}
                          </td>
                          <td className="py-2 pr-4 text-right font-mono text-foreground">
                            {volume !== null ? formatVolume(volume) : "—"}
                          </td>
                          <td className="py-2 pr-4 text-right font-mono text-foreground">
                            {r?.bbox
                              ? `${r.bbox.xLen.toFixed(0)}×${r.bbox.yLen.toFixed(0)}×${r.bbox.zLen.toFixed(0)}`
                              : "—"}
                          </td>
                          <td className="py-2 pr-4 text-center">
                            {dfm ? (
                              dfm.printable ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-status-success mx-auto" />
                              ) : (
                                <AlertTriangle className="h-3.5 w-3.5 text-status-warning mx-auto" />
                              )
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-2 pr-4 text-right font-mono text-foreground">
                            {dfm?.estimatedPrintTimeMin
                              ? formatTime(dfm.estimatedPrintTimeMin)
                              : "—"}
                          </td>
                          <td className="py-2 text-right font-mono text-foreground">
                            {mod.leadWeeks}w
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {/* Totals row */}
                  <tfoot>
                    <tr className="border-t-2 font-semibold">
                      <td className="pt-2 pr-4 text-foreground">Total</td>
                      <td className="pt-2 pr-4 text-right font-mono text-foreground">
                        {metrics.totalMassG > 0
                          ? formatMass(metrics.totalMassG)
                          : "—"}
                      </td>
                      <td className="pt-2 pr-4 text-right font-mono text-foreground">
                        {metrics.totalVolumeMm3 > 0
                          ? formatVolume(metrics.totalVolumeMm3)
                          : "—"}
                      </td>
                      <td className="pt-2 pr-4 text-right font-mono text-foreground">
                        {metrics.systemBbox.xLen > 0
                          ? `${metrics.systemBbox.xLen.toFixed(0)}×${metrics.systemBbox.yLen.toFixed(0)}×${metrics.systemBbox.zLen.toFixed(0)}`
                          : "—"}
                      </td>
                      <td className="pt-2 pr-4 text-center font-mono text-foreground">
                        {metrics.printableCount}/{metrics.generatedCount}
                      </td>
                      <td className="pt-2 pr-4 text-right font-mono text-foreground">
                        {metrics.totalPrintTimeMin > 0
                          ? formatTime(metrics.totalPrintTimeMin)
                          : "—"}
                      </td>
                      <td className="pt-2 text-right font-mono text-foreground">
                        {metrics.maxLeadWeeks}w
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {metrics.generatedCount === 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Info className="h-4 w-4" />
            Generate CAD for at least one module to see engineering analysis.
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────

/**
 * MetricPill — compact metric display for secondary stats.
 *
 * @param icon - Small icon element
 * @param label - Metric label
 * @param value - Metric value
 */
function MetricPill({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}): React.ReactNode {
  return (
    <div className="flex items-center gap-2 p-2 rounded bg-muted/30">
      <span className="text-muted-foreground">{icon}</span>
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
          {label}
        </p>
        <p className="text-xs font-semibold text-foreground font-mono">
          {value}
        </p>
      </div>
    </div>
  )
}
