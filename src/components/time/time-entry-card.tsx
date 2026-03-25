/**
 * @file time-entry-card.tsx — Compact card for a single time entry in the weekly grid.
 *
 * Displays duration badge, description, linked task/project chip, and status.
 * Click to edit (if draft). Delete button on hover AND focus-within (L-3 touch fix).
 */

'use client'

import { cn } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/status-badge'
import { Trash2, LinkIcon } from 'lucide-react'
import type { TimeEntryWithRelations, TimeEntryStatus } from '@/types/time-tracking'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// Re-export from pure utility so existing imports don't break
export { formatDuration } from '@/lib/format-duration'
import { formatDuration } from '@/lib/format-duration'

/** Map TimeEntryStatus to StatusBadge status prop */
function statusToVariant(status: TimeEntryStatus): 'pending' | 'info' | 'success' | 'error' {
  switch (status) {
    case 'draft': return 'pending'
    case 'submitted': return 'info'
    case 'approved': return 'success'
    case 'rejected': return 'error'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface TimeEntryCardProps {
  entry: TimeEntryWithRelations
  onEdit: (entry: TimeEntryWithRelations) => void
  onDelete: (id: string) => void
}

export function TimeEntryCard({ entry, onEdit, onDelete }: TimeEntryCardProps) {
  const isEditable = entry.status === 'draft' || entry.status === 'rejected'

  return (
    <div
      className={cn(
        'group relative rounded-md border bg-card p-2 transition-all duration-200',
        isEditable && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-sm',
        entry.isBillable && 'border-l-2 border-l-international-orange',
      )}
      onClick={() => isEditable && onEdit(entry)}
      role={isEditable ? 'button' : undefined}
      tabIndex={isEditable ? 0 : undefined}
      onKeyDown={(e) => {
        if (isEditable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onEdit(entry)
        }
      }}
    >
      {/* Top row: duration + status */}
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs font-semibold text-foreground tabular-nums">
          {formatDuration(entry.durationMinutes)}
        </span>
        <StatusBadge status={statusToVariant(entry.status)} size="sm" dot>
          {entry.status}
        </StatusBadge>
      </div>

      {/* Description */}
      {entry.description && (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
          {entry.description}
        </p>
      )}

      {/* Linked task or project */}
      {(entry.taskTitle || entry.projectName) && (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
          <LinkIcon className="h-2.5 w-2.5 flex-shrink-0" />
          <span className="truncate">
            {entry.taskTitle || entry.projectName}
          </span>
        </div>
      )}

      {/* L-3 fix: Delete button visible on hover AND focus-within (touch accessible) */}
      {entry.status === 'draft' && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete(entry.id)
          }}
          className="absolute top-1 right-1 hidden group-hover:flex group-focus-within:flex items-center justify-center h-5 w-5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          aria-label="Delete entry"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
