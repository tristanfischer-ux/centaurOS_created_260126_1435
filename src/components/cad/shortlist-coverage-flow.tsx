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
import { X, Info, Loader2, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CadLabModule, AiCostEstimate } from "@/lib/cad-lab-types"
import type { BuyPartSearchResult } from "@/actions/buy-part-search"
import { normalizeForMatch } from "@/lib/part-match"
import { formatCurrency } from "@/lib/format"
import type { CadLabSupplierMatch } from "@/actions/cad-lab-supplier-match"
import type { DiagnosticAnswers } from "./cad-lab-diagnostics"
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
  /** Callback: click supplier to view details. Optional score + match reasons for dialog enrichment. */
  onSupplierClick?: (supplierId: string, supplierName?: string, matchScore?: number, matchReasons?: string[]) => void
  /** Buy part search results — used to render supplier bars for buy categories */
  buyPartResults?: BuyPartSearchResult[]
  /** Whether buy search is in progress */
  buySearchLoading?: boolean
  /** Callback to re-trigger buy part price search */
  onRefreshBuyParts?: () => void
}

// ─── SVG layout constants ────────────────────────────────────────────

const VB_W = 1300
const COL_CATS_X = 10
const COL_SUPS_X = 680
const PART_LIST_X = 32
const PART_ROW_H = 13
const PART_DOT_R = 3
const CATEGORY_NAME_H = 28

// ─── Layout types ────────────────────────────────────────────────────

interface RankEntry extends CategorySupplierEntry {
  rank: number
  /** For buy entries: total price from search results */
  buyTotalCost?: number
  /** For buy entries: clickable product URL */
  buyUrl?: string
  /** For buy entries: supplier source name (e.g. "RS Components") */
  _buySource?: string
  /** For buy entries: full product listing title (for tooltip) */
  _buyProductTitle?: string
  /** For buy entries: true when using AI cost estimate, not web price */
  _isEstimate?: boolean
}

