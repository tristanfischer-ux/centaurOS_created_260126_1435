"use client"

import { useMemo } from "react"
import { Box, Clock, AlertTriangle, Info, Puzzle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import type { CadLabModule } from "@/lib/cad-lab-types"
import { extractProductSummary } from "../cad-lab-utils"

// ─── Product Overview ────────────────────────────────────────────────

/**
 * ProductOverview — Prominent product hero card before the module breakdown.
 *
 * @description Large visual card showing the product name, summary excerpt
 * from the research report, and aggregate engineering stats. Gives the user
 * a clear "this is the thing we're building" moment before they drill into
 * individual sub-assemblies. Includes a mini module map showing how the
 * modules are distributed by manufacturing process.
 */
export function ProductOverview({
  subject,
  report,
  modules,
  moduleCount,
  totalComponents,
  criticalPathWeeks,
  totalRisks,
  totalUnknowns,
  systemIllustrationUrl,
}: {
  subject: string
  report: string
  modules: CadLabModule[]
  moduleCount: number
  totalComponents: number
  criticalPathWeeks: number
  totalRisks: number
  totalUnknowns: number
  systemIllustrationUrl?: string | null
}): React.ReactNode {
  const summary = extractProductSummary(report)

  // Sort modules by lead time (longest first — those need attention earliest)
  const sortedModules = useMemo(
    () => [...modules].sort((a, b) => b.leadWeeks - a.leadWeeks),
    [modules]
  )

  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-br from-international-orange-light/10 via-background to-status-info-light/5 p-6 sm:p-8">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-1 rounded-full bg-international-orange flex-shrink-0" />
              <h2 className="text-xl font-bold text-foreground truncate">{subject}</h2>
            </div>
            {summary && (
              <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">
                {summary}
              </p>
            )}
          </div>
          {/* System illustration thumbnail */}
          {systemIllustrationUrl && (
            <div className="w-32 h-20 rounded-lg overflow-hidden bg-muted flex-shrink-0 hidden sm:block border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={systemIllustrationUrl} alt="System overview" className="w-full h-full object-cover" />
            </div>
          )}
        </div>

        {/* Aggregate stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="bg-background rounded-lg border p-3 space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Puzzle className="h-3 w-3" /> Sub-Assemblies
            </p>
            <p className="text-lg font-bold text-foreground font-mono">{moduleCount}</p>
          </div>
          <div className="bg-background rounded-lg border p-3 space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Box className="h-3 w-3" /> Components
            </p>
            <p className="text-lg font-bold text-foreground font-mono">{totalComponents}</p>
          </div>
          <div className="bg-background rounded-lg border p-3 space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> Critical Path
            </p>
            <p className="text-lg font-bold text-foreground font-mono">{criticalPathWeeks}w</p>
          </div>
          <div className="bg-background rounded-lg border p-3 space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Failure Modes
            </p>
            <p className="text-lg font-bold text-foreground font-mono">{totalRisks}</p>
          </div>
          <div className="bg-background rounded-lg border p-3 space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Info className="h-3 w-3" /> Open Questions
            </p>
            <p className="text-lg font-bold text-foreground font-mono">{totalUnknowns}</p>
          </div>
        </div>

        {/* Lead time per sub-assembly */}
        {sortedModules.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Sub-Assemblies by Lead Time</p>
            <div className="space-y-1.5">
              {sortedModules.map((mod) => {
                const barColor =
                  mod.leadWeeks <= 2
                    ? "bg-status-success"
                    : mod.leadWeeks <= 4
                      ? "bg-status-info"
                      : "bg-international-orange"
                return (
                  <div key={mod.id} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground truncate w-40 flex-shrink-0">
                      {mod.name}
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all duration-500", barColor)}
                        style={{ width: `${(mod.leadWeeks / criticalPathWeeks) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-muted-foreground w-8 text-right flex-shrink-0">
                      {mod.leadWeeks}w
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <div className="h-2 w-6 rounded-full bg-status-success" />
                Quick Turn (1-2 wk)
              </span>
              <span className="flex items-center gap-1.5">
                <div className="h-2 w-6 rounded-full bg-status-info" />
                Standard (3-4 wk)
              </span>
              <span className="flex items-center gap-1.5">
                <div className="h-2 w-6 rounded-full bg-international-orange" />
                Long Lead (5+ wk)
              </span>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
