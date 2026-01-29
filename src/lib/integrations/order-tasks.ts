// @ts-nocheck
// TODO: Fix task status type mismatches
/**
 * Order → Task Integration
 * Auto-create and manage tasks when orders are created/updated
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/types/database.types'
import { OrderType, OrderStatus, OrderMilestone } from '@/types/orders'
import {
  getTaskTemplate,
  formatTemplateText,
  expandRecurringTemplate,
  milestoneTemplates,
} from './task-templates'

type TypedSupabaseClient = SupabaseClient<Database>
type TaskStatus = Database["public"]["Enums"]["task_status"]

// Task type for order_tasks junction table
export type OrderTaskType = 'onboarding' | 'check_in' | 'milestone_review' | 'completion'

interface OrderDetails {
  id: string
  order_type: OrderType
  created_at: string
  buyer_id: string
  seller_id: string
  listing?: {
    title: string
  } | null
  seller?: {
    display_name: string
  } | null
  milestones?: OrderMilestone[]
}

interface CreatedTask {
  id: string
  title: string
  taskType: OrderTaskType
}

/**
 * Create tasks when an order is created
 */
export async function createOrderTasks(
  supabase: TypedSupabaseClient,
  orderId: string,
  foundryId: string,
  creatorId: string
): Promise<{ tasks: CreatedTask[]; error: string | null }> {
  try {
    // Fetch order details with seller and listing info
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        order_type,
        created_at,
        buyer_id,
        seller_id,
        seller:provider_profiles!orders_seller_id_fkey (
          display_name
        ),
        listing:marketplace_listings (
          title
        )
      `)
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return { tasks: [], error: 'Order not found' }
    }

    const orderDetails = order as unknown as OrderDetails
    const providerName = orderDetails.seller?.display_name || 'Provider'
    const listingTitle = orderDetails.listing?.title || 'Order'

    // Get templates for order creation event
    const templates = getTaskTemplate(orderDetails.order_type as OrderType, 'order_created')
    const createdTasks: CreatedTask[] = []

    const orderCreatedAt = new Date(orderDetails.created_at)

    for (const template of templates) {
      // Expand recurring templates into individual tasks
      const expandedTasks = expandRecurringTemplate(template, orderCreatedAt, {
        providerName,
        listingTitle,
        orderId: orderDetails.id,
      })

      for (const taskData of expandedTasks) {
        // Create the task
        const { data: task, error: taskError } = await supabase
          .from('tasks')
          .insert({
            foundry_id: foundryId,
            title: taskData.title,
            description: taskData.description,
            creator_id: creatorId,
            assignee_id: creatorId, // Buyer is initially assigned
            status: 'Pending' as TaskStatus,
            risk_level: taskData.riskLevel,
            end_date: taskData.dueDate.toISOString(),
            client_visible: false,
          })
          .select('id, title')
          .single()

        if (taskError || !task) {
          console.error('Failed to create task:', taskError)
          continue
        }

        // Link task to order
        const { error: linkError } = await supabase
          .from('order_tasks')
          .insert({
            order_id: orderId,
            task_id: task.id,
            task_type: taskData.taskType,
          })

        if (linkError) {
          console.error('Failed to link task to order:', linkError)
        }

        createdTasks.push({
          id: task.id,
          title: task.title,
          taskType: taskData.taskType,
        })
      }
    }

    // Create milestone review tasks if milestones exist
    const { data: milestones } = await supabase
      .from('order_milestones')
      .select('id, title')
      .eq('order_id', orderId)

    if (milestones && milestones.length > 0) {
      for (const milestone of milestones) {
        const milestoneTasks = await createMilestoneReviewTask(
          supabase,
          orderId,
          milestone.id,
          milestone.title,
          foundryId,
          creatorId,
          providerName
        )
        createdTasks.push(...milestoneTasks)
      }
    }

    return { tasks: createdTasks, error: null }
  } catch (err) {
    console.error('Error in createOrderTasks:', err)
    return { tasks: [], error: 'Failed to create order tasks' }
  }
}

/**
 * Create check-in tasks when order is accepted
 */
export async function createAcceptedOrderTasks(
  supabase: TypedSupabaseClient,
  orderId: string,
  foundryId: string,
  creatorId: string
): Promise<{ tasks: CreatedTask[]; error: string | null }> {
  try {
    // Fetch order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        order_type,
        created_at,
        seller:provider_profiles!orders_seller_id_fkey (
          display_name
        ),
        listing:marketplace_listings (
          title
        )
      `)
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return { tasks: [], error: 'Order not found' }
    }

    const orderDetails = order as unknown as OrderDetails
    const providerName = orderDetails.seller?.display_name || 'Provider'
    const listingTitle = orderDetails.listing?.title || 'Order'

    const templates = getTaskTemplate(orderDetails.order_type as OrderType, 'order_accepted')
    const createdTasks: CreatedTask[] = []

    const orderCreatedAt = new Date(orderDetails.created_at)

    for (const template of templates) {
      const expandedTasks = expandRecurringTemplate(template, orderCreatedAt, {
        providerName,
        listingTitle,
        orderId: orderDetails.id,
      })

      for (const taskData of expandedTasks) {
        const { data: task, error: taskError } = await supabase
          .from('tasks')
          .insert({
            foundry_id: foundryId,
            title: taskData.title,
            description: taskData.description,
            creator_id: creatorId,
            assignee_id: creatorId,
            status: 'Pending' as TaskStatus,
            risk_level: taskData.riskLevel,
            end_date: taskData.dueDate.toISOString(),
            client_visible: false,
          })
          .select('id, title')
          .single()

        if (taskError || !task) {
          console.error('Failed to create task:', taskError)
          continue
        }

        await supabase.from('order_tasks').insert({
          order_id: orderId,
          task_id: task.id,
          task_type: taskData.taskType,
        })

        createdTasks.push({
          id: task.id,
          title: task.title,
          taskType: taskData.taskType,
        })
      }
    }

    return { tasks: createdTasks, error: null }
  } catch (err) {
    console.error('Error in createAcceptedOrderTasks:', err)
    return { tasks: [], error: 'Failed to create order tasks' }
  }
}

