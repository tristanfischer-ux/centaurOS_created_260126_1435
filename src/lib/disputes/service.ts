/**
 * Dispute Resolution Service
 * Handles dispute creation, workflow, and resolution
 */

import { SupabaseClient } from "@supabase/supabase-js"
import { Database } from "@/types/database.types"
import { processRefund, releaseEscrow, getEscrowBalance } from "@/lib/stripe/escrow"

// Types
// Note: "cancelled" is used in business logic but may not be in the database enum
// Database writes should use (supabase as any) to bypass type checking
export type DisputeStatus =
  | "open"
  | "under_review"
  | "mediation"
  | "arbitration"
  | "resolved"
  | "escalated"
  | "cancelled"

export interface Dispute {
  id: string
  order_id: string
  raised_by: string
  reason: string
  evidence_urls: string[]
  status: DisputeStatus
  resolution: string | null
  resolution_amount: number | null
  assigned_to: string | null
  resolved_at: string | null
  created_at: string
}

export interface DisputeWithDetails extends Dispute {
  order?: {
    order_number: string
    total_amount: number
    buyer_id: string
    seller_id: string
    status: string
  }
  raiser?: {
    full_name: string | null
    email: string
  }
  assignee?: {
    full_name: string | null
    email: string
  }
  events?: DisputeEvent[]
}

export interface DisputeEvent {
  id: string
  dispute_id: string
  event_type: string
  description: string
  actor_id: string | null
  actor_name: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface CreateDisputeParams {
  orderId: string
  reason: string
  evidenceUrls?: string[]
  description?: string
}

export interface ResolveDisputeParams {
  resolution: string
  resolutionAmount?: number
  buyerRefundPercent?: number
  sellerPaymentPercent?: number
}

// Dispute status workflow
const VALID_TRANSITIONS: Record<DisputeStatus, DisputeStatus[]> = {
  open: ["under_review", "cancelled"],
  under_review: ["mediation", "resolved", "escalated"],
  mediation: ["resolved", "arbitration", "escalated"],
  arbitration: ["resolved", "escalated"],
  resolved: [],
  escalated: ["resolved"],
  cancelled: [],
}

// Auto-resolution criteria
const AUTO_RESOLUTION_RULES = {
  // Buyer wins automatically if seller doesn't respond in X days
  sellerNoResponseDays: 7,
  // Seller wins if buyer provides no evidence and dispute is vague
  noEvidenceAutoReject: true,
  // Minimum evidence items for auto-processing
  minEvidenceItems: 1,
}

/**
 * Create a new dispute
 */
export async function createDispute(
  supabase: SupabaseClient<Database>,
  userId: string,
  params: CreateDisputeParams
): Promise<{ data: Dispute | null; error: string | null }> {
  const { orderId, reason, evidenceUrls = [] } = params

  // Validate order exists and user is a party
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, buyer_id, seller_id, status, total_amount")
    .eq("id", orderId)
    .single()

  if (orderError || !order) {
    return { data: null, error: "Order not found" }
  }

  // Check if user is buyer or seller
  const isBuyer = order.buyer_id === userId
  let isSeller = false

  if (!isBuyer) {
    // Check if user is seller via provider profile
    const { data: sellerProfile } = await supabase
      .from("provider_profiles")
      .select("user_id")
      .eq("id", order.seller_id)
      .single()

    isSeller = sellerProfile?.user_id === userId
  }

  if (!isBuyer && !isSeller) {
    return { data: null, error: "Only order participants can raise disputes" }
  }

  // Check order status - can only dispute active orders
  const disputeableStatuses = ["accepted", "in_progress", "completed"]
  if (!disputeableStatuses.includes(order.status)) {
    return {
      data: null,
      error: `Cannot dispute orders with status: ${order.status}`,
    }
  }

  // Check if there's already an open dispute for this order
  const { data: existingDispute } = await supabase
    .from("disputes")
    .select("id, status")
    .eq("order_id", orderId)
    .not("status", "in", '("resolved","cancelled")')
    .single()

  if (existingDispute) {
    return { data: null, error: "An active dispute already exists for this order" }
  }

  // Create dispute
  const { data, error } = await supabase
    .from("disputes")
    .insert({
      order_id: orderId,
      raised_by: userId,
      reason,
      evidence_urls: evidenceUrls,
      status: "open",
    })
    .select()
    .single()

  if (error) {
    return { data: null, error: error.message }
  }

  // Update order status to disputed
  await supabase.from("orders").update({ status: "disputed" }).eq("id", orderId)

  // Log dispute creation event
  await logDisputeEvent(supabase, data.id, "dispute_created", "Dispute opened", userId, {
    reason,
    evidence_count: evidenceUrls.length,
  })

  return { data: data as Dispute, error: null }
}

/**
 * Get dispute by ID
 */
export async function getDispute(
  supabase: SupabaseClient<Database>,
  disputeId: string,
  userId?: string
): Promise<{ data: DisputeWithDetails | null; error: string | null }> {
  const { data, error } = await supabase
    .from("disputes")
    .select(
      `
      *,
      order:orders!disputes_order_id_fkey(
        order_number,
        total_amount,
        buyer_id,
        seller_id,
        status
      ),
      raiser:profiles!disputes_raised_by_fkey(
        full_name,
        email
      ),
      assignee:profiles!disputes_assigned_to_fkey(
        full_name,
        email
      )
    `
    )
    .eq("id", disputeId)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }

