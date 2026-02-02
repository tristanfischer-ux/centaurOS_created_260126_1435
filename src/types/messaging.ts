import type { Database } from './database.types'

export type Message = Database['public']['Tables']['messages']['Row'] & {
  task_id?: string | null
  objective_id?: string | null
  task?: {
    id: string
    title: string
    task_number: number
    status: string
  } | null
  objective?: {
    id: string
    title: string
  } | null
}

export type MessageInsert = Database['public']['Tables']['messages']['Insert'] & {
  task_id?: string | null
  objective_id?: string | null
}

export type Profile = Database['public']['Tables']['profiles']['Row']

export type TaskComment = Database['public']['Tables']['task_comments']['Row']
