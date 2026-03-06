/**
 * @file assembly-convergence-flow.tsx — 3-column Convergence Sankey SVG.
 *
 * @description Category-first convergence diagram:
 *   Left: Agreed Suppliers (with embedded awarded supplier name)
 *   Middle: First Assembly (one or more assembler companies)
 *   Right: Final Assembly & Despatch
 *
 * Uses foreignObject for card-style nodes with proper text wrapping.
 * Font sizes match the Source page's supplier-procurement-flow (10px/9px).
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
import type { CategoryPart } from "@/lib/sankey-utils"
import type { CadLabModule, AiCostEstimate } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "@/components/cad/cad-lab-diagnostics"
import type { AssemblyCompanyMatch, AssemblyTierNode } from "@/lib/assembly-utils"
import type { ShortlistedSupplier } from "@/app/(platform)/the-forge/cad-lab/source/page"

// ─── Layout constants ───────────────────────────────────────────────
// INTENT: Compact layout matching Source page font sizes (10px/9px)

const COL = {
  LEFT_X: 10,
  LEFT_CARD_W: 200,
  CARD_H: 52,           // Fixed compact height for all category cards
  MID_X: 290,
  MID_BAR_W: 180,
  ASM_CARD_H: 68,       // Fixed compact height per assembler card
  ASM_GAP: 6,           // Gap between stacked assembler cards
  RIGHT_X: 560,
  RIGHT_W: 150,
  SVG_W: 750,
  CONTENT_TOP: 22,
  GAP: 6,
  PRODUCT_MIN_H: 90,
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
  shortlistedSuppliers: Map<string, ShortlistedSupplier>
  categoryRankings: Map<string, string[]>
}

// ─── Category layout node ───────────────────────────────────────────

interface CategoryLayoutNode {
  id: string
  label: string
  type: "buy" | "make"
  partCount: number
  parts: CategoryPart[]
  color: string
  barH: number
  top: number
  awardedSupplierName: string | null
  awardedSupplierScore: number | null
}

// ─── Component ──────────────────────────────────────────────────────

export function AssemblyConvergenceFlow({
  modules,
  diagnosticAnswers,
  aiCostEstimates,
  subject,
  assemblerMatches,
  tierConfig,
  totalEstimatedCost,
  shortlistedSuppliers,
  categoryRankings,
}: AssemblyConvergenceFlowProps) {
  const [hoveredLeft, setHoveredLeft] = useState<string | null>(null)
  const [hoveredAssembler, setHoveredAssembler] = useState<string | null>(null)

  // ── Build category data from modules ──
  const { categories, totalParts } = useMemo(
    () => buildSankeyData(modules, diagnosticAnswers, aiCostEstimates),
    [modules, diagnosticAnswers, aiCostEstimates],
  )

  // ── Build assembler nodes with full match data ──
  const assemblerNodes = useMemo(() => {
    if (tierConfig.length === 0 && assemblerMatches.length > 0) {
      const top = assemblerMatches[0]
      return [{
        id: top.id,
        name: top.name,
        score: top.matchScore,
        tierLevel: 2 as const,
        assignedCategories: categories.map((c) => c.id),
        isVerified: top.isVerified,
        locationCountry: top.locationCountry,
        typicalLeadDays: top.typicalLeadDays,
        capabilities: top.capabilities,
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
        locationCountry: match?.locationCountry ?? null,
        typicalLeadDays: match?.typicalLeadDays ?? null,
        capabilities: match?.capabilities ?? [],
      }
    }).sort((a, b) => a.tierLevel - b.tierLevel)
  }, [tierConfig, assemblerMatches, categories])

  // ── Build category-first left column with embedded supplier info ──
  const leftLayout = useMemo<CategoryLayoutNode[]>(() => {
    let y = COL.CONTENT_TOP
    return categories.map((cat, i) => {
      const barH = COL.CARD_H
      const top = y
      y += barH + COL.GAP

      // Look up awarded supplier for this category
      let awardedSupplierName: string | null = null
      let awardedSupplierScore: number | null = null

      if (cat.type === "buy") {
        awardedSupplierName = "Direct purchase"
      } else {
        const rankings = categoryRankings.get(cat.id)
        if (rankings && rankings.length > 0) {
          const topSupplierId = rankings[0]
          const supplier = shortlistedSuppliers.get(topSupplierId)
          if (supplier) {
            awardedSupplierName = supplier.name
            awardedSupplierScore = supplier.bestMatchScore
          }
        }
      }

      return {
        id: cat.id,
        label: cat.label,
        type: cat.type,
        partCount: cat.partCount,
        parts: cat.parts,
        color: CAT_COLORS[i % CAT_COLORS.length],
        barH,
        top,
        awardedSupplierName,
        awardedSupplierScore,
      }
    })
  }, [categories, categoryRankings, shortlistedSuppliers])

  // ── Compute assembler positions (middle column) ──
  // INTENT: Each assembler is a compact fixed-height card, stacked vertically.
  // Multiple assemblers stack independently — no stretching to match left column.
  const assemblerLayout = useMemo(() => {
    if (assemblerNodes.length === 0) return []

    // Center the assembler stack vertically relative to the left column
    const totalLeftHeight = leftLayout.length > 0
      ? leftLayout[leftLayout.length - 1].top + leftLayout[leftLayout.length - 1].barH - COL.CONTENT_TOP
      : 200
    const totalAsmHeight = assemblerNodes.length * COL.ASM_CARD_H + (assemblerNodes.length - 1) * COL.ASM_GAP
    const asmStartY = COL.CONTENT_TOP + Math.max(0, (totalLeftHeight - totalAsmHeight) / 2)

    return assemblerNodes.map((node, i) => {
      const top = asmStartY + i * (COL.ASM_CARD_H + COL.ASM_GAP)
      return { ...node, top, barH: COL.ASM_CARD_H }
    })
  }, [assemblerNodes, leftLayout])

  // ── Compute product node (right column) ──
  const productLayout = useMemo(() => {
    const totalLeftHeight = leftLayout.length > 0
      ? leftLayout[leftLayout.length - 1].top + leftLayout[leftLayout.length - 1].barH - COL.CONTENT_TOP
      : 200
    const h = Math.max(COL.PRODUCT_MIN_H, totalLeftHeight)
    return {
      top: COL.CONTENT_TOP,
      height: h,
      centerY: COL.CONTENT_TOP + h / 2,
    }
  }, [leftLayout])

  // ── Total SVG height ──
  const svgHeight = useMemo(() => {
    const leftBottom = leftLayout.length > 0
      ? leftLayout[leftLayout.length - 1].top + leftLayout[leftLayout.length - 1].barH
      : 200
    const asmBottom = assemblerLayout.length > 0
      ? assemblerLayout[assemblerLayout.length - 1].top + assemblerLayout[assemblerLayout.length - 1].barH
      : 0
    return Math.max(leftBottom, asmBottom, productLayout.top + productLayout.height) + SANKEY.PADDING_BOTTOM
  }, [leftLayout, assemblerLayout, productLayout])

  // ── Hover handlers ──
  const handleLeftHover = useCallback((id: string | null) => {
    setHoveredLeft(id)
    setHoveredAssembler(null)
  }, [])

  const handleAssemblerHover = useCallback((asmId: string | null) => {
    setHoveredAssembler(asmId)
    setHoveredLeft(null)
  }, [])

  // ── Ribbon opacity helpers ──
  const leftRibbonOpacity = useCallback((leftId: string, asmId: string) => {
    if (!hoveredLeft && !hoveredAssembler) return 0.35
    if (hoveredLeft === leftId) return 0.6
    if (hoveredAssembler === asmId) return 0.6
    return 0.1
  }, [hoveredLeft, hoveredAssembler])

  // ── No data state ──
  if (categories.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        No sourced categories to display. Complete the Source stage first.
      </div>
    )
  }

  // ── Build flow paths: Left cards -> Assemblers ──
  const flowRibbons: {
    leftId: string
    asmId: string
    path: string
    color: string
    opacity: number
  }[] = []

  for (const left of leftLayout) {
    let targetAsm = assemblerLayout.find((a) =>
      a.assignedCategories.includes(left.id),
    )
    if (!targetAsm) {
      targetAsm = assemblerLayout.find((a) => a.tierLevel === 2)
    }

    if (targetAsm) {
      // INTENT: Proportional ribbon slots on assembler side based on part count
      const assignedLeftNodes = leftLayout.filter((l) =>
        targetAsm!.assignedCategories.includes(l.id),
      )
      const totalAssignedParts = assignedLeftNodes.reduce((sum, l) => sum + l.partCount, 0)
      const priorParts = assignedLeftNodes
        .slice(0, assignedLeftNodes.findIndex((l) => l.id === left.id))
        .reduce((sum, l) => sum + l.partCount, 0)
      const asmY1 = targetAsm.top + (priorParts / Math.max(totalAssignedParts, 1)) * targetAsm.barH
      const asmY2 = targetAsm.top + ((priorParts + left.partCount) / Math.max(totalAssignedParts, 1)) * targetAsm.barH

      const path = flowPath(
        COL.LEFT_X + COL.LEFT_CARD_W, left.top, left.top + left.barH,
        COL.MID_X, asmY1, asmY2,
      )

      flowRibbons.push({
        leftId: left.id,
        asmId: targetAsm.id,
        path,
        color: left.color,
        opacity: leftRibbonOpacity(left.id, targetAsm.id),
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
      const path = flowPath(
        COL.MID_X + COL.MID_BAR_W, asm.top, asm.top + asm.barH,
        COL.RIGHT_X, productLayout.top, productLayout.top + productLayout.height,
      )
      asmToProductRibbons.push({
        asmId: asm.id,
        path,
        opacity: hoveredAssembler === asm.id ? 0.6 : (!hoveredAssembler && !hoveredLeft ? 0.35 : 0.1),
      })
    }
  }

  // Tier 1 -> Tier 2 ribbons (sub-assemblers feed into final assembler)
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
      const slotH = tier2.barH / Math.max(tier1Nodes.length + 1, 1)
      const idx = tier1Nodes.indexOf(t1)
      const t2Y1 = tier2.top + idx * slotH
      const t2Y2 = t2Y1 + slotH

      const path = flowPath(
        COL.MID_X + COL.MID_BAR_W, t1.top, t1.top + t1.barH,
        COL.MID_X, t2Y1, t2Y2,
      )
      const isHl = hoveredAssembler === t1.id || hoveredAssembler === tier2.id
      tier1ToTier2Ribbons.push({
        fromId: t1.id,
        toId: tier2.id,
        path,
        opacity: isHl ? 0.6 : (!hoveredAssembler && !hoveredLeft ? 0.3 : 0.08),
      })
    }
  }

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${COL.SVG_W} ${svgHeight}`}
        className="w-full"
        style={{ minHeight: Math.min(svgHeight, 400) }}
      >
        {/* ── Column headers (9px, matching Source page) ── */}
        <text x={COL.LEFT_X} y={14} className="fill-muted-foreground" style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
          Agreed Suppliers
        </text>
        <text x={COL.MID_X} y={14} className="fill-muted-foreground" style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
          {assemblerLayout.length > 0 ? "First Assembly" : "First Assembly (none matched)"}
        </text>
        <text x={COL.RIGHT_X} y={14} className="fill-muted-foreground" style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
          Final Assembly &amp; Despatch
        </text>

        {/* ── Flow ribbons: Left -> Assemblers ── */}
        {flowRibbons.map((r, i) => (
          <path
            key={`left-asm-${i}`}
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

        {/* ── Left column: Category cards via foreignObject ── */}
        {leftLayout.map((node) => {
          const isHighlighted = hoveredLeft === node.id ||
            (hoveredAssembler && assemblerLayout.find((a) => a.id === hoveredAssembler)?.assignedCategories.includes(node.id))
          const cardOpacity = (!hoveredLeft && !hoveredAssembler) ? 1 : (isHighlighted ? 1 : 0.4)

          return (
            <g
              key={node.id}
              onMouseEnter={() => handleLeftHover(node.id)}
              onMouseLeave={() => handleLeftHover(null)}
              style={{ cursor: "pointer", opacity: cardOpacity }}
              className="transition-opacity duration-200"
            >
              <foreignObject
                x={COL.LEFT_X}
                y={node.top}
                width={COL.LEFT_CARD_W}
                height={node.barH}
              >
                <div
                  style={{
                    width: COL.LEFT_CARD_W,
                    height: node.barH,
                    display: "flex",
                    borderRadius: 6,
                    border: "1px solid #e5e7eb",
                    background: "white",
                    overflow: "hidden",
                  }}
                >
                  {/* Colored accent bar */}
                  <div style={{ width: 4, background: node.color, flexShrink: 0, borderRadius: "6px 0 0 6px" }} />
                  {/* Content */}
                  <div style={{ flex: 1, padding: "5px 8px", display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                    {/* Category label */}
                    <div style={{ fontSize: 10, fontWeight: 600, color: "#111827", lineHeight: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {node.label}
                    </div>
                    {/* Awarded supplier line */}
                    <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 1 }}>
                      {node.awardedSupplierName ? (
                        <>
                          <span style={{ fontSize: 9, color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120 }}>
                            {node.awardedSupplierName}
                          </span>
                          {node.awardedSupplierScore != null && node.awardedSupplierScore > 0 && (
                            <span style={{
                              fontSize: 8,
                              fontWeight: 600,
                              padding: "0px 4px",
                              borderRadius: 6,
                              background: node.awardedSupplierScore >= 50 ? "#05966918" : node.awardedSupplierScore >= 30 ? "#d9770618" : "#f1f5f9",
                              color: node.awardedSupplierScore >= 50 ? "#059669" : node.awardedSupplierScore >= 30 ? "#d97706" : "#94a3b8",
                            }}>
                              {Math.round(node.awardedSupplierScore)}
                            </span>
                          )}
                        </>
                      ) : (
                        <span style={{ fontSize: 9, color: "#9ca3af", fontStyle: "italic" }}>
                          No supplier awarded
                        </span>
                      )}
                    </div>
                    {/* Part count */}
                    <div style={{ fontSize: 9, color: "#9ca3af", marginTop: "auto" }}>
                      {node.partCount} part{node.partCount !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>
              </foreignObject>
            </g>
          )
        })}

        {/* ── Middle column: Assembler cards (compact, stacked) ── */}
        {assemblerLayout.map((asm) => {
          const isHighlighted = hoveredAssembler === asm.id ||
            (hoveredLeft && leftLayout.find((l) => l.id === hoveredLeft)?.id &&
              asm.assignedCategories.includes(hoveredLeft!))
          const cardOpacity = (!hoveredLeft && !hoveredAssembler) ? 1 : (isHighlighted ? 1 : 0.4)
          const tierColor = asm.tierLevel === 1 ? "#64748b" : "#ff4500"

          return (
            <g
              key={asm.id}
              onMouseEnter={() => handleAssemblerHover(asm.id)}
              onMouseLeave={() => handleAssemblerHover(null)}
              style={{ cursor: "pointer", opacity: cardOpacity }}
              className="transition-opacity duration-200"
            >
              <foreignObject
                x={COL.MID_X}
                y={asm.top}
                width={COL.MID_BAR_W}
                height={asm.barH}
              >
                <div
                  style={{
                    width: COL.MID_BAR_W,
                    height: asm.barH,
                    borderRadius: 6,
                    border: `1.5px solid ${tierColor}`,
                    background: "white",
                    padding: "5px 8px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  {/* Tier badge + score */}
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{
                      fontSize: 8,
                      fontWeight: 600,
                      padding: "1px 5px",
                      borderRadius: 6,
                      background: `${tierColor}18`,
                      color: tierColor,
                    }}>
                      {asm.tierLevel === 1 ? "Sub" : "Final"}
                    </span>
                    {asm.score > 0 && (
                      <span style={{
                        fontSize: 8,
                        fontWeight: 600,
                        padding: "1px 5px",
                        borderRadius: 6,
                        background: asm.score >= 50 ? "#05966918" : asm.score >= 30 ? "#d9770618" : "#f1f5f9",
                        color: asm.score >= 50 ? "#059669" : asm.score >= 30 ? "#d97706" : "#94a3b8",
                      }}>
                        {Math.round(asm.score)}pts
                      </span>
                    )}
                    {asm.isVerified && (
                      <span style={{ fontSize: 8, color: "#059669", fontWeight: 500 }}>Verified</span>
                    )}
                  </div>
                  {/* Name */}
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#111827", lineHeight: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {truncate(asm.name, 22)}
                  </div>
                  {/* Location + Lead time + capabilities */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: "auto" }}>
                    {asm.locationCountry && (
                      <span style={{ fontSize: 8, color: "#6b7280" }}>
                        {asm.locationCountry}
                      </span>
                    )}
                    {asm.typicalLeadDays && (
                      <span style={{ fontSize: 8, color: "#6b7280" }}>
                        {asm.typicalLeadDays}d
                      </span>
                    )}
                    {asm.capabilities.map((cap) => (
                      <span key={cap} style={{
                        fontSize: 8,
                        padding: "0px 4px",
                        borderRadius: 4,
                        background: "#f1f5f9",
                        color: "#64748b",
                      }}>
                        {cap.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                </div>
              </foreignObject>
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
              height={60}
              rx={6}
              fill="none"
              stroke="#d1d5db"
              strokeWidth={1.5}
              strokeDasharray="6 3"
            />
            <text
              x={COL.MID_X + COL.MID_BAR_W / 2}
              y={COL.CONTENT_TOP + 28}
              textAnchor="middle"
              className="fill-muted-foreground"
              style={{ fontSize: 9 }}
            >
              Click &quot;Match Assemblers&quot;
            </text>
            <text
              x={COL.MID_X + COL.MID_BAR_W / 2}
              y={COL.CONTENT_TOP + 42}
              textAnchor="middle"
              className="fill-muted-foreground"
              style={{ fontSize: 8 }}
            >
              to find assembly companies
            </text>
          </g>
        )}

        {/* ── Right column: Final Assembly & Despatch card ── */}
        <foreignObject
          x={COL.RIGHT_X}
          y={productLayout.top}
          width={COL.RIGHT_W}
          height={productLayout.height}
        >
          <div
            style={{
              width: COL.RIGHT_W,
              height: productLayout.height,
              borderRadius: 8,
              border: "2px solid #ff4500",
              background: "white",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "8px 8px",
              gap: 4,
            }}
          >
            {/* Badge */}
            <div style={{
              fontSize: 8,
              fontWeight: 600,
              color: "#ff4500",
              background: "#ff450012",
              padding: "2px 10px",
              borderRadius: 6,
              letterSpacing: 0.5,
            }}>
              FINAL ASSEMBLY
            </div>
            {/* Product name */}
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#111827",
              textAlign: "center",
              lineHeight: "13px",
              maxWidth: "100%",
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}>
              {truncate(subject, 36)}
            </div>
            {/* Part count */}
            <div style={{ fontSize: 9, color: "#9ca3af" }}>
              {totalParts} parts total
            </div>
            {/* Estimated cost */}
            {totalEstimatedCost != null && totalEstimatedCost > 0 && (
              <div style={{ fontSize: 10, fontWeight: 600, color: "#111827" }}>
                {"\u00a3"}{totalEstimatedCost.toLocaleString()}
              </div>
            )}
            {/* Despatch ready badge */}
            <div style={{
              fontSize: 8,
              fontWeight: 600,
              color: "#059669",
              background: "#05966915",
              padding: "2px 10px",
              borderRadius: 8,
            }}>
              Despatch Ready
            </div>
          </div>
        </foreignObject>
      </svg>
    </div>
  )
}
