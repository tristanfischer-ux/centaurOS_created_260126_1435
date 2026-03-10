"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"
import {
  createRFQ as createRFQService,
  getRFQ as getRFQService,
  updateRFQ as updateRFQService,
  cancelRFQ as cancelRFQService,
  closeRFQ as closeRFQService,
  getRFQs,
  getAvailableRFQsForSupplier,
} from "@/lib/rfq/service"
import { matchSuppliersToRFQ } from "@/lib/rfq/matching"
import {
  broadcastRFQ,
  acceptRFQ as acceptRFQRace,
  requestMoreInfo,
  declineRFQ,
  checkRaceStatus,
  awardRFQ as awardRFQRace,
  releasePriorityHold,
} from "@/lib/rfq/race"
import {
  CreateRFQParams,
  UpdateRFQParams,
  RFQFilters,
  RFQRole,
  RFQSummary,
  RFQWithDetails,
  RFQClarification,
  RaceStatus,
  SupplierMatch,
} from "@/types/rfq"

// =============================================
// RFQ CRUD ACTIONS
// =============================================

/**
 * Create a new RFQ and broadcast to suppliers
 */
export async function createNewRFQ(params: CreateRFQParams): Promise<{
  data: { id: string; broadcastCount: number } | null
  error: string | null
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: "Not authenticated" }

  const foundryId = await getFoundryIdCached()
  if (!foundryId) return { data: null, error: "User not in a foundry" }

  // Validate required fields
  if (!params.title?.trim()) {
    return { data: null, error: "Title is required" }
  }

  if (!params.rfq_type) {
    return { data: null, error: "RFQ type is required" }
  }

  // Create the RFQ
  const { data: rfq, error: createError } = await createRFQService(
    supabase,
    user.id,
    foundryId,
    {
      title: params.title.trim(),
      rfq_type: params.rfq_type,
      specifications: params.specifications,
      budget_min: params.budget_min,
      budget_max: params.budget_max,
      deadline: params.deadline,
      category: params.category,
      urgency: params.urgency || 'standard',
    }
  )

  if (createError || !rfq) {
    return { data: null, error: createError || "Failed to create RFQ" }
  }

  // Broadcast to suppliers
  const broadcastResult = await broadcastRFQ(supabase, rfq.id)
  if (broadcastResult.error) {
    console.error("Failed to broadcast RFQ:", broadcastResult.error)
    // Don't fail the whole operation, RFQ is created
  }

  revalidatePath("/rfq")
  return { data: { id: rfq.id, broadcastCount: broadcastResult.broadcast_count }, error: null }
}

/**
 * Get RFQs based on user role
 */
export async function getMyRFQs(
  role: RFQRole,
  filters?: Omit<RFQFilters, 'buyer_id'>
): Promise<{
  data: RFQSummary[]
  count: number
  error: string | null
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: [], count: 0, error: "Not authenticated" }

  const foundryId = await getFoundryIdCached()
  if (!foundryId) return { data: [], count: 0, error: "User not in a foundry" }

  if (role === 'buyer') {
    // Get RFQs where user is the buyer
    const { data, error, count } = await getRFQs(supabase, foundryId, {
      ...filters,
      buyer_id: user.id,
    })

    return { data, count, error }
  } else {
    // Get available RFQs for supplier
    // First, get the user's provider profile
    const { data: providerProfile } = await supabase
      .from('provider_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!providerProfile) {
      return { data: [], count: 0, error: null }
    }

    const { data, error } = await getAvailableRFQsForSupplier(
      supabase,
      providerProfile.id,
      filters
    )

    return { data, count: data.length, error }
  }
}

/**
 * Get full RFQ details
 */
export async function getRFQDetail(rfqId: string): Promise<{
  data: RFQWithDetails | null
  error: string | null
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: "Not authenticated" }

  const { data, error } = await getRFQService(supabase, rfqId, user.id)
  return { data, error }
}

/**
 * Update an RFQ
 */
export async function updateMyRFQ(
  rfqId: string,
  updates: UpdateRFQParams
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Not authenticated" }

  const { error } = await updateRFQService(supabase, rfqId, user.id, updates)

  if (error) {
    return { success: false, error }
  }

  revalidatePath("/rfq")
  revalidatePath(`/rfq/${rfqId}`)
  return { success: true, error: null }
}

/**
 * Cancel an RFQ
 */
