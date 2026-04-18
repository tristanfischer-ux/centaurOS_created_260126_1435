'use client'

/**
 * @file strategy-link-view.tsx
 *
 * @description React Flow canvas for visually linking objectives to strategies.
 * Strategy nodes appear at the top, with their linked objectives grouped in
 * columns directly below each strategy. Unlinked objectives appear in a
 * separate section to the right. Toggle pills allow showing/hiding specific
 * strategies and their linked objectives for focused viewing.
 *
 * @related
 * - strategy-node.tsx — Custom strategy node component
 * - objective-node.tsx — Custom objective node component
 * - src/actions/objectives.ts — linkObjectiveToStrategic server action
 */

import React, { useState, useCallback, useMemo, useEffect, useRef, memo } from 'react'
import { createPortal } from 'react-dom'
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  type Connection,
  type Node,
  type Edge,
  ReactFlowProvider,
  type OnEdgesDelete,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, LayoutGrid } from 'lucide-react'
import { Button } from '@/components/ui/button'

import { StrategyNode, type StrategyNodeData } from './strategy-node'
import { ObjectiveNode, type ObjectiveNodeData } from './objective-node'
import { linkObjectiveToStrategic } from '@/actions/objectives'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import type { StrategicObjective } from '../new-objectives/types'
import type { RegularObjective } from './canvas-shell'

// ─── Unlinked section header node ─────────────────────────────────

/**
 * UnlinkedHeaderNode — Visual label for the unlinked objectives section.
 * Not interactive, just a visual separator.
 */
const UnlinkedHeaderNode = memo(function UnlinkedHeaderNode() {
  return (
    <div className="px-5 py-3 text-xs font-medium text-muted-foreground border border-dashed border-muted rounded-xl bg-muted/30 min-w-[180px]">
      Unlinked Objectives
      <p className="text-[10px] font-normal mt-1 text-muted-foreground/70">
        Drag to a strategy above to link
      </p>
    </div>
  )
})

// ─── Custom node types ────────────────────────────────────────────
const nodeTypes = {
  strategy: StrategyNode,
  objective: ObjectiveNode,
  'unlinked-header': UnlinkedHeaderNode,
}

// ─── Layout constants ─────────────────────────────────────────────
const STRATEGY_Y = 40
const OBJECTIVE_Y = 260
const COLUMN_WIDTH = 280
const COLUMN_GAP = 40
const OBJ_ROW_HEIGHT = 100
const OBJ_X_INDENT = 10
const UNLINKED_COL_WIDTH = 240
const CANVAS_PADDING = 60

interface StrategyLinkViewProps {
  strategicObjectives: StrategicObjective[]
  regularObjectives: RegularObjective[]
  /** Ref to a DOM element where toolbar buttons should be portaled */
  toolbarPortalRef?: React.RefObject<HTMLDivElement | null>
}

/**
 * Builds React Flow nodes and edges, grouping objectives into columns
 * under their parent strategic objective. Unlinked objectives appear
 * in a multi-column grid to the right.
 *
 * @param strategies - All strategic objectives
 * @param objectives - All regular objectives
 * @param visibleStrategies - Set of strategy IDs currently toggled on
 * @returns React Flow nodes and edges for the canvas
 */
