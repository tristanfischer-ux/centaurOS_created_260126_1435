"use client"

import React, { useState, useCallback, useMemo } from "react"
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
import { Filter, LayoutGrid, Target, Maximize2 } from "lucide-react"
import { getStatusHex } from "@/lib/status-colors"

import { ObjectiveNode } from "./components/objective-node"
import { TaskNode } from "./components/task-node"
import { CanvasDetailPanel } from "./components/canvas-detail-panel"
import type {
  CanvasObjective,
  CanvasTask,
  ObjectiveNodeData,
  TaskNodeData,
} from "./types"

// ─── Custom node types ────────────────────────────────────────
const nodeTypes = {
  objective: ObjectiveNode,
  task: TaskNode,
}

// ─── Layout constants ─────────────────────────────────────────
const OBJECTIVE_WIDTH = 280
const OBJECTIVE_HEIGHT = 160
const TASK_WIDTH = 220
const TASK_HEIGHT = 80
const GAP_X = 80
const GAP_Y = 40
const TASK_OFFSET_Y = 200
const TASK_GAP_Y = 100

/**
 * @description Build ReactFlow nodes and edges from objectives and tasks data.
 * Lays out objectives in a row, with their tasks below each objective.
 */
function buildCanvasElements(
  objectives: CanvasObjective[],
  tasks: CanvasTask[],
  filter: FilterState,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  // Filter objectives
  let filteredObjectives = [...objectives]
  if (filter.health !== 'all') {
    filteredObjectives = filteredObjectives.filter(o => o.health === filter.health)
  }

  // Group tasks by objective
  const tasksByObjective = new Map<string, CanvasTask[]>()
  for (const task of tasks) {
    if (!task.objective_id) continue
    // Apply task status filter
    if (filter.taskStatus !== 'all' && task.status !== filter.taskStatus) continue

    const existing = tasksByObjective.get(task.objective_id) || []
    existing.push(task)
    tasksByObjective.set(task.objective_id, existing)
  }

  // Lay out objectives in a grid-like row
  const cols = Math.max(1, Math.min(4, filteredObjectives.length))

  filteredObjectives.forEach((obj, idx) => {
    const col = idx % cols
    const row = Math.floor(idx / cols)
    const objTasks = tasksByObjective.get(obj.id) || []
    const blockHeight = TASK_OFFSET_Y + (objTasks.length * TASK_GAP_Y) + 100

    const objX = col * (OBJECTIVE_WIDTH + GAP_X + TASK_WIDTH + 60)
    const objY = row * (blockHeight + GAP_Y)

    // Objective node
    const objNodeId = `obj-${obj.id}`
    nodes.push({
      id: objNodeId,
      type: 'objective',
      position: { x: objX, y: objY },
      data: {
        label: obj.title,
        description: obj.description,
        status: obj.status,
        progress: obj.progress,
        health: obj.health,
        totalTasks: obj.totalTasks,
        completedTasks: obj.completedTasks,
        overdueTasks: obj.overdueTasks,
        objectiveId: obj.id,
      } satisfies ObjectiveNodeData,
    })

    // Parent objective edge
    if (obj.parent_objective_id) {
      const parentNodeId = `obj-${obj.parent_objective_id}`
      edges.push({
        id: `edge-parent-${obj.id}`,
        source: parentNodeId,
        target: objNodeId,
        animated: false,
        style: { stroke: '#ff4500', strokeWidth: 2, strokeDasharray: '6 3' },
        label: 'sub-objective',
        labelStyle: { fontSize: 10, fill: '#94a3b8' },
      })
    }

    // Task nodes below the objective
    objTasks.forEach((task, tIdx) => {
      const taskNodeId = `task-${task.id}`
      const taskX = objX + (OBJECTIVE_WIDTH - TASK_WIDTH) / 2
      const taskY = objY + TASK_OFFSET_Y + tIdx * TASK_GAP_Y

      nodes.push({
        id: taskNodeId,
        type: 'task',
        position: { x: taskX, y: taskY },
        data: {
          label: task.title,
          status: task.status,
          // Prefer task_assignees over legacy assignee_id
          assigneeName: ((task.assignees ?? []).length > 0 ? (task.assignees ?? [])[0].full_name : task.assignee?.full_name) ?? null,
          endDate: task.end_date,
          riskLevel: task.risk_level,
          progress: task.progress,
          taskNumber: task.task_number,
          taskId: task.id,
          objectiveId: task.objective_id,
        } satisfies TaskNodeData,
      })

      // Edge from objective to task
      edges.push({
        id: `edge-${obj.id}-${task.id}`,
        source: objNodeId,
        target: taskNodeId,
        animated: false,
        style: { stroke: '#e2e8f0', strokeWidth: 1.5 },
      })
    })
  })

  // Also handle orphan tasks (no objective)
  const orphanTasks = tasks.filter(t => !t.objective_id)
  if (orphanTasks.length > 0 && filter.taskStatus === 'all') {
    const orphanX = filteredObjectives.length > 0
      ? (cols) * (OBJECTIVE_WIDTH + GAP_X + TASK_WIDTH + 60)
      : 0

    orphanTasks.forEach((task, tIdx) => {
      if (filter.taskStatus !== 'all' && task.status !== filter.taskStatus) return

      nodes.push({
        id: `task-${task.id}`,
        type: 'task',
        position: { x: orphanX, y: tIdx * TASK_GAP_Y },
        data: {
          label: task.title,
          status: task.status,
          // Prefer task_assignees over legacy assignee_id
          assigneeName: ((task.assignees ?? []).length > 0 ? (task.assignees ?? [])[0].full_name : task.assignee?.full_name) ?? null,
          endDate: task.end_date,
          riskLevel: task.risk_level,
          progress: task.progress,
          taskNumber: task.task_number,
          taskId: task.id,
          objectiveId: task.objective_id,
        } satisfies TaskNodeData,
      })
    })
  }

  return { nodes, edges }
}

