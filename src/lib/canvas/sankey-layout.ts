/**
 * @file sankey-layout.ts
 *
 * @description Layout algorithm for the Strategy Flow (Sankey-inspired) visualization.
 * Computes node positions and link paths for two modes:
 *   - Overview: All strategic goals → Status distribution
 *   - Detail: Single goal → Milestones → Objectives → Task status
 *
 * Follows the same custom SVG pattern used by the Money Map Sankey chart.
 *
 * @related
 * - Chart renderer: src/components/canvas/strategy-flow-chart.tsx
 * - View component: src/app/(platform)/canvas/strategy-flow-view.tsx
 * - Types: src/types/canvas.ts
 */

import type { GoalBundle, StrategicGoal } from '@/types/canvas'

// ============================================================================
// TYPES
// ============================================================================

/** Metadata attached to each Sankey node */
export interface SankeyNodeMeta {
  type: 'goal' | 'milestone' | 'objective' | 'status'
  taskCount: number
  status?: string
  progress?: number
  goalId?: string
}

/** A positioned node in the Sankey diagram */
export interface SankeyNode {
  id: string
  label: string
  column: number
  x: number
  y: number
  width: number
  height: number
  color: string
  metadata: SankeyNodeMeta
}

/** A flow link connecting two nodes */
export interface SankeyLink {
  id: string
  sourceId: string
  targetId: string
  value: number
  thickness: number
  path: string
  color: string
}

