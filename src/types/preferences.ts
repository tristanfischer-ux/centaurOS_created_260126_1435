/**
 * User Preferences Types
 * 
 * Defines types for user preferences including inbox view settings and task filters.
 */

/**
 * Complete user preferences record from the database
 */
export interface UserPreferences {
  id: string
  profile_id: string
  foundry_id: string
  inbox_view: 'people' | 'tasks'
  inbox_task_filter: 'my_tasks' | 'all_tasks'
  created_at: string
  updated_at: string
}

/**
 * Partial preferences update payload (only updatable fields)
 */
export type UserPreferencesUpdate = Partial<Pick<UserPreferences, 'inbox_view' | 'inbox_task_filter'>>

/**
 * Type guards for preference values
 */
export const isValidInboxView = (value: string): value is UserPreferences['inbox_view'] => {
  return value === 'people' || value === 'tasks'
}

export const isValidInboxTaskFilter = (value: string): value is UserPreferences['inbox_task_filter'] => {
  return value === 'my_tasks' || value === 'all_tasks'
}
