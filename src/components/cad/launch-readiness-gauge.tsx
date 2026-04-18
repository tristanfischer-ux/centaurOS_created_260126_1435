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
import { Rocket, CheckCircle2, CircleDot, AlertTriangle, XCircle, Flag } from "lucide-react"
import { cn } from "@/lib/utils"
import type { LaunchReadinessReport } from "@/lib/cad-lab/launch-readiness"

/**
 * Accepted-risk entry as stored in cad_lab_projects.accepted_risks JSONB.
 * Written by acceptDesignRisk() in src/actions/design-iterations.ts.
 */
export interface AcceptedRisk {
  concern_hash: string
  concern_text: string
  accepted_by?: string | null
  accepted_at: string
  reason: string
}

interface LaunchReadinessGaugeProps {
  report: LaunchReadinessReport
  /** Concerns the founder chose to accept during design iteration. Shown as a
   *  sub-panel so investors + reviewers can see what's been acknowledged but
   *  not fixed. Read from project.accepted_risks by the parent page. */
  acceptedRisks?: AcceptedRisk[]
}

const STATUS_CONFIG: Record<LaunchReadinessReport["status"], { label: string; colorToken: string; badge: "success" | "warning" | "destructive" | "secondary"; icon: React.ComponentType<{ className?: string }> }> = {
  ready: { label: "Launch-ready", colorToken: "text-success", badge: "success", icon: CheckCircle2 },
  "on-track": { label: "On track", colorToken: "text-international-orange", badge: "secondary", icon: CircleDot },
  "at-risk": { label: "At risk", colorToken: "text-warning", badge: "warning", icon: AlertTriangle },
  critical: { label: "Not ready", colorToken: "text-destructive", badge: "destructive", icon: XCircle },
}

export function LaunchReadinessGauge({ report, acceptedRisks = [] }: LaunchReadinessGaugeProps) {
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

        {/* ── Accepted-risk register (Phase VI) ── */}
        {acceptedRisks.length > 0 && (
          <div className="mt-6 pt-4 border-t border-border">
            <div className="flex items-center gap-2 mb-2">
              <Flag className="h-3.5 w-3.5 text-warning" />
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Accepted risks ({acceptedRisks.length})
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground mb-3">
              Concerns the founder has explicitly chosen to accept rather than iterate. Visible here so investors + reviewers can see what&apos;s been acknowledged but not fixed.
            </p>
            <ul className="space-y-2">
              {acceptedRisks.slice(0, 10).map((risk, i) => (
                <li key={risk.concern_hash ?? i} className="text-xs border border-warning/30 bg-warning/5 rounded-lg px-3 py-2">
                  <p className="font-medium text-foreground truncate" title={risk.concern_text}>
                    {risk.concern_text.length > 180 ? risk.concern_text.slice(0, 180) + "…" : risk.concern_text}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    <span className="font-medium">Reason:</span> {risk.reason}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Accepted {new Date(risk.accepted_at).toLocaleDateString()}
                  </p>
                </li>
              ))}
              {acceptedRisks.length > 10 && (
                <li className="text-[11px] text-muted-foreground">
                  + {acceptedRisks.length - 10} more
                </li>
              )}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
