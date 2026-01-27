// Centralized status color definitions
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
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    badge: 'bg-gray-100 text-gray-700',
    bar: 'bg-gray-400',
    hex: '#9ca3af'
  },
  Accepted: {
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    badge: 'bg-blue-100 text-blue-700',
    bar: 'bg-blue-500',
    hex: '#3b82f6'
  },
  Completed: {
    bg: 'bg-green-100',
    text: 'text-green-700',
    badge: 'bg-green-100 text-green-700',
    bar: 'bg-green-500',
    hex: '#22c55e'
  },
  Rejected: {
    bg: 'bg-red-100',
    text: 'text-red-700',
    badge: 'bg-red-100 text-red-700',
    bar: 'bg-red-500',
    hex: '#ef4444'
  },
  Amended_Pending_Approval: {
    bg: 'bg-orange-100',
    text: 'text-orange-700',
    badge: 'bg-orange-100 text-orange-700',
    bar: 'bg-orange-500',
    hex: '#f97316'
  },
  Pending_Executive_Approval: {
    bg: 'bg-purple-100',
    text: 'text-purple-700',
    badge: 'bg-purple-100 text-purple-700',
    bar: 'bg-purple-500',
    hex: '#a855f7'
  },
  Pending_Peer_Review: {
    bg: 'bg-cyan-100',
    text: 'text-cyan-700',
    badge: 'bg-cyan-100 text-cyan-700',
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
