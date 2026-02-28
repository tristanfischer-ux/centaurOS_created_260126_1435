/**
 * @file module-flow-canvas.tsx — Interactive React Flow canvas for CAD module flow.
 *
 * @description Renders draggable module nodes connected by signal-typed arrow edges
 * in a left-to-right topological layout. Each edge connects a specific output port
 * to a specific input port with animated, color-coded dashes. Includes fullscreen mode.
 *
 * FLOW: cad/page.tsx → ModuleFlowCanvas → ReactFlowProvider → ModuleFlowCanvasInner
 *
 * @related
 * - Static diagram: ./process-flow-diagram.tsx
 * - Layout engine adapted from: agents/agents-workflow-view.tsx:124-217
 * - Provider/Inner pattern from: canvas/strategy-link-view.tsx
 * - Custom node: ./module-node.tsx
 */

"use client"

import { useMemo, useState, useEffect, useRef, useCallback } from "react"
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  MarkerType,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type Node,
  type Edge,
  type EdgeProps,
} from "@xyflow/react"
import { LayoutGrid, Maximize2, Minimize2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { CadLabModule, InterfaceContract } from "@/lib/cad-lab-types"
import {
  type SignalType,
  SIGNAL_CONFIG,
  buildEdges,
  buildEdgesFromContracts,
} from "../lib/flow-edge-utils"
import { ModuleNode, type ModuleNodeData } from "./module-node"

import "@xyflow/react/dist/style.css"

/* ─── Layout constants ─────────────────────────────────────────────────── */

const NODE_WIDTH = 220
const NODE_GAP_X = 160
const NODE_GAP_Y = 60
const PORT_ROW_H = 22

/**
 * Estimate node height based on port count.
 * Header (~48px) + separator (1px) + input section + output section + footer (~24px) + padding
 */
function estimateNodeHeight(inputCount: number, outputCount: number): number {
  const headerH = 52
  const separatorH = 1
  const inputSectionH = inputCount > 0 ? 18 + inputCount * PORT_ROW_H + 4 : 0
  const outputSectionH = outputCount > 0 ? 18 + outputCount * PORT_ROW_H + 6 : 0
  const footerH = 24
  return headerH + separatorH + inputSectionH + outputSectionH + footerH
}

/* ─── Custom labeled flow edge ─────────────────────────────────────────── */

function LabeledFlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  style,
}: EdgeProps) {
  const edgeData = data as { label?: string; strokeColor?: string } | undefined
  const strokeColor = edgeData?.strokeColor ?? "hsl(var(--chart-5))"
  const label = edgeData?.label

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
  })

  // Truncate label for display
  const truncatedLabel = label && label.length > 24
    ? label.slice(0, 22) + "\u2026"
    : label

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: strokeColor,
          strokeWidth: 3,
        }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            title={label}
            className="nodrag nopan pointer-events-auto"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            <span
              className="text-[9px] text-foreground bg-background rounded px-1.5 py-0.5 whitespace-nowrap border border-border shadow-sm"
              style={{ borderLeftColor: strokeColor, borderLeftWidth: 3 }}
            >
              {truncatedLabel}
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

/* ─── Topological layout engine (LR) ──────────────────────────────────── */

/**
 * Arrange nodes in a left-to-right layered layout using topological sorting.
 *
 * @description Adapted from agents-workflow-view.tsx. Assigns each node a rank
 * (column) based on its longest path from a root, then spaces nodes evenly
 * within each column. Uses LR direction for module data flow.
 *
 * DECISION: Custom layout instead of dagre — dagre causes "dynamic require"
 * Turbopack bundling errors (documented in agents-workflow-view.tsx:119).
 */