interface RankedLayout {
  categories: Array<CategoryNode & { x: number; y: number; h: number; barColor: string }>
  /** Per-category horizontal supplier groups (make AND buy) */
  rankGroups: Array<{
    catId: string
    catType: "make" | "buy"
    x: number
    y: number
    entries: Array<RankEntry>
    allEntries: Array<RankEntry>
    moreCount: number
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
  onSupplierClick,
  buyPartResults,
  buySearchLoading,
  onRefreshBuyParts,
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

  /** Build per-part buy entries: each buy part gets its own bar with best product */
  const buildBuyRankEntries = useCallback((cat: CategoryNode): RankEntry[] => {
    // INTENT: Build a lookup from normalized partName → BuyPartSearchResult for O(1) matching
    const resultsByPart = new Map<string, BuyPartSearchResult>()
    if (buyPartResults) {
      for (const r of buyPartResults) resultsByPart.set(normalizeForMatch(r.partName), r)
    }

    // INTENT: Build part → AI cost lookup for fallback pricing
    const aiPartCosts = new Map<string, number>()
    if (aiCostEstimates) {
      for (const est of Object.values(aiCostEstimates)) {
        if (est.parts) {
          for (const p of est.parts) aiPartCosts.set(p.name.toLowerCase(), p.cost)
        }
      }
    }

    const entries: RankEntry[] = []

    // INTENT: Iterate in BOM order (cat.parts) so bars match the user's mental model
    for (let pi = 0; pi < cat.parts.length; pi++) {
      const part = cat.parts[pi]
      const result = resultsByPart.get(normalizeForMatch(part.name))

      if (result && result.products.length > 0) {
        // Pick best product: cheapest with a valid URL + price > 0, fallback to first
        const withPrice = result.products.filter((p) => p.url && (p.numericPrice ?? 0) > 0)
        const best = withPrice.length > 0
          ? withPrice.reduce((a, b) => ((a.numericPrice ?? 0) <= (b.numericPrice ?? 0) ? a : b))
          : result.products[0]

        entries.push({
          supplierId: `buy-part-${pi}-${part.name}`,
          name: part.name,
          isVerified: false,
          aggregateScore: 0,
          rank: entries.length + 1,
          buyTotalCost: best.numericPrice,
          buyUrl: best.url,
          _buySource: best.source,
          _buyProductTitle: best.title,
          _isEstimate: false,
          originalMatch: null as unknown as CategorySupplierEntry["originalMatch"],
          contributingModuleIds: [],
        })
      } else {
        // FALLBACK: No search result — show AI-estimated cost with RS Components search URL
        const aiCost = aiPartCosts.get(part.name.toLowerCase())
        entries.push({
          supplierId: `buy-part-${pi}-${part.name}`,
          name: part.name,
          isVerified: false,
          aggregateScore: 0,
          rank: entries.length + 1,
          buyTotalCost: aiCost,
          buyUrl: `https://uk.rs-online.com/web/c/?searchTerm=${encodeURIComponent(part.name)}`,
          _buySource: "RS Components",
          _isEstimate: true,
          originalMatch: null as unknown as CategorySupplierEntry["originalMatch"],
          contributingModuleIds: [],
        })
      }
    }

    return entries
  }, [buyPartResults, aiCostEstimates])

  // ── Compute layout ──
  const layout = useMemo((): RankedLayout => {
    const layoutCats: RankedLayout["categories"] = []
    const rankGroups: RankedLayout["rankGroups"] = []
    const flows: RankedLayout["flows"] = []

    let cy = SANKEY.CONTENT_TOP

    for (const cat of sortedCategories) {
      const barColor = catColorMap.get(cat.id) ?? "#475569"
      const catPartsH = CATEGORY_NAME_H + cat.parts.length * PART_ROW_H + 4

      if (cat.type === "buy") {
        // INTENT: Buy parts are individual components. Right side renders as aligned text rows
        // (source + price) at the same Y as the left-side parts, creating a visual table.
        const buyEntries = buildBuyRankEntries(cat)

        // Height matches the parts list — rows are 1:1 with PART_ROW_H spacing
        const h = Math.max(catPartsH, SANKEY.BAR_MIN_H)
        layoutCats.push({ ...cat, x: COL_CATS_X, y: cy, h, barColor })

        rankGroups.push({
          catId: cat.id,
          catType: "buy",
          x: COL_SUPS_X,
          y: cy,
          entries: buyEntries,
          allEntries: buyEntries,
          moreCount: 0,
        })

        // Flow ribbon — target Y at midpoint of text rows
        if (buyEntries.length > 0) {
          const flowH = Math.min(h * 0.6, 24)
          const catMidY = cy + h / 2
          const supMidY = cy + CATEGORY_NAME_H + (buyEntries.length * PART_ROW_H) / 2
          flows.push({
            catId: cat.id,
            x1: COL_CATS_X + SANKEY.BAR_W, y1t: catMidY - flowH / 2, y1b: catMidY + flowH / 2,
            x2: COL_SUPS_X, y2t: supMidY - flowH / 2, y2b: supMidY + flowH / 2,
            color: barColor,
          })
        }

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
        catType: "make",
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

    return { categories: layoutCats, rankGroups, flows, viewBoxHeight }
  }, [sortedCategories, catColorMap, categoryRankings, categorySupplierEntries, buildBuyRankEntries])

  // ── Coverage stats ──
  const hasBuyCategories = layout.categories.some((c) => c.type === "buy")
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
        <div className="flex items-center gap-3">
          {hasBuyCategories && onRefreshBuyParts && (
            <button
              onClick={onRefreshBuyParts}
              disabled={buySearchLoading}
              className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              title="Re-search buy part prices"
            >
              <RefreshCw className={cn("h-3 w-3", buySearchLoading && "animate-spin")} />
              Re-search prices
            </button>
          )}
          <span className="text-[10px] font-medium text-muted-foreground">
            {coveredCount} of {makeCatCount} make categor{makeCatCount !== 1 ? "ies" : "y"} allocated
          </span>
        </div>
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
                    {truncate(c.label, 65)}
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
                          {truncate(part.name, 70)}
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

          {/* Layer 3: Horizontal ranked supplier bars (make AND buy) */}
          <g>
            {layout.rankGroups.map((group) => {
              const rankId = `rank-${group.catId}`
              const catColor = catColorMap.get(group.catId) ?? "#475569"
              const rankedIds = categoryRankings.get(group.catId) ?? []
              const isBuy = group.catType === "buy"

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
                    {truncate(sortedCategories.find((c) => c.id === group.catId)?.label ?? "", 55)}
                  </text>

                  {/* Buy: text rows aligned 1:1 with left-side parts (source + price) */}
                  {isBuy && group.entries.map((entry, ei) => {
                    // INTENT: Y matches the left-side part dot/text exactly
                    const rowY = group.y + CATEGORY_NAME_H + ei * PART_ROW_H + 4
                    const priceText = entry.buyTotalCost != null && entry.buyTotalCost > 0
                      ? `${formatCurrency(entry.buyTotalCost)}${entry._isEstimate ? " (est.)" : ""}`
                      : ""
                    const titleText = `${entry._buyProductTitle ?? entry.name}${entry._buySource ? ` — ${entry._buySource}` : ""}${entry.buyTotalCost != null ? ` — ${formatCurrency(entry.buyTotalCost)}` : ""}${entry._isEstimate ? " (estimated)" : ""}`

                    return (
                      <g
                        key={entry.supplierId}
                        opacity={getOpacity(rankId)}
                        className="transition-opacity duration-200"
                        style={{ cursor: entry.buyUrl ? "pointer" : undefined }}
                        onClick={entry.buyUrl ? () => window.open(entry.buyUrl, "_blank", "noopener,noreferrer") : undefined}
                      >
                        {/* Hover hit area */}
                        <rect
                          x={group.x}
                          y={rowY - 5}
                          width={SUPPLIER_BAR.FIRST_W}
                          height={PART_ROW_H}
                          fill="transparent"
                          rx={2}
                          className="hover:fill-[#f1f5f9]"
                        />
                        {/* Source name */}
                        <text
                          x={group.x}
                          y={rowY + 3}
                          fontSize={9}
                          fill="#475569"
                        >
                          {truncate(entry._buySource ?? "—", 20)}
                          <title>{titleText}</title>
                        </text>
                        {/* Price — right-aligned */}
                        <text
                          x={group.x + SUPPLIER_BAR.FIRST_W}
                          y={rowY + 3}
                          fontSize={9}
                          fontFamily="monospace"
                          fontWeight={500}
                          fill={entry._isEstimate ? "#94a3b8" : "#334155"}
                          textAnchor="end"
                        >
                          {priceText}
                        </text>
                      </g>
                    )
                  })}

                  {/* Make: horizontal ranked supplier bars */}
                  {!isBuy && group.entries.map((entry, ei) => {
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
                          setRankPopover((prev) =>
                            prev?.supplierId === entry.supplierId && prev?.catId === group.catId
                              ? null
                              : { catId: group.catId, supplierId: entry.supplierId, x: barX, y: barY + SUPPLIER_BAR.BAR_H + 4, entry }
                          )
                        }}
                      >
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
                        {/* Score progress bar */}
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
                        {/* Info icon */}
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

                  {/* "+N more" chip — make categories only */}
                  {!isBuy && group.moreCount > 0 && (
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
                    height={isBuy
                      ? CATEGORY_NAME_H + group.entries.length * PART_ROW_H + 8
                      : CATEGORY_NAME_H + SUPPLIER_BAR.BAR_H + 12}
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

        {/* Buy search loading indicator — overlaid on buy category areas */}
        {buySearchLoading && (
          <div className="absolute inset-0 pointer-events-none" style={{ overflow: "hidden" }}>
            {layout.rankGroups.filter((g) => g.catType === "buy" && g.entries.length === 0).map((group) => (
              <div
                key={`buy-load-${group.catId}`}
                className="absolute"
                style={{
                  left: group.x * svgScale,
                  top: (group.y + CATEGORY_NAME_H) * svgScale,
                }}
              >
                <div className="flex items-center gap-1.5 text-muted-foreground animate-pulse">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="text-[10px] font-medium">Searching suppliers…</span>
                </div>
              </div>
            ))}
          </div>
        )}
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
