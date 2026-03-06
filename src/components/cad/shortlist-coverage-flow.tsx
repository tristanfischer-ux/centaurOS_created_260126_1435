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
import { ExternalLink, Search, Loader2, Info } from "lucide-react"
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
  /** Callback: promote a supplier within a category */
  onPromoteSupplier: (categoryId: string, supplierId: string) => void
  /** Buy part search results */
  buyPartResults?: BuyPartSearchResult[]
  /** Trigger buy part search */
  onSearchBuyParts?: () => void
  /** Whether buy search is loading */
  buySearchLoading?: boolean
  /** Callback: click supplier to view details */
  onSupplierClick?: (supplierId: string, supplierName?: string) => void
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
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())
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
      const isExpanded = expandedCats.has(cat.id)

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

      const visibleCount = isExpanded ? ranked.length : Math.min(ranked.length, SUPPLIER_BAR.MAX_VISIBLE)
      const moreCount = ranked.length - SUPPLIER_BAR.MAX_VISIBLE
      const visibleEntries = ranked.slice(0, visibleCount)

      // INTENT: Horizontal layout = one row per category: category name + supplier bar row
      const rankH = CATEGORY_NAME_H + SUPPLIER_BAR.BAR_H + 8
      const h = Math.max(catPartsH, rankH, SANKEY.BAR_MIN_H)

      layoutCats.push({ ...cat, x: COL_CATS_X, y: cy, h, barColor })

      rankGroups.push({
        catId: cat.id,
        x: COL_SUPS_X,
        y: cy,
        entries: visibleEntries,
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
  }, [sortedCategories, catColorMap, categoryRankings, categorySupplierEntries, expandedCats, buyResultsMap])

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

  const toggleExpanded = useCallback((catId: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev)
      if (next.has(catId)) next.delete(catId)
      else next.add(catId)
      return next
    })
  }, [])

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
                <g key={c.id}>
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
                  {/* Hit area */}
                  <rect
                    x={c.x - 4}
                    y={c.y - 2}
                    width={COL_SUPS_X - COL_CATS_X}
                    height={c.h + 4}
                    fill="transparent"
                    onMouseEnter={() => setHoveredId(catId)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{ cursor: "default" }}
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
                <g key={group.catId}>
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
                        onClick={() => onPromoteSupplier(group.catId, entry.supplierId)}
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
                        {/* Rank ordinal */}
                        {rankLabel && (
                          <text
                            x={barX + 6}
                            y={barY + 14}
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
                          y={barY + 14}
                          fontSize={9}
                          fontWeight={isFirst ? 700 : 500}
                          fill={isFirst ? "#ffffff" : "#334155"}
                        >
                          {truncate(entry.name, isFirst ? 22 : 12)}
                          <title>{entry.name} — {Math.round(entry.aggregateScore)}% match · Click to change rank</title>
                        </text>
                        {/* Score */}
                        <text
                          x={barX + barW - (onSupplierClick ? 18 : 6)}
                          y={barY + 14}
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
                              onSupplierClick(entry.supplierId, entry.name)
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

                  {/* "+N more" chip */}
                  {group.moreCount > 0 && (
                    <g
                      style={{ cursor: "pointer" }}
                      onClick={() => toggleExpanded(group.catId)}
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

                  {/* Hit area for hover */}
                  <rect
                    x={group.x - 4}
                    y={group.y - 2}
                    width={VB_W - group.x}
                    height={CATEGORY_NAME_H + SUPPLIER_BAR.BAR_H + 12}
                    fill="transparent"
                    onMouseEnter={() => setHoveredId(rankId)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{ cursor: "default" }}
                  />
                </g>
              )
            })}
          </g>
        </svg>

        {/* HTML overlay: Buy category product links */}
        <div className="absolute inset-0 pointer-events-none" style={{ overflow: "hidden" }}>
          {layout.buyGroups.map((group) => {
            const hasResults = group.results.length > 0
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
                <p className="text-[9px] font-semibold text-muted-foreground mb-1">
                  Buy · Off-the-shelf
                </p>

                {hasResults ? (
                  <div className="space-y-2">
                    {group.results.map((result, ri) => (
                      <div key={ri}>
                        <p className="text-[10px] font-medium text-foreground">{result.partName}</p>
                        <div className="ml-2 space-y-0.5">
                          {result.products.map((product, pi) => (
                            <a
                              key={pi}
                              href={product.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-[9px] text-info hover:text-info/80 transition-colors"
                            >
                              <ExternalLink className="h-2.5 w-2.5 flex-shrink-0" />
                              <span>{product.source}</span>
                              {product.estimatedPrice && (
                                <span className="font-mono font-medium">{product.estimatedPrice}</span>
                              )}
                            </a>
                          ))}
                        </div>
                      </div>
                    ))}
                    {/* Re-search button */}
                    {onSearchBuyParts && (
                      <button
                        className="flex items-center gap-1 text-[9px] text-international-orange hover:text-international-orange/80 transition-colors mt-1"
                        onClick={onSearchBuyParts}
                        disabled={buySearchLoading}
                      >
                        {buySearchLoading ? (
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        ) : (
                          <Search className="h-2.5 w-2.5" />
                        )}
                        Search Again
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
                        className="flex items-center gap-1 text-[10px] text-international-orange hover:text-international-orange/80 transition-colors mt-1"
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
