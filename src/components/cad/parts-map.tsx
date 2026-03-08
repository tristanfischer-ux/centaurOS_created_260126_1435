"use client"

/**
 * @file parts-map.tsx — Fullscreen treemap overlay showing individual parts
 * sized proportionally by cost estimate. Visual bill of materials.
 *
 * @description Each cell represents a single part from the AI cost estimates,
 * sized by cost. Parts are colored by parent module and display a type-based
 * placeholder icon (motor, fastener, PCB, etc.). Cells adapt label density
 * based on area: large cells get icon silhouette + label strip, medium get
 * icon + name, tiny get first-letter abbreviation.
 */

import { useMemo, useEffect, useRef, useState, useCallback } from "react"
import {
  X,
  LayoutGrid,
  Cog,
  Bolt,
  CircuitBoard,
  Disc3,
  CircleDot,
  Plug,
  Cylinder,
  Cpu,
  Box,
  Zap,
  Frame,
  Package,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { squarify } from "@/lib/treemap"
import { moduleColorFn, flowFill } from "@/lib/sankey-utils"
import type { CadLabModule, AiCostEstimate } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"

// ─── Types ───────────────────────────────────────────────────────────

interface PartsMapProps {
  modules: CadLabModule[]
  diagnosticAnswers: DiagnosticAnswers
  aiCostEstimates: Record<string, AiCostEstimate>
  subject: string
  open: boolean
  onClose: () => void
  onModuleClick?: (moduleId: string) => void
}

interface FlatPart {
  id: string
  moduleId: string
  moduleName: string
  moduleIndex: number
  name: string
  type: "buy" | "make"
  cost: number
  reasoning: string
}

// ─── Part classification ─────────────────────────────────────────────

type PartCategory =
  | "motor" | "fastener" | "pcb" | "bearing" | "seal"
  | "connector" | "shaft" | "sensor" | "housing" | "power"
  | "gear" | "bracket" | "generic"

const CATEGORY_RULES: { category: PartCategory; pattern: RegExp; Icon: LucideIcon }[] = [
  { category: "motor",     pattern: /motor|stepper|servo|actuator|solenoid/i,          Icon: Cog },
  { category: "fastener",  pattern: /screw|bolt|nut|rivet|washer|\bm[2-9]\b|\bm10\b/i, Icon: Bolt },
  { category: "pcb",       pattern: /pcb|circuit|board|controller|mcu/i,               Icon: CircuitBoard },
  { category: "bearing",   pattern: /bearing|bushing|\b608\b|\b625\b/i,                Icon: Disc3 },
  { category: "seal",      pattern: /o-ring|seal|gasket/i,                             Icon: CircleDot },
  { category: "connector", pattern: /connector|plug|socket|wire|cable/i,               Icon: Plug },
  { category: "shaft",     pattern: /shaft|rod|axle|spindle|\bpin\b/i,                 Icon: Cylinder },
  { category: "sensor",    pattern: /sensor|encoder|thermocouple|switch/i,             Icon: Cpu },
  { category: "housing",   pattern: /housing|enclosure|\bcase\b|cover|\blid\b|panel/i, Icon: Box },
  { category: "power",     pattern: /battery|psu|power supply|capacitor/i,             Icon: Zap },
  { category: "gear",      pattern: /gear|pulley|belt|sprocket/i,                      Icon: Cog },
  { category: "bracket",   pattern: /bracket|mount|frame|plate|rail|support/i,         Icon: Frame },
]

function classifyPart(name: string): { category: PartCategory; Icon: LucideIcon } {
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(name)) return { category: rule.category, Icon: rule.Icon }
  }
  return { category: "generic", Icon: Package }
}

// ─── Cell size tiers (px²) ───────────────────────────────────────────

const LARGE_THRESHOLD = 6_000
const MEDIUM_THRESHOLD = 2_000

// ─── Component ───────────────────────────────────────────────────────

