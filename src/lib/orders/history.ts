/**
 * Order History/Audit Service
 * Tracks all events related to orders for audit trail
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/types/database.types'
import { OrderEvent, OrderEventType } from '@/types/orders'

type TypedSupabaseClient = SupabaseClient<Database>

// NOTE: The order_events table may not exist in the database yet.
// Until the migration is created, events are logged to console for audit trail.
// DECISION: Order events logged to console — order_events table migration deferred.

/**
 * Log an order event.
 *
 * @description Logs order lifecycle events for audit trail. Currently logs to
 * console since the order_events table may not exist. When the table is created,
 * this will persist events to the database.
 *
 * @param supabase - Typed Supabase client
 * @param orderId - The order this event belongs to
 * @param eventType - Type of event (created, accepted, completed, etc.)
 * @param details - Additional event details
 * @param actorId - User who triggered the event
 * @returns Success status
 *
 * @audit Logs order lifecycle events for compliance
 */
export async function logOrderEvent(
  supabase: TypedSupabaseClient,
  orderId: string,
  eventType: OrderEventType,
  details: Record<string, unknown>,
  actorId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    // AUDIT: Log order event for audit trail
    console.info('[OrderHistory] Event logged:', {
      orderId,
      eventType,
      details,
      actorId,
      timestamp: new Date().toISOString(),
    })

    // When order_events table exists, uncomment this block:
    // const { error: eventError } = await supabase
    //   .from('order_events')
    //   .insert({
    //     order_id: orderId,
    //     event_type: eventType,
    //     details,
    //     actor_id: actorId,
    //     created_at: new Date().toISOString(),
    //   })
    //
    // if (eventError) {
    //   console.error('[OrderHistory] Failed to persist event:', eventError)
    // }

    return { success: true, error: null }
  } catch (err) {
    console.error('[OrderHistory] Error logging order event:', err)
    return { success: false, error: 'Failed to log order event' }
  }
}

/**
 * Get order history/timeline.
 *
 * @description Since the order_events table may not exist yet, this delegates
 * to buildOrderTimeline which reconstructs history from order data.
 *
 * @param supabase - Typed Supabase client
 * @param orderId - The order to get history for
 * @returns Array of order events
 */
export async function getOrderHistory(
  supabase: TypedSupabaseClient,
  orderId: string
): Promise<{ data: OrderEvent[]; error: string | null }> {
  // Delegate to buildOrderTimeline which reconstructs history from order data
  // When order_events table is created, this can query it directly
  return buildOrderTimeline(supabase, orderId)
}

/**
 * Get history with actor names
 */
export async function getOrderHistoryWithActors(
  supabase: TypedSupabaseClient,
  orderId: string
): Promise<{ data: OrderEvent[]; error: string | null }> {
  try {
    const { data: events, error } = await getOrderHistory(supabase, orderId)
    
    if (error || events.length === 0) {
      return { data: events, error }
    }

    // Get unique actor IDs
    const actorIds = [...new Set(events.map((e) => e.actor_id))]

    // Fetch actor profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', actorIds)

    // Create a map of actor IDs to names
    const actorMap = new Map<string, string | null>()
    profiles?.forEach((p) => {
      actorMap.set(p.id, p.full_name)
    })

    // Add actor names to events
    const eventsWithActors = events.map((event) => ({
      ...event,
      actor_name: actorMap.get(event.actor_id) || null,
    }))

    return { data: eventsWithActors, error: null }
  } catch (err) {
    console.error('[OrderHistory] Error fetching order history with actors:', { error: err instanceof Error ? err.message : 'Unknown error' })
    return { data: [], error: 'Failed to fetch order history' }
  }
}

/**
 * Build order timeline from order data when events table doesn't exist
 * This reconstructs a minimal history from the order itself
 */
