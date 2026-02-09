'use client'

/**
 * @file strategic-canvas-view.tsx
 *
 * @description Client component for the Canvas strategic timeline.
 * Renders a toolbar with goal selector, view presets, layer/filter controls,
 * and a ReactFlow canvas with custom nodes representing the strategic hierarchy:
 * Goal → Milestones → Objectives → Tasks.
 *
 * @related
 * - Layout algorithm: src/lib/canvas/layout.ts
 * - Node components: src/components/canvas/nodes/
 * - Server actions: src/actions/canvas.ts
 * - Types: src/types/canvas.ts
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useTransition,
} from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  useReactFlow,
  type Node,
  type Edge,
  type NodeTypes,
  ReactFlowProvider,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import {
  Plus,
  Crosshair,
  Maximize2,
  Layers,
  Filter,
  Target,
  Calendar,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'

import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'

import { getGoalBundle, getStrategicGoals, getUnlinkedItems, getAllMilestones } from '@/actions/canvas'
import { GoalWizardDialog } from '@/components/canvas/goal-wizard-dialog'
import { NodeDetailsDialog } from '@/components/canvas/node-details-dialog'
import {
  goalBundleToElements,
  unlinkedItemsToElements,
  computeRangeStart,
  computeUnlinkedRangeStart,
  computeSpineBottomY,
  dateToX,
  PX_PER_DAY,
  SPINE_Y,
  type ViewPreset,
  type LayoutOptions,
} from '@/lib/canvas/layout'
import {
  GoalNode,
  MilestoneNode,
  ObjectiveNode,
  TaskNode,
  ExpandNode,
  DividerNode,
} from '@/components/canvas/nodes'

import type { StrategicGoal, GoalBundle, UnlinkedItems, MilestoneOption } from '@/types/canvas'

// ============================================================================
// TYPES
// ============================================================================

interface LayerState {
  spine: boolean
  ghosts: boolean
  tasks: boolean
  owners: boolean
  unlinkedWork: boolean
}

interface FilterState {
  ownerId?: string
  workstream?: string
  status?: string
}

interface StrategicCanvasViewProps {
  /** Pre-fetched strategic goals from the server component */
  initialGoals: StrategicGoal[]
  /** Callback to navigate to whiteboards tab */
  onOpenWhiteboards?: () => void
}

// ============================================================================
// CONSTANTS
// ============================================================================

const VIEW_PRESET_OPTIONS: { id: ViewPreset; label: string; shortLabel: string }[] = [
  { id: 'strategic', label: 'Strategic', shortLabel: 'S' },
  { id: 'operational', label: 'Operational', shortLabel: 'O' },
  { id: 'tactical', label: 'Tactical', shortLabel: 'T' },
]

const DEFAULT_LAYERS: LayerState = {
  spine: true,
  ghosts: true,
  tasks: true,
  owners: true,
  unlinkedWork: true,
}

/** User-friendly labels for each layer toggle */
const LAYER_LABELS: Record<keyof LayerState, string> = {
  spine: 'Spine',
  ghosts: 'Ghost nodes',
  tasks: 'Tasks',
  owners: 'Owners',
  unlinkedWork: 'Unlinked Work',
}

/**
 * Custom node type registry — must be defined outside the component
 * to avoid re-creating on every render (ReactFlow requirement).
 */
const NODE_TYPES: NodeTypes = {
  goal: GoalNode,
  milestone: MilestoneNode,
  objective: ObjectiveNode,
  task: TaskNode,
  expand: ExpandNode,
  divider: DividerNode,
}

// ============================================================================
// NOW LINE COMPONENT
// ============================================================================

/**
 * Vertical "Today" marker rendered as a ReactFlow Panel with absolute positioning.
 * The line position is computed from dateToX(now) and the current viewport transform.
 */
function NowLine({
  pxPerDay,
  rangeStart,
}: {
  pxPerDay: number
  rangeStart: Date | null
}) {
  if (!rangeStart) return null

  const nowX = dateToX(new Date(), pxPerDay, rangeStart)

  return (
    <Panel position="top-left" style={{ margin: 0, padding: 0, pointerEvents: 'none' }}>
      <div
        className="absolute top-0"
        style={{
          left: nowX,
          height: '200vh',
          width: 0,
          borderLeft: '2px dashed rgba(59, 130, 246, 0.5)',
          transform: 'translateX(-1px)',
          pointerEvents: 'none',
        }}
      >
        <span
          className="absolute -top-0 -translate-x-1/2 bg-electric-blue/10 text-electric-blue text-[10px] font-medium px-1.5 py-0.5 rounded"
          style={{ pointerEvents: 'auto' }}
        >
          Today
        </span>
      </div>
    </Panel>
  )
}

