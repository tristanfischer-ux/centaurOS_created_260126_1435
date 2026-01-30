'use server'


/**
 * Milestone Server Actions
 * Server-side actions for milestone operations in the marketplace
 */

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  createMilestones as createMilestonesService,
  getMilestones as getMilestonesService,
  submitMilestone as submitMilestoneService,
  approveMilestone as approveMilestoneService,
  disputeMilestone as disputeMilestoneService,
} from '@/lib/payments/milestones'
import { Milestone, MilestoneInput } from '@/types/payments'

/**
 * Result type for server actions
 */
type ActionResult<T> = { data: T; error: null } | { data: null; error: string }

/**
 * Creates milestones for an order
 * @param orderId - The order ID
 * @param milestones - Array of milestone definitions
 * @returns Created milestones
 */
export async function createMilestones(
  orderId: string,
  milestones: MilestoneInput[]
): Promise<ActionResult<Milestone[]>> {
  try {
    const supabase = await createClient()

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { data: null, error: 'Not authenticated' }
    }

    // Get order and verify access
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        buyer_id,
        seller_id,
        status,
        seller:provider_profiles!orders_seller_id_fkey(user_id)
      `)
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return { data: null, error: orderError?.message || 'Order not found' }
    }

    const seller = order.seller as unknown as { user_id: string }

    // Only buyer or seller can create milestones
    if (order.buyer_id !== user.id && seller?.user_id !== user.id) {
      return { data: null, error: 'Only the buyer or seller can create milestones' }
    }

    // Check order status - can only create milestones for pending or accepted orders
    if (order.status !== 'pending' && order.status !== 'accepted') {
      return {
        data: null,
        error: `Cannot create milestones for order with status '${order.status}'`,
      }
    }

    // Validate milestones
    if (!milestones || milestones.length === 0) {
      return { data: null, error: 'At least one milestone is required' }
    }

    // Validate each milestone has required fields
    for (const m of milestones) {
      if (!m.title || m.title.trim().length === 0) {
        return { data: null, error: 'Each milestone must have a title' }
      }
      if (typeof m.amount !== 'number' || m.amount <= 0) {
        return { data: null, error: 'Each milestone must have a positive amount' }
      }
    }

    // Create the milestones
    const result = await createMilestonesService(orderId, milestones)

    if (result.error || !result.milestones) {
      return { data: null, error: result.error || 'Failed to create milestones' }
    }

    revalidatePath(`/marketplace/orders/${orderId}`)
    revalidatePath(`/provider-portal/orders/${orderId}`)

    return { data: result.milestones, error: null }
  } catch (error) {
    console.error('Error creating milestones:', error)
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Failed to create milestones',
    }
  }
}

/**
 * Updates the milestone structure for an order
 * This replaces all existing milestones - only allowed before any are submitted
 * @param orderId - The order ID
 * @param milestones - New milestone definitions
 * @returns Updated milestones
 */
export async function updateMilestones(
  orderId: string,
  milestones: MilestoneInput[]
): Promise<ActionResult<Milestone[]>> {
  try {
    const supabase = await createClient()

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { data: null, error: 'Not authenticated' }
    }

    // Get order and verify access
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        buyer_id,
        seller_id,
        status,
        total_amount,
        seller:provider_profiles!orders_seller_id_fkey(user_id)
      `)
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return { data: null, error: orderError?.message || 'Order not found' }
    }

    const seller = order.seller as unknown as { user_id: string }

    // Only buyer or seller can update milestones
    if (order.buyer_id !== user.id && seller?.user_id !== user.id) {
      return { data: null, error: 'Only the buyer or seller can update milestones' }
    }

    // Check existing milestones
    const { data: existingMilestones } = await supabase
      .from('order_milestones')
      .select('id, status')
      .eq('order_id', orderId)

    if (existingMilestones && existingMilestones.length > 0) {
      // Check if any have been submitted or beyond
      const hasProgress = existingMilestones.some(
        (m) => m.status !== 'pending'
      )

      if (hasProgress) {
        return {
          data: null,
          error: 'Cannot update milestones after any have been submitted',
        }
      }
    }

    // Validate new milestones
    if (!milestones || milestones.length === 0) {
      return { data: null, error: 'At least one milestone is required' }
    }

    const totalMilestoneAmount = milestones.reduce((sum, m) => sum + m.amount, 0)
    const orderAmount = Number(order.total_amount)

    if (totalMilestoneAmount !== orderAmount) {
      return {
        data: null,
        error: `Milestone amounts (${totalMilestoneAmount}) must equal order total (${orderAmount})`,
      }
    }

    // Delete existing milestones
    if (existingMilestones && existingMilestones.length > 0) {
      const { error: deleteError } = await supabase
        .from('order_milestones')
        .delete()
        .eq('order_id', orderId)

      if (deleteError) {
        return { data: null, error: 'Failed to remove existing milestones' }
      }
    }

    // Create new milestones
    const result = await createMilestonesService(orderId, milestones)

    if (result.error || !result.milestones) {
      return { data: null, error: result.error || 'Failed to update milestones' }
    }

    revalidatePath(`/marketplace/orders/${orderId}`)
    revalidatePath(`/provider-portal/orders/${orderId}`)

    return { data: result.milestones, error: null }
  } catch (error) {
    console.error('Error updating milestones:', error)
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Failed to update milestones',
    }
  }
}

