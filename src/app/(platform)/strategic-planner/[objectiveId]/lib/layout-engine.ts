/**
 * @file layout-engine.ts
 *
 * @description Time-based layout engine for the Strategic Canvas.
 * Maps dates to X-axis pixel positions, groups tasks into swimlanes
 * (by phase or by person), and generates React Flow nodes and edges.
 *
 * @dependencies None external - pure layout calculations
 */

import type { Node, Edge } from "@xyflow/react"
import type { StrategicPlanOverview, CanvasGrouping, StrategicTask } from "@/types/strategic-planner"
import {
  differenceInDays,
  addDays,
  startOfWeek,
  startOfMonth,
  eachWeekOfInterval,
  eachMonthOfInterval,
  format,
} from "date-fns"

// ─── Layout Constants ────────────────────────────────────────────

const PIXELS_PER_DAY = 12
const TASK_HEIGHT = 80
const TASK_VERTICAL_GAP = 16
const PHASE_PADDING_X = 20
const PHASE_PADDING_Y = 50
const PHASE_HEADER_HEIGHT = 40
const PHASE_VERTICAL_GAP = 40
const SWIMLANE_LABEL_WIDTH = 0
const TIMELINE_TOP_OFFSET = 60
const RESOURCE_GAP_OFFSET_Y = 20
const AI_SUGGESTION_OFFSET_Y = 20
const MIN_TASK_WIDTH = 80

export interface TimeRange {
  minDate: Date
  maxDate: Date
  pixelWidth: number
  weekMarkers: Array<{ date: Date; x: number }>
  monthMarkers: Array<{ date: Date; x: number; label: string }>
}

interface LayoutResult {
  initialNodes: Node[]
  initialEdges: Edge[]
  timeRange: TimeRange
}

// ─── Date-to-Pixel Mapping ──────────────────────────────────────

/**
 * Converts a date to an X-axis pixel position.
 */
function dateToX(date: Date, minDate: Date): number {
  const days = differenceInDays(date, minDate)
  return days * PIXELS_PER_DAY + SWIMLANE_LABEL_WIDTH
}

/**
 * Calculates the pixel width for a date range.
 */
function dateRangeToWidth(startDate: Date, endDate: Date): number {
  const days = Math.max(1, differenceInDays(endDate, startDate))
  return Math.max(MIN_TASK_WIDTH, days * PIXELS_PER_DAY)
}

// ─── Main Layout Function ───────────────────────────────────────

/**
 * Builds React Flow nodes and edges from a strategic plan overview.
 *
 * @param planData - The full plan data from the server
 * @param grouping - How to group tasks: 'phase' or 'person'
 * @returns Nodes, edges, and time range for rendering
 */
export function buildCanvasLayout(
  planData: StrategicPlanOverview,
  grouping: CanvasGrouping
): LayoutResult {
  const nodes: Node[] = []
  const edges: Edge[] = []

  // Collect all dates to determine time range
  const allDates: Date[] = []
  for (const phase of planData.phases) {
    for (const task of phase.tasks) {
      if (task.start_date) allDates.push(new Date(task.start_date))
      if (task.end_date) allDates.push(new Date(task.end_date))
    }
  }
  if (planData.goal.milestone_date) {
    allDates.push(new Date(planData.goal.milestone_date))
  }

  // Add today and some padding
  const today = new Date()
  allDates.push(today)

  if (allDates.length === 0) {
    return {
      initialNodes: [],
      initialEdges: [],
      timeRange: {
        minDate: today,
        maxDate: addDays(today, 90),
        pixelWidth: 90 * PIXELS_PER_DAY,
        weekMarkers: [],
        monthMarkers: [],
      },
    }
  }

  const minDate = startOfWeek(
    new Date(Math.min(...allDates.map((d) => d.getTime())) - 7 * 24 * 60 * 60 * 1000)
  )
  const maxDate = addDays(
    new Date(Math.max(...allDates.map((d) => d.getTime()))),
    14
  )
  const pixelWidth = dateToX(maxDate, minDate)

  // Build time markers
  const weekMarkers = eachWeekOfInterval({ start: minDate, end: maxDate }).map((date) => ({
    date,
    x: dateToX(date, minDate),
  }))

  const monthMarkers = eachMonthOfInterval({ start: minDate, end: maxDate }).map((date) => ({
    date,
    x: dateToX(date, minDate),
    label: format(date, 'MMM yyyy'),
  }))

  const timeRange: TimeRange = { minDate, maxDate, pixelWidth, weekMarkers, monthMarkers }

  // Build layout based on grouping
  if (grouping === 'phase') {
    buildPhaseLayout(planData, nodes, edges, minDate, timeRange)
  } else {
    buildPersonLayout(planData, nodes, edges, minDate, timeRange)
  }

  // Add milestone node for the goal deadline
  if (planData.goal.milestone_date) {
    const milestoneX = dateToX(new Date(planData.goal.milestone_date), minDate)
    nodes.push({
      id: 'milestone-goal',
      type: 'milestone',
      position: { x: milestoneX - 20, y: TIMELINE_TOP_OFFSET - 30 },
      data: {
        label: 'Goal Deadline',
        date: planData.goal.milestone_date,
      },
    })
  }

  // Add resource gap nodes
  const resourceSuggestions = planData.goal.resource_suggestions || []
  resourceSuggestions.forEach((suggestion, idx) => {
    // Position resource gaps below the last phase
    const lastNode = nodes.filter((n) => n.type === 'phase').pop()
    const yBase = lastNode ? (lastNode.position.y + (lastNode.data.height as number || 200)) + 30 : 400

    nodes.push({
      id: `resource-gap-${idx}`,
      type: 'resourceGap',
      position: {
        x: 60 + idx * 240,
        y: yBase + RESOURCE_GAP_OFFSET_Y,
      },
      data: {
        role: suggestion.role,
        reason: suggestion.reason,
        phase: suggestion.phase,
        priority: suggestion.priority,
      },
    })
  })

  // Add AI suggestion nodes
  const aiSuggestions = (planData.goal.ai_suggestions || []).filter((s) => !s.dismissed)
  aiSuggestions.forEach((suggestion, idx) => {
    const lastResourceNode = nodes.filter((n) => n.type === 'resourceGap').pop()
    const lastPhaseNode = nodes.filter((n) => n.type === 'phase').pop()
    const yBase = lastResourceNode
      ? lastResourceNode.position.y + 100
      : lastPhaseNode
        ? (lastPhaseNode.position.y + (lastPhaseNode.data.height as number || 200)) + 30
        : 500

    nodes.push({
      id: `ai-suggestion-${idx}`,
      type: 'aiSuggestion',
      position: {
        x: 60 + idx * 280,
        y: yBase + AI_SUGGESTION_OFFSET_Y,
      },
      data: {
        id: suggestion.id,
        type: suggestion.type,
        message: suggestion.message,
        relatedPhase: suggestion.relatedPhase,
      },
    })
  })

  return { initialNodes: nodes, initialEdges: edges, timeRange }
}