// ============================================================================
// INNER COMPONENT (requires ReactFlowProvider ancestor)
// ============================================================================

function StrategicCanvasInner({
  initialGoals,
}: StrategicCanvasViewProps) {
  const reactFlowInstance = useReactFlow()

  // -- State --
  const [goals, setGoals] = useState<StrategicGoal[]>(initialGoals)
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(
    initialGoals.length > 0 ? initialGoals[0].id : null
  )
  const [bundle, setBundle] = useState<GoalBundle | null>(null)
  const [viewPreset, setViewPreset] = useState<ViewPreset>('strategic')
  const [layers, setLayers] = useState<LayerState>(DEFAULT_LAYERS)
  const [filters, setFilters] = useState<FilterState>({})
  const [unlinkedData, setUnlinkedData] = useState<UnlinkedItems | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isWizardOpen, setIsWizardOpen] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const fitViewScheduled = useRef(false)

  // -- Details dialog state --
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detailsNodeType, setDetailsNodeType] = useState<'goal' | 'milestone' | 'objective' | 'task' | null>(null)
  const [detailsNodeId, setDetailsNodeId] = useState<string | null>(null)
  const [detailsIsUnlinked, setDetailsIsUnlinked] = useState(false)
  const [allMilestones, setAllMilestones] = useState<MilestoneOption[]>([])

  // -- Goal wizard created handler: refresh goals list, select the new goal --
  const handleGoalCreated = useCallback(
    (newGoalId: string) => {
      // Refresh goal list + unlinked items from server, then select the new goal
      startTransition(async () => {
        const [goalsResult, unlinkedResult] = await Promise.all([
          getStrategicGoals(),
          getUnlinkedItems(),
        ])
        if ('data' in goalsResult) {
          setGoals(goalsResult.data)
        }
        if ('data' in unlinkedResult) {
          setUnlinkedData(unlinkedResult.data)
        }
        setSelectedGoalId(newGoalId)
      })
    },
    []
  )

  // -- Fetch milestones list on mount --
  useEffect(() => {
    startTransition(async () => {
      const result = await getAllMilestones()
      if ('data' in result) {
        setAllMilestones(result.data)
      }
    })
  }, [])

  // -- Data refresh: called after mutations in the details dialog --
  const handleDataRefresh = useCallback(() => {
    startTransition(async () => {
      const promises: Promise<void>[] = []

      // Refetch goal bundle if a goal is selected
      if (selectedGoalId) {
        promises.push(
          getGoalBundle(selectedGoalId).then((result) => {
            if ('data' in result) setBundle(result.data)
          })
        )
      }

      // Always refetch unlinked items
      promises.push(
        getUnlinkedItems().then((result) => {
          if ('data' in result) setUnlinkedData(result.data)
        })
      )

      // Refetch milestones (in case milestones changed)
      promises.push(
        getAllMilestones().then((result) => {
          if ('data' in result) setAllMilestones(result.data)
        })
      )

      // Refetch goals list (in case a goal was deleted)
      promises.push(
        getStrategicGoals().then((result) => {
          if ('data' in result) setGoals(result.data)
        })
      )

      await Promise.all(promises)
    })
  }, [selectedGoalId])

  // -- Handle node click: open details dialog --
  // Guard against double-click opening duplicate dialogs
  const nodeClickRef = useRef(false)

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      // Ignore non-interactive node types
      const nodeType = node.type as string
      if (nodeType === 'expand' || nodeType === 'divider') return

      // Prevent double-click from firing twice
      if (nodeClickRef.current) return
      nodeClickRef.current = true
      setTimeout(() => { nodeClickRef.current = false }, 300)

      // Extract the real item ID from the node ID (e.g. "goal-abc123" → "abc123")
      const prefix = `${nodeType}-`
      const itemId = node.id.startsWith(prefix)
        ? node.id.slice(prefix.length)
        : node.id

      const nodeData = node.data as Record<string, unknown>

      setDetailsNodeType(nodeType as 'goal' | 'milestone' | 'objective' | 'task')
      setDetailsNodeId(itemId)
      setDetailsIsUnlinked(nodeData.isUnlinked === true)
      setDetailsOpen(true)
    },
    []
  )

  // -- Derived pxPerDay --
  const pxPerDay = PX_PER_DAY[viewPreset]

  // -- Range start --
  const rangeStart = useMemo<Date | null>(() => {
    if (!bundle) return null
    return computeRangeStart(bundle)
  }, [bundle])

  // -- Layout: GoalBundle + unlinked items → nodes + edges --
  const { nodes, edges } = useMemo<{ nodes: Node[]; edges: Edge[] }>(() => {
    let structuredNodes: Node[] = []
    let structuredEdges: Edge[] = []

    // Use bundle's rangeStart if available, else fall back to unlinked range
    const effectiveRangeStart =
      rangeStart ??
      (unlinkedData ? computeUnlinkedRangeStart(unlinkedData) : null)

    if (bundle && effectiveRangeStart) {
      const layoutOpts: LayoutOptions = {
        pxPerDay,
        showGhosts: layers.ghosts,
        showTasks: layers.tasks,
        showOwners: layers.owners,
        rangeStart: effectiveRangeStart,
      }

      const elements = goalBundleToElements(bundle, layoutOpts)

      // Apply filters (workstream, status) as node visibility
      if (filters.workstream || filters.status) {
        elements.nodes = elements.nodes.filter((n) => {
          // Spine nodes (goal, milestone) always visible
          if (n.type === 'goal' || n.type === 'milestone' || n.type === 'expand') return true

          const nodeData = n.data as Record<string, unknown>

          if (filters.status && nodeData.status !== filters.status) return false

          // Workstream filter: match against workstream data if present
          return true
        })
      }

      structuredNodes = elements.nodes
      structuredEdges = elements.edges
    }

    // Merge unlinked items if layer is enabled and data exists
    let unlinkedNodes: Node[] = []
    let unlinkedEdges: Edge[] = []

    if (layers.unlinkedWork && unlinkedData && effectiveRangeStart) {
      const spineBottomY = computeSpineBottomY(structuredNodes)
      const unlinkedElements = unlinkedItemsToElements(unlinkedData, {
        pxPerDay,
        rangeStart: effectiveRangeStart,
        showOwners: layers.owners,
        showTasks: layers.tasks,
        spineBottomY,
      })
      unlinkedNodes = unlinkedElements.nodes
      unlinkedEdges = unlinkedElements.edges
    }

    const allNodes = [...structuredNodes, ...unlinkedNodes]
    const allEdges = [...structuredEdges, ...unlinkedEdges]

    // Schedule fitView after nodes are set
    if (allNodes.length > 0) {
      fitViewScheduled.current = true
    }

    return { nodes: allNodes, edges: allEdges }
  }, [bundle, unlinkedData, pxPerDay, layers.ghosts, layers.tasks, layers.owners, layers.unlinkedWork, rangeStart, filters.status, filters.workstream])

  // -- Data fetching: goal bundle + unlinked items in parallel --
  const fetchCanvasData = useCallback(() => {
    setFetchError(null)
    startTransition(async () => {
      try {
        const promises: Promise<void>[] = []

        // Fetch goal bundle if a goal is selected
        if (selectedGoalId) {
          promises.push(
            getGoalBundle(selectedGoalId).then((result) => {
              if ('data' in result) {
                setBundle(result.data)
              } else {
                console.error('[StrategicCanvas] Failed to load goal bundle:', result.error)
                setBundle(null)
                throw new Error(result.error)
              }
            })
          )
        } else {
          setBundle(null)
        }

        // Always fetch unlinked items
        promises.push(
          getUnlinkedItems().then((result) => {
            if ('data' in result) {
              setUnlinkedData(result.data)
            } else {
              console.error('[StrategicCanvas] Failed to load unlinked items:', result.error)
              throw new Error(result.error)
            }
          })
        )

        await Promise.all(promises)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load canvas data'
        setFetchError(message)
        toast.error(message)
      }
    })
  }, [selectedGoalId])

  useEffect(() => {
    fetchCanvasData()
  }, [fetchCanvasData])

  // -- Fit view after nodes change --
  useEffect(() => {
    if (fitViewScheduled.current && nodes.length > 0) {
      fitViewScheduled.current = false
      // Slight delay to let ReactFlow render nodes before fitting
      const timer = setTimeout(() => {
        reactFlowInstance.fitView({ padding: 0.1 })
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [nodes, reactFlowInstance])

  // -- Layer toggle --
  const toggleLayer = useCallback((key: keyof LayerState) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  // -- Goal formatting --
  const formatGoalLabel = useCallback((goal: StrategicGoal): string => {
    const dateStr = goal.milestone_date
      ? new Date(goal.milestone_date).toLocaleDateString('en-GB', {
          month: 'short',
          year: 'numeric',
        })
      : 'No date'
    return `${goal.title} — ${dateStr}`
  }, [])

  // -- Viewport actions --
  const handleSnapToNow = useCallback(() => {
    const effectiveRange =
      rangeStart ??
      (unlinkedData ? computeUnlinkedRangeStart(unlinkedData) : null)
    if (!effectiveRange) return
    const nowX = dateToX(new Date(), pxPerDay, effectiveRange)
    const currentZoom = reactFlowInstance.getZoom()
    reactFlowInstance.setCenter(nowX, SPINE_Y, { zoom: currentZoom })
  }, [rangeStart, unlinkedData, pxPerDay, reactFlowInstance])

  const handleFitGoal = useCallback(() => {
    reactFlowInstance.fitView({ padding: 0.1 })
  }, [reactFlowInstance])

  // -- No goals AND no unlinked items → full empty state --
  const hasUnlinkedItems =
    unlinkedData &&
    (unlinkedData.objectives.length > 0 || unlinkedData.tasks.length > 0)

  if (goals.length === 0 && !hasUnlinkedItems) {
    return (
      <>
        <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 200px)' }}>
          <EmptyState
            icon={<Target className="h-12 w-12" />}
            title="Set your first strategic goal"
            description="Strategic goals are the big outcomes you're working towards. Create one to start building your timeline backwards from the target date."
            action={
              <Button onClick={() => setIsWizardOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Goal
              </Button>
            }
            className="bg-muted/30 rounded-xl p-12 max-w-md"
          />
        </div>
        <GoalWizardDialog
          open={isWizardOpen}
          onOpenChange={setIsWizardOpen}
          onGoalCreated={handleGoalCreated}
        />
      </>
    )
  }

  // -- Selected goal metadata --
  const hasMilestones = (bundle?.milestones?.length ?? 0) > 0

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 180px)' }}>
      {/* ================================================================ */}
      {/* TOOLBAR ROW                                                      */}
      {/* ================================================================ */}
      <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 lg:px-8 py-3 border-b border-slate-100 bg-background">
        {/* Goal selector */}
        <Select
          value={selectedGoalId ?? ''}
          onValueChange={(val) => setSelectedGoalId(val || null)}
        >
          <SelectTrigger className="w-[260px] sm:w-[320px]">
            <SelectValue placeholder="Select a goal…" />
          </SelectTrigger>
          <SelectContent>
            {goals.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                <span className="truncate block max-w-[280px]" title={formatGoalLabel(g)}>
                  {formatGoalLabel(g)}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Separator */}
        <div className="h-6 w-px bg-border hidden sm:block" />

        {/* View preset buttons */}
        <div className="flex items-center rounded-md border border-input bg-background p-0.5">
          {VIEW_PRESET_OPTIONS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => setViewPreset(preset.id)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded transition-colors',
                viewPreset === preset.id
                  ? 'bg-international-orange text-white'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <span className="hidden sm:inline">{preset.label}</span>
              <span className="sm:hidden">{preset.shortLabel}</span>
            </button>
          ))}
        </div>

        {/* Separator */}
        <div className="h-6 w-px bg-border hidden sm:block" />

        {/* Layers popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5">
              <Layers className="h-4 w-4" />
              <span className="hidden sm:inline">Layers</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-48">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Toggle layers
            </p>
            {(Object.keys(layers) as Array<keyof LayerState>).map((key) => (
              <label
                key={key}
                className="flex items-center gap-2 py-1.5 cursor-pointer text-sm"
              >
                <input
                  type="checkbox"
                  checked={layers[key]}
                  onChange={() => toggleLayer(key)}
                  className="rounded border-input"
                />
                <span className="text-foreground">
                  {LAYER_LABELS[key]}
                </span>
              </label>
            ))}
          </PopoverContent>
        </Popover>

        {/* Filters popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5">
              <Filter className="h-4 w-4" />
              <span className="hidden sm:inline">Filters</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56">
            <p className="text-xs font-medium text-muted-foreground mb-3">
              Filter canvas
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Workstream</label>
                <input
                  type="text"
                  value={filters.workstream ?? ''}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      workstream: e.target.value || undefined,
                    }))
                  }
                  placeholder="All workstreams"
                  className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Status</label>
                <select
                  value={filters.status ?? ''}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      status: e.target.value || undefined,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                >
                  <option value="">All statuses</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Pending">Pending</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Separator */}
        <div className="h-6 w-px bg-border hidden sm:block" />

        {/* + Goal button */}
        <Button
          size="sm"
          onClick={() => setIsWizardOpen(true)}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Goal</span>
        </Button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Unlinked overflow indicator */}
        {unlinkedData &&
          (unlinkedData.totalObjectives > unlinkedData.objectives.length ||
            unlinkedData.totalTasks > unlinkedData.tasks.length) && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Showing {unlinkedData.objectives.length} of{' '}
              {unlinkedData.totalObjectives} unlinked objectives
            </span>
          )}

        {/* Snap to Now */}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Snap to now"
          className="h-9 w-9"
          onClick={handleSnapToNow}
        >
          <Crosshair className="h-4 w-4" />
        </Button>

        {/* Fit Goal */}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Fit goal to view"
          className="h-9 w-9"
          onClick={handleFitGoal}
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>

      {/* ================================================================ */}
      {/* MAIN CANVAS AREA                                                 */}
      {/* ================================================================ */}
      <div className="flex-1 relative">
        {/* Loading overlay */}
        {isPending && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-international-orange border-t-transparent" />
              Loading timeline…
            </div>
          </div>
        )}

        {/* Error state with retry */}
        {fetchError && !isPending && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4 bg-muted/30 rounded-xl p-10 max-w-sm text-center">
              <AlertTriangle className="h-10 w-10 text-status-warning" />
              <div>
                <p className="text-sm font-medium text-foreground mb-1">
                  Failed to load canvas
                </p>
                <p className="text-sm text-muted-foreground">{fetchError}</p>
              </div>
              <Button variant="secondary" onClick={fetchCanvasData} className="gap-1.5">
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
            </div>
          </div>
        )}

        {/* Empty state: goal selected but no milestones */}
        {selectedGoalId && !isPending && bundle && !hasMilestones && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <EmptyState
              icon={<Calendar className="h-10 w-10" />}
              title="This goal has no milestones yet"
              description="Milestones break your goal into time-bound checkpoints. Add milestones to start building the timeline."
              action={
                <Button variant="secondary">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Milestones
                </Button>
              }
              className="bg-muted/30 rounded-xl p-10 max-w-sm"
            />
          </div>
        )}

        {/* ReactFlow canvas */}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodeClick={handleNodeClick}
          fitView
          minZoom={0.05}
          maxZoom={3}
          proOptions={{ hideAttribution: true }}
          className="bg-background"
          defaultEdgeOptions={{
            type: 'smoothstep',
            animated: false,
          }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="hsl(var(--muted-foreground) / 0.1)"
          />
          <Controls
            position="bottom-left"
            showInteractive={false}
            className="!shadow-sm !border !rounded-lg"
          />
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            maskColor="hsl(var(--background) / 0.8)"
            className="!shadow-sm !border !rounded-lg hidden md:block"
          />

          {/* "Today" marker line */}
          <NowLine pxPerDay={pxPerDay} rangeStart={rangeStart} />
        </ReactFlow>
      </div>

      {/* Goal creation wizard */}
      <GoalWizardDialog
        open={isWizardOpen}
        onOpenChange={setIsWizardOpen}
        onGoalCreated={handleGoalCreated}
      />

      {/* Node details dialog */}
      {detailsNodeType && detailsNodeId && (
        <NodeDetailsDialog
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          nodeType={detailsNodeType}
          nodeId={detailsNodeId}
          isUnlinked={detailsIsUnlinked}
          milestones={allMilestones}
          onUpdate={handleDataRefresh}
        />
      )}
    </div>
  )
}

// ============================================================================
// EXPORTED WRAPPER (provides ReactFlowProvider)
// ============================================================================

/**
 * @description ReactFlowProvider wrapper for the strategic canvas.
 * ReactFlow requires its provider to be an ancestor of any ReactFlow instance.
 */
export function StrategicCanvasView(props: StrategicCanvasViewProps) {
  return (
    <ReactFlowProvider>
      <StrategicCanvasInner {...props} />
    </ReactFlowProvider>
  )
}
