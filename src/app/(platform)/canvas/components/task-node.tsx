"use client"

import React, { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { CheckSquare, AlertTriangle, Clock } from "lucide-react"
import { getStatusColor } from "@/lib/status-colors"
import type { TaskNodeData } from "../types"

/**
 * @description Custom ReactFlow node for rendering tasks on the spatial canvas.
 * Shows title, status badge, assignee, and due date.
 */

function TaskNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as TaskNodeData
  const statusColor = getStatusColor(nodeData.status)

  const isOverdue = nodeData.endDate && new Date(nodeData.endDate) < new Date() && nodeData.status !== 'Completed'
  const isHighRisk = nodeData.riskLevel === 'high' || nodeData.riskLevel === 'critical'

  /** Format a date string to a short display format */
  function formatDate(dateStr: string): string {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div
      className={`
        bg-white rounded-lg border shadow-sm w-[220px] transition-all duration-200
        ${selected ? 'border-international-orange shadow-md ring-2 ring-international-orange/20' : 'border-border hover:shadow-md hover:border-slate-300'}
      `}
    >
      <div className="px-3 py-2.5">
        {/* Status bar at top */}
        <div className="flex items-center gap-2 mb-1.5">
          <div className={`w-1 h-4 rounded-full ${statusColor.bar}`} />
          <span className={`text-[10px] font-medium ${statusColor.text}`}>
            {nodeData.status?.replace(/_/g, ' ')}
          </span>
          {nodeData.taskNumber != null && (
            <span className="text-[10px] text-muted-foreground ml-auto font-mono">
              #{nodeData.taskNumber}
            </span>
          )}
        </div>

        {/* Title */}
        <div className="flex items-start gap-2">
          <CheckSquare className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
          <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">
            {nodeData.label}
          </p>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {nodeData.assigneeName && (
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md truncate max-w-[100px]">
              {nodeData.assigneeName}
            </span>
          )}
          {nodeData.endDate && (
            <span className={`inline-flex items-center gap-0.5 text-[10px] ${isOverdue ? 'text-status-error-dark font-medium' : 'text-muted-foreground'}`}>
              <Clock className="w-2.5 h-2.5" />
              {formatDate(nodeData.endDate)}
            </span>
          )}
          {isHighRisk && (
            <AlertTriangle className="w-3 h-3 text-status-warning" />
          )}
        </div>
      </div>

      {/* Handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-slate-400 !border-2 !border-white"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-slate-400 !border-2 !border-white"
      />
    </div>
  )
}

export const TaskNode = memo(TaskNodeComponent)