/**
 * Create milestone review task
 */
async function createMilestoneReviewTask(
  supabase: TypedSupabaseClient,
  orderId: string,
  milestoneId: string,
  milestoneTitle: string,
  foundryId: string,
  creatorId: string,
  providerName: string
): Promise<CreatedTask[]> {
  const tasks: CreatedTask[] = []
  const template = milestoneTemplates[0]

  const title = formatTemplateText(template.title, {
    milestoneTitle,
    providerName,
  })
  const description = formatTemplateText(template.description, {
    milestoneTitle,
    providerName,
  })

  const { data: task, error } = await supabase
    .from('tasks')
    .insert({
      foundry_id: foundryId,
      title,
      description,
      creator_id: creatorId,
      assignee_id: creatorId,
      status: 'Pending' as TaskStatus,
      risk_level: template.riskLevel,
      client_visible: false,
    })
    .select('id, title')
    .single()

  if (error || !task) {
    console.error('Failed to create milestone review task:', error)
    return tasks
  }

  await supabase.from('order_tasks').insert({
    order_id: orderId,
    task_id: task.id,
    task_type: 'milestone_review',
  })

  tasks.push({
    id: task.id,
    title: task.title,
    taskType: 'milestone_review',
  })

  return tasks
}

/**
 * Update task statuses when order status changes
 */
