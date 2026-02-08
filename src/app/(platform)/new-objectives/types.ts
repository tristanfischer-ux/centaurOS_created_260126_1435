export interface TaskAssignee {
  id: string
  full_name: string | null
  role: string | null
}

export interface ObjectiveTask {
  id: string
  title: string
  description: string | null
  task_number: number | null
  status: string
  assignee_id: string | null
  start_date: string | null
  end_date: string | null
  risk_level: string | null
  progress: number | null
  objective_id: string | null
  foundry_id: string
  is_private?: boolean
  creator_id: string
  created_at: string
  assignee: TaskAssignee | null
  assignees: TaskAssignee[]
}

export interface ObjectiveWithTasks {
  id: string
  title: string
  description: string | null
  extended_description: string | null
  status: string | null
  progress: number
  parent_objective_id: string | null
  creator_id: string
  foundry_id: string
  created_at: string
  updated_at: string
  is_private?: boolean
  /** Whether this objective has an AI-generated strategic plan */
  is_strategic_goal?: boolean
  /** Target deadline for strategic goals */
  milestone_date?: string | null
  tasks: ObjectiveTask[]
  totalTasks: number
  completedTasks: number
  overdueTasks: number
  health: 'on-track' | 'at-risk' | 'off-track' | 'completed' | 'not-started'
}

export interface Member {
  id: string
  full_name: string
  role: string | null
  email: string
}

export interface Team {
  id: string
  name: string
}
