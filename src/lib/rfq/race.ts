/**
 * RFQ Race Mechanics
 * Handles the competitive bidding race system
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/types/database.types'
import {
  RFQType,
  RaceStatus,
  SupplierTier,
  RACE_CONSTANTS,
} from '@/types/rfq'
import { calculateBroadcastSchedule } from './timezone-scheduling'

type TypedSupabaseClient = SupabaseClient<Database>

/**
 * Broadcast an RFQ to matched suppliers
 * Creates broadcast records for each supplier with timezone-aware scheduling
 */
export async function broadcastRFQ(
  supabase: TypedSupabaseClient,
  rfqId: string
): Promise<{ success: boolean; broadcast_count: number; error: string | null }> {
  try {
    // Get the RFQ
    const { data: rfq, error: rfqError } = await supabase
      .from('rfqs')
      .select('*')
      .eq('id', rfqId)
      .single()

    if (rfqError || !rfq) {
      return { success: false, broadcast_count: 0, error: 'RFQ not found' }
    }

    // Get all eligible providers
    const { data: providers, error: providersError } = await supabase
      .from('provider_profiles')
      .select('id, user_id, timezone, tier')
      .eq('is_active', true)
      .not('tier', 'eq', 'suspended')

    if (providersError) {
      console.error('Error fetching providers:', providersError)
      return { success: false, broadcast_count: 0, error: 'Failed to fetch suppliers' }
    }

    if (!providers || providers.length === 0) {
      return { success: true, broadcast_count: 0, error: null }
    }

    // Calculate broadcast schedule for each provider
    const broadcasts = calculateBroadcastSchedule(
      rfq.race_opens_at || new Date().toISOString(),
      rfq.urgency as 'urgent' | 'standard',
      providers.map((p) => ({
        provider_id: p.id,
        timezone: p.timezone || 'UTC',
        tier: p.tier,
      }))
    )

    // Create broadcast records
    const broadcastRecords = broadcasts.map((b) => ({
      rfq_id: rfqId,
      provider_id: b.provider_id,
      scheduled_at: b.scheduled_at,
    }))

    const { error: insertError } = await supabase
      .from('rfq_broadcasts')
      .insert(broadcastRecords)

    if (insertError) {
      console.error('Error creating broadcasts:', insertError)
      return { success: false, broadcast_count: 0, error: 'Failed to create broadcasts' }
    }

    // Update RFQ status to Bidding
    await supabase
      .from('rfqs')
      .update({ status: 'Bidding' })
      .eq('id', rfqId)

    return { success: true, broadcast_count: broadcastRecords.length, error: null }
  } catch (err) {
    console.error('Error in broadcastRFQ:', err)
    return { success: false, broadcast_count: 0, error: 'An unexpected error occurred' }
  }
}

/**
 * Schedule timezone-aware broadcast for an RFQ
 * Returns the scheduled times per provider
 */
export async function scheduleTimezoneAwareBroadcast(
  supabase: TypedSupabaseClient,
  rfqId: string
): Promise<{ 
  schedules: Array<{ provider_id: string; scheduled_at: string }>; 
  error: string | null 
}> {
  try {
    // Get existing broadcasts
    const { data: existingBroadcasts } = await supabase
      .from('rfq_broadcasts')
      .select('provider_id, scheduled_at')
      .eq('rfq_id', rfqId)

    if (existingBroadcasts && existingBroadcasts.length > 0) {
      return { 
        schedules: existingBroadcasts.map((b) => ({
          provider_id: b.provider_id,
          scheduled_at: b.scheduled_at,
        })), 
        error: null 
      }
    }

    // If no broadcasts exist, create them
    const result = await broadcastRFQ(supabase, rfqId)
    
    if (!result.success) {
      return { schedules: [], error: result.error }
    }

    // Fetch the created broadcasts
    const { data: broadcasts } = await supabase
      .from('rfq_broadcasts')
      .select('provider_id, scheduled_at')
      .eq('rfq_id', rfqId)

    return { 
      schedules: (broadcasts || []).map((b) => ({
        provider_id: b.provider_id,
        scheduled_at: b.scheduled_at,
      })), 
      error: null 
    }
  } catch (err) {
    console.error('Error in scheduleTimezoneAwareBroadcast:', err)
    return { schedules: [], error: 'An unexpected error occurred' }
  }
}

/**
 * Accept an RFQ - First click wins for commodity, priority hold for custom
 */