export async function cancelMyRFQ(
  rfqId: string,
  reason?: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Not authenticated" }

  const { success, error } = await cancelRFQService(supabase, rfqId, user.id, reason)

  if (success) {
    revalidatePath("/rfq")
    revalidatePath(`/rfq/${rfqId}`)
  }

  return { success, error }
}

/**
 * Close an RFQ
 */
export async function closeMyRFQ(rfqId: string): Promise<{
  success: boolean
  error: string | null
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Not authenticated" }

  const { success, error } = await closeRFQService(supabase, rfqId, user.id)

  if (success) {
    revalidatePath("/rfq")
    revalidatePath(`/rfq/${rfqId}`)
  }

  return { success, error }
}

// =============================================
// RACE ACTIONS
// =============================================

/**
 * Respond to an RFQ (accept, decline, or request info)
 */
export async function respondToRFQ(
  rfqId: string,
  response: {
    type: 'accept' | 'decline' | 'info_request' | 'interest'
    quoted_price?: number
    message?: string
    scope_of_work?: string
    pricing_breakdown?: Record<string, number>
    timeline_weeks?: number
    valid_until?: string
    indicative_min?: number
    indicative_max?: number
  }
): Promise<{
  success: boolean
  awarded?: boolean
  priority_hold?: boolean
  error: string | null
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Not authenticated" }

  // Get provider profile
  const { data: providerProfile } = await supabase
    .from('provider_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!providerProfile) {
    return { success: false, error: "You need a provider profile to respond to RFQs" }
  }

  let result
  switch (response.type) {
    case 'accept':
      result = await acceptRFQRace(
        supabase,
        rfqId,
        providerProfile.id,
        response.quoted_price,
        {
          scope_of_work: response.scope_of_work,
          pricing_breakdown: response.pricing_breakdown,
          timeline_weeks: response.timeline_weeks,
          valid_until: response.valid_until,
        }
      )
      break

    case 'decline':
      result = await declineRFQ(
        supabase,
        rfqId,
        providerProfile.id,
        response.message
      )
      return { success: result.success, error: result.error }

    case 'info_request':
      if (!response.message) {
        return { success: false, error: "Please provide your questions" }
      }
      result = await requestMoreInfo(
        supabase,
        rfqId,
        providerProfile.id,
        response.message
      )
      return { success: result.success, error: result.error }

    case 'interest': {
      // Express interest with indicative pricing — no race state changes
      const { error: interestError } = await supabase
        .from('rfq_responses')
        .insert({
          rfq_id: rfqId,
          provider_id: providerProfile.id,
          response_type: 'interest',
          message: response.message?.trim() || null,
          indicative_min: response.indicative_min || null,
          indicative_max: response.indicative_max || null,
        })

      if (interestError) {
        return { success: false, error: "Failed to express interest" }
      }

      revalidatePath("/rfq")
      revalidatePath(`/rfq/${rfqId}`)
      return { success: true, error: null }
    }

    default:
      return { success: false, error: "Invalid response type" }
  }

  if (result.success) {
    revalidatePath("/rfq")
    revalidatePath(`/rfq/${rfqId}`)
  }

  return {
    success: result.success,
    awarded: result.awarded,
    priority_hold: result.priority_hold,
    error: result.error,
  }
}

/**
 * Award RFQ to a supplier (for custom/service RFQs)
 */
export async function awardRFQToSupplier(
  rfqId: string,
  providerId: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Not authenticated" }

  const { success, error } = await awardRFQRace(supabase, rfqId, providerId, user.id)

  if (success) {
    revalidatePath("/rfq")
    revalidatePath(`/rfq/${rfqId}`)
  }

  return { success, error }
}

/**
 * Release priority hold on an RFQ
 */
export async function releaseRFQPriorityHold(rfqId: string): Promise<{
  success: boolean
  error: string | null
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Not authenticated" }

  const { success, error } = await releasePriorityHold(supabase, rfqId, user.id)

  if (success) {
    revalidatePath("/rfq")
    revalidatePath(`/rfq/${rfqId}`)
  }

  return { success, error }
}

/**
 * Get race status for an RFQ
 */
export async function getRFQRaceStatus(rfqId: string): Promise<{
  data: RaceStatus | null
  error: string | null
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: "Not authenticated" }

  return checkRaceStatus(supabase, rfqId)
}

/**
 * Get matched suppliers for an RFQ (uses same smart matching as broadcast).
 */