/**
 * Submits a milestone for buyer approval (seller action)
 * @param milestoneId - The milestone ID
 * @param notes - Optional notes about the delivery
 * @returns Updated milestone
 */
export async function submitMilestoneDelivery(
  milestoneId: string,
  notes?: string
): Promise<ActionResult<Milestone>> {
  try {
    const supabase = await createClient()

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { data: null, error: 'Not authenticated' }
    }

    // Get milestone with order details
    const { data: milestone, error: milestoneError } = await supabase
      .from('order_milestones')
      .select(`
        id,
        status,
        order:orders!order_milestones_order_id_fkey(
          id,
          seller:provider_profiles!orders_seller_id_fkey(user_id)
        )
      `)
      .eq('id', milestoneId)
      .single()

    if (milestoneError || !milestone) {
      return { data: null, error: milestoneError?.message || 'Milestone not found' }
    }

    const order = milestone.order as unknown as {
      id: string
      seller: { user_id: string }
    }

    // Verify user is the seller
    if (order.seller?.user_id !== user.id) {
      return { data: null, error: 'Only the seller can submit milestone deliveries' }
    }

    // Check milestone status
    if (milestone.status !== 'pending') {
      return {
        data: null,
        error: `Cannot submit milestone with status '${milestone.status}'`,
      }
    }

    // Submit the milestone
    const result = await submitMilestoneService(milestoneId, notes)

    if (result.error || !result.milestone) {
      return { data: null, error: result.error || 'Failed to submit milestone' }
    }

    revalidatePath(`/marketplace/orders/${order.id}`)
    revalidatePath(`/provider-portal/orders/${order.id}`)

    return { data: result.milestone, error: null }
  } catch (error) {
    console.error('Error submitting milestone:', error)
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Failed to submit milestone',
    }
  }
}

/**
 * Approves a milestone and triggers payment release (buyer action)
 * @param milestoneId - The milestone ID
 * @returns Updated milestone and payment details
 */
export async function approveMilestoneDelivery(milestoneId: string): Promise<
  ActionResult<{
    milestone: Milestone
    payment: {
      transferId: string
      sellerAmount: number
      platformFee: number
    }
  }>
> {
  try {
    const supabase = await createClient()

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { data: null, error: 'Not authenticated' }
    }

    // Get milestone with order details
    const { data: milestone, error: milestoneError } = await supabase
      .from('order_milestones')
      .select(`
        id,
        status,
        order:orders!order_milestones_order_id_fkey(
          id,
          buyer_id
        )
      `)
      .eq('id', milestoneId)
      .single()

    if (milestoneError || !milestone) {
      return { data: null, error: milestoneError?.message || 'Milestone not found' }
    }

    const order = milestone.order as unknown as { id: string; buyer_id: string }

    // Verify user is the buyer
    if (order.buyer_id !== user.id) {
      return { data: null, error: 'Only the buyer can approve milestones' }
    }

    // Check milestone status
    if (milestone.status !== 'submitted') {
      return {
        data: null,
        error: `Cannot approve milestone with status '${milestone.status}'`,
      }
    }

    // Approve the milestone
    const result = await approveMilestoneService(milestoneId)

    if (result.error || !result.milestone || !result.payment) {
      return { data: null, error: result.error || 'Failed to approve milestone' }
    }

    revalidatePath(`/marketplace/orders/${order.id}`)
    revalidatePath(`/provider-portal/orders/${order.id}`)

    return {
      data: {
        milestone: result.milestone,
        payment: result.payment,
      },
      error: null,
    }
  } catch (error) {
    console.error('Error approving milestone:', error)
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Failed to approve milestone',
    }
  }
}

/**
 * Disputes a milestone delivery
 * @param milestoneId - The milestone ID
 * @param reason - Reason for the dispute
 * @returns Updated milestone and dispute ID
 */
