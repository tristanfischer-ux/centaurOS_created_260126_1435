/**
 * @file cost-optimisation-panel.tsx — Explore material/process alternatives
 *
 * @description Renders a per-module comparison table of cost alternatives.
 * Each alternative shows estimated cost, cost delta vs baseline, strength,
 * weight, tolerance capability, and supplier availability. Users can apply
 * an alternative to update their diagnostic answers.
 *
 * @related
 * - Engine: src/lib/cad-lab/cost-optimisation-engine.ts
 * - Action: src/actions/cad-lab-cost-optimisation.ts
 * - Cost display: src/components/cad/cad-lab-cost-estimate.tsx
 */

"use client"

import { useState, useCallback, useTransition, useRef, useEffect } from "react"
import {
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  Check,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Shuffle,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { generateCostAlternatives, type CostAlternative } from "@/actions/cad-lab-cost-optimisation"

import type { CadLabModule } from "@/lib/cad-lab-types"

// ─── Types ───────────────────────────────────────────────────────────

interface CostOptimisationPanelProps {
  modules: CadLabModule[]
  diagnosticAnswers: Record<string, Record<string, string>>
  aiCostEstimates?: Record<string, { totalPerUnit: number }>
  onApplyAlternative: (
    moduleId: string,
    process: string,
    material: string,
  ) => void
}

interface ModuleAlternatives {
  alternatives: CostAlternative[]
  baselineCostPerUnit: number
}

// ─── Sub-components ──────────────────────────────────────────────────

function CostDeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <Badge variant="secondary" className="tabular-nums">
        <Minus className="mr-1 h-3 w-3" />
        Baseline
      </Badge>
    )
  }
  if (delta < 0) {
    return (
      <Badge variant="success" className="tabular-nums">
        <ArrowDownRight className="mr-1 h-3 w-3" />
        {delta}%
      </Badge>
    )
  }
  return (
    <Badge variant="warning" className="tabular-nums">
      <ArrowUpRight className="mr-1 h-3 w-3" />
      +{delta}%
    </Badge>
  )
}

function StrengthIndicator({ ratio }: { ratio: number }) {
  if (ratio > 1.1) {
    return <span className="text-xs font-medium text-success">{ratio.toFixed(1)}×</span>
  }
  if (ratio < 0.9) {
    return <span className="text-xs font-medium text-warning">{ratio.toFixed(1)}×</span>
  }
  return <span className="text-xs text-muted-foreground">~same</span>
}

function ToleranceIndicator({ capable }: { capable: boolean }) {
  if (capable) {
    return <Check className="h-4 w-4 text-success" />
  }
  return <AlertTriangle className="h-4 w-4 text-warning" />
}

function SupplierBadge({
  availability,
}: {
  availability: "high" | "medium" | "low" | "unknown"
}) {
  const variant =
    availability === "high"
      ? "success"
      : availability === "medium"
        ? "info"
        : availability === "low"
          ? "warning"
          : "secondary"
  return (
    <Badge variant={variant} className="text-[10px]">
      {availability === "unknown" ? "—" : availability}
    </Badge>
  )
}

// ─── Module Row ──────────────────────────────────────────────────────

/** Shorten long process names for compact display */
const SHORT_PROCESS: Record<string, string> = {
  "Injection Molding": "Injection Mold",
  "Manual/Assembly": "Manual",
  "SLA/Resin Print": "SLA Print",
  "SLS/Powder Print": "SLS Print",
}

function shortProcess(name: string): string {
  return SHORT_PROCESS[name] ?? name
}

