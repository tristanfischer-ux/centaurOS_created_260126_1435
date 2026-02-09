'use client'

/**
 * @file divider-node.tsx
 *
 * @description Custom ReactFlow node that renders a horizontal dashed divider
 * line with a label. Used to visually separate the structured strategic zone
 * from the unstructured zone on the Canvas timeline.
 *
 * @component
 */

import React, { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { Unlink } from 'lucide-react'

// ============================================================================
// DATA TYPE
// ============================================================================

export interface DividerNodeData {
  label: string
  [key: string]: unknown
}

/** Width of the divider line in pixels */
const DIVIDER_WIDTH = 4000

// ============================================================================
// COMPONENT
// ============================================================================

function DividerNodeComponent({ data }: NodeProps) {
  const { label } = data as unknown as DividerNodeData

  return (
    <div
      style={{ width: DIVIDER_WIDTH }}
      className="relative flex items-center"
    >
      {/* Dashed line */}
      <div className="absolute inset-x-0 top-1/2 border-t-2 border-dashed border-muted-foreground/20" />

      {/* Label pill */}
      <div className="relative z-10 flex items-center gap-1.5 bg-background px-3 py-1 rounded-full border border-muted text-xs text-muted-foreground font-medium">
        <Unlink className="h-3 w-3" />
        {label}
      </div>
    </div>
  )
}

export const DividerNode = memo(DividerNodeComponent)
