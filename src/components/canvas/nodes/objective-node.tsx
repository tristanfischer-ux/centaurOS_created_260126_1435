'use client'

/**
 * @file objective-node.tsx
 *
 * @description Custom ReactFlow node for an Objective on the Canvas timeline.
 * Objectives hang below milestones as "tributaries". Ghost objectives have
 * dashed borders and reduced opacity.
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

export interface ObjectiveNodeData {
  title: string
  status: string | null
  isGhost: boolean
  ghostSource: string | null
  showOwners: boolean
  ownerId?: string | null
  ownerName?: string | null
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
}

// ============================================================================
// COMPONENT
// ============================================================================

function ObjectiveNodeComponent({ data, selected }: NodeProps) {
  const { title, status, isGhost, ghostSource, showOwners, ownerId, ownerName, isUnlinked } =
    data as unknown as ObjectiveNodeData
  const dotColor = STATUS_DOT[status ?? ''] ?? STATUS_DOT.Pending

  return (
    <div
      className={cn(
        'rounded-lg border bg-background px-3 py-2.5 shadow-sm cursor-pointer transition-all duration-150 hover:shadow-md hover:border-international-orange/40 active:scale-[0.98]',
        isGhost && 'border-dashed opacity-60',
        isUnlinked && 'border-l-[3px] border-l-muted-foreground/30',
        selected
          ? 'border-international-orange shadow-md ring-2 ring-international-orange/20'
          : !isUnlinked && 'border-border'
      )}
    >
      {/* Handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-muted-foreground !w-2 !h-2 !border-2 !border-background"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-muted-foreground !w-2 !h-2 !border-2 !border-background"
      />

      {/* Title row */}
      <div className="flex items-start gap-2">
        <span className={cn('mt-1.5 h-2 w-2 rounded-full flex-shrink-0', dotColor)} />
        <p className="text-sm font-medium text-foreground leading-tight line-clamp-2 flex-1" title={title}>
          {title}
        </p>
        {isGhost && (
          <span title="AI suggestion — click to accept or reject">
            <Ghost className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
          </span>
        )}
      </div>

      {/* Footer: owner badge + ghost/unlinked indicators */}
      <div className="flex items-center gap-2 mt-1.5 pl-4">
        {showOwners && ownerId && (
          <span
            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white flex-shrink-0"
            style={{ backgroundColor: ownerColor(ownerId) }}
            title={ownerName ?? undefined}
          >
            {(ownerName ?? '?').charAt(0).toUpperCase()}
          </span>
        )}
        {isGhost && ghostSource && (
          <span className="text-[10px] text-muted-foreground italic">
            {ghostSource}
          </span>
        )}
        {isUnlinked && (
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground" title="Not linked to a goal — click to connect">
            <Unlink className="h-2.5 w-2.5" />
            unlinked
          </span>
        )}
      </div>
    </div>
  )
}

export const ObjectiveNode = memo(ObjectiveNodeComponent)
