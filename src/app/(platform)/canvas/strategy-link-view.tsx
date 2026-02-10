'use client'

/**
 * @file strategy-link-view.tsx
 *
 * @description React Flow canvas for visually linking objectives to strategies.
 * Strategy nodes appear in a top row, objective nodes in rows below.
 * Users can drag edges from objectives (source handle) to strategies (target handle)
 * to create links, or delete edges to unlink.
 *
 * @related
 * - strategy-node.tsx — Custom strategy node component
 * - objective-node.tsx — Custom objective node component
 * - src/actions/objectives.ts — linkObjectiveToStrategic server action
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react'
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Node,
  type Edge,
  ReactFlowProvider,
  type OnEdgesDelete,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

import { StrategyNode, type StrategyNodeData } from './strategy-node'
import { ObjectiveNode, type ObjectiveNodeData } from './objective-node'
import { linkObjectiveToStrategic } from '@/actions/objectives'
import { EmptyState } from '@/components/ui/empty-state'
import type { StrategicObjective } from '../new-objectives/types'
import type { RegularObjective } from './canvas-shell'

// ─── Custom node types ────────────────────────────────────────────
const nodeTypes = {
  strategy: StrategyNode,
  objective: ObjectiveNode,
}

// ─── Layout constants ─────────────────────────────────────────────
const STRATEGY_Y = 40
const OBJECTIVE_Y = 280
const NODE_GAP_X = 280
const OBJ_GAP_X = 240
const CANVAS_PADDING = 60

interface StrategyLinkViewProps {
  strategicObjectives: StrategicObjective[]
  regularObjectives: RegularObjective[]
}

/**
 * Builds the initial nodes and edges from the data.
 */
function buildNodesAndEdges(
  strategies: StrategicObjective[],
  objectives: RegularObjective[]
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  // Strategy nodes — top row
  strategies.forEach((s, idx) => {
    const linkedCount = objectives.filter((o) => o.parent_objective_id === s.id).length

    nodes.push({
      id: `strategy-${s.id}`,
      type: 'strategy',
      position: { x: CANVAS_PADDING + idx * NODE_GAP_X, y: STRATEGY_Y },
      data: {
        label: s.title,
        linkedCount,
      } satisfies StrategyNodeData,
      draggable: true,
    })
  })

  // Objective nodes — rows below
  // Linked objectives positioned near their strategy, unlinked at the end
  const linked = objectives.filter((o) => o.parent_objective_id)
  const unlinked = objectives.filter((o) => !o.parent_objective_id)
  const allOrdered = [...linked, ...unlinked]

  allOrdered.forEach((o, idx) => {
    const col = idx % 4
    const row = Math.floor(idx / 4)

    nodes.push({
      id: `objective-${o.id}`,
      type: 'objective',
      position: {
        x: CANVAS_PADDING + col * OBJ_GAP_X,
        y: OBJECTIVE_Y + row * 120,
      },
      data: {
        label: o.title,
        progress: o.progress,
        status: o.status,
      } satisfies ObjectiveNodeData,
      draggable: true,
    })

    // Edge if linked
    if (o.parent_objective_id) {
      edges.push({
        id: `edge-${o.id}`,
        source: `objective-${o.id}`,
        target: `strategy-${o.parent_objective_id}`,
        animated: true,
        style: { stroke: '#ff4500', strokeWidth: 2 },
      })
    }
  })

  return { nodes, edges }
}

/**
 * Inner component that uses React Flow hooks (must be inside ReactFlowProvider).
 */
function LinkCanvas({ strategicObjectives, regularObjectives }: StrategyLinkViewProps) {
  const router = useRouter()

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildNodesAndEdges(strategicObjectives, regularObjectives),
    [strategicObjectives, regularObjectives]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [isLinking, setIsLinking] = useState(false)

  // Sync when data changes from server
  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = buildNodesAndEdges(
      strategicObjectives,
      regularObjectives
    )
    setNodes(newNodes)
    setEdges(newEdges)
  }, [strategicObjectives, regularObjectives, setNodes, setEdges])

  /**
   * Handle new connection: drag from objective (source) to strategy (target).
   * Calls the server action to persist the link.
   */
  const onConnect = useCallback(
    async (connection: Connection) => {
      // Validate: source must be objective, target must be strategy
      const sourceId = connection.source
      const targetId = connection.target
      if (!sourceId?.startsWith('objective-') || !targetId?.startsWith('strategy-')) {
        toast.error('Connect an objective to a strategy')
        return
      }

      const objectiveId = sourceId.replace('objective-', '')
      const strategyId = targetId.replace('strategy-', '')

      // Optimistic UI update
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            id: `edge-${objectiveId}`,
            animated: true,
            style: { stroke: '#ff4500', strokeWidth: 2 },
          },
          // Remove existing edge for this objective first
          eds.filter((e) => e.source !== sourceId)
        )
      )

      setIsLinking(true)
      const result = await linkObjectiveToStrategic(objectiveId, strategyId)
      setIsLinking(false)

      if (result.error) {
        toast.error(result.error)
        // Revert
        router.refresh()
      } else {
        toast.success('Objective linked to strategy')
        router.refresh()
      }
    },
    [setEdges, router]
  )

  /**
   * Handle edge deletion: unlinks the objective from its strategy.
   */
  const onEdgesDelete: OnEdgesDelete = useCallback(
    async (deletedEdges) => {
      for (const edge of deletedEdges) {
        const objectiveId = edge.source.replace('objective-', '')

        setIsLinking(true)
        const result = await linkObjectiveToStrategic(objectiveId, null)
        setIsLinking(false)

        if (result.error) {
          toast.error(result.error)
          router.refresh()
        } else {
          toast.success('Objective unlinked')
          router.refresh()
        }
      }
    },
    [router]
  )

  return (
    <div className="h-[calc(100vh-220px)] min-h-[500px] bg-muted/20 rounded-lg border border-slate-100">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode="Delete"
        className="strategy-link-canvas"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
        <Controls
          showInteractive={false}
          className="!bg-background !border !border-slate-200 !shadow-sm !rounded-lg"
        />
      </ReactFlow>

      {/* Linking indicator */}
      {isLinking && (
        <div className="absolute top-3 right-3 text-xs text-muted-foreground bg-background border rounded-md px-2 py-1 shadow-sm">
          Saving...
        </div>
      )}
    </div>
  )
}

/**
 * StrategyLinkView — React Flow canvas for linking objectives to strategies.
 *
 * @description Wraps the canvas in a ReactFlowProvider. Shows an empty state
 * when there are no strategic objectives to link to.
 */
export function StrategyLinkView({ strategicObjectives, regularObjectives }: StrategyLinkViewProps) {
  if (strategicObjectives.length === 0) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        <EmptyState
          title="No strategies to link to"
          description="Create strategic objectives above, then come back here to visually link your objectives to them."
        />
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 relative">
      {/* Legend */}
      <div className="flex items-center gap-4 mb-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-sm bg-international-orange" />
          Strategy
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-sm bg-electric-blue" />
          Objective
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-6 h-0.5 bg-international-orange" />
          Linked
        </span>
        <span className="ml-auto text-[10px]">
          Drag from an objective to a strategy to link &bull; Select edge + Delete to unlink
        </span>
      </div>

      <ReactFlowProvider>
        <LinkCanvas
          strategicObjectives={strategicObjectives}
          regularObjectives={regularObjectives}
        />
      </ReactFlowProvider>
    </div>
  )
}
