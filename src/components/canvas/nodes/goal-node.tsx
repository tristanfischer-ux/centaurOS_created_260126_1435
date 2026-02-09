'use client'

/**
 * @file goal-node.tsx
 *
 * @description Custom ReactFlow node for rendering a Strategic Goal on the
 * Canvas timeline. This is the terminus of the spine — the "north star"
 * that all milestones lead to.
 *
 * @component
 *
 * @example
 * // Registered as nodeTypes={{ goal: GoalNode }}
 * // Data shape set by goalBundleToElements in src/lib/canvas/layout.ts
 */

import React, { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Target } from 'lucide-react'
import { cn } from '@/lib/utils'

// ============================================================================
// DATA TYPE
// ============================================================================

export interface GoalNodeData {
  title: string
  targetDate: string | null
  status: string | null
  goalType: string | null
  [key: string]: unknown
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'No date'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// ============================================================================
// COMPONENT
// ============================================================================

function GoalNodeComponent({ data, selected }: NodeProps) {
  const { title, targetDate, status, goalType } = data as unknown as GoalNodeData

  return (
    <div
      className={cn(
        'rounded-lg border-2 bg-background px-4 py-3 shadow-md transition-shadow',
        selected
          ? 'border-international-orange shadow-lg ring-2 ring-international-orange/20'
          : 'border-international-orange/60'
      )}
    >
      {/* Target handle on the left (milestones connect here) */}
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-international-orange !w-2.5 !h-2.5 !border-2 !border-background"
      />

      {/* Header row: icon + type badge */}
      <div className="flex items-center gap-2 mb-1.5">
        <Target className="h-4 w-4 text-international-orange flex-shrink-0" />
        {goalType && (
          <span className="text-[10px] font-medium uppercase tracking-wider text-international-orange bg-international-orange/10 px-1.5 py-0.5 rounded">
            {goalType}
          </span>
        )}
      </div>

      {/* Title */}
      <p className="text-sm font-semibold text-foreground leading-tight line-clamp-2">
        {title}
      </p>

      {/* Footer: date + status */}
      <div className="flex items-center justify-between mt-2">
        <span className="text-[11px] text-muted-foreground">
          {formatDate(targetDate)}
        </span>
        {status && (
          <span className="text-[10px] font-medium text-muted-foreground">
            {status}
          </span>
        )}
      </div>
    </div>
  )
}

export const GoalNode = memo(GoalNodeComponent)
