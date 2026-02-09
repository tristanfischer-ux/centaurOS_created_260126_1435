/**
 * @file canvas.ts
 *
 * @description Canvas-specific types that extend existing objectives and tasks
 * types for the strategic timeline feature. Canvas visualises the work hierarchy:
 *   Strategic Goal → Milestone → Objective → Task
 * on a time-based horizontal axis with dependency edges.
 *
 * @related
 * - Database types: src/types/database.types.ts
 * - Server actions: src/actions/canvas.ts
 * - Frontend: src/app/(platform)/canvas/
 */

import type { Database } from './database.types'

// Base row types from generated Supabase types
type ObjectiveRow = Database['public']['Tables']['objectives']['Row']
type TaskRow = Database['public']['Tables']['tasks']['Row']
type WorkEdgeRow = Database['public']['Tables']['work_edges']['Row']

// ============================================================================
// GOAL TYPES (enum-like constants for goal_type column)
// ============================================================================

/** Valid goal type values matching the CHECK constraint on objectives.goal_type */
export const GOAL_TYPES = ['Fundraise', 'Launch', 'Hiring', 'Revenue', 'Other'] as const
export type GoalType = (typeof GOAL_TYPES)[number]

// ============================================================================
// GHOST TYPES
// ============================================================================

/** Valid ghost source values matching the CHECK constraint */
export const GHOST_SOURCES = ['ai', 'template', 'user'] as const
export type GhostSource = (typeof GHOST_SOURCES)[number]

// ============================================================================
// CANVAS ENTITY TYPES
// ============================================================================

/**
 * A Strategic Goal is an Objective with is_strategic_goal = true.
 * Top-level planning anchor on the Canvas timeline.
 */
export type StrategicGoal = ObjectiveRow & {
  is_strategic_goal: true
  goal_type: GoalType | null
  milestone_date: string | null
}

/**
 * A Milestone is an Objective with is_milestone = true,
 * parented to a strategic goal via parent_objective_id.
 */
export type Milestone = ObjectiveRow & {
  is_milestone: true
  parent_objective_id: string
  milestone_order_index: number
}

/**
 * A canvas-linked objective parented to a milestone.
 * May be a ghost (AI/template-suggested, not yet confirmed).
 */
export type CanvasObjective = ObjectiveRow & {
  is_ghost: boolean
  ghost_source: GhostSource | null
  ghost_rationale: string | null
}

/** Minimal assignee profile for task display on the canvas */
export interface TaskAssigneeProfile {
  id: string
  full_name: string | null
  role: string
}

/**
 * A canvas-linked task with assignee profiles resolved.
 * May be a ghost (AI/template-suggested, not yet confirmed).
 */
export type CanvasTask = TaskRow & {
  is_ghost: boolean
  ghost_source: GhostSource | null
  ghost_rationale: string | null
  assignees: TaskAssigneeProfile[]
}

// ============================================================================
// WORK EDGES
// ============================================================================

/** Valid item types for work edge endpoints */
export type WorkEdgeItemType = 'objective' | 'task'

/** Valid dependency types */
export type DepType = 'hard' | 'soft'

/** Typed work edge with narrowed enum fields */
export interface WorkEdge {
  id: string
  foundry_id: string
  from_item_id: string
  from_item_type: WorkEdgeItemType
  to_item_id: string
  to_item_type: WorkEdgeItemType
  dep_type: DepType
  created_at: string
  deleted_at: string | null
}

// ============================================================================
// GOAL BUNDLE (complete data for rendering a goal on Canvas)
// ============================================================================

/**
 * The complete data bundle for rendering a strategic goal on the Canvas.
 * Contains the full hierarchy: goal → milestones → objectives → tasks,
 * plus all dependency edges within the bundle.
 */
export interface GoalBundle {
  goal: StrategicGoal
  milestones: Milestone[]
  objectives: CanvasObjective[]
  tasks: CanvasTask[]
  edges: WorkEdge[]
}

// ============================================================================
// ACTION INPUT TYPES
// ============================================================================

/** Input for creating a new strategic goal */
export interface CreateStrategicGoalInput {
  title: string
  goal_type: GoalType
  target_date: string
  description?: string
}

/** Input for creating milestones in batch */
export interface CreateMilestoneInput {
  title: string
  due_date: string
  order_index: number
}

/** Input for creating a canvas-linked objective */
export interface CreateCanvasObjectiveInput {
  title: string
  milestone_id: string
  description?: string
  is_ghost?: boolean
  ghost_source?: GhostSource
  ghost_rationale?: string
  workstream?: string
}

/** Input for creating a canvas-linked task */
export interface CreateCanvasTaskInput {
  title: string
  objective_id: string
  description?: string
  is_ghost?: boolean
  ghost_source?: GhostSource
  ghost_rationale?: string
  workstream?: string
  assignee_id?: string
}

/** Patchable fields for updateCanvasItem */
export interface CanvasItemPatch {
  title?: string
  status?: string
  milestone_date?: string
  assignee_id?: string
  workstream?: string
}

// ============================================================================
// UNLINKED ITEMS (objectives/tasks not in any strategic plan)
// ============================================================================

/**
 * Objectives and tasks that exist in the foundry but are not linked to
 * any strategic goal hierarchy. Displayed in the Canvas "unstructured zone".
 */
export interface UnlinkedItems {
  objectives: CanvasObjective[]
  tasks: CanvasTask[]
  totalObjectives: number
  totalTasks: number
}
