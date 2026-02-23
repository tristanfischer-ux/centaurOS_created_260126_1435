/**
 * @file sub-assembly-diagram.tsx — Radial SVG diagram of sub-assembly interactions
 *
 * @description Renders a hub-and-spoke diagram showing:
 * - Central system node with the system function statement
 * - Module (sub-assembly) nodes arranged radially, each with name + IO count
 * - Dashed spoke lines from center to each module (membership)
 * - Curved orange connection paths between modules where outputs match inputs
 * - Text connection legend below the SVG for accessibility
 *
 * Pure SVG — no external dependencies, no pan/zoom, no animation.
 *
 * @related
 * - Edge derivation: ../services/xray-to-strategy.ts (deriveEdgesFromModuleIO)
 * - Color pattern: xray-schematic.tsx (chipColor + CHART_COLORS)
 * - Card pattern: system-blueprint.tsx (forge Card + accent header)
 */

"use client"

import React, { useMemo } from "react"

import { Box, Network } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

import type { ModuleSpec } from "../services/xray-schema"
import { deriveEdgesFromModuleIO } from "../services/xray-to-strategy"

// ─── Constants ───────────────────────────────────────────────────────

const CHART_COLORS = [
  "hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
  "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(var(--chart-6))",
]

/** Deterministic color assignment from module ID */
function chipColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return CHART_COLORS[h % CHART_COLORS.length]
}

// SVG layout
const SVG_W = 700
const SVG_H = 500
const CX = SVG_W / 2
const CY = SVG_H / 2
const RADIUS = 180
const MODULE_W = 150
const MODULE_H = 56
const CENTER_W = 180
const CENTER_H = 60

// ─── Geometry helpers ────────────────────────────────────────────────

function modulePosition(index: number, total: number) {
  const angle = (2 * Math.PI * index) / total - Math.PI / 2
  return {
    x: CX + RADIUS * Math.cos(angle),
    y: CY + RADIUS * Math.sin(angle),
  }
}

/** Truncate text with ellipsis */
function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "\u2026" : s
}

/**
 * Quadratic bezier curve between two module positions, bowed outward from center.
 * The control point is pushed away from the center to create a visible arc.
 */
function arcPath(
  x1: number, y1: number,
  x2: number, y2: number,
): string {
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  // Push control point away from center
  const dx = mx - CX
  const dy = my - CY
  const dist = Math.sqrt(dx * dx + dy * dy) || 1
  const bow = 40
  const cpx = mx + (dx / dist) * bow
  const cpy = my + (dy / dist) * bow
  return `M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}`
}

// ─── Component ───────────────────────────────────────────────────────

interface SubAssemblyDiagramProps {
  modules: ModuleSpec[]
  systemFunction: string
}