export async function getMatchedSuppliers(rfqId: string): Promise<{
  data: SupplierMatch[]
  error: string | null
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: [], error: "Not authenticated" }

  const { matches, error } = await matchSuppliersToRFQ(supabase, rfqId)
  if (error) return { data: [], error }

  const data: SupplierMatch[] = matches.map((m) => ({
    provider_id: m.providerId,
    user_id: m.userId ?? "",
    full_name: m.providerName,
    headline: m.headline ?? null,
    tier: m.tier as SupplierMatch["tier"],
    timezone: m.timezone ?? null,
    match_score: m.matchScore,
    match_reasons: m.matchReasons,
  }))
  return { data, error: null }
}

// =============================================
// DUPLICATE / RE-SEND
// =============================================

/**
 * Duplicate an existing RFQ (creates a new draft copy, no auto-broadcast)
 */
export async function duplicateRFQ(rfqId: string): Promise<{
  data: { id: string } | null
  error: string | null
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: "Not authenticated" }

  const foundryId = await getFoundryIdCached()
  if (!foundryId) return { data: null, error: "User not in a foundry" }

  // Fetch source RFQ
  const { data: source, error: fetchError } = await supabase
    .from('rfqs')
    .select('*')
    .eq('id', rfqId)
    .single()

  if (fetchError || !source) {
    return { data: null, error: "RFQ not found" }
  }

  // Create a copy (no broadcast)
  const { data: rfq, error: createError } = await createRFQService(
    supabase,
    user.id,
    foundryId,
    {
      title: `[Copy] ${source.title}`,
      rfq_type: source.rfq_type,
      specifications: (source.specifications as CreateRFQParams['specifications']) ?? undefined,
      budget_min: source.budget_min,
      budget_max: source.budget_max,
      deadline: null, // Reset deadline for the copy
      category: source.category,
      urgency: 'standard',
    }
  )

  if (createError || !rfq) {
    return { data: null, error: createError || "Failed to duplicate RFQ" }
  }

  revalidatePath("/rfq")
  return { data: { id: rfq.id }, error: null }
}

// =============================================
// BROADCAST ACTIONS
// =============================================

/**
 * Manually trigger broadcast for an RFQ
 */
export async function triggerRFQBroadcast(rfqId: string): Promise<{
  success: boolean
  broadcast_count: number
  error: string | null
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, broadcast_count: 0, error: "Not authenticated" }

  // Verify ownership
  const { data: rfq } = await supabase
    .from('rfqs')
    .select('buyer_id')
    .eq('id', rfqId)
    .single()

  if (!rfq || rfq.buyer_id !== user.id) {
    return { success: false, broadcast_count: 0, error: "Not authorized" }
  }

  const result = await broadcastRFQ(supabase, rfqId)

  if (result.success) {
    revalidatePath(`/rfq/${rfqId}`)
  }

  return result
}

/**
 * Mark an RFQ broadcast as viewed
 */
export async function markRFQViewed(rfqId: string): Promise<{
  success: boolean
  error: string | null
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Not authenticated" }

  // Get provider profile
  const { data: providerProfile } = await supabase
    .from('provider_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!providerProfile) {
    return { success: false, error: "No provider profile" }
  }

  // Update broadcast record
  const { error } = await supabase
    .from('rfq_broadcasts')
    .update({
      viewed_at: new Date().toISOString(),
      delivered_at: new Date().toISOString(),
    })
    .eq('rfq_id', rfqId)
    .eq('provider_id', providerProfile.id)
    .is('viewed_at', null)

  if (error) {
    console.error("Error marking RFQ viewed:", error)
    return { success: false, error: "Failed to update" }
  }

  return { success: true, error: null }
}

// =============================================
// UTILITY ACTIONS
// =============================================

/**
 * Check if user is a provider
 */
export async function checkIsProvider(): Promise<{
  isProvider: boolean
  providerId: string | null
  error: string | null
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { isProvider: false, providerId: null, error: "Not authenticated" }

  const { data: providerProfile } = await supabase
    .from('provider_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  return {
    isProvider: !!providerProfile,
    providerId: providerProfile?.id || null,
    error: null,
  }
}

/**
 * Get buyer context stats for supplier view (Feature 19)
 */
