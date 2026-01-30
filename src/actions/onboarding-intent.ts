'use server'
// @ts-nocheck - Database types out of sync

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface SignupIntent {
  id: string
  user_id: string
  intent_type: string
  listing_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  fulfilled_at: string | null
  listing?: {
    id: string
    title: string
    category: string
    subcategory: string
    description: string | null
  } | null
}

/**
 * Get unfulfilled signup intents for the current user
 */
export async function getUnfulfilledIntents(): Promise<{
  intents: SignupIntent[]
  error?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { intents: [], error: 'Unauthorized' }
  }

  const { data: intents, error } = await supabase
    .from('signup_intents')
    .select(`
      id,
      user_id,
      intent_type,
      listing_id,
      metadata,
      created_at,
      fulfilled_at,
      listing:marketplace_listings!listing_id(
        id,
        title,
        category,
        subcategory,
        description
      )
    `)
    .eq('user_id', user.id)
    .is('fulfilled_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching signup intents:', error)
    return { intents: [], error: error.message }
  }

  return { intents: (intents || []) as SignupIntent[] }
}

/**
 * Mark a signup intent as fulfilled
 */
export async function fulfillIntent(intentId: string): Promise<{
  success: boolean
  error?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Unauthorized' }
  }

  const { error } = await supabase
    .from('signup_intents')
    .update({ fulfilled_at: new Date().toISOString() })
    .eq('id', intentId)
    .eq('user_id', user.id)

  if (error) {
    console.error('Error fulfilling intent:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard')
  return { success: true }
}

/**
 * Dismiss a signup intent (mark as fulfilled without action)
 */
export async function dismissIntent(intentId: string): Promise<{
  success: boolean
  error?: string
}> {
  return fulfillIntent(intentId)
}