export function SubAssemblyDiagram({ modules, systemFunction }: SubAssemblyDiagramProps) {
  const edges = useMemo(() => deriveEdgesFromModuleIO(modules), [modules])

  const positions = useMemo(
    () => modules.map((_, i) => modulePosition(i, modules.length)),
    [modules],
  )

  // Build index for fast lookup
  const idxById = useMemo(() => {
    const map = new Map<string, number>()
    modules.forEach((m, i) => map.set(m.id, i))
    return map
  }, [modules])

  if (modules.length === 0) return null

  return (
    <Card className="rounded-xl shadow-sm">
      <CardContent className="pt-6 pb-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1 h-7 bg-international-orange rounded-full" />
            <div>
              <h3 className="text-lg font-display font-semibold tracking-tight text-foreground">
                Sub-Assembly Interactions
              </h3>
              <p className="text-xs text-muted-foreground">
                How modules connect and exchange data/material
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="gap-1.5">
            <Box className="h-3 w-3" />
            {modules.length} modules
          </Badge>
        </div>

        {/* SVG diagram */}
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="w-full h-auto"
          role="img"
          aria-label={`Sub-assembly interaction diagram with ${modules.length} modules and ${edges.length} connections`}
        >
          {/* Arrowhead marker */}
          <defs>
            <marker
              id="sa-arrow"
              viewBox="0 0 10 7"
              refX="10"
              refY="3.5"
              markerWidth="8"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 3.5 L 0 7 z" fill="hsl(var(--chart-1))" fillOpacity={0.6} />
            </marker>
          </defs>

          {/* Spoke lines (dashed, center → module) */}
          {positions.map((pos, i) => (
            <line
              key={`spoke-${i}`}
              x1={CX}
              y1={CY}
              x2={pos.x}
              y2={pos.y}
              stroke="hsl(var(--border))"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          ))}

          {/* IO connection arcs */}
          {edges.map((edge, i) => {
            const si = idxById.get(edge.source)
            const ti = idxById.get(edge.target)
            if (si === undefined || ti === undefined) return null
            const sp = positions[si]
            const tp = positions[ti]
            const path = arcPath(sp.x, sp.y, tp.x, tp.y)

            // Label midpoint (approximate)
            const mx = (sp.x + tp.x) / 2
            const my = (sp.y + tp.y) / 2
            const dx = mx - CX
            const dy = my - CY
            const dist = Math.sqrt(dx * dx + dy * dy) || 1
            const bow = 40
            const lx = mx + (dx / dist) * bow
            const ly = my + (dy / dist) * bow

            return (
              <g key={`edge-${i}`}>
                <path
                  d={path}
                  fill="none"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2}
                  strokeOpacity={0.6}
                  markerEnd="url(#sa-arrow)"
                />
                <text
                  x={lx}
                  y={ly - 6}
                  textAnchor="middle"
                  fontSize={9}
                  fill="hsl(var(--muted-foreground))"
                  className="select-none"
                >
                  {truncate(edge.label, 25)}
                </text>
              </g>
            )
          })}

          {/* Center system node */}
          <g>
            <rect
              x={CX - CENTER_W / 2}
              y={CY - CENTER_H / 2}
              width={CENTER_W}
              height={CENTER_H}
              rx={12}
              fill="hsl(var(--card))"
              stroke="hsl(var(--chart-1))"
              strokeWidth={2}
            />
            <text
              x={CX}
              y={CY - 6}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill="hsl(var(--foreground))"
              className="select-none"
            >
              System
            </text>
            <text
              x={CX}
              y={CY + 10}
              textAnchor="middle"
              fontSize={9}
              fill="hsl(var(--muted-foreground))"
              className="select-none"
            >
              {truncate(systemFunction, 30)}
            </text>
          </g>

          {/* Module nodes */}
          {modules.map((m, i) => {
            const pos = positions[i]
            const color = chipColor(m.id)
            const ioCount = m.io.in.length + m.io.out.length
            return (
              <g key={m.id}>
                {/* Card background */}
                <rect
                  x={pos.x - MODULE_W / 2}
                  y={pos.y - MODULE_H / 2}
                  width={MODULE_W}
                  height={MODULE_H}
                  rx={10}
                  fill="hsl(var(--card))"
                  stroke="hsl(var(--border))"
                  strokeWidth={1}
                />
                {/* Colored left accent bar */}
                <rect
                  x={pos.x - MODULE_W / 2}
                  y={pos.y - MODULE_H / 2 + 8}
                  width={4}
                  height={MODULE_H - 16}
                  rx={2}
                  fill={color}
                />
                {/* Module name */}
                <text
                  x={pos.x - MODULE_W / 2 + 14}
                  y={pos.y - 4}
                  fontSize={11}
                  fontWeight={600}
                  fill="hsl(var(--foreground))"
                  className="select-none"
                >
                  {truncate(m.name, 18)}
                </text>
                {/* IO count */}
                <text
                  x={pos.x - MODULE_W / 2 + 14}
                  y={pos.y + 12}
                  fontSize={9}
                  fill="hsl(var(--muted-foreground))"
                  className="select-none"
                >
                  {m.io.in.length} in / {m.io.out.length} out
                </text>
                {/* IO badge circle */}
                <circle
                  cx={pos.x + MODULE_W / 2 - 18}
                  cy={pos.y}
                  r={12}
                  fill={color}
                  fillOpacity={0.12}
                />
                <text
                  x={pos.x + MODULE_W / 2 - 18}
                  y={pos.y + 4}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={600}
                  fill={color}
                  className="select-none"
                >
                  {ioCount}
                </text>
              </g>
            )
          })}
        </svg>

        {/* Connection legend */}
        {edges.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Network className="h-3.5 w-3.5 text-international-orange" />
              <span className="font-medium">Connections</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {edges.map((edge, i) => {
                const srcName = modules.find((m) => m.id === edge.source)?.name ?? edge.source
                const tgtName = modules.find((m) => m.id === edge.target)?.name ?? edge.target
                return (
                  <span key={i} className="text-xs text-muted-foreground">
                    {srcName} → {tgtName}
                    <span className="text-foreground/50 ml-1">({truncate(edge.label, 25)})</span>
                  </span>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