export async function acceptRFQ(
  supabase: TypedSupabaseClient,
  rfqId: string,
  providerId: string,
  quotedPrice?: number
): Promise<{ 
  success: boolean; 
  awarded: boolean; 
  priority_hold: boolean;
  error: string | null 
}> {
  try {
    // Get the RFQ
    const { data: rfq, error: rfqError } = await supabase
      .from('rfqs')
      .select('*')
      .eq('id', rfqId)
      .single()

    if (rfqError || !rfq) {
      return { success: false, awarded: false, priority_hold: false, error: 'RFQ not found' }
    }

    // Check if RFQ is still open for responses
    if (rfq.status !== 'Open' && rfq.status !== 'Bidding') {
      return { 
        success: false, 
        awarded: false, 
        priority_hold: false, 
        error: `RFQ is ${rfq.status}, cannot accept` 
      }
    }

    // Check if race has opened (for non-urgent)
    if (rfq.race_opens_at && new Date(rfq.race_opens_at) > new Date()) {
      return { 
        success: false, 
        awarded: false, 
        priority_hold: false, 
        error: 'Race has not started yet' 
      }
    }

    // Check for existing response
    const { data: existingResponse } = await supabase
      .from('rfq_responses')
      .select('id')
      .eq('rfq_id', rfqId)
      .eq('provider_id', providerId)
      .single()

    if (existingResponse) {
      return { 
        success: false, 
        awarded: false, 
        priority_hold: false, 
        error: 'Already responded to this RFQ' 
      }
    }

    // Get provider tier for delay calculation
    const { data: provider } = await supabase
      .from('provider_profiles')
      .select('tier')
      .eq('id', providerId)
      .single()

    const tier = provider?.tier as SupplierTier || 'approved'
    const rfqType = rfq.rfq_type as RFQType

    // Check if broadcast has been delivered to this provider
    const { data: broadcast } = await supabase
      .from('rfq_broadcasts')
      .select('*')
      .eq('rfq_id', rfqId)
      .eq('provider_id', providerId)
      .single()

    // Apply tier delay for approved suppliers (vs verified partners)
    if (broadcast && tier === 'approved') {
      const scheduledTime = new Date(broadcast.scheduled_at)
      const delayTime = new Date(scheduledTime.getTime() + RACE_CONSTANTS.TIER_DELAY_MS)
      
      if (new Date() < delayTime) {
        const waitMs = delayTime.getTime() - Date.now()
        return { 
          success: false, 
          awarded: false, 
          priority_hold: false, 
          error: `Please wait ${Math.ceil(waitMs / 1000)} more seconds (tier delay)` 
        }
      }
    }

    // Mark broadcast as delivered/viewed if not already
    if (broadcast && !broadcast.delivered_at) {
      await supabase
        .from('rfq_broadcasts')
        .update({ 
          delivered_at: new Date().toISOString(),
          viewed_at: new Date().toISOString(),
        })
        .eq('id', broadcast.id)
    }

    // Create the response
    const { error: responseError } = await supabase
      .from('rfq_responses')
      .insert({
        rfq_id: rfqId,
        provider_id: providerId,
        response_type: 'accept',
        quoted_price: quotedPrice || null,
        message: null,
      })

    if (responseError) {
      console.error('Error creating response:', responseError)
      return { success: false, awarded: false, priority_hold: false, error: 'Failed to submit response' }
    }

    // Handle race mechanics based on RFQ type
    if (rfqType === 'commodity') {
      // Commodity: Pure first-click-wins
      // Check if this is the first accept
      const { data: acceptResponses } = await supabase
        .from('rfq_responses')
        .select('id')
        .eq('rfq_id', rfqId)
        .eq('response_type', 'accept')

      if (acceptResponses && acceptResponses.length === 1) {
        // First click wins - auto-award
        await supabase
          .from('rfqs')
          .update({
            status: 'Awarded',
            awarded_to: providerId,
          })
          .eq('id', rfqId)

        return { success: true, awarded: true, priority_hold: false, error: null }
      }
    } else if (rfqType === 'custom') {
      // Custom: 2-hour priority hold, buyer confirms or releases
      // Check if this is the first accept
      const { data: acceptResponses } = await supabase
        .from('rfq_responses')
        .select('id')
        .eq('rfq_id', rfqId)
        .eq('response_type', 'accept')

      if (acceptResponses && acceptResponses.length === 1) {
        // Set priority hold
        const holdExpires = new Date(Date.now() + RACE_CONSTANTS.PRIORITY_HOLD_DURATION_MS)
        
        await supabase
          .from('rfqs')
          .update({
            status: 'priority_hold',
            priority_holder_id: providerId,
            priority_hold_expires_at: holdExpires.toISOString(),
          })
          .eq('id', rfqId)

        return { success: true, awarded: false, priority_hold: true, error: null }
      }
    }

    // Service type or subsequent accepts - no auto-award
    return { success: true, awarded: false, priority_hold: false, error: null }
  } catch (err) {
    console.error('Error in acceptRFQ:', err)
    return { success: false, awarded: false, priority_hold: false, error: 'An unexpected error occurred' }
  }
}

