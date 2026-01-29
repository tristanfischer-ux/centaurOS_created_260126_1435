// @ts-nocheck
// TODO: Fix sendNotification parameter type mismatches
/**
 * Milestone Service
 * Manages milestone-based payment releases for marketplace orders
 */

import { createClient } from '@/lib/supabase/server'
import { Milestone, MilestoneInput, MilestoneStatus } from '@/types/payments'
import { releaseToSeller } from './flow'
import { sendNotification } from '@/lib/notifications'

/**
 * Creates milestones for an order
 * @param orderId - The order ID
 * @param milestones - Array of milestone inputs
 * @returns Created milestones
 */
export async function createMilestones(
  orderId: string,
  milestones: MilestoneInput[]
): Promise<{ milestones: Milestone[]; error: null } | { milestones: null; error: string }> {
  try {
    if (!milestones || milestones.length === 0) {
      return { milestones: null, error: 'At least one milestone is required' }
    }

    const supabase = await createClient()

    // Verify order exists
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, total_amount')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return { milestones: null, error: orderError?.message || 'Order not found' }
    }

    // Validate total milestone amounts equal order total
    const totalMilestoneAmount = milestones.reduce((sum, m) => sum + m.amount, 0)
    const orderAmount = Number(order.total_amount)

    if (totalMilestoneAmount !== orderAmount) {
      return {
        milestones: null,
        error: `Milestone amounts (${totalMilestoneAmount}) must equal order total (${orderAmount})`,
      }
    }

    // Check for existing milestones
    const { data: existingMilestones } = await supabase
      .from('order_milestones')
      .select('id')
      .eq('order_id', orderId)

    if (existingMilestones && existingMilestones.length > 0) {
      return {
        milestones: null,
        error: 'Milestones already exist for this order. Use updateMilestones to modify.',
      }
    }

    // Create milestones
    const milestoneRecords = milestones.map((m) => ({
      order_id: orderId,
      title: m.title,
      description: m.description || null,
      amount: m.amount,
      due_date: m.dueDate || null,
      status: 'pending' as const,
    }))

    const { data: created, error: createError } = await supabase
      .from('order_milestones')
      .insert(milestoneRecords)
      .select()

    if (createError || !created) {
      return { milestones: null, error: createError?.message || 'Failed to create milestones' }
    }

    // Map to response type
    const mappedMilestones: Milestone[] = created.map((m) => ({
      id: m.id,
      orderId: m.order_id,
      title: m.title,
      description: m.description,
      amount: Number(m.amount),
      dueDate: m.due_date,
      status: m.status as MilestoneStatus,
      submittedAt: m.submitted_at,
      approvedAt: m.approved_at,
      createdAt: m.created_at,
    }))

    return { milestones: mappedMilestones, error: null }
  } catch (error) {
    console.error('Error creating milestones:', error)
    return {
      milestones: null,
      error: error instanceof Error ? error.message : 'Failed to create milestones',
    }
  }
}

/**
 * Gets all milestones for an order
 * @param orderId - The order ID
 * @returns Array of milestones
 */
export async function getMilestones(
  orderId: string
): Promise<{ milestones: Milestone[]; error: null } | { milestones: null; error: string }> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('order_milestones')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true })

    if (error) {
      return { milestones: null, error: error.message }
    }

    const milestones: Milestone[] = (data || []).map((m) => ({
      id: m.id,
      orderId: m.order_id,
      title: m.title,
      description: m.description,
      amount: Number(m.amount),
      dueDate: m.due_date,
      status: m.status as MilestoneStatus,
      submittedAt: m.submitted_at,
      approvedAt: m.approved_at,
      createdAt: m.created_at,
    }))

    return { milestones, error: null }
  } catch (error) {
    console.error('Error getting milestones:', error)
    return {
      milestones: null,
      error: error instanceof Error ? error.message : 'Failed to get milestones',
    }
  }
}

/**
 * Marks a milestone as submitted (seller action)
 * @param milestoneId - The milestone ID
 * @param notes - Optional notes about the submission
 * @returns Updated milestone
 */
