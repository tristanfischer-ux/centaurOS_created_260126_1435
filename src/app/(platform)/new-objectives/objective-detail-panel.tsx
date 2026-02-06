'use client'

import { cn } from '@/lib/utils'
import { ProgressRing, getHealthVariant } from '@/components/ui/progress-ring'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  X, ListChecks, AlertTriangle, Clock, CheckCircle2,
  FileText, Circle,
} from 'lucide-react'
import { getStatusBadgeClass } from '@/lib/status-colors'
import type { ObjectiveWithTasks, ObjectiveTask } from './types'

interface ObjectiveDetailPanelProps {
  objective: ObjectiveWithTasks
  onClose: () => void
}

function TaskRow({ task }: { task: ObjectiveTask }) {
  const isOverdue = task.end_date && task.status !== 'Completed' && new Date(task.end_date) < new Date()
  const statusBadge = getStatusBadgeClass(task.status)

  return (
    <div className="flex items-center gap-2 py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors group overflow-hidden">
      {/* Status indicator */}
      {task.status === 'Completed' ? (
        <CheckCircle2 className="h-4 w-4 text-status-success flex-shrink-0" />
      ) : (
        <Circle className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
      )}

      {/* Title */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-sm truncate',
          task.status === 'Completed' ? 'text-muted-foreground line-through' : 'text-foreground'
        )}>
          {task.title}
        </p>
      </div>

      {/* Due date */}
      {task.end_date && (
        <span className={cn(
          'text-[11px] tabular-nums flex-shrink-0',
          isOverdue ? 'text-status-error font-medium' : 'text-muted-foreground'
        )}>
          {new Date(task.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
        </span>
      )}

      {/* Status badge */}
      <Badge className={cn('text-[10px] flex-shrink-0', statusBadge)}>
        {task.status.replace(/_/g, ' ')}
      </Badge>
    </div>
  )
}

export function ObjectiveDetailPanel({ objective, onClose }: ObjectiveDetailPanelProps) {
  const variant = getHealthVariant(objective.progress)

  // Group tasks by status
  const activeTasks = objective.tasks.filter(t => t.status !== 'Completed' && t.status !== 'Rejected')
  const completedTasks = objective.tasks.filter(t => t.status === 'Completed')

  return (
    <div className="h-full flex flex-col bg-white border-l border-slate-100 w-full max-w-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 min-w-0">
        <h2 className="text-base font-semibold text-foreground truncate pr-4 min-w-0">
          {objective.title}
        </h2>
        <Button variant="ghost" size="icon" onClick={onClose} className="flex-shrink-0 h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 w-full max-w-full">
        <div className="p-5 space-y-6 w-full max-w-full overflow-hidden">
          {/* Progress Section */}
          <div className="flex items-center gap-4">
            <ProgressRing progress={objective.progress} size={64} strokeWidth={5} variant={variant} />
            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground">
                {objective.completedTasks} of {objective.totalTasks} tasks completed
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {objective.overdueTasks > 0 && (
                  <span className="inline-flex items-center gap-1 text-status-error">
                    <AlertTriangle className="h-3 w-3" />
                    {objective.overdueTasks} overdue
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Created {new Date(objective.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
            </div>
          </div>

          {/* Description */}
          {objective.description && (
            <>
              <Separator />
              <div className="space-y-2 min-w-0 w-full">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                  Description
                </div>
                <p className="text-sm text-foreground leading-relaxed break-words overflow-wrap-anywhere whitespace-pre-wrap" style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                  {objective.description}
                </p>
              </div>
            </>
          )}

          {/* Extended description */}
          {objective.extended_description && (
            <div className="space-y-2 min-w-0 w-full">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Details
              </div>
              <p className="text-sm text-foreground leading-relaxed break-words whitespace-pre-wrap" style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                {objective.extended_description.length > 500
                  ? objective.extended_description.slice(0, 500) + '...'
                  : objective.extended_description}
              </p>
            </div>
          )}

          {/* Tasks Section */}
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <ListChecks className="h-3.5 w-3.5" />
                Tasks ({objective.totalTasks})
              </div>
            </div>

            {/* Active tasks */}
            {activeTasks.length > 0 && (
              <div className="space-y-0.5">
                <div className="text-[11px] font-medium text-muted-foreground px-3 py-1">
                  Active ({activeTasks.length})
                </div>
                {activeTasks.map(task => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </div>
            )}

            {/* Completed tasks */}
            {completedTasks.length > 0 && (
              <div className="space-y-0.5">
                <div className="text-[11px] font-medium text-muted-foreground px-3 py-1">
                  Completed ({completedTasks.length})
                </div>
                {completedTasks.map(task => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </div>
            )}

            {objective.totalTasks === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No tasks yet. Create tasks to track progress.
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
