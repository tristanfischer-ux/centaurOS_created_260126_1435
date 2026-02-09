'use client'

/**
 * @file expand-node.tsx
 *
 * @description "+N more" collapsed indicator node. Shown when a milestone
 * has more objectives than MAX_VISIBLE_OBJECTIVES. Clicking expands the
 * collapsed group in the parent component's state.
 *
 * @component
 */

import React, { memo } from 'react'
import { type NodeProps } from '@xyflow/react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// ============================================================================
// DATA TYPE
// ============================================================================

export interface ExpandNodeData {
  count: number
  milestoneId: string
  [key: string]: unknown
}

// ============================================================================
// COMPONENT
// ============================================================================

function ExpandNodeComponent({ data, selected }: NodeProps) {
  const { count } = data as unknown as ExpandNodeData

  return (
    <div
      className={cn(
        'rounded-md border border-dashed bg-muted/50 px-3 py-2 flex items-center justify-center gap-1.5 cursor-pointer',
        'text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors',
        selected && 'ring-2 ring-international-orange/20'
      )}
    >
      <ChevronDown className="h-3.5 w-3.5" />
      +{count} more
    </div>
  )
}

export const ExpandNode = memo(ExpandNodeComponent)
