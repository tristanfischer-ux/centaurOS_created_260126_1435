"use client"

import React, { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Target } from "lucide-react"
import type { ObjectiveNodeData } from "../types"

/**
 * @description Custom ReactFlow node for rendering objectives on the spatial canvas.
 * Shows title, health status, progress bar, and task counts.
 */

const HEALTH_CONFIG = {
  'on-track': { label: 'On Track', dot: 'bg-status-success', bg: 'bg-status-success-light', text: 'text-status-success-dark' },
  'at-risk': { label: 'At Risk', dot: 'bg-status-warning', bg: 'bg-status-warning-light', text: 'text-status-warning-dark' },
  'off-track': { label: 'Off Track', dot: 'bg-status-error', bg: 'bg-status-error-light', text: 'text-status-error-dark' },
  'completed': { label: 'Complete', dot: 'bg-status-success', bg: 'bg-status-success-light', text: 'text-status-success-dark' },
  'not-started': { label: 'Not Started', dot: 'bg-muted-foreground', bg: 'bg-muted', text: 'text-muted-foreground' },
} as const

function ObjectiveNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ObjectiveNodeData
  const health = HEALTH_CONFIG[nodeData.health] || HEALTH_CONFIG['not-started']
  const progress = nodeData.progress ?? 0

  return (
    <div
      className={`
        bg-background rounded-xl border-2 shadow-sm w-[280px] transition-all duration-200
        ${selected ? 'border-international-orange shadow-lg ring-2 ring-international-orange/20' : 'border-border hover:shadow-md hover:border-input'}
      `}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-international-orange/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Target className="w-4 h-4 text-international-orange" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
              {nodeData.label}
            </p>
            {nodeData.description && (
              <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                {nodeData.description}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Health & Progress */}
      <div className="px-4 py-3 space-y-2.5">
        {/* Health badge */}
        <div className="flex items-center justify-between">
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full ${health.bg} ${health.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${health.dot}`} />
            {health.label}
          </span>
          <span className="text-[11px] font-medium text-muted-foreground">
            {progress}%
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-international-orange transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>

        {/* Task counts */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>{nodeData.completedTasks}/{nodeData.totalTasks} tasks</span>
          {nodeData.overdueTasks > 0 && (
            <span className="text-status-error-dark font-medium">
              {nodeData.overdueTasks} overdue
            </span>
          )}
        </div>
      </div>

      {/* Handles for edges */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !bg-international-orange !border-2 !border-white"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !bg-international-orange !border-2 !border-white"
      />
    </div>
  )
}

export const ObjectiveNode = memo(ObjectiveNodeComponent)
