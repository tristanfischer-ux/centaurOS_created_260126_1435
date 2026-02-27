"use client"

/**
 * @file supply-flow-diagram.tsx — Pure SVG fan diagram for the Supply Flow page.
 *
 * @description Three-column layout: Components → Manufacturers → Assemblers.
 * Cubic Bézier edges connect nodes across tiers. Hover dims unrelated nodes,
 * click reveals a detail card below the diagram.
 *
 * FLOW: Page passes SupplyFlowData → this component renders SVG + detail card.
 */

import { useMemo, useState, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type {
  SupplyFlowData,
  SupplyFlowNode,
  SupplyFlowEdge,
  SupplyFlowTier,
} from "./supply-flow-types"

// ─── Layout constants ───────────────────────────────────────────────

const COL_X: Record<SupplyFlowTier, number> = {
  component: 80,
  manufacturer: 440,
  assembler: 800,
}

const NODE_W = 180
const NODE_H = 52
const NODE_GAP = 16
const HEADER_H = 32
const SVG_WIDTH = 1100
const TOP_PADDING = 48

// ─── Chart colors ───────────────────────────────────────────────────

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-6))",
]

/** Deterministic color from module id (same as timeline, risk-register). */
function chipColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return CHART_COLORS[h % CHART_COLORS.length]
}

/** Tier accent colors. */
const TIER_COLOR: Record<SupplyFlowTier, string> = {
  component: "hsl(var(--chart-1))",
  manufacturer: "hsl(var(--chart-4))",
  assembler: "hsl(var(--chart-2))",
}

const COLUMN_LABELS: Record<SupplyFlowTier, string> = {
  component: "Components",
  manufacturer: "Manufacturers",
  assembler: "Assembly & Fulfillment",
}

// ─── Helpers ────────────────────────────────────────────────────────

interface PositionedNode extends SupplyFlowNode {
  x: number
  y: number
}

function layoutNodes(nodes: SupplyFlowNode[]): PositionedNode[] {
  const tiers: Record<SupplyFlowTier, SupplyFlowNode[]> = {
    component: [],
    manufacturer: [],
    assembler: [],
  }
  for (const n of nodes) tiers[n.tier].push(n)

  const positioned: PositionedNode[] = []
  for (const tier of ["component", "manufacturer", "assembler"] as SupplyFlowTier[]) {
    const col = tiers[tier]
    const colX = COL_X[tier]
    for (let i = 0; i < col.length; i++) {
      positioned.push({
        ...col[i],
        x: colX,
        y: TOP_PADDING + HEADER_H + i * (NODE_H + NODE_GAP),
      })
    }
  }

  return positioned
}

function computeSvgHeight(nodes: SupplyFlowNode[]): number {
  const tiers: Record<SupplyFlowTier, number> = { component: 0, manufacturer: 0, assembler: 0 }
  for (const n of nodes) tiers[n.tier]++
  const maxCount = Math.max(tiers.component, tiers.manufacturer, tiers.assembler, 1)
  return TOP_PADDING + HEADER_H + maxCount * (NODE_H + NODE_GAP) + 24
}

function getConnectedIds(nodeId: string, edges: SupplyFlowEdge[]): Set<string> {
  const connected = new Set<string>()
  connected.add(nodeId)
  for (const e of edges) {
    if (e.fromId === nodeId) connected.add(e.toId)
    if (e.toId === nodeId) connected.add(e.fromId)
  }
  return connected
}

// ─── Edge path builder ──────────────────────────────────────────────

