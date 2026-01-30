"use server"

/**
 * Order Server Actions
 * Server-side actions for order management
 */

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import {
  Order,
  OrderWithDetails,
  OrderStatus,
  OrderSummary,
  CreateOrderParams,
  OrderFilters,
  OrderRole,
  OrderEvent,
} from "@/types/orders"
import {
  createOrder as createOrderService,
  getOrder as getOrderService,
  updateOrderStatus as updateOrderStatusService,
  cancelOrder as cancelOrderService,
  completeOrder as completeOrderService,
  getOrders as getOrdersService,
} from "@/lib/orders/service"
import {
  canTransition,
  getAvailableActions,
  isTerminalStatus,
} from "@/lib/orders/status-machine"
import {
  logOrderEvent,
  getOrderHistoryWithActors,
  buildOrderTimeline,
} from "@/lib/orders/history"

/**
 * Create a new order (buyer action)
 */
export async function createOrder(
  params: CreateOrderParams
): Promise<{ data: Order | null; error: string | null }> {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: "Not authenticated" }
  }

  // Validate required fields
  if (!params.sellerId || !params.orderType || params.totalAmount <= 0) {
    return { data: null, error: "Invalid order parameters" }
  }

  const result = await createOrderService(supabase, user.id, params)

  if (result.data) {
    revalidatePath("/orders")
  }

  return result
}

/**
 * Accept an order (seller action)
 */
export async function acceptOrder(
  orderId: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  // Verify user is the seller
  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("seller_id, status")
    .eq("id", orderId)
    .single()

  if (fetchError || !order) {
    return { success: false, error: "Order not found" }
  }

  // Get provider profile to verify ownership
  const { data: providerProfile } = await supabase
    .from("provider_profiles")
    .select("id, user_id")
    .eq("id", order.seller_id)
    .single()

  if (!providerProfile || providerProfile.user_id !== user.id) {
    return { success: false, error: "Not authorized to accept this order" }
  }

  const result = await updateOrderStatusService(
    supabase,
    orderId,
    "accepted",
    user.id
  )

  if (result.success) {
    revalidatePath("/orders")
    revalidatePath(`/orders/${orderId}`)
  }

  return result
}

/**
 * Decline an order (seller action)
 */
export async function declineOrder(
  orderId: string,
  reason: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  // Verify user is the seller
  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("seller_id, status")
    .eq("id", orderId)
    .single()

  if (fetchError || !order) {
    return { success: false, error: "Order not found" }
  }

  // Get provider profile to verify ownership
  const { data: providerProfile } = await supabase
    .from("provider_profiles")
    .select("id, user_id")
    .eq("id", order.seller_id)
    .single()

  if (!providerProfile || providerProfile.user_id !== user.id) {
    return { success: false, error: "Not authorized to decline this order" }
  }

  // Declining sets status to cancelled with reason logged
  const result = await cancelOrderService(supabase, orderId, reason, user.id)

  if (result.success) {
    // Log the decline event separately
    await logOrderEvent(supabase, orderId, "declined", { reason }, user.id)
    revalidatePath("/orders")
    revalidatePath(`/orders/${orderId}`)
  }

  return result
}

/**
 * Start work on an order (seller action)
 */
export async function startOrder(
  orderId: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  // Verify user is the seller
  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("seller_id, status")
    .eq("id", orderId)
    .single()

  if (fetchError || !order) {
    return { success: false, error: "Order not found" }
  }

  // Get provider profile to verify ownership
  const { data: providerProfile } = await supabase
    .from("provider_profiles")
    .select("id, user_id")
    .eq("id", order.seller_id)
    .single()

  if (!providerProfile || providerProfile.user_id !== user.id) {
    return { success: false, error: "Not authorized to start this order" }
  }

  const result = await updateOrderStatusService(
    supabase,
    orderId,
    "in_progress",
    user.id
  )

  if (result.success) {
    revalidatePath("/orders")
    revalidatePath(`/orders/${orderId}`)
  }

  return result
}

/**
 * Mark order as complete (seller action)
 */
