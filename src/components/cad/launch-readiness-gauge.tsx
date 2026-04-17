"use client"

/**
 * @file launch-readiness-gauge.tsx — Composite launch readiness score + breakdown.
 *
 * @description Hero card on the Assemble page. Shows a 0-100 score as a circular
 * gauge, plus a per-dimension breakdown so the founder knows exactly what's
 * missing. Colour scheme: International Orange for active, success/warning/destructive
 * tokens for status.
 *
 * @related
 * - Lib: src/lib/cad-lab/launch-readiness.ts
 * - Page: src/app/(platform)/the-forge/cad-lab/assemble/page.tsx
 */

import React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Rocket, CheckCircle2, CircleDot, AlertTriangle, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { LaunchReadinessReport } from "@/lib/cad-lab/launch-readiness"

interface LaunchReadinessGaugeProps {
  report: LaunchReadinessReport
}

const STATUS_CONFIG: Record<LaunchReadinessReport["status"], { label: string; colorToken: string; badge: "success" | "warning" | "destructive" | "secondary"; icon: React.ComponentType<{ className?: string }> }> = {
  ready: { label: "Launch-ready", colorToken: "text-success", badge: "success", icon: CheckCircle2 },
  "on-track": { label: "On track", colorToken: "text-international-orange", badge: "secondary", icon: CircleDot },
  "at-risk": { label: "At risk", colorToken: "text-warning", badge: "warning", icon: AlertTriangle },
  critical: { label: "Not ready", colorToken: "text-destructive", badge: "destructive", icon: XCircle },
}

export function LaunchReadinessGauge({ report }: LaunchReadinessGaugeProps) {
  const status = STATUS_CONFIG[report.status]
  const StatusIcon = status.icon
  const percent = Math.max(0, Math.min(100, report.percent))

  // INTENT: SVG circular progress. circumference = 2 * PI * r. r = 48.
  const radius = 48
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference - (percent / 100) * circumference

  const arcColor = report.status === "ready"
    ? "stroke-success"
    : report.status === "on-track"
      ? "stroke-international-orange"
      : report.status === "at-risk"
        ? "stroke-warning"
        : "stroke-destructive"

  return (
    <Card className="border-border">
      <CardContent className="pt-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          {/* ── Circular gauge ── */}
          <div className="relative flex-shrink-0" style={{ width: 128, height: 128 }}>
            <svg width={128} height={128} className="-rotate-90">
              <circle
                cx={64}
                cy={64}
                r={radius}
                className="stroke-muted fill-transparent"
                strokeWidth={10}
              />
              <circle
                cx={64}
                cy={64}
                r={radius}
                className={cn("fill-transparent transition-[stroke-dashoffset] duration-500", arcColor)}
                strokeWidth={10}
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={cn("text-3xl font-bold font-mono", status.colorToken)}>{percent}</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">ready</span>
            </div>
          </div>

          {/* ── Summary + next actions ── */}
          <div className="flex-1 min-w-0 w-full">
            <div className="flex items-center gap-2 mb-2">
              <Rocket className="h-5 w-5 text-international-orange" />
              <h2 className="text-lg font-semibold text-foreground">Launch Readiness</h2>
              <Badge variant={status.badge} className="capitalize">
                <StatusIcon className="h-3 w-3 mr-1" aria-hidden />
                {status.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-3">{report.summary}</p>

            {report.nextActions.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Top next actions
                </p>
                <ul className="space-y-1">
                  {report.nextActions.map((action, i) => (
                    <li key={i} className="text-xs text-foreground flex items-start gap-2">
                      <span className="flex-shrink-0 inline-block h-1.5 w-1.5 rounded-full bg-international-orange mt-1.5" />
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* ── Dimension breakdown ── */}
        <div className="mt-6 pt-4 border-t border-border">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Breakdown
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {report.dimensions.map((dim) => {
              const dimPct = dim.max === 0 ? 0 : Math.round((dim.score / dim.max) * 100)
              const fill = dimPct >= 80 ? "bg-success" : dimPct >= 50 ? "bg-international-orange" : dimPct > 0 ? "bg-warning" : "bg-muted-foreground/40"
              return (
                <div key={dim.id} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-foreground">{dim.label}</span>
                    <span className="text-xs font-mono text-muted-foreground">{dim.score}/{dim.max}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn("h-full transition-[width] duration-500", fill)}
                      style={{ width: `${dimPct}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">{dim.hint}</p>
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
