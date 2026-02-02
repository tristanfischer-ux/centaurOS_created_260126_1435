import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserPreferences, UserPreferencesUpdate } from '@/types/preferences'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>

/**
 * User Preferences Service
 * 
 * Manages user-specific preferences including inbox view settings and task filters.
 * All preferences are scoped to a specific user and foundry.
 */

/**
 * Get user preferences for a specific user and foundry
 * 
 * @param supabase - Supabase client instance
 * @param userId - Profile ID of the user
 * @param foundryId - Foundry ID to scope preferences to
 * @returns User preferences or null if not found
 */
export async function getUserPreferences(
  supabase: AnySupabaseClient,
  userId: string,
  foundryId: string
): Promise<UserPreferences | null> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('profile_id', userId)
    .eq('foundry_id', foundryId)
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned - this is expected, return null
      return null
    }
    throw new Error(`Failed to get user preferences: ${error.message}`)
  }

  return data as UserPreferences | null
}

/**
 * Update user preferences for a specific user and foundry
 * 
 * Updates only the fields provided in the prefs object.
 * The record must already exist - use getOrCreateUserPreferences to ensure it exists.
 * 
 * @param supabase - Supabase client instance
 * @param userId - Profile ID of the user
 * @param foundryId - Foundry ID to scope preferences to
 * @param prefs - Partial preferences to update
 * @returns Updated user preferences
 * @throws Error if preferences don't exist or update fails
 */
export async function updateUserPreferences(
  supabase: AnySupabaseClient,
  userId: string,
  foundryId: string,
  prefs: UserPreferencesUpdate
): Promise<UserPreferences> {
  const { data, error } = await supabase
    .from('user_preferences')
    .update({
      ...prefs,
      updated_at: new Date().toISOString()
    })
    .eq('profile_id', userId)
    .eq('foundry_id', foundryId)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update user preferences: ${error.message}`)
  }

  return data as UserPreferences
}

/**
 * Get or create user preferences for a specific user and foundry
 * 
 * Returns existing preferences if they exist, otherwise creates a new record
 * with default values (inbox_view: 'people', inbox_task_filter: 'my_tasks').
 * 
 * @param supabase - Supabase client instance
 * @param userId - Profile ID of the user
 * @param foundryId - Foundry ID to scope preferences to
 * @returns User preferences (existing or newly created)
 */
export async function getOrCreateUserPreferences(
  supabase: AnySupabaseClient,
  userId: string,
  foundryId: string
): Promise<UserPreferences> {
  // First, try to get existing preferences
  const existing = await getUserPreferences(supabase, userId, foundryId)
  
  if (existing) {
    return existing
  }

  // Create new preferences with defaults
  const { data, error } = await supabase
    .from('user_preferences')
    .insert({
      profile_id: userId,
      foundry_id: foundryId,
      inbox_view: 'people',
      inbox_task_filter: 'my_tasks'
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create user preferences: ${error.message}`)
  }

  return data as UserPreferences
}
