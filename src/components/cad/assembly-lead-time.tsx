/**
 * @file assembly-lead-time.tsx — Horizontal Gantt waterfall + order tracking stepper.
 *
 * @description Two sections:
 *   1. Lead time waterfall — stacked horizontal bars showing each phase
 *   2. Order tracking stepper — horizontal progress through assembly statuses
 *
 * The waterfall shows estimated durations for:
 *   - Manufacturing (longest supplier lead time)
 *   - Shipping to assembler (3-7 days)
 *   - Assembly (from assembler's typical_lead_days)
 *   - QC (2-5 days)
 *   - Ship to customer (2-10 days)
 */

"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ORDER_TRACKING_STEPS } from "@/lib/assembly-utils"
import type { OrderTrackingStep } from "@/lib/assembly-utils"

// ─── Lead time phase ────────────────────────────────────────────────

interface LeadTimePhase {
  label: string
  days: number
  color: string
}

// ─── Props ──────────────────────────────────────────────────────────

interface AssemblyLeadTimeProps {
  /** Longest supplier lead time from Source estimates */
  manufacturingDays: number
  /** Assembler's typical_lead_days */
  assemblyDays: number
  /** Current order tracking status (if order exists) */
  currentStatus: OrderTrackingStep | null
  /** Whether order exists at all */
  hasOrder: boolean
  /** Tracking reference from assembly job */
  trackingReference: string | null
}

// ─── Component ──────────────────────────────────────────────────────

export function AssemblyLeadTime({
  manufacturingDays,
  assemblyDays,
  currentStatus,
  hasOrder,
  trackingReference,
}: AssemblyLeadTimeProps) {
  const phases: LeadTimePhase[] = useMemo(() => [
    { label: "Manufacturing", days: manufacturingDays, color: "#6366f1" },
    { label: "Ship to assembler", days: 5, color: "#0891b2" },
    { label: "Assembly", days: assemblyDays, color: "#d97706" },
    { label: "QC", days: 3, color: "#059669" },
    { label: "Ship to customer", days: 5, color: "#dc2626" },
  ], [manufacturingDays, assemblyDays])

  const totalDays = phases.reduce((sum, p) => sum + p.days, 0)
  const totalWeeks = Math.ceil(totalDays / 7)
  const maxDays = Math.max(...phases.map((p) => p.days), 1)

  // Order tracking step index
  const currentStepIdx = currentStatus
    ? ORDER_TRACKING_STEPS.indexOf(currentStatus)
    : -1
  const isDelivered = currentStatus === "delivered"

  return (
    <div className="space-y-6">
      {/* ── Lead Time Waterfall ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Estimated Lead Time</CardTitle>
            <span className="text-sm font-semibold text-foreground">
              ~{totalWeeks} week{totalWeeks !== 1 ? "s" : ""}{" "}
              <span className="text-muted-foreground font-normal">({totalDays} days)</span>
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {phases.map((phase) => {
            const widthPct = Math.max((phase.days / maxDays) * 100, 8)
            return (
              <div key={phase.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{phase.label}</span>
                  <span className="font-mono text-foreground">
                    {phase.days} day{phase.days !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="h-5 bg-muted rounded overflow-hidden">
                  <div
                    className="h-full rounded transition-all duration-700"
                    style={{
                      width: `${widthPct}%`,
                      background: `linear-gradient(90deg, ${phase.color}cc, ${phase.color}88)`,
                    }}
                  />
                </div>
              </div>
            )
          })}

          {/* Cumulative stacked bar */}
          <div className="pt-2 mt-2 border-t border-border">
            <p className="text-xs text-muted-foreground mb-1.5">Total timeline</p>
            <div className="flex h-6 rounded overflow-hidden">
              {phases.map((phase) => (
                <div
                  key={phase.label}
                  className="h-full border-r border-white/30 last:border-r-0"
                  style={{
                    width: `${(phase.days / totalDays) * 100}%`,
                    backgroundColor: phase.color,
                    opacity: 0.8,
                  }}
                  title={`${phase.label}: ${phase.days} days`}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Order Tracking Stepper ── */}
      {hasOrder && (
        <Card className={isDelivered ? "border-success/30" : undefined}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              {isDelivered ? "Product Shipped!" : "Order Tracking"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Celebration banner for delivered */}
            {isDelivered && (
              <div className="mb-4 p-3 rounded-lg bg-success/10 text-center">
                <p className="text-sm font-semibold text-success">
                  Your product has been delivered!
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Congratulations on bringing your product to life.
                </p>
              </div>
            )}

            {/* Horizontal stepper */}
            <div className="flex items-center gap-0 overflow-x-auto pb-2">
              {ORDER_TRACKING_STEPS.map((step, i) => {
                const isCompleted = i < currentStepIdx
                const isCurrent = i === currentStepIdx
                const label = step.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())

                return (
                  <div key={step} className="flex items-center">
                    {/* Step circle + label */}
                    <div className="flex flex-col items-center min-w-[72px]">
                      <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                        isCompleted
                          ? "bg-success text-white"
                          : isCurrent
                            ? "bg-international-orange text-white ring-2 ring-international-orange/30"
                            : "bg-muted text-muted-foreground"
                      }`}>
                        {isCompleted ? (
                          <svg width="12" height="12" viewBox="0 0 12 12">
                            <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" fill="none" />
                          </svg>
                        ) : (
                          i + 1
                        )}
                      </div>
                      <p className={`text-[9px] mt-1 text-center leading-tight whitespace-nowrap ${
                        isCurrent ? "text-international-orange font-semibold" :
                        isCompleted ? "text-success" : "text-muted-foreground"
                      }`}>
                        {label}
                      </p>
                    </div>
                    {/* Connector line */}
                    {i < ORDER_TRACKING_STEPS.length - 1 && (
                      <div className={`h-0.5 w-4 shrink-0 ${
                        isCompleted ? "bg-success" : "bg-muted"
                      }`} />
                    )}
                  </div>
                )
              })}
            </div>

            {/* Tracking reference */}
            {trackingReference && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground">Tracking Reference</p>
                <p className="text-sm font-mono text-foreground mt-0.5">{trackingReference}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
