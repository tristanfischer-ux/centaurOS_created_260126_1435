"use client"

/**
 * @description Strategic Canvas - React Flow based timeline visualization.
 * Renders tasks, milestones, phases, resource gaps, and AI suggestions
 * on a time-based canvas with dependency edges and critical path highlighting.
 */

import React, { useMemo, useCallback, useState } from "react"
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  type Node,
  type Edge,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import type { StrategicPlanOverview, CanvasGrouping } from "@/types/strategic-planner"
import { StrategicTaskNode } from "./nodes/strategic-task-node"
import { PhaseNode } from "./nodes/phase-node"
import { MilestoneNode } from "./nodes/milestone-node"
import { ResourceGapNode } from "./nodes/resource-gap-node"
import { AISuggestionNode } from "./nodes/ai-suggestion-node"
import { TimeGridBackground } from "./time-grid-background"
import { buildCanvasLayout } from "../lib/layout-engine"

// Register custom node types
const nodeTypes = {
  strategicTask: StrategicTaskNode,
  phase: PhaseNode,
  milestone: MilestoneNode,
  resourceGap: ResourceGapNode,
  aiSuggestion: AISuggestionNode,
}

interface StrategicCanvasProps {
  planData: StrategicPlanOverview
  grouping: CanvasGrouping
  onRefresh: () => void
}

function StrategicCanvasInner({ planData, grouping, onRefresh }: StrategicCanvasProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  // Build layout from plan data
  const { initialNodes, initialEdges, timeRange } = useMemo(
    () => buildCanvasLayout(planData, grouping),
    [planData, grouping]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id)
  }, [])

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null)
  }, [])

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        className="bg-background"
      >
        <Controls
          showInteractive={false}
          className="!bg-background !border !shadow-sm !rounded-lg"
        />
        <MiniMap
          nodeStrokeWidth={3}
          zoomable
          pannable
          className="!bg-background !border !shadow-sm !rounded-lg"
        />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(var(--muted-foreground) / 0.15)" />
        <TimeGridBackground timeRange={timeRange} />
      </ReactFlow>
    </div>
  )
}

export function StrategicCanvas(props: StrategicCanvasProps) {
  return (
    <ReactFlowProvider>
      <StrategicCanvasInner {...props} />
    </ReactFlowProvider>
  )
}
