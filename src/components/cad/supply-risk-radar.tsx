"use client"

/**
 * @file supply-risk-radar.tsx — Top-level supply chain risk signals for Source.
 *
 * @description Surfaces dual-sourcing, geographic concentration, and tariff
 * exposure risks in a founder-friendly card. Sits above the Source tabs so it's
 * visible regardless of which tab is active.
 *
 * @related
 * - Lib: src/lib/cad-lab/supply-risk.ts
 * - Page: src/app/(platform)/the-forge/cad-lab/source/page.tsx
 */

import React, { useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, ShieldAlert, Globe2, Info, CheckCircle2, GitBranch } from "lucide-react"
import { cn } from "@/lib/utils"
import { getSpecialistById } from "@/lib/agents/specialists-config"
import Image from "next/image"
import type { CadLabSupplierMatch } from "@/actions/cad-lab-supplier-match"
import type { ShortlistedSupplier } from "@/app/(platform)/the-forge/cad-lab/source/page"
import { computeSupplyRisk } from "@/lib/cad-lab/supply-risk"
import type { RiskSeverity } from "@/lib/cad-lab/supply-risk"
import { getSubTierRisk, type SubTierRiskReport } from "@/actions/supplier-enrichment"

interface SupplyRiskRadarProps {
  shortlistedSuppliers: Map<string, ShortlistedSupplier>
  categoryRankings: Map<string, string[]>
  supplierMatches: Map<string, CadLabSupplierMatch[]>
  categoryLabels?: Map<string, string>
  targetMarket?: "US" | "UK" | "EU" | "other"
  onTargetMarketChange?: (market: "US" | "UK" | "EU" | "other") => void
}

const SEVERITY_STYLE: Record<RiskSeverity, { chip: "warning" | "destructive" | "info"; icon: React.ComponentType<{ className?: string }> }> = {
  critical: { chip: "destructive", icon: ShieldAlert },
  warning: { chip: "warning", icon: AlertTriangle },
  info: { chip: "info", icon: Info },
}

