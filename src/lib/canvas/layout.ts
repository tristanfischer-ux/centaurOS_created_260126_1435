/**
 * @file layout.ts
 *
 * @description Coordinate system and layout algorithm for the Canvas strategic
 * timeline. Converts a GoalBundle into ReactFlow nodes and edges positioned
 * along a horizontal time axis.
 *
 * Coordinate system: x = time (dateToX), y = hierarchy depth
 *   y=SPINE_Y        → goal + milestones (the "spine")
 *   y=SPINE_Y+GAP1   → objectives (tributaries)
 *   y=SPINE_Y+GAP1+2 → tasks (leaf nodes)
 *
 * @related
 * - Types: src/types/canvas.ts
 * - Node components: src/components/canvas/nodes/
 * - Consumer: src/app/(platform)/canvas/strategic-canvas-view.tsx
 */

import type { Node, Edge } from '@xyflow/react'
import type {
  GoalBundle,
  Milestone,
  CanvasObjective,
  CanvasTask,
  UnlinkedItems,
} from '@/types/canvas'

// ============================================================================
// PX PER DAY — controls horizontal zoom per view preset
// ============================================================================

export const PX_PER_DAY = {
  strategic: 4,
  operational: 12,
  tactical: 28,
} as const satisfies Record<string, number>

export type ViewPreset = keyof typeof PX_PER_DAY

// ============================================================================
// LAYOUT CONSTANTS
// ============================================================================

export const NODE_WIDTH = 220
export const GOAL_HEIGHT = 72
export const MILESTONE_HEIGHT = 60
export const OBJECTIVE_HEIGHT = 60
export const TASK_HEIGHT = 44
export const VERTICAL_SPACING = 16
export const SPINE_Y = 120
export const MILESTONE_TO_OBJECTIVE_GAP = 120
export const OBJECTIVE_TO_TASK_GAP = 72
export const MIN_HORIZONTAL_GAP = 24

/** Maximum objectives shown per milestone before collapsing */
const MAX_VISIBLE_OBJECTIVES = 7

// ============================================================================
// COORDINATE HELPERS
// ============================================================================

/**
 * Convert a date to an x-coordinate on the timeline.
 *
 * @param date - The date to position
 * @param pxPerDay - Pixels per calendar day (zoom level)
 * @param rangeStart - The leftmost date on the timeline
 * @returns x position in pixels
 */
export function dateToX(
  date: Date | string,
  pxPerDay: number,
  rangeStart: Date
): number {
  const d = typeof date === 'string' ? new Date(date) : date
  const diffMs = d.getTime() - rangeStart.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  return diffDays * pxPerDay
}

/**
 * Generate a stable HSL color string from an owner ID.
 * Hash the string to produce a hue in 0-360 range.
 *
 * @param ownerId - Unique identifier for the owner
 * @returns CSS color string e.g. "hsl(214, 65%, 55%)"
 */
