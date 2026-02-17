"use client"

/**
 * @file stats-panel.tsx — Live stats panel for the assembly workbench.
 *
 * @description Shows real-time totals for weight, cost, power, lead time,
 * slot completion progress, compatibility warnings, certification summary,
 * and inter-component compatibility analysis. Updates whenever components
 * are added or removed. RPG-style stat bars and indicators.
 *
 * Features three tabs:
 * - Stats: Weight, cost, power, lead time, warnings, BOM
 * - Compatibility: Inter-component "works with" pairs from database
 * - Certifications: CE, UL, RoHS compliance per component
 *
 * @component
 * @example
 * <StatsPanel slots={slots} placedComponents={placed} components={allComponents} />
 */

import { useState } from "react"
import type { LucideIcon } from "lucide-react"
import {
  Weight,
  PoundSterling,
  Zap,
  Clock,
  AlertTriangle,
  Trophy,
  Package,
  Link2,
  ShieldCheck,
  Loader2,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"

import type {
  TemplateSlot,
  PlacedComponent,
  CatalogComponent,
  AssemblyEnrichment,
} from "@/actions/assembly-builder"

// ─── Props ───────────────────────────────────────────────────────────

type StatsTab = "stats" | "compatibility" | "certifications"

interface StatsPanelProps {
  /** Slot definitions from the template */
  slots: TemplateSlot[]
  /** Components currently placed in slots */
  placedComponents: PlacedComponent[]
  /** Full component data for calculating stats */
  componentLookup: Map<string, CatalogComponent>
  /** Enrichment data from database (pricing, certs, compatibility) */
  enrichment: AssemblyEnrichment | null
  /** Whether enrichment data is still loading */
  enrichmentLoading?: boolean
  /** Optional className */
  className?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────

interface AssemblyStats {
  totalWeight: number
  totalCost: number
  totalPower: number
  maxLeadTime: number
  filledSlots: number
  totalSlots: number
  requiredSlots: number
  filledRequired: number
  warnings: string[]
}

/**
 * Calculates aggregate stats from placed components.
 *
 * @param slots - Template slot definitions
 * @param placed - Currently placed components
 * @param lookup - Map of slug -> full component data
 * @returns Computed assembly statistics
 */
function calculateStats(
  slots: TemplateSlot[],
  placed: PlacedComponent[],
  lookup: Map<string, CatalogComponent>,
): AssemblyStats {
  let totalWeight = 0
  let totalCost = 0
  let totalPower = 0
  let maxLeadTime = 0
  const warnings: string[] = []

  const filledSlotIds = new Set(placed.map((p) => p.slotId))
  const requiredSlots = slots.filter((s) => s.required)

  for (const pc of placed) {
    if (!pc.geometryTypeSlug) continue
    const comp = lookup.get(pc.geometryTypeSlug)
    if (!comp) continue

    // Weight
    const mass = comp.physicalProperties?.mass as Record<string, unknown> | undefined
    const weightG = (mass?.typical_g as number) ?? 0
    totalWeight += weightG * pc.quantity

    // Cost
    const costGbp = (comp.procurement?.typical_cost_gbp as number) ?? 0
    totalCost += costGbp * pc.quantity

    // Power
    const electrical = comp.physicalProperties?.electrical as Record<string, unknown> | undefined
    const watts = (electrical?.typical_watts as number) ?? 0
    totalPower += watts * pc.quantity

    // Lead time
    const leadDays = (comp.procurement?.lead_time_days as number) ?? 0
    if (leadDays > maxLeadTime) maxLeadTime = leadDays

    // Weight constraint check
    const slot = slots.find((s) => s.id === pc.slotId)
    if (slot?.constraints?.max_weight_g) {
      const maxW = slot.constraints.max_weight_g as number
      if (weightG > maxW) {
        warnings.push(
          `${comp.name} exceeds weight limit for ${slot.label} (${Math.round(weightG)}g > ${maxW}g)`,
        )
      }
    }
  }

  // Check for missing required slots
  for (const req of requiredSlots) {
    if (!filledSlotIds.has(req.id)) {
      warnings.push(`Required slot "${req.label}" is empty`)
    }
  }

  return {
    totalWeight,
    totalCost,
    totalPower,
    maxLeadTime,
    filledSlots: filledSlotIds.size,
    totalSlots: slots.length,
    requiredSlots: requiredSlots.length,
    filledRequired: requiredSlots.filter((s) => filledSlotIds.has(s.id)).length,
    warnings,
  }
}

/**
 * Returns a weight class label based on total weight.
 */
function getWeightClass(grams: number): { label: string; color: string } {
  if (grams === 0) return { label: "—", color: "text-muted-foreground" }
  if (grams < 250) return { label: "Ultralight", color: "text-status-success" }
  if (grams < 1000) return { label: "Standard", color: "text-status-info" }
  if (grams < 5000) return { label: "Heavy", color: "text-status-warning" }
  return { label: "Ultra-Heavy", color: "text-destructive" }
}

/**
 * Returns a cost tier label.
 */
function getCostTier(cost: number): { label: string; color: string } {
  if (cost === 0) return { label: "—", color: "text-muted-foreground" }
  if (cost < 25) return { label: "Budget", color: "text-status-success" }
  if (cost < 100) return { label: "Mid-Range", color: "text-status-info" }
  if (cost < 500) return { label: "Premium", color: "text-status-warning" }
  return { label: "Professional", color: "text-international-orange" }
}

// ─── Component ───────────────────────────────────────────────────────

export function StatsPanel({
  slots,
  placedComponents,
  componentLookup,
  enrichment,
  enrichmentLoading = false,
  className,
}: StatsPanelProps): React.ReactNode {
  const [activeTab, setActiveTab] = useState<StatsTab>("stats")

  const stats = calculateStats(slots, placedComponents, componentLookup)
  const completionPct =
    stats.totalSlots > 0
      ? Math.round((stats.filledSlots / stats.totalSlots) * 100)
      : 0
  const isReady =
    stats.filledRequired === stats.requiredSlots &&
    stats.warnings.length === 0 &&
    stats.requiredSlots > 0

  const weightClass = getWeightClass(stats.totalWeight)
  const costTier = getCostTier(stats.totalCost)

  const compatCount = enrichment?.compatibility?.length ?? 0
  const certCount = enrichment?.certifications?.length ?? 0

  return (
    <div className={cn("h-full flex flex-col", className)}>
      {/* Tab bar */}
      <div className="flex border-b shrink-0">
        {([
          { id: "stats" as const, label: "Stats", icon: Trophy },
          { id: "compatibility" as const, label: "Compat", icon: Link2, count: compatCount },
          { id: "certifications" as const, label: "Certs", icon: ShieldCheck, count: certCount },
        ]).map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1 px-2 py-2.5 text-[10px] font-medium transition-colors border-b-2",
                activeTab === tab.id
                  ? "border-international-orange text-international-orange"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3 w-3" />
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="text-[9px] font-mono bg-muted rounded-full px-1">
                  {tab.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <ScrollArea className="flex-1">
        {/* ─── Stats Tab ─── */}
        {activeTab === "stats" && (
          <div className="p-4 space-y-5">
            {/* Build Status */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  Build Status
                </h3>
                {isReady ? (
                  <Badge variant="success" className="text-[10px]">
                    <Trophy className="h-3 w-3 mr-1" />
                    Build Ready
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">
                    In Progress
                  </Badge>
                )}
              </div>

              {/* Completion bar */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Slots filled</span>
                  <span className="font-mono font-medium text-foreground">
                    {stats.filledSlots} / {stats.totalSlots}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500 ease-out",
                      completionPct === 100
                        ? "bg-status-success"
                        : "bg-international-orange",
                    )}
                    style={{ width: `${completionPct}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {stats.filledRequired} of {stats.requiredSlots} required slots
                  filled
                </p>
              </div>
            </div>

            {/* Stat Bars */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Assembly Stats
              </h3>

              <StatRow
                icon={Weight}
                label="Weight"
                value={
                  stats.totalWeight > 0
                    ? stats.totalWeight >= 1000
                      ? `${(stats.totalWeight / 1000).toFixed(1)} kg`
                      : `${Math.round(stats.totalWeight)} g`
                    : "—"
                }
                sublabel={weightClass.label}
                sublabelColor={weightClass.color}
              />

              <StatRow
                icon={PoundSterling}
                label="Est. Cost"
                value={
                  stats.totalCost > 0
                    ? `£${stats.totalCost.toFixed(2)}`
                    : "—"
                }
                sublabel={costTier.label}
                sublabelColor={costTier.color}
              />

              <StatRow
                icon={Zap}
                label="Power"
                value={
                  stats.totalPower > 0
                    ? `${stats.totalPower.toFixed(1)} W`
                    : "—"
                }
              />

              <StatRow
                icon={Clock}
                label="Lead Time"
                value={
                  stats.maxLeadTime > 0
                    ? `${stats.maxLeadTime} days`
                    : "—"
                }
              />
            </div>

            {/* Warnings */}
            {stats.warnings.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Warnings ({stats.warnings.length})
                </h3>
                <div className="space-y-1.5">
                  {stats.warnings.map((warning, i) => (
                    <div
                      key={i}
                      className="rounded-md bg-status-error-light/50 border border-destructive/20 px-3 py-2"
                    >
                      <p className="text-[11px] text-destructive">{warning}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* BOM Summary */}
            {placedComponents.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Package className="h-3 w-3" />
                  Bill of Materials
                </h3>
                <div className="space-y-1">
                  {placedComponents.map((pc) => {
                    const comp = pc.geometryTypeSlug
                      ? componentLookup.get(pc.geometryTypeSlug)
                      : null
                    const cost =
                      (comp?.procurement?.typical_cost_gbp as number) ?? 0

                    return (
                      <div
                        key={pc.id || pc.slotId}
                        className="flex items-center justify-between text-xs py-1 border-b border-muted last:border-0"
                      >
                        <span className="text-foreground truncate max-w-[140px]">
                          {pc.componentName}
                        </span>
                        <span className="text-muted-foreground font-mono">
                          {cost > 0 ? `£${cost.toFixed(2)}` : "—"}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Compatibility Tab ─── */}
        {activeTab === "compatibility" && (
          <div className="p-4 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Link2 className="h-3 w-3" />
              Component Compatibility
            </h3>

            {enrichmentLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : !enrichment?.compatibility?.length ? (
              <div className="text-center py-6">
                <Link2 className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">
                  {placedComponents.length < 2
                    ? "Place at least 2 components to see compatibility data"
                    : "No compatibility data found for placed components"}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {enrichment.compatibility.map((pair, i) => (
                  <div
                    key={i}
                    className="rounded-md border px-3 py-2 space-y-1"
                  >
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="font-medium text-foreground truncate max-w-[80px]">
                        {pair.component_a}
                      </span>
                      <span className="text-muted-foreground">↔</span>
                      <span className="font-medium text-foreground truncate max-w-[80px]">
                        {pair.component_b}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className="text-[9px] px-1.5 py-0"
                      >
                        {pair.relationship}
                      </Badge>
                      {pair.confidence != null && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {Math.round(pair.confidence * 100)}% conf
                        </span>
                      )}
                    </div>
                    {pair.notes && (
                      <p className="text-[10px] text-muted-foreground leading-tight">
                        {pair.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Certifications Tab ─── */}
        {activeTab === "certifications" && (
          <div className="p-4 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" />
              Certification Summary
            </h3>

            {enrichmentLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : !enrichment?.certifications?.length ? (
              <div className="text-center py-6">
                <ShieldCheck className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">
                  {placedComponents.length === 0
                    ? "Place components to see certification data"
                    : "No certification data found for placed components"}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Aggregate badge row */}
                <CertAggregateRow certifications={enrichment.certifications} />

                {/* Per-component breakdown */}
                {enrichment.certifications.map((cert, i) => {
                  const certs = Array.isArray(cert.certifications)
                    ? cert.certifications
                    : []

                  return (
                    <div
                      key={i}
                      className="rounded-md border px-3 py-2.5 space-y-1.5"
                    >
                      <p className="text-[11px] font-medium text-foreground truncate">
                        {cert.component_name}
                      </p>

                      {certs.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {certs.map((c: unknown, j: number) => {
                            const certObj = c as Record<string, unknown>
                            const name =
                              (certObj.name as string) ??
                              (certObj.standard as string) ??
                              "—"
                            const status = certObj.status as string | undefined

                            return (
                              <Badge
                                key={j}
                                variant={
                                  status === "active" || status === "certified"
                                    ? "success"
                                    : "secondary"
                                }
                                className="text-[9px] px-1.5 py-0"
                              >
                                {name}
                              </Badge>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground">
                          No certifications listed
                        </p>
                      )}

                      {cert.export_control && (
                        <p className="text-[10px] text-status-warning">
                          Export control restrictions apply
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

// ─── Certification Aggregate Row ─────────────────────────────────────

/**
 * Shows a summary of all unique certifications across placed components.
 */
function CertAggregateRow({
  certifications,
}: {
  certifications: { certifications: unknown[] }[]
}): React.ReactNode {
  const allCertNames = new Set<string>()
  for (const row of certifications) {
    if (!Array.isArray(row.certifications)) continue
    for (const c of row.certifications) {
      const obj = c as Record<string, unknown>
      const name = (obj.name as string) ?? (obj.standard as string)
      if (name) allCertNames.add(name)
    }
  }

  if (allCertNames.size === 0) return null

  return (
    <div className="rounded-md bg-muted/50 px-3 py-2">
      <p className="text-[10px] text-muted-foreground mb-1.5">
        Unique certifications across build
      </p>
      <div className="flex flex-wrap gap-1">
        {Array.from(allCertNames).map((name) => (
          <Badge key={name} variant="info" className="text-[9px] px-1.5 py-0">
            {name}
          </Badge>
        ))}
      </div>
    </div>
  )
}

// ─── Stat Row ────────────────────────────────────────────────────────

function StatRow({
  icon: Icon,
  label,
  value,
  sublabel,
  sublabelColor,
}: {
  icon: LucideIcon
  label: string
  value: string
  sublabel?: string
  sublabelColor?: string
}): React.ReactNode {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground font-mono">
          {value}
        </p>
      </div>
      {sublabel && sublabel !== "—" && (
        <span className={cn("text-[10px] font-medium", sublabelColor)}>
          {sublabel}
        </span>
      )}
    </div>
  )
}
