/**
 * @file rfq-section.tsx — Request for Quotation section
 *
 * @description Renders the RFQ (Request for Quotation) summary card
 * in The Forge dossier. Shows cost estimates, process class,
 * and module breakdown. RFQ generation from the full dossier is
 * planned but not yet implemented.
 *
 * Ported from v1's Tab D (RFQView) into v2's narrative layout.
 *
 * @related
 * - Schema: ../services/xray-schema.ts (XRaySpec, ModuleSpec)
 * - Supply chain: ./supply-chain.tsx (supplier matching feeds into RFQ)
 */

"use client"

import React from "react"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { FileText, Package, Clock, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

import type { XRaySpec, ModuleSpec } from "../services/xray-schema"

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Finds the gating module in the spec.
 */
function findGatingModule(modules: ModuleSpec[]): ModuleSpec | undefined {
  return modules.find((m) => m.isGatingModule) ?? modules.find((m) => m.id === "react")
}

/**
 * Gets the derived process class from the gating module.
 */
function getDerivedProcessClass(spec: XRaySpec): string | undefined {
  const gating = findGatingModule(spec.modules)
  if (!gating) return undefined
  return gating.diagnostic?.derivedProcessClass
}

// ─── Props ────────────────────────────────────────────────────────────

interface RfqSectionProps {
  /** The current X-Ray spec */
  spec: XRaySpec
}

// ─── Component ────────────────────────────────────────────────────────

/**
 * RfqSection — Request for Quotation summary in the dossier.
 *
 * @description Displays cost estimates, process class, module breakdown,
 * and a placeholder for the future RFQ generation feature.
 *
 * @component
 *
 * @example
 * <RfqSection spec={spec} />
 */
export function RfqSection({ spec }: RfqSectionProps): React.ReactNode {
  const total = spec.modules.reduce((s, m) => s + (m.estCost ?? 0), 0)
  const processClass = getDerivedProcessClass(spec)
  const criticalPath = Math.max(...spec.modules.map((m) => m.requirements.leadWeeks), 0)
  const modulesWithSupplier = spec.modules.filter((m) => m.supplier).length

  return (
    <div className="space-y-3">
      {/* Section heading */}
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-chart-5" />
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Request for Quotation
        </h2>
      </div>

      <Card className="rounded-xl shadow-sm">
        <CardContent className="pt-6 pb-6 space-y-5">
          {/* Status banner */}
          <div className="rounded-xl bg-muted/30 border p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-muted/50 flex items-center justify-center">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">RFQ Generation — Coming Soon</p>
                <p className="text-xs text-muted-foreground">
                  Generate a spec pack from diagnostic + interviews + selected suppliers.
                </p>
              </div>
            </div>

            {/* Key metrics row */}
            <div className="flex flex-wrap items-center gap-6 pt-2">
              <div>
                <p className="text-xs text-muted-foreground">Process class</p>
                <p className="text-sm font-semibold text-foreground">
                  {processClass || "(unset — complete gating diagnostic)"}
                </p>
              </div>
              {total > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground">Estimated total</p>
                  <p className="text-sm font-semibold text-foreground">
                    £{Math.round(total).toLocaleString()}
                  </p>
                </div>
              )}
              {criticalPath > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground">Critical path</p>
                  <p className="text-sm font-semibold text-foreground">{criticalPath} weeks</p>
                </div>
              )}
            </div>
          </div>

          {/* Module breakdown */}
          {spec.modules.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Module Breakdown
              </h4>
              <div className="space-y-1.5">
                {spec.modules.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "flex items-center justify-between rounded-lg border px-3 py-2 text-sm",
                      m.supplier ? "bg-status-success-light/30" : "bg-background",
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Package className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="truncate text-foreground">{m.name}</span>
                      {m.isGatingModule && (
                        <Badge variant="warning" className="text-[9px] shrink-0">Gating</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {m.requirements.leadWeeks}w
                      </span>
                      {m.estCost ? (
                        <span className="text-xs font-medium tabular-nums">
                          £{Math.round(m.estCost).toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                      {m.supplier ? (
                        <Badge variant="success" className="text-[9px]">{m.supplier}</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[9px]">No supplier</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Readiness checklist */}
          <div className="rounded-lg border p-3 space-y-2">
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
              RFQ Readiness
            </h4>
            <div className="space-y-1">
              <ReadinessItem
                label="Process class derived"
                done={!!processClass}
              />
              <ReadinessItem
                label={`Suppliers assigned (${modulesWithSupplier}/${spec.modules.length})`}
                done={modulesWithSupplier === spec.modules.length}
              />
              <ReadinessItem
                label="Cost estimates available"
                done={total > 0}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Readiness Item ───────────────────────────────────────────────────

function ReadinessItem({ label, done }: { label: string; done: boolean }): React.ReactNode {
  return (
    <div className="flex items-center gap-2 text-sm">
      {done ? (
        <div className="h-4 w-4 rounded-full bg-status-success flex items-center justify-center">
          <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      ) : (
        <div className="h-4 w-4 rounded-full border-2 border-muted" />
      )}
      <span className={cn(
        "text-sm",
        done ? "text-foreground" : "text-muted-foreground",
      )}>
        {label}
      </span>
    </div>
  )
}
