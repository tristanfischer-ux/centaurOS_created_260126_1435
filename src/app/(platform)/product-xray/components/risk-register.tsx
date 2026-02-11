/**
 * @file risk-register.tsx — Aggregated risk table
 *
 * @description Pulls all risks from all modules into a single unified
 * view: commonFailureModes, unknownsToResolve, and derivedRisks.
 * Grouped by module with color-coded severity dots.
 */

"use client"

import React, { useMemo } from "react"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, HelpCircle, ShieldAlert, Box } from "lucide-react"
import { cn } from "@/lib/utils"

import type { XRaySpec } from "../services/xray-schema"

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

type RiskType = "failure-mode" | "unknown" | "derived-risk"

interface RiskEntry {
  moduleId: string
  moduleName: string
  type: RiskType
  text: string
  accentColor: string
}

// ─── Props ───────────────────────────────────────────────────────────

interface RiskRegisterProps {
  spec: XRaySpec
}

// ─── Component ───────────────────────────────────────────────────────

/**
 * RiskRegister — Aggregated risk view across all modules.
 *
 * @description Collects all failure modes, unknowns, and derived risks
 * into a single table grouped by module.
 */
export function RiskRegister({ spec }: RiskRegisterProps): React.ReactNode {
  const entries = useMemo((): RiskEntry[] => {
    const result: RiskEntry[] = []
    for (const m of spec.modules) {
      const color = chipColor(m.id)
      for (const fm of m.detail.commonFailureModes) {
        result.push({ moduleId: m.id, moduleName: m.name, type: "failure-mode", text: fm, accentColor: color })
      }
      for (const u of m.detail.unknownsToResolve) {
        result.push({ moduleId: m.id, moduleName: m.name, type: "unknown", text: u, accentColor: color })
      }
      for (const dr of (m.diagnostic?.derivedRisks || [])) {
        result.push({ moduleId: m.id, moduleName: m.name, type: "derived-risk", text: dr, accentColor: color })
      }
    }
    return result
  }, [spec.modules])

  const failureModes = entries.filter(e => e.type === "failure-mode").length
  const unknowns = entries.filter(e => e.type === "unknown").length
  const derived = entries.filter(e => e.type === "derived-risk").length

  if (entries.length === 0) return null

  // Group by module
  const grouped = useMemo(() => {
    const map = new Map<string, RiskEntry[]>()
    for (const e of entries) {
      const existing = map.get(e.moduleId) || []
      existing.push(e)
      map.set(e.moduleId, existing)
    }
    return map
  }, [entries])

  return (
    <Card className="rounded-xl shadow-sm">
      <CardContent className="pt-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1 h-7 bg-status-warning rounded-full" />
            <div>
              <h3 className="text-lg font-display font-semibold tracking-tight text-foreground">
                Risk Register
              </h3>
              <p className="text-xs text-muted-foreground">
                All risks aggregated across modules
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="warning" className="text-xs">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {failureModes} failure modes
            </Badge>
            <Badge variant="info" className="text-xs">
              <HelpCircle className="h-3 w-3 mr-1" />
              {unknowns} unknowns
            </Badge>
            {derived > 0 && (
              <Badge variant="destructive" className="text-xs">
                <ShieldAlert className="h-3 w-3 mr-1" />
                {derived} derived
              </Badge>
            )}
          </div>
        </div>

        {/* Risk list by module */}
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([moduleId, risks]) => {
            const first = risks[0]
            return (
              <div key={moduleId} className="space-y-2">
                {/* Module header */}
                <div className="flex items-center gap-2">
                  <div
                    className="h-6 w-6 rounded-md flex items-center justify-center shrink-0"
                    style={{ backgroundColor: first.accentColor + "18" }}
                  >
                    <Box className="h-3 w-3" style={{ color: first.accentColor }} />
                  </div>
                  <span className="text-sm font-semibold text-foreground">{first.moduleName}</span>
                  <span className="text-[10px] text-muted-foreground">({risks.length} items)</span>
                </div>

                {/* Risk items */}
                <div className="ml-8 space-y-1">
                  {risks.map((r, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span className={cn(
                        "inline-block w-1.5 h-1.5 rounded-full mt-1.5 shrink-0",
                        r.type === "failure-mode" && "bg-status-warning",
                        r.type === "unknown" && "bg-chart-2",
                        r.type === "derived-risk" && "bg-destructive",
                      )} />
                      <span className="text-muted-foreground">{r.text}</span>
                      <span className={cn(
                        "text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ml-auto",
                        r.type === "failure-mode" && "bg-status-warning-light text-status-warning-dark",
                        r.type === "unknown" && "bg-chart-2/10 text-chart-2",
                        r.type === "derived-risk" && "bg-destructive/10 text-destructive",
                      )}>
                        {r.type === "failure-mode" ? "Risk" : r.type === "unknown" ? "Unknown" : "AI-derived"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground border-t pt-3">
          <span className="font-medium">Type:</span>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-status-warning" />
            Failure mode
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-chart-2" />
            Unknown / open question
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-destructive" />
            AI-derived risk
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
