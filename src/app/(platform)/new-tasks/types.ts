export interface TaskAssignee {
  id: string
  full_name: string | null
  role: string | null
}

export interface TaskFile {
  id: string
  file_name: string
  file_size: number | null
  created_at: string | null
}

export interface TaskWithData {
  id: string
  title: string
  description: string | null
  task_number: number | null
  status: string
  assignee_id: string | null
  creator_id: string
  start_date: string | null
  end_date: string | null
  risk_level: string | null
  progress: number | null
  objective_id: string | null
  foundry_id: string
  is_private?: boolean
  is_demo?: boolean
  amendment_notes: string | null
  rejection_reason: string | null
  nudge_count: number | null
  client_visible: boolean | null
  created_at: string
  updated_at: string
  message_count: number
  assignee: TaskAssignee | null
  creator: TaskAssignee | null
  objective: { id: string; title: string } | null
  /** Strategic pillar this task's objective belongs to (for cascade display) */
  strategy: { id: string; title: string } | null
  assignees: TaskAssignee[]
  task_files: TaskFile[]
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