export async function buildOrderTimeline(
  supabase: TypedSupabaseClient,
  orderId: string
): Promise<{ data: OrderEvent[]; error: string | null }> {
  try {
    // Fetch the order with milestones and disputes
    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_milestones (
          id,
          title,
          status,
          submitted_at,
          approved_at,
          created_at
        ),
        disputes (
          id,
          status,
          created_at,
          resolved_at
        )
      `)
      .eq('id', orderId)
      .single()

    if (error || !order) {
      return { data: [], error: 'Order not found' }
    }

    const timeline: OrderEvent[] = []

    // Order creation event
    timeline.push({
      id: `${orderId}-created`,
      order_id: orderId,
      event_type: 'created',
      details: {
        total_amount: order.total_amount,
        order_type: order.order_type,
      },
      actor_id: order.buyer_id || '',
      created_at: order.created_at || new Date().toISOString(),
    })

    // Add status-based events based on current status
    if (order.status !== 'pending') {
      // We can infer some events from the current status
      if (['accepted', 'in_progress', 'completed', 'disputed', 'cancelled'].includes(order.status || '')) {
        // We don't have exact timestamps for status changes without events table
        // but we can show current status
      }
    }

    // Add milestone events
    const milestones = order.order_milestones || []
    for (const milestone of milestones) {
      if (milestone.submitted_at) {
        timeline.push({
          id: `${milestone.id}-submitted`,
          order_id: orderId,
          event_type: 'milestone_submitted',
          details: {
            milestone_id: milestone.id,
            milestone_title: milestone.title,
          },
          actor_id: '', // Unknown without events table
          created_at: milestone.submitted_at,
        })
      }
      if (milestone.approved_at) {
        timeline.push({
          id: `${milestone.id}-approved`,
          order_id: orderId,
          event_type: 'milestone_approved',
          details: {
            milestone_id: milestone.id,
            milestone_title: milestone.title,
          },
          actor_id: '', // Unknown without events table
          created_at: milestone.approved_at,
        })
      }
    }

    // Add dispute events
    const disputes = order.disputes || []
    for (const dispute of disputes) {
      timeline.push({
        id: `${dispute.id}-opened`,
        order_id: orderId,
        event_type: 'disputed',
        details: {
          dispute_id: dispute.id,
        },
        actor_id: '', // Unknown without events table
        created_at: dispute.created_at || new Date().toISOString(),
      })

      if (dispute.resolved_at) {
        timeline.push({
          id: `${dispute.id}-resolved`,
          order_id: orderId,
          event_type: 'dispute_resolved',
          details: {
            dispute_id: dispute.id,
          },
          actor_id: '', // Unknown without events table
          created_at: dispute.resolved_at,
        })
      }
    }

    // Completion event
    if (order.completed_at) {
      timeline.push({
        id: `${orderId}-completed`,
        order_id: orderId,
        event_type: 'completed',
        details: {},
        actor_id: '', // Unknown without events table
        created_at: order.completed_at,
      })
    }

    // Sort by created_at
    timeline.sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )

    return { data: timeline, error: null }
  } catch (err) {
    console.error('[OrderHistory] Error building order timeline:', { error: err instanceof Error ? err.message : 'Unknown error' })
    return { data: [], error: 'Failed to build order timeline' }
  }
}

/**
 * Event type labels for display
 */
export function getEventTypeLabel(eventType: OrderEventType): string {
  const labels: Record<OrderEventType, string> = {
    created: 'Order Created',
    accepted: 'Order Accepted',
    declined: 'Order Declined',
    started: 'Work Started',
    milestone_submitted: 'Milestone Submitted',
    milestone_approved: 'Milestone Approved',
    milestone_rejected: 'Milestone Rejected',
    disputed: 'Dispute Opened',
    dispute_resolved: 'Dispute Resolved',
    completed: 'Order Completed',
    cancelled: 'Order Cancelled',
    payment_received: 'Payment Received',
    payment_released: 'Payment Released',
    refunded: 'Refund Issued',
  }
  return labels[eventType] || eventType
}

/**
 * Get icon name for event type (for UI display)
 */
export function getEventTypeIcon(eventType: OrderEventType): string {
  const icons: Record<OrderEventType, string> = {
    created: 'plus-circle',
    accepted: 'check-circle',
    declined: 'x-circle',
    started: 'play',
    milestone_submitted: 'upload',
    milestone_approved: 'check',
    milestone_rejected: 'x',
    disputed: 'alert-triangle',
    dispute_resolved: 'check-square',
    completed: 'check-circle-2',
    cancelled: 'x-circle',
    payment_received: 'credit-card',
    payment_released: 'banknote',
    refunded: 'rotate-ccw',
  }
  return icons[eventType] || 'circle'
}

/**
 * Get color for event type (for UI display)
 */
export function getEventTypeColor(eventType: OrderEventType): string {
  const colors: Record<OrderEventType, string> = {
    created: 'blue',
    accepted: 'green',
    declined: 'red',
    started: 'blue',
    milestone_submitted: 'yellow',
    milestone_approved: 'green',
    milestone_rejected: 'red',
    disputed: 'orange',
    dispute_resolved: 'green',
    completed: 'green',
    cancelled: 'gray',
    payment_received: 'green',
    payment_released: 'green',
    refunded: 'yellow',
  }
  return colors[eventType] || 'gray'
}