export async function disputeMilestoneDelivery(
  milestoneId: string,
  reason: string
): Promise<ActionResult<{ milestone: Milestone; disputeId: string }>> {
  try {
    if (!reason || reason.trim().length === 0) {
      return { data: null, error: 'Dispute reason is required' }
    }

    if (reason.length < 10) {
      return { data: null, error: 'Please provide a more detailed reason (at least 10 characters)' }
    }

    const supabase = await createClient()

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { data: null, error: 'Not authenticated' }
    }

    // Get milestone with order details
    const { data: milestone, error: milestoneError } = await supabase
      .from('order_milestones')
      .select(`
        id,
        status,
        order:orders!order_milestones_order_id_fkey(
          id,
          buyer_id,
          seller:provider_profiles!orders_seller_id_fkey(user_id)
        )
      `)
      .eq('id', milestoneId)
      .single()

    if (milestoneError || !milestone) {
      return { data: null, error: milestoneError?.message || 'Milestone not found' }
    }

    const order = milestone.order as unknown as {
      id: string
      buyer_id: string
      seller: { user_id: string }
    }

    // Verify user is buyer or seller
    if (order.buyer_id !== user.id && order.seller?.user_id !== user.id) {
      return { data: null, error: 'Only the buyer or seller can dispute a milestone' }
    }

    // Check milestone can be disputed
    if (milestone.status === 'paid') {
      return {
        data: null,
        error: 'Cannot dispute a milestone that has already been paid',
      }
    }

    if (milestone.status === 'rejected') {
      return {
        data: null,
        error: 'This milestone is already disputed',
      }
    }

    // Dispute the milestone
    const result = await disputeMilestoneService(milestoneId, reason)

    if (result.error || !result.milestone) {
      return { data: null, error: result.error || 'Failed to dispute milestone' }
    }

    revalidatePath(`/marketplace/orders/${order.id}`)
    revalidatePath(`/provider-portal/orders/${order.id}`)

    return {
      data: {
        milestone: result.milestone,
        disputeId: result.disputeId!,
      },
      error: null,
    }
  } catch (error) {
    console.error('Error disputing milestone:', error)
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Failed to dispute milestone',
    }
  }
}

/**
 * Gets all milestones for an order
 * @param orderId - The order ID
 * @returns Array of milestones
 */
export async function getOrderMilestones(orderId: string): Promise<ActionResult<Milestone[]>> {
  try {
    const supabase = await createClient()

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { data: null, error: 'Not authenticated' }
    }

    // Get order and verify access
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        buyer_id,
        seller:provider_profiles!orders_seller_id_fkey(user_id)
      `)
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return { data: null, error: orderError?.message || 'Order not found' }
    }

    const seller = order.seller as unknown as { user_id: string }

    // Verify user is buyer or seller
    if (order.buyer_id !== user.id && seller?.user_id !== user.id) {
      return { data: null, error: 'Access denied' }
    }

    // Get milestones
    const result = await getMilestonesService(orderId)

    if (result.error || !result.milestones) {
      return { data: null, error: result.error || 'Failed to get milestones' }
    }

    return { data: result.milestones, error: null }
  } catch (error) {
    console.error('Error getting milestones:', error)
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Failed to get milestones',
    }
  }
}

/**
 * Gets the milestone progress summary for an order
 * @param orderId - The order ID
 * @returns Progress summary
 */
export async function getMilestoneProgress(orderId: string): Promise<
  ActionResult<{
    total: number
    pending: number
    submitted: number
    approved: number
    paid: number
    rejected: number
    percentComplete: number
    totalAmount: number
    paidAmount: number
  }>
> {
  try {
    const result = await getOrderMilestones(orderId)

    if (result.error || !result.data) {
      return { data: null, error: result.error || 'Failed to get milestones' }
    }

    const milestones = result.data

    const summary = {
      total: milestones.length,
      pending: milestones.filter((m) => m.status === 'pending').length,
      submitted: milestones.filter((m) => m.status === 'submitted').length,
      approved: milestones.filter((m) => m.status === 'approved').length,
      paid: milestones.filter((m) => m.status === 'paid').length,
      rejected: milestones.filter((m) => m.status === 'rejected').length,
      totalAmount: milestones.reduce((sum, m) => sum + m.amount, 0),
      paidAmount: milestones
        .filter((m) => m.status === 'paid')
        .reduce((sum, m) => sum + m.amount, 0),
      percentComplete: 0,
    }

    summary.percentComplete =
      summary.total > 0 ? Math.round((summary.paid / summary.total) * 100) : 0

    return { data: summary, error: null }
  } catch (error) {
    console.error('Error getting milestone progress:', error)
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Failed to get milestone progress',
    }
  }
}