// ─── Phase-Based Layout ─────────────────────────────────────────

function buildPhaseLayout(
  planData: StrategicPlanOverview,
  nodes: Node[],
  edges: Edge[],
  minDate: Date,
  timeRange: TimeRange
): void {
  let currentY = TIMELINE_TOP_OFFSET

  for (const phase of planData.phases) {
    const phaseStartY = currentY
    const taskCount = phase.tasks.length
    const phaseContentHeight = Math.max(
      TASK_HEIGHT + TASK_VERTICAL_GAP,
      taskCount * (TASK_HEIGHT + TASK_VERTICAL_GAP)
    )
    const phaseHeight = PHASE_HEADER_HEIGHT + phaseContentHeight + PHASE_PADDING_Y

    // Calculate phase X bounds from task dates
    let phaseMinX = Infinity
    let phaseMaxX = 0

    for (const task of phase.tasks) {
      const startX = task.start_date
        ? dateToX(new Date(task.start_date), minDate)
        : dateToX(new Date(), minDate)
      const endX = task.end_date
        ? dateToX(new Date(task.end_date), minDate)
        : startX + MIN_TASK_WIDTH
      phaseMinX = Math.min(phaseMinX, startX)
      phaseMaxX = Math.max(phaseMaxX, endX)
    }

    if (phaseMinX === Infinity) {
      phaseMinX = 60
      phaseMaxX = 400
    }

    // Phase node (group container)
    const phaseNodeId = `phase-${phase.objective.id}`
    nodes.push({
      id: phaseNodeId,
      type: 'phase',
      position: {
        x: phaseMinX - PHASE_PADDING_X,
        y: phaseStartY,
      },
      data: {
        label: phase.objective.title,
        description: phase.objective.description,
        status: phase.objective.status,
        progress: phase.objective.progress,
        width: (phaseMaxX - phaseMinX) + PHASE_PADDING_X * 2,
        height: phaseHeight,
      },
    })

    // Task nodes within this phase
    phase.tasks.forEach((task, taskIdx) => {
      const taskStartX = task.start_date
        ? dateToX(new Date(task.start_date), minDate)
        : dateToX(new Date(), minDate)
      const taskWidth = task.start_date && task.end_date
        ? dateRangeToWidth(new Date(task.start_date), new Date(task.end_date))
        : MIN_TASK_WIDTH

      const taskY = phaseStartY + PHASE_HEADER_HEIGHT + taskIdx * (TASK_HEIGHT + TASK_VERTICAL_GAP)

      const isCriticalPath = planData.criticalPathTaskIds.includes(task.id)

      nodes.push({
        id: `task-${task.id}`,
        type: 'strategicTask',
        position: { x: taskStartX, y: taskY },
        data: {
          label: task.title,
          status: task.status,
          riskLevel: task.risk_level,
          startDate: task.start_date,
          endDate: task.end_date,
          progress: task.progress,
          assignees: task.assignees,
          isCriticalPath,
          width: taskWidth,
        },
      })
    })

    currentY += phaseHeight + PHASE_VERTICAL_GAP
  }

  // Build dependency edges
  buildDependencyEdges(planData, edges)
}

