/**
 * @file shortlist-coverage-flow.tsx — 3-column procurement flow diagram.
 *
 * @description Decomposes modules into requirement groups (by process/material/buy-make)
 * and maps them to shortlisted suppliers. Renders CSS flex columns with SVG Bézier edges.
 *
 * FLOW: source/page.tsx → CadLabShortlist → this component
 */

"use client"

import { useMemo, useState, useCallback, useRef, useLayoutEffect } from "react"
import { AlertTriangle, BadgeCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CadLabModule, AiCostEstimate } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "./cad-lab-diagnostics"
import type { ShortlistedSupplier } from "@/app/(platform)/the-forge/cad-lab/source/page"

// ─── Types ──────────────────────────────────────────────────────────

interface RequirementGroup {
  id: string
  process: string
  material: string
  type: "buy" | "make"
  label: string
  parts: { name: string; moduleId: string; moduleName: string }[]
  supplierIds: string[]
}

export interface ShortlistCoverageFlowProps {
  modules: CadLabModule[]
  suppliers: ShortlistedSupplier[]
  diagnosticAnswers?: DiagnosticAnswers
  aiCostEstimates?: Record<string, AiCostEstimate>
}

// ─── Color helpers (same as supply-flow-diagram.tsx) ─────────────────

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-6))",
]

function chipColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return CHART_COLORS[h % CHART_COLORS.length]
}

// ─── Build requirement groups ───────────────────────────────────────

function buildGroups(
  modules: CadLabModule[],
  suppliers: ShortlistedSupplier[],
  diagnosticAnswers?: DiagnosticAnswers,
  aiCostEstimates?: Record<string, AiCostEstimate>,
): RequirementGroup[] {
  const groupMap = new Map<string, RequirementGroup>()

  // Set of module IDs each supplier covers
  const supplierModuleMap = new Map<string, Set<string>>()
  for (const sup of suppliers) {
    supplierModuleMap.set(sup.id, new Set(sup.moduleIds))
  }

  for (const mod of modules) {
    const diag = diagnosticAnswers?.[mod.id]
    const costEstimate = aiCostEstimates?.[mod.id]
    const hasParts = costEstimate?.parts && costEstimate.parts.length > 0

    if (hasParts) {
      // INTENT: When AI cost data is available, group parts individually by their
      // process/material/buy-make characteristics — parts from different modules
      // sharing the same traits end up in the same group.
      for (const part of costEstimate.parts!) {
        const process = part.type === "buy" ? "Buy" : (diag?.mfg_process ?? "Unknown Process")
        const material = part.type === "buy" ? "Off-the-shelf" : (diag?.material ?? "Unknown Material")
        const key = `${process}-${material}-${part.type}`.toLowerCase().replace(/\s+/g, "_")

        let group = groupMap.get(key)
        if (!group) {
          const label = part.type === "buy"
            ? "Buy \u00b7 Off-the-shelf"
            : `${process} \u00b7 ${material}`
          group = { id: key, process, material, type: part.type, label, parts: [], supplierIds: [] }
          groupMap.set(key, group)
        }
        group.parts.push({ name: part.name, moduleId: mod.id, moduleName: mod.name })
      }
    } else {
      // Fallback: all keyParts in a module share the module's diagnostic process/material
      const process = diag?.mfg_process ?? "Unknown Process"
      const material = diag?.material ?? "Unknown Material"
      const type = "make" as const
      const key = `${process}-${material}-${type}`.toLowerCase().replace(/\s+/g, "_")

      let group = groupMap.get(key)
      if (!group) {
        const label = `${process} \u00b7 ${material}`
        group = { id: key, process, material, type, label, parts: [], supplierIds: [] }
        groupMap.set(key, group)
      }
      for (const part of mod.keyParts) {
        group.parts.push({ name: part, moduleId: mod.id, moduleName: mod.name })
      }
    }
  }

  // Map suppliers to groups: a supplier covers a group when any of its moduleIds
  // contributes parts to that group.
  for (const group of groupMap.values()) {
    const contributingModuleIds = new Set(group.parts.map((p) => p.moduleId))
    const matchedSupplierIds = new Set<string>()
    for (const [supplierId, moduleSet] of supplierModuleMap) {
      for (const mid of contributingModuleIds) {
        if (moduleSet.has(mid)) {
          matchedSupplierIds.add(supplierId)
          break
        }
      }
    }
    group.supplierIds = [...matchedSupplierIds]
  }

  return [...groupMap.values()]
}

