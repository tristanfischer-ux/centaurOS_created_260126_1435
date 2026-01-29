// Centralized status color definitions using semantic tokens
export type TaskStatus = 
  | 'Pending'
  | 'Accepted'
  | 'Completed'
  | 'Rejected'
  | 'Amended_Pending_Approval'
  | 'Pending_Executive_Approval'
  | 'Pending_Peer_Review'

export const STATUS_COLORS: Record<TaskStatus, {
  bg: string
  text: string
  badge: string
  bar: string
  hex: string
}> = {
  Pending: {
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    badge: 'bg-muted text-muted-foreground',
    bar: 'bg-muted-foreground',
    hex: '#9ca3af'
  },
  Accepted: {
    bg: 'bg-status-info-light',
    text: 'text-status-info-dark',
    badge: 'bg-status-info-light text-status-info-dark dark:bg-status-info-dark dark:text-status-info-light',
    bar: 'bg-status-info',
    hex: '#3b82f6'
  },
  Completed: {
    bg: 'bg-status-success-light',
    text: 'text-status-success-dark',
    badge: 'bg-status-success-light text-status-success-dark dark:bg-status-success-dark dark:text-status-success-light',
    bar: 'bg-status-success',
    hex: '#22c55e'
  },
  Rejected: {
    bg: 'bg-status-error-light',
    text: 'text-status-error-dark',
    badge: 'bg-status-error-light text-status-error-dark dark:bg-status-error-dark dark:text-status-error-light',
    bar: 'bg-status-error',
    hex: '#ef4444'
  },
  Amended_Pending_Approval: {
    bg: 'bg-status-warning-light',
    text: 'text-status-warning-dark',
    badge: 'bg-status-warning-light text-status-warning-dark dark:bg-status-warning-dark dark:text-status-warning-light',
    bar: 'bg-status-warning',
    hex: '#f97316'
  },
  Pending_Executive_Approval: {
    bg: 'bg-purple-100',
    text: 'text-purple-700',
    badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-100',
    bar: 'bg-purple-500',
    hex: '#a855f7'
  },
  Pending_Peer_Review: {
    bg: 'bg-cyan-100',
    text: 'text-cyan-700',
    badge: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-100',
    bar: 'bg-cyan-500',
    hex: '#06b6d4'
  }
}

export function getStatusColor(status: string | null) {
  return STATUS_COLORS[status as TaskStatus] || STATUS_COLORS.Pending
}

export function getStatusBadgeClass(status: string | null) {
  return getStatusColor(status).badge
}

export function getStatusBarClass(status: string | null) {
  return getStatusColor(status).bar
}

export function getStatusHex(status: string | null) {
  return getStatusColor(status).hex
}
