"use client"

import React, { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { CheckCircle2, Clock, AlertTriangle } from "lucide-react"
import { format } from "date-fns"
import { getStatusColor } from "@/lib/status-colors"
import { UserAvatar } from "@/components/ui/user-avatar"
import { cn } from "@/lib/utils"

/**
 * @description Strategic Task Node for the timeline canvas.
 * Rich card showing title, status, assignee avatars, date range,
 * progress bar, and critical path highlighting.
 */

interface StrategicTaskNodeData {
  label: string
  status: string
  riskLevel: string
  startDate: string | null
  endDate: string | null
  progress: number | null
  assignees: Array<{ id: string; full_name: string | null; role: string | null }>
  isCriticalPath: boolean
  width: number
}

function StrategicTaskNodeComponent({ data, selected }: NodeProps) {
  const d = data as unknown as StrategicTaskNodeData
  const statusColor = getStatusColor(d.status)
  const progress = d.progress ?? 0
  const isCompleted = d.status === 'Completed'
  const isOverdue = d.endDate && new Date(d.endDate) < new Date() && !isCompleted
  const isHighRisk = d.riskLevel === 'High'

  function formatShortDate(dateStr: string): string {
    return format(new Date(dateStr), 'MMM d')
  }

  return (
    <div
      className={cn(
        "rounded-lg border shadow-sm transition-all duration-200",
        "bg-background",
        d.isCriticalPath && !selected && "border-international-orange/60 shadow-[0_0_0_1px_hsl(var(--international-orange)/0.2)]",
        selected && "border-international-orange shadow-lg ring-2 ring-international-orange/20",
        !d.isCriticalPath && !selected && "border hover:shadow-md",
        isCompleted && "opacity-70"
      )}
      style={{ width: Math.max(d.width, 140) }}
    >
      <div className="px-3 py-2.5">
        {/* Status + risk row */}
        <div className="flex items-center gap-2 mb-1.5">
          <div className={cn("w-1 h-4 rounded-full", statusColor.bar)} />
          <span className={cn("text-[10px] font-medium", statusColor.text)}>
            {d.status?.replace(/_/g, ' ')}
          </span>
          {isHighRisk && (
            <AlertTriangle className="w-3 h-3 text-status-warning ml-auto" />
          )}
          {d.isCriticalPath && (
            <span className="text-[9px] font-semibold text-international-orange ml-auto uppercase tracking-wider">
              Critical
            </span>
          )}
        </div>

        {/* Title */}
        <p className="text-xs font-medium text-foreground leading-snug line-clamp-2 mb-2">
          {d.label}
        </p>

        {/* Progress bar */}
        {progress > 0 && (
          <div className="w-full h-1 bg-muted rounded-full overflow-hidden mb-2">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                d.isCriticalPath ? "bg-international-orange" : "bg-status-success"
              )}
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
        )}

        {/* Meta row: dates + assignees */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            {d.startDate && d.endDate && (
              <>
                <Clock className="w-2.5 h-2.5" />
                <span className={cn(isOverdue && "text-destructive font-medium")}>
                  {formatShortDate(d.startDate)} - {formatShortDate(d.endDate)}
                </span>
              </>
            )}
          </div>

          {/* Assignee avatars */}
          {d.assignees.length > 0 && (
            <div className="flex -space-x-1.5">
              {d.assignees.slice(0, 3).map((a) => (
                <UserAvatar
                  key={a.id}
                  name={a.full_name || 'Unknown'}
                  role={a.role || undefined}
                  size="xs"
                />
              ))}
              {d.assignees.length > 3 && (
                <span className="text-[9px] text-muted-foreground ml-1">
                  +{d.assignees.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Connection handles */}
      <Handle
        type="target"
        position={Position.Left}
        className={cn(
          "!w-2 !h-2 !border-2 !border-background",
          d.isCriticalPath ? "!bg-international-orange" : "!bg-muted-foreground/50"
        )}
      />
      <Handle
        type="source"
        position={Position.Right}
        className={cn(
          "!w-2 !h-2 !border-2 !border-background",
          d.isCriticalPath ? "!bg-international-orange" : "!bg-muted-foreground/50"
        )}
      />
    </div>
  )
}

export const StrategicTaskNode = memo(StrategicTaskNodeComponent)
