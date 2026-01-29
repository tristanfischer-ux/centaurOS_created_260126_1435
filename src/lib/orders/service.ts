/**
 * Order Service
 * Core business logic for order management
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/types/database.types'
import {
  Order,
  OrderWithDetails,
  OrderStatus,
  OrderSummary,
  CreateOrderParams,
  OrderFilters,
} from '@/types/orders'
import { canTransition, isTerminalStatus } from './status-machine'
import { logOrderEvent } from './history'

type TypedSupabaseClient = SupabaseClient<Database>

/**
 * Create a new order
 */
export async function createOrder(
  supabase: TypedSupabaseClient,
  buyerId: string,
  params: CreateOrderParams
): Promise<{ data: Order | null; error: string | null }> {
  try {
    // Calculate VAT (default 20% UK VAT)
    const vatRate = 0.20
    const vatAmount = params.totalAmount * vatRate
    const platformFee = params.totalAmount * 0.05 // 5% platform fee

    // Insert the order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        buyer_id: buyerId,
        seller_id: params.sellerId,
        listing_id: params.listingId || null,
        order_type: params.orderType,
        total_amount: params.totalAmount,
        currency: params.currency || 'GBP',
        platform_fee: platformFee,
        vat_amount: vatAmount,
        vat_rate: vatRate,
        objective_id: params.objectiveId || null,
        business_function_id: params.businessFunctionId || null,
        status: 'pending',
        escrow_status: 'pending',
      })
      .select()
      .single()

    if (orderError) {
      console.error('Error creating order:', orderError)
      return { data: null, error: 'Failed to create order' }
    }

    // Create milestones if provided
    if (params.milestones && params.milestones.length > 0) {
      const milestonesData = params.milestones.map((m) => ({
        order_id: order.id,
        title: m.title,
        description: m.description || null,
        amount: m.amount,
        due_date: m.due_date || null,
        status: 'pending' as const,
      }))

      const { error: milestonesError } = await supabase
        .from('order_milestones')
        .insert(milestonesData)

      if (milestonesError) {
        console.error('Error creating milestones:', milestonesError)
        // Don't fail the order creation, just log the error
      }
    }

    // Log the order creation event
    await logOrderEvent(supabase, order.id, 'created', {
      total_amount: params.totalAmount,
      order_type: params.orderType,
      milestone_count: params.milestones?.length || 0,
    }, buyerId)

    return { data: order as Order, error: null }
  } catch (err) {
    console.error('Error in createOrder:', err)
    return { data: null, error: 'An unexpected error occurred' }
  }
}

/**
 * Get an order by ID with full details
 */