export async function completeOrder(
  orderId: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  // Verify user is the seller
  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("seller_id, status")
    .eq("id", orderId)
    .single()

  if (fetchError || !order) {
    return { success: false, error: "Order not found" }
  }

  // Get provider profile to verify ownership
  const { data: providerProfile } = await supabase
    .from("provider_profiles")
    .select("id, user_id")
    .eq("id", order.seller_id)
    .single()

  if (!providerProfile || providerProfile.user_id !== user.id) {
    return { success: false, error: "Not authorized to complete this order" }
  }

  const result = await completeOrderService(supabase, orderId, user.id)

  if (result.success) {
    revalidatePath("/orders")
    revalidatePath(`/orders/${orderId}`)
  }

  return result
}

/**
 * Approve completion and release payment (buyer action)
 * Generates invoices automatically on completion
 */
export async function approveCompletion(
  orderId: string
): Promise<{ success: boolean; error: string | null; invoiceErrors?: string[] }> {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  // Verify user is the buyer and get order details including escrow status
  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("buyer_id, seller_id, status, escrow_status, total_amount, stripe_payment_intent_id")
    .eq("id", orderId)
    .single()

  if (fetchError || !order) {
    return { success: false, error: "Order not found" }
  }

  if (order.buyer_id !== user.id) {
    return { success: false, error: "Not authorized to approve this order" }
  }

  // Security: Verify order is in correct status for completion
  if (order.status !== "in_progress") {
    return { success: false, error: `Cannot complete order in ${order.status} status` }
  }

  // Security: Verify payment was actually received before releasing escrow
  // Check that escrow is being held (payment was made)
  if (order.escrow_status !== "held") {
    console.error(`[SECURITY] Attempt to release escrow without payment. Order ${orderId}, escrow_status: ${order.escrow_status}`)
    return { 
      success: false, 
      error: "Cannot release payment - escrow is not held. Please ensure payment has been received." 
    }
  }

  // Security: Verify payment intent exists (actual payment was processed)
  if (!order.stripe_payment_intent_id) {
    console.error(`[SECURITY] Attempt to release escrow without payment intent. Order ${orderId}`)
    return { 
      success: false, 
      error: "Cannot release payment - no payment record found." 
    }
  }

  // Update status to completed and release escrow
  const { error: updateError } = await supabase
    .from("orders")
    .update({
      status: "completed",
      escrow_status: "released",
      completed_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    // Additional safety: Only update if escrow is still held (prevent race conditions)
    .eq("escrow_status", "held")

  if (updateError) {
    return { success: false, error: "Failed to approve completion" }
  }

  // Log the approval event
  await logOrderEvent(
    supabase,
    orderId,
    "completed",
    { approved_by: "buyer" },
    user.id
  )

  // Log payment release
  await logOrderEvent(
    supabase,
    orderId,
    "payment_released",
    { released_to: "seller" },
    user.id
  )

  // Generate invoices
  let invoiceErrors: string[] = []
  try {
    const { generateAllOrderInvoices, storeInvoiceDocument } = await import("@/lib/invoicing/generator")
    const { generateAndUploadInvoicePDF } = await import("@/lib/invoicing/pdf")
    
    const invoiceResult = await generateAllOrderInvoices(supabase, orderId)
    
    // Upload PDFs and store references
    for (const invoice of invoiceResult.data) {
      const uploadResult = await generateAndUploadInvoicePDF(supabase, invoice)
      
      if (uploadResult.url) {
        await storeInvoiceDocument(supabase, invoice, uploadResult.url)
      } else {
        invoiceErrors.push(`Failed to upload ${invoice.documentType}: ${uploadResult.error}`)
      }
    }
    
    invoiceErrors = [...invoiceErrors, ...invoiceResult.errors]
    
    // Notify parties of invoice availability
    // Import notification service if available
    try {
      const { sendNotification } = await import("@/lib/notifications/service")
      
      // Notify buyer
      await sendNotification({
        userId: order.buyer_id,
        title: "Invoices Available",
        body: `Invoices for your completed order are now available for download.`,
        actionUrl: `/orders/${orderId}`,
        priority: "medium",
        metadata: { type: "invoice_ready" }
      })
      
      // Get seller user ID
      const { data: sellerProfile } = await supabase
        .from("provider_profiles")
        .select("user_id")
        .eq("id", order.seller_id)
        .single()
      
      if (sellerProfile?.user_id) {
        await sendNotification({
          userId: sellerProfile.user_id,
          title: "Invoices Available",
          body: `Invoices for your completed order are now available for download.`,
          actionUrl: `/orders/${orderId}`,
          priority: "medium",
          metadata: { type: "invoice_ready" }
        })
      }
    } catch {
      // Notification service not available - skip silently
      console.log("Notification service not available, skipping invoice notifications")
    }
  } catch (invoiceErr) {
    console.error("Error generating invoices:", invoiceErr)
    invoiceErrors.push("Failed to generate invoices")
  }

  revalidatePath("/orders")
  revalidatePath(`/orders/${orderId}`)

  return { 
    success: true, 
    error: null,
    invoiceErrors: invoiceErrors.length > 0 ? invoiceErrors : undefined
  }
}

/**
 * Cancel an order (both parties can initiate)
 */
export async function cancelOrder(
  orderId: string,
  reason: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  // Get order and verify user is a participant
  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("buyer_id, seller_id, status")
    .eq("id", orderId)
    .single()

  if (fetchError || !order) {
    return { success: false, error: "Order not found" }
  }

  // Check if user is buyer
  const isBuyer = order.buyer_id === user.id

  // Check if user is seller
  const { data: providerProfile } = await supabase
    .from("provider_profiles")
    .select("id, user_id")
    .eq("id", order.seller_id)
    .single()

  const isSeller = providerProfile?.user_id === user.id

  if (!isBuyer && !isSeller) {
    return { success: false, error: "Not authorized to cancel this order" }
  }

  const result = await cancelOrderService(supabase, orderId, reason, user.id)

  if (result.success) {
    revalidatePath("/orders")
    revalidatePath(`/orders/${orderId}`)
  }

  return result
}

/**
 * Get orders for the current user
 */
export async function getMyOrders(
  role?: OrderRole,
  status?: OrderStatus | OrderStatus[],
  limit: number = 20,
  offset: number = 0
): Promise<{
  data: OrderSummary[]
  error: string | null
  count: number
}> {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: [], error: "Not authenticated", count: 0 }
  }

  const filters: OrderFilters = {
    role,
    status,
    limit,
    offset,
  }

  return getOrdersService(supabase, user.id, filters)
}