export function ownerColor(ownerId: string): string {
  let hash = 0
  for (let i = 0; i < ownerId.length; i++) {
    hash = ownerId.charCodeAt(i) + ((hash << 5) - hash)
    hash = hash & hash // Convert to 32-bit int
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 65%, 55%)`
}

// ============================================================================
// LAYOUT OPTIONS
// ============================================================================

export interface LayoutOptions {
  pxPerDay: number
  showGhosts: boolean
  showTasks: boolean
  showOwners: boolean
  rangeStart: Date
}

// ============================================================================
// GOAL BUNDLE → REACT FLOW ELEMENTS
// ============================================================================

/**
 * Convert a GoalBundle into positioned ReactFlow nodes and edges.
 *
 * @description Core layout algorithm that places the entire hierarchy on a
 * time-based horizontal axis with vertical depth lanes.
 *
 * @param bundle - The complete goal hierarchy data
 * @param options - Layout configuration (zoom, layer visibility, range)
 * @returns { nodes, edges } ready for ReactFlow
 */
export function goalBundleToElements(
  bundle: GoalBundle,
  options: LayoutOptions
): { nodes: Node[]; edges: Edge[] } {
  const { pxPerDay, showGhosts, showTasks, showOwners, rangeStart } = options
  const nodes: Node[] = []
  const edges: Edge[] = []

  const { goal, milestones, objectives, tasks } = bundle

  // ----------------------------------------------------------------
  // (a) GOAL NODE — anchored at its target date
  // ----------------------------------------------------------------
  const goalX = goal.milestone_date
    ? dateToX(goal.milestone_date, pxPerDay, rangeStart)
    : 0

  nodes.push({
    id: `goal-${goal.id}`,
    type: 'goal',
    position: { x: goalX, y: SPINE_Y },
    data: {
      title: goal.title,
      targetDate: goal.milestone_date,
      status: goal.status,
      goalType: goal.goal_type,
    },
    style: { width: NODE_WIDTH },
  })

  // ----------------------------------------------------------------
  // (b) MILESTONE NODES — along the spine at their dates
  // ----------------------------------------------------------------
  const sortedMilestones = [...milestones].sort(
    (a, b) => a.milestone_order_index - b.milestone_order_index
  )

  // Track placed milestone x-positions for overlap resolution
  const milestoneXPositions: number[] = []

  // First pass: compute raw x-positions (null-date milestones get NaN placeholder)
  const rawMilestoneX: (number | null)[] = sortedMilestones.map((ms) =>
    ms.milestone_date ? dateToX(ms.milestone_date, pxPerDay, rangeStart) : null
  )

  // Second pass: fill null-date milestones with midpoint between neighbors
  for (let i = 0; i < rawMilestoneX.length; i++) {
    if (rawMilestoneX[i] !== null) continue

    // Find nearest dated neighbor before and after
    const prevX = rawMilestoneX.slice(0, i).reverse().find((x) => x !== null) ?? null
    const nextX = rawMilestoneX.slice(i + 1).find((x) => x !== null) ?? null

    if (prevX !== null && nextX !== null) {
      rawMilestoneX[i] = (prevX + nextX) / 2
    } else if (prevX !== null) {
      rawMilestoneX[i] = prevX + NODE_WIDTH + MIN_HORIZONTAL_GAP
    } else if (nextX !== null) {
      rawMilestoneX[i] = nextX - NODE_WIDTH - MIN_HORIZONTAL_GAP
    } else {
      rawMilestoneX[i] = goalX - NODE_WIDTH - MIN_HORIZONTAL_GAP
    }
  }

  for (let msIdx = 0; msIdx < sortedMilestones.length; msIdx++) {
    const ms = sortedMilestones[msIdx]
    let msX = rawMilestoneX[msIdx]!

    // Resolve overlap: push right if too close to previous milestone
    for (const prevX of milestoneXPositions) {
      if (Math.abs(msX - prevX) < NODE_WIDTH + MIN_HORIZONTAL_GAP) {
        msX = prevX + NODE_WIDTH + MIN_HORIZONTAL_GAP
      }
    }
    milestoneXPositions.push(msX)

    nodes.push({
      id: `milestone-${ms.id}`,
      type: 'milestone',
      position: { x: msX, y: SPINE_Y },
      data: {
        title: ms.title,
        dueDate: ms.milestone_date,
        status: ms.status,
        showOwners,
      },
      style: { width: NODE_WIDTH },
    })
  }

  // ----------------------------------------------------------------
  // (c) SPINE EDGES — milestone chain + last milestone → goal
  // ----------------------------------------------------------------
  for (let i = 0; i < sortedMilestones.length - 1; i++) {
    edges.push({
      id: `spine-${sortedMilestones[i].id}-${sortedMilestones[i + 1].id}`,
      source: `milestone-${sortedMilestones[i].id}`,
      target: `milestone-${sortedMilestones[i + 1].id}`,
      type: 'smoothstep',
      animated: false,
      style: { strokeWidth: 3, stroke: 'hsl(var(--muted-foreground) / 0.4)' },
    })
  }

  if (sortedMilestones.length > 0) {
    const lastMs = sortedMilestones[sortedMilestones.length - 1]
    edges.push({
      id: `spine-${lastMs.id}-goal-${goal.id}`,
      source: `milestone-${lastMs.id}`,
      target: `goal-${goal.id}`,
      type: 'smoothstep',
      animated: false,
      style: { strokeWidth: 3, stroke: 'hsl(var(--muted-foreground) / 0.4)' },
    })
  }

  // ----------------------------------------------------------------
  // (d) PRE-BUILD structured task map so we know task counts BEFORE
  //     placing objectives (needed for correct vertical spacing).
  // ----------------------------------------------------------------
  const structuredTasksByObjective = new Map<string, CanvasTask[]>()
  for (const task of tasks) {
    if (!showGhosts && task.is_ghost) continue
    const objId = task.objective_id
    if (!objId) continue
    const existing = structuredTasksByObjective.get(objId) || []
    existing.push(task)
    structuredTasksByObjective.set(objId, existing)
  }

  /**
   * Compute vertical footprint of a structured objective including its
   * child tasks so sibling objectives don't overlap.
   */
  const structuredFootprint = (objId: string): number => {
    const taskCount = structuredTasksByObjective.get(objId)?.length ?? 0
    if (showTasks && taskCount > 0) {
      return (
        OBJECTIVE_HEIGHT +
        OBJECTIVE_TO_TASK_GAP +
        taskCount * (TASK_HEIGHT + VERTICAL_SPACING) +
        VERTICAL_SPACING
      )
    }
    return OBJECTIVE_HEIGHT + VERTICAL_SPACING
  }

  // ----------------------------------------------------------------
  // (e) OBJECTIVES — below each milestone, with task-aware spacing
  // ----------------------------------------------------------------

  // Build milestone → objectives lookup
  const objectivesByMilestone = new Map<string, CanvasObjective[]>()
  for (const obj of objectives) {
    if (!showGhosts && obj.is_ghost) continue
    const parentId = obj.parent_objective_id
    if (!parentId) continue
    const existing = objectivesByMilestone.get(parentId) || []
    existing.push(obj)
    objectivesByMilestone.set(parentId, existing)
  }

  // Track objective node IDs for task wiring
  const objectiveNodeMap = new Map<string, { x: number; y: number }>()

  for (let msIdx = 0; msIdx < sortedMilestones.length; msIdx++) {
    const ms = sortedMilestones[msIdx]
    const msX = milestoneXPositions[msIdx]
    const msObjectives = objectivesByMilestone.get(ms.id) || []

    const visibleCount = Math.min(msObjectives.length, MAX_VISIBLE_OBJECTIVES)
    const hasOverflow = msObjectives.length > MAX_VISIBLE_OBJECTIVES

    // Running y-offset accounts for each objective's task footprint
    let objRunningY = SPINE_Y + MILESTONE_TO_OBJECTIVE_GAP

    for (let objIdx = 0; objIdx < visibleCount; objIdx++) {
      const obj = msObjectives[objIdx]
      // Pin objective x to parent milestone for clean vertical columns
      const objX = msX

      objectiveNodeMap.set(obj.id, { x: objX, y: objRunningY })

      nodes.push({
        id: `objective-${obj.id}`,
        type: 'objective',
        position: { x: objX, y: objRunningY },
        data: {
          title: obj.title,
          status: obj.status,
          isGhost: obj.is_ghost,
          ghostSource: obj.ghost_source,
          showOwners,
        },
        style: { width: NODE_WIDTH },
      })

      // Tributary edge: milestone → objective
      edges.push({
        id: `trib-${ms.id}-${obj.id}`,
        source: `milestone-${ms.id}`,
        target: `objective-${obj.id}`,
        type: 'smoothstep',
        animated: false,
        style: {
          strokeWidth: 1.5,
          stroke: 'hsl(var(--muted-foreground) / 0.25)',
        },
      })

      // Advance running y by this objective's full footprint
      objRunningY += structuredFootprint(obj.id)
    }

    // Overflow "+N more" node
    if (hasOverflow) {
      const overflowCount = msObjectives.length - MAX_VISIBLE_OBJECTIVES

      nodes.push({
        id: `expand-${ms.id}`,
        type: 'expand',
        position: { x: msX, y: objRunningY },
        data: {
          count: overflowCount,
          milestoneId: ms.id,
        },
        style: { width: NODE_WIDTH },
      })
    }
  }

  // ----------------------------------------------------------------
  // (f) TASKS — below each objective (if showTasks)
  // ----------------------------------------------------------------
  if (showTasks) {
    for (const [objId, objTasks] of structuredTasksByObjective) {
      const objPos = objectiveNodeMap.get(objId)
      if (!objPos) continue

      for (let taskIdx = 0; taskIdx < objTasks.length; taskIdx++) {
        const task = objTasks[taskIdx]
        // Pin task x to parent objective to prevent date-based drift
        // into neighboring milestone columns (visual grouping > date accuracy)
        const taskX = objPos.x
        const taskY =
          objPos.y +
          OBJECTIVE_TO_TASK_GAP +
          taskIdx * (TASK_HEIGHT + VERTICAL_SPACING)

        const firstAssignee =
          task.assignees && task.assignees.length > 0
            ? task.assignees[0]
            : null

        nodes.push({
          id: `task-${task.id}`,
          type: 'task',
          position: { x: taskX, y: taskY },
          data: {
            title: task.title,
            status: task.status,
            isGhost: task.is_ghost,
            ghostSource: task.ghost_source,
            assigneeName: firstAssignee?.full_name ?? null,
            assigneeId: firstAssignee?.id ?? null,
            showOwners,
          },
          style: { width: NODE_WIDTH },
        })

        // Task edge: objective → task
        edges.push({
          id: `task-edge-${objId}-${task.id}`,
          source: `objective-${objId}`,
          target: `task-${task.id}`,
          type: 'smoothstep',
          animated: false,
          style: {
            strokeWidth: 1,
            stroke: 'hsl(var(--muted-foreground) / 0.2)',
          },
        })
      }
    }
  }

  return { nodes, edges }
}

// ============================================================================
// RANGE CALCULATION
// ============================================================================

/**
 * Compute the timeline range start date from a GoalBundle.
 * Uses the earliest milestone date minus a buffer, or 90 days ago.
 *
 * @param bundle - The goal bundle to compute range for
 * @returns The start date of the timeline range
 */
export function computeRangeStart(bundle: GoalBundle): Date {
  const dates: Date[] = []

  for (const ms of bundle.milestones) {
    if (ms.milestone_date) dates.push(new Date(ms.milestone_date))
  }
  for (const obj of bundle.objectives) {
    if (obj.milestone_date) dates.push(new Date(obj.milestone_date))
  }

  if (dates.length === 0) {
    // Fallback: 90 days before today
    const d = new Date()
    d.setDate(d.getDate() - 90)
    return d
  }

  const earliest = new Date(Math.min(...dates.map((d) => d.getTime())))
  // Add 30-day buffer before earliest date
  earliest.setDate(earliest.getDate() - 30)
  return earliest
}

/**
 * Compute a default range start when there is no GoalBundle,
 * derived from the earliest date in unlinked items.
 *
 * @param unlinked - The unlinked items to derive range from
 * @returns The start date of the timeline range
 */
export function computeUnlinkedRangeStart(unlinked: UnlinkedItems): Date {
  const dates: Date[] = []

  for (const obj of unlinked.objectives) {
    if (obj.milestone_date) dates.push(new Date(obj.milestone_date))
  }
  for (const task of unlinked.tasks) {
    if (task.start_date) dates.push(new Date(task.start_date))
    if (task.end_date) dates.push(new Date(task.end_date))
  }

  if (dates.length === 0) {
    const d = new Date()
    d.setDate(d.getDate() - 90)
    return d
  }

  const earliest = new Date(Math.min(...dates.map((d) => d.getTime())))
  earliest.setDate(earliest.getDate() - 30)
  return earliest
}

// ============================================================================
// UNLINKED ITEMS → REACT FLOW ELEMENTS
// ============================================================================

/** Gap between the structured zone bottom and the unstructured divider */
const UNSTRUCTURED_ZONE_GAP = 80

/** Y offset from divider to first unlinked row */
const DIVIDER_TO_CONTENT = 40

/** X position for items with no date (far-left column) */
const NO_DATE_X = 40

/** Row height used for stacking unlinked objectives */
const UNLINKED_ROW_HEIGHT = OBJECTIVE_HEIGHT + VERTICAL_SPACING

/** Row height used for stacking unlinked tasks */
const UNLINKED_TASK_ROW_HEIGHT = TASK_HEIGHT + VERTICAL_SPACING

export interface UnlinkedLayoutOptions {
  pxPerDay: number
  rangeStart: Date
  showOwners: boolean
  showTasks: boolean
  /** The lowest y + height in the structured zone (or SPINE_Y if empty) */
  spineBottomY: number
}

/**
 * Convert unlinked objectives and tasks into positioned ReactFlow nodes/edges
 * for the "unstructured zone" below the strategic timeline.
 *
 * @description Places unlinked objectives on the timeline (by milestone_date)
 * or in a "No Date" column. Tasks are placed below their parent objectives,
 * or in a separate orphan section. A divider node separates the zones.
 *
 * @param unlinked - The unlinked items data
 * @param options - Layout configuration
 * @returns { nodes, edges } ready to merge with structured elements
 */
export function unlinkedItemsToElements(
  unlinked: UnlinkedItems,
  options: UnlinkedLayoutOptions
): { nodes: Node[]; edges: Edge[] } {
  const { pxPerDay, rangeStart, showOwners, showTasks, spineBottomY } = options
  const nodes: Node[] = []
  const edges: Edge[] = []

  const { objectives, tasks, totalObjectives, totalTasks } = unlinked

  if (objectives.length === 0 && tasks.length === 0) {
    return { nodes: [], edges: [] }
  }

  // ----------------------------------------------------------------
  // DIVIDER NODE
  // ----------------------------------------------------------------
  const dividerY = spineBottomY + UNSTRUCTURED_ZONE_GAP

  nodes.push({
    id: 'divider-unlinked',
    type: 'divider',
    position: { x: -200, y: dividerY },
    data: { label: 'Unlinked Work' },
    selectable: false,
    draggable: false,
  })

  // ----------------------------------------------------------------
  // UNLINKED OBJECTIVES
  // ----------------------------------------------------------------
  const contentStartY = dividerY + DIVIDER_TO_CONTENT

  // Separate dated vs undated objectives
  const datedObjectives: CanvasObjective[] = []
  const undatedObjectives: CanvasObjective[] = []

  for (const obj of objectives) {
    if (obj.milestone_date) {
      datedObjectives.push(obj)
    } else {
      undatedObjectives.push(obj)
    }
  }

  // ------------------------------------------------------------------
  // PRE-BUILD task-by-objective map so we know task counts BEFORE
  // placing objectives (needed for correct vertical spacing).
  // ------------------------------------------------------------------
  const tasksByObjective = new Map<string, CanvasTask[]>()
  const orphanTasks: CanvasTask[] = []
  const objectiveIdSet = new Set(objectives.map((o) => o.id))

  for (const task of tasks) {
    if (task.objective_id && objectiveIdSet.has(task.objective_id)) {
      const existing = tasksByObjective.get(task.objective_id) ?? []
      existing.push(task)
      tasksByObjective.set(task.objective_id, existing)
    } else {
      orphanTasks.push(task)
    }
  }

  /**
   * Compute the total vertical footprint of an objective, including
   * the space needed for its child tasks (when tasks are visible).
   */
  const objectiveFootprint = (objId: string): number => {
    const taskCount = tasksByObjective.get(objId)?.length ?? 0
    if (showTasks && taskCount > 0) {
      // objective + gap + tasks + extra breathing room
      return (
        OBJECTIVE_HEIGHT +
        OBJECTIVE_TO_TASK_GAP +
        taskCount * UNLINKED_TASK_ROW_HEIGHT +
        VERTICAL_SPACING
      )
    }
    return OBJECTIVE_HEIGHT + VERTICAL_SPACING
  }

  // Track objective positions for task placement
  const objectivePositions = new Map<string, { x: number; y: number }>()

  // ------------------------------------------------------------------
  // DATED OBJECTIVES — resolve x-overlaps into rows, then use
  // task-aware row heights so tasks don't overlap the next row.
  // ------------------------------------------------------------------
  type DatedEntry = { obj: CanvasObjective; rawX: number; row: number }
  const datedEntries: DatedEntry[] = []
  const datedXSlots: { x: number; endX: number; row: number }[] = []

  for (const obj of datedObjectives) {
    const rawX = dateToX(obj.milestone_date!, pxPerDay, rangeStart)

    // Find a row where this node doesn't overlap horizontally
    let row = 0
    let placed = false
    while (!placed) {
      const rowSlots = datedXSlots.filter((s) => s.row === row)
      const overlaps = rowSlots.some(
        (s) =>
          rawX < s.endX + MIN_HORIZONTAL_GAP &&
          rawX + NODE_WIDTH > s.x - MIN_HORIZONTAL_GAP
      )
      if (!overlaps) {
        placed = true
      } else {
        row++
      }
    }

    datedXSlots.push({ x: rawX, endX: rawX + NODE_WIDTH, row })
    datedEntries.push({ obj, rawX, row })
  }

  // Compute per-row height as the max footprint of any objective in that row
  const datedRowMaxFootprint = new Map<number, number>()
  for (const { obj, row } of datedEntries) {
    const footprint = objectiveFootprint(obj.id)
    const current = datedRowMaxFootprint.get(row) ?? 0
    if (footprint > current) datedRowMaxFootprint.set(row, footprint)
  }

  // Compute cumulative y-offset per row
  const datedRowYStart = new Map<number, number>()
  let datedCumulativeY = contentStartY
  const maxDatedRow =
    datedEntries.length > 0
      ? Math.max(...datedEntries.map((e) => e.row))
      : -1
  for (let r = 0; r <= maxDatedRow; r++) {
    datedRowYStart.set(r, datedCumulativeY)
    datedCumulativeY +=
      datedRowMaxFootprint.get(r) ?? UNLINKED_ROW_HEIGHT
  }

  // Place dated objectives using task-aware row offsets
  for (const { obj, rawX, row } of datedEntries) {
    const objY = datedRowYStart.get(row)!
    objectivePositions.set(obj.id, { x: rawX, y: objY })

    nodes.push({
      id: `objective-${obj.id}`,
      type: 'objective',
      position: { x: rawX, y: objY },
      data: {
        title: obj.title,
        status: obj.status,
        isGhost: obj.is_ghost,
        ghostSource: obj.ghost_source,
        showOwners,
        isUnlinked: true,
      },
      style: { width: NODE_WIDTH },
    })
  }

  // ------------------------------------------------------------------
  // UNDATED OBJECTIVES — "No Date" column at x=40.
  // Running yOffset accounts for each objective's task footprint.
  // ------------------------------------------------------------------
  let undatedY = contentStartY
  for (const obj of undatedObjectives) {
    objectivePositions.set(obj.id, { x: NO_DATE_X, y: undatedY })

    nodes.push({
      id: `objective-${obj.id}`,
      type: 'objective',
      position: { x: NO_DATE_X, y: undatedY },
      data: {
        title: obj.title,
        status: obj.status,
        isGhost: obj.is_ghost,
        ghostSource: obj.ghost_source,
        showOwners,
        isUnlinked: true,
      },
      style: { width: NODE_WIDTH },
    })

    undatedY += objectiveFootprint(obj.id)
  }

  // Overflow indicator for objectives
  if (totalObjectives > objectives.length) {
    const overflowCount = totalObjectives - objectives.length
    // Place below whichever column is taller (dated rows vs undated stack)
    const overflowY = Math.max(undatedY, datedCumulativeY)

    nodes.push({
      id: 'expand-unlinked-objectives',
      type: 'expand',
      position: { x: NO_DATE_X, y: overflowY },
      data: {
        count: overflowCount,
        label: `+${overflowCount} more objectives`,
      },
      style: { width: NODE_WIDTH },
    })
  }

  // ----------------------------------------------------------------
  // UNLINKED TASKS (below their parent objectives, or orphan section)
  // ----------------------------------------------------------------
  if (showTasks) {
    // Place tasks below their parent objectives
    for (const [objId, objTasks] of tasksByObjective) {
      const objPos = objectivePositions.get(objId)
      if (!objPos) continue

      for (let i = 0; i < objTasks.length; i++) {
        const task = objTasks[i]
        // Pin task x to parent objective to prevent date-based drift
        // into neighboring columns (tasks keep visual grouping in
        // the unstructured zone; date detail is in the details dialog)
        const taskX = objPos.x
        const taskY =
          objPos.y + OBJECTIVE_TO_TASK_GAP + i * UNLINKED_TASK_ROW_HEIGHT

        const firstAssignee =
          task.assignees && task.assignees.length > 0
            ? task.assignees[0]
            : null

        nodes.push({
          id: `task-${task.id}`,
          type: 'task',
          position: { x: taskX, y: taskY },
          data: {
            title: task.title,
            status: task.status,
            isGhost: task.is_ghost,
            ghostSource: task.ghost_source,
            assigneeName: firstAssignee?.full_name ?? null,
            assigneeId: firstAssignee?.id ?? null,
            showOwners,
            isUnlinked: true,
          },
          style: { width: NODE_WIDTH },
        })

        // Edge: objective → task
        edges.push({
          id: `unlinked-task-edge-${objId}-${task.id}`,
          source: `objective-${objId}`,
          target: `task-${task.id}`,
          type: 'smoothstep',
          animated: false,
          style: {
            strokeWidth: 1,
            stroke: 'hsl(var(--muted-foreground) / 0.15)',
          },
        })
      }
    }

    // Place orphan tasks (no objective) below all objectives + their tasks
    if (orphanTasks.length > 0) {
      // Compute the bottom of all objective footprints
      let maxBottomY = contentStartY
      for (const [objId, pos] of objectivePositions) {
        const bottom = pos.y + objectiveFootprint(objId)
        if (bottom > maxBottomY) maxBottomY = bottom
      }

      const orphanStartY = maxBottomY + VERTICAL_SPACING * 2

      for (let i = 0; i < orphanTasks.length; i++) {
        const task = orphanTasks[i]
        const taskX = task.end_date
          ? dateToX(task.end_date, pxPerDay, rangeStart)
          : task.start_date
            ? dateToX(task.start_date, pxPerDay, rangeStart)
            : NO_DATE_X
        const taskY = orphanStartY + i * UNLINKED_TASK_ROW_HEIGHT

        const firstAssignee =
          task.assignees && task.assignees.length > 0
            ? task.assignees[0]
            : null

        nodes.push({
          id: `task-${task.id}`,
          type: 'task',
          position: { x: taskX, y: taskY },
          data: {
            title: task.title,
            status: task.status,
            isGhost: task.is_ghost,
            ghostSource: task.ghost_source,
            assigneeName: firstAssignee?.full_name ?? null,
            assigneeId: firstAssignee?.id ?? null,
            showOwners,
            isUnlinked: true,
          },
          style: { width: NODE_WIDTH },
        })
      }
    }

    // Overflow indicator for tasks
    if (totalTasks > tasks.length) {
      const overflowCount = totalTasks - tasks.length
      // Find bottom of all placed nodes
      let maxNodeY = contentStartY
      for (const n of nodes) {
        if (n.position.y > maxNodeY) maxNodeY = n.position.y
      }

      nodes.push({
        id: 'expand-unlinked-tasks',
        type: 'expand',
        position: { x: NO_DATE_X, y: maxNodeY + UNLINKED_TASK_ROW_HEIGHT },
        data: {
          count: overflowCount,
          label: `+${overflowCount} more tasks`,
        },
        style: { width: NODE_WIDTH },
      })
    }
  }

  return { nodes, edges }
}

/**
 * Compute the maximum y coordinate + node height from an array of ReactFlow nodes.
 * Used to determine the "spine bottom" for positioning the unstructured zone.
 *
 * @param nodes - Array of positioned ReactFlow nodes
 * @returns The bottom-most y position, or SPINE_Y as a fallback
 */
export function computeSpineBottomY(nodes: Node[]): number {
  if (nodes.length === 0) return SPINE_Y

  let maxBottom = SPINE_Y
  for (const node of nodes) {
    // Estimate node height from type
    let height = OBJECTIVE_HEIGHT
    if (node.type === 'goal') height = GOAL_HEIGHT
    else if (node.type === 'milestone') height = MILESTONE_HEIGHT
    else if (node.type === 'task') height = TASK_HEIGHT

    const bottom = node.position.y + height
    if (bottom > maxBottom) maxBottom = bottom
  }

  return maxBottom
}
