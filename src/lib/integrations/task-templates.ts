/**
 * Task Templates for Marketplace Orders
 * Define task templates for different order types and events
 */

import { OrderType } from '@/types/orders'
import { Database } from '@/types/database.types'

type RiskLevel = Database["public"]["Enums"]["risk_level"]

// Task template interface
export interface TaskTemplate {
  title: string
  description: string
  taskType: 'onboarding' | 'check_in' | 'milestone_review' | 'completion'
  riskLevel: RiskLevel
  daysFromStart: number // Days from order creation
  isRecurring?: boolean
  recurringIntervalDays?: number
  recurringCount?: number
}

// Event types that trigger task creation
export type OrderTaskEvent =
  | 'order_created'
  | 'order_accepted'
  | 'milestone_created'
  | 'order_in_progress'
  | 'milestone_submitted'
  | 'order_pending_completion'

// Templates for People Booking orders
const peopleBookingTemplates: Record<string, TaskTemplate[]> = {
  order_created: [
    {
      title: 'Onboard {providerName}',
      description: 'Complete onboarding process for the new provider. Share project details, access credentials, and communication preferences.',
      taskType: 'onboarding',
      riskLevel: 'Medium',
      daysFromStart: 0,
    },
  ],
  order_accepted: [
    {
      title: 'Weekly check-in with {providerName}',
      description: 'Conduct weekly progress review with the provider. Discuss achievements, blockers, and next week priorities.',
      taskType: 'check_in',
      riskLevel: 'Low',
      daysFromStart: 7,
      isRecurring: true,
      recurringIntervalDays: 7,
      recurringCount: 12, // 12 weeks max
    },
  ],
  order_pending_completion: [
    {
      title: 'Final review and release payment',
      description: 'Review all deliverables from {providerName}. Ensure all milestones are completed satisfactorily before releasing final payment.',
      taskType: 'completion',
      riskLevel: 'High',
      daysFromStart: 0,
    },
  ],
}

// Templates for Product RFQ orders
const productRfqTemplates: Record<string, TaskTemplate[]> = {
  order_created: [
    {
      title: 'Order placed: {listingTitle}',
      description: 'Order has been placed with {providerName}. Confirm order details and expected delivery timeline.',
      taskType: 'onboarding',
      riskLevel: 'Low',
      daysFromStart: 0,
    },
  ],
  order_in_progress: [
    {
      title: 'Production update: {listingTitle}',
      description: 'Check production progress with {providerName}. Verify timeline and quality standards are being met.',
      taskType: 'check_in',
      riskLevel: 'Medium',
      daysFromStart: 3,
      isRecurring: true,
      recurringIntervalDays: 7,
      recurringCount: 8,
    },
  ],
  order_pending_completion: [
    {
      title: 'Delivery QC: {listingTitle}',
      description: 'Perform quality control inspection on delivered products from {providerName}. Verify specifications match order.',
      taskType: 'completion',
      riskLevel: 'High',
      daysFromStart: 0,
    },
    {
      title: 'Approve delivery and release payment',
      description: 'Confirm delivery meets requirements and release payment to {providerName}.',
      taskType: 'completion',
      riskLevel: 'High',
      daysFromStart: 1,
    },
  ],
}

// Templates for Service orders (retainers)
const serviceTemplates: Record<string, TaskTemplate[]> = {
  order_created: [
    {
      title: 'Retainer setup with {providerName}',
      description: 'Initialize retainer agreement. Define scope, SLAs, communication channels, and reporting cadence.',
      taskType: 'onboarding',
      riskLevel: 'Medium',
      daysFromStart: 0,
    },
  ],
  order_accepted: [
    {
      title: 'Weekly review: {providerName} retainer',
      description: 'Review weekly performance against retainer SLAs. Discuss utilization, deliverables, and upcoming priorities.',
      taskType: 'check_in',
      riskLevel: 'Low',
      daysFromStart: 7,
      isRecurring: true,
      recurringIntervalDays: 7,
      recurringCount: 52, // Full year
    },
  ],
  order_pending_completion: [
    {
      title: 'Retainer renewal review: {providerName}',
      description: 'Assess retainer performance over the period. Decide on renewal, modification, or termination.',
      taskType: 'completion',
      riskLevel: 'High',
      daysFromStart: -14, // 14 days before end
    },
  ],
}