function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes, edges }

  // Build adjacency lists
  const children = new Map<string, string[]>()
  const parents = new Map<string, string[]>()
  const nodeIds = new Set(nodes.map((n) => n.id))

  for (const n of nodes) {
    children.set(n.id, [])
    parents.set(n.id, [])
  }
  for (const e of edges) {
    if (nodeIds.has(e.source) && nodeIds.has(e.target)) {
      children.get(e.source)!.push(e.target)
      parents.get(e.target)!.push(e.source)
    }
  }

  // Assign ranks via longest-path from roots (nodes with no parents)
  const rank = new Map<string, number>()
  const roots = nodes.filter((n) => parents.get(n.id)!.length === 0)

  const queue: string[] = roots.map((n) => n.id)
  for (const id of queue) {
    if (!rank.has(id)) rank.set(id, 0)
  }

  // If no roots (cycle or all connected), start from first node
  if (queue.length === 0) {
    queue.push(nodes[0].id)
    rank.set(nodes[0].id, 0)
  }

  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]
    const currentRank = rank.get(id) ?? 0
    for (const childId of children.get(id) ?? []) {
      const existingRank = rank.get(childId)
      if (existingRank === undefined || currentRank + 1 > existingRank) {
        rank.set(childId, currentRank + 1)
      }
      if (!queue.includes(childId)) {
        queue.push(childId)
      }
    }
  }

  // Catch disconnected nodes
  for (const n of nodes) {
    if (!rank.has(n.id)) rank.set(n.id, 0)
  }

  // Group nodes by rank (column)
  const rankGroups = new Map<number, string[]>()
  for (const n of nodes) {
    const r = rank.get(n.id) ?? 0
    if (!rankGroups.has(r)) rankGroups.set(r, [])
    rankGroups.get(r)!.push(n.id)
  }

  // Build a height lookup from node data
  const nodeHeights = new Map<string, number>()
  for (const n of nodes) {
    const d = n.data as ModuleNodeData
    nodeHeights.set(n.id, estimateNodeHeight(d.inputCount, d.outputCount))
  }

  // Position: LR layout — rank determines x (column), stack nodes vertically with dynamic heights
  const posMap = new Map<string, { x: number; y: number }>()

  // First pass: compute total column heights to center them
  const colHeights = new Map<number, number>()
  for (const [r, ids] of rankGroups) {
    let totalH = 0
    for (const id of ids) {
      totalH += nodeHeights.get(id) ?? 160
    }
    totalH += (ids.length - 1) * NODE_GAP_Y
    colHeights.set(r, totalH)
  }
  const maxColHeight = Math.max(...Array.from(colHeights.values()))

  for (const [r, ids] of rankGroups) {
    const colHeight = colHeights.get(r) ?? 0
    const offsetY = (maxColHeight - colHeight) / 2
    let y = offsetY

    for (const id of ids) {
      posMap.set(id, {
        x: r * (NODE_WIDTH + NODE_GAP_X),
        y,
      })
      y += (nodeHeights.get(id) ?? 160) + NODE_GAP_Y
    }
  }

  const layoutedNodes = nodes.map((node) => ({
    ...node,
    position: posMap.get(node.id) ?? node.position,
  }))

  return { nodes: layoutedNodes, edges }
}

/* ─── Node & edge type registries ──────────────────────────────────────── */

const nodeTypes = { module: ModuleNode }
const edgeTypes = { labeledFlow: LabeledFlowEdge }

/* ─── Props ────────────────────────────────────────────────────────────── */

interface ModuleFlowCanvasProps {
  modules: CadLabModule[]
  className?: string
  onModuleClick?: (moduleId: string) => void
  interfaceContracts?: InterfaceContract[]
  generatingModuleIds?: Set<string>
}

/* ─── Build nodes and edges ────────────────────────────────────────────── */

