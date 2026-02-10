'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Flag } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Data shape for a strategy node in the React Flow link canvas.
 */
export interface StrategyNodeData {
  label: string
  linkedCount: number
  [key: string]: unknown
}

/**
 * StrategyNode — Custom React Flow node for strategic objectives.
 *
 * @description Renders as a prominent card with an orange accent,
 * title, and linked objective count. Has a bottom target handle
 * so objectives can connect to it.
 */
function StrategyNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as StrategyNodeData

  return (
    <div
      className={cn(
        'rounded-xl border-2 bg-background shadow-md px-5 py-4 min-w-[180px] max-w-[240px] transition-shadow',
        selected
          ? 'border-international-orange shadow-lg ring-2 ring-international-orange/20'
          : 'border-international-orange/30 hover:shadow-lg'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="h-7 w-7 rounded-lg bg-international-orange/10 flex items-center justify-center">
          <Flag className="h-3.5 w-3.5 text-international-orange" />
        </div>
        <span className="text-[10px] font-medium text-international-orange uppercase tracking-wider">
          Strategy
        </span>
      </div>

      {/* Title */}
      <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
        {nodeData.label}
      </p>

      {/* Linked count */}
      {nodeData.linkedCount > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {nodeData.linkedCount} objective{nodeData.linkedCount !== 1 ? 's' : ''} linked
        </p>
      )}

      {/* Bottom handle — objectives connect TO strategies */}
      <Handle
        type="target"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-international-orange !border-2 !border-background"
      />
    </div>
  )
}

export const StrategyNode = memo(StrategyNodeComponent)
