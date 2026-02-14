/**
 * @file cad-lab-risk-register.tsx — Aggregated risk register for The Forge.
 *
 * @description Pulls all risks from all modules into a unified view:
 * failure modes (from decomposition), unknowns (open questions), and
 * DFM-derived risks (from generated CAD results). Grouped by module
 * with color-coded severity.
 *
 * @component
 *
 * @example
 * <CadLabRiskRegister modules={modules} />
 */

"use client"

import { useMemo, useState } from "react"
import {
  AlertTriangle,
  HelpCircle,
  ShieldAlert,
  Box,
  Filter,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { CadLabModule } from "@/lib/cad-lab-types"

// ─── Chart colors ───────────────────────────────────────────────────

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-6))",
]

/**
 * Deterministic color from module id.
 *
 * @param id - Module identifier
 * @returns HSL color string
 */
function chipColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return CHART_COLORS[h % CHART_COLORS.length]
}

// ─── Types ──────────────────────────────────────────────────────────

type RiskType = "failure-mode" | "unknown" | "dfm-issue"

interface RiskEntry {
  /** Module this risk belongs to */
  moduleId: string
  /** Human-readable module name */
  moduleName: string
  /** Risk category */
  type: RiskType
  /** Risk description text */
  text: string
  /** DFM severity (only for dfm-issue type) */
  severity?: string
  /** Module accent color for visual grouping */
  accentColor: string
}

interface CadLabRiskRegisterProps {
  /** Array of decomposed modules */
  modules: CadLabModule[]
}

// ─── Component ──────────────────────────────────────────────────────

/**
 * CadLabRiskRegister — aggregated risk view across all modules.
 *
 * @description Collects failure modes, unknowns, and DFM-derived issues
 * into a single register grouped by module. DFM issues are automatically
 * extracted from modules that have generated CAD results.
 */