function buildNodesAndEdges(
  modules: CadLabModule[],
  interfaceContracts: InterfaceContract[] | undefined,
  generatingModuleIds: Set<string>,
) {
  // Build flow edges (contracts-first, keyword-fallback)
  const flowEdges = interfaceContracts && interfaceContracts.length > 0
    ? buildEdgesFromContracts(interfaceContracts)
    : buildEdges(modules)

  // Connection counts per module
  const connectionCounts = new Map<string, { receivesFrom: number; feedsTo: number }>()
  for (const m of modules) {
    connectionCounts.set(m.id, { receivesFrom: 0, feedsTo: 0 })
  }
  for (const e of flowEdges) {
    const from = connectionCounts.get(e.from)
    const to = connectionCounts.get(e.to)
    if (from) from.feedsTo++
    if (to) to.receivesFrom++
  }

  // Connected IDs for orphan detection
  const connectedIds = new Set<string>()
  for (const e of flowEdges) {
    connectedIds.add(e.from)
    connectedIds.add(e.to)
  }

  // Build React Flow nodes — pass ALL inputs/outputs for port-level handles
  const rfNodes: Node[] = modules.map((m) => {
    const counts = connectionCounts.get(m.id) ?? { receivesFrom: 0, feedsTo: 0 }
    const nodeData: ModuleNodeData = {
      label: m.name,
      purpose: m.purpose,
      status: m.status,
      inputs: m.inputs,
      outputs: m.outputs,
      inputCount: m.inputs.length,
      outputCount: m.outputs.length,
      receivesFrom: counts.receivesFrom,
      feedsTo: counts.feedsTo,
      isGenerating: generatingModuleIds.has(m.id),
      isOrphan: flowEdges.length > 0 && !connectedIds.has(m.id),
      moduleId: m.id,
    }
    return {
      id: m.id,
      type: "module",
      data: nodeData,
      position: { x: 0, y: 0 },
    }
  })

  // Build React Flow edges — port-level handles + always animated + color-coded
  const rfEdges: Edge[] = flowEdges.map((e, idx) => {
    const config = SIGNAL_CONFIG[e.signalType]
    const strokeColor = e.incompatible ? "hsl(var(--destructive))" : config.strokeHsl

    return {
      id: `edge-${idx}-${e.from}-${e.to}`,
      source: e.from,
      target: e.to,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      type: "labeledFlow",
      data: {
        label: e.label,
        strokeColor,
      },
      style: {
        strokeDasharray: e.incompatible ? "5 5" : undefined,
      },
      animated: true,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 20,
        height: 20,
        color: strokeColor,
      },
    }
  })

  // Apply topological layout
  return getLayoutedElements(rfNodes, rfEdges)
}

/* ─── Inner canvas (needs ReactFlowProvider context) ───────────────────── */

function ModuleFlowCanvasInner({
  modules,
  onModuleClick,
  interfaceContracts,
  generatingModuleIds = new Set(),
  tidyKey,
  isFullscreen,
}: ModuleFlowCanvasProps & { tidyKey: number; isFullscreen: boolean }) {
  const { fitView } = useReactFlow()

  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
    () => buildNodesAndEdges(modules, interfaceContracts, generatingModuleIds),
    // INTENT: Serialise Set for stable deps — Set identity changes every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [modules, interfaceContracts, [...generatingModuleIds].join(",")],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges)

  // Track previous tidy key to detect "tidy up" presses
  const prevTidyKeyRef = useRef(tidyKey)
  const prevModuleIdsRef = useRef(modules.map((m) => m.id).join(","))

  // INTENT: Preserve user-dragged positions on data refresh, full re-layout
  // only on tidy-up or when module set changes. Pattern from strategy-link-view.tsx.
  useEffect(() => {
    const currentModuleIds = modules.map((m) => m.id).join(",")
    const tidyTriggered = prevTidyKeyRef.current !== tidyKey
    const modulesChanged = prevModuleIdsRef.current !== currentModuleIds

    prevTidyKeyRef.current = tidyKey
    prevModuleIdsRef.current = currentModuleIds

    if (tidyTriggered || modulesChanged) {
      // Full re-layout
      setNodes(layoutedNodes)
      setEdges(layoutedEdges)
      setTimeout(() => fitView({ padding: isFullscreen ? 0.15 : 0.2 }), 100)
    } else {
      // Preserve user-dragged positions, update data only
      setNodes((currentNodes) => {
        const currentPositions = new Map(currentNodes.map((n) => [n.id, n.position]))
        return layoutedNodes.map((n) => ({
          ...n,
          position: currentPositions.get(n.id) ?? n.position,
        }))
      })
      setEdges(layoutedEdges)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutedNodes, layoutedEdges, tidyKey])

  // Re-fit when toggling fullscreen
  useEffect(() => {
    setTimeout(() => fitView({ padding: isFullscreen ? 0.15 : 0.2 }), 150)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullscreen])

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const moduleId = (node.data as ModuleNodeData).moduleId
      onModuleClick?.(moduleId)
    },
    [onModuleClick],
  )

  // MiniMap node color based on status
  const nodeColor = useCallback((node: Node) => {
    const status = (node.data as ModuleNodeData).status
    switch (status) {
      case "generated": return "hsl(var(--status-success))"
      case "specified":
      case "interface_ready": return "hsl(var(--status-info))"
      case "failed": return "hsl(var(--destructive))"
      default: return "hsl(var(--muted-foreground))"
    }
  }, [])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={handleNodeClick}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      fitViewOptions={{ padding: isFullscreen ? 0.15 : 0.2 }}
      proOptions={{ hideAttribution: true }}
      minZoom={0.2}
      maxZoom={2}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
      <Controls showInteractive={false} />
      <MiniMap nodeColor={nodeColor} />
    </ReactFlow>
  )
}

