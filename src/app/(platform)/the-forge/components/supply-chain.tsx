/**
 * @file supply-chain.tsx — Compact supplier matching per module
 *
 * @description Inline supplier cards organized by module. Shows an info
 * banner when the diagnostic is incomplete but never blocks access.
 */

"use client"

import React from "react"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Info,
  Box,
  Clock,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  RefreshCw,
} from "lucide-react"
import { cn } from "@/lib/utils"

import type { XRaySpec } from "../services/xray-schema"
import type { SupplierMatch } from "../services/suppliers"

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

interface SupplyChainProps {
  spec: XRaySpec
  diagComplete: boolean
  suppliersByModule: Record<string, SupplierMatch[]>
  isSuppliersLoading: boolean
  onRefreshSuppliers: () => void
  onAssignSupplier: (moduleId: string, supplierName: string) => void
}

// ─── Component ───────────────────────────────────────────────────────

/**
 * SupplyChain — Module-by-module supplier matching.
 *
 * @description Compact supplier cards with select/assign behavior.
 * Shows an info banner when diagnostic is incomplete but never blocks access.
 */
export function SupplyChain({
  spec,
  diagComplete,
  suppliersByModule,
  isSuppliersLoading,
  onRefreshSuppliers,
  onAssignSupplier,
}: SupplyChainProps): React.ReactNode {
  const processClass = spec.modules.find(m => m.isGatingModule)?.diagnostic?.derivedProcessClass

  return (
    <Card className="rounded-xl shadow-sm">
      <CardContent className="pt-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1 h-7 bg-chart-4 rounded-full" />
            <div>
              <h3 className="text-lg font-display font-semibold tracking-tight text-foreground">
                Supply Chain
              </h3>
              <p className="text-xs text-muted-foreground">
                Suppliers matched by module{processClass ? ` — process class: ${processClass}` : ""}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={onRefreshSuppliers}
            disabled={isSuppliersLoading}
          >
            {isSuppliersLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Refresh
          </Button>
        </div>

        {/* Diagnostic info banner */}
        {!diagComplete && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Complete the gating diagnostic for more accurate supplier matching.
              Results below are broad matches based on module requirements.
            </AlertDescription>
          </Alert>
        )}

        {/* Loading */}
        {isSuppliersLoading && (
          <div className="grid md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
          </div>
        )}

        {/* Suppliers by module */}
        {!isSuppliersLoading && spec.modules.map((m) => {
          const suppliers = suppliersByModule[m.id] || []
          const accentColor = chipColor(m.id)

          return (
            <div key={m.id} className="space-y-3">
              {/* Module header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="h-7 w-7 rounded-md flex items-center justify-center shrink-0"
                    style={{ backgroundColor: accentColor + "18" }}
                  >
                    <Box className="h-3.5 w-3.5" style={{ color: accentColor }} />
                  </div>
                  <span className="text-sm font-semibold text-foreground">{m.name}</span>
                </div>
                {m.supplier ? (
                  <Badge className="bg-status-success-light text-status-success-dark text-[10px]">
                    <CheckCircle2 className="h-2.5 w-2.5 mr-1" />{m.supplier}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">Select a supplier</Badge>
                )}
              </div>

              {/* Supplier cards */}
              {suppliers.length > 0 ? (
                <div className="grid md:grid-cols-3 gap-3">
                  {suppliers.slice(0, 3).map((s) => {
                    const initials = s.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
                    const selected = m.supplier === s.name

                    return (
                      <Card
                        key={s.id}
                        className={cn(
                          "cursor-pointer rounded-xl shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200",
                          selected && "ring-2 ring-international-orange border-international-orange",
                        )}
                        role="button"
                        tabIndex={0}
                        onClick={() => onAssignSupplier(m.id, s.name)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onAssignSupplier(m.id, s.name) }}
                      >
                        <CardContent className="pt-4 pb-4 space-y-2.5">
                          <div className="flex items-start gap-3">
                            <div className="h-9 w-9 rounded-lg bg-chart-4/15 text-chart-4 flex items-center justify-center text-xs font-semibold shrink-0">
                              {initials}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <p className="font-semibold text-xs text-foreground truncate">{s.name}</p>
                                {s.isVerified && <CheckCircle2 className="h-3 w-3 text-status-success shrink-0" />}
                                {selected && <CheckCircle2 className="h-3 w-3 text-international-orange shrink-0" />}
                              </div>
                              <p className="text-[10px] text-muted-foreground">{s.supplierType}</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {s.capabilities.slice(0, 3).map((c, i) => (
                              <span key={i} className="inline-block rounded bg-muted/60 px-1.5 py-0.5 text-[9px] text-muted-foreground">{c}</span>
                            ))}
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Clock className="h-2.5 w-2.5" />
                              {s.typicalLeadWeeks}w lead
                            </div>
                            <div className="flex items-center gap-1">
                              <ShieldCheck className="h-2.5 w-2.5" />
                              {s.warrantyMonths}m warranty
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground py-2 ml-9">
                  No matching suppliers found for this module.
                </p>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