function buildNodesAndEdges(
  strategies: StrategicObjective[],
  objectives: RegularObjective[],
  visibleStrategies: Set<string>
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  // Only show visible strategies
  const visible = strategies.filter((s) => visibleStrategies.has(s.id))

  // Group objectives by parent strategy
  const groupedByStrategy = new Map<string, RegularObjective[]>()
  const unlinked: RegularObjective[] = []

  for (const obj of objectives) {
    if (obj.parent_objective_id && visibleStrategies.has(obj.parent_objective_id)) {
      // Linked to a visible strategy — group it
      const list = groupedByStrategy.get(obj.parent_objective_id) || []
      list.push(obj)
      groupedByStrategy.set(obj.parent_objective_id, list)
    } else if (!obj.parent_objective_id) {
      // Not linked to any strategy
      unlinked.push(obj)
    }
    // Objectives linked to a hidden strategy are also hidden
  }

  let xOffset = CANVAS_PADDING

  // ── Strategy columns ───────────────────────────────────────────
  for (const strategy of visible) {
    const linkedObjs = groupedByStrategy.get(strategy.id) || []

    // Strategy node at top of column
    nodes.push({
      id: `strategy-${strategy.id}`,
      type: 'strategy',
      position: { x: xOffset, y: STRATEGY_Y },
      data: {
        label: strategy.title,
        linkedCount: linkedObjs.length,
      } satisfies StrategyNodeData,
      draggable: true,
    })

    // Linked objectives stacked directly below
    linkedObjs.forEach((obj, idx) => {
      nodes.push({
        id: `objective-${obj.id}`,
        type: 'objective',
        position: {
          x: xOffset + OBJ_X_INDENT,
          y: OBJECTIVE_Y + idx * OBJ_ROW_HEIGHT,
        },
        data: {
          label: obj.title,
          progress: obj.progress,
          status: obj.status,
        } satisfies ObjectiveNodeData,
        draggable: true,
      })

      edges.push({
        id: `edge-${obj.id}`,
        source: `objective-${obj.id}`,
        target: `strategy-${strategy.id}`,
        animated: true,
        style: { stroke: '#ff4500', strokeWidth: 2 },
      })
    })

    xOffset += COLUMN_WIDTH + COLUMN_GAP
  }

  // ── Unlinked objectives section ────────────────────────────────
  if (unlinked.length > 0) {
    // Extra gap before the unlinked section
    if (visible.length > 0) {
      xOffset += 40
    }

    // Section header
    nodes.push({
      id: 'unlinked-header',
      type: 'unlinked-header',
      position: { x: xOffset, y: STRATEGY_Y },
      data: {},
      draggable: false,
      selectable: false,
    })

    // Multi-column grid for unlinked objectives
    const cols = Math.min(3, Math.max(1, Math.ceil(unlinked.length / 4)))
    unlinked.forEach((obj, idx) => {
      const col = idx % cols
      const row = Math.floor(idx / cols)

      nodes.push({
        id: `objective-${obj.id}`,
        type: 'objective',
        position: {
          x: xOffset + col * UNLINKED_COL_WIDTH,
          y: OBJECTIVE_Y + row * OBJ_ROW_HEIGHT,
        },
        data: {
          label: obj.title,
          progress: obj.progress,
          status: obj.status,
        } satisfies ObjectiveNodeData,
        draggable: true,
      })
    })
  }

  return { nodes, edges }
}

// ─── LinkCanvas (must be inside ReactFlowProvider) ────────────────

interface LinkCanvasProps extends StrategyLinkViewProps {
  visibleStrategies: Set<string>
  /** Increment to trigger a full re-layout (tidy up) */
  tidyKey: number
}

/**
 * Inner canvas component that renders React Flow.
 * Must be inside a ReactFlowProvider.
 *
 * @description Handles drag-to-link and delete-to-unlink interactions,
 * with optimistic UI updates and server-side persistence.
 */