export function PartsMap({
  modules,
  diagnosticAnswers: _diagnosticAnswers,
  aiCostEstimates,
  subject,
  open,
  onClose,
  onModuleClick,
}: PartsMapProps) {
  // Suppress unused-var lint — kept for API compatibility
  void _diagnosticAnswers

  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })

  // Escape key to close
  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open, onClose])

  // Observe container size
  useEffect(() => {
    if (!open || !containerRef.current) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setContainerSize({ w: width, h: height })
      }
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [open])

  // ── Flatten all parts across modules ──
  const flatParts = useMemo(() => {
    const parts: FlatPart[] = []
    modules.forEach((mod, moduleIndex) => {
      const estimate = aiCostEstimates[mod.id]
      if (!estimate?.parts) return
      estimate.parts.forEach((part, partIndex) => {
        if (part.cost <= 0) return
        parts.push({
          id: `${mod.id}-p${partIndex}`,
          moduleId: mod.id,
          moduleName: mod.name,
          moduleIndex,
          name: part.name,
          type: part.type,
          cost: part.cost,
          reasoning: part.reasoning,
        })
      })
    })
    return parts
  }, [modules, aiCostEstimates])

  // ── Module color legend (only modules with parts) ──
  const moduleLegend = useMemo(() => {
    const seen = new Map<string, { name: string; color: string }>()
    for (const part of flatParts) {
      if (!seen.has(part.moduleId)) {
        seen.set(part.moduleId, {
          name: part.moduleName,
          color: moduleColorFn(part.moduleIndex),
        })
      }
    }
    return [...seen.values()]
  }, [flatParts])

  // ── Treemap layout sized by cost ──
  const cells = useMemo(() => {
    if (containerSize.w === 0 || containerSize.h === 0) return []
    const items = flatParts.map((p) => ({ id: p.id, value: p.cost }))
    return squarify(items, { x: 0, y: 0, w: containerSize.w, h: containerSize.h })
  }, [flatParts, containerSize])

  // ── Part lookup by id ──
  const partMap = useMemo(() => {
    const m = new Map<string, FlatPart>()
    for (const p of flatParts) m.set(p.id, p)
    return m
  }, [flatParts])

  // ── Summary stats for title block ──
  const stats = useMemo(() => {
    const totalCost = flatParts.reduce((s, p) => s + p.cost, 0)
    const buyCost = flatParts.reduce((s, p) => (p.type === "buy" ? s + p.cost : s), 0)
    const makeCost = totalCost - buyCost
    const buyCount = flatParts.filter((p) => p.type === "buy").length
    const makeCount = flatParts.length - buyCount
    const estimatedModuleIds = new Set(flatParts.map((p) => p.moduleId))
    return {
      totalParts: flatParts.length,
      totalCost,
      buyCost,
      makeCost,
      buyCount,
      makeCount,
      modulesEstimated: estimatedModuleIds.size,
      totalModules: modules.length,
    }
  }, [flatParts, modules.length])

  const handleCellClick = useCallback(
    (moduleId: string) => {
      onModuleClick?.(moduleId)
    },
    [onModuleClick],
  )

  if (!open) return null

  // ── Empty state: no cost estimates yet ──
  if (flatParts.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-muted-foreground" />
            <h1 className="text-sm font-semibold text-foreground">Parts Map</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="gap-1.5">
            <X className="h-4 w-4" />
            Close
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon={<Package className="h-10 w-10" />}
            title="No parts to display"
            description="Run cost estimation on your modules first."
          />
        </div>
      </div>
    )
  }

  const GAP = 3

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-muted-foreground" />
            <h1 className="text-sm font-semibold text-foreground">
              Parts Map
              {subject && (
                <span className="font-normal text-muted-foreground ml-1.5">
                  — {subject}
                </span>
              )}
            </h1>
          </div>

          {/* Module color legend */}
          {moduleLegend.length > 0 && (
            <div className="hidden sm:flex items-center gap-3 ml-4 pl-4 border-l border-border">
              {moduleLegend.map((entry) => (
                <div key={entry.name} className="flex items-center gap-1.5">
                  <div
                    className="h-2.5 w-2.5 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {entry.name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <Button variant="ghost" size="sm" onClick={onClose} className="gap-1.5">
          <X className="h-4 w-4" />
          Close
        </Button>
      </div>

      {/* ── Treemap area ── */}
      <div className="flex-1 relative overflow-hidden bg-muted/30">
        <div ref={containerRef} className="absolute inset-3">
          {cells.map((cell) => {
            const part = partMap.get(cell.id)
            if (!part) return null

            const area = cell.rect.w * cell.rect.h
            const cellW = Math.max(0, cell.rect.w - GAP)
            const cellH = Math.max(0, cell.rect.h - GAP)
            const modColor = moduleColorFn(part.moduleIndex)
            const iconColor = flowFill(modColor, 0.15)
            const { Icon } = classifyPart(part.name)
            const isLarge = area > LARGE_THRESHOLD
            const isMedium = area > MEDIUM_THRESHOLD

            const tooltipBody = (
              <>
                <p className="font-medium text-xs">{part.name}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Module: {part.moduleName}
                </p>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  £{part.cost.toFixed(2)}
                </p>
                <Badge
                  variant={part.type === "buy" ? "info" : "success"}
                  className="text-[9px] h-4 px-1.5 mt-1"
                >
                  {part.type === "buy" ? "Buy" : "Make"}
                </Badge>
                {part.reasoning && (
                  <p className="text-[10px] text-muted-foreground mt-1 max-w-[200px]">
                    {part.reasoning}
                  </p>
                )}
              </>
            )

            const cellContent = (
              <div
                key={cell.id}
                className={cn(
                  "absolute rounded overflow-hidden bg-card",
                  "cursor-pointer transition-all duration-150",
                  "hover:shadow-lg hover:z-10",
                  "active:scale-[0.995]",
                  "group",
                )}
                style={{
                  left: cell.rect.x + GAP / 2,
                  top: cell.rect.y + GAP / 2,
                  width: cellW,
                  height: cellH,
                  borderLeft: `3px solid ${modColor}`,
                }}
                onClick={() => handleCellClick(part.moduleId)}
              >
                {/* ── Large cell: icon silhouette + gradient label strip ── */}
                {isLarge && (
                  <>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Icon
                        style={{
                          width: Math.min(cellW * 0.4, 80),
                          height: Math.min(cellH * 0.4, 80),
                          color: iconColor,
                        }}
                        strokeWidth={1.5}
                      />
                    </div>
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-card via-card to-transparent pt-6 pb-2 px-2.5">
                      <p className="text-xs font-semibold text-foreground truncate leading-tight">
                        {part.name}
                      </p>
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                          {part.moduleName}
                        </span>
                        <Badge variant="secondary" className="text-[9px] h-4 px-1.5 tabular-nums">
                          £{part.cost.toFixed(0)}
                        </Badge>
                        <Badge
                          variant={part.type === "buy" ? "info" : "success"}
                          className="text-[9px] h-4 px-1.5"
                        >
                          {part.type === "buy" ? "Buy" : "Make"}
                        </Badge>
                      </div>
                    </div>
                  </>
                )}

                {/* ── Medium cell: icon + part name ── */}
                {!isLarge && isMedium && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-1.5 gap-1">
                    <Icon
                      style={{
                        width: Math.min(cellW * 0.3, 28),
                        height: Math.min(cellH * 0.3, 28),
                        color: iconColor,
                      }}
                      strokeWidth={1.5}
                    />
                    <p className="text-[10px] font-medium text-foreground truncate w-full text-center px-1">
                      {part.name}
                    </p>
                  </div>
                )}

                {/* ── Tiny cell: first letter abbreviation ── */}
                {!isLarge && !isMedium && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[9px] font-bold text-muted-foreground">
                      {part.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}

                {/* ── Hover border ── */}
                <div className="absolute inset-0 rounded border border-border group-hover:border-foreground/30 transition-colors pointer-events-none" />
              </div>
            )

            return (
              <Tooltip key={cell.id}>
                <TooltipTrigger asChild>{cellContent}</TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  {tooltipBody}
                </TooltipContent>
              </Tooltip>
            )
          })}

          {/* ── Title block (bottom-right) ── */}
          <div className="absolute bottom-2 right-2 bg-card border border-border rounded px-3 py-2 shadow-lg">
            <p className="text-[10px] font-semibold text-foreground uppercase tracking-wider mb-1">
              {subject || "Product"}
            </p>
            <div className="space-y-0.5 text-[10px] text-muted-foreground tabular-nums">
              <p>{stats.totalParts} part{stats.totalParts !== 1 ? "s" : ""}</p>
              <p>
                {stats.modulesEstimated} of {stats.totalModules} module{stats.totalModules !== 1 ? "s" : ""} estimated
              </p>
              <p>£{stats.totalCost.toFixed(2)} total</p>
              <p>
                {stats.buyCount} buy (£{stats.buyCost.toFixed(0)}) · {stats.makeCount} make (£{stats.makeCost.toFixed(0)})
              </p>
              <p>
                {new Date().toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
