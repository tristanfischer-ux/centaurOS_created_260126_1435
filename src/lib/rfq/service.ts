// @ts-nocheck
// TODO: Fix type mismatches
/**
 * RFQ Service
 * Core business logic for RFQ management
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/types/database.types'
import {
  RFQ,
  RFQWithBuyer,
  RFQWithDetails,
  RFQSummary,
  RFQResponseWithProvider,
  CreateRFQParams,
  UpdateRFQParams,
  RFQFilters,
  RFQStatus,
  SupplierMatch,
  RACE_CONSTANTS,
} from '@/types/rfq'

type TypedSupabaseClient = SupabaseClient<Database>

/**
 * Create a new RFQ
 */
export async function createRFQ(
  supabase: TypedSupabaseClient,
  buyerId: string,
  foundryId: string,
  params: CreateRFQParams
): Promise<{ data: RFQ | null; error: string | null }> {
  try {
    // Calculate race opening time based on urgency
    let raceOpensAt: string | null = null
    if (params.urgency === 'urgent') {
      // Urgent: opens in minimum delay (5 minutes)
      raceOpensAt = new Date(Date.now() + RACE_CONSTANTS.MIN_RACE_DELAY_MS).toISOString()
    } else {
      // Standard: opens at next business day 9am UTC (will be adjusted per timezone during broadcast)
      const now = new Date()
      const tomorrow = new Date(now)
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(RACE_CONSTANTS.DEFAULT_BROADCAST_HOUR, 0, 0, 0)
      raceOpensAt = tomorrow.toISOString()
    }

    const { data, error } = await supabase
      .from('rfqs')
      .insert({
        buyer_id: buyerId,
        foundry_id: foundryId,
        rfq_type: params.rfq_type,
        title: params.title,
        specifications: params.specifications || {},
        budget_min: params.budget_min || null,
        budget_max: params.budget_max || null,
        deadline: params.deadline || null,
        category: params.category || null,
        urgency: params.urgency || 'standard',
        status: 'Open',
        race_opens_at: raceOpensAt,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating RFQ:', error)
      return { data: null, error: 'Failed to create RFQ' }
    }

    return { data: data as unknown as RFQ, error: null }
  } catch (err) {
    console.error('Error in createRFQ:', err)
    return { data: null, error: 'An unexpected error occurred' }
  }
}

/**
 * Get an RFQ by ID with full details
 */
export async function getRFQ(
  supabase: TypedSupabaseClient,
  rfqId: string,
  userId?: string
): Promise<{ data: RFQWithDetails | null; error: string | null }> {
  try {
    // Fetch the RFQ with buyer info
    const { data: rfq, error: rfqError } = await supabase
      .from('rfqs')
      .select(`
        *,
        buyer:profiles!rfqs_buyer_id_fkey (
          id,
          full_name,
          email,
          avatar_url
        )
      `)
      .eq('id', rfqId)
      .single()

    if (rfqError || !rfq) {
      console.error('Error fetching RFQ:', rfqError)
      return { data: null, error: 'RFQ not found' }
    }

    // Fetch responses with provider details
    const { data: responses } = await supabase
      .from('rfq_responses')
      .select(`
        *,
        provider:provider_profiles!rfq_responses_provider_id_fkey (
          id,
          user_id,
          headline,
          tier,
          day_rate
        )
      `)
      .eq('rfq_id', rfqId)
      .order('responded_at', { ascending: true })

    // Get profile info for each provider
    const responsesWithProfiles: RFQResponseWithProvider[] = []
    for (const response of responses || []) {
      let providerProfile = null
      if (response.provider?.user_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .eq('id', response.provider.user_id)
          .single()
        providerProfile = profile
      }
      responsesWithProfiles.push({
        ...response,
        provider: response.provider,
        provider_profile: providerProfile,
      } as RFQResponseWithProvider)
    }

    // Fetch broadcasts
    const { data: broadcasts } = await supabase
      .from('rfq_broadcasts')
      .select(`
        *,
        provider:provider_profiles!rfq_broadcasts_provider_id_fkey (
          id,
          user_id,
          timezone,
          tier
        )
      `)
      .eq('rfq_id', rfqId)
      .order('scheduled_at', { ascending: true })

    // Check if current user has responded
    let hasUserResponded = false
    if (userId) {
      const { data: providerProfile } = await supabase
        .from('provider_profiles')
        .select('id')
        .eq('user_id', userId)
        .single()

      if (providerProfile) {
        hasUserResponded = responsesWithProfiles.some(
          (r) => r.provider_id === providerProfile.id
        )
      }
    }

    const rfqWithDetails: RFQWithDetails = {
      ...(rfq as unknown as RFQWithBuyer),
      responses: responsesWithProfiles,
      broadcasts: broadcasts || [],
      response_count: responsesWithProfiles.length,
      has_user_responded: hasUserResponded,
    }

    return { data: rfqWithDetails, error: null }
  } catch (err) {
    console.error('Error in getRFQ:', err)
    return { data: null, error: 'An unexpected error occurred' }
  }
}

/**
 * Update an RFQ
 */
export async function updateRFQ(
  supabase: TypedSupabaseClient,
  rfqId: string,
  buyerId: string,
  updates: UpdateRFQParams
): Promise<{ data: RFQ | null; error: string | null }> {
  try {
    // Verify ownership
    const { data: existing, error: fetchError } = await supabase
      .from('rfqs')
      .select('id, buyer_id, status')
      .eq('id', rfqId)
      .single()

    if (fetchError || !existing) {
      return { data: null, error: 'RFQ not found' }
    }

    if (existing.buyer_id !== buyerId) {
      return { data: null, error: 'Not authorized to update this RFQ' }
    }

    // Only allow updates in Open status
    if (existing.status !== 'Open') {
      return { data: null, error: 'Cannot update RFQ after bidding has started' }
    }

    const { data, error } = await supabase
      .from('rfqs')
      .update({
        title: updates.title,
        specifications: updates.specifications,
        budget_min: updates.budget_min,
        budget_max: updates.budget_max,
        deadline: updates.deadline,
        category: updates.category,
        urgency: updates.urgency,
      })
      .eq('id', rfqId)
      .select()
      .single()

    if (error) {
      console.error('Error updating RFQ:', error)
      return { data: null, error: 'Failed to update RFQ' }
    }

    return { data: data as unknown as RFQ, error: null }
  } catch (err) {
    console.error('Error in updateRFQ:', err)
    return { data: null, error: 'An unexpected error occurred' }
  }
}

/**
 * Cancel an RFQ
 * @param reason - Optional cancellation reason (reserved for future use)
 */
export async function cancelRFQ(
  supabase: TypedSupabaseClient,
  rfqId: string,
  buyerId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  reason?: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    // Verify ownership
    const { data: existing, error: fetchError } = await supabase
      .from('rfqs')
      .select('id, buyer_id, status')
      .eq('id', rfqId)
      .single()

    if (fetchError || !existing) {
      return { success: false, error: 'RFQ not found' }
    }

    if (existing.buyer_id !== buyerId) {
      return { success: false, error: 'Not authorized to cancel this RFQ' }
    }

    // Cannot cancel awarded or already cancelled RFQs
    if (existing.status === 'Awarded' || existing.status === 'cancelled') {
      return { success: false, error: `Cannot cancel RFQ in ${existing.status} status` }
    }

    const { error } = await supabase
      .from('rfqs')
      .update({
        status: 'cancelled',
      })
      .eq('id', rfqId)

    if (error) {
      console.error('Error cancelling RFQ:', error)
      return { success: false, error: 'Failed to cancel RFQ' }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('Error in cancelRFQ:', err)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

/**
 * Close an RFQ (no more responses accepted)
 */
export async function closeRFQ(
  supabase: TypedSupabaseClient,
  rfqId: string,
  buyerId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    // Verify ownership
    const { data: existing, error: fetchError } = await supabase
      .from('rfqs')
      .select('id, buyer_id, status')
      .eq('id', rfqId)
      .single()

    if (fetchError || !existing) {
      return { success: false, error: 'RFQ not found' }
    }

    if (existing.buyer_id !== buyerId) {
      return { success: false, error: 'Not authorized to close this RFQ' }
    }

    // Can only close Open or Bidding RFQs
    if (existing.status !== 'Open' && existing.status !== 'Bidding') {
      return { success: false, error: `Cannot close RFQ in ${existing.status} status` }
    }

    const { error } = await supabase
      .from('rfqs')
      .update({
        status: 'Closed',
      })
      .eq('id', rfqId)

    if (error) {
      console.error('Error closing RFQ:', error)
      return { success: false, error: 'Failed to close RFQ' }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('Error in closeRFQ:', err)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

/**
 * Find matching suppliers for an RFQ
 */
export async function matchSuppliers(
  supabase: TypedSupabaseClient,
  rfqId: string
): Promise<{ data: SupplierMatch[]; error: string | null }> {
  try {
    // Get the RFQ
    const { data: rfq, error: rfqError } = await supabase
      .from('rfqs')
      .select('*')
      .eq('id', rfqId)
      .single()

    if (rfqError || !rfq) {
      return { data: [], error: 'RFQ not found' }
    }

    // Get all active providers (not suspended, is_active = true)
    const { data: providers, error: providersError } = await supabase
      .from('provider_profiles')
      .select(`
        id,
        user_id,
        tier,
        timezone,
        is_active,
        headline
      `)
      .eq('is_active', true)
      .not('tier', 'eq', 'suspended')

    if (providersError) {
      console.error('Error fetching providers:', providersError)
      return { data: [], error: 'Failed to fetch suppliers' }
    }

    // Get profile info for each provider
    const matches: SupplierMatch[] = []
    for (const provider of providers || []) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('id', provider.user_id)
        .single()

      // Calculate match score (simplified - in production would use more factors)
      const matchReasons: string[] = []
      let matchScore = 50 // Base score

      // Verified partners get bonus
      if (provider.tier === 'verified_partner') {
        matchScore += 30
        matchReasons.push('Verified Partner')
      } else if (provider.tier === 'approved') {
        matchScore += 15
        matchReasons.push('Approved Supplier')
      }

      matches.push({
        provider_id: provider.id,
        user_id: provider.user_id,
        full_name: profile?.full_name || null,
        headline: provider.headline || null,
        tier: provider.tier,
        timezone: provider.timezone || null,
        match_score: matchScore,
        match_reasons: matchReasons,
      })
    }

    // Sort by match score descending
    matches.sort((a, b) => b.match_score - a.match_score)

    return { data: matches, error: null }
  } catch (err) {
    console.error('Error in matchSuppliers:', err)
    return { data: [], error: 'An unexpected error occurred' }
  }
}

/**
 * Get RFQs with filters
 */
export async function getRFQs(
  supabase: TypedSupabaseClient,
  foundryId: string,
  filters: RFQFilters
): Promise<{ data: RFQSummary[]; error: string | null; count: number }> {
  try {
    let query = supabase
      .from('rfqs')
      .select(`
        id,
        title,
        rfq_type,
        status,
        budget_min,
        budget_max,
        deadline,
        category,
        urgency,
        created_at,
        buyer:profiles!rfqs_buyer_id_fkey (
          full_name
        )
      `, { count: 'exact' })
      .eq('foundry_id', foundryId)

    // Apply filters
    if (filters.status) {
      if (Array.isArray(filters.status)) {
        query = query.in('status', filters.status)
      } else {
        query = query.eq('status', filters.status)
      }
    }

    if (filters.rfq_type) {
      if (Array.isArray(filters.rfq_type)) {
        query = query.in('rfq_type', filters.rfq_type)
      } else {
        query = query.eq('rfq_type', filters.rfq_type)
      }
    }

    if (filters.category) {
      query = query.eq('category', filters.category)
    }

    if (filters.urgency) {
      query = query.eq('urgency', filters.urgency)
    }

    if (filters.buyer_id) {
      query = query.eq('buyer_id', filters.buyer_id)
    }

    if (filters.search) {
      query = query.ilike('title', `%${filters.search}%`)
    }

    // Pagination
    const limit = filters.limit || 20
    const offset = filters.offset || 0
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching RFQs:', error)
      return { data: [], error: 'Failed to fetch RFQs', count: 0 }
    }

    // Get response counts for each RFQ
    const rfqIds = (data || []).map((r) => r.id)
    let responseCounts: Record<string, number> = {}

    if (rfqIds.length > 0) {
      const { data: counts } = await supabase
        .from('rfq_responses')
        .select('rfq_id')
        .in('rfq_id', rfqIds)

      if (counts) {
        responseCounts = counts.reduce((acc, r) => {
          acc[r.rfq_id] = (acc[r.rfq_id] || 0) + 1
          return acc
        }, {} as Record<string, number>)
      }
    }

    const rfqs: RFQSummary[] = (data || []).map((rfq) => ({
      id: rfq.id,
      title: rfq.title,
      rfq_type: rfq.rfq_type,
      status: rfq.status as RFQStatus,
      budget_min: rfq.budget_min,
      budget_max: rfq.budget_max,
      deadline: rfq.deadline,
      category: rfq.category,
      urgency: rfq.urgency as 'urgent' | 'standard',
      created_at: rfq.created_at,
      response_count: responseCounts[rfq.id] || 0,
      buyer: rfq.buyer,
    }))

    return { data: rfqs, error: null, count: count || 0 }
  } catch (err) {
    console.error('Error in getRFQs:', err)
    return { data: [], error: 'An unexpected error occurred', count: 0 }
  }
}

/**
 * Get RFQs available to a supplier
 */
export async function getAvailableRFQsForSupplier(
  supabase: TypedSupabaseClient,
  providerId: string,
  filters?: RFQFilters
): Promise<{ data: RFQSummary[]; error: string | null }> {
  try {
    // Get broadcasts for this provider
    const { data: broadcasts } = await supabase
      .from('rfq_broadcasts')
      .select('rfq_id, delivered_at')
      .eq('provider_id', providerId)
      .not('delivered_at', 'is', null)

    if (!broadcasts || broadcasts.length === 0) {
      return { data: [], error: null }
    }

    const rfqIds = broadcasts.map((b) => b.rfq_id)

    // Get RFQs that are open/bidding and not already responded to
    const { data: existingResponses } = await supabase
      .from('rfq_responses')
      .select('rfq_id')
      .eq('provider_id', providerId)
      .in('rfq_id', rfqIds)

    const respondedRfqIds = new Set((existingResponses || []).map((r) => r.rfq_id))
    const availableRfqIds = rfqIds.filter((id) => !respondedRfqIds.has(id))

    if (availableRfqIds.length === 0) {
      return { data: [], error: null }
    }

    // Get RFQ details
    let query = supabase
      .from('rfqs')
      .select(`
        id,
        title,
        rfq_type,
        status,
        budget_min,
        budget_max,
        deadline,
        category,
        urgency,
        created_at,
        buyer:profiles!rfqs_buyer_id_fkey (
          full_name
        )
      `)
      .in('id', availableRfqIds)
      .in('status', ['Open', 'Bidding'])
      .order('created_at', { ascending: false })

    if (filters?.limit) {
      query = query.limit(filters.limit)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching available RFQs:', error)
      return { data: [], error: 'Failed to fetch RFQs' }
    }

    const rfqs: RFQSummary[] = (data || []).map((rfq) => ({
      id: rfq.id,
      title: rfq.title,
      rfq_type: rfq.rfq_type,
      status: rfq.status as RFQStatus,
      budget_min: rfq.budget_min,
      budget_max: rfq.budget_max,
      deadline: rfq.deadline,
      category: rfq.category,
      urgency: rfq.urgency as 'urgent' | 'standard',
      created_at: rfq.created_at,
      response_count: 0, // Not relevant for supplier view
      buyer: rfq.buyer,
    }))

    return { data: rfqs, error: null }
  } catch (err) {
    console.error('Error in getAvailableRFQsForSupplier:', err)
    return { data: [], error: 'An unexpected error occurred' }
  }
}
