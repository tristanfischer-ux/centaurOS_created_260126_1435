"use client"

import React from "react"
import { X, Target, CheckSquare, ExternalLink } from "lucide-react"
import Link from "next/link"
import { getStatusColor } from "@/lib/status-colors"
import type { ObjectiveNodeData, TaskNodeData } from "../types"

/**
 * @description Side panel that shows details when a node is selected on the canvas.
 * Displays objective or task info with a link to the full detail page.
 */

interface CanvasDetailPanelProps {
  nodeType: 'objective' | 'task'
  data: ObjectiveNodeData | TaskNodeData
  onClose: () => void
}

const HEALTH_CONFIG = {
  'on-track': { label: 'On Track', className: 'bg-status-success-light text-status-success-dark' },
  'at-risk': { label: 'At Risk', className: 'bg-status-warning-light text-status-warning-dark' },
  'off-track': { label: 'Off Track', className: 'bg-status-error-light text-status-error-dark' },
  'completed': { label: 'Complete', className: 'bg-status-success-light text-status-success-dark' },
  'not-started': { label: 'Not Started', className: 'bg-muted text-muted-foreground' },
} as const

export function CanvasDetailPanel({ nodeType, data, onClose }: CanvasDetailPanelProps) {
  if (nodeType === 'objective') {
    const objData = data as ObjectiveNodeData
    const health = HEALTH_CONFIG[objData.health] || HEALTH_CONFIG['not-started']

    return (
      <div className="w-80 bg-white border-l border-slate-200 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-international-orange" />
            <span className="text-sm font-semibold text-foreground">Objective</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted transition-colors"
            aria-label="Close panel"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <h3 className="text-base font-semibold text-foreground leading-snug">
            {objData.label}
          </h3>

          {objData.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {objData.description}
            </p>
          )}

          {/* Health */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Health</p>
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${health.className}`}>
              {health.label}
            </span>
          </div>

          {/* Progress */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-medium text-muted-foreground">Progress</p>
              <span className="text-xs font-semibold text-foreground">{objData.progress}%</span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-international-orange transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, objData.progress))}%` }}
              />
            </div>
          </div>

          {/* Task counts */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="text-center p-2 rounded-lg bg-muted/50">
              <p className="text-lg font-bold text-foreground">{objData.totalTasks}</p>
              <p className="text-[10px] text-muted-foreground">Total</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-status-success-light/50">
              <p className="text-lg font-bold text-status-success-dark">{objData.completedTasks}</p>
              <p className="text-[10px] text-muted-foreground">Done</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-status-error-light/50">
              <p className="text-lg font-bold text-status-error-dark">{objData.overdueTasks}</p>
              <p className="text-[10px] text-muted-foreground">Overdue</p>
            </div>
          </div>
        </div>

        {/* Footer link */}
        <div className="px-4 py-3 border-t border-slate-100">
          <Link
            href={`/new-objectives?objectiveId=${objData.objectiveId}`}
            className="flex items-center justify-center gap-2 w-full px-3 py-2 text-sm font-medium text-international-orange bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open in Objectives
          </Link>
        </div>
      </div>
    )
  }

  // Task detail
  const taskData = data as TaskNodeData
  const statusColor = getStatusColor(taskData.status)

  return (
    <div className="w-80 bg-white border-l border-slate-200 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <CheckSquare className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Task</span>
          {taskData.taskNumber != null && (
            <span className="text-xs text-muted-foreground font-mono">#{taskData.taskNumber}</span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md hover:bg-muted transition-colors"
          aria-label="Close panel"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <h3 className="text-base font-semibold text-foreground leading-snug">
          {taskData.label}
        </h3>

        {/* Status */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Status</p>
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${statusColor.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusColor.bar}`} />
            {taskData.status?.replace(/_/g, ' ')}
          </span>
        </div>

        {/* Assignee */}
        {taskData.assigneeName && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Assignee</p>
            <span className="text-sm text-foreground">{taskData.assigneeName}</span>
          </div>
        )}

        {/* Due date */}
        {taskData.endDate && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Due Date</p>
            <span className="text-sm text-foreground">
              {new Date(taskData.endDate).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </div>
        )}

        {/* Progress */}
        {taskData.progress != null && taskData.progress > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-medium text-muted-foreground">Progress</p>
              <span className="text-xs font-semibold text-foreground">{taskData.progress}%</span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-status-info transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, taskData.progress))}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer link */}
      <div className="px-4 py-3 border-t border-slate-100">
        <Link
          href={`/new-tasks?taskId=${taskData.taskId}`}
          className="flex items-center justify-center gap-2 w-full px-3 py-2 text-sm font-medium text-international-orange bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open in Tasks
        </Link>
      </div>
    </div>
  )
}
