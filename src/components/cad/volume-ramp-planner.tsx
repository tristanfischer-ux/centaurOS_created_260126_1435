"use client"

/**
 * @file volume-ramp-planner.tsx — Tag each shortlisted supplier with its ramp role.
 *
 * @description A founder needs different suppliers for different stages. The
 * prototype shop that can turn a part in 5 days is rarely the production shop
 * that can run 10k units a month. This component exposes that framing directly:
 * for every shortlisted supplier, tag them proto / pilot / production, or flag
 * "cannot scale" so the founder knows to re-source before launching at volume.
 *
 * State is persisted to localStorage (per-project) — same pattern as existing
 * Source shortlist state.
 *
 * @related
 * - Consumer: src/app/(platform)/the-forge/cad-lab/source/page.tsx (Shortlist tab)
 */

import React, { useMemo, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { ShieldCheck, TrendingUp, Rocket, Target, AlertOctagon, Circle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ShortlistedSupplier } from "@/app/(platform)/the-forge/cad-lab/source/page"

export type RampRole = "unassigned" | "proto" | "pilot" | "production" | "cannot_scale"

export type RampRoleState = Record<string /* supplierId */, RampRole>

interface VolumeRampPlannerProps {
  shortlistedSuppliers: Map<string, ShortlistedSupplier>
  rampRoles: RampRoleState
  onRampRoleChange: (supplierId: string, role: RampRole) => void
  /** Optional MOQ strings per supplier, keyed by supplier id */
  moqBySupplier?: Map<string, string | null>
}

const ROLE_CONFIG: Record<RampRole, { label: string; icon: React.ComponentType<{ className?: string }>; tone: "success" | "info" | "warning" | "destructive" | "secondary"; helper: string }> = {
  unassigned: { label: "Unassigned", icon: Circle, tone: "secondary", helper: "No ramp role set yet." },
  proto: { label: "Proto", icon: Target, tone: "info", helper: "Small runs for iteration. Fast turn, looser MOQ." },
  pilot: { label: "Pilot", icon: TrendingUp, tone: "warning", helper: "First paying-customer run. Needs FAI + QC rigour." },
  production: { label: "Production", icon: Rocket, tone: "success", helper: "Sustained volume. MOQ, tooling, payment terms agreed." },
  cannot_scale: { label: "Proto only", icon: AlertOctagon, tone: "destructive", helper: "Good for prototypes, not for production volume. Re-source before pilot." },
}

const ROLE_SEQUENCE: RampRole[] = ["proto", "pilot", "production", "cannot_scale"]

export function VolumeRampPlanner({
  shortlistedSuppliers,
  rampRoles,
  onRampRoleChange,
  moqBySupplier,
}: VolumeRampPlannerProps) {
  const suppliers = useMemo(
    () => [...shortlistedSuppliers.values()].sort((a, b) => b.bestMatchScore - a.bestMatchScore),
    [shortlistedSuppliers],
  )

  const counts = useMemo(() => {
    const bucket: Record<RampRole, number> = {
      unassigned: 0,
      proto: 0,
      pilot: 0,
      production: 0,
      cannot_scale: 0,
    }
    for (const s of suppliers) {
      const role: RampRole = rampRoles[s.id] ?? "unassigned"
      bucket[role]++
    }
    return bucket
  }, [suppliers, rampRoles])

  const missingPilot = counts.pilot === 0 && suppliers.length > 0
  const missingProduction = counts.production === 0 && suppliers.length > 0

  const cycleRole = useCallback((supplierId: string) => {
    const current: RampRole = rampRoles[supplierId] ?? "unassigned"
    if (current === "unassigned") {
      onRampRoleChange(supplierId, "proto")
      return
    }
    const idx = ROLE_SEQUENCE.indexOf(current)
    const next = idx === -1 || idx === ROLE_SEQUENCE.length - 1 ? "unassigned" : ROLE_SEQUENCE[idx + 1]
    onRampRoleChange(supplierId, next)
  }, [rampRoles, onRampRoleChange])

  if (suppliers.length === 0) return null

  return (
    <Card className="border-border">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Rocket className="h-4 w-4 text-international-orange" />
              Volume Ramp Planner
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tag each supplier with the stage they&apos;ll handle. Click a role chip to cycle. Use this to spot gaps before you scale.
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {(Object.entries(counts) as [RampRole, number][])
              .filter(([k]) => k !== "unassigned")
              .map(([k, n]) => {
                const cfg = ROLE_CONFIG[k]
                const Icon = cfg.icon
                return (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
                  >
                    <Icon className="h-3 w-3" />
                    <span className="font-medium text-foreground">{n}</span>
                    <span>{cfg.label}</span>
                  </span>
                )
              })}
          </div>
        </div>

        {/* ── Gap warnings ── */}
        {(missingPilot || missingProduction) && (
          <div className="mb-3 p-2.5 rounded-lg bg-warning/5 border border-warning/20 flex items-start gap-2">
            <AlertOctagon className="h-3.5 w-3.5 text-warning flex-shrink-0 mt-0.5" />
            <p className="text-xs text-foreground">
              {missingPilot && missingProduction && "No pilot or production supplier tagged yet. "}
              {missingPilot && !missingProduction && "No pilot supplier tagged. "}
              {!missingPilot && missingProduction && "No production supplier tagged. "}
              Tag at least one supplier per stage or you&apos;re not ready for that scale.
            </p>
          </div>
        )}

        {/* ── Supplier rows ── */}
        <div className="space-y-1.5">
          {suppliers.map((s) => {
            const role: RampRole = rampRoles[s.id] ?? "unassigned"
            const cfg = ROLE_CONFIG[role]
            const Icon = cfg.icon
            const moq = moqBySupplier?.get(s.id) ?? null
            return (
              <div
                key={s.id}
                className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">{s.name}</p>
                    {s.isVerified && (
                      <ShieldCheck className="h-3 w-3 text-success flex-shrink-0" aria-label="Verified" />
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[10px] text-muted-foreground font-mono">
                      score {Math.round(s.bestMatchScore)}
                    </span>
                    {moq && (
                      <span className="text-[10px] text-muted-foreground">
                        MOQ {moq}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground truncate">
                      {cfg.helper}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => cycleRole(s.id)}
                  aria-label={`Change ramp role for ${s.name}. Current: ${cfg.label}`}
                  className={cn(
                    "flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                    role === "proto" && "bg-info/10 text-info border border-info/30",
                    role === "pilot" && "bg-warning/10 text-warning border border-warning/30",
                    role === "production" && "bg-success/10 text-success border border-success/30",
                    role === "cannot_scale" && "bg-destructive/10 text-destructive border border-destructive/30",
                    role === "unassigned" && "bg-muted text-muted-foreground border border-border hover:border-international-orange/40",
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {cfg.label}
                </button>
              </div>
            )
          })}
        </div>

        <p className="text-[10px] text-muted-foreground mt-3">
          Click the role chip to cycle: Proto → Pilot → Production → Proto only → Unassigned.
        </p>
      </CardContent>
    </Card>
  )
}
