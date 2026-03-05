/**
 * @file supplier-procurement-flow.tsx — 3-column procurement flow on Suppliers tab.
 *
 * @description Interactive diagram: Modules → Component Groups → Matched Suppliers.
 * Auto-selects top 3 suppliers by match score after matching completes.
 * Replaces CadLabSupplyChain on the Suppliers tab for visual discovery.
 *
 * FLOW: source/page.tsx → this component (Suppliers tab)
 */

"use client"

import {
  useMemo,
  useState,
  useCallback,
  useRef,
  useLayoutEffect,
  useEffect,
} from "react"
import {
  AlertTriangle,
  BadgeCheck,
  Search,
  Loader2,
  Plus,
  Check,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { CadLabModule, AiCostEstimate } from "@/lib/cad-lab-types"
import type { CadLabSupplierMatch } from "@/actions/cad-lab-supplier-match"
import type { DiagnosticAnswers } from "./cad-lab-diagnostics"

// ─── Types ──────────────────────────────────────────────────────────

interface RequirementGroup {
  id: string
  process: string
  material: string
  type: "buy" | "make"
  label: string
  parts: { name: string; moduleId: string; moduleName: string }[]
}

export interface SupplierProcurementFlowProps {
  modules: CadLabModule[]
  diagnosticAnswers?: DiagnosticAnswers
  aiCostEstimates?: Record<string, AiCostEstimate>
  supplierMatches: Map<string, CadLabSupplierMatch[]>
  loadingModules: Set<string>
  matchAllLoading: boolean
  onMatchModule: (mod: CadLabModule) => void
  onMatchAll: () => void
  shortlistedSupplierIds: Set<string>
  onShortlistSupplier: (supplier: CadLabSupplierMatch, moduleId: string) => void
}

/** Deduplicated supplier with best score and aggregated module IDs */
interface UniqueSupplier {
  id: string
  name: string
  isVerified: boolean
  bestScore: number
  moduleIds: string[]
  /** Keep the original match object for the onShortlistSupplier callback */
  originalMatch: CadLabSupplierMatch
  /** First moduleId that matched — used for the shortlist callback */
  firstModuleId: string
}

// ─── Color helpers (same as shortlist-coverage-flow) ─────────────────

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
  diagnosticAnswers?: DiagnosticAnswers,
  aiCostEstimates?: Record<string, AiCostEstimate>,
): RequirementGroup[] {
  const groupMap = new Map<string, RequirementGroup>()

  for (const mod of modules) {
    const diag = diagnosticAnswers?.[mod.id]
    const costEstimate = aiCostEstimates?.[mod.id]
    const hasParts = costEstimate?.parts && costEstimate.parts.length > 0

    if (hasParts) {
      for (const part of costEstimate.parts!) {
        const process = part.type === "buy" ? "Buy" : (diag?.mfg_process ?? "Unknown Process")
        const material = part.type === "buy" ? "Off-the-shelf" : (diag?.material ?? "Unknown Material")
        const key = `${process}-${material}-${part.type}`.toLowerCase().replace(/\s+/g, "_")

        let group = groupMap.get(key)
        if (!group) {
          const label = part.type === "buy"
            ? "Buy \u00b7 Off-the-shelf"
            : `${process} \u00b7 ${material}`
          group = { id: key, process, material, type: part.type, label, parts: [] }
          groupMap.set(key, group)
        }
        group.parts.push({ name: part.name, moduleId: mod.id, moduleName: mod.name })
      }
    } else {
      const process = diag?.mfg_process ?? "Unknown Process"
      const material = diag?.material ?? "Unknown Material"
      const type = "make" as const
      const key = `${process}-${material}-${type}`.toLowerCase().replace(/\s+/g, "_")

      let group = groupMap.get(key)
      if (!group) {
        const label = `${process} \u00b7 ${material}`
        group = { id: key, process, material, type, label, parts: [] }
        groupMap.set(key, group)
      }
      for (const part of mod.keyParts) {
        group.parts.push({ name: part, moduleId: mod.id, moduleName: mod.name })
      }
    }
  }

  return [...groupMap.values()]
}

// ─── Build unique suppliers from matches map ────────────────────────

