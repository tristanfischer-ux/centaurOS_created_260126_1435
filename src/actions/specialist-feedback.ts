'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * Records a thumbs-up or thumbs-down rating for a specialist message.
 *
 * @description Upserts feedback for a specific message in a specialist thread.
 * Uses the unique constraint on (thread_id, message_index) to ensure only one
 * rating per message — re-voting overwrites the previous rating.
 *
 * @param specialistId - The specialist whose message is being rated
 * @param threadId - The conversation thread ID (nullable for threadless messages)
 * @param messageIndex - Zero-based index of the message in the conversation
 * @param rating - 'positive' (thumbs up) or 'negative' (thumbs down)
 * @returns Success status and optional error message
 *
 * @security Requires authenticated user with foundry membership.
 * RLS policies enforce foundry isolation.
 */
export async function recordSpecialistFeedback(
  specialistId: string,
  threadId: string | null,
  messageIndex: number,
  rating: 'positive' | 'negative'
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  // AUTH: Get user's foundry
  const { data: foundry } = await supabase
    .from('foundries')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!foundry) return { success: false, error: 'No foundry found' }

  const { error } = await supabase
    .from('specialist_feedback')
    .upsert({
      foundry_id: foundry.id,
      specialist_id: specialistId,
      thread_id: threadId,
      message_index: messageIndex,
      rating,
    }, {
      onConflict: 'thread_id,message_index',
    })

  if (error) {
    console.error('[specialist-feedback] Failed to record:', error)
    return { success: false, error: error.message }
  }

  return { success: true, error: null }
}

/**
 * Retrieves aggregated feedback statistics for specialists in the current foundry.
 *
 * @description Fetches all feedback rows and aggregates them client-side into
 * per-specialist counts and approval rates. Optionally filters to a single specialist.
 *
 * @param specialistId - Optional filter to a specific specialist
 * @returns Array of per-specialist stats with positive/negative counts and approval rate
 *
 * @security Requires authenticated user with foundry membership.
 * RLS policies enforce foundry isolation.
 */
export async function getSpecialistStats(
  specialistId?: string
): Promise<{
  stats: Array<{
    specialist_id: string
    positive: number
    negative: number
    total: number
    approval_rate: number
  }>
  error: string | null
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { stats: [], error: 'Not authenticated' }

  // AUTH: Get user's foundry
  const { data: foundry } = await supabase
    .from('foundries')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!foundry) return { stats: [], error: 'No foundry found' }

  let query = supabase
    .from('specialist_feedback')
    .select('specialist_id, rating')
    .eq('foundry_id', foundry.id)

  if (specialistId) {
    query = query.eq('specialist_id', specialistId)
  }

  const { data, error } = await query

  if (error) {
    console.error('[specialist-feedback] Failed to get stats:', error)
    return { stats: [], error: error.message }
  }

  // Aggregate in-memory
  const grouped = (data ?? []).reduce<Record<string, { positive: number; negative: number }>>((acc, row) => {
    if (!acc[row.specialist_id]) acc[row.specialist_id] = { positive: 0, negative: 0 }
    if (row.rating === 'positive') acc[row.specialist_id].positive++
    else acc[row.specialist_id].negative++
    return acc
  }, {})

  const stats = Object.entries(grouped).map(([specialist_id, counts]) => ({
    specialist_id,
    positive: counts.positive,
    negative: counts.negative,
    total: counts.positive + counts.negative,
    approval_rate: (counts.positive + counts.negative) > 0 ? counts.positive / (counts.positive + counts.negative) : 0,
  }))

  return { stats, error: null }
}