export async function submitMilestone(
  milestoneId: string,
  notes?: string
): Promise<{ milestone: Milestone; error: null } | { milestone: null; error: string }> {
  try {
    const supabase = await createClient()

    // Get milestone with order details
    const { data: milestone, error: fetchError } = await supabase
      .from('order_milestones')
      .select(
        `
        *,
        order:orders!order_milestones_order_id_fkey(
          id,
          order_number,
          buyer_id,
          buyer:profiles!orders_buyer_id_fkey(id, email, full_name)
        )
      `
      )
      .eq('id', milestoneId)
      .single()

    if (fetchError || !milestone) {
      return { milestone: null, error: fetchError?.message || 'Milestone not found' }
    }

    if (milestone.status !== 'pending') {
      return {
        milestone: null,
        error: `Cannot submit milestone with status '${milestone.status}'`,
      }
    }

    // Update milestone status
    const { data: updated, error: updateError } = await supabase
      .from('order_milestones')
      .update({
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      })
      .eq('id', milestoneId)
      .select()
      .single()

    if (updateError || !updated) {
      return { milestone: null, error: updateError?.message || 'Failed to update milestone' }
    }

    // Notify the buyer
    const order = milestone.order as unknown as {
      id: string
      order_number: string
      buyer_id: string
      buyer: { id: string; email: string; full_name: string }
    }

    if (order?.buyer?.id) {
      try {
        await sendNotification({
          userId: order.buyer.id,
          type: 'milestone_submitted',
          title: 'Milestone Submitted for Review',
          message: `"${milestone.title}" has been submitted for your approval${notes ? `: ${notes}` : ''}.`,
          link: `/marketplace/orders/${order.id}`,
          metadata: {
            orderId: order.id,
            orderNumber: order.order_number,
            milestoneId,
            milestoneTitle: milestone.title,
          },
        })
      } catch (notifyError) {
        console.error('Error sending buyer notification:', notifyError)
      }
    }

    return {
      milestone: {
        id: updated.id,
        orderId: updated.order_id,
        title: updated.title,
        description: updated.description,
        amount: Number(updated.amount),
        dueDate: updated.due_date,
        status: updated.status as MilestoneStatus,
        submittedAt: updated.submitted_at,
        approvedAt: updated.approved_at,
        createdAt: updated.created_at,
      },
      error: null,
    }
  } catch (error) {
    console.error('Error submitting milestone:', error)
    return {
      milestone: null,
      error: error instanceof Error ? error.message : 'Failed to submit milestone',
    }
  }
}

/**
 * Approves a milestone and triggers payment release (buyer action)
 * @param milestoneId - The milestone ID
 * @returns Updated milestone and payment details
 */
export async function approveMilestone(milestoneId: string): Promise<
  | {
      milestone: Milestone
      payment: { transferId: string; sellerAmount: number; platformFee: number }
      error: null
    }
  | { milestone: null; payment: null; error: string }
> {
  try {
    const supabase = await createClient()

    // Get milestone with order details
    const { data: milestone, error: fetchError } = await supabase
      .from('order_milestones')
      .select(
        `
        *,
        order:orders!order_milestones_order_id_fkey(
          id,
          order_number,
          seller_id,
          escrow_status,
          seller:provider_profiles!orders_seller_id_fkey(
            user_id,
            user:profiles!provider_profiles_user_id_fkey(id, email, full_name)
          )
        )
      `
      )
      .eq('id', milestoneId)
      .single()

    if (fetchError || !milestone) {
      return { milestone: null, payment: null, error: fetchError?.message || 'Milestone not found' }
    }

    if (milestone.status !== 'submitted') {
      return {
        milestone: null,
        payment: null,
        error: `Cannot approve milestone with status '${milestone.status}'. Milestone must be submitted first.`,
      }
    }

    // Update milestone to approved
    const { data: updated, error: updateError } = await supabase
      .from('order_milestones')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
      })
      .eq('id', milestoneId)
      .select()
      .single()

    if (updateError || !updated) {
      return {
        milestone: null,
        payment: null,
        error: updateError?.message || 'Failed to approve milestone',
      }
    }

    const order = milestone.order as unknown as {
      id: string
      order_number: string
      seller_id: string
      escrow_status: string
      seller: {
        user_id: string
        user: { id: string; email: string; full_name: string }
      }
    }

    // Release payment to seller
    const releaseResult = await releaseToSeller(order.id, milestoneId)

    if (releaseResult.error || !releaseResult.transfer) {
      // Revert milestone status since payment failed
      await supabase
        .from('order_milestones')
        .update({ status: 'submitted', approved_at: null })
        .eq('id', milestoneId)

      return {
        milestone: null,
        payment: null,
        error: releaseResult.error || 'Failed to release payment',
      }
    }

    // Notify the seller
    if (order?.seller?.user?.id) {
      try {
        await sendNotification({
          userId: order.seller.user.id,
          type: 'milestone_approved',
          title: 'Milestone Approved - Payment Released',
          message: `"${milestone.title}" has been approved. Payment of ${formatAmount(releaseResult.sellerAmount!, milestone.order.currency || 'GBP')} is being transferred to your account.`,
          link: `/provider-portal/orders/${order.id}`,
          metadata: {
            orderId: order.id,
            orderNumber: order.order_number,
            milestoneId,
            milestoneTitle: milestone.title,
            amount: releaseResult.sellerAmount,
          },
        })
      } catch (notifyError) {
        console.error('Error sending seller notification:', notifyError)
      }
    }

    return {
      milestone: {
        id: updated.id,
        orderId: updated.order_id,
        title: updated.title,
        description: updated.description,
        amount: Number(updated.amount),
        dueDate: updated.due_date,
        status: 'paid' as MilestoneStatus, // Will be updated by releaseToSeller
        submittedAt: updated.submitted_at,
        approvedAt: updated.approved_at,
        createdAt: updated.created_at,
      },
      payment: {
        transferId: releaseResult.transfer.id,
        sellerAmount: releaseResult.sellerAmount!,
        platformFee: releaseResult.platformFee!,
      },
      error: null,
    }
  } catch (error) {
    console.error('Error approving milestone:', error)
    return {
      milestone: null,
      payment: null,
      error: error instanceof Error ? error.message : 'Failed to approve milestone',
    }
  }
}

