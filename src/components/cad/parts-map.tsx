"use client"

/**
 * @file parts-map.tsx — Fullscreen treemap overlay showing all product modules
 * sized proportionally by mass/volume.
 *
 * @description Opens as a fixed overlay from the Specify Overview tab. Each cell
 * shows a module's name, mass, manufacturing process, and optionally its generated
 * image. Cells are color-coded by manufacturing process using the shared CAT_COLORS
 * palette. Clicking a cell navigates to the Module Specs tab with that module expanded.
 */

import { useState, useMemo, useEffect, useRef, useCallback } from "react"
import { X, LayoutGrid } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { squarify } from "@/lib/treemap"
import { CAT_COLORS } from "@/lib/sankey-utils"
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

// ─── Helpers ─────────────────────────────────────────────────────────

/** Extract the best available size metric for a module. */
function getModuleSize(mod: CadLabModule): number {
  // 1. BBox volume (mm³) — most accurate, only after CAD gen
  if (mod.result?.bbox) {
    const { xLen, yLen, zLen } = mod.result.bbox
    const vol = xLen * yLen * zLen
    if (vol > 0) return vol
  }
  // 2. Mass from CAD execution (grams → kg)
  if (mod.result?.massGrams && mod.result.massGrams > 0) {
    return mod.result.massGrams / 1000
  }
  // 3. AI-estimated mass (most common, from decomposition)
  if (mod.estimatedMassKg && mod.estimatedMassKg > 0) {
    return mod.estimatedMassKg
  }
  // 4. Equal sizing fallback
  return 1.0
}

/** Format mass display. */
function formatMass(mod: CadLabModule): string | null {
  if (mod.result?.massGrams && mod.result.massGrams > 0) {
    return `${(mod.result.massGrams / 1000).toFixed(2)} kg`
  }
  if (mod.estimatedMassKg && mod.estimatedMassKg > 0) {
    return `~${mod.estimatedMassKg.toFixed(2)} kg`
  }
  return null
}

/** Build a stable process → color map for current modules. */
function buildProcessColorMap(
  modules: CadLabModule[],
  diagnosticAnswers: DiagnosticAnswers,
): Map<string, string> {
  const processes = new Set<string>()
  for (const mod of modules) {
    const proc = diagnosticAnswers[mod.id]?.mfg_process
    if (proc) processes.add(proc)
  }
  const sorted = [...processes].sort()
  const map = new Map<string, string>()
  sorted.forEach((proc, i) => {
    map.set(proc, CAT_COLORS[i % CAT_COLORS.length])
  })
  return map
}

// ─── Cell size tiers ─────────────────────────────────────────────────

const LARGE_THRESHOLD = 25_000  // px²
const MEDIUM_THRESHOLD = 8_000
const SMALL_THRESHOLD = 2_000

// ─── Component ───────────────────────────────────────────────────────