export function SupplyRiskRadar({
  shortlistedSuppliers,
  categoryRankings,
  supplierMatches,
  categoryLabels,
  targetMarket = "UK",
  onTargetMarketChange,
}: SupplyRiskRadarProps) {
  const chase = getSpecialistById("vp-supply-chain")

  const report = useMemo(
    () => computeSupplyRisk({
      shortlistedSuppliers,
      categoryRankings,
      supplierMatches,
      categoryLabels,
      targetMarket,
    }),
    [shortlistedSuppliers, categoryRankings, supplierMatches, categoryLabels, targetMarket],
  )

  // ── Sub-tier risk (item #17) — follows supplier_relationships one hop ──
  const shortlistedIds = useMemo(() => [...shortlistedSuppliers.keys()], [shortlistedSuppliers])
  const shortlistedIdsKey = shortlistedIds.join(",")
  const [subTier, setSubTier] = useState<SubTierRiskReport | null>(null)
  useEffect(() => {
    if (shortlistedIds.length === 0) { setSubTier(null); return }
    let cancelled = false
    getSubTierRisk(shortlistedIds).then((res) => { if (!cancelled) setSubTier(res) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortlistedIdsKey])

  if (shortlistedSuppliers.size === 0) return null

  const noAlerts = report.alerts.length === 0

  return (
    <Card className={cn("border", report.hasCriticalRisk ? "border-destructive/30" : "border-warning/30")}>
      <CardContent className="pt-6">
        {/* ── Header with Chase avatar ── */}
        <div className="flex items-start gap-3 mb-4">
          {chase?.avatarImage ? (
            <Image src={chase.avatarImage} alt={chase.name} width={32} height={32} className="rounded-full flex-shrink-0" />
          ) : (
            <div className="shrink-0 w-8 h-8 rounded-full bg-warning/10 flex items-center justify-center">
              <Globe2 className="h-4 w-4 text-warning" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-foreground">Chase, VP Supply Chain — Supply Risk Radar</p>
              {noAlerts && (
                <Badge variant="success" className="h-4 px-1.5 text-[10px]">All clear</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{report.summary}</p>
          </div>
          {/* Target market selector */}
          {onTargetMarketChange && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">Ship to:</span>
              <select
                value={targetMarket}
                onChange={(e) => onTargetMarketChange(e.target.value as "US" | "UK" | "EU" | "other")}
                className="text-xs border border-input rounded px-2 py-1 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-international-orange"
                aria-label="Primary target market for shipping"
              >
                <option value="UK">UK</option>
                <option value="EU">EU</option>
                <option value="US">US</option>
                <option value="other">Other</option>
              </select>
            </div>
          )}
        </div>

        {/* ── Alerts list ── */}
        {noAlerts ? (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-success/10 border border-success/20">
            <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-foreground">No immediate supply risks detected</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Dual-sourcing, geographic spread, and tariff exposure all look healthy for the current shortlist.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {report.alerts.map((alert) => {
              const style = SEVERITY_STYLE[alert.severity]
              const Icon = style.icon
              return (
                <div
                  key={alert.id}
                  className={cn(
                    "p-3 rounded-lg border",
                    alert.severity === "critical" && "border-destructive/30 bg-destructive/5",
                    alert.severity === "warning" && "border-warning/30 bg-warning/5",
                    alert.severity === "info" && "border-info/30 bg-info/5",
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <Icon className={cn(
                      "h-4 w-4 flex-shrink-0 mt-0.5",
                      alert.severity === "critical" && "text-destructive",
                      alert.severity === "warning" && "text-warning",
                      alert.severity === "info" && "text-info",
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-foreground">{alert.title}</p>
                        <Badge variant={style.chip} className="h-4 px-1.5 text-[10px] capitalize">
                          {alert.severity}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{alert.body}</p>
                      {alert.action && (
                        <p className="text-xs text-foreground mt-1.5 font-medium">→ {alert.action}</p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Sub-tier exposure (item #17) ── */}
        {subTier && Object.keys(subTier.hops).length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2 mb-2">
              <GitBranch className="h-3.5 w-3.5 text-info" />
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Sub-tier exposure</p>
              {subTier.downstreamSanctions.length > 0 && (
                <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">{subTier.downstreamSanctions.length} flagged</Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mb-2">
              Your shortlisted suppliers depend on downstream companies. Any disruption at these also risks your delivery.
            </p>
            <div className="space-y-1">
              {Object.entries(subTier.hops).slice(0, 5).map(([parentId, children]) => {
                const parent = shortlistedSuppliers.get(parentId)
                const hasSanction = subTier.downstreamSanctions.some((s) => s.upstream === parentId)
                return (
                  <div key={parentId} className="flex items-start gap-2 text-[11px]">
                    <span className="text-muted-foreground">{parent?.name ?? "Unknown"}</span>
                    <span className="text-muted-foreground/60">→</span>
                    <span className={cn("flex-1 truncate", hasSanction ? "text-destructive" : "text-foreground")}>
                      {children.slice(0, 3).map((c) => c.name).join(", ")}
                      {children.length > 3 ? ` + ${children.length - 3} more` : ""}
                    </span>
                    {hasSanction && <ShieldAlert className="h-3 w-3 text-destructive flex-shrink-0" />}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Geographic breakdown ── */}
        {report.geography.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Geographic breakdown
            </p>
            <div className="flex flex-wrap gap-1.5">
              {report.geography.map((g) => (
                <span
                  key={g.country}
                  className={cn(
                    "text-xs px-2 py-1 rounded-full border inline-flex items-center gap-1.5",
                    g.percent >= 70 ? "border-warning/40 bg-warning/5 text-warning-foreground" : "border-border bg-muted/50 text-muted-foreground",
                  )}
                >
                  <Globe2 className="h-3 w-3" />
                  <span className="font-medium text-foreground">{g.country}</span>
                  <span className="text-muted-foreground">{g.percent}%</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
