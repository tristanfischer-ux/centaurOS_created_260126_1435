'use server'

/**
 * Integration Server Actions
 * Connect marketplace orders to tasks, objectives, and org blueprint
 */

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'

// Order-Task Integration
import {
  createOrderTasks,
  createAcceptedOrderTasks,
  updateTasksOnOrderChange,
  completeTaskOnMilestoneApproval,
  cancelOrderTasks,
  getOrderLinkedTasks,
} from '@/lib/integrations/order-tasks'

// Objective Integration
import {
  linkOrderToObjective as linkOrderToObjectiveLib,
  unlinkOrderFromObjective as unlinkOrderFromObjectiveLib,
  getObjectiveOrders,
  suggestObjectiveLink,
  getObjectiveWithOrders,
  calculateObjectiveSpend,
  updateObjectiveProgress,
} from '@/lib/integrations/objectives'

// Org Blueprint Integration
import {
  getMarketplaceRecommendations,
  createOrderFromGap,
  updateCoverageOnOrderComplete,
  getGapsWithMarketplaceMatches,
  buildMarketplaceSearchUrl,
} from '@/lib/integrations/org-blueprint'

// ============================================
// ORDER-TASK INTEGRATION ACTIONS
// ============================================

/**
 * Create tasks for a new order
 */
export async function initializeOrderTasks(orderId: string) {
  const supabase = await createClient()
  const foundryId = await getFoundryIdCached()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !foundryId) {
    return { error: 'Unauthorized', tasks: [] }
  }

  const result = await createOrderTasks(supabase, orderId, foundryId, user.id)

  if (result.error) {
    return { error: result.error, tasks: [] }
  }

  revalidatePath('/tasks')
  revalidatePath(`/orders/${orderId}`)
  return { success: true, tasks: result.tasks }
}

/**
 * Create check-in tasks when order is accepted
 */
export async function createOrderCheckInTasks(orderId: string) {
  const supabase = await createClient()
  const foundryId = await getFoundryIdCached()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !foundryId) {
    return { error: 'Unauthorized', tasks: [] }
  }

  const result = await createAcceptedOrderTasks(supabase, orderId, foundryId, user.id)

  if (result.error) {
    return { error: result.error, tasks: [] }
  }

  revalidatePath('/tasks')
  revalidatePath(`/orders/${orderId}`)
  return { success: true, tasks: result.tasks }
}

/**
 * Get tasks related to an order
 */
export async function getOrderRelatedTasks(orderId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized', data: [] }
  }

  return getOrderLinkedTasks(supabase, orderId)
}

/**
 * Update tasks when order status changes
 */
export async function syncTasksWithOrderStatus(orderId: string, newStatus: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized', success: false }
  }

  const result = await updateTasksOnOrderChange(supabase, orderId, newStatus as 'pending' | 'accepted' | 'in_progress' | 'completed' | 'disputed' | 'cancelled')

  if (result.success) {
    revalidatePath('/tasks')
    revalidatePath(`/orders/${orderId}`)
  }

  return result
}

/**
 * Complete task when milestone is approved
 */
export async function completeMilestoneTask(milestoneId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized', success: false }
  }

  const result = await completeTaskOnMilestoneApproval(supabase, milestoneId)

  if (result.success) {
    revalidatePath('/tasks')
  }

  return result
}

/**
 * Cancel all tasks for an order
 */
export async function cancelAllOrderTasks(orderId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized', success: false, cancelledCount: 0 }
  }

  const result = await cancelOrderTasks(supabase, orderId)

  if (result.success) {
    revalidatePath('/tasks')
    revalidatePath(`/orders/${orderId}`)
  }

  return result
}

// ============================================
// OBJECTIVE INTEGRATION ACTIONS
// ============================================

/**
 * Link an order to an objective
 */
export async function linkOrderToObjective(orderId: string, objectiveId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized', success: false }
  }

  const result = await linkOrderToObjectiveLib(supabase, orderId, objectiveId)

  if (result.success) {
    revalidatePath('/objectives')
    revalidatePath(`/orders/${orderId}`)
  }

  return result
}

/**
 * Unlink an order from its objective
 */
export async function unlinkOrderFromObjective(orderId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized', success: false }
  }

  const result = await unlinkOrderFromObjectiveLib(supabase, orderId)

  if (result.success) {
    revalidatePath('/objectives')
    revalidatePath(`/orders/${orderId}`)
  }

  return result
}

/**
 * Get integration suggestions for an order (objectives + gaps)
 */
