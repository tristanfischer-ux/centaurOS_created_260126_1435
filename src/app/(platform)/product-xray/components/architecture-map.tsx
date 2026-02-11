/**
 * @file architecture-map.tsx — Horizontal React Flow schematic
 *
 * @description Left-to-right module flow diagram using React Flow.
 * Modules are displayed as a horizontal chain matching how engineers
 * think about process/material flow. Animated orange edges connect them.
 *
 * @related
 * - Node component: ./architecture-node.tsx
 */

"use client"

import React, { useMemo, useCallback } from "react"
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Box, CircleDot } from "lucide-react"

import { ArchitectureNode } from "./architecture-node"
import type { ArchitectureNodeData } from "./architecture-node"
import type { XRaySpec, ModuleSpec } from "../services/xray-schema"
import type { Node, Edge } from "@xyflow/react"

// ─── Constants ───────────────────────────────────────────────────────

const NODE_WIDTH = 220
const NODE_GAP_X = 80
const CANVAS_PADDING = 40

const CHART_COLORS = [
  "hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
  "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(var(--chart-6))",
]

// ─── Helpers ─────────────────────────────────────────────────────────

function chipColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return CHART_COLORS[h % CHART_COLORS.length]
}

function readinessFor(m: ModuleSpec): number {
  const a = m.interview?.answers || {}
  const answered = Object.keys(a).filter((k) => String(a[k] || "").trim()).length
  const total = m.detail.expertQuestions.length
  return total === 0 ? 0 : Math.round((answered / total) * 100)
}

function getNodeStatus(
  m: ModuleSpec,
  diagComplete: boolean,
): "complete" | "needs-diagnostic" | "partial" | "not-started" {
  const isGating = m.isGatingModule || m.id === "react"
  if (isGating && !diagComplete) return "needs-diagnostic"
  const pct = readinessFor(m)
  if (pct === 100) return "complete"
  if (pct > 0) return "partial"
  return "not-started"
}

function statusDotColor(status: string): string {
  switch (status) {
    case "complete": return "#10b981"
    case "needs-diagnostic": return "#f59e0b"
    case "partial": return "#3b82f6"
    default: return "#94a3b8"
  }
}

function isGatingDiagComplete(spec: XRaySpec): boolean {
  const gating = spec.modules.find((m) => m.isGatingModule) ?? spec.modules.find((m) => m.id === "react")
  if (!gating) return true
  return !!gating.diagnostic?.derivedProcessClass
}

// ─── Layout builder ──────────────────────────────────────────────────

function buildLayout(spec: XRaySpec): { nodes: Node[]; edges: Edge[] } {
  const modules = spec.modules || []
  const diagComplete = isGatingDiagComplete(spec)
  const nodes: Node[] = []
  const edges: Edge[] = []

  modules.forEach((m, index) => {
    const status = getNodeStatus(m, diagComplete)
    const isGating = m.isGatingModule || m.id === "react"

    const nodeData: ArchitectureNodeData = {
      label: m.name,
      purpose: m.purpose,
      accentColor: chipColor(m.id),
      status,
      progress: readinessFor(m),
      isGating,
      leadWeeks: m.requirements.leadWeeks,
      moduleId: m.id,
    }

    nodes.push({
      id: `arch-${m.id}`,
      type: "architectureNode",
      position: {
        x: CANVAS_PADDING + index * (NODE_WIDTH + NODE_GAP_X),
        y: CANVAS_PADDING,
      },
      data: nodeData,
      draggable: false,
    })

    if (index > 0) {
      const prev = modules[index - 1]
      edges.push({
        id: `edge-${prev.id}-${m.id}`,
        source: `arch-${prev.id}`,
        target: `arch-${m.id}`,
        animated: true,
        style: { stroke: "#ff4500", strokeWidth: 2 },
      })
    }
  })

  return { nodes, edges }
}

// ─── Node types ──────────────────────────────────────────────────────

const nodeTypes = { architectureNode: ArchitectureNode }

// ─── Props ───────────────────────────────────────────────────────────

interface ArchitectureMapProps {
  spec: XRaySpec
}

// ─── Component ───────────────────────────────────────────────────────

/**
 * ArchitectureMap — Horizontal process flow schematic.
 *
 * @description Full-width left-to-right React Flow diagram showing
 * modules as a sequential process chain with animated edges.
 */
export function ArchitectureMap({ spec }: ArchitectureMapProps): React.ReactNode {
  const modules = spec.modules || []
  const n = modules.length
  const diagComplete = isGatingDiagComplete(spec)

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildLayout(spec),
    [spec],
  )

  const [nodes] = useNodesState(initialNodes)
  const [edges] = useEdgesState(initialEdges)

  const canvasWidth = Math.max(600, CANVAS_PADDING * 2 + n * (NODE_WIDTH + NODE_GAP_X))

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const moduleId = node.id.replace("arch-", "")
    document.getElementById(`module-v2-${moduleId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    })
  }, [])

  if (n === 0) return null

  return (
    <Card className="rounded-xl shadow-sm">
      <CardContent className="pt-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1 h-7 bg-electric-blue rounded-full" />
            <div>
              <h3 className="text-lg font-display font-semibold tracking-tight text-foreground">
                Architecture Map
              </h3>
              <p className="text-xs text-muted-foreground">
                Click any module to jump to its detail below
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="text-xs">
            <Box className="h-3 w-3 mr-1" />
            {n} modules
          </Badge>
        </div>

        {/* React Flow canvas */}
        <div className="rounded-xl overflow-hidden border bg-muted/10">
          <div className="overflow-x-auto">
            <div style={{ width: canvasWidth, height: 220 }}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodeClick={handleNodeClick}
                defaultEdgeOptions={{
                  animated: true,
                  style: { stroke: "#ff4500", strokeWidth: 2 },
                }}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                panOnDrag={false}
                zoomOnScroll={false}
                zoomOnPinch={false}
                zoomOnDoubleClick={false}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                proOptions={{ hideAttribution: true }}
              >
                <Background
                  variant={BackgroundVariant.Dots}
                  gap={20}
                  size={1}
                  color="#cbd5e1"
                />
              </ReactFlow>
            </div>
          </div>
        </div>

        {/* Navigation pills */}
        <div className="flex flex-wrap gap-2">
          {modules.map((m) => {
            const status = getNodeStatus(m, diagComplete)
            return (
              <Button
                key={m.id}
                variant="outline"
                size="sm"
                className="rounded-full text-xs"
                onClick={() =>
                  document.getElementById(`module-v2-${m.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              >
                <CircleDot className="h-2.5 w-2.5 mr-1.5" style={{ color: statusDotColor(status) }} />
                {m.name}
              </Button>
            )
          })}
        </div>

        {/* Status legend */}
        <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
          <span className="font-medium">Status:</span>
          {[
            { label: "Complete", color: "#10b981" },
            { label: "In progress", color: "#3b82f6" },
            { label: "Needs diagnostic", color: "#f59e0b" },
            { label: "Not started", color: "#94a3b8" },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
