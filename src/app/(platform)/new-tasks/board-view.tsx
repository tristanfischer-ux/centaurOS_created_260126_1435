'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AlertTriangle, MessageSquare, Paperclip } from 'lucide-react'
import type { TaskWithData } from './types'

interface BoardViewProps {
  tasks: TaskWithData[]
  selectedId: string | null
  onSelect: (id: string) => void
}

interface BoardColumn {
  key: string
  label: string
  statuses: string[]
  color: string
  dotColor: string
}

const COLUMNS: BoardColumn[] = [
  {
    key: 'pending',
    label: 'Pending',
    statuses: ['Pending'],
    color: 'border-t-muted-foreground/40',
    dotColor: 'bg-muted-foreground',
  },
  {
    key: 'accepted',
    label: 'In Progress',
    statuses: ['Accepted'],
    color: 'border-t-status-info',
    dotColor: 'bg-status-info',
  },
  {
    key: 'review',
    label: 'In Review',
    statuses: ['Pending_Peer_Review', 'Pending_Executive_Approval', 'Amended_Pending_Approval'],
    color: 'border-t-status-warning',
    dotColor: 'bg-status-warning',
  },
  {
    key: 'completed',
    label: 'Completed',
    statuses: ['Completed'],
    color: 'border-t-status-success',
    dotColor: 'bg-status-success',
  },
]

function BoardCard({ task, isSelected, onSelect }: { task: TaskWithData; isSelected: boolean; onSelect: (id: string) => void }) {
  const isOverdue = task.end_date && task.status !== 'Completed' && new Date(task.end_date) < new Date()

  return (
    <button
      onClick={() => onSelect(task.id)}
      className={cn(
        'w-full text-left bg-white rounded-lg border p-3 space-y-2 transition-all duration-200',
        'hover:shadow-md hover:-translate-y-0.5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isSelected
          ? 'ring-2 ring-international-orange/30 shadow-md border-slate-200'
          : 'border-slate-100 hover:border-slate-200'
      )}
    >
      {/* Title */}
      <p className="text-sm font-medium text-foreground line-clamp-2 leading-snug">
        {task.title}
      </p>

      {/* Objective tag */}
      {task.objective && (
        <span className="inline-block text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full truncate max-w-full">
          {task.objective.title}
        </span>
      )}

      {/* Bottom row: assignee, date, indicators */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* Assignee - prefer task_assignees over legacy assignee_id */}
          {(() => {
            const primary = task.assignees?.length > 0 ? task.assignees[0] : task.assignee
            return primary?.full_name ? (
              <div
                className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[8px] font-semibold text-muted-foreground"
                title={primary.full_name}
              >
                {primary.full_name[0].toUpperCase()}
              </div>
            ) : null
          })()}

          {/* Risk badge */}
          {task.risk_level && task.risk_level !== 'Low' && (
            <Badge variant="outline" className={cn(
              'text-[9px] px-1.5',
              task.risk_level === 'High' ? 'border-status-error/30 text-status-error' : 'border-status-warning/30 text-status-warning'
            )}>
              {task.risk_level}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {/* Message count */}
          {task.message_count > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <MessageSquare className="h-3 w-3" />
              {task.message_count}
            </span>
          )}

          {/* Files */}
          {task.task_files.length > 0 && (
            <Paperclip className="h-3 w-3" />
          )}

          {/* Due date */}
          {task.end_date && (
            <span className={cn(
              'tabular-nums inline-flex items-center gap-0.5',
              isOverdue ? 'text-status-error font-medium' : ''
            )}>
              {isOverdue && <AlertTriangle className="h-3 w-3" />}
              {new Date(task.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

export function BoardView({ tasks, selectedId, onSelect }: BoardViewProps) {
  const columns = useMemo(() => {
    return COLUMNS.map(col => ({
      ...col,
      tasks: tasks.filter(t => col.statuses.includes(t.status)),
    }))
  }, [tasks])

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {columns.map(col => (
        <div key={col.key} className="flex flex-col">
          {/* Column header */}
          <div className={cn('bg-white rounded-t-xl border border-b-0 border-slate-100 border-t-2 px-4 py-3', col.color)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={cn('h-2 w-2 rounded-full', col.dotColor)} />
                <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  {col.label}
                </span>
              </div>
              <span className="text-xs font-medium tabular-nums text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {col.tasks.length}
              </span>
            </div>
          </div>

          {/* Column body */}
          <div className="bg-muted/20 rounded-b-xl border border-t-0 border-slate-100 p-2 flex-1 min-h-[200px]">
            <ScrollArea className="h-[calc(100dvh-420px)]">
              <div className="space-y-2">
                {col.tasks.length === 0 ? (
                  <div className="text-center py-8 text-xs text-muted-foreground">
                    No tasks
                  </div>
                ) : (
                  col.tasks.map(task => (
                    <BoardCard
                      key={task.id}
                      task={task}
                      isSelected={selectedId === task.id}
                      onSelect={onSelect}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      ))}
    </div>
  )
}