// Milestone-specific templates
export const milestoneTemplates: TaskTemplate[] = [
  {
    title: 'Review and approve milestone: {milestoneTitle}',
    description: 'Review deliverables for milestone "{milestoneTitle}" from {providerName}. Approve to release payment or request revisions.',
    taskType: 'milestone_review',
    riskLevel: 'High',
    daysFromStart: 0,
  },
]

// Get templates by order type
const templatesByOrderType: Record<OrderType, Record<string, TaskTemplate[]>> = {
  people_booking: peopleBookingTemplates,
  product_rfq: productRfqTemplates,
  service: serviceTemplates,
}

/**
 * Get task template(s) for a specific order type and event
 */
export function getTaskTemplate(
  orderType: OrderType,
  event: OrderTaskEvent
): TaskTemplate[] {
  const orderTemplates = templatesByOrderType[orderType]
  if (!orderTemplates) {
    return []
  }

  return orderTemplates[event] || []
}

/**
 * Get all task templates for an order type
 */
export function getAllTemplatesForOrderType(orderType: OrderType): TaskTemplate[] {
  const orderTemplates = templatesByOrderType[orderType]
  if (!orderTemplates) {
    return []
  }

  return Object.values(orderTemplates).flat()
}

/**
 * Replace placeholders in template strings
 */
export function formatTemplateText(
  text: string,
  variables: {
    providerName?: string
    listingTitle?: string
    milestoneTitle?: string
    orderId?: string
  }
): string {
  let result = text

  if (variables.providerName) {
    result = result.replace(/{providerName}/g, variables.providerName)
  }
  if (variables.listingTitle) {
    result = result.replace(/{listingTitle}/g, variables.listingTitle)
  }
  if (variables.milestoneTitle) {
    result = result.replace(/{milestoneTitle}/g, variables.milestoneTitle)
  }
  if (variables.orderId) {
    result = result.replace(/{orderId}/g, variables.orderId)
  }

  return result
}

/**
 * Calculate task due date from order creation date
 */
export function calculateTaskDueDate(
  orderCreatedAt: Date,
  daysFromStart: number,
  instanceIndex: number = 0,
  recurringIntervalDays: number = 0
): Date {
  const baseDate = new Date(orderCreatedAt)
  const totalDays = daysFromStart + (instanceIndex * recurringIntervalDays)
  baseDate.setDate(baseDate.getDate() + totalDays)
  return baseDate
}

/**
 * Generate all recurring task instances from a template
 */
export function expandRecurringTemplate(
  template: TaskTemplate,
  orderCreatedAt: Date,
  variables: Parameters<typeof formatTemplateText>[1]
): Array<{
  title: string
  description: string
  taskType: TaskTemplate['taskType']
  riskLevel: RiskLevel
  dueDate: Date
}> {
  const tasks: Array<{
    title: string
    description: string
    taskType: TaskTemplate['taskType']
    riskLevel: RiskLevel
    dueDate: Date
  }> = []

  const count = template.isRecurring ? (template.recurringCount || 1) : 1
  const interval = template.recurringIntervalDays || 0

  for (let i = 0; i < count; i++) {
    tasks.push({
      title: formatTemplateText(template.title, variables),
      description: formatTemplateText(template.description, variables),
      taskType: template.taskType,
      riskLevel: template.riskLevel,
      dueDate: calculateTaskDueDate(orderCreatedAt, template.daysFromStart, i, interval),
    })
  }

  return tasks
}
