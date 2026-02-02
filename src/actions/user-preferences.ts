'use server'

import { createClient } from '@/lib/supabase/server'
import { 
  getUserPreferences, 
  updateUserPreferences, 
  getOrCreateUserPreferences 
} from '@/lib/preferences/service'
import type { UserPreferences, UserPreferencesUpdate } from '@/types/preferences'

/**
 * Get user preferences for the authenticated user and their current foundry
 * 
 * @param foundryId - The foundry ID to get preferences for
 * @returns User preferences or null if not found
 */
export async function getPreferences(foundryId: string): Promise<UserPreferences | null> {
  const supabase = await createClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    throw new Error('User not authenticated')
  }

  return getUserPreferences(supabase, user.id, foundryId)
}

/**
 * Get or create user preferences with defaults if they don't exist
 * 
 * @param foundryId - The foundry ID to get/create preferences for
 * @returns User preferences (existing or newly created)
 */
export async function getOrCreatePreferences(foundryId: string): Promise<UserPreferences> {
  const supabase = await createClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    throw new Error('User not authenticated')
  }

  return getOrCreateUserPreferences(supabase, user.id, foundryId)
}

/**
 * Update user preferences for the authenticated user
 * 
 * @param foundryId - The foundry ID to update preferences for
 * @param prefs - Partial preferences to update
 * @returns Updated user preferences
 */
export async function updatePreferences(
  foundryId: string,
  prefs: UserPreferencesUpdate
): Promise<UserPreferences> {
  const supabase = await createClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    throw new Error('User not authenticated')
  }

  // Ensure preferences exist before updating
  await getOrCreateUserPreferences(supabase, user.id, foundryId)
  
  return updateUserPreferences(supabase, user.id, foundryId, prefs)
}