// ─── Filter state ─────────────────────────────────────────────
interface FilterState {
  health: 'all' | 'on-track' | 'at-risk' | 'off-track' | 'completed' | 'not-started'
  taskStatus: string
}

const HEALTH_OPTIONS = [
  { value: 'all', label: 'All Health' },
  { value: 'on-track', label: 'On Track' },
  { value: 'at-risk', label: 'At Risk' },
  { value: 'off-track', label: 'Off Track' },
  { value: 'completed', label: 'Completed' },
  { value: 'not-started', label: 'Not Started' },
] as const

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'Pending', label: 'Pending' },
  { value: 'Accepted', label: 'Accepted' },
  { value: 'Completed', label: 'Completed' },
  { value: 'Rejected', label: 'Rejected' },
] as const

// ─── Inner canvas component (needs ReactFlowProvider) ─────────
function CanvasInner({
  objectives,
  tasks,
}: {
  objectives: CanvasObjective[]
  tasks: CanvasTask[]
}) {
  const [filter, setFilter] = useState<FilterState>({
    health: 'all',
    taskStatus: 'all',
  })

  const [selectedNode, setSelectedNode] = useState<{
    type: 'objective' | 'task'
    data: ObjectiveNodeData | TaskNodeData
  } | null>(null)

  // Build nodes and edges from data
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildCanvasElements(objectives, tasks, filter),
    [objectives, tasks, filter]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Sync when filter changes
  React.useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = buildCanvasElements(objectives, tasks, filter)
    setNodes(newNodes)
    setEdges(newEdges)
  }, [filter, objectives, tasks, setNodes, setEdges])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const type = node.type === 'objective' ? 'objective' : 'task'
    setSelectedNode({
      type: type as 'objective' | 'task',
      data: node.data as unknown as ObjectiveNodeData | TaskNodeData,
    })
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [])

  /** MiniMap node color based on type and status */
  const miniMapNodeColor = useCallback((node: Node) => {
    if (node.type === 'objective') {
      return '#ff4500' // International Orange
    }
    const status = (node.data as TaskNodeData)?.status
    return getStatusHex(status ?? null)
  }, [])

  const nodeCount = nodes.length
  const objectiveCount = nodes.filter(n => n.type === 'objective').length
  const taskCount = nodes.filter(n => n.type === 'task').length

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-slate-100 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={filter.health}
              onChange={(e) => setFilter(f => ({ ...f, health: e.target.value as FilterState['health'] }))}
              className="text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-white text-foreground focus:outline-none focus:ring-1 focus:ring-international-orange"
              aria-label="Filter by health"
            >
              {HEALTH_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <select
              value={filter.taskStatus}
              onChange={(e) => setFilter(f => ({ ...f, taskStatus: e.target.value }))}
              className="text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-white text-foreground focus:outline-none focus:ring-1 focus:ring-international-orange"
              aria-label="Filter by task status"
            >
              {STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Target className="w-3 h-3 text-international-orange" />
            {objectiveCount} objectives
          </span>
          <span className="flex items-center gap-1">
            <LayoutGrid className="w-3 h-3" />
            {taskCount} tasks
          </span>
        </div>
      </div>

      {/* Canvas area */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{
              animated: false,
              style: { stroke: '#e2e8f0', strokeWidth: 1.5 },
            }}
            className="bg-slate-50/50"
            minZoom={0.1}
            maxZoom={2}
          >
            <Controls
              className="!bg-white !border-slate-200 !shadow-sm"
              showInteractive={false}
            />
            <MiniMap
              className="!bg-white !border-slate-200 !shadow-sm"
              maskColor="rgba(248, 250, 252, 0.7)"
              nodeColor={miniMapNodeColor}
            />
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="#e2e8f0"
            />
          </ReactFlow>

          {/* Empty state */}
          {nodeCount === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center max-w-md">
                <div className="w-16 h-16 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center mx-auto mb-4">
                  <Maximize2 className="w-8 h-8 text-orange-400" />
                </div>
                <h3 className="font-display text-lg font-semibold text-foreground mb-2">
                  No data to visualize
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Create objectives and tasks to see them rendered as an interactive spatial map.
                  {filter.health !== 'all' || filter.taskStatus !== 'all'
                    ? ' Try adjusting your filters.'
                    : ''}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedNode && (
          <CanvasDetailPanel
            nodeType={selectedNode.type}
            data={selectedNode.data}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>
    </div>
  )
}

// ─── Exported wrapper with ReactFlowProvider ──────────────────
export function CanvasView({
  objectives,
  tasks,
}: {
  objectives: CanvasObjective[]
  tasks: CanvasTask[]
}) {
  return (
    <ReactFlowProvider>
      <CanvasInner objectives={objectives} tasks={tasks} />
    </ReactFlowProvider>
  )
}
