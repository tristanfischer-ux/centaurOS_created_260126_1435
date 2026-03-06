/**
 * @file cad-lab-cost-estimate.tsx — Cost estimation with Sankey layout.
 *
 * @description Shows a Categories → Suppliers Sankey layout matching the Shortlist tab
 * for visual continuity, with cost data overlaid: per-part costs in the category column,
 * allocated costs in supplier bars. System total + compact module override list below.
 *
 * Replaces the old donut/bar chart + expandable card layout.
 *
 * @component
 */

"use client"

import { useMemo, useState, useCallback, useRef, useEffect } from "react"
import {
  PoundSterling,
  ExternalLink,
  Loader2,
  AlertTriangle,
  RotateCcw,
  ShoppingCart,
  Search,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { formatCurrency } from "@/lib/format"
import type { CadLabModule, EarlyCostEstimate, AiCostEstimate } from "@/lib/cad-lab-types"
import type { CadLabSupplierMatch } from "@/actions/cad-lab-supplier-match"
import type { BuyPartSearchResult } from "@/actions/buy-part-search"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"
import type { CategorySupplierEntry } from "@/lib/sankey-utils"
import {
  type CategoryNode,
  SANKEY,
  CAT_COLORS,
  SUPPLIER_BAR,
  moduleColorFn,
  flowPath,
  truncate,
  buildSankeyData,
  sortCategoriesBuyLast,
} from "@/lib/sankey-utils"

// ─── Types ──────────────────────────────────────────────────────────

interface ModuleCostSummary {
  moduleId: string
  moduleName: string
  aiEstimate?: AiCostEstimate
  totalPerUnit: number
  hasOverride: boolean
  overrideTotal?: number
}

// ─── SVG layout constants ────────────────────────────────────────────

const VB_W = 1300
const COL_CATS_X = 10
const COL_SUPS_X = 680
const PART_LIST_X = 32
const PART_ROW_H = 13
const PART_DOT_R = 3
const CATEGORY_NAME_H = 16

// ─── Component ──────────────────────────────────────────────────────

interface CadLabCostEstimateProps {
  modules: CadLabModule[]
  diagnosticAnswers: DiagnosticAnswers
  onCostOverride?: (moduleId: string, overrides: CadLabModule["costOverrides"]) => void
  shortlistedSupplierCount?: number
  earlyCostEstimates?: Record<string, EarlyCostEstimate>
  aiCostEstimates?: Record<string, AiCostEstimate>
  isEstimatingCosts?: boolean
  costEstimationError?: string | null
  /** All supplier matches (for Sankey) */
  supplierMatches?: Map<string, CadLabSupplierMatch[]>
  /** Per-category ranked supplier IDs */
  categoryRankings?: Map<string, string[]>
  /** Per-category supplier entries */
  categorySupplierEntries?: Map<string, CategorySupplierEntry[]>
  /** Buy part search results */
  buyPartResults?: BuyPartSearchResult[]
  /** Trigger buy part search */
  onSearchBuyParts?: () => void
  /** Whether buy search is loading */
  buySearchLoading?: boolean
  /** Callback: promote a supplier within a category */
  onPromoteSupplier?: (categoryId: string, supplierId: string, targetRank?: number) => void
  /** Callback: click supplier to view details */
  onSupplierClick?: (supplierId: string, supplierName?: string, matchScore?: number, matchReasons?: string[]) => void
}

export function CadLabCostEstimate({
  modules,
  diagnosticAnswers,
  onCostOverride,
  shortlistedSupplierCount = 0,
  aiCostEstimates,
  isEstimatingCosts = false,
  costEstimationError,
  categoryRankings,
  categorySupplierEntries,
  buyPartResults,
  onSearchBuyParts,
  buySearchLoading,
  onPromoteSupplier,
  onSupplierClick,
}: CadLabCostEstimateProps): React.ReactNode {
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const costSvgContainerRef = useRef<HTMLDivElement>(null)
  const [costSvgWidth, setCostSvgWidth] = useState(0)

  useEffect(() => {
    const el = costSvgContainerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setCostSvgWidth(entry.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const moduleColorMap = useMemo(() => {
    const map = new Map<string, string>()
    modules.forEach((mod, i) => map.set(mod.id, moduleColorFn(i)))
    return map
  }, [modules])

  const costs = useMemo((): ModuleCostSummary[] => {
    return modules.map((mod) => {
      const aiEst = aiCostEstimates?.[mod.id]
      const overrideTotal = mod.costOverrides?.totalPerUnit
      const aiTotal = aiEst?.totalPerUnit ?? 0
      const hasOverride = overrideTotal != null && overrideTotal > 0
      const totalPerUnit = hasOverride ? overrideTotal : aiTotal

      return {
        moduleId: mod.id,
        moduleName: mod.name,
        aiEstimate: aiEst,
        totalPerUnit,
        hasOverride,
        overrideTotal,
      }
    })
  }, [modules, aiCostEstimates])

  const systemTotal = costs.reduce((sum, c) => sum + c.totalPerUnit, 0)
  const hasDiagnostics = Object.keys(diagnosticAnswers).length > 0
  const hasAnyEstimates = Object.keys(aiCostEstimates ?? {}).length > 0

  // ── Build part → cost lookup ──
  const partCostMap = useMemo(() => {
    const map = new Map<string, number>()
    if (!aiCostEstimates) return map
    for (const est of Object.values(aiCostEstimates)) {
      if (est.parts) {
        for (const part of est.parts) {
          map.set(part.name, part.cost)
        }
      }
    }
    return map
  }, [aiCostEstimates])

  // ── Sankey data ──
  const { categories } = useMemo(
    () => buildSankeyData(modules, diagnosticAnswers, aiCostEstimates),
    [modules, diagnosticAnswers, aiCostEstimates],
  )

  const sortedCategories = useMemo(() => {
    const withCoG = categories.map((cat) => {
      let totalWeight = 0
      for (const [, count] of cat.moduleContributions) totalWeight += count
      return { cat, centerOfGravity: totalWeight, type: cat.type }
    })
    withCoG.sort((a, b) => sortCategoriesBuyLast(a, b))
    return withCoG.map((c) => c.cat)
  }, [categories])

  const catColorMap = useMemo(() => {
    const map = new Map<string, string>()
    sortedCategories.forEach((cat, i) => map.set(cat.id, CAT_COLORS[i % CAT_COLORS.length]))
    return map
  }, [sortedCategories])

  // Buy results lookup
  const buyResultsMap = useMemo(() => {
    const map = new Map<string, BuyPartSearchResult>()
    if (buyPartResults) {
      for (const r of buyPartResults) map.set(r.partName, r)
    }
    return map
  }, [buyPartResults])

  // ── Compute category costs ──
  const categoryCostMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const cat of sortedCategories) {
      let total = 0
      for (const part of cat.parts) {
        total += partCostMap.get(part.name) ?? 0
      }
      map.set(cat.id, total)
    }
    return map
  }, [sortedCategories, partCostMap])

  // ── Compute layout ──
  const layout = useMemo(() => {
    const layoutCats: Array<CategoryNode & { x: number; y: number; h: number; barColor: string }> = []
    const rankGroups: Array<{
      catId: string; x: number; y: number
      entries: Array<CategorySupplierEntry & { rank: number; allocatedCost: number }>
      moreCount: number
    }> = []
    const buyGroups: Array<{
      catId: string; x: number; y: number
      parts: Array<{ name: string }>
      results: BuyPartSearchResult[]
    }> = []
    const flows: Array<{
      catId: string
      x1: number; y1t: number; y1b: number
      x2: number; y2t: number; y2b: number
      color: string
    }> = []

    let cy = SANKEY.CONTENT_TOP

    for (const cat of sortedCategories) {
      const barColor = catColorMap.get(cat.id) ?? "#475569"
      const catPartsH = CATEGORY_NAME_H + cat.parts.length * PART_ROW_H + 4

      if (cat.type === "buy") {
        const buyResults = cat.parts
          .map((p) => buyResultsMap.get(p.name))
          .filter((r): r is BuyPartSearchResult => r != null)

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

      // Make category
      const rankedIds = categoryRankings?.get(cat.id) ?? []
      const allEntries = categorySupplierEntries?.get(cat.id) ?? []

      const ranked: Array<CategorySupplierEntry & { rank: number; allocatedCost: number }> = []
      const usedIds = new Set<string>()
      const catCost = categoryCostMap.get(cat.id) ?? 0

      for (let i = 0; i < rankedIds.length; i++) {
        const entry = allEntries.find((e) => e.supplierId === rankedIds[i])
        if (entry) {
          ranked.push({
            ...entry,
            rank: i + 1,
            // INTENT: 1st choice gets the full category cost allocation
            allocatedCost: i === 0 ? catCost : 0,
          })
          usedIds.add(entry.supplierId)
        }
      }

      // INTENT: Only show ranked (shortlisted) suppliers on the Costs page — no unranked fallbacks.

      const visibleCount = Math.min(ranked.length, SUPPLIER_BAR.MAX_VISIBLE)
      const moreCount = ranked.length - SUPPLIER_BAR.MAX_VISIBLE
      const visibleEntries = ranked.slice(0, visibleCount)

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

      // Flow ribbon
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
  }, [sortedCategories, catColorMap, categoryRankings, categorySupplierEntries, buyResultsMap, categoryCostMap])

  // ── Handlers ──
  const handleOverrideApply = useCallback((moduleId: string, value: string) => {
    if (!onCostOverride) return
    const num = parseFloat(value)
    const mod = modules.find(m => m.id === moduleId)
    if (!mod) return
    const existing = mod.costOverrides ?? {}
    if (!isNaN(num) && num > 0) {
      onCostOverride(moduleId, { ...existing, totalPerUnit: num })
    } else {
      const rest = { ...existing }
      delete rest.totalPerUnit
      onCostOverride(moduleId, Object.keys(rest).length > 0 ? rest : undefined)
    }
    setEditingModuleId(null)
  }, [onCostOverride, modules])

  const handleOverrideReset = useCallback((moduleId: string) => {
    if (!onCostOverride) return
    const mod = modules.find(m => m.id === moduleId)
    if (!mod) return
    const rest = { ...mod.costOverrides }
    delete rest.totalPerUnit
    onCostOverride(moduleId, Object.keys(rest).length > 0 ? rest : undefined)
  }, [onCostOverride, modules])

  if (!hasDiagnostics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <PoundSterling className="h-4 w-4" />
            Cost Estimation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Complete the engineering diagnostics above to generate cost estimates. Manufacturing process, material, and batch size are needed.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <PoundSterling className="h-4 w-4" />
          Cost Estimation
          {hasAnyEstimates && (
            <span className="text-xs font-normal font-mono text-foreground bg-muted px-2 py-0.5 rounded">
              {formatCurrency(systemTotal)} / unit
            </span>
          )}
          {isEstimatingCosts && (
            <span className="text-[10px] font-normal text-muted-foreground animate-pulse flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Analysing your specifications…
            </span>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Loading state */}
        {isEstimatingCosts && !hasAnyEstimates && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Analysing your specifications…</p>
            <p className="text-[10px] text-muted-foreground">
              Reading parts, estimating material & labour costs
            </p>
          </div>
        )}

        {/* Estimation failed */}
        {!isEstimatingCosts && !hasAnyEstimates && costEstimationError && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <AlertTriangle className="h-5 w-5 text-status-warning" />
            <p className="text-sm text-muted-foreground">Cost estimation failed.</p>
            <p className="text-[10px] text-muted-foreground font-mono">{costEstimationError}</p>
            <p className="text-[10px] text-muted-foreground">
              Try updating a diagnostic answer to re-trigger estimation.
            </p>
          </div>
        )}

        {/* Waiting for estimation */}
        {!isEstimatingCosts && !hasAnyEstimates && !costEstimationError && (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
            <PoundSterling className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Cost estimates will appear once diagnostic answers are complete.
            </p>
          </div>
        )}

        {hasAnyEstimates && (
          <>
            {/* ── Sankey: Categories → Suppliers with costs ── */}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Cost Allocation</span>
                <span className="text-[10px] font-medium text-muted-foreground">
                  {sortedCategories.length} categor{sortedCategories.length !== 1 ? "ies" : "y"}
                </span>
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-2 gap-0">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Categories</p>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider" style={{ paddingLeft: ((COL_SUPS_X / VB_W) * 100) + "%" }}>Suppliers · Cost</p>
              </div>

              <div ref={costSvgContainerRef} className="relative overflow-x-auto">
                <svg
                  viewBox={`0 0 ${VB_W} ${layout.viewBoxHeight}`}
                  className="w-full h-auto"
                  style={{ display: "block" }}
                >
                  {/* Flow ribbons */}
                  <g>
                    {layout.flows.map((f, i) => (
                      <path
                        key={`fl-${i}`}
                        d={flowPath(f.x1, f.y1t, f.y1b, f.x2, f.y2t, f.y2b)}
                        fill={`${f.color}40`}
                        className="transition-all duration-200"
                      />
                    ))}
                  </g>

                  {/* Category bars with parts + costs */}
                  <g>
                    {layout.categories.map((c) => {
                      const barColor = catColorMap.get(c.id) ?? "#475569"
                      const catCost = categoryCostMap.get(c.id) ?? 0
                      return (
                        <g key={c.id}>
                          <rect
                            x={c.x}
                            y={c.y}
                            width={SANKEY.BAR_W}
                            height={c.h}
                            fill={barColor}
                            rx={3}
                          />
                          {/* Category label + cost */}
                          <text
                            x={c.x + SANKEY.LABEL_OFFSET_RIGHT}
                            y={c.y + 11}
                            fontSize={10}
                            fontWeight={600}
                            fill="#1e293b"
                          >
                            {truncate(c.label, 45)}
                            {catCost > 0 && (
                              <tspan fill="#64748b" fontWeight={500} fontFamily="monospace" fontSize={9}>
                                {" "}{formatCurrency(catCost)}
                              </tspan>
                            )}
                          </text>
                          {/* Secondary info: % of total + part count */}
                          {systemTotal > 0 && (
                            <text
                              x={c.x + SANKEY.LABEL_OFFSET_RIGHT}
                              y={c.y + 22}
                              fontSize={8}
                              fill="#94a3b8"
                            >
                              {Math.round((catCost / systemTotal) * 100)}% of total · {c.partCount} part{c.partCount !== 1 ? "s" : ""}
                            </text>
                          )}
                          {/* Parts with costs */}
                          {c.parts.map((part, pi) => {
                            const modColor = moduleColorMap.get(part.moduleId) ?? "#94a3b8"
                            const py = c.y + CATEGORY_NAME_H + pi * PART_ROW_H + 4
                            const cost = partCostMap.get(part.name)
                            return (
                              <g key={pi}>
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
                                  {truncate(part.name, 40)}
                                </text>
                                {cost != null && cost > 0 && (
                                  <text
                                    x={c.x + SANKEY.BAR_W + 520}
                                    y={py + 3}
                                    fontSize={8}
                                    fill="#64748b"
                                    fontFamily="monospace"
                                    textAnchor="end"
                                  >
                                    {formatCurrency(cost)}
                                  </text>
                                )}
                              </g>
                            )
                          })}
                        </g>
                      )
                    })}
                  </g>

                  {/* Horizontal ranked supplier bars with costs */}
                  <g>
                    {layout.rankGroups.map((group) => {
                      const catColor = catColorMap.get(group.catId) ?? "#475569"
                      const rankedIds = categoryRankings?.get(group.catId) ?? []

                      return (
                        <g key={group.catId}>
                          {/* Category header on right */}
                          <text
                            x={group.x}
                            y={group.y + 12}
                            fontSize={9}
                            fontWeight={600}
                            fill="#64748b"
                          >
                            {truncate(sortedCategories.find((c) => c.id === group.catId)?.label ?? "", 40)}
                          </text>

                          {/* Horizontal supplier bars */}
                          {group.entries.map((entry, ei) => {
                            const isFirst = ei === 0 && rankedIds[0] === entry.supplierId
                            const barW = isFirst ? SUPPLIER_BAR.FIRST_W : SUPPLIER_BAR.BACKUP_W
                            const barX = group.x + (ei === 0
                              ? 0
                              : SUPPLIER_BAR.FIRST_W + SUPPLIER_BAR.BAR_GAP + (ei - 1) * (SUPPLIER_BAR.BACKUP_W + SUPPLIER_BAR.BAR_GAP))
                            const barY = group.y + CATEGORY_NAME_H
                            const cat = sortedCategories.find((c) => c.id === group.catId)
                            const partCount = cat?.partCount ?? 0

                            // INTENT: Cost label with "(N parts)" clarifier when category has >1 part
                            const costLabel = isFirst && entry.allocatedCost > 0
                              ? `${formatCurrency(entry.allocatedCost)}${partCount > 1 ? ` (${partCount} parts)` : ""}`
                              : `${Math.round(entry.aggregateScore)}%`

                            return (
                              <g
                                key={entry.supplierId}
                                style={{ cursor: onPromoteSupplier ? "pointer" : undefined }}
                                onClick={onPromoteSupplier ? () => onPromoteSupplier(group.catId, entry.supplierId) : undefined}
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
                                {/* Supplier name */}
                                <text
                                  x={barX + 6}
                                  y={barY + 11}
                                  fontSize={9}
                                  fontWeight={isFirst ? 700 : 500}
                                  fill={isFirst ? "#ffffff" : "#334155"}
                                >
                                  {truncate(entry.name, isFirst ? 18 : 12)}
                                  <title>{entry.name} — {Math.round(entry.aggregateScore)}% match</title>
                                </text>
                                {/* Cost (for 1st choice) or score (for backups) */}
                                <text
                                  x={barX + barW - (onSupplierClick ? 18 : 6)}
                                  y={barY + 11}
                                  fontSize={8}
                                  fontFamily={isFirst && entry.allocatedCost > 0 ? "monospace" : undefined}
                                  fontWeight={isFirst && entry.allocatedCost > 0 ? 600 : 400}
                                  fill={isFirst ? "#ffffffcc" : "#94a3b8"}
                                  textAnchor="end"
                                >
                                  {costLabel}
                                </text>
                                {/* Info icon — opens supplier detail dialog */}
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

                          {/* "+N more" chip */}
                          {group.moreCount > 0 && (
                            (() => {
                              const chipX = group.x
                                + SUPPLIER_BAR.FIRST_W + SUPPLIER_BAR.BAR_GAP
                                + Math.max(0, Math.min(group.entries.length - 1, SUPPLIER_BAR.MAX_VISIBLE - 1)) * (SUPPLIER_BAR.BACKUP_W + SUPPLIER_BAR.BAR_GAP)
                              const chipY = group.y + CATEGORY_NAME_H
                              return (
                                <g>
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
                                  >
                                    +{group.moreCount} more
                                  </text>
                                </g>
                              )
                            })()
                          )}
                        </g>
                      )
                    })}
                  </g>

                </svg>

                {/* HTML overlay: Buy category purchase cards */}
                {(() => {
                  const svgScale = costSvgWidth > 0 ? costSvgWidth / VB_W : 1
                  return (
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
                                        {result.products.slice(0, 2).map((product, pi) => (
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
                  )
                })()}
              </div>
            </div>

            {/* System total */}
            <div className="flex items-center justify-between p-3 border-2 rounded-lg">
              <span className="text-sm font-semibold text-foreground">System Total</span>
              <span className="text-sm font-bold font-mono text-foreground">{formatCurrency(systemTotal)} / unit</span>
            </div>

            {/* Per-module override list (compact) */}
            {onCostOverride && (
              <div className="space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Per-Module Overrides</p>
                {costs.map((c) => {
                  const isEditing = editingModuleId === c.moduleId
                  return (
                    <div key={c.moduleId} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/30 transition-colors">
                      <span className="text-xs text-foreground flex-1 min-w-0 truncate">{c.moduleName}</span>
                      <span className="text-xs font-mono text-foreground flex-shrink-0">
                        {c.totalPerUnit > 0 ? formatCurrency(c.totalPerUnit) : "—"}
                      </span>
                      {c.hasOverride && (
                        <span className="text-[9px] text-international-orange font-mono flex-shrink-0">override</span>
                      )}
                      {isEditing ? (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="text-[10px] text-muted-foreground">£</span>
                          <Input
                            type="number"
                            min={0}
                            step={10}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleOverrideApply(c.moduleId, editValue)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleOverrideApply(c.moduleId, editValue)
                              if (e.key === "Escape") setEditingModuleId(null)
                            }}
                            className="h-6 w-20 text-xs"
                            autoFocus
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingModuleId(c.moduleId)
                            setEditValue(c.hasOverride ? String(c.overrideTotal) : "")
                          }}
                          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                        >
                          {c.hasOverride ? "Edit" : "Override"}
                        </button>
                      )}
                      {c.hasOverride && !isEditing && (
                        <button
                          type="button"
                          onClick={() => handleOverrideReset(c.moduleId)}
                          className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors flex-shrink-0"
                        >
                          <RotateCcw className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* Disclaimer */}
        <div className="rounded-lg border border-status-info/30 bg-status-info-light/20 p-3 space-y-1">
          <p className="text-xs font-medium text-foreground">
            These are internal budget estimates based on industry rates.
          </p>
          {shortlistedSupplierCount > 0 ? (
            <p className="text-[11px] text-muted-foreground">
              {shortlistedSupplierCount} supplier{shortlistedSupplierCount !== 1 ? "s" : ""} shortlisted — send RFQs from the Shortlist tab to get real pricing.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Compare against real supplier quotes on the Shortlist tab.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
