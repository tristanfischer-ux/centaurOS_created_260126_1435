/**
 * @file supplier-procurement-flow.tsx — 2-column SVG Sankey: Modules → Categories.
 *
 * @description Read-only decomposition diagram showing how modules break down into
 * manufacturing/buy categories. No interactive supplier matching — that lives on
 * the Shortlist tab via "Match All Modules".
 *
 * FLOW: source/page.tsx → this component (Suppliers tab)
 */

"use client"

import { useMemo, useState, useCallback } from "react"
import type { CadLabModule, AiCostEstimate } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "./cad-lab-diagnostics"
import {
  type ModuleNode,
  type CategoryNode,
  SANKEY,
  CAT_COLORS,
  moduleColorFn,
  flowFill,
  flowPath,
  truncate,
  buildSankeyData,
  sortCategoriesBuyLast,
} from "@/lib/sankey-utils"

// ─── Props ───────────────────────────────────────────────────────────

export interface SupplierProcurementFlowProps {
  modules: CadLabModule[]
  diagnosticAnswers?: DiagnosticAnswers
  aiCostEstimates?: Record<string, AiCostEstimate>
  /**
   * Shortlist coverage per category key. When supplied, each category node
   * shows an inline "N/target" pill — green when met, amber when short. Target
   * defaults to 2 (Round 2 decision: dual-source each category for redundancy).
   * Buy-type categories aren't gated the same way and are skipped.
   */
  coverageByCategory?: Map<string, { shortlisted: number; target: number }>
}

// ─── SVG layout constants ────────────────────────────────────────────

const VB_W = 1300
const COL_MODS_X = 10
const COL_CATS_X = 780
const PART_LIST_X = 32
const PART_ROW_H = 13
const PART_DOT_R = 3
const MODULE_NAME_H = 16
const CATEGORY_NAME_H = 16

// ─── Layout types ────────────────────────────────────────────────────

interface DecompositionLayout {
  modules: Array<ModuleNode & { x: number; y: number; h: number; color: string }>
  categories: Array<CategoryNode & { x: number; y: number; h: number }>
  modToCatFlows: Array<{
    moduleId: string; catId: string
    x1: number; y1t: number; y1b: number
    x2: number; y2t: number; y2b: number
    color: string; partCount: number
  }>
  viewBoxHeight: number
}

// ─── Compute layout ──────────────────────────────────────────────────

function computeLayout(
  moduleNodes: ModuleNode[],
  categories: CategoryNode[],
  moduleColorMap: Map<string, string>,
): DecompositionLayout {
  // --- Modules column (left) ---
  const layoutModules: DecompositionLayout["modules"] = []
  let my = SANKEY.CONTENT_TOP

  for (const mod of moduleNodes) {
    const h = Math.max(MODULE_NAME_H + mod.partCount * PART_ROW_H + 4, SANKEY.BAR_MIN_H)
    const color = moduleColorMap.get(mod.id) ?? "hsl(0,0%,60%)"
    layoutModules.push({ ...mod, x: COL_MODS_X, y: my, h, color })
    my += h + SANKEY.MODULE_GAP
  }

  const totalModsHeight = my

  // --- Categories column (right): sort by center-of-gravity of source modules ---
  const modYMap = new Map<string, number>()
  for (const lm of layoutModules) modYMap.set(lm.id, lm.y + lm.h / 2)

  const catsWithCoG = categories.map((cat) => {
    let totalY = 0, totalWeight = 0
    for (const [modId, count] of cat.moduleContributions) {
      const modCenter = modYMap.get(modId)
      if (modCenter !== undefined) {
        totalY += modCenter * count
        totalWeight += count
      }
    }
    return { cat, centerOfGravity: totalWeight > 0 ? totalY / totalWeight : 0 }
  })
  catsWithCoG.sort((a, b) =>
    sortCategoriesBuyLast(
      { type: a.cat.type, centerOfGravity: a.centerOfGravity },
      { type: b.cat.type, centerOfGravity: b.centerOfGravity },
    )
  )

  const layoutCats: DecompositionLayout["categories"] = []
  let cy = SANKEY.CONTENT_TOP
  for (const { cat } of catsWithCoG) {
    const h = Math.max(CATEGORY_NAME_H + cat.parts.length * PART_ROW_H + 4, SANKEY.BAR_MIN_H)
    layoutCats.push({ ...cat, x: COL_CATS_X, y: cy, h })
    cy += h + SANKEY.CAT_GAP
  }

  // Re-center categories so their center aligns with modules center
  const catsTotalH = cy - SANKEY.CAT_GAP
  const centerOffset = (totalModsHeight / 2) - (catsTotalH / 2)
  if (centerOffset > 0) {
    for (const lc of layoutCats) lc.y += centerOffset
  }

  // --- Module → Category flows ---
  const modOutCursors = new Map<string, number>()
  for (const lm of layoutModules) modOutCursors.set(lm.id, lm.y)

  const catInCursors = new Map<string, number>()
  for (const lc of layoutCats) catInCursors.set(lc.id, lc.y)

  const modToCatFlows: DecompositionLayout["modToCatFlows"] = []

  for (const lm of layoutModules) {
    for (const catKey of lm.categoryKeys) {
      const lc = layoutCats.find((c) => c.id === catKey)
      if (!lc) continue

      const cat = categories.find((c) => c.id === catKey)
      if (!cat) continue

      const partCount = cat.moduleContributions.get(lm.id) ?? 0
      if (partCount === 0) continue

      const modSlice = (lm.h / Math.max(lm.partCount, 1)) * partCount
      const modCursor = modOutCursors.get(lm.id) ?? lm.y

      const catSlice = (lc.h / Math.max(cat.partCount, 1)) * partCount
      const catCursor = catInCursors.get(lc.id) ?? lc.y

      modToCatFlows.push({
        moduleId: lm.id,
        catId: lc.id,
        x1: lm.x + SANKEY.BAR_W,
        y1t: modCursor,
        y1b: modCursor + modSlice,
        x2: lc.x,
        y2t: catCursor,
        y2b: catCursor + catSlice,
        color: lm.color,
        partCount,
      })

      modOutCursors.set(lm.id, modCursor + modSlice)
      catInCursors.set(lc.id, catCursor + catSlice)
    }
  }

  // ViewBox height
  const maxY = Math.max(
    totalModsHeight,
    ...layoutCats.map((c) => c.y + c.h),
  )
  const viewBoxHeight = maxY + SANKEY.PADDING_BOTTOM

  return { modules: layoutModules, categories: layoutCats, modToCatFlows, viewBoxHeight }
}

