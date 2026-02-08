/**
 * @file Canvas view type definitions
 * @description Types for the spatial data canvas that renders objectives
 * and tasks as interactive nodes on a ReactFlow surface.
 */

import type { ObjectiveTask, TaskAssignee } from '@/app/(platform)/new-objectives/types'

/** Objective data passed to the canvas */
export interface CanvasObjective {
  id: string
  title: string
  description: string | null
  status: string | null
  progress: number
  parent_objective_id: string | null
  health: 'on-track' | 'at-risk' | 'off-track' | 'completed' | 'not-started'
  totalTasks: number
  completedTasks: number
  overdueTasks: number
  created_at: string
}

/** Task data passed to the canvas */
export interface CanvasTask {
  id: string
  title: string
  status: string
  assignee_id: string | null
  assignee: TaskAssignee | null
  objective_id: string | null
  end_date: string | null
  risk_level: string | null
  progress: number | null
  task_number: number | null
}

/** Data shape for objective nodes on the canvas */
export interface ObjectiveNodeData {
  label: string
  description: string | null
  status: string | null
  progress: number
  health: 'on-track' | 'at-risk' | 'off-track' | 'completed' | 'not-started'
  totalTasks: number
  completedTasks: number
  overdueTasks: number
  objectiveId: string
  [key: string]: unknown
}

/** Data shape for task nodes on the canvas */
export interface TaskNodeData {
  label: string
  status: string
  assigneeName: string | null
  endDate: string | null
  riskLevel: string | null
  progress: number | null
  taskNumber: number | null
  taskId: string
  objectiveId: string | null
  [key: string]: unknown
}