function buildUniqueSuppliers(
  supplierMatches: Map<string, CadLabSupplierMatch[]>,
): UniqueSupplier[] {
  const map = new Map<string, UniqueSupplier>()

  for (const [moduleId, matches] of supplierMatches) {
    for (const match of matches) {
      const existing = map.get(match.id)
      if (existing) {
        if (match.matchScore > existing.bestScore) {
          existing.bestScore = match.matchScore
          existing.originalMatch = match
        }
        if (!existing.moduleIds.includes(moduleId)) {
          existing.moduleIds.push(moduleId)
        }
      } else {
        map.set(match.id, {
          id: match.id,
          name: match.name,
          isVerified: match.isVerified,
          bestScore: match.matchScore,
          moduleIds: [moduleId],
          originalMatch: match,
          firstModuleId: moduleId,
        })
      }
    }
  }

  // Sort by best score descending
  return [...map.values()].sort((a, b) => b.bestScore - a.bestScore)
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

export function SupplierProcurementFlow({
  modules,
  diagnosticAnswers,
  aiCostEstimates,
  supplierMatches,
  loadingModules,
  matchAllLoading,
  onMatchModule,
  onMatchAll,
  shortlistedSupplierIds,
  onShortlistSupplier,
}: SupplierProcurementFlowProps): React.ReactNode {
  const containerRef = useRef<HTMLDivElement>(null)
  const moduleRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const groupRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const supplierRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [edgePositions, setEdgePositions] = useState<{
    moduleToGroup: { from: CardRect; to: CardRect; moduleId: string; groupId: string }[]
    groupToSupplier: { from: CardRect; to: CardRect; groupId: string; supplierId: string }[]
  }>({ moduleToGroup: [], groupToSupplier: [] })

  const groups = useMemo(
    () => buildGroups(modules, diagnosticAnswers, aiCostEstimates),
    [modules, diagnosticAnswers, aiCostEstimates],
  )

  const uniqueSuppliers = useMemo(
    () => buildUniqueSuppliers(supplierMatches),
    [supplierMatches],
  )

  const matchedModuleCount = supplierMatches.size

  // ── Map suppliers to groups ──
  // A supplier covers a group when any of its moduleIds contributes parts to that group
  const groupSupplierMap = useMemo(() => {
    const result = new Map<string, string[]>()
    for (const group of groups) {
      const contributingModuleIds = new Set(group.parts.map((p) => p.moduleId))
      const matchedSupplierIds = new Set<string>()
      for (const supplier of uniqueSuppliers) {
        for (const mid of supplier.moduleIds) {
          if (contributingModuleIds.has(mid)) {
            matchedSupplierIds.add(supplier.id)
            break
          }
        }
      }
      result.set(group.id, [...matchedSupplierIds])
    }
    return result
  }, [groups, uniqueSuppliers])

  // ── Build edge links ──
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

  const groupSupplierLinks = useMemo(() => {
    const links: { groupId: string; supplierId: string }[] = []
    for (const [groupId, supplierIds] of groupSupplierMap) {
      for (const sid of supplierIds) {
        links.push({ groupId, supplierId: sid })
      }
    }
    return links
  }, [groupSupplierMap])

  // ── Hover connectivity ──
  const connectedToHover = useMemo(() => {
    if (!hoveredId) return null
    const connected = new Set<string>([hoveredId])

    // Module hovered → find groups → find suppliers
    for (const link of moduleGroupLinks) {
      if (link.moduleId === hoveredId) {
        connected.add(`group-${link.groupId}`)
        const sids = groupSupplierMap.get(link.groupId)
        if (sids) for (const sid of sids) connected.add(`supplier-${sid}`)
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
        for (const ml of moduleGroupLinks) {
          if (ml.groupId === link.groupId) connected.add(ml.moduleId)
        }
      }
    }
    return connected
  }, [hoveredId, moduleGroupLinks, groupSupplierLinks, groupSupplierMap])

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

    const mtg: typeof edgePositions.moduleToGroup = []
    for (const link of moduleGroupLinks) {
      const from = getRect(moduleRefs.current.get(link.moduleId))
      const to = getRect(groupRefs.current.get(link.groupId))
      if (from && to) {
        mtg.push({ from, to, moduleId: link.moduleId, groupId: link.groupId })
      }
    }

    const gts: typeof edgePositions.groupToSupplier = []
    for (const link of groupSupplierLinks) {
      const from = getRect(groupRefs.current.get(link.groupId))
      const to = getRect(supplierRefs.current.get(link.supplierId))
      if (from && to) {
        gts.push({ from, to, groupId: link.groupId, supplierId: link.supplierId })
      }
    }

    setEdgePositions({ moduleToGroup: mtg, groupToSupplier: gts })
  }, [moduleGroupLinks, groupSupplierLinks])

  useLayoutEffect(() => {
    measurePositions()
    const observer = new ResizeObserver(measurePositions)
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [measurePositions, modules, groups, uniqueSuppliers])

  // ── Auto-select top 3 suppliers after matching ──
  // INTENT: Guard with matchKey ref to prevent re-triggering on the same set
  const autoSelectKeyRef = useRef<string>("")

  useEffect(() => {
    if (uniqueSuppliers.length === 0) return

    // Build a stable key from the current match state
    const matchKey = [...supplierMatches.keys()].sort().join(",")
    if (matchKey === autoSelectKeyRef.current) return
    autoSelectKeyRef.current = matchKey

    // Find top 3 not already shortlisted
    const toAutoSelect = uniqueSuppliers
      .filter((s) => !shortlistedSupplierIds.has(s.id))
      .slice(0, 3)

    for (const supplier of toAutoSelect) {
      onShortlistSupplier(supplier.originalMatch, supplier.firstModuleId)
    }
  }, [uniqueSuppliers, supplierMatches, shortlistedSupplierIds, onShortlistSupplier])

  if (modules.length === 0) return null

  return (
    <div className="rounded-lg border p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-foreground">Procurement Flow</span>
          <span className="text-[10px] font-medium text-muted-foreground">
            {matchedModuleCount} of {modules.length} module{modules.length !== 1 ? "s" : ""} matched
          </span>
        </div>
        <Button
          variant="default"
          size="sm"
          className="gap-1.5 h-7 text-xs"
          onClick={onMatchAll}
          disabled={matchAllLoading || modules.length === 0}
        >
          {matchAllLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
          Match All Modules
        </Button>
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
              const isLoading = loadingModules.has(mod.id)
              const hasMatches = supplierMatches.has(mod.id)
              return (
                <div
                  key={mod.id}
                  ref={(el) => { if (el) moduleRefs.current.set(mod.id, el); else moduleRefs.current.delete(mod.id) }}
                  className={cn(
                    "rounded-md border p-2 transition-opacity duration-200 bg-card",
                    !hasMatches && !isLoading && "border-dashed",
                  )}
                  style={{ opacity: getOpacity(mod.id) }}
                  onMouseEnter={() => setHoveredId(mod.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <div className="flex items-center gap-1.5">
                    {isLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground flex-shrink-0" />}
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
                  {/* Per-module match button when not yet matched */}
                  {!hasMatches && !isLoading && (
                    <button
                      className="mt-1.5 flex items-center gap-1 text-[10px] text-international-orange hover:text-international-orange/80 transition-colors"
                      onClick={() => onMatchModule(mod)}
                    >
                      <Search className="h-2.5 w-2.5" />
                      Find suppliers
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* Column 2: Component Groups */}
          <div className="space-y-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Component Groups
            </p>
            {groups.map((group) => {
              const supplierIds = groupSupplierMap.get(group.id) ?? []
              const isUncovered = supplierIds.length === 0 && matchedModuleCount > 0
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

          {/* Column 3: Matched Suppliers */}
          <div className="space-y-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Suppliers
            </p>
            {uniqueSuppliers.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-center">
                <p className="text-[10px] text-muted-foreground">
                  {matchAllLoading
                    ? "Matching suppliers…"
                    : "Match modules to discover suppliers"}
                </p>
              </div>
            ) : (
              uniqueSuppliers.map((supplier) => {
                const cardId = `supplier-${supplier.id}`
                const isShortlisted = shortlistedSupplierIds.has(supplier.id)
                return (
                  <div
                    key={supplier.id}
                    ref={(el) => { if (el) supplierRefs.current.set(supplier.id, el); else supplierRefs.current.delete(supplier.id) }}
                    className={cn(
                      "rounded-md border p-2 transition-opacity duration-200 bg-card",
                      isShortlisted && "border-status-success/40 bg-status-success-light/20",
                    )}
                    style={{ opacity: getOpacity(cardId) }}
                    onMouseEnter={() => setHoveredId(cardId)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-semibold text-foreground truncate">{supplier.name}</span>
                        {supplier.isVerified && (
                          <BadgeCheck className="h-3 w-3 text-status-success flex-shrink-0" />
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono flex-shrink-0">
                        {Math.round(supplier.bestScore)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[9px] text-muted-foreground">
                        {supplier.moduleIds.length} module{supplier.moduleIds.length !== 1 ? "s" : ""}
                      </span>
                      <button
                        className={cn(
                          "flex items-center gap-0.5 text-[9px] font-medium transition-colors",
                          isShortlisted
                            ? "text-status-success"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                        onClick={() => onShortlistSupplier(supplier.originalMatch, supplier.firstModuleId)}
                      >
                        {isShortlisted ? (
                          <>
                            <Check className="h-2.5 w-2.5" />
                            Shortlisted
                          </>
                        ) : (
                          <>
                            <Plus className="h-2.5 w-2.5" />
                            Shortlist
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )
              })
            )}
            {/* Uncovered groups hint */}
            {matchedModuleCount > 0 && groups.some((g) => (groupSupplierMap.get(g.id) ?? []).length === 0) && (
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