/* ─── Outer component (header, legend, orphan callout, tidy, fullscreen) ── */

export function ModuleFlowCanvas({
  modules,
  className,
  onModuleClick,
  interfaceContracts,
  generatingModuleIds = new Set(),
}: ModuleFlowCanvasProps): React.ReactNode {
  const [tidyKey, setTidyKey] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Escape key exits fullscreen
  useEffect(() => {
    if (!isFullscreen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsFullscreen(false)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isFullscreen])

  // Compute edges for header stats and legend
  const flowEdges = useMemo(
    () => interfaceContracts && interfaceContracts.length > 0
      ? buildEdgesFromContracts(interfaceContracts)
      : buildEdges(modules),
    [modules, interfaceContracts],
  )

  const presentSignalTypes = useMemo(() => {
    const types = new Set<SignalType>()
    for (const e of flowEdges) types.add(e.signalType)
    return types
  }, [flowEdges])

  // Orphan modules
  const orphanModules = useMemo(() => {
    const connectedIds = new Set<string>()
    for (const e of flowEdges) {
      connectedIds.add(e.from)
      connectedIds.add(e.to)
    }
    return modules.filter((m) => !connectedIds.has(m.id))
  }, [flowEdges, modules])

  const content = (
    <div
      className={cn(
        "rounded-lg border border-border bg-card overflow-hidden",
        isFullscreen && "fixed inset-0 z-50 rounded-none",
        !isFullscreen && className,
      )}
    >
      {/* Header with orange accent bar */}
      <div className="border-b border-border">
        <div className="h-1 bg-international-orange/60" />
        <div className="px-5 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Module integration flow</p>
            <p className="text-xs text-muted-foreground">
              {flowEdges.length} interface{flowEdges.length !== 1 ? "s" : ""} mapped
              {interfaceContracts && interfaceContracts.length > 0 && " (contract-validated)"}
              {" \u00B7 "}Drag nodes to rearrange
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setTidyKey((k) => k + 1)}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Tidy up
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setIsFullscreen((f) => !f)}
            >
              {isFullscreen ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
              {isFullscreen ? "Exit" : "Fullscreen"}
            </Button>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div className={isFullscreen ? "flex-1" : "h-[500px] min-h-[400px]"} style={isFullscreen ? { height: "calc(100vh - 120px)" } : undefined}>
        <ReactFlowProvider>
          <ModuleFlowCanvasInner
            modules={modules}
            onModuleClick={onModuleClick}
            interfaceContracts={interfaceContracts}
            generatingModuleIds={generatingModuleIds}
            tidyKey={tidyKey}
            isFullscreen={isFullscreen}
          />
        </ReactFlowProvider>
      </div>

      {/* Footer: legend + orphan callout */}
      <div className="border-t border-border px-5 py-3 space-y-2">
        {/* Signal type legend — only show types present */}
        {presentSignalTypes.size > 0 && (
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Signal types:</span>
            {(Object.keys(SIGNAL_CONFIG) as SignalType[])
              .filter((type) => presentSignalTypes.has(type))
              .map((type) => (
                <span key={type} className="flex items-center gap-1">
                  <div className={cn("h-2 w-2 rounded-full", SIGNAL_CONFIG[type].dot)} />
                  {SIGNAL_CONFIG[type].label}
                </span>
              ))}
          </div>
        )}

        {/* Orphan module callout */}
        {orphanModules.length > 0 && flowEdges.length > 0 && (
          <div className="rounded-md border border-status-warning/30 bg-warning/10 px-3 py-2 flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 text-status-warning flex-shrink-0 mt-0.5" />
            <p className="text-xs text-foreground">
              <span className="font-medium">{orphanModules.length} module{orphanModules.length !== 1 ? "s" : ""} not connected:</span>{" "}
              {orphanModules.map((m, i) => (
                <span key={m.id}>
                  {onModuleClick ? (
                    <button
                      className="underline text-international-orange hover:text-international-orange-hover"
                      onClick={() => onModuleClick(m.id)}
                    >
                      {m.name}
                    </button>
                  ) : (
                    m.name
                  )}
                  {i < orphanModules.length - 1 ? ", " : ""}
                </span>
              ))}
              . Review inputs/outputs to identify integration points.
            </p>
          </div>
        )}
      </div>
    </div>
  )

  return content
}