// ─── Edge position types ────────────────────────────────────────────

interface CardRect {
  id: string
  top: number
  bottom: number
  right: number
  left: number
  centerY: number
}

// ─── Component ──────────────────────────────────────────────────────

export function ShortlistCoverageFlow({
  modules,
  suppliers,
  diagnosticAnswers,
  aiCostEstimates,
}: ShortlistCoverageFlowProps): React.ReactNode {
  const containerRef = useRef<HTMLDivElement>(null)
  const moduleRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const groupRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const supplierRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [edgePositions, setEdgePositions] = useState<{
    moduleToGroup: { from: CardRect; to: CardRect; moduleId: string; groupId: string }[]
    groupToSupplier: { from: CardRect; to: CardRect; groupId: string; supplierId: string }[]
    containerRect: DOMRect | null
  }>({ moduleToGroup: [], groupToSupplier: [], containerRect: null })

  const groups = useMemo(
    () => buildGroups(modules, suppliers, diagnosticAnswers, aiCostEstimates),
    [modules, suppliers, diagnosticAnswers, aiCostEstimates],
  )

  // Unique supplier IDs that appear in at least one group
  const connectedSupplierIds = useMemo(() => {
    const set = new Set<string>()
    for (const g of groups) for (const sid of g.supplierIds) set.add(sid)
    return set
  }, [groups])

  // Coverage stats
  const coveredCount = useMemo(() => {
    const coveredModuleIds = new Set<string>()
    for (const g of groups) {
      if (g.supplierIds.length > 0) {
        for (const p of g.parts) coveredModuleIds.add(p.moduleId)
      }
    }
    return coveredModuleIds.size
  }, [groups])

  // ── Build edges from module cards to group cards ──
  // Each module connects to every group that contains one of its parts
  const moduleGroupLinks = useMemo(() => {
    const links: { moduleId: string; groupId: string }[] = []
    const seen = new Set<string>()
    for (const group of groups) {
      for (const part of group.parts) {
        const key = `${part.moduleId}→${group.id}`
        if (!seen.has(key)) {
          seen.add(key)
          links.push({ moduleId: part.moduleId, groupId: group.id })
        }
      }
    }
    return links
  }, [groups])

  // Group → supplier links
  const groupSupplierLinks = useMemo(() => {
    const links: { groupId: string; supplierId: string }[] = []
    for (const group of groups) {
      for (const sid of group.supplierIds) {
        links.push({ groupId: group.id, supplierId: sid })
      }
    }
    return links
  }, [groups])

  // ── Hover connectivity ──
  const connectedToHover = useMemo(() => {
    if (!hoveredId) return null
    const connected = new Set<string>([hoveredId])
    // Module hovered → find groups → find suppliers
    for (const link of moduleGroupLinks) {
      if (link.moduleId === hoveredId) {
        connected.add(`group-${link.groupId}`)
        // Also connect suppliers of that group
        const group = groups.find((g) => g.id === link.groupId)
        if (group) for (const sid of group.supplierIds) connected.add(`supplier-${sid}`)
      }
    }
    // Group hovered → find modules and suppliers
    const gid = hoveredId.replace("group-", "")
    for (const link of moduleGroupLinks) {
      if (link.groupId === gid) connected.add(link.moduleId)
    }
    for (const link of groupSupplierLinks) {
      if (link.groupId === gid) connected.add(`supplier-${link.supplierId}`)
    }
    // Supplier hovered → find groups → find modules
    const sid = hoveredId.replace("supplier-", "")
    for (const link of groupSupplierLinks) {
      if (link.supplierId === sid) {
        connected.add(`group-${link.groupId}`)
        // Also find modules for that group
        for (const ml of moduleGroupLinks) {
          if (ml.groupId === link.groupId) connected.add(ml.moduleId)
        }
      }
    }
    return connected
  }, [hoveredId, moduleGroupLinks, groupSupplierLinks, groups])

  const getOpacity = useCallback(
    (cardId: string) => {
      if (!connectedToHover) return 1
      return connectedToHover.has(cardId) ? 1 : 0.2
    },
    [connectedToHover],
  )

  // ── Measure card positions for SVG edges ──
  const measurePositions = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    const containerRect = container.getBoundingClientRect()

    const getRect = (el: HTMLDivElement | undefined): CardRect | null => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return {
        id: "",
        top: r.top - containerRect.top,
        bottom: r.bottom - containerRect.top,
        right: r.right - containerRect.left,
        left: r.left - containerRect.left,
        centerY: (r.top + r.bottom) / 2 - containerRect.top,
      }
    }

    const mtg: { from: CardRect; to: CardRect; moduleId: string; groupId: string }[] = []
    for (const link of moduleGroupLinks) {
      const from = getRect(moduleRefs.current.get(link.moduleId))
      const to = getRect(groupRefs.current.get(link.groupId))
      if (from && to) {
        mtg.push({ from, to, moduleId: link.moduleId, groupId: link.groupId })
      }
    }

    const gts: { from: CardRect; to: CardRect; groupId: string; supplierId: string }[] = []
    for (const link of groupSupplierLinks) {
      const from = getRect(groupRefs.current.get(link.groupId))
      const to = getRect(supplierRefs.current.get(link.supplierId))
      if (from && to) {
        gts.push({ from, to, groupId: link.groupId, supplierId: link.supplierId })
      }
    }

    setEdgePositions({ moduleToGroup: mtg, groupToSupplier: gts, containerRect })
  }, [moduleGroupLinks, groupSupplierLinks])

  useLayoutEffect(() => {
    measurePositions()
    const observer = new ResizeObserver(measurePositions)
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [measurePositions, modules, groups, suppliers])

  if (modules.length === 0) return null

  return (
    <div className="rounded-lg border p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">Procurement Flow</span>
        <span className="text-[10px] font-medium text-muted-foreground">
          {coveredCount} of {modules.length} module{modules.length !== 1 ? "s" : ""} covered
        </span>
      </div>

      {/* 3-column layout with SVG overlay */}
      <div ref={containerRef} className="relative">
        {/* SVG edge overlay */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 1 }}
        >
          {/* Module → Group edges */}
          {edgePositions.moduleToGroup.map((edge, i) => {
            const x1 = edge.from.right
            const y1 = edge.from.centerY
            const x2 = edge.to.left
            const y2 = edge.to.centerY
            const mx = (x1 + x2) / 2
            const isHighlighted = !connectedToHover
              || (connectedToHover.has(edge.moduleId) && connectedToHover.has(`group-${edge.groupId}`))

            return (
              <path
                key={`mg-${i}`}
                d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke={chipColor(edge.moduleId)}
                strokeWidth={1.5}
                opacity={isHighlighted ? 0.5 : 0.08}
                className="transition-opacity duration-200"
              />
            )
          })}
          {/* Group → Supplier edges */}
          {edgePositions.groupToSupplier.map((edge, i) => {
            const x1 = edge.from.right
            const y1 = edge.from.centerY
            const x2 = edge.to.left
            const y2 = edge.to.centerY
            const mx = (x1 + x2) / 2
            const isHighlighted = !connectedToHover
              || (connectedToHover.has(`group-${edge.groupId}`) && connectedToHover.has(`supplier-${edge.supplierId}`))

            return (
              <path
                key={`gs-${i}`}
                d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke={chipColor(edge.groupId)}
                strokeWidth={1.5}
                opacity={isHighlighted ? 0.5 : 0.08}
                className="transition-opacity duration-200"
              />
            )
          })}
        </svg>

        {/* 3-column grid */}
        <div className="grid grid-cols-3 gap-6" style={{ position: "relative", zIndex: 2 }}>
          {/* Column 1: Modules */}
          <div className="space-y-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Modules
            </p>
            {modules.map((mod) => {
              const diag = diagnosticAnswers?.[mod.id]
              const isUncovered = !groups.some(
                (g) => g.supplierIds.length > 0 && g.parts.some((p) => p.moduleId === mod.id),
              )
              return (
                <div
                  key={mod.id}
                  ref={(el) => { if (el) moduleRefs.current.set(mod.id, el); else moduleRefs.current.delete(mod.id) }}
                  className={cn(
                    "rounded-md border p-2 transition-opacity duration-200 bg-card",
                    isUncovered && "border-destructive/30 bg-destructive/5",
                  )}
                  style={{ opacity: getOpacity(mod.id) }}
                  onMouseEnter={() => setHoveredId(mod.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <div className="flex items-center gap-1.5">
                    {isUncovered && <AlertTriangle className="h-3 w-3 text-destructive flex-shrink-0" />}
                    <span className="text-xs font-semibold text-foreground truncate">{mod.name}</span>
                  </div>
                  {mod.keyParts.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {mod.keyParts.slice(0, 5).map((part, i) => (
                        <li key={i} className="text-[10px] text-muted-foreground truncate pl-2">
                          {part}
                        </li>
                      ))}
                      {mod.keyParts.length > 5 && (
                        <li className="text-[10px] text-muted-foreground pl-2">
                          +{mod.keyParts.length - 5} more
                        </li>
                      )}
                    </ul>
                  )}
                  {diag?.mfg_process && (
                    <span className="mt-1 inline-block text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-mono">
                      {diag.mfg_process}{diag.material ? ` \u00b7 ${diag.material}` : ""}
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Column 2: Requirement Groups */}
          <div className="space-y-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Requirement Groups
            </p>
            {groups.map((group) => {
              const isUncovered = group.supplierIds.length === 0
              const cardId = `group-${group.id}`
              return (
                <div
                  key={group.id}
                  ref={(el) => { if (el) groupRefs.current.set(group.id, el); else groupRefs.current.delete(group.id) }}
                  className={cn(
                    "rounded-md border p-2 transition-opacity duration-200 bg-card",
                    isUncovered && "border-destructive/30 bg-destructive/5",
                  )}
                  style={{ opacity: getOpacity(cardId) }}
                  onMouseEnter={() => setHoveredId(cardId)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isUncovered && <AlertTriangle className="h-3 w-3 text-destructive flex-shrink-0" />}
                      <span className="text-xs font-semibold text-foreground truncate">{group.label}</span>
                    </div>
                    <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground flex-shrink-0">
                      {group.parts.length} part{group.parts.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {group.parts.slice(0, 4).map((part, i) => (
                      <li key={i} className="text-[10px] text-muted-foreground truncate pl-2">
                        {part.name}{" "}
                        <span className="text-muted-foreground/60">({part.moduleName})</span>
                      </li>
                    ))}
                    {group.parts.length > 4 && (
                      <li className="text-[10px] text-muted-foreground pl-2">
                        +{group.parts.length - 4} more
                      </li>
                    )}
                  </ul>
                  {isUncovered && (
                    <p className="mt-1 text-[9px] text-destructive font-medium">No supplier</p>
                  )}
                </div>
              )
            })}
          </div>

          {/* Column 3: Suppliers */}
          <div className="space-y-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Suppliers
            </p>
            {suppliers
              .filter((s) => connectedSupplierIds.has(s.id))
              .map((supplier) => {
                const cardId = `supplier-${supplier.id}`
                return (
                  <div
                    key={supplier.id}
                    ref={(el) => { if (el) supplierRefs.current.set(supplier.id, el); else supplierRefs.current.delete(supplier.id) }}
                    className="rounded-md border p-2 transition-opacity duration-200 bg-card"
                    style={{ opacity: getOpacity(cardId) }}
                    onMouseEnter={() => setHoveredId(cardId)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-foreground truncate">{supplier.name}</span>
                      {supplier.isVerified && (
                        <BadgeCheck className="h-3 w-3 text-status-success flex-shrink-0" />
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {Math.round(supplier.bestMatchScore)}% match
                    </span>
                  </div>
                )
              })}
            {/* Uncovered groups hint */}
            {groups.some((g) => g.supplierIds.length === 0) && (
              <div className="rounded-md border border-dashed border-destructive/30 p-2 text-center">
                <p className="text-[10px] text-destructive">Uncovered groups need suppliers</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
