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

// Action types from task_history for mapping to human-readable content
export type TaskHistoryActionType = 'CREATED' | 'UPDATED' | 'STATUS_CHANGE' | 'ASSIGNED' | 'COMPLETED' | 'FORWARDED'

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
  // For task_history items: the original action type for additional context
  action_type?: TaskHistoryActionType
  // True if this is a system-generated log entry (e.g., automated comments)
  is_system_log?: boolean
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
  changes: Record<string, { old?: unknown; new?: unknown }> | null
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
export type ActivityFilter = 'all' | 'tasks' | 'objectives' | 'messages' | 'unread' | 'history'

export interface ActivityStreamProps {
  initialItems: ActivityItem[]
  userId: string
  foundryId: string
}