// ─── Component ───────────────────────────────────────────────────────

export function SupplierProcurementFlow({
  modules,
  diagnosticAnswers,
  aiCostEstimates,
  coverageByCategory,
}: SupplierProcurementFlowProps): React.ReactNode {
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const moduleColorMap = useMemo(() => {
    const map = new Map<string, string>()
    modules.forEach((mod, i) => map.set(mod.id, moduleColorFn(i)))
    return map
  }, [modules])

  const { moduleNodes, categories, totalParts } = useMemo(
    () => buildSankeyData(modules, diagnosticAnswers, aiCostEstimates),
    [modules, diagnosticAnswers, aiCostEstimates],
  )

  const layout = useMemo(
    () => computeLayout(moduleNodes, categories, moduleColorMap),
    [moduleNodes, categories, moduleColorMap],
  )

  // Build category → color map from sorted layout order
  const catColorMap = useMemo(() => {
    const map = new Map<string, string>()
    layout.categories.forEach((c, i) => map.set(c.id, CAT_COLORS[i % CAT_COLORS.length]))
    return map
  }, [layout.categories])

  // ── Hover connectivity (module ↔ category only) ──
  const connectedToHover = useMemo(() => {
    if (!hoveredId) return null
    const connected = new Set<string>([hoveredId])

    if (hoveredId.startsWith("mod-")) {
      const modId = hoveredId.slice(4)
      for (const f of layout.modToCatFlows) {
        if (f.moduleId === modId) connected.add(`cat-${f.catId}`)
      }
    }

    if (hoveredId.startsWith("cat-")) {
      const catId = hoveredId.slice(4)
      for (const f of layout.modToCatFlows) {
        if (f.catId === catId) connected.add(`mod-${f.moduleId}`)
      }
    }

    return connected
  }, [hoveredId, layout])

  const getOpacity = useCallback(
    (id: string) => {
      if (!connectedToHover) return 1
      return connectedToHover.has(id) ? 1 : 0.1
    },
    [connectedToHover],
  )

  const getFlowOpacity = useCallback(
    (ids: string[]) => {
      if (!connectedToHover) return 0.35
      return ids.every((id) => connectedToHover.has(id)) ? 0.55 : 0.06
    },
    [connectedToHover],
  )

  if (modules.length === 0) return null

  return (
    <div className="rounded-lg border p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-foreground">Procurement Flow</span>
        <span className="text-[10px] font-medium text-muted-foreground">
          {modules.length} module{modules.length !== 1 ? "s" : ""}
          {" \u00b7 "}
          {totalParts} part{totalParts !== 1 ? "s" : ""}
          {" \u00b7 "}
          {categories.length} categor{categories.length !== 1 ? "ies" : "y"}
        </span>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Modules</p>
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider" style={{ paddingLeft: ((COL_CATS_X / VB_W) * 100) + "%" }}>Categories</p>
      </div>

      {/* SVG */}
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${VB_W} ${layout.viewBoxHeight}`}
          className="w-full h-auto"
          style={{ display: "block" }}
        >
          {/* Layer 1: Flow ribbons */}
          <g>
            {layout.modToCatFlows.map((f, i) => (
              <path
                key={`mc-${i}`}
                d={flowPath(f.x1, f.y1t, f.y1b, f.x2, f.y2t, f.y2b)}
                fill={flowFill(f.color, getFlowOpacity([`mod-${f.moduleId}`, `cat-${f.catId}`]))}
                className="transition-all duration-200"
              />
            ))}
          </g>

          {/* Layer 2: Module bars with inline parts */}
          <g>
            {layout.modules.map((m) => {
              const modId = `mod-${m.id}`
              return (
                <g key={m.id}>
                  <rect
                    x={m.x}
                    y={m.y}
                    width={SANKEY.BAR_W}
                    height={m.h}
                    fill={m.color}
                    rx={3}
                    opacity={getOpacity(modId)}
                    className="transition-opacity duration-200"
                  />
                  {/* Module name */}
                  <text
                    x={m.x + SANKEY.LABEL_OFFSET_RIGHT}
                    y={m.y + 12}
                    fontSize={10}
                    fontWeight={600}
                    fill="#1e293b"
                    opacity={getOpacity(modId)}
                    className="transition-opacity duration-200"
                  >
                    {truncate(m.name, 120)}
                    <title>{m.name}</title>
                  </text>
                  {/* Inline parts with colored dots */}
                  {m.partsWithCategories.map((part, pi) => {
                    const dotColor = catColorMap.get(part.categoryKey) ?? "#94a3b8"
                    const py = m.y + MODULE_NAME_H + pi * PART_ROW_H + 4
                    return (
                      <g key={pi} opacity={getOpacity(modId)} className="transition-opacity duration-200">
                        <circle
                          cx={m.x + PART_LIST_X}
                          cy={py}
                          r={PART_DOT_R}
                          fill={dotColor}
                        />
                        <text
                          x={m.x + PART_LIST_X + 8}
                          y={py + 3}
                          fontSize={9}
                          fill="#475569"
                        >
                          {truncate(part.name, 150)}
                        </text>
                      </g>
                    )
                  })}
                  {/* Hit area for hover */}
                  <rect
                    x={m.x - 2}
                    y={m.y - 1}
                    width={COL_CATS_X - COL_MODS_X - 10}
                    height={m.h + 2}
                    fill="transparent"
                    onMouseEnter={() => setHoveredId(modId)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{ cursor: "default" }}
                  />
                </g>
              )
            })}
          </g>

          {/* Layer 3: Category bars with inline parts (colored per-category) */}
          <g>
            {layout.categories.map((c) => {
              const catId = `cat-${c.id}`
              const barColor = catColorMap.get(c.id) ?? "#475569"
              return (
                <g key={c.id}>
                  <rect
                    x={c.x}
                    y={c.y}
                    width={SANKEY.BAR_W}
                    height={c.h}
                    fill={barColor}
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
                    {truncate(c.label, 120)}
                    <title>{c.label} — {c.partCount} part{c.partCount !== 1 ? "s" : ""}</title>
                  </text>
                  {/* Coverage pill: shortlisted suppliers vs. target for this category.
                      Buy categories skipped (no supplier shortlisting expected). */}
                  {coverageByCategory && c.type === "make" && (() => {
                    const cov = coverageByCategory.get(c.id)
                    const shortlisted = cov?.shortlisted ?? 0
                    const target = cov?.target ?? 2
                    const met = shortlisted >= target
                    const pillX = c.x + SANKEY.LABEL_OFFSET_RIGHT + 360
                    const pillY = c.y + 3
                    const pillFill = met ? "#22c55e" : shortlisted > 0 ? "#f59e0b" : "#ef4444"
                    const pillText = `${shortlisted}/${target} shortlisted`
                    return (
                      <g opacity={getOpacity(catId)} className="transition-opacity duration-200">
                        <rect
                          x={pillX}
                          y={pillY}
                          width={88}
                          height={13}
                          rx={6}
                          fill={pillFill}
                          fillOpacity={0.18}
                          stroke={pillFill}
                          strokeWidth={0.75}
                        />
                        <text
                          x={pillX + 44}
                          y={pillY + 9}
                          fontSize={8}
                          fontWeight={600}
                          fill={pillFill}
                          textAnchor="middle"
                        >
                          {pillText}
                          <title>
                            {met
                              ? `Coverage met: ${shortlisted}/${target} suppliers shortlisted for redundancy.`
                              : shortlisted > 0
                              ? `Coverage thin: add ${target - shortlisted} more supplier${target - shortlisted !== 1 ? "s" : ""} to hit dual-source target.`
                              : `No supplier shortlisted yet — single-source risk.`}
                          </title>
                        </text>
                      </g>
                    )
                  })()}
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
                          {truncate(part.name, 150)}
                        </text>
                      </g>
                    )
                  })}
                  {/* Hit area */}
                  <rect
                    x={c.x - 4}
                    y={c.y - 2}
                    width={VB_W - c.x + 4}
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

        </svg>
      </div>
    </div>
  )
}