/**
 * Search orders by order number
 */
export async function searchOrders(
  search: string,
  role?: OrderRole,
  limit: number = 20
): Promise<{
  data: OrderSummary[]
  error: string | null
  count: number
}> {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: [], error: "Not authenticated", count: 0 }
  }

  const filters: OrderFilters = {
    role,
    search,
    limit,
    offset: 0,
  }

  return getOrdersService(supabase, user.id, filters)
}

/**
 * Get full order details
 */
export async function getOrderDetail(
  orderId: string
): Promise<{
  data: OrderWithDetails | null
  error: string | null
  role: OrderRole | null
}> {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: "Not authenticated", role: null }
  }

  const result = await getOrderService(supabase, orderId)

  if (!result.data) {
    return { data: null, error: result.error, role: null }
  }

  // Determine user's role in this order
  let role: OrderRole | null = null
  if (result.data.buyer_id === user.id) {
    role = "buyer"
  } else if (result.data.seller?.user_id === user.id) {
    role = "seller"
  }

  // If user is not a participant, check if they have admin access
  if (!role) {
    // Could add admin role check here
    return { data: null, error: "Not authorized to view this order", role: null }
  }

  // Get order history/timeline
  let events: OrderEvent[] = []
  const historyResult = await getOrderHistoryWithActors(supabase, orderId)
  
  if (historyResult.data.length === 0) {
    // Fall back to building timeline from order data
    const timelineResult = await buildOrderTimeline(supabase, orderId)
    events = timelineResult.data
  } else {
    events = historyResult.data
  }

  return {
    data: {
      ...result.data,
      events,
    },
    error: null,
    role,
  }
}

/**
 * Get available actions for an order
 */
export async function getOrderActions(
  orderId: string
): Promise<{
  actions: ReturnType<typeof getAvailableActions>
  error: string | null
}> {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { actions: [], error: "Not authenticated" }
  }

  // Get order
  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("buyer_id, seller_id, status")
    .eq("id", orderId)
    .single()

  if (fetchError || !order) {
    return { actions: [], error: "Order not found" }
  }

  // Determine user's role
  let role: OrderRole | null = null
  if (order.buyer_id === user.id) {
    role = "buyer"
  } else {
    const { data: providerProfile } = await supabase
      .from("provider_profiles")
      .select("id, user_id")
      .eq("id", order.seller_id)
      .single()

    if (providerProfile?.user_id === user.id) {
      role = "seller"
    }
  }

  if (!role) {
    return { actions: [], error: "Not a participant in this order" }
  }

  // Check for open disputes
  const { data: disputes } = await supabase
    .from("disputes")
    .select("id")
    .eq("order_id", orderId)
    .not("status", "eq", "resolved")
    .limit(1)

  const hasOpenDispute = (disputes?.length || 0) > 0

  const actions = getAvailableActions(
    order.status as OrderStatus,
    role,
    hasOpenDispute
  )

  return { actions, error: null }
}