export async function getIntegrationSuggestions(orderId: string) {
  const supabase = await createClient()
  const foundryId = await getFoundryIdCached()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !foundryId) {
    return {
      objectiveSuggestions: [],
      error: 'Unauthorized',
    }
  }

  // Get objective suggestions
  const { suggestions, error } = await suggestObjectiveLink(supabase, orderId, foundryId)

  return {
    objectiveSuggestions: suggestions,
    error,
  }
}

/**
 * Get orders linked to an objective with spend info
 */
export async function getObjectiveOrdersWithSpend(objectiveId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized', data: null }
  }

  return getObjectiveWithOrders(supabase, objectiveId)
}

/**
 * Recalculate objective progress
 */
export async function recalculateObjectiveProgress(objectiveId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized', progress: 0 }
  }

  const result = await updateObjectiveProgress(supabase, objectiveId)

  if (!result.error) {
    revalidatePath('/objectives')
    revalidatePath(`/objectives/${objectiveId}`)
  }

  return result
}

// ============================================
// ORG BLUEPRINT INTEGRATION ACTIONS
// ============================================

/**
 * Get marketplace listings for a coverage gap
 */
export async function getGapMarketplaceListings(functionId: string, limit: number = 10) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized', listings: [] }
  }

  return getMarketplaceRecommendations(supabase, functionId, limit)
}

/**
 * Fill an org blueprint gap via marketplace order
 */
export async function fillOrgBlueprintGap(
  gapId: string,
  listingId: string,
  totalAmount: number,
  currency: string = 'GBP'
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized', success: false }
  }

  const result = await createOrderFromGap(supabase, gapId, listingId, user.id, totalAmount, currency)

  if (result.success && result.orderId) {
    // Get foundry ID for task creation
    const foundryId = await getFoundryIdCached()
    if (foundryId) {
      // Auto-create tasks for the new order
      await createOrderTasks(supabase, result.orderId, foundryId, user.id)
    }

    revalidatePath('/org-blueprint')
    revalidatePath('/orders')
    revalidatePath('/marketplace')
  }

  return result
}

/**
 * Update coverage when order completes
 */
export async function syncCoverageOnOrderComplete(orderId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized', success: false }
  }

  const result = await updateCoverageOnOrderComplete(supabase, orderId, user.id)

  if (result.success) {
    revalidatePath('/org-blueprint')
    revalidatePath('/dashboard')
  }

  return result
}

/**
 * Get all gaps with matching marketplace listings
 */
export async function getAllGapsWithMatches(limit: number = 5) {
  const supabase = await createClient()
  const foundryId = await getFoundryIdCached()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !foundryId) {
    return { error: 'Unauthorized', gaps: [] }
  }

  return getGapsWithMarketplaceMatches(supabase, foundryId, limit)
}

/**
 * Get marketplace search URL for a gap
 */
export async function getMarketplaceUrlForGap(functionId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized', url: null }
  }

  // Get function details
  const { data: fn, error } = await supabase
    .from('business_functions')
    .select('name, category')
    .eq('id', functionId)
    .single()

  if (error || !fn) {
    return { error: 'Function not found', url: null }
  }

  const url = buildMarketplaceSearchUrl(fn.name, fn.category)
  return { url, error: null }
}

// ============================================
// COMBINED INTEGRATION HELPERS
// ============================================

/**
 * Get full integration status for an order
 */
export async function getOrderIntegrationStatus(orderId: string) {
  const supabase = await createClient()
  const foundryId = await getFoundryIdCached()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !foundryId) {
    return { error: 'Unauthorized' }
  }

  // Get order with linked objective and business function
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select(`
      id,
      objective_id,
      business_function_id,
      objective:objectives(id, title),
      business_function:business_functions(id, name, category)
    `)
    .eq('id', orderId)
    .single()

  if (orderError || !order) {
    return { error: 'Order not found' }
  }

  // Get linked tasks
  const { data: tasks } = await getOrderLinkedTasks(supabase, orderId)

  // Get objective suggestions if not linked
  let objectiveSuggestions: Awaited<ReturnType<typeof suggestObjectiveLink>>['suggestions'] = []
  if (!order.objective_id) {
    const suggestions = await suggestObjectiveLink(supabase, orderId, foundryId)
    objectiveSuggestions = suggestions.suggestions
  }

  return {
    linkedObjective: order.objective,
    linkedBusinessFunction: order.business_function,
    tasks,
    objectiveSuggestions,
    hasObjective: !!order.objective_id,
    hasBusinessFunction: !!order.business_function_id,
    taskCount: tasks?.length || 0,
  }
}
