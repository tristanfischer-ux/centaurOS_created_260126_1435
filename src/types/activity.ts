/**
 * Activity Stream Types
 * 
 * Unified activity feed that aggregates:
 * - Task comments
 * - Objective comments
 * - Conversation messages
 */

export type ActivitySourceType = 'task' | 'objective' | 'conversation'
export type ActivityItemType = 'task_comment' | 'objective_comment' | 'message' | 'task_history'

// Task history action types
export type TaskHistoryActionType = 
  | 'CREATED' 
  | 'UPDATED' 
  | 'STATUS_CHANGE' 
  | 'ASSIGNED' 
  | 'COMPLETED' 
  | 'FORWARDED'

// Changes stored in task_history.changes JSONB
export interface TaskHistoryChanges {
  status?: { old: string; new: string }
  assignee?: { old: string | null; new: string | null }
  previous_assignee?: string
  new_assignee?: string
  reason?: string
  [key: string]: unknown
}

export interface ActivityAuthor {
  id: string
  full_name: string | null
  avatar_url: string | null
  role: string | null
}

export interface ActivitySource {
  type: ActivitySourceType
  id: string
  title: string
  task_number?: number
}

export interface ActivityItem {
  id: string
  type: ActivityItemType
  content: string
  created_at: string
  author: ActivityAuthor
  source: ActivitySource
  is_unread: boolean
  // Optional metadata for task_history items
  action_type?: TaskHistoryActionType
  changes?: TaskHistoryChanges
}

// Raw database types for transformation
export interface RawTaskComment {
  id: string
  content: string
  created_at: string | null
  is_system_log: boolean | null
  user: {
    id: string
    full_name: string | null
    avatar_url: string | null
    role: string | null
  } | null
  task: {
    id: string
    title: string
    task_number: number
  } | null
  read: { read_at: string | null }[] | null
}

export interface RawObjectiveComment {
  id: string
  content: string
  created_at: string | null
  is_system_log: boolean | null
  user: {
    id: string
    full_name: string | null
    avatar_url: string | null
    role: string | null
  } | null
  objective: {
    id: string
    title: string
  } | null
  read: { read_at: string | null }[] | null
}

export interface RawMessage {
  id: string
  content: string
  created_at: string | null
  sender: {
    id: string
    full_name: string | null
    avatar_url: string | null
    role: string | null
  } | null
  conversation: {
    id: string
    name: string | null
    conversation_type: string
    task_id: string | null
  } | null
}

export interface RawTaskHistory {
  id: string
  task_id: string
  user_id: string
  action_type: TaskHistoryActionType
  changes: TaskHistoryChanges | null
  created_at: string | null
  user: {
    id: string
    full_name: string | null
    avatar_url: string | null
    role: string | null
  } | null
  task: {
    id: string
    title: string
    task_number: number
  } | null
}

// Filter options for the activity stream
export type ActivityFilter = 'all' | 'tasks' | 'objectives' | 'messages' | 'unread' | 'changes'

export interface ActivityStreamProps {
  initialItems: ActivityItem[]
  userId: string
  foundryId: string
}