function ModuleExplorer({
  module: mod,
  diagnosticAnswers,
  aiCostPerUnit,
  onApplyAlternative,
}: {
  module: CadLabModule
  diagnosticAnswers: Record<string, string>
  aiCostPerUnit?: number
  onApplyAlternative: (moduleId: string, process: string, material: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [data, setData] = useState<ModuleAlternatives | null>(null)
  const [isPending, startTransition] = useTransition()
  const [appliedKey, setAppliedKey] = useState<string | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  // Smooth height animation on expand/collapse
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    if (expanded) {
      // Expand: animate from 0 to scrollHeight
      el.style.height = "0px"
      el.style.opacity = "0"
      requestAnimationFrame(() => {
        el.style.transition = "height 200ms ease-out, opacity 200ms ease-out"
        el.style.height = `${el.scrollHeight}px`
        el.style.opacity = "1"
      })
      const onEnd = () => { el.style.height = "auto" }
      el.addEventListener("transitionend", onEnd, { once: true })
      return () => el.removeEventListener("transitionend", onEnd)
    } else {
      // Collapse: animate from current height to 0
      el.style.height = `${el.scrollHeight}px`
      el.style.opacity = "1"
      requestAnimationFrame(() => {
        el.style.transition = "height 150ms ease-in, opacity 150ms ease-in"
        el.style.height = "0px"
        el.style.opacity = "0"
      })
    }
  }, [expanded, data])

  const fetchAlternatives = useCallback(() => {
    startTransition(async () => {
      const result = await generateCostAlternatives(
        mod.id,
        mod.name,
        diagnosticAnswers,
        mod.estimatedMassKg,
        aiCostPerUnit,
      )
      if ("error" in result) {
        console.error("[CostOpt]", result.error)
        return
      }
      setData(result)
    })
  }, [mod.id, mod.name, mod.estimatedMassKg, diagnosticAnswers, aiCostPerUnit])

  const handleExpand = useCallback(() => {
    if (expanded) {
      setExpanded(false)
      return
    }
    setExpanded(true)
    // Always re-fetch when expanding — diagnostics may have changed since last view
    fetchAlternatives()
  }, [expanded, fetchAlternatives])

  const handleApply = useCallback(
    (alt: CostAlternative) => {
      onApplyAlternative(mod.id, alt.process, alt.material)
      setAppliedKey(`${alt.process}|${alt.material}`)
      // Collapse after apply — data is now stale (baseline changed).
      // Re-expanding will fetch fresh alternatives with the new diagnostics.
      setTimeout(() => {
        setExpanded(false)
        setData(null)
        setAppliedKey(null)
      }, 600)
    },
    [mod.id, onApplyAlternative],
  )

  const process = diagnosticAnswers.mfg_process ?? "—"
  const material = diagnosticAnswers.material ?? "—"

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 text-left"
          onClick={handleExpand}
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground truncate">
              {mod.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {process} · {material}
              {aiCostPerUnit != null && (
                <span className="ml-2 font-medium text-foreground">
                  £{aiCostPerUnit.toFixed(2)}/unit
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              <Shuffle className="mr-1 h-3 w-3" />
              Explore
            </Badge>
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </button>
      </CardHeader>

      <div ref={contentRef} className="overflow-hidden" style={{ height: expanded ? undefined : 0, opacity: expanded ? 1 : 0 }}>
        <CardContent className="px-4 pb-4 pt-0">
          {isPending && !data && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-10 animate-pulse rounded-lg bg-muted/50"
                />
              ))}
            </div>
          )}

          {data && data.alternatives.length <= 1 && (
            <p className="text-sm text-muted-foreground py-2">
              No compatible alternatives found for this process/material
              combination.
            </p>
          )}

          {data && data.alternatives.length > 1 && (
            <div className="space-y-1.5">
              {/* Desktop header (hidden on mobile) */}
              <div className="hidden sm:grid sm:grid-cols-[1fr_1fr_5rem_5.5rem_3.5rem_2.5rem_4rem] gap-2 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <span>Process</span>
                <span>Material</span>
                <span className="text-right">Est. Cost</span>
                <span className="text-center">vs Base</span>
                <span className="text-center">Strength</span>
                <span className="text-center">Tol.</span>
                <span />
              </div>

              {/* Rows — stacked on mobile, grid on desktop */}
              {data.alternatives.map((alt) => {
                const key = `${alt.process}|${alt.material}`
                const isApplied = appliedKey === key
                return (
                  <div
                    key={key}
                    className={cn(
                      "rounded-lg px-3 py-2.5 transition-colors",
                      alt.isBaseline
                        ? "bg-international-orange/5 border border-international-orange/20"
                        : "hover:bg-muted/40",
                      // Desktop: grid row
                      "sm:grid sm:grid-cols-[1fr_1fr_5rem_5.5rem_3.5rem_2.5rem_4rem] sm:items-center sm:gap-2 sm:py-2",
                    )}
                  >
                    {/* Mobile: stacked layout */}
                    <div className="flex items-center justify-between sm:contents">
                      <div className="min-w-0 sm:contents">
                        <span className="block truncate text-xs font-medium sm:block" title={alt.process}>
                          {shortProcess(alt.process)}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground sm:text-foreground" title={alt.material}>
                          {alt.material}
                        </span>
                      </div>
                      <span className="text-sm font-semibold tabular-nums whitespace-nowrap sm:text-right sm:text-xs">
                        £{alt.estimatedCostPerUnit.toFixed(2)}
                      </span>
                    </div>

                    {/* Mobile: badges row / Desktop: inline */}
                    <div className="mt-1.5 flex items-center gap-2 sm:mt-0 sm:contents">
                      <CostDeltaBadge delta={alt.costDeltaPercent} />
                      <div className="sm:flex sm:justify-center">
                        <StrengthIndicator ratio={alt.tradeoffs.strengthRatio} />
                      </div>
                      <div className="sm:flex sm:justify-center">
                        <ToleranceIndicator capable={alt.tradeoffs.toleranceCapable} />
                      </div>
                      <div className="ml-auto sm:ml-0 sm:flex sm:justify-end">
                        {alt.isBaseline ? (
                          <span className="text-[10px] text-muted-foreground">
                            Current
                          </span>
                        ) : isApplied ? (
                          <Badge variant="success" className="text-[10px] animate-pulse">
                            <Check className="mr-1 h-3 w-3" />
                            Updating costs…
                          </Badge>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleApply(alt)}
                          >
                            Apply
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Legend */}
              <p className="pt-2 text-[10px] text-muted-foreground">
                Estimates based on engineering data. Actual costs depend on
                geometry, supplier, and order volume.
              </p>
            </div>
          )}
        </CardContent>
      </div>
    </Card>
  )
}

// ─── Main Panel ──────────────────────────────────────────────────────

export function CostOptimisationPanel({
  modules,
  diagnosticAnswers,
  aiCostEstimates,
  onApplyAlternative,
}: CostOptimisationPanelProps) {
  // Only show modules that have diagnostic answers
  const eligibleModules = modules.filter(
    (m) => diagnosticAnswers[m.id]?.mfg_process,
  )

  if (eligibleModules.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Shuffle className="h-4 w-4 text-international-orange" />
        <h3 className="text-sm font-semibold text-foreground">
          Explore Alternatives
        </h3>
        <span className="text-xs text-muted-foreground">
          Compare material and process options per module
        </span>
      </div>

      {eligibleModules.map((mod) => (
        <ModuleExplorer
          key={mod.id}
          module={mod}
          diagnosticAnswers={diagnosticAnswers[mod.id] ?? {}}
          aiCostPerUnit={aiCostEstimates?.[mod.id]?.totalPerUnit}
          onApplyAlternative={onApplyAlternative}
        />
      ))}
    </div>
  )
}
