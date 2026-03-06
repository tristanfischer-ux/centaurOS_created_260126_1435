/**
 * @file assembly-convergence-flow.tsx — 3-column Convergence Sankey SVG.
 *
 * @description The visual inverse of the Source procurement flow. Source fans out
 * (1 product -> many parts -> many suppliers). Assembly converges (many sourced
 * categories -> assembler(s) -> 1 shipped product).
 *
 * Three columns:
 *   Left (x=10)   — Sourced categories (reuses buildSankeyData from sankey-utils)
 *   Middle (x=520) — Assembly tier nodes (Tier 1 sub-assembly + Tier 2 final)
 *   Right (x=1050) — Final assembled product node
 *
 * @related
 * - sankey-utils.ts — shared constants, flowPath, buildSankeyData, CAT_COLORS
 * - supplier-procurement-flow.tsx — Source stage equivalent (fan-out)
 */

"use client"

import { useMemo, useState, useCallback } from "react"
import {
  SANKEY,
  CAT_COLORS,
  flowPath,
  truncate,
  buildSankeyData,
} from "@/lib/sankey-utils"
import type { CategoryNode } from "@/lib/sankey-utils"
import type { CadLabModule, AiCostEstimate } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"
import type { AssemblyCompanyMatch, AssemblyTierNode } from "@/lib/assembly-utils"

// ─── Layout constants ───────────────────────────────────────────────

const COL = {
  LEFT_X: 10,
  LEFT_BAR_W: 14,
  LEFT_LABEL_X: 30,
  MID_X: 520,
  MID_BAR_W: 280,
  RIGHT_X: 1050,
  RIGHT_W: 200,
  SVG_W: 1300,
  CONTENT_TOP: 24,
  GAP: 12,
  ASSEMBLER_BAR_H: 48,
  ASSEMBLER_GAP: 16,
  PRODUCT_MIN_H: 120,
} as const

// ─── Props ──────────────────────────────────────────────────────────

interface AssemblyConvergenceFlowProps {
  modules: CadLabModule[]
  diagnosticAnswers: DiagnosticAnswers | undefined
  aiCostEstimates: Record<string, AiCostEstimate> | undefined
  subject: string
  assemblerMatches: AssemblyCompanyMatch[]
  tierConfig: [string, AssemblyTierNode][]
  onAssignCategory: (categoryId: string, assemblerId: string) => void
  totalEstimatedCost: number | null
}

// ─── Component ──────────────────────────────────────────────────────

