/**
 * @file xray-schematic.tsx — React Flow vertical schematic for X-Ray modules
 *
 * @description Renders a vertical top-to-bottom flow of module cards,
 * connected by animated orange edges. Matches the visual structure of
 * the strategy page (Link Objectives) and agents page (Workflow Chain).
 *
 * Features:
 * - Vertical auto-layout (top to bottom)
 * - Animated orange edges between sequential modules
 * - Status indicators per module (complete, in-progress, needs-diagnostic)
 * - Toggle between functional schematic and AI-generated visual blueprint
 * - Navigation buttons to jump to module detail cards
 * - Status legend
 *
 * @related
 * - Strategy: src/app/(platform)/canvas/strategy-link-view.tsx
 * - Agents: src/app/(platform)/agents/agents-workflow-view.tsx
 * - Module node: ./xray-module-node.tsx
 */

"use client"

import React, { useMemo, useCallback, useState } from "react"
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
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertTriangle,
  Box,
  Clock,
  CircleDot,
  ImageIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

import { XRayModuleNode } from "./xray-module-node"
import type { XRayModuleNodeData } from "./xray-module-node"
import type { XRaySpec, ModuleSpec } from "../services/xray-schema"
import type { Node, Edge } from "@xyflow/react"

// ─── Constants ───────────────────────────────────────────────────────

const NODE_WIDTH = 280
const NODE_HEIGHT = 130
const NODE_GAP_Y = 60
const CANVAS_PADDING_X = 40
const CANVAS_PADDING_Y = 40

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

/**
 * Computes readiness for a module based on expert question answers.
 */
function readinessFor(m: ModuleSpec): { answered: number; total: number; pct: number } {
  const a = m.interview?.answers || {}
  const answered = Object.keys(a).filter((k) => String(a[k] || "").trim()).length
  const total = m.detail.expertQuestions.length
  const pct = total === 0 ? 0 : Math.round((answered / total) * 100)
  return { answered, total, pct }
}

function findGatingModule(modules: ModuleSpec[]): ModuleSpec | undefined {
  return modules.find((m) => m.isGatingModule) ?? modules.find((m) => m.id === "react")
}

function isGatingDiagComplete(spec: XRaySpec): boolean {
  const gating = findGatingModule(spec.modules)
  if (!gating) return true
  if (gating.diagnostic?.derivedProcessClass) return true
  return false
}

function getNodeStatus(
  m: ModuleSpec,
  diagComplete: boolean,
): "complete" | "needs-diagnostic" | "partial" | "not-started" {
  const isGatingNode = m.isGatingModule || m.id === "react"
  if (isGatingNode && !diagComplete) return "needs-diagnostic"
  const r = readinessFor(m)
  if (r.pct === 100) return "complete"
  if (r.pct > 0) return "partial"
  return "not-started"
}

// ─── Node types registry ─────────────────────────────────────────────

const nodeTypes = {
  xrayModule: XRayModuleNode,
}

// ─── Layout builder ──────────────────────────────────────────────────

/**
 * Builds React Flow nodes and edges from the X-Ray spec.
 * Arranges modules in a vertical chain, top to bottom.
 */
function buildNodesAndEdges(
  spec: XRaySpec,
): { nodes: Node[]; edges: Edge[] } {
  const modules = spec.modules || []
  const diagComplete = isGatingDiagComplete(spec)
  const nodes: Node[] = []
  const edges: Edge[] = []

  // Center x position
  const centerX = CANVAS_PADDING_X

  modules.forEach((m, index) => {
    const status = getNodeStatus(m, diagComplete)
    const r = readinessFor(m)
    const isGating = m.isGatingModule || m.id === "react"

    const nodeData: XRayModuleNodeData = {
      label: m.name,
      purpose: m.purpose,
      accentColor: chipColor(m.id),
      status,
      progress: r.pct,
      isGating,
      leadWeeks: m.requirements.leadWeeks,
      moduleId: m.id,
    }

    nodes.push({
      id: `module-${m.id}`,
      type: "xrayModule",
      position: {
        x: centerX,
        y: CANVAS_PADDING_Y + index * (NODE_HEIGHT + NODE_GAP_Y),
      },
      data: nodeData,
      draggable: false,
    })

    // Edge from previous module to this one
    if (index > 0) {
      const prevModule = modules[index - 1]
      edges.push({
        id: `edge-${prevModule.id}-${m.id}`,
        source: `module-${prevModule.id}`,
        target: `module-${m.id}`,
        animated: true,
        style: { stroke: "#ff4500", strokeWidth: 2 },
      })
    }
  })

  return { nodes, edges }
}

// ─── Status dot color ────────────────────────────────────────────────