export async function getBuyerContext(buyerId: string): Promise<{
  data: {
    totalRfqs: number
    awardedRfqs: number
    awardRate: number
    avgDecisionDays: number | null
  } | null
  error: string | null
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: "Not authenticated" }

  // Get all RFQs from this buyer
  const { data: rfqs, error } = await supabase
    .from('rfqs')
    .select('id, status, created_at')
    .eq('buyer_id', buyerId)

  if (error || !rfqs) {
    return { data: null, error: error?.message || "Failed to fetch" }
  }

  const totalRfqs = rfqs.length
  const awardedRfqs = rfqs.filter((r) => r.status === 'Awarded').length
  const awardRate = totalRfqs > 0 ? Math.round((awardedRfqs / totalRfqs) * 100) : 0

  // Estimate avg decision time from response timestamps on awarded RFQs
  let avgDecisionDays: number | null = null
  if (awardedRfqs > 0) {
    const awardedIds = rfqs.filter((r) => r.status === 'Awarded').map((r) => r.id)
    const { data: responses } = await supabase
      .from('rfq_responses')
      .select('rfq_id, responded_at')
      .in('rfq_id', awardedIds)
      .eq('response_type', 'accept')
      .order('responded_at', { ascending: true })

    if (responses && responses.length > 0) {
      // Use first accept response time minus creation time as proxy for decision time
      const rfqMap = new Map(rfqs.filter((r) => r.created_at).map((r) => [r.id, r.created_at!]))
      let totalDays = 0
      let count = 0
      const seen = new Set<string>()
      for (const resp of responses) {
        if (seen.has(resp.rfq_id)) continue
        seen.add(resp.rfq_id)
        const created = rfqMap.get(resp.rfq_id)
        if (created && resp.responded_at) {
          totalDays += (new Date(resp.responded_at).getTime() - new Date(created).getTime()) / (1000 * 60 * 60 * 24)
          count++
        }
      }
      if (count > 0) {
        avgDecisionDays = Math.round(totalDays / count)
      }
    }
  }

  return {
    data: { totalRfqs, awardedRfqs, awardRate, avgDecisionDays },
    error: null,
  }
}

/**
 * Get RFQ counts by status for dashboard
 */
export async function getRFQCounts(): Promise<{
  data: {
    open: number
    bidding: number
    awarded: number
    closed: number
    total: number
  } | null
  error: string | null
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: "Not authenticated" }

  const foundryId = await getFoundryIdCached()
  if (!foundryId) return { data: null, error: "User not in a foundry" }

  const { data: rfqs, error } = await supabase
    .from('rfqs')
    .select('status')
    .eq('foundry_id', foundryId)
    .eq('buyer_id', user.id)

  if (error) {
    console.error("Error fetching RFQ counts:", error)
    return { data: null, error: "Failed to fetch counts" }
  }

  const counts = {
    open: 0,
    bidding: 0,
    awarded: 0,
    closed: 0,
    total: rfqs?.length || 0,
  }

  for (const rfq of rfqs || []) {
    switch (rfq.status) {
      case 'Open':
        counts.open++
        break
      case 'Bidding':
      case 'priority_hold':
        counts.bidding++
        break
      case 'Awarded':
        counts.awarded++
        break
      case 'Closed':
      case 'cancelled':
        counts.closed++
        break
    }
  }

  return { data: counts, error: null }
}

// =============================================
// CLARIFICATION ACTIONS (Feature 16)
// =============================================

/**
 * Publish a clarification Q&A for an RFQ (buyer only)
 */
export async function publishClarification(
  rfqId: string,
  question: string,
  answer: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Not authenticated" }

  // Verify user owns this RFQ
  const { data: rfq } = await supabase
    .from("rfqs")
    .select("buyer_id")
    .eq("id", rfqId)
    .single()

  if (!rfq || rfq.buyer_id !== user.id) {
    return { success: false, error: "Not authorized" }
  }

  const { error: insertError } = await supabase
    .from("rfq_clarifications")
    .insert({
      rfq_id: rfqId,
      question: question.trim(),
      answer: answer.trim(),
      answered_at: new Date().toISOString(),
      answered_by: user.id,
    })

  if (insertError) {
    console.error("Error publishing clarification:", insertError)
    return { success: false, error: "Failed to publish clarification" }
  }

  revalidatePath(`/rfq/${rfqId}`)
  return { success: true, error: null }
}

/**
 * Get all clarifications for an RFQ
 */
export async function getRFQClarifications(
  rfqId: string
): Promise<{ data: RFQClarification[]; error: string | null }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: [], error: "Not authenticated" }

  const { data, error } = await supabase
    .from("rfq_clarifications")
    .select("*")
    .eq("rfq_id", rfqId)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("Error fetching clarifications:", error)
    return { data: [], error: "Failed to fetch clarifications" }
  }

  return { data: (data || []) as RFQClarification[], error: null }
}
