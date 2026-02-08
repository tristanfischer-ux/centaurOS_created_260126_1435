/**
 * @file strategic-planner.ts
 *
 * @description Type definitions for the Strategic Timeline Planner feature.
 * Covers AI-generated plans, task dependencies, resource suggestions,
 * and the data structures used by the strategic canvas visualization.
 */

// ─── Task Dependencies ───────────────────────────────────────────

export type DependencyType = 'finish_to_start' | 'start_to_start' | 'finish_to_finish'

export interface TaskDependency {
  id: string
  task_id: string
  depends_on_task_id: string
  dependency_type: DependencyType
  foundry_id: string
  created_at: string
}

// ─── Resource Suggestions ────────────────────────────────────────

export type ResourcePriority = 'critical' | 'recommended' | 'nice_to_have'

export interface ResourceSuggestion {
  role: string
  reason: string
  phase: string
  marketplaceMatches: string[]
  priority: ResourcePriority
}

// ─── Strategic Risks ─────────────────────────────────────────────

export type RiskSeverity = 'high' | 'medium' | 'low'

export interface StrategicRisk {
  description: string
  mitigation: string
  severity: RiskSeverity
  relatedTaskTitle?: string
}

// ─── AI Suggestions ──────────────────────────────────────────────

export type SuggestionType = 'add_task' | 'assign_person' | 'hire_resource' | 'timeline_warning' | 'dependency'

export interface AISuggestion {
  id: string
  type: SuggestionType
  message: string
  relatedPhase?: string
  relatedTaskTitle?: string
  actionData?: Record<string, unknown>
  dismissed?: boolean
}

// ─── AI-Generated Strategic Plan ─────────────────────────────────

export interface StrategicPlanTask {
  title: string
  description: string
  startDate: string
  endDate: string
  suggestedRole: string
  suggestedAssigneeId?: string
  dependsOn: string[]
  riskLevel: 'Low' | 'Medium' | 'High'
}

export interface StrategicPlanPhase {
  title: string
  description: string
  startDate: string
  endDate: string
  tasks: StrategicPlanTask[]
}

export interface StrategicPlan {
  phases: StrategicPlanPhase[]
  resourceGaps: ResourceSuggestion[]
  risks: StrategicRisk[]
  criticalPath: string[]
  suggestions: AISuggestion[]
}

// ─── Strategic Plan Overview (for rendering) ─────────────────────

export interface StrategicObjective {
  id: string
  title: string
  description: string | null
  status: string
  progress: number
  milestone_date: string | null
  is_strategic_goal: boolean
  resource_suggestions: ResourceSuggestion[]
  strategic_risks: StrategicRisk[]
  ai_suggestions: AISuggestion[]
  created_at: string
}

export interface StrategicTask {
  id: string
  title: string
  description: string | null
  status: string
  risk_level: string
  start_date: string | null
  end_date: string | null
  progress: number | null
  objective_id: string
  assignee_id: string | null
  assignees: Array<{
    id: string
    full_name: string | null
    role: string | null
  }>
  dependencies: TaskDependency[]
  dependents: TaskDependency[]
}

export interface StrategicPhaseData {
  objective: {
    id: string
    title: string
    description: string | null
    status: string
    progress: number
  }
  tasks: StrategicTask[]
}

export interface StrategicPlanOverview {
  goal: StrategicObjective
  phases: StrategicPhaseData[]
  allDependencies: TaskDependency[]
  criticalPathTaskIds: string[]
  teamMembers: Array<{
    id: string
    full_name: string | null
    role: string | null
    email: string | null
  }>
}

// ─── Canvas Node Types ───────────────────────────────────────────

export type CanvasGrouping = 'phase' | 'person'
export type CanvasViewMode = 'canvas' | 'gantt'