export function CadLabRiskRegister({
  modules,
}: CadLabRiskRegisterProps): React.ReactNode {
  const [filterType, setFilterType] = useState<RiskType | "all">("all")

  // Aggregate all risks from all modules
  const entries = useMemo((): RiskEntry[] => {
    const result: RiskEntry[] = []
    for (const mod of modules) {
      const color = chipColor(mod.id)

      // Failure modes (from decomposition)
      for (const fm of mod.failureModes) {
        result.push({
          moduleId: mod.id,
          moduleName: mod.name,
          type: "failure-mode",
          text: fm,
          accentColor: color,
        })
      }

      // Unknowns (from decomposition)
      for (const u of mod.unknowns) {
        result.push({
          moduleId: mod.id,
          moduleName: mod.name,
          type: "unknown",
          text: u,
          accentColor: color,
        })
      }

      // DFM issues (from generated CAD results)
      if (mod.result?.dfm?.issues) {
        for (const issue of mod.result.dfm.issues) {
          result.push({
            moduleId: mod.id,
            moduleName: mod.name,
            type: "dfm-issue",
            text: `[${issue.category}] ${issue.message}`,
            severity: issue.severity,
            accentColor: color,
          })
        }
      }
    }
    return result
  }, [modules])

  // Counts by type
  const failureModeCount = entries.filter(
    (e) => e.type === "failure-mode"
  ).length
  const unknownCount = entries.filter((e) => e.type === "unknown").length
  const dfmCount = entries.filter((e) => e.type === "dfm-issue").length
  const criticalDfmCount = entries.filter(
    (e) =>
      e.type === "dfm-issue" &&
      (e.severity === "critical" || e.severity === "error")
  ).length

  // Apply filter
  const filtered =
    filterType === "all"
      ? entries
      : entries.filter((e) => e.type === filterType)

  // Group by module
  const grouped = useMemo(() => {
    const map = new Map<string, RiskEntry[]>()
    for (const e of filtered) {
      const existing = map.get(e.moduleId) || []
      existing.push(e)
      map.set(e.moduleId, existing)
    }
    return map
  }, [filtered])

  if (entries.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" />
          Risk Register
          <span className="text-xs font-normal text-muted-foreground">
            {entries.length} items across {modules.length} modules
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Summary badges */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setFilterType("all")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
              filterType === "all"
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            <Filter className="h-3 w-3" />
            All ({entries.length})
          </button>
          <button
            onClick={() => setFilterType("failure-mode")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
              filterType === "failure-mode"
                ? "bg-status-warning text-white"
                : "bg-status-warning-light text-status-warning hover:bg-status-warning/20"
            )}
          >
            <AlertTriangle className="h-3 w-3" />
            Failure Modes ({failureModeCount})
          </button>
          <button
            onClick={() => setFilterType("unknown")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
              filterType === "unknown"
                ? "bg-status-info text-white"
                : "bg-status-info-light text-status-info hover:bg-status-info/20"
            )}
          >
            <HelpCircle className="h-3 w-3" />
            Unknowns ({unknownCount})
          </button>
          {dfmCount > 0 && (
            <button
              onClick={() => setFilterType("dfm-issue")}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                filterType === "dfm-issue"
                  ? "bg-destructive text-white"
                  : "bg-status-error-light text-status-error hover:bg-status-error/20"
              )}
            >
              <ShieldAlert className="h-3 w-3" />
              DFM Issues ({dfmCount})
              {criticalDfmCount > 0 && (
                <span className="bg-destructive text-white text-[9px] rounded-full px-1.5 py-0.5 -mr-1">
                  {criticalDfmCount} critical
                </span>
              )}
            </button>
          )}
        </div>

        {/* Risk list grouped by module */}
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([moduleId, risks]) => {
            const first = risks[0]
            return (
              <div key={moduleId} className="space-y-2">
                {/* Module header */}
                <div className="flex items-center gap-2">
                  <div
                    className="h-5 w-5 rounded flex items-center justify-center shrink-0"
                    style={{ backgroundColor: first.accentColor + "18" }}
                  >
                    <Box
                      className="h-3 w-3"
                      style={{ color: first.accentColor }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-foreground">
                    {first.moduleName}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    ({risks.length} item{risks.length !== 1 ? "s" : ""})
                  </span>
                </div>

                {/* Risk items */}
                <div className="ml-7 space-y-1.5">
                  {risks.map((r, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span
                        className={cn(
                          "inline-block w-1.5 h-1.5 rounded-full mt-1.5 shrink-0",
                          r.type === "failure-mode" && "bg-status-warning",
                          r.type === "unknown" && "bg-status-info",
                          r.type === "dfm-issue" &&
                            (r.severity === "critical" ||
                            r.severity === "error"
                              ? "bg-destructive"
                              : "bg-status-warning")
                        )}
                      />
                      <span className="text-muted-foreground flex-1">
                        {r.text}
                      </span>
                      <span
                        className={cn(
                          "text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ml-2",
                          r.type === "failure-mode" &&
                            "bg-status-warning-light text-status-warning",
                          r.type === "unknown" &&
                            "bg-status-info-light text-status-info",
                          r.type === "dfm-issue" &&
                            r.severity === "critical" &&
                            "bg-status-error-light text-status-error",
                          r.type === "dfm-issue" &&
                            r.severity === "error" &&
                            "bg-status-error-light text-status-error",
                          r.type === "dfm-issue" &&
                            r.severity === "warning" &&
                            "bg-status-warning-light text-status-warning",
                          r.type === "dfm-issue" &&
                            r.severity !== "critical" &&
                            r.severity !== "error" &&
                            r.severity !== "warning" &&
                            "bg-muted text-muted-foreground"
                        )}
                      >
                        {r.type === "failure-mode"
                          ? "Risk"
                          : r.type === "unknown"
                            ? "Unknown"
                            : r.severity || "DFM"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Empty state for filtered view */}
        {filtered.length === 0 && entries.length > 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No {filterType === "failure-mode" ? "failure modes" : filterType === "unknown" ? "unknowns" : "DFM issues"} found.
          </p>
        )}

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground border-t pt-3">
          <span className="font-medium">Type:</span>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-status-warning" />
            Failure mode — known risk from design/engineering analysis
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-status-info" />
            Unknown — open question that needs resolution
          </div>
          {dfmCount > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-destructive" />
              DFM issue — manufacturing risk from CAD analysis
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