function statusDotColor(status: string): string {
  switch (status) {
    case "complete":
      return "#10b981"
    case "needs-diagnostic":
      return "#f59e0b"
    case "partial":
      return "#3b82f6"
    default:
      return "#94a3b8"
  }
}

// ─── Component ───────────────────────────────────────────────────────

interface XRaySchematicProps {
  /** The full X-Ray spec */
  spec: XRaySpec
  /** Callback to open diagnostic panel for a module */
  onOpenDiagnostic: (m: ModuleSpec) => void
}

/**
 * React Flow schematic showing modules as a vertical chain.
 *
 * @description Replaces the old custom SVG schematic with a React Flow
 * vertical chain, matching the strategy and agents page patterns.
 */
export function XRaySchematic({ spec, onOpenDiagnostic }: XRaySchematicProps) {
  const modules = spec.modules || []
  const n = modules.length
  const lastScannedLabel = spec.lastScannedAt
    ? new Date(spec.lastScannedAt).toLocaleString()
    : "Not scanned yet"
  const [showVisual, setShowVisual] = useState(false)

  const diagComplete = isGatingDiagComplete(spec)
  const gating = findGatingModule(modules)
  const needsDiagBlock = !diagComplete

  // Build layout
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildNodesAndEdges(spec),
    [spec],
  )

  const [nodes] = useNodesState(initialNodes)
  const [edges] = useEdgesState(initialEdges)

  // Calculate canvas height based on module count
  const canvasHeight = Math.max(
    400,
    CANVAS_PADDING_Y * 2 + n * (NODE_HEIGHT + NODE_GAP_Y),
  )

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const moduleId = node.id.replace("module-", "")
      document.getElementById(`module-${moduleId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
    },
    [],
  )

  if (n === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            Scan to populate the schematic.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="rounded-xl shadow-sm">
      <CardContent className="pt-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="w-1 h-7 bg-electric-blue rounded-full" />
              <h3 className="text-lg font-display font-semibold tracking-tight text-foreground">
                X-Ray schematic
              </h3>
            </div>
            <p className="text-sm text-muted-foreground ml-[1.375rem]">
              Modules flow top to bottom. Click any node to jump to its detail.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {spec.systemImageUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowVisual((v) => !v)}
              >
                <ImageIcon className="h-4 w-4 mr-2" />
                {showVisual ? "Functional" : "Visual Blueprint"}
              </Button>
            )}
            <Badge variant="secondary" className="text-xs">
              <Box className="h-3 w-3 mr-1" />
              {n} modules
            </Badge>
            <Badge variant="secondary" className="text-xs">
              <Clock className="h-3 w-3 mr-1" />
              {lastScannedLabel}
            </Badge>
          </div>
        </div>

        {/* Diagnostic alert */}
        {needsDiagBlock && gating && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-4">
              <div>
                <span className="font-semibold">
                  Stop: {gating.name} undefined.
                </span>{" "}
                <span className="text-muted-foreground">
                  Complete the diagnostic. Until then, supplier quotes will be
                  unreliable.
                </span>
              </div>
              <Button
                onClick={() => onOpenDiagnostic(gating)}
                className="shrink-0 bg-international-orange hover:bg-international-orange-hover text-white"
              >
                Run diagnostic
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Visual Blueprint or React Flow schematic */}
        {showVisual && spec.systemImageUrl ? (
          <div className="rounded-xl overflow-hidden border bg-muted/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={spec.systemImageUrl}
              alt="System diagram"
              className="w-full"
            />
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden border bg-muted/20">
            <div style={{ height: canvasHeight }} className="w-full">
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
                fitViewOptions={{ padding: 0.3 }}
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
        )}

        {/* Navigation buttons */}
        <div className="flex flex-wrap gap-2">
          {modules.map((m) => {
            const status = getNodeStatus(m, diagComplete)
            return (
              <Button
                key={m.id}
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() =>
                  document
                    .getElementById(`module-${m.id}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              >
                <CircleDot
                  className="h-3 w-3 mr-1.5"
                  style={{ color: statusDotColor(status) }}
                />
                {m.name}
              </Button>
            )
          })}
          {gating && !diagComplete && (
            <Button
              size="sm"
              className="rounded-full bg-international-orange hover:bg-international-orange-hover text-white"
              onClick={() => onOpenDiagnostic(gating)}
            >
              <AlertTriangle className="h-3 w-3 mr-1.5" />
              Run diagnostic
            </Button>
          )}
        </div>

        {/* Status legend */}
        <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
          <span className="font-medium">Status:</span>
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: "#10b981" }}
            />
            Complete
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: "#3b82f6" }}
            />
            In progress
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: "#f59e0b" }}
            />
            Needs diagnostic
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: "#94a3b8" }}
            />
            Not started
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
