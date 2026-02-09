'use client'

/**
 * @file task-node.tsx
 *
 * @description Custom ReactFlow node for a Task on the Canvas timeline.
 * Compact design, sits below its parent objective. Ghost tasks have dashed
 * borders and reduced opacity.
 *
 * @component
 */

import React, { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Ghost, Unlink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ownerColor } from '@/lib/canvas/layout'

// ============================================================================
// DATA TYPE
// ============================================================================

export interface TaskNodeData {
  title: string
  status: string | null
  isGhost: boolean
  ghostSource: string | null
  assigneeName: string | null
  assigneeId: string | null
  showOwners: boolean
  isUnlinked?: boolean
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
  'To Do': 'bg-muted-foreground',
}

// ============================================================================
// COMPONENT
// ============================================================================

function TaskNodeComponent({ data, selected }: NodeProps) {
  const { title, status, isGhost, ghostSource, assigneeName, assigneeId, showOwners, isUnlinked } =
    data as unknown as TaskNodeData
  const dotColor = STATUS_DOT[status ?? ''] ?? STATUS_DOT.Pending

  return (
    <div
      className={cn(
        'rounded-md border bg-background px-2.5 py-2 shadow-sm transition-shadow text-xs',
        isGhost && 'border-dashed opacity-60',
        isUnlinked && 'border-l-[3px] border-l-muted-foreground/30',
        selected
          ? 'border-international-orange shadow-md ring-2 ring-international-orange/20'
          : !isUnlinked && 'border-border'
      )}
    >
      {/* Target handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-muted-foreground !w-1.5 !h-1.5 !border-2 !border-background"
      />

      {/* Content row */}
      <div className="flex items-center gap-1.5">
        <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', dotColor)} />
        <p className="font-medium text-foreground leading-tight line-clamp-1 flex-1">
          {title}
        </p>
        {isGhost && (
          <Ghost className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        )}
        {showOwners && assigneeId && (
          <span
            className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold text-white flex-shrink-0"
            style={{ backgroundColor: ownerColor(assigneeId) }}
            title={assigneeName ?? undefined}
          >
            {(assigneeName ?? '?').charAt(0).toUpperCase()}
          </span>
        )}
        {isUnlinked && (
          <Unlink className="h-2.5 w-2.5 text-muted-foreground flex-shrink-0" />
        )}
      </div>
    </div>
  )
}

export const TaskNode = memo(TaskNodeComponent)