// ─── Person-Based Layout ─────────────────────────────────────────

function buildPersonLayout(
  planData: StrategicPlanOverview,
  nodes: Node[],
  edges: Edge[],
  minDate: Date,
  timeRange: TimeRange
): void {
  // Group tasks by assignee
  const tasksByPerson = new Map<string, { name: string; role: string | null; tasks: StrategicTask[] }>()
  const unassignedTasks: StrategicTask[] = []

  const allTasks = planData.phases.flatMap((p) => p.tasks)

  for (const task of allTasks) {
    if (task.assignees.length > 0) {
      for (const assignee of task.assignees) {
        const existing = tasksByPerson.get(assignee.id) || {
          name: assignee.full_name || 'Unknown',
          role: assignee.role,
          tasks: [],
        }
        existing.tasks.push(task)
        tasksByPerson.set(assignee.id, existing)
      }
    } else {
      unassignedTasks.push(task)
    }
  }

  // Add unassigned lane
  if (unassignedTasks.length > 0) {
    tasksByPerson.set('unassigned', {
      name: 'Unassigned',
      role: null,
      tasks: unassignedTasks,
    })
  }

  let currentY = TIMELINE_TOP_OFFSET

  for (const [personId, person] of tasksByPerson.entries()) {
    const phaseStartY = currentY
    const taskCount = person.tasks.length
    const laneHeight = PHASE_HEADER_HEIGHT + taskCount * (TASK_HEIGHT + TASK_VERTICAL_GAP) + PHASE_PADDING_Y

    // Calculate X bounds
    let laneMinX = Infinity
    let laneMaxX = 0

    for (const task of person.tasks) {
      const startX = task.start_date
        ? dateToX(new Date(task.start_date), minDate)
        : dateToX(new Date(), minDate)
      const endX = task.end_date
        ? dateToX(new Date(task.end_date), minDate)
        : startX + MIN_TASK_WIDTH
      laneMinX = Math.min(laneMinX, startX)
      laneMaxX = Math.max(laneMaxX, endX)
    }

    if (laneMinX === Infinity) {
      laneMinX = 60
      laneMaxX = 400
    }

    // Person lane as phase node
    nodes.push({
      id: `person-${personId}`,
      type: 'phase',
      position: {
        x: laneMinX - PHASE_PADDING_X,
        y: phaseStartY,
      },
      data: {
        label: person.name,
        description: person.role,
        status: 'In Progress',
        progress: 0,
        width: (laneMaxX - laneMinX) + PHASE_PADDING_X * 2,
        height: laneHeight,
      },
    })

    // Task nodes
    person.tasks.forEach((task, taskIdx) => {
      const taskStartX = task.start_date
        ? dateToX(new Date(task.start_date), minDate)
        : dateToX(new Date(), minDate)
      const taskWidth = task.start_date && task.end_date
        ? dateRangeToWidth(new Date(task.start_date), new Date(task.end_date))
        : MIN_TASK_WIDTH
      const taskY = phaseStartY + PHASE_HEADER_HEIGHT + taskIdx * (TASK_HEIGHT + TASK_VERTICAL_GAP)

      const isCriticalPath = planData.criticalPathTaskIds.includes(task.id)

      nodes.push({
        id: `task-${task.id}`,
        type: 'strategicTask',
        position: { x: taskStartX, y: taskY },
        data: {
          label: task.title,
          status: task.status,
          riskLevel: task.risk_level,
          startDate: task.start_date,
          endDate: task.end_date,
          progress: task.progress,
          assignees: task.assignees,
          isCriticalPath,
          width: taskWidth,
        },
      })
    })

    currentY += laneHeight + PHASE_VERTICAL_GAP
  }

  buildDependencyEdges(planData, edges)
}

// ─── Dependency Edges ────────────────────────────────────────────

function buildDependencyEdges(
  planData: StrategicPlanOverview,
  edges: Edge[]
): void {
  const criticalSet = new Set(planData.criticalPathTaskIds)

  for (const dep of planData.allDependencies) {
    const sourceId = `task-${dep.depends_on_task_id}`
    const targetId = `task-${dep.task_id}`

    const isCritical = criticalSet.has(dep.depends_on_task_id) && criticalSet.has(dep.task_id)

    edges.push({
      id: `dep-${dep.id}`,
      source: sourceId,
      target: targetId,
      type: 'default',
      animated: isCritical,
      style: {
        stroke: isCritical ? 'hsl(var(--international-orange))' : 'hsl(var(--muted-foreground) / 0.4)',
        strokeWidth: isCritical ? 2.5 : 1.5,
      },
      markerEnd: {
        type: 'arrowclosed' as const,
        color: isCritical ? 'hsl(var(--international-orange))' : 'hsl(var(--muted-foreground) / 0.4)',
      },
    })
  }
}
