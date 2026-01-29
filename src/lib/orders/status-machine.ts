/**
 * Order Status Machine
 * Defines valid status transitions and available actions based on status and role
 */

import { OrderStatus, OrderRole, OrderAction } from '@/types/orders'

// Valid status transitions
const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['accepted', 'cancelled'],
  accepted: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'disputed', 'cancelled'],
  disputed: ['in_progress', 'cancelled', 'completed'],
  completed: [], // Terminal state
  cancelled: [], // Terminal state
}

// Terminal states (no further transitions allowed)
const TERMINAL_STATES: OrderStatus[] = ['completed', 'cancelled']

/**
 * Check if a status transition is valid
 * 
 * @param currentStatus - The current order status
 * @param newStatus - The desired new status
 * @returns true if the transition is valid, false otherwise
 */
export function canTransition(currentStatus: OrderStatus, newStatus: OrderStatus): boolean {
  const allowedTransitions = STATUS_TRANSITIONS[currentStatus]
  return allowedTransitions?.includes(newStatus) ?? false
}

/**
 * Get all possible status transitions from a given status
 * 
 * @param currentStatus - The current order status
 * @returns Array of possible next statuses
 */
export function getNextStatuses(currentStatus: OrderStatus): OrderStatus[] {
  return STATUS_TRANSITIONS[currentStatus] ?? []
}

/**
 * Check if a status is terminal (no further transitions possible)
 * 
 * @param status - The status to check
 * @returns true if terminal, false otherwise
 */
export function isTerminalStatus(status: OrderStatus): boolean {
  return TERMINAL_STATES.includes(status)
}

/**
 * Get available actions for an order based on its status and the user's role
 * 
 * @param status - The current order status
 * @param userRole - The user's role (buyer or seller)
 * @param isDisputeOpen - Whether there's an open dispute
 * @returns Array of available actions
 */
export function getAvailableActions(
  status: OrderStatus,
  userRole: OrderRole,
  isDisputeOpen: boolean = false
): OrderAction[] {
  const actions: OrderAction[] = []

  // Actions based on status and role
  switch (status) {
    case 'pending':
      if (userRole === 'seller') {
        actions.push({
          action: 'accept',
          label: 'Accept Order',
          variant: 'success',
          requiresConfirmation: true,
          confirmationMessage: 'Are you sure you want to accept this order? This will commit you to fulfilling it.',
        })
        actions.push({
          action: 'decline',
          label: 'Decline Order',
          variant: 'destructive',
          requiresConfirmation: true,
          confirmationMessage: 'Are you sure you want to decline this order? The buyer will be notified.',
        })
      }
      if (userRole === 'buyer') {
        actions.push({
          action: 'cancel',
          label: 'Cancel Order',
          variant: 'outline',
          requiresConfirmation: true,
          confirmationMessage: 'Are you sure you want to cancel this order? This cannot be undone.',
        })
      }
      break

    case 'accepted':
      if (userRole === 'seller') {
        actions.push({
          action: 'start',
          label: 'Start Work',
          variant: 'default',
          requiresConfirmation: false,
        })
        actions.push({
          action: 'cancel',
          label: 'Cancel Order',
          variant: 'destructive',
          requiresConfirmation: true,
          confirmationMessage: 'Are you sure you want to cancel this order? A refund may be issued to the buyer.',
        })
      }
      if (userRole === 'buyer') {
        actions.push({
          action: 'cancel',
          label: 'Cancel Order',
          variant: 'outline',
          requiresConfirmation: true,
          confirmationMessage: 'Are you sure you want to cancel this order? This may be subject to cancellation fees.',
        })
      }
      break

    case 'in_progress':
      if (userRole === 'seller') {
        actions.push({
          action: 'complete',
          label: 'Mark Complete',
          variant: 'success',
          requiresConfirmation: true,
          confirmationMessage: 'Are you sure you want to mark this order as complete? The buyer will be asked to approve.',
        })
        actions.push({
          action: 'submit_milestone',
          label: 'Submit Milestone',
          variant: 'default',
          requiresConfirmation: false,
        })
      }
      if (userRole === 'buyer') {
        if (!isDisputeOpen) {
          actions.push({
            action: 'dispute',
            label: 'Open Dispute',
            variant: 'warning',
            requiresConfirmation: true,
            confirmationMessage: 'Are you sure you want to open a dispute? A mediator will be assigned to help resolve the issue.',
          })
        }
        actions.push({
          action: 'approve_milestone',
          label: 'Approve Milestone',
          variant: 'success',
          requiresConfirmation: true,
          confirmationMessage: 'Are you sure you want to approve this milestone? Payment will be released to the seller.',
        })
      }
      // Both parties can cancel during in_progress, but with restrictions
      actions.push({
        action: 'cancel',
        label: 'Request Cancellation',
        variant: 'outline',
        requiresConfirmation: true,
        confirmationMessage: 'Are you sure you want to request cancellation? This may require approval from the other party.',
      })
      break

    case 'disputed':
      if (userRole === 'buyer') {
        actions.push({
          action: 'approve_completion',
          label: 'Approve & Close Dispute',
          variant: 'success',
          requiresConfirmation: true,
          confirmationMessage: 'Are you sure you want to approve the order and close the dispute? Payment will be released.',
        })
      }
      if (userRole === 'seller') {
        actions.push({
          action: 'resume_work',
          label: 'Resume Work',
          variant: 'default',
          requiresConfirmation: false,
        })
      }
      // Both can view dispute details
      actions.push({
        action: 'view_dispute',
        label: 'View Dispute Details',
        variant: 'secondary',
        requiresConfirmation: false,
      })
      break

    case 'completed':
      if (userRole === 'buyer') {
        actions.push({
          action: 'leave_review',
          label: 'Leave Review',
          variant: 'default',
          requiresConfirmation: false,
        })
      }
      // View order details is always available
      actions.push({
        action: 'view_details',
        label: 'View Details',
        variant: 'secondary',
        requiresConfirmation: false,
      })
      break

    case 'cancelled':
      // Only view actions available for cancelled orders
      actions.push({
        action: 'view_details',
        label: 'View Details',
        variant: 'secondary',
        requiresConfirmation: false,
      })
      break
  }

  // Message action is always available for non-terminal states
  if (!isTerminalStatus(status)) {
    actions.push({
      action: 'message',
      label: 'Send Message',
      variant: 'outline',
      requiresConfirmation: false,
    })
  }

  return actions
}

