// @ts-nocheck - objectives table with nested orders/listings joins returns complex type not matching ObjectiveWithOrders interface
/**
 * Objective Linking Integration
 * Link orders to objectives and track spend/progress
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/types/database.types'
import { OrderStatus, OrderType } from '@/types/orders'

type TypedSupabaseClient = SupabaseClient<Database>

export interface LinkedOrder {
  id: string
  orderNumber: string | null
  status: OrderStatus
  totalAmount: number
  currency: string
  orderType: OrderType
  createdAt: string
  completedAt: string | null
  listing?: {
    id: string
    title: string
  } | null
  seller: {
    displayName: string
  }
}

export interface ObjectiveWithOrders {
  id: string
  title: string
  description: string | null
  progress: number
  orders: LinkedOrder[]
  totalSpend: number
  currency: string
}

export interface ObjectiveSuggestion {
  id: string
  title: string
  description: string | null
  matchScore: number
  matchReason: string
}

/**
 * Link an order to an objective
 */
export async function linkOrderToObjective(
  supabase: TypedSupabaseClient,
  orderId: string,
  objectiveId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    // Verify objective exists
    const { data: objective, error: objError } = await supabase
      .from('objectives')
      .select('id')
      .eq('id', objectiveId)
      .single()

    if (objError || !objective) {
      return { success: false, error: 'Objective not found' }
    }

    // Update the order with the objective link
    const { error: updateError } = await supabase
      .from('orders')
      .update({ objective_id: objectiveId })
      .eq('id', orderId)

    if (updateError) {
      console.error('Failed to link order to objective:', updateError)
      return { success: false, error: 'Failed to link order to objective' }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('Error in linkOrderToObjective:', err)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

/**
 * Unlink an order from its objective
 */
export async function unlinkOrderFromObjective(
  supabase: TypedSupabaseClient,
  orderId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error: updateError } = await supabase
      .from('orders')
      .update({ objective_id: null })
      .eq('id', orderId)

    if (updateError) {
      console.error('Failed to unlink order from objective:', updateError)
      return { success: false, error: 'Failed to unlink order' }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('Error in unlinkOrderFromObjective:', err)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

/**
 * Get all orders linked to an objective
 */
export async function getObjectiveOrders(
  supabase: TypedSupabaseClient,
  objectiveId: string
): Promise<{ data: LinkedOrder[]; error: string | null }> {
  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        status,
        total_amount,
        currency,
        order_type,
        created_at,
        completed_at,
        listing:marketplace_listings (
          id,
          title
        ),
        seller:provider_profiles!orders_seller_id_fkey (
          display_name
        )
      `)
      .eq('objective_id', objectiveId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch objective orders:', error)
      return { data: [], error: error.message }
    }

    const linkedOrders: LinkedOrder[] = (orders || []).map(order => ({
      id: order.id,
      orderNumber: order.order_number,
      status: order.status as OrderStatus,
      totalAmount: order.total_amount,
      currency: order.currency,
      orderType: order.order_type as OrderType,
      createdAt: order.created_at,
      completedAt: order.completed_at,
      listing: order.listing,
      seller: {
        displayName: order.seller?.display_name || 'Unknown',
      },
    }))

    return { data: linkedOrders, error: null }
  } catch (err) {
    console.error('Error in getObjectiveOrders:', err)
    return { data: [], error: 'Failed to fetch orders' }
  }
}

/**
 * Calculate total spend for an objective from linked orders
 */
export async function calculateObjectiveSpend(
  supabase: TypedSupabaseClient,
  objectiveId: string
): Promise<{ totalSpend: number; currency: string; orderCount: number; error: string | null }> {
  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('total_amount, currency, status')
      .eq('objective_id', objectiveId)
      .not('status', 'eq', 'cancelled')

    if (error) {
      return { totalSpend: 0, currency: 'GBP', orderCount: 0, error: error.message }
    }

    if (!orders || orders.length === 0) {
      return { totalSpend: 0, currency: 'GBP', orderCount: 0, error: null }
    }

    // Sum up amounts (assuming same currency)
    const totalSpend = orders.reduce((sum, order) => sum + order.total_amount, 0)
    const currency = orders[0]?.currency || 'GBP'

    return { totalSpend, currency, orderCount: orders.length, error: null }
  } catch (err) {
    console.error('Error in calculateObjectiveSpend:', err)
    return { totalSpend: 0, currency: 'GBP', orderCount: 0, error: 'Failed to calculate spend' }
  }
}

/**
 * Update objective progress based on linked orders and tasks
 */
export async function updateObjectiveProgress(
  supabase: TypedSupabaseClient,
  objectiveId: string
): Promise<{ progress: number; error: string | null }> {
  try {
    // Get tasks for this objective
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('status')
      .eq('objective_id', objectiveId)

    if (tasksError) {
      return { progress: 0, error: tasksError.message }
    }

    if (!tasks || tasks.length === 0) {
      return { progress: 0, error: null }
    }

    // Calculate progress based on completed tasks
    const completedTasks = tasks.filter(t => t.status === 'Completed').length
    const progress = Math.round((completedTasks / tasks.length) * 100)

    // Update the objective progress
    const { error: updateError } = await supabase
      .from('objectives')
      .update({ progress })
      .eq('id', objectiveId)

    if (updateError) {
      return { progress, error: 'Failed to update progress' }
    }

    return { progress, error: null }
  } catch (err) {
    console.error('Error in updateObjectiveProgress:', err)
    return { progress: 0, error: 'Failed to update progress' }
  }
}

/**
 * Suggest relevant objectives for an order based on listing category/title
 */
export async function suggestObjectiveLink(
  supabase: TypedSupabaseClient,
  orderId: string,
  foundryId: string
): Promise<{ suggestions: ObjectiveSuggestion[]; error: string | null }> {
  try {
    // Get order details including listing
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        order_type,
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

    if (orderError || !order) {
      return { suggestions: [], error: 'Order not found' }
    }

    // Get all objectives for the foundry
    const { data: objectives, error: objError } = await supabase
      .from('objectives')
      .select('id, title, description')
      .eq('foundry_id', foundryId)

    if (objError || !objectives) {
      return { suggestions: [], error: 'Failed to fetch objectives' }
    }

    // Simple text matching for suggestions
    const listing = order.listing as unknown as {
      title: string
      category: string
      subcategory: string
      description: string | null
    } | null

    const suggestions: ObjectiveSuggestion[] = []

    for (const obj of objectives) {
      let score = 0
      const reasons: string[] = []

      const objTitle = obj.title.toLowerCase()
      const objDesc = (obj.description || '').toLowerCase()

      if (listing) {
        const listingTitle = listing.title.toLowerCase()
        const listingCategory = listing.category.toLowerCase()
        const listingSubcategory = listing.subcategory.toLowerCase()

        // Check for category match
        if (objTitle.includes(listingCategory) || objDesc.includes(listingCategory)) {
          score += 30
          reasons.push(`Category match: ${listing.category}`)
        }

        // Check for subcategory match
        if (objTitle.includes(listingSubcategory) || objDesc.includes(listingSubcategory)) {
          score += 40
          reasons.push(`Subcategory match: ${listing.subcategory}`)
        }

        // Check for title word matches
        const titleWords = listingTitle.split(' ').filter(w => w.length > 3)
        const matchedWords = titleWords.filter(
          word => objTitle.includes(word) || objDesc.includes(word)
        )
        if (matchedWords.length > 0) {
          score += matchedWords.length * 10
          reasons.push(`Keyword match: ${matchedWords.join(', ')}`)
        }
      }

      // Check for order type match in description
      const orderTypeKeywords: Record<OrderType, string[]> = {
        people_booking: ['team', 'hire', 'talent', 'contractor', 'freelancer', 'resource'],
        product_rfq: ['product', 'procurement', 'purchase', 'equipment', 'supply'],
        service: ['service', 'support', 'consulting', 'retainer', 'ongoing'],
      }

      const keywords = orderTypeKeywords[order.order_type as OrderType] || []
      const matchedKeywords = keywords.filter(
        kw => objTitle.includes(kw) || objDesc.includes(kw)
      )
      if (matchedKeywords.length > 0) {
        score += matchedKeywords.length * 5
        reasons.push(`Order type alignment`)
      }

      if (score > 0) {
        suggestions.push({
          id: obj.id,
          title: obj.title,
          description: obj.description,
          matchScore: Math.min(score, 100),
          matchReason: reasons.join('; '),
        })
      }
    }

    // Sort by score descending
    suggestions.sort((a, b) => b.matchScore - a.matchScore)

    // Return top 5 suggestions
    return { suggestions: suggestions.slice(0, 5), error: null }
  } catch (err) {
    console.error('Error in suggestObjectiveLink:', err)
    return { suggestions: [], error: 'Failed to generate suggestions' }
  }
}

/**
 * Get objective with linked orders and spend tracking
 */
export async function getObjectiveWithOrders(
  supabase: TypedSupabaseClient,
  objectiveId: string
): Promise<{ data: ObjectiveWithOrders | null; error: string | null }> {
  try {
    // Get objective
    const { data: objective, error: objError } = await supabase
      .from('objectives')
      .select('id, title, description, progress')
      .eq('id', objectiveId)
      .single()

    if (objError || !objective) {
      return { data: null, error: 'Objective not found' }
    }

    // Get linked orders
    const { data: orders, error: ordersError } = await getObjectiveOrders(supabase, objectiveId)
    if (ordersError) {
      return { data: null, error: ordersError }
    }

    // Calculate spend
    const { totalSpend, currency } = await calculateObjectiveSpend(supabase, objectiveId)

    return {
      data: {
        id: objective.id,
        title: objective.title,
        description: objective.description,
        progress: objective.progress || 0,
        orders,
        totalSpend,
        currency,
      },
      error: null,
    }
  } catch (err) {
    console.error('Error in getObjectiveWithOrders:', err)
    return { data: null, error: 'Failed to fetch objective with orders' }
  }
}
