/**
 * @file timeline-view.tsx — Gantt-style timeline
 *
 * @description Horizontal bar chart showing module lead times.
 * Critical path (longest lead time) highlighted in orange.
 * Pure CSS — no charting library needed.
 */

"use client"

import React, { useMemo } from "react"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Clock, Box } from "lucide-react"
import { cn } from "@/lib/utils"

import type { XRaySpec } from "../../product-xray/services/xray-schema"

// ─── Helpers ─────────────────────────────────────────────────────────

const CHART_COLORS = [
  "hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
  "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(var(--chart-6))",
]

function chipColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return CHART_COLORS[h % CHART_COLORS.length]
}

// ─── Props ───────────────────────────────────────────────────────────

interface TimelineViewProps {
  spec: XRaySpec
}

// ─── Component ───────────────────────────────────────────────────────

/**
 * TimelineView — Gantt-style lead time visualization.
 *
 * @description Shows each module as a horizontal bar proportional
 * to its lead time in weeks. The critical path (longest bar) is
 * highlighted with International Orange.
 */
export function TimelineView({ spec }: TimelineViewProps): React.ReactNode {
  const modules = spec.modules || []

  const { maxWeeks, totalWeeks, criticalModuleId } = useMemo(() => {
    let max = 0
    let critId = ""
    let total = 0
    for (const m of modules) {
      total += m.requirements.leadWeeks
      if (m.requirements.leadWeeks > max) {
        max = m.requirements.leadWeeks
        critId = m.id
      }
    }
    return { maxWeeks: max, totalWeeks: total, criticalModuleId: critId }
  }, [modules])

  if (modules.length === 0) return null

  return (
    <Card className="rounded-xl shadow-sm">
      <CardContent className="pt-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1 h-7 bg-chart-4 rounded-full" />
            <div>
              <h3 className="text-lg font-display font-semibold tracking-tight text-foreground">
                Timeline
              </h3>
              <p className="text-xs text-muted-foreground">
                Module lead times — critical path highlighted
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="text-xs">
              <Clock className="h-3 w-3 mr-1" />
              Critical path: {maxWeeks}w
            </Badge>
          </div>
        </div>

        {/* Gantt bars */}
        <div className="space-y-3">
          {modules.map((m) => {
            const isCritical = m.id === criticalModuleId
            const widthPct = maxWeeks > 0 ? (m.requirements.leadWeeks / maxWeeks) * 100 : 0
            const color = chipColor(m.id)

            return (
              <div key={m.id} className="flex items-center gap-3">
                {/* Module label */}
                <div className="w-40 shrink-0 flex items-center gap-2">
                  <div
                    className="h-6 w-6 rounded-md flex items-center justify-center shrink-0"
                    style={{ backgroundColor: color + "18" }}
                  >
                    <Box className="h-3 w-3" style={{ color }} />
                  </div>
                  <span className="text-xs font-medium text-foreground truncate">{m.name}</span>
                </div>

                {/* Bar */}
                <div className="flex-1 h-7 bg-muted/30 rounded-lg overflow-hidden relative">
                  <div
                    className={cn(
                      "h-full rounded-lg transition-all duration-500 flex items-center px-3",
                      isCritical ? "bg-international-orange/80" : "bg-muted/60",
                    )}
                    style={{
                      width: `${Math.max(widthPct, 8)}%`,
                      backgroundColor: isCritical ? undefined : color + "30",
                    }}
                  >
                    <span className={cn(
                      "text-[10px] font-semibold tabular-nums whitespace-nowrap",
                      isCritical ? "text-white" : "text-foreground",
                    )}>
                      {m.requirements.leadWeeks}w
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground pt-2">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-2 rounded-sm bg-international-orange/80" />
            Critical path (longest lead time)
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-2 rounded-sm bg-muted/60" />
            Other modules
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