/**
 * Get the status that represents the order being "active" (not finished)
 */
export function isActiveStatus(status: OrderStatus): boolean {
  return ['pending', 'accepted', 'in_progress', 'disputed'].includes(status)
}

/**
 * Get the next logical status for an order based on an action
 * 
 * @param action - The action being taken
 * @param currentStatus - The current order status
 * @returns The new status, or null if the action doesn't change status
 */
export function getStatusForAction(action: string, currentStatus: OrderStatus): OrderStatus | null {
  const actionStatusMap: Record<string, OrderStatus> = {
    accept: 'accepted',
    decline: 'cancelled',
    start: 'in_progress',
    complete: 'completed',
    dispute: 'disputed',
    cancel: 'cancelled',
    resume_work: 'in_progress',
    approve_completion: 'completed',
  }

  const newStatus = actionStatusMap[action]
  if (!newStatus) return null
  
  // Validate the transition is allowed
  if (canTransition(currentStatus, newStatus)) {
    return newStatus
  }
  
  return null
}

/**
 * Get a human-readable label for a status
 */
export function getStatusLabel(status: OrderStatus): string {
  const labels: Record<OrderStatus, string> = {
    pending: 'Pending',
    accepted: 'Accepted',
    in_progress: 'In Progress',
    completed: 'Completed',
    disputed: 'Disputed',
    cancelled: 'Cancelled',
  }
  return labels[status] ?? status
}

/**
 * Get a description for a status
 */
export function getStatusDescription(status: OrderStatus): string {
  const descriptions: Record<OrderStatus, string> = {
    pending: 'Awaiting seller acceptance',
    accepted: 'Order accepted, awaiting start',
    in_progress: 'Work is in progress',
    completed: 'Order has been completed',
    disputed: 'A dispute has been raised',
    cancelled: 'Order has been cancelled',
  }
  return descriptions[status] ?? ''
}