export function AssemblyConvergenceFlow({
  modules,
  diagnosticAnswers,
  aiCostEstimates,
  subject,
  assemblerMatches,
  tierConfig,
  onAssignCategory,
  totalEstimatedCost,
}: AssemblyConvergenceFlowProps) {
  const [hoveredCat, setHoveredCat] = useState<string | null>(null)
  const [hoveredAssembler, setHoveredAssembler] = useState<string | null>(null)

  // ── Build category data from modules (same as Source stage) ──
  const { categories, totalParts } = useMemo(
    () => buildSankeyData(modules, diagnosticAnswers, aiCostEstimates),
    [modules, diagnosticAnswers, aiCostEstimates],
  )

  // ── Build tier map for lookup ──
  const tierMap = useMemo(() => new Map(tierConfig), [tierConfig])

  // ── Build assembler nodes (Tier 2 first, then Tier 1) ──
  const assemblerNodes = useMemo(() => {
    if (tierConfig.length === 0 && assemblerMatches.length > 0) {
      // INTENT: Default flat mode — top assembler as Tier 2 final
      const top = assemblerMatches[0]
      return [{
        id: top.id,
        name: top.name,
        score: top.matchScore,
        tierLevel: 2 as const,
        assignedCategories: categories.map((c) => c.id),
        isVerified: top.isVerified,
      }]
    }

    return tierConfig.map(([id, node]) => {
      const match = assemblerMatches.find((m) => m.id === id)
      return {
        id,
        name: node.assemblerName,
        score: match?.matchScore ?? 0,
        tierLevel: node.tierLevel,
        assignedCategories: node.assignedCategories,
        isVerified: match?.isVerified ?? false,
      }
    }).sort((a, b) => a.tierLevel - b.tierLevel)
  }, [tierConfig, assemblerMatches, categories])

  // ── Compute category positions (left column) ──
  const categoryLayout = useMemo(() => {
    let y = COL.CONTENT_TOP
    return categories.map((cat, i) => {
      const barH = Math.max(SANKEY.BAR_MIN_H, cat.partCount * SANKEY.BAR_H_UNIT)
      const top = y
      y += barH + COL.GAP
      return { ...cat, top, barH, color: CAT_COLORS[i % CAT_COLORS.length] }
    })
  }, [categories])

  // ── Compute assembler positions (middle column) ──
  const assemblerLayout = useMemo(() => {
    const totalCatHeight = categoryLayout.length > 0
      ? categoryLayout[categoryLayout.length - 1].top + categoryLayout[categoryLayout.length - 1].barH - COL.CONTENT_TOP
      : 200

    if (assemblerNodes.length === 0) return []

    // Position assemblers vertically centered relative to their assigned categories
    return assemblerNodes.map((node) => {
      // Find the vertical range of assigned categories
      const assignedCats = categoryLayout.filter((c) => node.assignedCategories.includes(c.id))
      let top: number
      let barH: number

      if (assignedCats.length > 0) {
        const minY = Math.min(...assignedCats.map((c) => c.top))
        const maxY = Math.max(...assignedCats.map((c) => c.top + c.barH))
        top = minY
        barH = Math.max(COL.ASSEMBLER_BAR_H, maxY - minY)
      } else {
        // Tier 2 (final) spans everything
        top = COL.CONTENT_TOP
        barH = Math.max(COL.ASSEMBLER_BAR_H, totalCatHeight)
      }

      return { ...node, top, barH }
    })
  }, [assemblerNodes, categoryLayout])

  // ── Compute product node (right column) ──
  const productLayout = useMemo(() => {
    const totalCatHeight = categoryLayout.length > 0
      ? categoryLayout[categoryLayout.length - 1].top + categoryLayout[categoryLayout.length - 1].barH - COL.CONTENT_TOP
      : 200
    const h = Math.max(COL.PRODUCT_MIN_H, totalCatHeight)
    return {
      top: COL.CONTENT_TOP,
      height: h,
      centerY: COL.CONTENT_TOP + h / 2,
    }
  }, [categoryLayout])

  // ── Total SVG height ──
  const svgHeight = useMemo(() => {
    const catBottom = categoryLayout.length > 0
      ? categoryLayout[categoryLayout.length - 1].top + categoryLayout[categoryLayout.length - 1].barH
      : 200
    return Math.max(catBottom + SANKEY.PADDING_BOTTOM, productLayout.top + productLayout.height + SANKEY.PADDING_BOTTOM)
  }, [categoryLayout, productLayout])

  // ── Hover handlers ──
  const handleCatHover = useCallback((catId: string | null) => {
    setHoveredCat(catId)
    setHoveredAssembler(null)
  }, [])

  const handleAssemblerHover = useCallback((asmId: string | null) => {
    setHoveredAssembler(asmId)
    setHoveredCat(null)
  }, [])

  // ── Determine if a flow ribbon should be highlighted ──
  const isRibbonHighlighted = useCallback((catId: string, asmId: string) => {
    if (!hoveredCat && !hoveredAssembler) return false
    if (hoveredCat === catId) return true
    if (hoveredAssembler === asmId) return true
    return false
  }, [hoveredCat, hoveredAssembler])

  // ── Get ribbon opacity ──
  const ribbonOpacity = useCallback((catId: string, asmId: string) => {
    if (!hoveredCat && !hoveredAssembler) return 0.35
    return isRibbonHighlighted(catId, asmId) ? 0.6 : 0.1
  }, [hoveredCat, hoveredAssembler, isRibbonHighlighted])

  // ── No data state ──
  if (categories.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        No sourced categories to display. Complete the Source stage first.
      </div>
    )
  }

  // ── Build flow paths ──
  // INTENT: For each category, draw a ribbon to its assigned assembler (or the final assembler)
  const flowRibbons: {
    catId: string
    asmId: string
    path: string
    color: string
    opacity: number
  }[] = []

  for (const cat of categoryLayout) {
    // Find which assembler this category routes to
    let targetAsm = assemblerLayout.find((a) =>
      a.assignedCategories.includes(cat.id),
    )
    // INTENT: If no specific assignment, route to the Tier 2 (final) assembler
    if (!targetAsm) {
      targetAsm = assemblerLayout.find((a) => a.tierLevel === 2)
    }

    if (targetAsm) {
      // Compute vertical position within the assembler bar
      const assignedCats = categoryLayout.filter((c) =>
        targetAsm!.assignedCategories.includes(c.id),
      )
      const catIdx = assignedCats.findIndex((c) => c.id === cat.id)
      const slotH = targetAsm.barH / Math.max(assignedCats.length, 1)
      const asmY1 = targetAsm.top + catIdx * slotH
      const asmY2 = asmY1 + slotH

      const path = flowPath(
        COL.LEFT_X + COL.LEFT_BAR_W, cat.top, cat.top + cat.barH,
        COL.MID_X, asmY1, asmY2,
      )

      flowRibbons.push({
        catId: cat.id,
        asmId: targetAsm.id,
        path,
        color: cat.color,
        opacity: ribbonOpacity(cat.id, targetAsm.id),
      })
    }
  }

  // Assembler -> Product ribbons
  const asmToProductRibbons: {
    asmId: string
    path: string
    opacity: number
  }[] = []

  for (const asm of assemblerLayout) {
    if (asm.tierLevel === 2 || assemblerLayout.length === 1) {
      // Final assembler connects to product
      const path = flowPath(
        COL.MID_X + COL.MID_BAR_W, asm.top, asm.top + asm.barH,
        COL.RIGHT_X, productLayout.top, productLayout.top + productLayout.height,
      )
      asmToProductRibbons.push({
        asmId: asm.id,
        path,
        opacity: hoveredAssembler === asm.id ? 0.6 : (!hoveredAssembler && !hoveredCat ? 0.35 : 0.1),
      })
    }
  }

  // Tier 1 -> Tier 2 ribbons
  const tier1ToTier2Ribbons: {
    fromId: string
    toId: string
    path: string
    opacity: number
  }[] = []

  const tier2Nodes = assemblerLayout.filter((a) => a.tierLevel === 2)
  const tier1Nodes = assemblerLayout.filter((a) => a.tierLevel === 1)

  if (tier2Nodes.length > 0 && tier1Nodes.length > 0) {
    const tier2 = tier2Nodes[0]
    for (const t1 of tier1Nodes) {
      // T1 -> T2 ribbon
      const slotH = tier2.barH / Math.max(tier1Nodes.length + 1, 1) // +1 for direct buy parts
      const idx = tier1Nodes.indexOf(t1)
      const t2Y1 = tier2.top + idx * slotH
      const t2Y2 = t2Y1 + slotH

      const path = flowPath(
        COL.MID_X + COL.MID_BAR_W, t1.top, t1.top + t1.barH,
        COL.MID_X, t2Y1, t2Y2, // INTENT: Tier 1 exits right, Tier 2 enters left (same column, just offset)
      )
      const isHl = hoveredAssembler === t1.id || hoveredAssembler === tier2.id
      tier1ToTier2Ribbons.push({
        fromId: t1.id,
        toId: tier2.id,
        path,
        opacity: isHl ? 0.6 : (!hoveredAssembler && !hoveredCat ? 0.3 : 0.08),
      })
    }
  }

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${COL.SVG_W} ${svgHeight}`}
        className="w-full min-w-[900px]"
        style={{ minHeight: Math.min(svgHeight, 600) }}
      >
        {/* ── Column headers ── */}
        <text x={COL.LEFT_X} y={14} className="fill-muted-foreground text-[11px] font-medium">
          Sourced Categories
        </text>
        <text x={COL.MID_X} y={14} className="fill-muted-foreground text-[11px] font-medium">
          {assemblerLayout.length > 0 ? "Assembly" : "Assembly (none matched)"}
        </text>
        <text x={COL.RIGHT_X} y={14} className="fill-muted-foreground text-[11px] font-medium">
          Final Product
        </text>

        {/* ── Flow ribbons: Categories -> Assemblers ── */}
        {flowRibbons.map((r, i) => (
          <path
            key={`cat-asm-${i}`}
            d={r.path}
            fill={r.color}
            opacity={r.opacity}
            className="transition-opacity duration-200"
          />
        ))}

        {/* ── Flow ribbons: Tier 1 -> Tier 2 ── */}
        {tier1ToTier2Ribbons.map((r, i) => (
          <path
            key={`t1-t2-${i}`}
            d={r.path}
            fill="#64748b"
            opacity={r.opacity}
            className="transition-opacity duration-200"
          />
        ))}

        {/* ── Flow ribbons: Assembler -> Product ── */}
        {asmToProductRibbons.map((r, i) => (
          <path
            key={`asm-prod-${i}`}
            d={r.path}
            fill="#ff4500"
            opacity={r.opacity}
            className="transition-opacity duration-200"
          />
        ))}

        {/* ── Left column: Category bars ── */}
        {categoryLayout.map((cat) => {
          const isHighlighted = hoveredCat === cat.id ||
            (hoveredAssembler && assemblerLayout.find((a) => a.id === hoveredAssembler)?.assignedCategories.includes(cat.id))
          const barOpacity = (!hoveredCat && !hoveredAssembler) ? 1 : (isHighlighted ? 1 : 0.4)

          return (
            <g
              key={cat.id}
              onMouseEnter={() => handleCatHover(cat.id)}
              onMouseLeave={() => handleCatHover(null)}
              style={{ cursor: "pointer", opacity: barOpacity }}
              className="transition-opacity duration-200"
            >
              {/* Category bar */}
              <rect
                x={COL.LEFT_X}
                y={cat.top}
                width={COL.LEFT_BAR_W}
                height={cat.barH}
                rx={3}
                fill={cat.color}
              />
              {/* Category label */}
              <text
                x={COL.LEFT_LABEL_X}
                y={cat.top + 14}
                className="fill-foreground text-[12px] font-medium"
              >
                {truncate(cat.label, 32)}
              </text>
              {/* Part count */}
              <text
                x={COL.LEFT_LABEL_X}
                y={cat.top + 28}
                className="fill-muted-foreground text-[10px]"
              >
                {cat.partCount} part{cat.partCount !== 1 ? "s" : ""}
              </text>
              {/* Part list (compact) */}
              {cat.parts.slice(0, 4).map((part, pi) => (
                <g key={`${cat.id}-p-${pi}`}>
                  <circle
                    cx={COL.LEFT_LABEL_X + 4}
                    cy={cat.top + 42 + pi * 14}
                    r={2.5}
                    fill={cat.color}
                  />
                  <text
                    x={COL.LEFT_LABEL_X + 12}
                    y={cat.top + 45 + pi * 14}
                    className="fill-muted-foreground text-[10px]"
                  >
                    {truncate(part.name, 28)}
                  </text>
                </g>
              ))}
              {cat.parts.length > 4 && (
                <text
                  x={COL.LEFT_LABEL_X + 12}
                  y={cat.top + 45 + 4 * 14}
                  className="fill-muted-foreground text-[10px] italic"
                >
                  +{cat.parts.length - 4} more
                </text>
              )}
            </g>
          )
        })}

        {/* ── Middle column: Assembler nodes ── */}
        {assemblerLayout.map((asm) => {
          const isHighlighted = hoveredAssembler === asm.id ||
            (hoveredCat && asm.assignedCategories.includes(hoveredCat))
          const barOpacity = (!hoveredCat && !hoveredAssembler) ? 1 : (isHighlighted ? 1 : 0.4)
          const tierLabel = asm.tierLevel === 1 ? "Sub-Assembly" : "Final Assembly"
          const tierColor = asm.tierLevel === 1 ? "#64748b" : "#ff4500"

          return (
            <g
              key={asm.id}
              onMouseEnter={() => handleAssemblerHover(asm.id)}
              onMouseLeave={() => handleAssemblerHover(null)}
              style={{ cursor: "pointer", opacity: barOpacity }}
              className="transition-opacity duration-200"
            >
              {/* Assembler bar */}
              <rect
                x={COL.MID_X}
                y={asm.top}
                width={COL.MID_BAR_W}
                height={Math.max(asm.barH, COL.ASSEMBLER_BAR_H)}
                rx={6}
                fill="white"
                stroke={tierColor}
                strokeWidth={2}
              />
              {/* Tier label badge */}
              <rect
                x={COL.MID_X + 8}
                y={asm.top + 8}
                width={tierLabel.length * 6.5 + 12}
                height={18}
                rx={9}
                fill={tierColor}
                opacity={0.15}
              />
              <text
                x={COL.MID_X + 14}
                y={asm.top + 21}
                className="text-[10px] font-semibold"
                fill={tierColor}
              >
                {tierLabel}
              </text>
              {/* Assembler name */}
              <text
                x={COL.MID_X + 8}
                y={asm.top + 42}
                className="fill-foreground text-[13px] font-semibold"
              >
                {truncate(asm.name, 30)}
              </text>
              {/* Score badge */}
              {asm.score > 0 && (
                <>
                  <rect
                    x={COL.MID_X + COL.MID_BAR_W - 52}
                    y={asm.top + 8}
                    width={44}
                    height={18}
                    rx={9}
                    fill={asm.score >= 50 ? "#059669" : asm.score >= 30 ? "#d97706" : "#dc2626"}
                    opacity={0.15}
                  />
                  <text
                    x={COL.MID_X + COL.MID_BAR_W - 48}
                    y={asm.top + 21}
                    className="text-[10px] font-semibold"
                    fill={asm.score >= 50 ? "#059669" : asm.score >= 30 ? "#d97706" : "#dc2626"}
                  >
                    {Math.round(asm.score)}pts
                  </text>
                </>
              )}
              {/* Verified badge */}
              {asm.isVerified && (
                <text
                  x={COL.MID_X + 8}
                  y={asm.top + 58}
                  className="fill-success text-[10px]"
                >
                  Verified
                </text>
              )}
              {/* Assigned category count */}
              <text
                x={COL.MID_X + 8}
                y={asm.top + Math.max(asm.barH, COL.ASSEMBLER_BAR_H) - 8}
                className="fill-muted-foreground text-[10px]"
              >
                {asm.assignedCategories.length} categor{asm.assignedCategories.length !== 1 ? "ies" : "y"} assigned
              </text>
            </g>
          )
        })}

        {/* ── Empty assembler placeholder ── */}
        {assemblerLayout.length === 0 && (
          <g>
            <rect
              x={COL.MID_X}
              y={COL.CONTENT_TOP}
              width={COL.MID_BAR_W}
              height={80}
              rx={6}
              fill="none"
              stroke="#d1d5db"
              strokeWidth={2}
              strokeDasharray="8 4"
            />
            <text
              x={COL.MID_X + COL.MID_BAR_W / 2}
              y={COL.CONTENT_TOP + 36}
              textAnchor="middle"
              className="fill-muted-foreground text-[12px]"
            >
              Click &quot;Match Assemblers&quot;
            </text>
            <text
              x={COL.MID_X + COL.MID_BAR_W / 2}
              y={COL.CONTENT_TOP + 52}
              textAnchor="middle"
              className="fill-muted-foreground text-[11px]"
            >
              to find assembly companies
            </text>
          </g>
        )}

        {/* ── Right column: Product node ── */}
        <rect
          x={COL.RIGHT_X}
          y={productLayout.top}
          width={COL.RIGHT_W}
          height={productLayout.height}
          rx={12}
          fill="white"
          stroke="#ff4500"
          strokeWidth={2.5}
        />
        {/* Product icon area */}
        <rect
          x={COL.RIGHT_X + 8}
          y={productLayout.top + 8}
          width={COL.RIGHT_W - 16}
          height={32}
          rx={6}
          fill="#ff4500"
          opacity={0.08}
        />
        <text
          x={COL.RIGHT_X + COL.RIGHT_W / 2}
          y={productLayout.top + 28}
          textAnchor="middle"
          className="text-[11px] font-semibold"
          fill="#ff4500"
        >
          FINAL PRODUCT
        </text>
        {/* Product name */}
        <text
          x={COL.RIGHT_X + COL.RIGHT_W / 2}
          y={productLayout.centerY - 8}
          textAnchor="middle"
          className="fill-foreground text-[14px] font-bold"
        >
          {truncate(subject, 18)}
        </text>
        {/* Part count */}
        <text
          x={COL.RIGHT_X + COL.RIGHT_W / 2}
          y={productLayout.centerY + 10}
          textAnchor="middle"
          className="fill-muted-foreground text-[11px]"
        >
          {totalParts} parts total
        </text>
        {/* Estimated cost */}
        {totalEstimatedCost != null && totalEstimatedCost > 0 && (
          <text
            x={COL.RIGHT_X + COL.RIGHT_W / 2}
            y={productLayout.centerY + 28}
            textAnchor="middle"
            className="fill-foreground text-[13px] font-semibold"
          >
            {"\u00a3"}{totalEstimatedCost.toLocaleString()}
          </text>
        )}
        {/* Ship ready badge */}
        <rect
          x={COL.RIGHT_X + COL.RIGHT_W / 2 - 40}
          y={productLayout.top + productLayout.height - 32}
          width={80}
          height={20}
          rx={10}
          fill="#059669"
          opacity={0.12}
        />
        <text
          x={COL.RIGHT_X + COL.RIGHT_W / 2}
          y={productLayout.top + productLayout.height - 18}
          textAnchor="middle"
          className="text-[10px] font-semibold"
          fill="#059669"
        >
          Ship Ready
        </text>
      </svg>
    </div>
  )
}