/** Complete layout result */
export interface SankeyLayout {
  nodes: SankeyNode[]
  links: SankeyLink[]
  width: number
  height: number
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** SVG viewBox dimensions */
const VB_W = 960
const VB_H_MIN = 400
const NODE_W = 140
const NODE_GAP = 16
const COL_GAP = 200
const MIN_NODE_H = 28
const PADDING_X = 40
const PADDING_Y = 40

/** Column x-positions for overview (2 columns) */
const OVERVIEW_COLS = [PADDING_X, PADDING_X + NODE_W + COL_GAP * 2]

/** Column x-positions for detail (4 columns) */
const DETAIL_COLS = [
  PADDING_X,
  PADDING_X + NODE_W + COL_GAP,
  PADDING_X + (NODE_W + COL_GAP) * 2,
  PADDING_X + (NODE_W + COL_GAP) * 3,
]

// ============================================================================
// STATUS COLORS (HSL CSS variables for semantic tokens)
// ============================================================================

const STATUS_COLORS: Record<string, string> = {
  Completed: 'hsl(var(--status-success))',
  Accepted: 'hsl(var(--status-info))',
  Pending: 'hsl(var(--muted-foreground))',
  Rejected: 'hsl(var(--status-error))',
  Amended: 'hsl(var(--status-warning))',
  Amended_Pending_Approval: 'hsl(var(--status-warning))',
  Pending_Peer_Review: 'hsl(var(--status-info))',
  Pending_Executive_Approval: 'hsl(var(--status-info))',
  'In Progress': 'hsl(var(--status-info))',
  'On Track': 'hsl(var(--status-success))',
  'At Risk': 'hsl(var(--status-warning))',
  'Off Track': 'hsl(var(--status-error))',
  'Not Started': 'hsl(var(--muted-foreground))',
}

const GOAL_COLOR = 'hsl(var(--international-orange))'
const MILESTONE_COLOR = 'hsl(var(--electric-blue))'
const OBJECTIVE_COLOR = 'hsl(var(--muted-foreground))'
const DEFAULT_STATUS_COLOR = 'hsl(var(--muted-foreground))'

/**
 * Get the color for a given status string.
 *
 * @param status - Status label
 * @returns HSL color string
 */
function getStatusColor(status: string): string {
  return STATUS_COLORS[status] ?? DEFAULT_STATUS_COLOR
}

// ============================================================================
// LINK PATH GENERATION
// ============================================================================

/**
 * Generate a smooth S-curve path between two vertical ranges.
 * Connects the right edge of a source node to the left edge of a target node.
 *
 * @param x1 - Source right edge x
 * @param y1t - Source top y of the link's band
 * @param y1b - Source bottom y of the link's band
 * @param x2 - Target left edge x
 * @param y2t - Target top y of the link's band
 * @param y2b - Target bottom y of the link's band
 * @returns SVG path d-attribute for a filled flow shape
 */
function flowPath(
  x1: number,
  y1t: number,
  y1b: number,
  x2: number,
  y2t: number,
  y2b: number
): string {
  const mx = (x1 + x2) / 2
  return [
    `M ${x1} ${y1t}`,
    `C ${mx} ${y1t}, ${mx} ${y2t}, ${x2} ${y2t}`,
    `L ${x2} ${y2b}`,
    `C ${mx} ${y2b}, ${mx} ${y1b}, ${x1} ${y1b}`,
    'Z',
  ].join(' ')
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Scale a raw count to a pixel height, ensuring minimum visibility.
 *
 * @param count - The task count for this node
 * @param maxCount - The maximum task count across all nodes at this level
 * @param maxHeight - The maximum pixel height available
 * @returns Pixel height for the node
 */
function scaleHeight(
  count: number,
  maxCount: number,
  maxHeight: number
): number {
  if (maxCount === 0) return MIN_NODE_H
  const h = (count / maxCount) * maxHeight
  return Math.max(h, MIN_NODE_H)
}

/**
 * Distribute tasks across status buckets from a GoalBundle.
 *
 * @param bundle - The goal bundle containing tasks
 * @returns Map of status label to task count
 */
function getTaskStatusDistribution(
  tasks: Array<{ status: string | null }>
): Map<string, number> {
  const dist = new Map<string, number>()
  for (const task of tasks) {
    const status = task.status ?? 'Pending'
    dist.set(status, (dist.get(status) ?? 0) + 1)
  }
  return dist
}

/**
 * Position nodes vertically within a column, centered and evenly spaced.
 *
 * @param nodes - Array of nodes to position (must already have height set)
 * @param totalHeight - Available vertical space
 */
function positionNodesVertically(
  nodes: SankeyNode[],
  totalHeight: number
): void {
  const totalNodeHeight = nodes.reduce((sum, n) => sum + n.height, 0)
  const totalGap = Math.max(0, (nodes.length - 1) * NODE_GAP)
  const contentHeight = totalNodeHeight + totalGap
  let startY = Math.max(PADDING_Y, (totalHeight - contentHeight) / 2)

  for (const node of nodes) {
    node.y = startY
    startY += node.height + NODE_GAP
  }
}

// ============================================================================
// OVERVIEW LAYOUT
// ============================================================================

/**
 * Compute the overview Sankey layout: all strategic goals → status distribution.
 *
 * @description Each goal is a source node on the left. Tasks are aggregated by
 * status across all goals and shown as sink nodes on the right. Link thickness
 * is proportional to the number of tasks flowing from each goal to each status.
 *
 * @param goals - Array of strategic goals
 * @param bundles - Array of goal bundles (parallel to goals)
 * @returns Complete Sankey layout with positioned nodes and curved links
 */
export function computeOverviewLayout(
  goals: StrategicGoal[],
  bundles: GoalBundle[]
): SankeyLayout {
  if (goals.length === 0) {
    return { nodes: [], links: [], width: VB_W, height: VB_H_MIN }
  }

  // Build goal nodes with task counts
  const goalNodes: SankeyNode[] = []
  const goalTaskCounts: number[] = []
  const goalStatusMaps: Map<string, number>[] = []

  for (let i = 0; i < goals.length; i++) {
    const goal = goals[i]
    const bundle = bundles[i]
    const taskCount = bundle?.tasks?.length ?? 0
    goalTaskCounts.push(taskCount)

    const statusDist = getTaskStatusDistribution(bundle?.tasks ?? [])
    goalStatusMaps.push(statusDist)

    goalNodes.push({
      id: `goal-${goal.id}`,
      label: goal.title,
      column: 0,
      x: OVERVIEW_COLS[0],
      y: 0,
      width: NODE_W,
      height: 0,
      color: GOAL_COLOR,
      metadata: {
        type: 'goal',
        taskCount,
        status: goal.status ?? undefined,
        progress: goal.progress ?? undefined,
        goalId: goal.id,
      },
    })
  }

  // Aggregate all statuses across goals
  const allStatuses = new Map<string, number>()
  for (const statusMap of goalStatusMaps) {
    for (const [status, count] of statusMap) {
      allStatuses.set(status, (allStatuses.get(status) ?? 0) + count)
    }
  }

  // Build status nodes
  const statusEntries = Array.from(allStatuses.entries()).sort(
    (a, b) => b[1] - a[1]
  )

  const statusNodes: SankeyNode[] = statusEntries.map(([status, count]) => ({
    id: `status-${status}`,
    label: status.replace(/_/g, ' '),
    column: 1,
    x: OVERVIEW_COLS[1],
    y: 0,
    width: NODE_W,
    height: 0,
    color: getStatusColor(status),
    metadata: {
      type: 'status' as const,
      taskCount: count,
      status,
    },
  }))

  // Scale heights
  const maxGoalTasks = Math.max(...goalTaskCounts, 1)
  const maxStatusTasks = Math.max(
    ...statusEntries.map(([, c]) => c),
    1
  )
  const maxAvailableHeight = Math.max(
    VB_H_MIN - PADDING_Y * 2,
    goals.length * (MIN_NODE_H + NODE_GAP) + 60
  )

  for (let i = 0; i < goalNodes.length; i++) {
    goalNodes[i].height = scaleHeight(
      goalTaskCounts[i],
      maxGoalTasks,
      maxAvailableHeight * 0.7
    )
  }

  for (let i = 0; i < statusNodes.length; i++) {
    statusNodes[i].height = scaleHeight(
      statusEntries[i][1],
      maxStatusTasks,
      maxAvailableHeight * 0.7
    )
  }

  // Calculate total height needed
  const goalTotalH =
    goalNodes.reduce((s, n) => s + n.height, 0) +
    Math.max(0, (goalNodes.length - 1) * NODE_GAP) +
    PADDING_Y * 2
  const statusTotalH =
    statusNodes.reduce((s, n) => s + n.height, 0) +
    Math.max(0, (statusNodes.length - 1) * NODE_GAP) +
    PADDING_Y * 2
  const totalHeight = Math.max(VB_H_MIN, goalTotalH, statusTotalH)

  // Position vertically
  positionNodesVertically(goalNodes, totalHeight)
  positionNodesVertically(statusNodes, totalHeight)

  // Build links
  const links: SankeyLink[] = []
  const statusOffsets = new Map<string, number>()
  for (const sn of statusNodes) {
    statusOffsets.set(sn.metadata.status!, sn.y)
  }

  for (let gi = 0; gi < goalNodes.length; gi++) {
    const gn = goalNodes[gi]
    const statusMap = goalStatusMaps[gi]
    const goalTotal = goalTaskCounts[gi]
    if (goalTotal === 0) continue

    let sourceOffset = gn.y

    for (const [status, count] of statusMap) {
      const statusNode = statusNodes.find(
        (n) => n.metadata.status === status
      )
      if (!statusNode) continue

      const sourceThickness = (count / goalTotal) * gn.height
      const targetThickness =
        (count / (statusNode.metadata.taskCount || 1)) * statusNode.height

      const currentTargetOffset = statusOffsets.get(status) ?? statusNode.y

      links.push({
        id: `link-${gn.id}-${status}`,
        sourceId: gn.id,
        targetId: statusNode.id,
        value: count,
        thickness: sourceThickness,
        path: flowPath(
          gn.x + gn.width,
          sourceOffset,
          sourceOffset + sourceThickness,
          statusNode.x,
          currentTargetOffset,
          currentTargetOffset + targetThickness
        ),
        color: getStatusColor(status),
      })

      sourceOffset += sourceThickness
      statusOffsets.set(status, currentTargetOffset + targetThickness)
    }
  }

  return {
    nodes: [...goalNodes, ...statusNodes],
    links,
    width: VB_W,
    height: totalHeight,
  }
}

// ============================================================================
// DETAIL LAYOUT
// ============================================================================

/**
 * Compute the detail Sankey layout for a single strategic goal.
 *
 * @description Shows the decomposition: Goal → Milestones → Objectives → Task Status.
 * Each level is a column, with link thickness proportional to task count.
 *
 * @param bundle - The goal bundle with milestones, objectives, and tasks
 * @returns Complete Sankey layout with positioned nodes and curved links
 */
export function computeDetailLayout(bundle: GoalBundle): SankeyLayout {
  const { goal, milestones, objectives, tasks } = bundle

  // Build milestone → objectives mapping
  const objByMilestone = new Map<string, typeof objectives>()
  for (const obj of objectives) {
    const mid = obj.parent_objective_id
    if (!mid) continue
    const list = objByMilestone.get(mid) ?? []
    list.push(obj)
    objByMilestone.set(mid, list)
  }

  // Build objective → tasks mapping
  const tasksByObjective = new Map<string, typeof tasks>()
  for (const task of tasks) {
    const oid = task.objective_id
    if (!oid) continue
    const list = tasksByObjective.get(oid) ?? []
    list.push(task)
    tasksByObjective.set(oid, list)
  }

  // Count tasks per milestone
  const taskCountByMilestone = new Map<string, number>()
  for (const ms of milestones) {
    const msObjs = objByMilestone.get(ms.id) ?? []
    let count = 0
    for (const obj of msObjs) {
      count += (tasksByObjective.get(obj.id) ?? []).length
    }
    taskCountByMilestone.set(ms.id, count)
  }

  // Task status distribution (for the rightmost column)
  const statusDist = getTaskStatusDistribution(tasks)
  const statusEntries = Array.from(statusDist.entries()).sort(
    (a, b) => b[1] - a[1]
  )

  const totalTasks = tasks.length
  const maxMsTasks = Math.max(
    ...Array.from(taskCountByMilestone.values()),
    1
  )
  const maxObjTasks = Math.max(
    ...objectives.map((o) => (tasksByObjective.get(o.id) ?? []).length),
    1
  )
  const maxStatusTasks = Math.max(
    ...statusEntries.map(([, c]) => c),
    1
  )

  // Calculate available height
  const numRows = Math.max(
    1,
    milestones.length,
    objectives.length,
    statusEntries.length
  )
  const maxAvailableH = Math.max(
    VB_H_MIN - PADDING_Y * 2,
    numRows * (MIN_NODE_H + NODE_GAP) + 60
  )

  // Column 0: Goal node
  const goalNode: SankeyNode = {
    id: `goal-${goal.id}`,
    label: goal.title,
    column: 0,
    x: DETAIL_COLS[0],
    y: 0,
    width: NODE_W,
    height: scaleHeight(totalTasks, totalTasks, maxAvailableH * 0.8),
    color: GOAL_COLOR,
    metadata: {
      type: 'goal',
      taskCount: totalTasks,
      status: goal.status ?? undefined,
      progress: goal.progress ?? undefined,
      goalId: goal.id,
    },
  }

  // Column 1: Milestone nodes
  const milestoneNodes: SankeyNode[] = milestones.map((ms) => ({
    id: `ms-${ms.id}`,
    label: ms.title,
    column: 1,
    x: DETAIL_COLS[1],
    y: 0,
    width: NODE_W,
    height: scaleHeight(
      taskCountByMilestone.get(ms.id) ?? 0,
      maxMsTasks,
      maxAvailableH * 0.6
    ),
    color: MILESTONE_COLOR,
    metadata: {
      type: 'milestone' as const,
      taskCount: taskCountByMilestone.get(ms.id) ?? 0,
    },
  }))

  // Column 2: Objective nodes
  const objectiveNodes: SankeyNode[] = objectives.map((obj) => ({
    id: `obj-${obj.id}`,
    label: obj.title,
    column: 2,
    x: DETAIL_COLS[2],
    y: 0,
    width: NODE_W,
    height: scaleHeight(
      (tasksByObjective.get(obj.id) ?? []).length,
      maxObjTasks,
      maxAvailableH * 0.5
    ),
    color: OBJECTIVE_COLOR,
    metadata: {
      type: 'objective' as const,
      taskCount: (tasksByObjective.get(obj.id) ?? []).length,
      status: obj.status ?? undefined,
      progress: obj.progress ?? undefined,
    },
  }))

  // Column 3: Status nodes
  const statusNodes: SankeyNode[] = statusEntries.map(([status, count]) => ({
    id: `status-${status}`,
    label: status.replace(/_/g, ' '),
    column: 3,
    x: DETAIL_COLS[3],
    y: 0,
    width: NODE_W,
    height: scaleHeight(count, maxStatusTasks, maxAvailableH * 0.5),
    color: getStatusColor(status),
    metadata: {
      type: 'status' as const,
      taskCount: count,
      status,
    },
  }))

  // Calculate total height
  const colHeights = [
    [goalNode],
    milestoneNodes,
    objectiveNodes,
    statusNodes,
  ].map(
    (col) =>
      col.reduce((s, n) => s + n.height, 0) +
      Math.max(0, (col.length - 1) * NODE_GAP) +
      PADDING_Y * 2
  )
  const totalHeight = Math.max(VB_H_MIN, ...colHeights)

  // Position vertically
  goalNode.y = (totalHeight - goalNode.height) / 2
  positionNodesVertically(milestoneNodes, totalHeight)
  positionNodesVertically(objectiveNodes, totalHeight)
  positionNodesVertically(statusNodes, totalHeight)

  // Build all links
  const links: SankeyLink[] = []

  // Links: Goal → Milestones
  let goalOffset = goalNode.y
  for (const msNode of milestoneNodes) {
    const msTaskCount = msNode.metadata.taskCount
    if (totalTasks === 0) continue
    const srcThickness = (msTaskCount / totalTasks) * goalNode.height
    const tgtThickness = msNode.height

    links.push({
      id: `link-goal-${msNode.id}`,
      sourceId: goalNode.id,
      targetId: msNode.id,
      value: msTaskCount,
      thickness: srcThickness,
      path: flowPath(
        goalNode.x + goalNode.width,
        goalOffset,
        goalOffset + srcThickness,
        msNode.x,
        msNode.y,
        msNode.y + tgtThickness
      ),
      color: MILESTONE_COLOR,
    })
    goalOffset += srcThickness
  }

  // Links: Milestones → Objectives
  for (const msNode of milestoneNodes) {
    const msId = msNode.id.replace('ms-', '')
    const msObjs = (objByMilestone.get(msId) ?? [])
      .map((o) => objectiveNodes.find((n) => n.id === `obj-${o.id}`))
      .filter(Boolean) as SankeyNode[]

    const msTotalTasks = msNode.metadata.taskCount
    let msOffset = msNode.y

    for (const objNode of msObjs) {
      const objTaskCount = objNode.metadata.taskCount
      if (msTotalTasks === 0) continue
      const srcThickness = (objTaskCount / msTotalTasks) * msNode.height
      const tgtThickness = objNode.height

      links.push({
        id: `link-${msNode.id}-${objNode.id}`,
        sourceId: msNode.id,
        targetId: objNode.id,
        value: objTaskCount,
        thickness: srcThickness,
        path: flowPath(
          msNode.x + msNode.width,
          msOffset,
          msOffset + srcThickness,
          objNode.x,
          objNode.y,
          objNode.y + tgtThickness
        ),
        color: OBJECTIVE_COLOR,
      })
      msOffset += srcThickness
    }
  }

  // Links: Objectives → Status
  const statusOffsets = new Map<string, number>()
  for (const sn of statusNodes) {
    statusOffsets.set(sn.metadata.status!, sn.y)
  }

  for (const objNode of objectiveNodes) {
    const objId = objNode.id.replace('obj-', '')
    const objTasks = tasksByObjective.get(objId) ?? []
    const objTotal = objTasks.length
    if (objTotal === 0) continue

    const objStatusDist = getTaskStatusDistribution(objTasks)
    let objOffset = objNode.y

    for (const [status, count] of objStatusDist) {
      const statusNode = statusNodes.find(
        (n) => n.metadata.status === status
      )
      if (!statusNode) continue

      const srcThickness = (count / objTotal) * objNode.height
      const tgtThickness =
        (count / (statusNode.metadata.taskCount || 1)) * statusNode.height
      const currentTgtOffset = statusOffsets.get(status) ?? statusNode.y

      links.push({
        id: `link-${objNode.id}-${status}`,
        sourceId: objNode.id,
        targetId: statusNode.id,
        value: count,
        thickness: srcThickness,
        path: flowPath(
          objNode.x + objNode.width,
          objOffset,
          objOffset + srcThickness,
          statusNode.x,
          currentTgtOffset,
          currentTgtOffset + tgtThickness
        ),
        color: getStatusColor(status),
      })

      objOffset += srcThickness
      statusOffsets.set(status, currentTgtOffset + tgtThickness)
    }
  }

  return {
    nodes: [goalNode, ...milestoneNodes, ...objectiveNodes, ...statusNodes],
    links,
    width: VB_W,
    height: totalHeight,
  }
}
