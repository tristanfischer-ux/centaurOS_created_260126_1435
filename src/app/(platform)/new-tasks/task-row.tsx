'use client'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { getStatusBadgeClass } from '@/lib/status-colors'
import { CheckCircle2, Circle, AlertTriangle, MessageSquare, Paperclip } from 'lucide-react'
import type { TaskWithData } from './types'

interface TaskRowProps {
  task: TaskWithData
  isSelected: boolean
  onSelect: (id: string) => void
  showObjective?: boolean
}

export function TaskRow({ task, isSelected, onSelect, showObjective = true }: TaskRowProps) {
  const isOverdue = task.end_date && task.status !== 'Completed' && task.status !== 'Rejected' &&
    new Date(task.end_date) < new Date()
  const isDueToday = task.end_date && !isOverdue && task.status !== 'Completed' && task.status !== 'Rejected' &&
    new Date(task.end_date).toDateString() === new Date().toDateString()
  const statusBadge = getStatusBadgeClass(task.status)

  return (
    <button
      onClick={() => onSelect(task.id)}
      className={cn(
        'w-full flex items-center gap-3 py-2.5 px-4 text-left transition-all duration-150 rounded-lg',
        'hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isSelected && 'bg-international-orange/5 ring-1 ring-international-orange/20',
      )}
    >
      {/* Status icon */}
      {task.status === 'Completed' ? (
        <CheckCircle2 className="h-4 w-4 text-status-success flex-shrink-0" />
      ) : (
        <Circle className="h-4 w-4 text-muted-foreground/30 flex-shrink-0" />
      )}

      {/* Title */}
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <span className={cn(
          'text-sm truncate',
          task.status === 'Completed' ? 'text-muted-foreground line-through' : 'text-foreground'
        )}>
          {task.title}
        </span>
        {task.is_demo && (
          <span className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground bg-muted rounded px-1.5 py-0 shrink-0 font-medium">
            Demo
          </span>
        )}
      </div>

      {/* Objective tag */}
      {showObjective && task.objective && (
        <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full truncate max-w-[120px] flex-shrink-0">
          {task.objective.title}
        </span>
      )}

      {/* Indicators: messages, attachments */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {task.message_count > 0 && (
          <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
            <MessageSquare className="h-3 w-3" />
            <span className="tabular-nums">{task.message_count}</span>
          </span>
        )}
        {task.task_files.length > 0 && (
          <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
            <Paperclip className="h-3 w-3" />
          </span>
        )}
      </div>

      {/* Assignee - prefer task_assignees over legacy assignee_id */}
      {(() => {
        const primary = task.assignees?.length > 0 ? task.assignees[0] : task.assignee
        return primary?.full_name ? (
          <div
            className="h-6 w-6 rounded-full bg-muted border border-slate-200 flex items-center justify-center text-[9px] font-semibold text-muted-foreground flex-shrink-0"
            title={primary.full_name}
          >
            {primary.full_name[0].toUpperCase()}
          </div>
        ) : null
      })()}

      {/* Due date */}
      {task.end_date && (
        <span className={cn(
          'text-[11px] tabular-nums flex-shrink-0 inline-flex items-center gap-1',
          isOverdue ? 'text-status-error font-medium' : isDueToday ? 'text-status-warning font-medium' : 'text-muted-foreground'
        )}>
          {isOverdue && <AlertTriangle className="h-3 w-3" />}
          {new Date(task.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
        </span>
      )}

      {/* Status badge */}
      <Badge className={cn('text-[10px] flex-shrink-0', statusBadge)}>
        {task.status.replace(/_/g, ' ')}
      </Badge>
    </button>
  )
}