/**
 * Request more info on an RFQ
 */
export async function requestMoreInfo(
  supabase: TypedSupabaseClient,
  rfqId: string,
  providerId: string,
  questions: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    // Check if RFQ exists and is accepting responses
    const { data: rfq, error: rfqError } = await supabase
      .from('rfqs')
      .select('status')
      .eq('id', rfqId)
      .single()

    if (rfqError || !rfq) {
      return { success: false, error: 'RFQ not found' }
    }

    if (rfq.status !== 'Open' && rfq.status !== 'Bidding') {
      return { success: false, error: `RFQ is ${rfq.status}, cannot request info` }
    }

    // Check for existing response
    const { data: existingResponse } = await supabase
      .from('rfq_responses')
      .select('id')
      .eq('rfq_id', rfqId)
      .eq('provider_id', providerId)
      .single()

    if (existingResponse) {
      return { success: false, error: 'Already responded to this RFQ' }
    }

    // Create the response
    const { error: responseError } = await supabase
      .from('rfq_responses')
      .insert({
        rfq_id: rfqId,
        provider_id: providerId,
        response_type: 'info_request',
        quoted_price: null,
        message: questions,
      })

    if (responseError) {
      console.error('Error creating info request:', responseError)
      return { success: false, error: 'Failed to submit request' }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('Error in requestMoreInfo:', err)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

/**
 * Decline an RFQ
 */
export async function declineRFQ(
  supabase: TypedSupabaseClient,
  rfqId: string,
  providerId: string,
  reason?: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    // Check if RFQ exists
    const { data: rfq, error: rfqError } = await supabase
      .from('rfqs')
      .select('status')
      .eq('id', rfqId)
      .single()

    if (rfqError || !rfq) {
      return { success: false, error: 'RFQ not found' }
    }

    // Check for existing response
    const { data: existingResponse } = await supabase
      .from('rfq_responses')
      .select('id')
      .eq('rfq_id', rfqId)
      .eq('provider_id', providerId)
      .single()

    if (existingResponse) {
      return { success: false, error: 'Already responded to this RFQ' }
    }

    // Create the decline response
    const { error: responseError } = await supabase
      .from('rfq_responses')
      .insert({
        rfq_id: rfqId,
        provider_id: providerId,
        response_type: 'decline',
        quoted_price: null,
        message: reason || null,
      })

    if (responseError) {
      console.error('Error creating decline response:', responseError)
      return { success: false, error: 'Failed to submit decline' }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('Error in declineRFQ:', err)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

/**
 * Check race status for an RFQ
 */
export async function checkRaceStatus(
  supabase: TypedSupabaseClient,
  rfqId: string
): Promise<{ data: RaceStatus | null; error: string | null }> {
  try {
    // Get the RFQ
    const { data: rfq, error: rfqError } = await supabase
      .from('rfqs')
      .select(`
        *,
        priority_holder:provider_profiles!rfqs_priority_holder_id_fkey (
          id,
          user_id
        ),
        winner:provider_profiles!rfqs_awarded_to_fkey (
          id,
          user_id
        )
      `)
      .eq('id', rfqId)
      .single()

    if (rfqError || !rfq) {
      return { data: null, error: 'RFQ not found' }
    }

    // Get response counts
    const { data: responses } = await supabase
      .from('rfq_responses')
      .select('response_type')
      .eq('rfq_id', rfqId)

    const totalResponses = responses?.length || 0
    const acceptCount = responses?.filter((r) => r.response_type === 'accept').length || 0

    // Get profile names
    let priorityHolderName = null
    let winnerName = null
    let winnerQuotedPrice = null

    if (rfq.priority_holder?.user_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', rfq.priority_holder.user_id)
        .single()
      priorityHolderName = profile?.full_name || null
    }

    if (rfq.winner?.user_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', rfq.winner.user_id)
        .single()
      winnerName = profile?.full_name || null

      // Get winning response
      const { data: winningResponse } = await supabase
        .from('rfq_responses')
        .select('quoted_price')
        .eq('rfq_id', rfqId)
        .eq('provider_id', rfq.awarded_to!)
        .single()
      winnerQuotedPrice = winningResponse?.quoted_price || null
    }

    // Determine status
    let status: RaceStatus['status'] = 'scheduled'
    const now = new Date()
    const raceOpensAt = rfq.race_opens_at ? new Date(rfq.race_opens_at) : null

    if (rfq.status === 'cancelled') {
      status = 'cancelled'
    } else if (rfq.status === 'Awarded') {
      status = 'awarded'
    } else if (rfq.status === 'Closed') {
      status = 'closed'
    } else if (rfq.status === 'priority_hold') {
      status = 'priority_hold'
    } else if (!raceOpensAt || raceOpensAt <= now) {
      status = 'open'
    } else {
      status = 'scheduled'
    }

    const raceStatus: RaceStatus = {
      status,
      race_opens_at: rfq.race_opens_at,
      time_until_open_ms: raceOpensAt && raceOpensAt > now 
        ? raceOpensAt.getTime() - now.getTime() 
        : null,
      priority_holder: rfq.priority_holder_id ? {
        id: rfq.priority_holder_id,
        full_name: priorityHolderName,
      } : null,
      priority_hold_expires_at: rfq.priority_hold_expires_at,
      winner: rfq.awarded_to ? {
        id: rfq.awarded_to,
        full_name: winnerName,
        quoted_price: winnerQuotedPrice,
      } : null,
      total_responses: totalResponses,
      accept_count: acceptCount,
    }

    return { data: raceStatus, error: null }
  } catch (err) {
    console.error('Error in checkRaceStatus:', err)
    return { data: null, error: 'An unexpected error occurred' }
  }
}

/**
 * Award an RFQ to a specific provider (for custom/service RFQs)
 */
export async function awardRFQ(
  supabase: TypedSupabaseClient,
  rfqId: string,
  providerId: string,
  buyerId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    // Verify the RFQ and buyer ownership
    const { data: rfq, error: rfqError } = await supabase
      .from('rfqs')
      .select('*')
      .eq('id', rfqId)
      .single()

    if (rfqError || !rfq) {
      return { success: false, error: 'RFQ not found' }
    }

    if (rfq.buyer_id !== buyerId) {
      return { success: false, error: 'Not authorized to award this RFQ' }
    }

    // Check status
    if (rfq.status === 'Awarded') {
      return { success: false, error: 'RFQ already awarded' }
    }

    if (rfq.status === 'cancelled' || rfq.status === 'Closed') {
      return { success: false, error: `Cannot award ${rfq.status} RFQ` }
    }

    // Verify the provider has accepted
    const { data: response } = await supabase
      .from('rfq_responses')
      .select('id, response_type')
      .eq('rfq_id', rfqId)
      .eq('provider_id', providerId)
      .single()

    if (!response || response.response_type !== 'accept') {
      return { success: false, error: 'Provider has not accepted this RFQ' }
    }

    // Award the RFQ
    const { error: updateError } = await supabase
      .from('rfqs')
      .update({
        status: 'Awarded',
        awarded_to: providerId,
        priority_holder_id: null,
        priority_hold_expires_at: null,
      })
      .eq('id', rfqId)

    if (updateError) {
      console.error('Error awarding RFQ:', updateError)
      return { success: false, error: 'Failed to award RFQ' }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('Error in awardRFQ:', err)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

/**
 * Release priority hold (for custom RFQs)
 */
export async function releasePriorityHold(
  supabase: TypedSupabaseClient,
  rfqId: string,
  buyerId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    // Verify the RFQ
    const { data: rfq, error: rfqError } = await supabase
      .from('rfqs')
      .select('*')
      .eq('id', rfqId)
      .single()

    if (rfqError || !rfq) {
      return { success: false, error: 'RFQ not found' }
    }

    if (rfq.buyer_id !== buyerId) {
      return { success: false, error: 'Not authorized' }
    }

    if (rfq.status !== 'priority_hold') {
      return { success: false, error: 'RFQ is not in priority hold status' }
    }

    // Release the hold
    const { error: updateError } = await supabase
      .from('rfqs')
      .update({
        status: 'Bidding',
        priority_holder_id: null,
        priority_hold_expires_at: null,
      })
      .eq('id', rfqId)

    if (updateError) {
      console.error('Error releasing priority hold:', updateError)
      return { success: false, error: 'Failed to release hold' }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('Error in releasePriorityHold:', err)
    return { success: false, error: 'An unexpected error occurred' }
  }
}
