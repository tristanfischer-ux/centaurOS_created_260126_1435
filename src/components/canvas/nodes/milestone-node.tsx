'use client'

/**
 * @file milestone-node.tsx
 *
 * @description Custom ReactFlow node for a Milestone on the Canvas timeline.
 * Milestones sit on the "spine" and represent time-bound checkpoints
 * leading to the strategic goal.
 *
 * @component
 */

import React, { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { cn } from '@/lib/utils'

// ============================================================================
// DATA TYPE
// ============================================================================

export interface MilestoneNodeData {
  title: string
  dueDate: string | null
  status: string | null
  showOwners: boolean
  [key: string]: unknown
}

// ============================================================================
// STATUS CONFIG
// ============================================================================

const STATUS_DOT: Record<string, string> = {
  Completed: 'bg-status-success',
  'In Progress': 'bg-status-info',
  Pending: 'bg-muted-foreground',
  Blocked: 'bg-destructive',
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })
}

// ============================================================================
// COMPONENT
// ============================================================================

function MilestoneNodeComponent({ data, selected }: NodeProps) {
  const { title, dueDate, status } = data as unknown as MilestoneNodeData
  const dotColor = STATUS_DOT[status ?? ''] ?? STATUS_DOT.Pending

  return (
    <div
      className={cn(
        'rounded-lg border bg-background px-3 py-2.5 shadow-sm transition-shadow',
        selected
          ? 'border-international-orange shadow-md ring-2 ring-international-orange/20'
          : 'border-border'
      )}
    >
      {/* Handles */}
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-muted-foreground !w-2 !h-2 !border-2 !border-background"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-muted-foreground !w-2 !h-2 !border-2 !border-background"
      />
      {/* Bottom handle for tributary edges to objectives */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="tributary"
        className="!bg-muted-foreground !w-2 !h-2 !border-2 !border-background"
      />

      {/* Title row with status dot */}
      <div className="flex items-start gap-2">
        <span className={cn('mt-1.5 h-2 w-2 rounded-full flex-shrink-0', dotColor)} />
        <p className="text-sm font-medium text-foreground leading-tight line-clamp-2 flex-1" title={title}>
          {title}
        </p>
      </div>

      {/* Due date */}
      {dueDate && (
        <p className="text-[11px] text-muted-foreground mt-1.5 pl-4">
          {formatDate(dueDate)}
        </p>
      )}
    </div>
  )
}

export const MilestoneNode = memo(MilestoneNodeComponent)