export async function getOrder(
  supabase: TypedSupabaseClient,
  orderId: string
): Promise<{ data: OrderWithDetails | null; error: string | null }> {
  try {
    // Fetch the order with related data
    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        *,
        buyer:profiles!orders_buyer_id_fkey (
          id,
          full_name,
          email,
          avatar_url
        ),
        seller:provider_profiles!orders_seller_id_fkey (
          id,
          user_id,
          display_name,
          business_type,
          stripe_account_id
        ),
        listing:marketplace_listings (
          id,
          title,
          category,
          subcategory,
          description
        )
      `)
      .eq('id', orderId)
      .single()

    if (error) {
      console.error('Error fetching order:', error)
      return { data: null, error: 'Order not found' }
    }

    // Fetch milestones
    const { data: milestones } = await supabase
      .from('order_milestones')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true })

    // Fetch active dispute if any
    const { data: disputes } = await supabase
      .from('disputes')
      .select('id, reason, status, created_at')
      .eq('order_id', orderId)
      .not('status', 'eq', 'resolved')
      .limit(1)

    // Get seller profile info
    let sellerProfile = null
    if (order.seller?.user_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .eq('id', order.seller.user_id)
        .single()
      sellerProfile = profile
    }

    const orderWithDetails: OrderWithDetails = {
      ...order,
      buyer: order.buyer,
      seller: {
        ...order.seller,
        profile: sellerProfile,
      },
      listing: order.listing,
      milestones: (milestones || []) as OrderWithDetails['milestones'],
      dispute: disputes?.[0] || null,
    }

    return { data: orderWithDetails, error: null }
  } catch (err) {
    console.error('Error in getOrder:', err)
    return { data: null, error: 'An unexpected error occurred' }
  }
}

/**
 * Update order status with validation
 */
export async function updateOrderStatus(
  supabase: TypedSupabaseClient,
  orderId: string,
  newStatus: OrderStatus,
  userId: string,
  reason?: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    // Get current order
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('status')
      .eq('id', orderId)
      .single()

    if (fetchError || !order) {
      return { success: false, error: 'Order not found' }
    }

    const currentStatus = order.status as OrderStatus

    // Validate transition
    if (!canTransition(currentStatus, newStatus)) {
      return {
        success: false,
        error: `Cannot transition from ${currentStatus} to ${newStatus}`,
      }
    }

    // Update the order
    const updateData: Record<string, unknown> = { status: newStatus }
    if (newStatus === 'completed') {
      updateData.completed_at = new Date().toISOString()
    }

    const { error: updateError } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', orderId)

    if (updateError) {
      console.error('Error updating order status:', updateError)
      return { success: false, error: 'Failed to update order status' }
    }

    // Log the status change
    await logOrderEvent(supabase, orderId, getEventTypeForStatus(newStatus), {
      from_status: currentStatus,
      to_status: newStatus,
      reason: reason || null,
    }, userId)

    return { success: true, error: null }
  } catch (err) {
    console.error('Error in updateOrderStatus:', err)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

/**
 * Cancel an order
 */
export async function cancelOrder(
  supabase: TypedSupabaseClient,
  orderId: string,
  reason: string,
  cancelledBy: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    // Get current order
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('status, escrow_status')
      .eq('id', orderId)
      .single()

    if (fetchError || !order) {
      return { success: false, error: 'Order not found' }
    }

    const currentStatus = order.status as OrderStatus

    // Check if cancellation is allowed
    if (!canTransition(currentStatus, 'cancelled')) {
      return {
        success: false,
        error: `Cannot cancel order in ${currentStatus} status`,
      }
    }

    // Update order status
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        escrow_status: order.escrow_status === 'held' ? 'refunded' : order.escrow_status,
      })
      .eq('id', orderId)

    if (updateError) {
      console.error('Error cancelling order:', updateError)
      return { success: false, error: 'Failed to cancel order' }
    }

    // Log the cancellation
    await logOrderEvent(supabase, orderId, 'cancelled', {
      reason,
      cancelled_by: cancelledBy,
      previous_status: currentStatus,
    }, cancelledBy)

    return { success: true, error: null }
  } catch (err) {
    console.error('Error in cancelOrder:', err)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

/**
 * Complete an order
 * @param options.generateInvoices Whether to generate invoices on completion (default: true)
 */
export async function completeOrder(
  supabase: TypedSupabaseClient,
  orderId: string,
  completedBy: string,
  options: { generateInvoices?: boolean } = {}
): Promise<{ success: boolean; error: string | null; invoiceErrors?: string[] }> {
  const { generateInvoices = true } = options
  
  try {
    // Get current order
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('status')
      .eq('id', orderId)
      .single()

    if (fetchError || !order) {
      return { success: false, error: 'Order not found' }
    }

    const currentStatus = order.status as OrderStatus

    // Check if completion is allowed
    if (!canTransition(currentStatus, 'completed')) {
      return {
        success: false,
        error: `Cannot complete order in ${currentStatus} status`,
      }
    }

    // Update order status
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        escrow_status: 'released',
      })
      .eq('id', orderId)

    if (updateError) {
      console.error('Error completing order:', updateError)
      return { success: false, error: 'Failed to complete order' }
    }

    // Log the completion
    await logOrderEvent(supabase, orderId, 'completed', {
      completed_by: completedBy,
    }, completedBy)

    // Generate invoices if requested
    let invoiceErrors: string[] = []
    if (generateInvoices) {
      try {
        // Dynamic import to avoid circular dependencies
        const { generateAllOrderInvoices, storeInvoiceDocument } = await import('@/lib/invoicing/generator')
        const { generateAndUploadInvoicePDF } = await import('@/lib/invoicing/pdf')
        
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
      } catch (invoiceErr) {
        console.error('Error generating invoices:', invoiceErr)
        invoiceErrors.push('Failed to generate invoices')
      }
    }

    return { 
      success: true, 
      error: null,
      invoiceErrors: invoiceErrors.length > 0 ? invoiceErrors : undefined
    }
  } catch (err) {
    console.error('Error in completeOrder:', err)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

/**
 * Get orders for a user with filters
 */
export async function getOrders(
  supabase: TypedSupabaseClient,
  userId: string,
  filters: OrderFilters
): Promise<{ data: OrderSummary[]; error: string | null; count: number }> {
  try {
    let query = supabase
      .from('orders')
      .select(`
        id,
        order_number,
        status,
        escrow_status,
        total_amount,
        currency,
        order_type,
        created_at,
        completed_at,
        buyer:profiles!orders_buyer_id_fkey (
          id,
          full_name
        ),
        seller:provider_profiles!orders_seller_id_fkey (
          id,
          display_name,
          user_id
        ),
        listing:marketplace_listings (
          id,
          title
        )
      `, { count: 'exact' })

    // Filter by role
    if (filters.role === 'buyer') {
      query = query.eq('buyer_id', userId)
    } else if (filters.role === 'seller') {
      // For seller role, we need to match on provider_profile.user_id
      const { data: providerProfile } = await supabase
        .from('provider_profiles')
        .select('id')
        .eq('user_id', userId)
        .single()

      if (providerProfile) {
        query = query.eq('seller_id', providerProfile.id)
      } else {
        // User is not a seller, return empty
        return { data: [], error: null, count: 0 }
      }
    } else {
      // No role filter - get orders where user is buyer OR seller
      const { data: providerProfile } = await supabase
        .from('provider_profiles')
        .select('id')
        .eq('user_id', userId)
        .single()

      if (providerProfile) {
        query = query.or(`buyer_id.eq.${userId},seller_id.eq.${providerProfile.id}`)
      } else {
        query = query.eq('buyer_id', userId)
      }
    }

    // Filter by status
    if (filters.status) {
      if (Array.isArray(filters.status)) {
        query = query.in('status', filters.status)
      } else {
        query = query.eq('status', filters.status)
      }
    }

    // Search by order number
    if (filters.search) {
      query = query.ilike('order_number', `%${filters.search}%`)
    }

    // Pagination
    const limit = filters.limit || 20
    const offset = filters.offset || 0
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching orders:', error)
      return { data: [], error: 'Failed to fetch orders', count: 0 }
    }

    // Map to OrderSummary type
    const orders: OrderSummary[] = (data || []).map((order) => ({
      id: order.id,
      order_number: order.order_number,
      status: order.status as OrderStatus,
      escrow_status: order.escrow_status as OrderSummary['escrow_status'],
      total_amount: order.total_amount,
      currency: order.currency,
      order_type: order.order_type as OrderSummary['order_type'],
      created_at: order.created_at,
      completed_at: order.completed_at,
      buyer: order.buyer,
      seller: order.seller,
      listing: order.listing,
    }))

    return { data: orders, error: null, count: count || 0 }
  } catch (err) {
    console.error('Error in getOrders:', err)
    return { data: [], error: 'An unexpected error occurred', count: 0 }
  }
}

/**
 * Helper to get event type for status changes
 */
function getEventTypeForStatus(status: OrderStatus): 'accepted' | 'started' | 'completed' | 'disputed' | 'cancelled' {
  const mapping: Record<OrderStatus, 'accepted' | 'started' | 'completed' | 'disputed' | 'cancelled'> = {
    pending: 'created' as never, // Should not happen
    accepted: 'accepted',
    in_progress: 'started',
    completed: 'completed',
    disputed: 'disputed',
    cancelled: 'cancelled',
  }
  return mapping[status]
}