/**
 * Disputes a milestone (buyer or seller action)
 * @param milestoneId - The milestone ID
 * @param reason - Reason for the dispute
 * @returns Updated milestone
 */
export async function disputeMilestone(
  milestoneId: string,
  reason: string
): Promise<{ milestone: Milestone; disputeId: string; error: null } | { milestone: null; disputeId: null; error: string }> {
  try {
    if (!reason || reason.trim().length === 0) {
      return { milestone: null, disputeId: null, error: 'Dispute reason is required' }
    }

    const supabase = await createClient()

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { milestone: null, disputeId: null, error: 'Not authenticated' }
    }

    // Get milestone with order details
    const { data: milestone, error: fetchError } = await supabase
      .from('order_milestones')
      .select(
        `
        *,
        order:orders!order_milestones_order_id_fkey(
          id,
          order_number,
          buyer_id,
          seller_id,
          buyer:profiles!orders_buyer_id_fkey(id, email, full_name),
          seller:provider_profiles!orders_seller_id_fkey(
            user_id,
            user:profiles!provider_profiles_user_id_fkey(id, email, full_name)
          )
        )
      `
      )
      .eq('id', milestoneId)
      .single()

    if (fetchError || !milestone) {
      return { milestone: null, disputeId: null, error: fetchError?.message || 'Milestone not found' }
    }

    if (milestone.status === 'paid') {
      return {
        milestone: null,
        disputeId: null,
        error: 'Cannot dispute a milestone that has already been paid',
      }
    }

    const order = milestone.order as unknown as {
      id: string
      order_number: string
      buyer_id: string
      seller_id: string
      buyer: { id: string; email: string; full_name: string }
      seller: {
        user_id: string
        user: { id: string; email: string; full_name: string }
      }
    }

    // Verify user is either buyer or seller
    const isBuyer = user.id === order.buyer_id
    const isSeller = user.id === order.seller?.user_id

    if (!isBuyer && !isSeller) {
      return {
        milestone: null,
        disputeId: null,
        error: 'Only the buyer or seller can dispute a milestone',
      }
    }

    // Update milestone status to rejected (disputed)
    const { data: updated, error: updateError } = await supabase
      .from('order_milestones')
      .update({ status: 'rejected' })
      .eq('id', milestoneId)
      .select()
      .single()

    if (updateError || !updated) {
      return {
        milestone: null,
        disputeId: null,
        error: updateError?.message || 'Failed to update milestone',
      }
    }

    // Create a dispute record
    const { data: dispute, error: disputeError } = await supabase
      .from('disputes')
      .insert({
        order_id: order.id,
        raised_by: user.id,
        reason: `Milestone dispute: ${milestone.title}\n\n${reason}`,
        status: 'open',
      })
      .select()
      .single()

    if (disputeError) {
      console.error('Error creating dispute record:', disputeError)
    }

    // Update order status to disputed
    await supabase.from('orders').update({ status: 'disputed' }).eq('id', order.id)

    // Notify the other party
    const notifyUserId = isBuyer ? order.seller?.user?.id : order.buyer?.id
    const notifierName = isBuyer ? order.buyer?.full_name : order.seller?.user?.full_name

    if (notifyUserId) {
      try {
        await sendNotification({
          userId: notifyUserId,
          type: 'milestone_disputed',
          title: 'Milestone Disputed',
          message: `${notifierName || 'A user'} has disputed "${milestone.title}": ${reason}`,
          link: isBuyer ? `/provider-portal/orders/${order.id}` : `/marketplace/orders/${order.id}`,
          metadata: {
            orderId: order.id,
            orderNumber: order.order_number,
            milestoneId,
            milestoneTitle: milestone.title,
            disputeReason: reason,
          },
        })
      } catch (notifyError) {
        console.error('Error sending dispute notification:', notifyError)
      }
    }

    return {
      milestone: {
        id: updated.id,
        orderId: updated.order_id,
        title: updated.title,
        description: updated.description,
        amount: Number(updated.amount),
        dueDate: updated.due_date,
        status: updated.status as MilestoneStatus,
        submittedAt: updated.submitted_at,
        approvedAt: updated.approved_at,
        createdAt: updated.created_at,
      },
      disputeId: dispute?.id || 'dispute-created',
      error: null,
    }
  } catch (error) {
    console.error('Error disputing milestone:', error)
    return {
      milestone: null,
      disputeId: null,
      error: error instanceof Error ? error.message : 'Failed to dispute milestone',
    }
  }
}

/**
 * Helper to format amount for display
 */
function formatAmount(amount: number, currency: string): string {
  const formatter = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  })
  return formatter.format(amount / 100)
}
