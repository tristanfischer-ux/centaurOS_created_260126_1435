/**
 * @file shortlist-coverage-flow.tsx — 2-column SVG: Categories → Horizontal ranked suppliers.
 *
 * @description Left column shows categories with inline parts. Right column shows
 * per-category supplier rankings in a HORIZONTAL layout: 1st choice prominent on left,
 * 2nd/3rd extending right, with a "+N more" chip. Click any non-1st supplier to
 * promote to 1st (swap). Click 1st to de-select. Buy categories show real clickable
 * product links with prices as HTML overlays.
 *
 * FLOW: source/page.tsx → CadLabShortlist → this component (Shortlist tab)
 */

"use client"

import { useMemo, useState, useCallback, useRef, useEffect } from "react"
import { ExternalLink, Search, Loader2, ShoppingCart, X, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CadLabModule, AiCostEstimate } from "@/lib/cad-lab-types"
import type { CadLabSupplierMatch } from "@/actions/cad-lab-supplier-match"
import type { DiagnosticAnswers } from "./cad-lab-diagnostics"
import type { BuyPartSearchResult } from "@/actions/buy-part-search"
import {
  type CategoryNode,
  type CategorySupplierEntry,
  SANKEY,
  CAT_COLORS,
  SUPPLIER_BAR,
  moduleColorFn,
  flowPath,
  truncate,
  buildSankeyData,
  sortCategoriesBuyLast,
} from "@/lib/sankey-utils"

// ─── Props ───────────────────────────────────────────────────────────

export interface ShortlistCoverageFlowProps {
  modules: CadLabModule[]
  diagnosticAnswers?: DiagnosticAnswers
  aiCostEstimates?: Record<string, AiCostEstimate>
  supplierMatches: Map<string, CadLabSupplierMatch[]>
  /** categoryId → ordered supplier IDs (index 0 = 1st choice) */
  categoryRankings: Map<string, string[]>
  /** Per-category supplier entries from buildPerCategorySuppliers() */
  categorySupplierEntries: Map<string, CategorySupplierEntry[]>
  /** Callback: promote a supplier within a category. Optional targetRank (0-indexed) for direct placement. */
  onPromoteSupplier: (categoryId: string, supplierId: string, targetRank?: number) => void
  /** Buy part search results */
  buyPartResults?: BuyPartSearchResult[]
  /** Trigger buy part search */
  onSearchBuyParts?: () => void
  /** Whether buy search is loading */
  buySearchLoading?: boolean
  /** Callback: click supplier to view details. Optional score + match reasons for dialog enrichment. */
  onSupplierClick?: (supplierId: string, supplierName?: string, matchScore?: number, matchReasons?: string[]) => void
}

// ─── SVG layout constants ────────────────────────────────────────────

const VB_W = 1300
const COL_CATS_X = 10
const COL_SUPS_X = 680
const PART_LIST_X = 32
const PART_ROW_H = 13
const PART_DOT_R = 3
const CATEGORY_NAME_H = 16

// ─── Layout types ────────────────────────────────────────────────────

interface RankedLayout {
  categories: Array<CategoryNode & { x: number; y: number; h: number; barColor: string }>
  /** Per-category horizontal supplier groups */
  rankGroups: Array<{
    catId: string
    x: number
    y: number
    entries: Array<CategorySupplierEntry & { rank: number }>
    /** All entries including overflow (for dropdown) */
    allEntries: Array<CategorySupplierEntry & { rank: number }>
    moreCount: number
  }>
  /** Buy category groups (for HTML overlay) */
  buyGroups: Array<{
    catId: string
    x: number
    y: number
    parts: Array<{ name: string }>
    results: BuyPartSearchResult[]
  }>
  /** Flow ribbons from category to 1st-choice supplier */
  flows: Array<{
    catId: string
    x1: number; y1t: number; y1b: number
    x2: number; y2t: number; y2b: number
    color: string
  }>
  viewBoxHeight: number
}

// ─── Component ───────────────────────────────────────────────────────