/**
 * Open a dispute (buyer action)
 */
export async function openDispute(
  orderId: string,
  reason: string
): Promise<{ success: boolean; disputeId: string | null; error: string | null }> {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, disputeId: null, error: "Not authenticated" }
  }

  // Verify user is the buyer
  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("buyer_id, status")
    .eq("id", orderId)
    .single()

  if (fetchError || !order) {
    return { success: false, disputeId: null, error: "Order not found" }
  }

  if (order.buyer_id !== user.id) {
    return { success: false, disputeId: null, error: "Only buyer can open dispute" }
  }

  if (order.status !== "in_progress") {
    return {
      success: false,
      disputeId: null,
      error: "Can only dispute orders in progress",
    }
  }

  // Create dispute
  const { data: dispute, error: disputeError } = await supabase
    .from("disputes")
    .insert({
      order_id: orderId,
      raised_by: user.id,
      reason,
      status: "open",
    })
    .select()
    .single()

  if (disputeError) {
    return { success: false, disputeId: null, error: "Failed to create dispute" }
  }

  // Update order status
  await supabase
    .from("orders")
    .update({ status: "disputed" })
    .eq("id", orderId)

  // Log the event
  await logOrderEvent(
    supabase,
    orderId,
    "disputed",
    { dispute_id: dispute.id, reason },
    user.id
  )

  revalidatePath("/orders")
  revalidatePath(`/orders/${orderId}`)

  return { success: true, disputeId: dispute.id, error: null }
}

/**
 * Submit a milestone for approval (seller action)
 */
export async function submitMilestone(
  milestoneId: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  // Get milestone with order
  const { data: milestone, error: fetchError } = await supabase
    .from("order_milestones")
    .select("*, order:orders(seller_id)")
    .eq("id", milestoneId)
    .single()

  if (fetchError || !milestone) {
    return { success: false, error: "Milestone not found" }
  }

  // Verify user is the seller
  const { data: providerProfile } = await supabase
    .from("provider_profiles")
    .select("id, user_id")
    .eq("id", milestone.order.seller_id)
    .single()

  if (!providerProfile || providerProfile.user_id !== user.id) {
    return { success: false, error: "Not authorized to submit this milestone" }
  }

  // Update milestone
  const { error: updateError } = await supabase
    .from("order_milestones")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
    })
    .eq("id", milestoneId)

  if (updateError) {
    return { success: false, error: "Failed to submit milestone" }
  }

  // Log the event
  await logOrderEvent(
    supabase,
    milestone.order_id,
    "milestone_submitted",
    { milestone_id: milestoneId, milestone_title: milestone.title },
    user.id
  )

  revalidatePath(`/orders/${milestone.order_id}`)

  return { success: true, error: null }
}

/**
 * Approve a milestone and release payment (buyer action)
 */
export async function approveMilestone(
  milestoneId: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }

  // Get milestone with order
  const { data: milestone, error: fetchError } = await supabase
    .from("order_milestones")
    .select("*, order:orders(buyer_id)")
    .eq("id", milestoneId)
    .single()

  if (fetchError || !milestone) {
    return { success: false, error: "Milestone not found" }
  }

  // Verify user is the buyer
  if (milestone.order.buyer_id !== user.id) {
    return { success: false, error: "Not authorized to approve this milestone" }
  }

  if (milestone.status !== "submitted") {
    return { success: false, error: "Milestone must be submitted before approval" }
  }

  // Update milestone
  const { error: updateError } = await supabase
    .from("order_milestones")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
    })
    .eq("id", milestoneId)

  if (updateError) {
    return { success: false, error: "Failed to approve milestone" }
  }

  // Log the event
  await logOrderEvent(
    supabase,
    milestone.order_id,
    "milestone_approved",
    {
      milestone_id: milestoneId,
      milestone_title: milestone.title,
      amount: milestone.amount,
    },
    user.id
  )

  revalidatePath(`/orders/${milestone.order_id}`)

  return { success: true, error: null }
}
