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
  if (params.title.trim().length > 500) {
    return { data: null, error: "Title must be 500 characters or fewer" }
  }

  if (!params.rfq_type) {
    return { data: null, error: "RFQ type is required" }
  }

  if (!['commodity', 'custom', 'service'].includes(params.rfq_type)) {
    return { data: null, error: "Invalid RFQ type" }
  }

  // VALIDATION: Reject oversized specifications (DoS prevention)
  if (params.specifications) {
    const specSize = JSON.stringify(params.specifications).length
    if (specSize > 100_000) {
      return { data: null, error: "Specifications too large (max 100KB)" }
    }
  }

  // VALIDATION: Reject negative/infinite budgets
  if (params.budget_min != null && (!Number.isFinite(params.budget_min) || params.budget_min < 0)) {
    return { data: null, error: "Budget minimum must be a finite non-negative number" }
  }
  if (params.budget_max != null && (!Number.isFinite(params.budget_max) || params.budget_max < 0)) {
    return { data: null, error: "Budget maximum must be a finite non-negative number" }
  }
  if (params.budget_min != null && params.budget_max != null && params.budget_min > params.budget_max) {
    return { data: null, error: "Minimum budget cannot exceed maximum budget" }
  }

  // VALIDATION: Deadline must be a valid future date
  if (params.deadline != null) {
    const deadlineDate = new Date(params.deadline)
    if (isNaN(deadlineDate.getTime())) {
      return { data: null, error: "Invalid deadline date" }
    }
    if (deadlineDate < new Date()) {
      return { data: null, error: "Deadline must be in the future" }
    }
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

  // AUTH: Verify user is the buyer or a broadcast recipient before revealing full details
  const { data: rfqCheck } = await supabase
    .from("rfqs")
    .select("buyer_id")
    .eq("id", rfqId)
    .single()

  if (!rfqCheck) return { data: null, error: "RFQ not found" }

  if (rfqCheck.buyer_id !== user.id) {
    const { data: providerProfile } = await supabase
      .from("provider_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (!providerProfile) return { data: null, error: "Not authorized" }

    const { data: broadcast } = await supabase
      .from("rfq_broadcasts")
      .select("id")
      .eq("rfq_id", rfqId)
      .eq("provider_id", providerProfile.id)
      .single()

    if (!broadcast) return { data: null, error: "Not authorized" }
  }

  const { data, error } = await getRFQService(supabase, rfqId, user.id)

  // SECURITY: Suppliers must not see other suppliers' responses (bid confidentiality)
  // or the buyer's email. Strip sensitive data for non-buyer callers.
  if (data && rfqCheck.buyer_id !== user.id) {
    // Get caller's provider ID to filter to only their own response
    const { data: callerProfile } = await supabase
      .from("provider_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single()

    const callerId = callerProfile?.id
    data.responses = data.responses.filter((r) => r.provider_id === callerId)
    data.broadcasts = []
    data.response_count = data.responses.length
    // Strip buyer email
    if (data.buyer) {
      data.buyer = { ...data.buyer, email: undefined as unknown as string }
    }
  }

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

  // VALIDATION: Title
  if (updates.title !== undefined) {
    if (!updates.title?.trim()) {
      return { success: false, error: "Title is required" }
    }
    if (updates.title.trim().length > 500) {
      return { success: false, error: "Title must be 500 characters or fewer" }
    }
    updates.title = updates.title.trim()
  }
  // VALIDATION: Specifications size
  if (updates.specifications) {
    const specSize = JSON.stringify(updates.specifications).length
    if (specSize > 100_000) {
      return { success: false, error: "Specifications too large (max 100KB)" }
    }
  }
  // VALIDATION: Deadline must be a valid future date
  if (updates.deadline !== undefined && updates.deadline != null) {
    const deadlineDate = new Date(updates.deadline)
    if (isNaN(deadlineDate.getTime())) {
      return { success: false, error: "Invalid deadline date" }
    }
    if (deadlineDate < new Date()) {
      return { success: false, error: "Deadline must be in the future" }
    }
  }
  // VALIDATION: Urgency enum
  if (updates.urgency !== undefined && !['urgent', 'standard'].includes(updates.urgency as string)) {
    return { success: false, error: "Invalid urgency value" }
  }
  // VALIDATION: Budgets
  if (updates.budget_min != null && (!Number.isFinite(updates.budget_min) || updates.budget_min < 0)) {
    return { success: false, error: "Budget minimum must be a finite non-negative number" }
  }
  if (updates.budget_max != null && (!Number.isFinite(updates.budget_max) || updates.budget_max < 0)) {
    return { success: false, error: "Budget maximum must be a finite non-negative number" }
  }
  if (updates.budget_min != null && updates.budget_max != null && updates.budget_min > updates.budget_max) {
    return { success: false, error: "Minimum budget cannot exceed maximum budget" }
  }

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

  if (reason != null && reason.length > 2_000) {
    return { success: false, error: "Cancellation reason too long (max 2,000 characters)" }
  }

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

  // VALIDATION: Numeric fields must be finite and non-negative (Infinity bypasses < 0)
  if (response.quoted_price != null && (!Number.isFinite(response.quoted_price) || response.quoted_price < 0)) {
    return { success: false, error: "Quoted price must be a finite non-negative number" }
  }
  if (response.indicative_min != null && (!Number.isFinite(response.indicative_min) || response.indicative_min < 0)) {
    return { success: false, error: "Indicative minimum must be a finite non-negative number" }
  }
  if (response.indicative_max != null && (!Number.isFinite(response.indicative_max) || response.indicative_max < 0)) {
    return { success: false, error: "Indicative maximum must be a finite non-negative number" }
  }
  if (response.indicative_min != null && response.indicative_max != null && response.indicative_min > response.indicative_max) {
    return { success: false, error: "Indicative minimum cannot exceed maximum" }
  }
  if (response.timeline_weeks != null && (!Number.isFinite(response.timeline_weeks) || response.timeline_weeks < 0)) {
    return { success: false, error: "Timeline weeks must be a finite non-negative number" }
  }
  // VALIDATION: Reject oversized/invalid pricing breakdown
  if (response.pricing_breakdown != null) {
    const keys = Object.keys(response.pricing_breakdown)
    if (keys.length > 20) {
      return { success: false, error: "Too many pricing breakdown items (max 20)" }
    }
    for (const [k, v] of Object.entries(response.pricing_breakdown)) {
      if (k.length > 100) return { success: false, error: "Pricing breakdown key too long" }
      if (v != null && (!Number.isFinite(v) || v < 0)) return { success: false, error: "Pricing breakdown values must be finite non-negative numbers" }
    }
  }
  // VALIDATION: Bound text fields to prevent DoS
  if (response.scope_of_work != null && response.scope_of_work.length > 50_000) {
    return { success: false, error: "Scope of work too large (max 50KB)" }
  }
  if (response.message != null && response.message.length > 10_000) {
    return { success: false, error: "Message too long (max 10,000 characters)" }
  }
  // VALIDATION: valid_until must be a valid future date
  if (response.valid_until != null) {
    const validDate = new Date(response.valid_until)
    if (isNaN(validDate.getTime())) {
      return { success: false, error: "Invalid validity date" }
    }
    if (validDate < new Date()) {
      return { success: false, error: "Validity date must be in the future" }
    }
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
      revalidatePath("/rfq")
      revalidatePath(`/rfq/${rfqId}`)
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
      revalidatePath("/rfq")
      revalidatePath(`/rfq/${rfqId}`)
      return { success: result.success, error: result.error }

    case 'interest': {
      // Express interest with indicative pricing — no race state changes
      // Check RFQ is still accepting responses
      const { data: interestRfq } = await supabase
        .from('rfqs')
        .select('status')
        .eq('id', rfqId)
        .single()

      if (!interestRfq || (interestRfq.status !== 'Open' && interestRfq.status !== 'Bidding')) {
        return { success: false, error: "RFQ is no longer accepting responses" }
      }

      // SECURITY: Verify provider was invited via broadcast
      const { data: interestBroadcast } = await supabase
        .from('rfq_broadcasts')
        .select('id')
        .eq('rfq_id', rfqId)
        .eq('provider_id', providerProfile.id)
        .single()

      if (!interestBroadcast) {
        return { success: false, error: "Not invited to this RFQ" }
      }

      // Check for duplicate response
      const { data: existingInterest } = await supabase
        .from('rfq_responses')
        .select('id')
        .eq('rfq_id', rfqId)
        .eq('provider_id', providerProfile.id)
        .single()

      if (existingInterest) {
        return { success: false, error: "Already responded to this RFQ" }
      }

      const { error: interestError } = await supabase
        .from('rfq_responses')
        .insert({
          rfq_id: rfqId,
          provider_id: providerProfile.id,
          response_type: 'interest',
          message: response.message?.trim() || null,
          indicative_min: response.indicative_min ?? null,
          indicative_max: response.indicative_max ?? null,
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
 * SECURITY: Only the RFQ buyer can see full race details
 */
export async function getRFQRaceStatus(rfqId: string): Promise<{
  data: RaceStatus | null
  error: string | null
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: "Not authenticated" }

  // Verify user is the buyer or a broadcast recipient
  const { data: rfq } = await supabase
    .from("rfqs")
    .select("buyer_id")
    .eq("id", rfqId)
    .single()

  if (!rfq) return { data: null, error: "RFQ not found" }

  if (rfq.buyer_id !== user.id) {
    // Check if supplier was broadcast to
    const { data: providerProfile } = await supabase
      .from("provider_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (!providerProfile) return { data: null, error: "Not authorized" }

    const { data: broadcast } = await supabase
      .from("rfq_broadcasts")
      .select("id")
      .eq("rfq_id", rfqId)
      .eq("provider_id", providerProfile.id)
      .single()

    if (!broadcast) return { data: null, error: "Not authorized" }
  }

  const result = await checkRaceStatus(supabase, rfqId)

  // SECURITY: Strip competitive intelligence from supplier view
  if (result.data && rfq.buyer_id !== user.id) {
    result.data.total_responses = 0
    result.data.accept_count = 0
    result.data.priority_holder = null
    if (result.data.winner) {
      result.data.winner = { id: 'redacted', full_name: null, quoted_price: null }
    }
  }

  return result
}

/**
 * Get matched suppliers for an RFQ (uses same smart matching as broadcast).
 * SECURITY: Only the RFQ buyer can see matched suppliers
 */
export async function getMatchedSuppliers(rfqId: string): Promise<{
  data: SupplierMatch[]
  error: string | null
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: [], error: "Not authenticated" }

  // Verify user is the buyer
  const { data: rfq } = await supabase
    .from("rfqs")
    .select("buyer_id")
    .eq("id", rfqId)
    .single()

  if (!rfq || rfq.buyer_id !== user.id) {
    return { data: [], error: "Not authorized" }
  }

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

  // SECURITY: Only the RFQ owner can duplicate
  if (source.buyer_id !== user.id) {
    return { data: null, error: "Not authorized" }
  }

  // Create a copy (no broadcast)
  const { data: rfq, error: createError } = await createRFQService(
    supabase,
    user.id,
    foundryId,
    {
      title: `[Copy] ${source.title}`.slice(0, 500),
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

  // Update broadcast record — set viewed_at; only set delivered_at if not already set
  const now = new Date().toISOString()
  // First: mark as viewed (always)
  const { error } = await supabase
    .from('rfq_broadcasts')
    .update({ viewed_at: now })
    .eq('rfq_id', rfqId)
    .eq('provider_id', providerProfile.id)
    .is('viewed_at', null)

  // Backfill delivered_at only if missing (don't overwrite existing delivery timestamp)
  await supabase
    .from('rfq_broadcasts')
    .update({ delivered_at: now })
    .eq('rfq_id', rfqId)
    .eq('provider_id', providerProfile.id)
    .is('delivered_at', null)

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

  // SECURITY: Scope to caller's foundry to prevent cross-tenant data leak
  const foundryId = await getFoundryIdCached()
  if (!foundryId) return { data: null, error: "User not in a foundry" }

  // SECURITY: Verify caller has a broadcast relationship with this buyer
  if (user.id !== buyerId) {
    const { data: providerProfile } = await supabase
      .from('provider_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!providerProfile) return { data: null, error: "Not authorized" }

    // Check at least one broadcast from this buyer's RFQs to this provider
    const { data: hasBroadcast } = await supabase
      .from('rfq_broadcasts')
      .select('rfq_id, rfqs!inner(buyer_id)')
      .eq('provider_id', providerProfile.id)
      .eq('rfqs.buyer_id', buyerId)
      .limit(1)

    if (!hasBroadcast || hasBroadcast.length === 0) {
      return { data: null, error: "Not authorized" }
    }
  }

  // Get all RFQs from this buyer within caller's foundry
  const { data: rfqs, error } = await supabase
    .from('rfqs')
    .select('id, status, created_at')
    .eq('buyer_id', buyerId)
    .eq('foundry_id', foundryId)

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

  const trimmedQuestion = question.trim()
  const trimmedAnswer = answer.trim()
  if (!trimmedQuestion) return { success: false, error: "Question is required" }
  if (!trimmedAnswer) return { success: false, error: "Answer is required" }
  if (trimmedQuestion.length > 5_000) return { success: false, error: "Question too long (max 5,000 characters)" }
  if (trimmedAnswer.length > 10_000) return { success: false, error: "Answer too long (max 10,000 characters)" }

  const { error: insertError } = await supabase
    .from("rfq_clarifications")
    .insert({
      rfq_id: rfqId,
      question: trimmedQuestion,
      answer: trimmedAnswer,
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

  // AUTH: Verify user is the buyer or a broadcast recipient
  const { data: rfq } = await supabase
    .from("rfqs")
    .select("buyer_id")
    .eq("id", rfqId)
    .single()

  if (!rfq) return { data: [], error: "RFQ not found" }

  if (rfq.buyer_id !== user.id) {
    const { data: providerProfile } = await supabase
      .from("provider_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (!providerProfile) return { data: [], error: "Not authorized" }

    const { data: broadcast } = await supabase
      .from("rfq_broadcasts")
      .select("id")
      .eq("rfq_id", rfqId)
      .eq("provider_id", providerProfile.id)
      .single()

    if (!broadcast) return { data: [], error: "Not authorized" }
  }

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