export function PartsMap({
  modules,
  diagnosticAnswers,
  aiCostEstimates,
  subject,
  open,
  onClose,
  onModuleClick,
}: PartsMapProps) {
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

  // Process → color mapping
  const processColors = useMemo(
    () => buildProcessColorMap(modules, diagnosticAnswers),
    [modules, diagnosticAnswers],
  )

  // Compute treemap cells
  const cells = useMemo(() => {
    if (containerSize.w === 0 || containerSize.h === 0) return []
    const items = modules.map((mod) => ({
      id: mod.id,
      value: getModuleSize(mod),
    }))
    return squarify(items, { x: 0, y: 0, w: containerSize.w, h: containerSize.h })
  }, [modules, containerSize])

  // Total estimated mass for title block
  const totalMass = useMemo(() => {
    let sum = 0
    let hasAny = false
    for (const mod of modules) {
      if (mod.result?.massGrams && mod.result.massGrams > 0) {
        sum += mod.result.massGrams / 1000
        hasAny = true
      } else if (mod.estimatedMassKg && mod.estimatedMassKg > 0) {
        sum += mod.estimatedMassKg
        hasAny = true
      }
    }
    return hasAny ? sum : null
  }, [modules])

  // Module lookup
  const moduleMap = useMemo(() => {
    const m = new Map<string, CadLabModule>()
    for (const mod of modules) m.set(mod.id, mod)
    return m
  }, [modules])

  const handleCellClick = useCallback(
    (moduleId: string) => {
      onModuleClick?.(moduleId)
    },
    [onModuleClick],
  )

  if (!open) return null

  const GAP = 2 // px gap between cells

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

          {/* Process color legend */}
          {processColors.size > 0 && (
            <div className="hidden sm:flex items-center gap-3 ml-4 pl-4 border-l border-border">
              {[...processColors.entries()].map(([proc, color]) => (
                <div key={proc} className="flex items-center gap-1.5">
                  <div
                    className="h-2.5 w-2.5 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {proc}
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
      <div className="flex-1 relative overflow-hidden">
        {/* Faint engineering grid background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(to right, hsl(var(--border) / 0.04) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border) / 0.04) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        <div ref={containerRef} className="absolute inset-4">
          {cells.map((cell) => {
            const mod = moduleMap.get(cell.id)
            if (!mod) return null

            const area = cell.rect.w * cell.rect.h
            const process = diagnosticAnswers[mod.id]?.mfg_process
            const borderColor = process
              ? processColors.get(process)
              : undefined
            const mass = formatMass(mod)
            const cost = aiCostEstimates[mod.id]?.totalPerUnit
            const isLarge = area > LARGE_THRESHOLD
            const isMedium = area > MEDIUM_THRESHOLD
            const isSmall = area > SMALL_THRESHOLD

            const cellContent = (
              <div
                key={cell.id}
                className={cn(
                  "absolute bg-card border border-border rounded-sm overflow-hidden",
                  "cursor-pointer transition-all duration-150",
                  "hover:shadow-md hover:z-10 hover:border-foreground/30",
                  "active:scale-[0.995]",
                  "flex flex-col",
                )}
                style={{
                  left: cell.rect.x + GAP / 2,
                  top: cell.rect.y + GAP / 2,
                  width: Math.max(0, cell.rect.w - GAP),
                  height: Math.max(0, cell.rect.h - GAP),
                  borderLeftWidth: borderColor ? 3 : undefined,
                  borderLeftColor: borderColor ?? undefined,
                }}
                onClick={() => handleCellClick(cell.id)}
              >
                {/* Large cell: image + name + badges */}
                {isLarge && (
                  <div className="flex-1 flex flex-col p-2.5 min-h-0">
                    {mod.imageUrl && mod.imageStatus === "complete" && (
                      <div className="flex-1 min-h-0 mb-2 rounded-sm overflow-hidden bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={mod.imageUrl}
                          alt={mod.name}
                          className="w-full h-full object-contain"
                        />
                      </div>
                    )}
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-foreground truncate">
                        {mod.name}
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {mass && (
                          <Badge variant="secondary" className="text-[10px] tabular-nums">
                            {mass}
                          </Badge>
                        )}
                        {process && (
                          <Badge variant="secondary" className="text-[10px]">
                            {process}
                          </Badge>
                        )}
                        {cost !== undefined && (
                          <Badge variant="secondary" className="text-[10px] tabular-nums">
                            ${cost.toFixed(0)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Medium cell: name + mass */}
                {!isLarge && isMedium && (
                  <div className="flex-1 flex flex-col justify-center p-2">
                    <p className="text-xs font-medium text-foreground truncate">
                      {mod.name}
                    </p>
                    {mass && (
                      <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                        {mass}
                      </p>
                    )}
                  </div>
                )}

                {/* Small cell: name only */}
                {!isLarge && !isMedium && isSmall && (
                  <div className="flex-1 flex items-center justify-center p-1">
                    <p className="text-[10px] text-foreground truncate px-1">
                      {mod.name}
                    </p>
                  </div>
                )}

                {/* Tiny cell: single initial */}
                {!isSmall && (
                  <div className="flex-1 flex items-center justify-center">
                    <span className="text-[9px] font-medium text-muted-foreground">
                      {mod.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
            )

            // Wrap tiny/small cells in tooltip
            if (!isMedium) {
              return (
                <Tooltip key={cell.id}>
                  <TooltipTrigger asChild>{cellContent}</TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p className="font-medium text-xs">{mod.name}</p>
                    {mass && (
                      <p className="text-[11px] text-muted-foreground tabular-nums">
                        {mass}
                      </p>
                    )}
                    {process && (
                      <p className="text-[11px] text-muted-foreground">
                        {process}
                      </p>
                    )}
                    {cost !== undefined && (
                      <p className="text-[11px] text-muted-foreground tabular-nums">
                        ${cost.toFixed(2)} / unit
                      </p>
                    )}
                  </TooltipContent>
                </Tooltip>
              )
            }

            return cellContent
          })}

          {/* ── Title block (bottom-right) ── */}
          <div className="absolute bottom-2 right-2 bg-card border border-border rounded-sm px-3 py-2 shadow-sm">
            <p className="text-[10px] font-semibold text-foreground uppercase tracking-wider mb-1">
              {subject || "Product"}
            </p>
            <div className="space-y-0.5 text-[10px] text-muted-foreground tabular-nums">
              <p>{modules.length} module{modules.length !== 1 ? "s" : ""}</p>
              {totalMass !== null && <p>~{totalMass.toFixed(2)} kg est.</p>}
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
