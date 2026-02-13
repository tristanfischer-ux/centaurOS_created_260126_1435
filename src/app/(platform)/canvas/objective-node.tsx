'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Target } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Data shape for an objective node in the React Flow link canvas.
 */
export interface ObjectiveNodeData {
  label: string
  progress: number
  status: string | null
  [key: string]: unknown
}

/**
 * Get a simple health color from progress percentage.
 */
function getProgressColor(progress: number): string {
  if (progress >= 100) return 'bg-status-success'
  if (progress >= 50) return 'bg-status-info'
  if (progress > 0) return 'bg-status-warning'
  return 'bg-muted-foreground/30'
}

/**
 * ObjectiveNode — Custom React Flow node for regular objectives.
 *
 * @description Renders as a compact card with title, progress bar,
 * and a top source handle that can be dragged to connect to a strategy node.
 */
function ObjectiveNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ObjectiveNodeData

  return (
    <div
      className={cn(
        'rounded-lg border bg-background shadow-sm px-4 py-3 min-w-[160px] max-w-[220px] transition-shadow',
        selected
          ? 'border-electric-blue shadow-md ring-2 ring-electric-blue/20'
          : 'border hover:shadow-md'
      )}
    >
      {/* Top handle — drag FROM objective TO strategy */}
      <Handle
        type="source"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !bg-electric-blue !border-2 !border-background"
      />

      {/* Icon + label */}
      <div className="flex items-start gap-2">
        <Target className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
        <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">
          {nodeData.label}
        </p>
      </div>

      {/* Progress bar */}
      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', getProgressColor(nodeData.progress))}
            style={{ width: `${Math.min(nodeData.progress, 100)}%` }}
          />
        </div>
        <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
          {nodeData.progress}%
        </span>
      </div>
    </div>
  )
}

export const ObjectiveNode = memo(ObjectiveNodeComponent)