function buildEdgePath(
  from: PositionedNode,
  to: PositionedNode,
): string {
  const x1 = from.x + NODE_W
  const y1 = from.y + NODE_H / 2
  const x2 = to.x
  const y2 = to.y + NODE_H / 2
  const mx = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`
}

// ─── Component ──────────────────────────────────────────────────────

interface SupplyFlowDiagramProps {
  data: SupplyFlowData
}

export function SupplyFlowDiagram({ data }: SupplyFlowDiagramProps) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  const positioned = useMemo(() => layoutNodes(data.nodes), [data.nodes])
  const svgHeight = useMemo(() => computeSvgHeight(data.nodes), [data.nodes])
  const nodeMap = useMemo(() => new Map(positioned.map((n) => [n.id, n])), [positioned])

  const hoveredConnections = useMemo(() => {
    if (!hoveredNodeId) return null
    return getConnectedIds(hoveredNodeId, data.edges)
  }, [hoveredNodeId, data.edges])

  const selectedNode = useMemo(
    () => (selectedNodeId ? nodeMap.get(selectedNodeId) ?? null : null),
    [selectedNodeId, nodeMap],
  )

  const handleNodeClick = useCallback((id: string) => {
    setSelectedNodeId((prev) => (prev === id ? null : id))
  }, [])

  const nodeOpacity = useCallback(
    (id: string) => {
      if (!hoveredConnections) return 1
      return hoveredConnections.has(id) ? 1 : 0.2
    },
    [hoveredConnections],
  )

  const edgeOpacity = useCallback(
    (edge: SupplyFlowEdge) => {
      if (!hoveredConnections) return 0.5
      return hoveredConnections.has(edge.fromId) && hoveredConnections.has(edge.toId) ? 0.8 : 0.08
    },
    [hoveredConnections],
  )

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <svg
          width={SVG_WIDTH}
          height={svgHeight}
          viewBox={`0 0 ${SVG_WIDTH} ${svgHeight}`}
          className="block"
          role="img"
          aria-label="Supply flow diagram showing components, manufacturers, and assemblers"
        >
          {/* Column headers */}
          {(["component", "manufacturer", "assembler"] as SupplyFlowTier[]).map((tier) => (
            <text
              key={tier}
              x={COL_X[tier] + NODE_W / 2}
              y={TOP_PADDING}
              textAnchor="middle"
              className="fill-muted-foreground text-[11px] font-semibold"
              style={{ fontSize: 11, fontWeight: 600 }}
            >
              {COLUMN_LABELS[tier]}
            </text>
          ))}

          {/* Edges */}
          {data.edges.map((edge, i) => {
            const from = nodeMap.get(edge.fromId)
            const to = nodeMap.get(edge.toId)
            if (!from || !to) return null

            const strokeWidth = edge.score ? Math.max(1, Math.min(4, edge.score / 5)) : 1.5
            const color = chipColor(edge.fromId)

            return (
              <path
                key={`${edge.fromId}-${edge.toId}-${i}`}
                d={buildEdgePath(from, to)}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                opacity={edgeOpacity(edge)}
                className="transition-opacity duration-200"
              />
            )
          })}

          {/* Nodes */}
          {positioned.map((node) => {
            const isHovered = hoveredNodeId === node.id
            const isSelected = selectedNodeId === node.id
            const accentColor =
              node.tier === "component" ? chipColor(node.id) : TIER_COLOR[node.tier]

            return (
              <g
                key={node.id}
                opacity={nodeOpacity(node.id)}
                className="transition-opacity duration-200 cursor-pointer"
                onMouseEnter={() => setHoveredNodeId(node.id)}
                onMouseLeave={() => setHoveredNodeId(null)}
                onClick={() => handleNodeClick(node.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    handleNodeClick(node.id)
                  }
                }}
                aria-label={`${node.label}${node.sublabel ? ` — ${node.sublabel}` : ""}`}
              >
                {/* Card background */}
                <rect
                  x={node.x}
                  y={node.y}
                  width={NODE_W}
                  height={NODE_H}
                  rx={8}
                  className="fill-card stroke-border"
                  strokeWidth={isHovered || isSelected ? 2 : 1}
                  stroke={isHovered || isSelected ? accentColor : undefined}
                />

                {/* Left accent bar */}
                <rect
                  x={node.x}
                  y={node.y}
                  width={4}
                  height={NODE_H}
                  rx={2}
                  fill={accentColor}
                />

                {/* Label */}
                <text
                  x={node.x + 14}
                  y={node.y + (node.sublabel ? 20 : NODE_H / 2 + 4)}
                  className="fill-foreground"
                  style={{ fontSize: 11, fontWeight: 600 }}
                >
                  {node.label.length > 20 ? node.label.slice(0, 18) + "…" : node.label}
                </text>

                {/* Sublabel */}
                {node.sublabel && (
                  <text
                    x={node.x + 14}
                    y={node.y + 36}
                    className="fill-muted-foreground"
                    style={{ fontSize: 9 }}
                  >
                    {node.sublabel.length > 24 ? node.sublabel.slice(0, 22) + "…" : node.sublabel}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* Selected node detail card */}
      {selectedNode && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">
                  {selectedNode.label}
                </h3>
                {selectedNode.sublabel && (
                  <p className="text-xs text-muted-foreground">{selectedNode.sublabel}</p>
                )}
              </div>
              <Badge variant="secondary" className="shrink-0 text-[10px]">
                {COLUMN_LABELS[selectedNode.tier]}
              </Badge>
            </div>
            {selectedNode.meta && Object.keys(selectedNode.meta).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(selectedNode.meta).map(([key, val]) => (
                  <span
                    key={key}
                    className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded"
                  >
                    {key}: {String(val)}
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