  // If userId provided, verify access
  if (userId) {
    const order = data.order as DisputeWithDetails["order"]
    const isParty =
      order?.buyer_id === userId ||
      data.raised_by === userId ||
      data.assigned_to === userId

    if (!isParty) {
      // Check if user is the seller
      const { data: sellerProfile } = await supabase
        .from("provider_profiles")
        .select("user_id")
        .eq("id", order?.seller_id)
        .single()

      if (sellerProfile?.user_id !== userId) {
        return { data: null, error: "Not authorized to view this dispute" }
      }
    }
  }

  // Get dispute events/timeline
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: events } = await (supabase as any)
    .from("dispute_events")
    .select("*")
    .eq("dispute_id", disputeId)
    .order("created_at", { ascending: true })

  return {
    data: {
      ...(data as Dispute),
      order: data.order as DisputeWithDetails["order"],
      raiser: data.raiser as DisputeWithDetails["raiser"],
      assignee: data.assignee as DisputeWithDetails["assignee"],
      events: (events as DisputeEvent[]) || [],
    },
    error: null,
  }
}

/**
 * Update dispute status
 */
export async function updateDisputeStatus(
  supabase: SupabaseClient<Database>,
  disputeId: string,
  newStatus: DisputeStatus,
  actorId: string,
  notes?: string
): Promise<{ success: boolean; error: string | null }> {
  // Get current status
  const { data: dispute, error: fetchError } = await supabase
    .from("disputes")
    .select("status")
    .eq("id", disputeId)
    .single()

  if (fetchError || !dispute) {
    return { success: false, error: "Dispute not found" }
  }

  const currentStatus = dispute.status as DisputeStatus

  // Validate transition
  if (!VALID_TRANSITIONS[currentStatus]?.includes(newStatus)) {
    return {
      success: false,
      error: `Cannot transition from ${currentStatus} to ${newStatus}`,
    }
  }

  // Update status
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (supabase as any)
    .from("disputes")
    .update({ status: newStatus as string })
    .eq("id", disputeId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  // Log status change
  await logDisputeEvent(
    supabase,
    disputeId,
    "status_changed",
    notes || `Status changed from ${currentStatus} to ${newStatus}`,
    actorId,
    { from: currentStatus, to: newStatus }
  )

  return { success: true, error: null }
}

/**
 * Assign dispute to admin
 */
export async function assignDispute(
  supabase: SupabaseClient<Database>,
  disputeId: string,
  adminId: string,
  assignedBy: string
): Promise<{ success: boolean; error: string | null }> {
  // Verify admin exists
  const { data: admin, error: adminError } = await supabase
    .from("admin_users")
    .select("id, user:profiles!admin_users_user_id_fkey(full_name)")
    .eq("user_id", adminId)
    .single()

  if (adminError || !admin) {
    return { success: false, error: "Admin user not found" }
  }

  // Update dispute
  const { error: updateError } = await supabase
    .from("disputes")
    .update({
      assigned_to: adminId,
      status: "under_review",
    })
    .eq("id", disputeId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  // Log assignment
  const adminName = (admin.user as { full_name: string | null })?.full_name || "Admin"
  await logDisputeEvent(
    supabase,
    disputeId,
    "assigned",
    `Dispute assigned to ${adminName}`,
    assignedBy,
    { assigned_to: adminId }
  )

  return { success: true, error: null }
}

/**
 * Resolve a dispute
 * Now includes actual execution of refunds/payments based on resolution
 */
export async function resolveDispute(
  supabase: SupabaseClient<Database>,
  disputeId: string,
  resolverId: string,
  params: ResolveDisputeParams
): Promise<{ success: boolean; error: string | null; paymentDetails?: { refundId?: string; transferId?: string } }> {
  const { resolution, resolutionAmount, buyerRefundPercent, sellerPaymentPercent } = params

  // Get dispute with order details
  const { data: dispute, error: fetchError } = await supabase
    .from("disputes")
    .select(
      `
      *,
      order:orders!disputes_order_id_fkey(id, total_amount, escrow_status, stripe_payment_intent_id)
    `
    )
    .eq("id", disputeId)
    .single()

  if (fetchError || !dispute) {
    return { success: false, error: "Dispute not found" }
  }

  // Validate current status allows resolution
  const currentStatus = dispute.status as DisputeStatus
  if (!["under_review", "mediation", "arbitration", "escalated"].includes(currentStatus)) {
    return { success: false, error: `Cannot resolve dispute in ${currentStatus} status` }
  }

  const order = dispute.order as { 
    id: string
    total_amount: number 
    escrow_status: string
    stripe_payment_intent_id: string | null
  }
  
  // Calculate resolution amounts
  const orderTotal = order.total_amount || 0
  let buyerRefundAmount = resolutionAmount
  if (buyerRefundPercent !== undefined && !buyerRefundAmount) {
    buyerRefundAmount = Math.round(orderTotal * (buyerRefundPercent / 100))
  }
  
  const sellerPaymentAmount = sellerPaymentPercent !== undefined 
    ? Math.round(orderTotal * (sellerPaymentPercent / 100))
    : (buyerRefundPercent !== undefined ? orderTotal - (buyerRefundAmount || 0) : 0)

  let refundId: string | undefined
  let transferId: string | undefined

  // EXECUTE ACTUAL FINANCIAL TRANSACTIONS
  try {
    // Step 1: Process buyer refund if any
    if (buyerRefundAmount && buyerRefundAmount > 0) {
      // Check if funds are still in escrow
      if (order.escrow_status === 'released') {
        return { 
          success: false, 
          error: "Cannot refund - funds have already been released to the seller. Manual intervention required." 
        }
      }

      if (!order.stripe_payment_intent_id) {
        return { 
          success: false, 
          error: "Cannot refund - no payment intent found for this order." 
        }
      }

      const refundResult = await processRefund({
        orderId: order.id,
        amount: buyerRefundAmount,
        reason: `Dispute resolution: ${resolution}`,
      })

      if (refundResult.error || !refundResult.refund) {
        return { 
          success: false, 
          error: `Failed to process refund: ${refundResult.error}` 
        }
      }

      refundId = refundResult.refund.id
      console.log(`Dispute ${disputeId}: Refunded ${buyerRefundAmount} to buyer (Refund ID: ${refundId})`)
    }

    // Step 2: Release remaining funds to seller if any
    if (sellerPaymentAmount && sellerPaymentAmount > 0 && order.escrow_status !== 'released') {
      // Get available escrow balance
      const balanceResult = await getEscrowBalance(order.id)
      
      if (!balanceResult.error && balanceResult.balance && balanceResult.balance > 0) {
        // Release remaining balance to seller (up to seller payment amount)
        const releaseAmount = Math.min(sellerPaymentAmount, balanceResult.balance)
        
        if (releaseAmount > 0) {
          const releaseResult = await releaseEscrow({
            orderId: order.id,
            amount: releaseAmount,
          })

          if (releaseResult.error) {
            // Log but don't fail - refund already processed
            console.error(`Dispute ${disputeId}: Failed to release to seller: ${releaseResult.error}`)
          } else if (releaseResult.transfer) {
            transferId = releaseResult.transfer.id
            console.log(`Dispute ${disputeId}: Released ${releaseAmount} to seller (Transfer ID: ${transferId})`)
          }
        }
      }
    }

  } catch (err) {
    console.error('Error processing dispute resolution payments:', err)
    return { 
      success: false, 
      error: `Payment processing failed: ${err instanceof Error ? err.message : 'Unknown error'}` 
    }
  }

  // Update dispute record
  const { error: updateError } = await supabase
    .from("disputes")
    .update({
      status: "resolved",
      resolution,
      resolution_amount: buyerRefundAmount || null,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", disputeId)

  if (updateError) {
    // Log payment details even if DB update fails
    console.error('Dispute DB update failed but payments processed:', { refundId, transferId })
    return { success: false, error: updateError.message }
  }

  // Determine final order status
  let newOrderStatus: string
  let newEscrowStatus: string
  
  if (buyerRefundPercent === 100) {
    newOrderStatus = 'cancelled'
    newEscrowStatus = 'refunded'
  } else if (sellerPaymentPercent === 100 || (buyerRefundPercent === 0 && !buyerRefundAmount)) {
    newOrderStatus = 'completed'
    newEscrowStatus = 'released'
  } else {
    // Split resolution
    newOrderStatus = 'completed'
    newEscrowStatus = buyerRefundAmount ? 'refunded' : 'released'
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("orders")
    .update({ 
      status: newOrderStatus,
      escrow_status: newEscrowStatus,
    })
    .eq("id", dispute.order_id)

  // Log resolution with payment details
  await logDisputeEvent(
    supabase,
    disputeId,
    "resolved",
    resolution,
    resolverId,
    {
      resolution_amount: buyerRefundAmount,
      buyer_refund_percent: buyerRefundPercent,
      seller_payment_percent: sellerPaymentPercent,
      refund_id: refundId,
      transfer_id: transferId,
      payments_executed: true,
    }
  )

  return { 
    success: true, 
    error: null,
    paymentDetails: { refundId, transferId }
  }
}

/**
 * Add evidence to dispute
 */
export async function addDisputeEvidence(
  supabase: SupabaseClient<Database>,
  disputeId: string,
  userId: string,
  evidenceUrls: string[],
  description?: string
): Promise<{ success: boolean; error: string | null }> {
  // Get current dispute
  const { data: dispute, error: fetchError } = await supabase
    .from("disputes")
    .select("evidence_urls, status, raised_by, order:orders!disputes_order_id_fkey(buyer_id, seller_id)")
    .eq("id", disputeId)
    .single()

  if (fetchError || !dispute) {
    return { success: false, error: "Dispute not found" }
  }

  // Verify user is a party
  const order = dispute.order as { buyer_id: string; seller_id: string }
  const isParty =
    dispute.raised_by === userId ||
    order.buyer_id === userId

  // Check if user is seller
  let isSeller = false
  if (!isParty) {
    const { data: sellerProfile } = await supabase
      .from("provider_profiles")
      .select("user_id")
      .eq("id", order.seller_id)
      .single()

    isSeller = sellerProfile?.user_id === userId
  }

  if (!isParty && !isSeller) {
    return { success: false, error: "Not authorized to add evidence" }
  }

  // Check status allows evidence submission
  const allowedStatuses: DisputeStatus[] = ["open", "under_review", "mediation"]
  if (!allowedStatuses.includes(dispute.status as DisputeStatus)) {
    return { success: false, error: "Cannot add evidence in current status" }
  }

  // Merge evidence
  const existingUrls = dispute.evidence_urls || []
  const newUrls = [...existingUrls, ...evidenceUrls]

  // Update dispute
  const { error: updateError } = await supabase
    .from("disputes")
    .update({ evidence_urls: newUrls })
    .eq("id", disputeId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  // Log evidence addition
  await logDisputeEvent(
    supabase,
    disputeId,
    "evidence_added",
    description || `${evidenceUrls.length} file(s) added as evidence`,
    userId,
    { new_files: evidenceUrls }
  )

  return { success: true, error: null }
}

/**
 * Get disputes for a user
 */
export async function getUserDisputes(
  supabase: SupabaseClient<Database>,
  userId: string,
  options: {
    status?: DisputeStatus[]
    limit?: number
    offset?: number
  } = {}
): Promise<{
  data: DisputeWithDetails[]
  error: string | null
  total: number
}> {
  const { status, limit = 20, offset = 0 } = options

  // Get orders where user is buyer or seller
  const { data: buyerOrders } = await supabase
    .from("orders")
    .select("id")
    .eq("buyer_id", userId)

  const { data: sellerProfile } = await supabase
    .from("provider_profiles")
    .select("id")
    .eq("user_id", userId)
    .single()

  const { data: sellerOrders } = sellerProfile
    ? await supabase
        .from("orders")
        .select("id")
        .eq("seller_id", sellerProfile.id)
    : { data: [] }

  const orderIds = [
    ...(buyerOrders || []).map((o) => o.id),
    ...(sellerOrders || []).map((o) => o.id),
  ]

  if (orderIds.length === 0) {
    return { data: [], error: null, total: 0 }
  }

  // Query disputes
  let query = supabase
    .from("disputes")
    .select(
      `
      *,
      order:orders!disputes_order_id_fkey(
        order_number,
        total_amount,
        buyer_id,
        seller_id,
        status
      ),
      raiser:profiles!disputes_raised_by_fkey(
        full_name,
        email
      )
    `,
      { count: "exact" }
    )
    .in("order_id", orderIds)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (status && status.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query = query.in("status", status as any)
  }

  const { data, error, count } = await query

  if (error) {
    return { data: [], error: error.message, total: 0 }
  }

  return {
    data: (data || []) as DisputeWithDetails[],
    error: null,
    total: count || 0,
  }
}

/**
 * Check for auto-resolution criteria
 */
export async function checkAutoResolution(
  supabase: SupabaseClient<Database>,
  disputeId: string
): Promise<{
  shouldAutoResolve: boolean
  resolution: ResolveDisputeParams | null
  reason: string | null
}> {
  const { data: dispute, error } = await supabase
    .from("disputes")
    .select(
      `
      *,
      order:orders!disputes_order_id_fkey(
        total_amount,
        seller_id
      )
    `
    )
    .eq("id", disputeId)
    .single()

  if (error || !dispute) {
    return { shouldAutoResolve: false, resolution: null, reason: "Dispute not found" }
  }

  const daysSinceCreated = Math.floor(
    (Date.now() - new Date(dispute.created_at).getTime()) / (1000 * 60 * 60 * 24)
  )

  // Check: No seller response after threshold
  if (daysSinceCreated >= AUTO_RESOLUTION_RULES.sellerNoResponseDays) {
    // Check if seller has responded (any events from seller)
    const order = dispute.order as { seller_id: string; total_amount: number }

    const { data: sellerProfile } = await supabase
      .from("provider_profiles")
      .select("user_id")
      .eq("id", order.seller_id)
      .single()

    if (sellerProfile) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count: sellerResponses } = await (supabase as any)
        .from("dispute_events")
        .select("*", { count: "exact", head: true })
        .eq("dispute_id", disputeId)
        .eq("actor_id", sellerProfile.user_id)

      if ((sellerResponses || 0) === 0) {
        return {
          shouldAutoResolve: true,
          resolution: {
            resolution: `Auto-resolved: Seller did not respond within ${AUTO_RESOLUTION_RULES.sellerNoResponseDays} days`,
            buyerRefundPercent: 100,
          },
          reason: "seller_no_response",
        }
      }
    }
  }

  // Check: No evidence provided and dispute is vague
  if (
    AUTO_RESOLUTION_RULES.noEvidenceAutoReject &&
    dispute.evidence_urls.length < AUTO_RESOLUTION_RULES.minEvidenceItems &&
    dispute.reason.length < 50
  ) {
    return {
      shouldAutoResolve: true,
      resolution: {
        resolution: "Auto-resolved: Insufficient evidence and description provided",
        buyerRefundPercent: 0,
      },
      reason: "insufficient_evidence",
    }
  }

  return { shouldAutoResolve: false, resolution: null, reason: null }
}

/**
 * Get dispute statistics
 */
export async function getDisputeStats(
  supabase: SupabaseClient<Database>
): Promise<{
  data: {
    total: number
    open: number
    resolved: number
    averageResolutionDays: number
    byStatus: Record<DisputeStatus, number>
  } | null
  error: string | null
}> {
  const { data: disputes, error } = await supabase
    .from("disputes")
    .select("status, created_at, resolved_at")

  if (error) {
    return { data: null, error: error.message }
  }

  const byStatus: Record<DisputeStatus, number> = {
    open: 0,
    under_review: 0,
    mediation: 0,
    arbitration: 0,
    resolved: 0,
    escalated: 0,
    cancelled: 0,
  }

  let totalResolutionDays = 0
  let resolvedCount = 0

  for (const d of disputes || []) {
    const status = d.status as DisputeStatus
    byStatus[status]++

    if (d.resolved_at) {
      const days = Math.floor(
        (new Date(d.resolved_at).getTime() - new Date(d.created_at).getTime()) /
          (1000 * 60 * 60 * 24)
      )
      totalResolutionDays += days
      resolvedCount++
    }
  }

  return {
    data: {
      total: disputes?.length || 0,
      open: byStatus.open + byStatus.under_review + byStatus.mediation + byStatus.arbitration,
      resolved: byStatus.resolved,
      averageResolutionDays:
        resolvedCount > 0 ? Math.round(totalResolutionDays / resolvedCount) : 0,
      byStatus,
    },
    error: null,
  }
}

// Helper function to log dispute events
async function logDisputeEvent(
  supabase: SupabaseClient<Database>,
  disputeId: string,
  eventType: string,
  description: string,
  actorId: string | null,
  metadata?: Record<string, unknown>
): Promise<void> {
  // Get actor name
  let actorName: string | null = null
  if (actorId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", actorId)
      .single()
    actorName = profile?.full_name || null
  }

  // The dispute_events table may not exist yet - try to insert
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("dispute_events").insert({
      dispute_id: disputeId,
      event_type: eventType,
      description,
      actor_id: actorId,
      actor_name: actorName,
      metadata: metadata || null,
    })
  } catch {
    // Table may not exist - that's okay for now
    console.log("Note: dispute_events table may not exist")
  }
}