export function ShortlistCoverageFlow({
  modules,
  diagnosticAnswers,
  aiCostEstimates,
  categoryRankings,
  categorySupplierEntries,
  onPromoteSupplier,
  buyPartResults,
  onSearchBuyParts,
  buySearchLoading,
  onSupplierClick,
}: ShortlistCoverageFlowProps): React.ReactNode {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [dropdownCatId, setDropdownCatId] = useState<string | null>(null)
  const [rankPopover, setRankPopover] = useState<{
    catId: string
    supplierId: string
    x: number
    y: number
    entry: CategorySupplierEntry
  } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const moduleColorMap = useMemo(() => {
    const map = new Map<string, string>()
    modules.forEach((mod, i) => map.set(mod.id, moduleColorFn(i)))
    return map
  }, [modules])

  const { categories } = useMemo(
    () => buildSankeyData(modules, diagnosticAnswers, aiCostEstimates),
    [modules, diagnosticAnswers, aiCostEstimates],
  )

  // Sort categories: buy last, then by center-of-gravity
  const sortedCategories = useMemo(() => {
    const withCoG = categories.map((cat) => {
      let totalWeight = 0
      for (const [, count] of cat.moduleContributions) {
        totalWeight += count
      }
      return { cat, centerOfGravity: totalWeight, type: cat.type }
    })
    withCoG.sort((a, b) => sortCategoriesBuyLast(a, b))
    return withCoG.map((c) => c.cat)
  }, [categories])

  // Category color map (consistent with Suppliers tab)
  const catColorMap = useMemo(() => {
    const map = new Map<string, string>()
    sortedCategories.forEach((cat, i) => {
      map.set(cat.id, CAT_COLORS[i % CAT_COLORS.length])
    })
    return map
  }, [sortedCategories])

  // Build buy part results lookup (partName → results)
  const buyResultsMap = useMemo(() => {
    const map = new Map<string, BuyPartSearchResult>()
    if (buyPartResults) {
      for (const r of buyPartResults) {
        map.set(r.partName, r)
      }
    }
    return map
  }, [buyPartResults])

  // ── Compute layout ──
  const layout = useMemo((): RankedLayout => {
    const layoutCats: RankedLayout["categories"] = []
    const rankGroups: RankedLayout["rankGroups"] = []
    const buyGroups: RankedLayout["buyGroups"] = []
    const flows: RankedLayout["flows"] = []

    let cy = SANKEY.CONTENT_TOP

    for (const cat of sortedCategories) {
      const barColor = catColorMap.get(cat.id) ?? "#475569"
      const catPartsH = CATEGORY_NAME_H + cat.parts.length * PART_ROW_H + 4

      if (cat.type === "buy") {
        // Buy category — right side shows product results via HTML overlay
        const buyResults = cat.parts
          .map((p) => buyResultsMap.get(p.name))
          .filter((r): r is BuyPartSearchResult => r != null)

        // Height: category name + one supplier bar row (for layout spacing)
        const buyContentH = CATEGORY_NAME_H + SUPPLIER_BAR.BAR_H + 8
        const h = Math.max(catPartsH, buyContentH, SANKEY.BAR_MIN_H)
        layoutCats.push({ ...cat, x: COL_CATS_X, y: cy, h, barColor })

        buyGroups.push({
          catId: cat.id,
          x: COL_SUPS_X,
          y: cy,
          parts: cat.parts.map((p) => ({ name: p.name })),
          results: buyResults,
        })

        cy += h + SANKEY.CAT_GAP
        continue
      }

      // Make category — right side shows horizontal ranked suppliers
      const rankedIds = categoryRankings.get(cat.id) ?? []
      const allEntries = categorySupplierEntries.get(cat.id) ?? []

      // Build ranked list: first from rankings, then remaining sorted by score
      const ranked: Array<CategorySupplierEntry & { rank: number }> = []
      const usedIds = new Set<string>()

      for (let i = 0; i < rankedIds.length; i++) {
        const entry = allEntries.find((e) => e.supplierId === rankedIds[i])
        if (entry) {
          ranked.push({ ...entry, rank: i + 1 })
          usedIds.add(entry.supplierId)
        }
      }

      // Add unranked suppliers below
      for (const entry of allEntries) {
        if (!usedIds.has(entry.supplierId)) {
          ranked.push({ ...entry, rank: ranked.length + 1 })
        }
      }

      const moreCount = ranked.length - SUPPLIER_BAR.MAX_VISIBLE
      const visibleEntries = ranked.slice(0, Math.min(ranked.length, SUPPLIER_BAR.MAX_VISIBLE))

      // INTENT: Horizontal layout = one row per category: category name + supplier bar row
      const rankH = CATEGORY_NAME_H + SUPPLIER_BAR.BAR_H + 8
      const h = Math.max(catPartsH, rankH, SANKEY.BAR_MIN_H)

      layoutCats.push({ ...cat, x: COL_CATS_X, y: cy, h, barColor })

      rankGroups.push({
        catId: cat.id,
        x: COL_SUPS_X,
        y: cy,
        entries: visibleEntries,
        allEntries: ranked,
        moreCount: Math.max(moreCount, 0),
      })

      // Flow ribbon from category to 1st-choice supplier position
      if (rankedIds.length > 0 && visibleEntries.length > 0) {
        const flowH = Math.min(h * 0.6, 24)
        const catMidY = cy + h / 2
        const supMidY = cy + CATEGORY_NAME_H + SUPPLIER_BAR.BAR_H / 2

        flows.push({
          catId: cat.id,
          x1: COL_CATS_X + SANKEY.BAR_W,
          y1t: catMidY - flowH / 2,
          y1b: catMidY + flowH / 2,
          x2: COL_SUPS_X,
          y2t: supMidY - flowH / 2,
          y2b: supMidY + flowH / 2,
          color: barColor,
        })
      }

      cy += h + SANKEY.CAT_GAP
    }

    const viewBoxHeight = cy + SANKEY.PADDING_BOTTOM

    return { categories: layoutCats, rankGroups, buyGroups, flows, viewBoxHeight }
  }, [sortedCategories, catColorMap, categoryRankings, categorySupplierEntries, buyResultsMap])

  // ── Coverage stats ──
  const makeCatCount = layout.categories.filter((c) => c.type !== "buy").length
  const coveredCount = layout.rankGroups.filter((g) => {
    const rankedIds = categoryRankings.get(g.catId)
    return rankedIds && rankedIds.length > 0
  }).length

  // ── Hover connectivity ──
  const connectedToHover = useMemo(() => {
    if (!hoveredId) return null
    const connected = new Set<string>([hoveredId])

    if (hoveredId.startsWith("cat-")) {
      const catId = hoveredId.slice(4)
      connected.add(`rank-${catId}`)
    }

    if (hoveredId.startsWith("rank-")) {
      const catId = hoveredId.slice(5)
      connected.add(`cat-${catId}`)
    }

    return connected
  }, [hoveredId])

  const getOpacity = useCallback(
    (id: string) => {
      if (!connectedToHover) return 1
      return connectedToHover.has(id) ? 1 : 0.15
    },
    [connectedToHover],
  )

  const getFlowOpacity = useCallback(
    (catId: string) => {
      if (!connectedToHover) return 0.25
      return connectedToHover.has(`cat-${catId}`) ? 0.45 : 0.06
    },
    [connectedToHover],
  )

  // Close dropdown / rank popover on Escape key
  useEffect(() => {
    if (!dropdownCatId && !rankPopover) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDropdownCatId(null)
        setRankPopover(null)
      }
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [dropdownCatId, rankPopover])

  if (modules.length === 0) return null

  const svgScale = containerWidth > 0 ? containerWidth / VB_W : 1

  return (
    <div className="rounded-lg border p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">Supplier Allocation</span>
        <span className="text-[10px] font-medium text-muted-foreground">
          {coveredCount} of {makeCatCount} make categor{makeCatCount !== 1 ? "ies" : "y"} allocated
        </span>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-2 gap-0">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Categories</p>
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider" style={{ paddingLeft: ((COL_SUPS_X / VB_W) * 100) + "%" }}>Ranked Suppliers</p>
      </div>

      {/* SVG + HTML overlays */}
      <div ref={containerRef} className="relative overflow-x-auto">
        <svg
          viewBox={`0 0 ${VB_W} ${layout.viewBoxHeight}`}
          className="w-full h-auto"
          style={{ display: "block" }}
        >
          {/* Layer 1: Flow ribbons — category → 1st choice supplier */}
          <g>
            {layout.flows.map((f, i) => (
              <path
                key={`fl-${i}`}
                d={flowPath(f.x1, f.y1t, f.y1b, f.x2, f.y2t, f.y2b)}
                fill={`${f.color}${Math.round(getFlowOpacity(f.catId) * 255).toString(16).padStart(2, "0")}`}
                className="transition-all duration-200"
              />
            ))}
          </g>

          {/* Layer 2: Category bars with inline parts */}
          <g>
            {layout.categories.map((c) => {
              const catId = `cat-${c.id}`
              return (
                <g
                  key={c.id}
                  onMouseEnter={() => setHoveredId(catId)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <rect
                    x={c.x}
                    y={c.y}
                    width={SANKEY.BAR_W}
                    height={c.h}
                    fill={c.barColor}
                    rx={3}
                    opacity={getOpacity(catId)}
                    className="transition-opacity duration-200"
                  />
                  {/* Category label */}
                  <text
                    x={c.x + SANKEY.LABEL_OFFSET_RIGHT}
                    y={c.y + 12}
                    fontSize={10}
                    fontWeight={600}
                    fill="#1e293b"
                    opacity={getOpacity(catId)}
                    className="transition-opacity duration-200"
                  >
                    {truncate(c.label, 55)}
                    <title>{c.label} — {c.partCount} part{c.partCount !== 1 ? "s" : ""}</title>
                  </text>
                  {/* Inline parts with colored dots */}
                  {c.parts.map((part, pi) => {
                    const modColor = moduleColorMap.get(part.moduleId) ?? "#94a3b8"
                    const py = c.y + CATEGORY_NAME_H + pi * PART_ROW_H + 4
                    return (
                      <g key={pi} opacity={getOpacity(catId)} className="transition-opacity duration-200">
                        <circle
                          cx={c.x + PART_LIST_X}
                          cy={py}
                          r={PART_DOT_R}
                          fill={modColor}
                        />
                        <text
                          x={c.x + PART_LIST_X + 8}
                          y={py + 3}
                          fontSize={9}
                          fill="#475569"
                        >
                          {truncate(part.name, 55)}
                        </text>
                      </g>
                    )
                  })}
                  {/* Hit area — pointer-events: none so clicks pass through to content */}
                  <rect
                    x={c.x - 4}
                    y={c.y - 2}
                    width={COL_SUPS_X - COL_CATS_X}
                    height={c.h + 4}
                    fill="transparent"
                    style={{ pointerEvents: "none" }}
                  />
                </g>
              )
            })}
          </g>

          {/* Layer 3: Horizontal ranked supplier bars */}
          <g>
            {layout.rankGroups.map((group) => {
              const rankId = `rank-${group.catId}`
              const catColor = catColorMap.get(group.catId) ?? "#475569"
              const rankedIds = categoryRankings.get(group.catId) ?? []

              return (
                <g
                  key={group.catId}
                  onMouseEnter={() => setHoveredId(rankId)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  {/* Category header on right side */}
                  <text
                    x={group.x}
                    y={group.y + 12}
                    fontSize={9}
                    fontWeight={600}
                    fill="#64748b"
                    opacity={getOpacity(rankId)}
                    className="transition-opacity duration-200"
                  >
                    {truncate(sortedCategories.find((c) => c.id === group.catId)?.label ?? "", 40)}
                  </text>

                  {/* Horizontal supplier bars — all on one row */}
                  {group.entries.map((entry, ei) => {
                    const isFirst = ei === 0 && rankedIds[0] === entry.supplierId
                    const barW = isFirst ? SUPPLIER_BAR.FIRST_W : SUPPLIER_BAR.BACKUP_W
                    const barX = group.x + (ei === 0
                      ? 0
                      : SUPPLIER_BAR.FIRST_W + SUPPLIER_BAR.BAR_GAP + (ei - 1) * (SUPPLIER_BAR.BACKUP_W + SUPPLIER_BAR.BAR_GAP))
                    const barY = group.y + CATEGORY_NAME_H
                    const rankLabel = rankedIds.includes(entry.supplierId)
                      ? `${rankedIds.indexOf(entry.supplierId) + 1}${ordinalSuffix(rankedIds.indexOf(entry.supplierId) + 1)}`
                      : ""

                    return (
                      <g
                        key={entry.supplierId}
                        opacity={getOpacity(rankId)}
                        className="transition-opacity duration-200"
                        style={{ cursor: "pointer" }}
                        onClick={() => {
                          // INTENT: Open rank popover instead of blind cycle
                          setRankPopover((prev) =>
                            prev?.supplierId === entry.supplierId && prev?.catId === group.catId
                              ? null
                              : { catId: group.catId, supplierId: entry.supplierId, x: barX, y: barY + SUPPLIER_BAR.BAR_H + 4, entry }
                          )
                        }}
                      >
                        {/* Bar background */}
                        <rect
                          x={barX}
                          y={barY}
                          width={barW}
                          height={SUPPLIER_BAR.BAR_H}
                          fill={isFirst ? catColor : "#f1f5f9"}
                          stroke={isFirst ? undefined : "#e2e8f0"}
                          strokeWidth={isFirst ? 0 : 1}
                          rx={SUPPLIER_BAR.BAR_R}
                        />
                        {/* Score progress bar — thin indicator at bottom of bar */}
                        <rect
                          x={barX}
                          y={barY + SUPPLIER_BAR.BAR_H - 3}
                          width={barW * (entry.aggregateScore / 100)}
                          height={3}
                          fill={isFirst ? "rgba(255,255,255,0.25)" : `${catColor}60`}
                          rx={1.5}
                        />
                        {/* Rank ordinal */}
                        {rankLabel && (
                          <text
                            x={barX + 6}
                            y={barY + 11}
                            fontSize={8}
                            fontWeight={700}
                            fill={isFirst ? "#ffffff" : "#94a3b8"}
                          >
                            {rankLabel}
                          </text>
                        )}
                        {/* Supplier name */}
                        <text
                          x={barX + (rankLabel ? 26 : 6)}
                          y={barY + 11}
                          fontSize={9}
                          fontWeight={isFirst ? 700 : 500}
                          fill={isFirst ? "#ffffff" : "#334155"}
                        >
                          {truncate(entry.name, isFirst ? 22 : 12)}
                          <title>{entry.name} — {Math.round(entry.aggregateScore)}% match</title>
                        </text>
                        {/* Score */}
                        <text
                          x={barX + barW - (onSupplierClick ? 18 : 6)}
                          y={barY + 11}
                          fontSize={8}
                          fill={isFirst ? "#ffffffcc" : "#94a3b8"}
                          textAnchor="end"
                        >
                          {Math.round(entry.aggregateScore)}%
                        </text>
                        {/* Info icon — separate click target for supplier details */}
                        {onSupplierClick && (
                          <g
                            style={{ cursor: "pointer" }}
                            onClick={(e) => {
                              e.stopPropagation()
                              onSupplierClick(
                                entry.supplierId,
                                entry.name,
                                entry.aggregateScore,
                                entry.originalMatch?.matchReasons,
                              )
                            }}
                          >
                            <circle
                              cx={barX + barW - 8}
                              cy={barY + SUPPLIER_BAR.BAR_H / 2}
                              r={6}
                              fill={isFirst ? "rgba(255,255,255,0.2)" : "#e2e8f0"}
                            />
                            <text
                              x={barX + barW - 8}
                              y={barY + SUPPLIER_BAR.BAR_H / 2 + 3}
                              fontSize={8}
                              fontWeight={700}
                              fill={isFirst ? "#ffffff" : "#64748b"}
                              textAnchor="middle"
                            >
                              i
                            </text>
                            <title>View supplier details</title>
                          </g>
                        )}
                      </g>
                    )
                  })}

                  {/* "+N more" chip — opens dropdown overlay */}
                  {group.moreCount > 0 && (
                    <g
                      style={{ cursor: "pointer" }}
                      onClick={() => setDropdownCatId((prev) => prev === group.catId ? null : group.catId)}
                    >
                      {(() => {
                        const chipX = group.x
                          + SUPPLIER_BAR.FIRST_W + SUPPLIER_BAR.BAR_GAP
                          + Math.max(0, Math.min(group.entries.length - 1, SUPPLIER_BAR.MAX_VISIBLE - 1)) * (SUPPLIER_BAR.BACKUP_W + SUPPLIER_BAR.BAR_GAP)
                        const chipY = group.y + CATEGORY_NAME_H
                        return (
                          <>
                            <rect
                              x={chipX}
                              y={chipY}
                              width={SUPPLIER_BAR.MORE_W}
                              height={SUPPLIER_BAR.BAR_H}
                              fill="#f8fafc"
                              stroke="#e2e8f0"
                              strokeWidth={1}
                              rx={SUPPLIER_BAR.BAR_R}
                            />
                            <text
                              x={chipX + SUPPLIER_BAR.MORE_W / 2}
                              y={chipY + 14}
                              fontSize={8}
                              fill="#64748b"
                              textAnchor="middle"
                              opacity={getOpacity(rankId)}
                            >
                              +{group.moreCount} more
                            </text>
                          </>
                        )
                      })()}
                    </g>
                  )}

                  {/* Hit area for hover — pointer-events: none so clicks pass through */}
                  <rect
                    x={group.x - 4}
                    y={group.y - 2}
                    width={VB_W - group.x}
                    height={CATEGORY_NAME_H + SUPPLIER_BAR.BAR_H + 12}
                    fill="transparent"
                    style={{ pointerEvents: "none" }}
                  />
                </g>
              )
            })}
          </g>
        </svg>

        {/* HTML overlay: Rank popover */}
        {rankPopover && (() => {
          const rankedIds = categoryRankings.get(rankPopover.catId) ?? []
          const currentRankIdx = rankedIds.indexOf(rankPopover.supplierId)
          const currentRank = currentRankIdx >= 0 ? currentRankIdx + 1 : 0
          const reasons = rankPopover.entry.originalMatch?.matchReasons ?? []
          const score = Math.round(rankPopover.entry.aggregateScore)

          return (
            <>
              {/* Click-outside backdrop */}
              <div
                className="absolute inset-0 z-40"
                onClick={() => setRankPopover(null)}
              />
              <div
                className="absolute z-50 rounded-lg border bg-card shadow-lg p-3 w-[220px]"
                style={{
                  left: rankPopover.x * svgScale,
                  top: rankPopover.y * svgScale,
                  transformOrigin: "left top",
                }}
              >
                {/* Supplier name + score */}
                <div className="space-y-1.5 mb-2">
                  <p className="text-[11px] font-semibold text-foreground truncate">
                    {rankPopover.entry.name}
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-international-orange"
                        style={{ width: `${score}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground">{score}%</span>
                  </div>
                  {reasons.length > 0 && (
                    <p className="text-[9px] text-muted-foreground line-clamp-1">
                      {reasons.slice(0, 3).join(" · ")}
                    </p>
                  )}
                </div>

                {/* Rank choices */}
                <div className="border-t pt-2 space-y-0.5">
                  {[1, 2, 3].map((rank) => (
                    <button
                      key={rank}
                      className={cn(
                        "flex items-center gap-2 w-full px-2 py-1 rounded text-[10px] font-medium transition-colors",
                        currentRank === rank
                          ? "bg-international-orange text-white"
                          : "text-foreground hover:bg-muted",
                      )}
                      onClick={() => {
                        onPromoteSupplier(rankPopover.catId, rankPopover.supplierId, rank - 1)
                        setRankPopover(null)
                      }}
                    >
                      <span className={cn(
                        "inline-flex items-center justify-center w-4 h-4 rounded-full text-[8px] font-bold",
                        currentRank === rank ? "bg-white/20" : "bg-muted",
                      )}>
                        {rank}
                      </span>
                      {rank}{ordinalSuffix(rank)} choice
                    </button>
                  ))}
                </div>

                {/* Actions */}
                <div className="border-t mt-2 pt-2 space-y-0.5">
                  {currentRank > 0 && (
                    <button
                      className="flex items-center gap-2 w-full px-2 py-1 rounded text-[10px] font-medium text-destructive hover:bg-destructive/10 transition-colors"
                      onClick={() => {
                        onPromoteSupplier(rankPopover.catId, rankPopover.supplierId, -1)
                        setRankPopover(null)
                      }}
                    >
                      <X className="h-3 w-3" />
                      Remove ranking
                    </button>
                  )}
                  {onSupplierClick && (
                    <button
                      className="flex items-center gap-2 w-full px-2 py-1 rounded text-[10px] font-medium text-info hover:bg-info/10 transition-colors"
                      onClick={() => {
                        onSupplierClick(
                          rankPopover.supplierId,
                          rankPopover.entry.name,
                          rankPopover.entry.aggregateScore,
                          reasons,
                        )
                        setRankPopover(null)
                      }}
                    >
                      <Info className="h-3 w-3" />
                      View details
                    </button>
                  )}
                </div>
              </div>
            </>
          )
        })()}

        {/* HTML overlay: "+N more" dropdown */}
        {dropdownCatId && (() => {
          const group = layout.rankGroups.find((g) => g.catId === dropdownCatId)
          if (!group) return null
          const rankedIds = categoryRankings.get(dropdownCatId) ?? []
          // Show all suppliers NOT currently in the top 3 ranked
          const overflowEntries = group.allEntries.filter((e) => !rankedIds.includes(e.supplierId))
          // Position: anchor to the "+N more" chip location
          const chipX = group.x
            + SUPPLIER_BAR.FIRST_W + SUPPLIER_BAR.BAR_GAP
            + Math.max(0, Math.min(group.entries.length - 1, SUPPLIER_BAR.MAX_VISIBLE - 1)) * (SUPPLIER_BAR.BACKUP_W + SUPPLIER_BAR.BAR_GAP)
          const chipY = group.y + CATEGORY_NAME_H + SUPPLIER_BAR.BAR_H + 4

          return (
            <>
              {/* Click-outside backdrop */}
              <div
                className="absolute inset-0 z-40"
                onClick={() => setDropdownCatId(null)}
              />
              <div
                className="absolute z-50 rounded-lg border bg-card shadow-lg p-2 min-w-[240px] max-h-[280px] overflow-y-auto"
                style={{
                  left: chipX * svgScale,
                  top: chipY * svgScale,
                  transformOrigin: "left top",
                }}
              >
                <p className="text-[10px] font-semibold text-muted-foreground mb-1.5 px-1">
                  All suppliers ({overflowEntries.length})
                </p>
                {overflowEntries.map((entry) => {
                  const matchReasons = entry.originalMatch?.matchReasons ?? []
                  const score = Math.round(entry.aggregateScore)
                  return (
                    <div
                      key={entry.supplierId}
                      className="px-2 py-1.5 rounded hover:bg-muted/50 transition-colors"
                    >
                      {/* Row 1: Name + Score + Info + Rank buttons */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[10px] font-medium text-foreground truncate">{entry.name}</span>
                          {/* Inline score bar */}
                          <div className="h-1 w-10 rounded-full bg-muted overflow-hidden flex-shrink-0">
                            <div
                              className="h-full rounded-full bg-international-orange"
                              style={{ width: `${score}%` }}
                            />
                          </div>
                          <span className="text-[9px] text-muted-foreground">{score}%</span>
                          {/* Info button */}
                          {onSupplierClick && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                onSupplierClick(entry.supplierId, entry.name, entry.aggregateScore, matchReasons)
                              }}
                            >
                              <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-info/10 text-info text-[8px] font-bold">
                                i
                              </span>
                            </button>
                          )}
                        </div>
                        <div className="flex gap-0.5 flex-shrink-0">
                          {[1, 2, 3].map((rank) => (
                            <button
                              key={rank}
                              className="px-1.5 py-0.5 text-[9px] font-medium rounded border border-border hover:bg-international-orange hover:text-white hover:border-international-orange transition-colors"
                              onClick={() => {
                                onPromoteSupplier(dropdownCatId, entry.supplierId, rank - 1)
                                setDropdownCatId(null)
                              }}
                            >
                              {rank}{ordinalSuffix(rank)}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Row 2: Match reasons */}
                      {matchReasons.length > 0 && (
                        <p className="text-[8px] text-muted-foreground mt-0.5 ml-0.5 line-clamp-1">
                          {matchReasons.slice(0, 3).join(" · ")}
                        </p>
                      )}
                    </div>
                  )
                })}
                {overflowEntries.length === 0 && (
                  <p className="text-[9px] text-muted-foreground px-1 py-2">All suppliers are ranked</p>
                )}
              </div>
            </>
          )
        })()}

        {/* HTML overlay: Buy category purchase cards */}
        <div className="absolute inset-0 pointer-events-none" style={{ overflow: "hidden" }}>
          {layout.buyGroups.map((group) => {
            const resultsWithProducts = group.results.filter((r) => r.products.length > 0)
            const hasResults = resultsWithProducts.length > 0
            return (
              <div
                key={`buy-${group.catId}`}
                className="absolute pointer-events-auto"
                style={{
                  left: group.x * svgScale,
                  top: group.y * svgScale,
                  transform: `scale(${Math.min(svgScale, 1)})`,
                  transformOrigin: "left top",
                  maxWidth: (VB_W - group.x) * svgScale,
                }}
              >
                <div className="rounded-lg border bg-card shadow-sm p-3 max-w-[360px]">
                  {/* Header */}
                  <div className="flex items-center gap-1.5 mb-2">
                    <ShoppingCart className="h-3 w-3 text-international-orange" />
                    <span className="text-[10px] font-semibold text-foreground">Purchasing</span>
                    <span className="text-[9px] text-muted-foreground ml-auto">
                      {group.parts.length} part{group.parts.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {hasResults ? (
                    <div className="space-y-2">
                      {resultsWithProducts.map((result, ri) => (
                        <div key={ri}>
                          <p className="text-[10px] font-medium text-foreground">{result.partName}</p>
                          <div className="ml-1 mt-0.5 space-y-0.5">
                            {result.products.map((product, pi) => (
                              <a
                                key={pi}
                                href={product.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-[9px] text-foreground hover:text-international-orange transition-colors"
                              >
                                <ExternalLink className="h-2.5 w-2.5 flex-shrink-0 text-muted-foreground" />
                                <span className="bg-muted rounded px-1.5 py-0.5 text-[9px] text-muted-foreground font-medium">
                                  {product.source}
                                </span>
                                {product.estimatedPrice && (
                                  <span className="font-mono font-medium text-foreground">{product.estimatedPrice}</span>
                                )}
                              </a>
                            ))}
                          </div>
                        </div>
                      ))}
                      {/* Search again CTA */}
                      {onSearchBuyParts && (
                        <button
                          className="flex items-center justify-center gap-1.5 w-full mt-1 bg-international-orange/10 text-international-orange hover:bg-international-orange/20 rounded-md px-3 py-1.5 text-[10px] font-medium transition-colors"
                          onClick={onSearchBuyParts}
                          disabled={buySearchLoading}
                        >
                          {buySearchLoading ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Search className="h-3 w-3" />
                          )}
                          {buySearchLoading ? "Searching…" : "Search Again"}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {group.parts.map((part, pi) => (
                        <p key={pi} className="text-[9px] text-muted-foreground">{part.name}</p>
                      ))}
                      {onSearchBuyParts && (
                        <button
                          className="flex items-center justify-center gap-1.5 w-full mt-2 bg-international-orange/10 text-international-orange hover:bg-international-orange/20 rounded-md px-3 py-1.5 text-[10px] font-medium transition-colors"
                          onClick={onSearchBuyParts}
                          disabled={buySearchLoading}
                        >
                          {buySearchLoading ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Search className="h-3 w-3" />
                          )}
                          {buySearchLoading ? "Searching…" : "Search Products"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────

function ordinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return s[(v - 20) % 10] || s[v] || s[0]
}
