'use client'

import { cn } from '@/lib/utils'
import { ProgressRing, getHealthVariant } from '@/components/ui/progress-ring'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, ListChecks } from 'lucide-react'
import type { ObjectiveWithTasks } from './types'

interface ObjectiveCardProps {
  objective: ObjectiveWithTasks
  isSelected: boolean
  onSelect: (id: string) => void
}

const HEALTH_BORDER: Record<string, string> = {
  'on-track': 'border-l-status-success',
  'at-risk': 'border-l-status-warning',
  'off-track': 'border-l-status-error',
  'completed': 'border-l-status-success',
  'not-started': 'border-l-muted-foreground/30',
}

const HEALTH_LABEL: Record<string, { text: string; className: string }> = {
  'on-track': { text: 'On Track', className: 'bg-status-success/10 text-status-success border-status-success/20' },
  'at-risk': { text: 'At Risk', className: 'bg-status-warning/10 text-status-warning border-status-warning/20' },
  'off-track': { text: 'Off Track', className: 'bg-status-error/10 text-status-error border-status-error/20' },
  'completed': { text: 'Completed', className: 'bg-status-success/10 text-status-success border-status-success/20' },
  'not-started': { text: 'Not Started', className: 'bg-muted text-muted-foreground border-muted-foreground/20' },
}

export function ObjectiveCard({ objective, isSelected, onSelect }: ObjectiveCardProps) {
  const { title, description, progress, health, totalTasks, completedTasks, overdueTasks, tasks } = objective
  const variant = getHealthVariant(progress)

  // Get unique assignees across all tasks
  const uniqueAssignees = new Map<string, { id: string; full_name: string | null }>()
  tasks.forEach(t => {
    if (t.assignee?.id) uniqueAssignees.set(t.assignee.id, t.assignee)
    t.assignees?.forEach(a => { if (a?.id) uniqueAssignees.set(a.id, a) })
  })
  const assigneeList = Array.from(uniqueAssignees.values()).slice(0, 3)
  const extraAssignees = uniqueAssignees.size - 3

  const healthInfo = HEALTH_LABEL[health] || HEALTH_LABEL['not-started']

  return (
    <button
      onClick={() => onSelect(objective.id)}
      className={cn(
        'w-full text-left rounded-xl border-l-4 border bg-white',
        'transition-all duration-200 hover:shadow-md hover:-translate-y-0.5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        HEALTH_BORDER[health] || 'border-l-muted',
        isSelected
          ? 'ring-2 ring-international-orange/30 shadow-md border-slate-200'
          : 'border-slate-100 hover:border-slate-200'
      )}
    >
      <div className="p-4 space-y-3">
        {/* Header: Title + Health Badge */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">
            {title}
          </h3>
          <Badge variant="outline" className={cn('text-[10px] flex-shrink-0 border', healthInfo.className)}>
            {healthInfo.text}
          </Badge>
        </div>

        {/* Description */}
        {description && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {description}
          </p>
        )}

        {/* Progress + Stats Row */}
        <div className="flex items-center gap-4">
          <ProgressRing progress={progress} size={40} strokeWidth={3} variant={variant} />

          <div className="flex-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <ListChecks className="h-3.5 w-3.5" />
              <span className="tabular-nums">{completedTasks}/{totalTasks}</span>
            </span>
            {overdueTasks > 0 && (
              <span className="inline-flex items-center gap-1 text-status-error">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span className="tabular-nums">{overdueTasks}</span>
              </span>
            )}
          </div>

          {/* Assignee avatars */}
          {assigneeList.length > 0 && (
            <div className="flex -space-x-1.5">
              {assigneeList.map((a) => (
                <div
                  key={a.id}
                  className="h-6 w-6 rounded-full bg-muted border-2 border-white flex items-center justify-center text-[9px] font-semibold text-muted-foreground"
                  title={a.full_name || 'Unknown'}
                >
                  {(a.full_name || '?')[0].toUpperCase()}
                </div>
              ))}
              {extraAssignees > 0 && (
                <div className="h-6 w-6 rounded-full bg-muted border-2 border-white flex items-center justify-center text-[9px] font-medium text-muted-foreground">
                  +{extraAssignees}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}
