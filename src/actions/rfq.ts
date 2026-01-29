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
  matchSuppliers,
} from "@/lib/rfq/service"
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
  data: { id: string } | null
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
  const { error: broadcastError } = await broadcastRFQ(supabase, rfq.id)
  if (broadcastError) {
    console.error("Failed to broadcast RFQ:", broadcastError)
    // Don't fail the whole operation, RFQ is created
  }

  revalidatePath("/rfq")
  return { data: { id: rfq.id }, error: null }
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
    type: 'accept' | 'decline' | 'info_request'
    quoted_price?: number
    message?: string
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
        response.quoted_price
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
 * Get matched suppliers for an RFQ
 */
export async function getMatchedSuppliers(rfqId: string): Promise<{
  data: SupplierMatch[]
  error: string | null
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: [], error: "Not authenticated" }

  return matchSuppliers(supabase, rfqId)
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