export async function updateTasksOnOrderChange(
  supabase: TypedSupabaseClient,
  orderId: string,
  newStatus: OrderStatus
): Promise<{ success: boolean; error: string | null }> {
  try {
    // Get all linked tasks
    const { data: orderTasks, error: fetchError } = await supabase
      .from('order_tasks')
      .select('task_id, task_type')
      .eq('order_id', orderId)

    if (fetchError || !orderTasks) {
      return { success: false, error: 'Failed to fetch order tasks' }
    }

    const taskIds = orderTasks.map(ot => ot.task_id)

    // Determine new task status based on order status
    let taskStatus: TaskStatus | null = null
    
    switch (newStatus) {
      case 'cancelled':
        taskStatus = 'Cancelled'
        break
      case 'completed':
        // Mark all remaining tasks as completed
        taskStatus = 'Completed'
        break
      case 'in_progress':
        // No change needed - tasks remain as they are
        break
      default:
        break
    }

    if (taskStatus && taskIds.length > 0) {
      const { error: updateError } = await supabase
        .from('tasks')
        .update({ status: taskStatus })
        .in('id', taskIds)
        .neq('status', 'Completed') // Don't update already completed tasks

      if (updateError) {
        console.error('Failed to update task statuses:', updateError)
        return { success: false, error: 'Failed to update tasks' }
      }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('Error in updateTasksOnOrderChange:', err)
    return { success: false, error: 'Failed to update tasks' }
  }
}

/**
 * Mark milestone review task as complete when milestone is approved
 */
export async function completeTaskOnMilestoneApproval(
  supabase: TypedSupabaseClient,
  milestoneId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    // Get the milestone's order
    const { data: milestone, error: milestoneError } = await supabase
      .from('order_milestones')
      .select('order_id, title')
      .eq('id', milestoneId)
      .single()

    if (milestoneError || !milestone) {
      return { success: false, error: 'Milestone not found' }
    }

    // Find tasks for this order with milestone_review type
    // Match by title containing the milestone title
    const { data: orderTasks, error: tasksError } = await supabase
      .from('order_tasks')
      .select(`
        task_id,
        task:tasks(id, title, status)
      `)
      .eq('order_id', milestone.order_id)
      .eq('task_type', 'milestone_review')

    if (tasksError) {
      return { success: false, error: 'Failed to fetch tasks' }
    }

    // Find the matching task
    const matchingTask = orderTasks?.find(ot => {
      const task = ot.task as unknown as { title: string; status: string }
      return task?.title?.includes(milestone.title)
    })

    if (matchingTask) {
      const { error: updateError } = await supabase
        .from('tasks')
        .update({
          status: 'Completed' as TaskStatus,
          end_date: new Date().toISOString(),
        })
        .eq('id', matchingTask.task_id)

      if (updateError) {
        return { success: false, error: 'Failed to complete task' }
      }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('Error in completeTaskOnMilestoneApproval:', err)
    return { success: false, error: 'Failed to complete milestone task' }
  }
}

/**
 * Cancel all tasks related to an order
 */
export async function cancelOrderTasks(
  supabase: TypedSupabaseClient,
  orderId: string
): Promise<{ success: boolean; cancelledCount: number; error: string | null }> {
  try {
    // Get all linked tasks
    const { data: orderTasks, error: fetchError } = await supabase
      .from('order_tasks')
      .select('task_id')
      .eq('order_id', orderId)

    if (fetchError || !orderTasks || orderTasks.length === 0) {
      return { success: true, cancelledCount: 0, error: null }
    }

    const taskIds = orderTasks.map(ot => ot.task_id)

    // Cancel all non-completed tasks
    const { data: updatedTasks, error: updateError } = await supabase
      .from('tasks')
      .update({ status: 'Cancelled' as TaskStatus })
      .in('id', taskIds)
      .neq('status', 'Completed')
      .select('id')

    if (updateError) {
      console.error('Failed to cancel tasks:', updateError)
      return { success: false, cancelledCount: 0, error: 'Failed to cancel tasks' }
    }

    return {
      success: true,
      cancelledCount: updatedTasks?.length || 0,
      error: null,
    }
  } catch (err) {
    console.error('Error in cancelOrderTasks:', err)
    return { success: false, cancelledCount: 0, error: 'Failed to cancel tasks' }
  }
}

/**
 * Get all tasks linked to an order
 */
export async function getOrderLinkedTasks(
  supabase: TypedSupabaseClient,
  orderId: string
): Promise<{
  data: Array<{
    id: string
    title: string
    status: TaskStatus
    taskType: OrderTaskType
    dueDate: string | null
  }>
  error: string | null
}> {
  try {
    const { data, error } = await supabase
      .from('order_tasks')
      .select(`
        task_type,
        task:tasks (
          id,
          title,
          status,
          end_date
        )
      `)
      .eq('order_id', orderId)

    if (error) {
      return { data: [], error: error.message }
    }

    const tasks = (data || []).map(ot => {
      const task = ot.task as unknown as {
        id: string
        title: string
        status: TaskStatus
        end_date: string | null
      }
      return {
        id: task.id,
        title: task.title,
        status: task.status,
        taskType: ot.task_type as OrderTaskType,
        dueDate: task.end_date,
      }
    })

    return { data: tasks, error: null }
  } catch (err) {
    console.error('Error in getOrderLinkedTasks:', err)
    return { data: [], error: 'Failed to fetch order tasks' }
  }
}