function LinkCanvas({ strategicObjectives, regularObjectives, visibleStrategies, tidyKey }: LinkCanvasProps) {
  const router = useRouter()
  const { fitView } = useReactFlow()

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildNodesAndEdges(strategicObjectives, regularObjectives, visibleStrategies),
    [strategicObjectives, regularObjectives, visibleStrategies]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [isLinking, setIsLinking] = useState(false)

  // Track previous visibility and tidy key to detect layout-reset triggers
  const prevVisibleRef = useRef(visibleStrategies)
  const prevTidyKeyRef = useRef(tidyKey)

  // Sync nodes/edges when data, visibility, or tidy key changes.
  // Preserves user-dragged positions on server data refresh;
  // resets to computed layout when visibility toggles change or tidy is triggered.
  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = buildNodesAndEdges(
      strategicObjectives,
      regularObjectives,
      visibleStrategies
    )

    const visibilityChanged = prevVisibleRef.current !== visibleStrategies
    const tidyTriggered = prevTidyKeyRef.current !== tidyKey

    if (visibilityChanged || tidyTriggered) {
      // Full re-layout when toggles change or tidy up is triggered
      prevVisibleRef.current = visibleStrategies
      prevTidyKeyRef.current = tidyKey
      setNodes(newNodes)
      setEdges(newEdges)
      setTimeout(() => fitView({ padding: 0.3 }), 100)
    } else {
      // Data refresh from server — preserve positions the user dragged to
      setNodes((currentNodes) => {
        const currentPositions = new Map(currentNodes.map((n) => [n.id, n.position]))
        return newNodes.map((n) => ({
          ...n,
          position: currentPositions.get(n.id) ?? n.position,
        }))
      })
      setEdges(newEdges)
    }
  }, [strategicObjectives, regularObjectives, visibleStrategies, tidyKey, setNodes, setEdges, fitView])

  /**
   * Handle new connection: drag from objective (source) to strategy (target).
   * Calls the server action to persist the link.
   */
  const onConnect = useCallback(
    async (connection: Connection) => {
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
          eds.filter((e) => e.source !== sourceId)
        )
      )

      setIsLinking(true)
      const result = await linkObjectiveToStrategic(objectiveId, strategyId)
      setIsLinking(false)

      if (result.error) {
        toast.error(result.error)
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
    <div className="h-[calc(100vh-340px)] sm:h-[calc(100vh-260px)] min-h-[400px] bg-muted/20 rounded-lg border border-border">
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
        deleteKeyCode={['Delete', 'Backspace']}
        className="strategy-link-canvas"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
        <Controls
          showInteractive={false}
          className="!bg-background !border !border-border !shadow-sm !rounded-lg"
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

// ─── Main export ──────────────────────────────────────────────────

/**
 * StrategyLinkView — React Flow canvas for linking objectives to strategies.
 *
 * @description Groups objectives under their parent strategy in visual columns.
 * Provides toggle pills to show/hide specific strategies and their linked
 * objectives for focused viewing. Unlinked objectives appear in a separate
 * section. Shows an empty state when there are no strategic objectives.
 *
 * @param strategicObjectives - All strategic objectives for the foundry
 * @param regularObjectives - All regular objectives for the foundry
 */
export function StrategyLinkView({ strategicObjectives, regularObjectives, toolbarPortalRef }: StrategyLinkViewProps) {
  // All strategies visible by default
  const [visibleStrategies, setVisibleStrategies] = useState<Set<string>>(
    () => new Set(strategicObjectives.map((s) => s.id))
  )

  // Tidy up: increment to trigger a full re-layout
  const [tidyKey, setTidyKey] = useState(0)

  /** Reset all node positions to the computed column layout. */
  const handleTidyUp = useCallback(() => {
    setTidyKey((prev) => prev + 1)
  }, [])

  /**
   * Toggle a strategy's visibility on/off.
   * When hidden, the strategy node and all its linked objectives are removed from the canvas.
   */
  const toggleStrategy = useCallback((id: string) => {
    setVisibleStrategies((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  // Count linked objectives per strategy (for badge in toggle pills)
  const linkedCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const s of strategicObjectives) {
      counts.set(s.id, regularObjectives.filter((o) => o.parent_objective_id === s.id).length)
    }
    return counts
  }, [strategicObjectives, regularObjectives])

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
      {/* Strategy toggle pills */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-[11px] text-muted-foreground font-medium mr-1">Show:</span>
        {strategicObjectives.map((s) => {
          const isVisible = visibleStrategies.has(s.id)
          const count = linkedCounts.get(s.id) || 0
          return (
            <button
              key={s.id}
              onClick={() => toggleStrategy(s.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border',
                isVisible
                  ? 'bg-international-orange/10 border-international-orange/30 text-international-orange'
                  : 'bg-muted/50 border-muted text-muted-foreground hover:bg-muted'
              )}
            >
              {isVisible ? (
                <Eye className="h-3 w-3" />
              ) : (
                <EyeOff className="h-3 w-3" />
              )}
              <span className="max-w-[160px] truncate">{s.title}</span>
              {count > 0 && (
                <span
                  className={cn(
                    'text-[10px] px-1.5 rounded-full',
                    isVisible
                      ? 'bg-international-orange/20 text-international-orange'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-3 text-[11px] text-muted-foreground">
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
        <span className="hidden sm:inline ml-auto text-[10px]">
          Drag from an objective to a strategy to link &bull; Select edge + Delete/Backspace to unlink &bull; Re-drag to move between strategies
        </span>
      </div>

      {/* Tidy up button — portaled to tab bar when slot is available */}
      {toolbarPortalRef?.current && createPortal(
        <Button variant="ghost" size="sm" onClick={handleTidyUp} title="Reset layout to tidy columns">
          <LayoutGrid className="h-4 w-4 mr-1.5" />
          Tidy up
        </Button>,
        toolbarPortalRef.current
      )}

      <ReactFlowProvider>
        <LinkCanvas
          strategicObjectives={strategicObjectives}
          regularObjectives={regularObjectives}
          visibleStrategies={visibleStrategies}
          tidyKey={tidyKey}
        />
      </ReactFlowProvider>
    </div>
  )
}
