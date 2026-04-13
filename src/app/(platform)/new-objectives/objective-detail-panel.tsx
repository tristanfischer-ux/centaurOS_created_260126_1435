'use client'

import { cn } from '@/lib/utils'
import { ProgressRing, getHealthVariant } from '@/components/ui/progress-ring'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  X, ListChecks, AlertTriangle, Clock, CheckCircle2,
  FileText, Circle, Waypoints, ChevronRight, MessageSquare, Pencil, Flame,
} from 'lucide-react'
import Link from 'next/link'
import { getStatusBadgeClass } from '@/lib/status-colors'
import { AskSpecialistButton } from '@/components/specialists/ask-specialist-button'
import { useRelevantSpecialist } from '@/hooks/use-relevant-specialist'
import type { SpecialistContext } from '@/components/specialists/types'
import type { ObjectiveWithTasks, ObjectiveTask } from './types'

interface ObjectiveDetailPanelProps {
  objective: ObjectiveWithTasks
  onClose: () => void
  /** Called when a task row is clicked. Navigates to task detail. */
  onTaskSelect?: (taskId: string) => void
  /** Called when the user clicks the edit button. Opens the edit dialog. */
  onEdit?: (objective: ObjectiveWithTasks) => void
}

function TaskRow({ task, onClick }: { task: ObjectiveTask; onClick?: () => void }) {
  const isOverdue = task.end_date && task.status !== 'Completed' && new Date(task.end_date) < new Date()
  const statusBadge = getStatusBadgeClass(task.status)

  return (
    <div
      className={cn(
        "flex items-center gap-2 py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors group overflow-hidden",
        onClick && "cursor-pointer"
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
    >
      {/* Status indicator */}
      {task.status === 'Completed' ? (
        <CheckCircle2 className="h-4 w-4 text-status-success flex-shrink-0" />
      ) : (
        <Circle className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
      )}

      {/* Title */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-sm',
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

export function ObjectiveDetailPanel({ objective, onClose, onTaskSelect, onEdit }: ObjectiveDetailPanelProps) {
  const variant = getHealthVariant(objective.progress)

  // Group tasks by status
  const activeTasks = objective.tasks.filter(t => t.status !== 'Completed' && t.status !== 'Rejected')
  const completedTasks = objective.tasks.filter(t => t.status === 'Completed')

  // Auto-suggest a relevant specialist based on objective and strategy context
  const { specialistId, specialistName } = useRelevantSpecialist(
    objective.title,
    objective.description,
    objective.strategy?.title,
  )

  const objectiveContext: SpecialistContext = {
    type: 'objective',
    title: objective.title,
    description: objective.description ?? undefined,
    metadata: {
      health: objective.health,
      progress: objective.progress,
      pillarTitle: objective.strategy?.title,
      tasks: objective.tasks.map(t => ({ title: t.title, status: t.status })),
      notes: `${objective.completedTasks}/${objective.totalTasks} tasks done. ${objective.overdueTasks} overdue.`,
    },
  }

  return (
    <div className="h-full flex flex-col bg-background border-l border w-full max-w-full">
      {/* Header */}
      <div className="flex items-start justify-between px-5 py-4 border-b min-w-0">
        <div className="min-w-0 flex-1 space-y-1.5">
          {/* Strategic cascade breadcrumb: Strategy > This Objective */}
          {objective.strategy && (
            <nav aria-label="Strategic context" className="flex items-center gap-1 text-[11px]">
              <Waypoints className="h-3 w-3 text-international-orange flex-shrink-0" />
              <Link
                href="/strategy"
                className="font-medium text-international-orange hover:underline"
                title={objective.strategy.title}
              >
                {objective.strategy.title}
              </Link>
              <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
              <span className="text-muted-foreground" title={objective.title}>
                {objective.title}
              </span>
            </nav>
          )}
          <h2 className="text-base font-semibold text-foreground pr-4 min-w-0">
            {objective.title}
          </h2>
          {objective.metadata?.source_thread_id && (
            <Link
              href={`/the-forge?thread=${objective.metadata.source_thread_id}`}
              className="inline-flex items-center gap-1 text-[11px] text-international-orange hover:underline mt-0.5"
            >
              <Flame className="h-3 w-3" />
              Created from Forge
            </Link>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 mt-1">
          {onEdit && (
            <Button variant="ghost" size="icon" onClick={() => onEdit(objective)} className="h-8 w-8" aria-label="Edit objective">
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8" aria-label="Close panel">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 w-full max-w-full">
        <div className="p-5 space-y-6 w-full max-w-full">
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

          {/* Specialist Input Section */}
          <Separator />
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <MessageSquare className="h-3.5 w-3.5" />
              Get Specialist Input
            </div>
            <p className="text-xs text-muted-foreground">
              Discuss this objective&apos;s direction, priorities, or approach
            </p>
            <div className="flex items-center gap-2">
              <AskSpecialistButton
                context={objectiveContext}
                specialistId={specialistId}
                specialistName={specialistName}
                variant="chip"
              />
              <AskSpecialistButton
                context={objectiveContext}
                variant="chip"
                label="Choose Specialist"
              />
            </div>
          </div>

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
                  <TaskRow key={task.id} task={task} onClick={onTaskSelect ? () => onTaskSelect(task.id) : undefined} />
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
                  <TaskRow key={task.id} task={task} onClick={onTaskSelect ? () => onTaskSelect(task.id) : undefined} />
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
