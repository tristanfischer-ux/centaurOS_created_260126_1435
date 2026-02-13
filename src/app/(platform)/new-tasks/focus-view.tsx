'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { AlertTriangle, Calendar, Clock, Sunrise, CheckCircle2 } from 'lucide-react'
import { TaskRow } from './task-row'
import type { TaskWithData } from './types'

interface FocusViewProps {
  tasks: TaskWithData[]
  selectedId: string | null
  onSelect: (id: string) => void
}

interface TaskGroup {
  key: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  borderColor: string
  tasks: TaskWithData[]
}

export function FocusView({ tasks, selectedId, onSelect }: FocusViewProps) {
  const groups = useMemo(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const weekEnd = new Date(today)
    weekEnd.setDate(weekEnd.getDate() + 7)

    // Only non-completed, non-rejected tasks
    const activeTasks = tasks.filter(t => t.status !== 'Completed' && t.status !== 'Rejected')

    const overdue: TaskWithData[] = []
    const dueToday: TaskWithData[] = []
    const thisWeek: TaskWithData[] = []
    const upcoming: TaskWithData[] = []
    const noDueDate: TaskWithData[] = []

    activeTasks.forEach(task => {
      if (!task.end_date) {
        noDueDate.push(task)
        return
      }
      const dueDate = new Date(task.end_date)
      if (dueDate < today) {
        overdue.push(task)
      } else if (dueDate < tomorrow) {
        dueToday.push(task)
      } else if (dueDate < weekEnd) {
        thisWeek.push(task)
      } else {
        upcoming.push(task)
      }
    })

    // Recently completed (last 3 days) for context
    const recentCompleted = tasks
      .filter(t => t.status === 'Completed')
      .filter(t => {
        const updated = new Date(t.updated_at)
        const threeDaysAgo = new Date(now)
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
        return updated >= threeDaysAgo
      })
      .slice(0, 5)

    const result: TaskGroup[] = []

    if (overdue.length > 0) {
      result.push({
        key: 'overdue',
        label: 'Overdue',
        icon: AlertTriangle,
        color: 'text-status-error',
        borderColor: 'border-l-status-error',
        tasks: overdue.sort((a, b) => new Date(a.end_date!).getTime() - new Date(b.end_date!).getTime()),
      })
    }

    if (dueToday.length > 0) {
      result.push({
        key: 'due-today',
        label: 'Due Today',
        icon: Calendar,
        color: 'text-status-warning',
        borderColor: 'border-l-status-warning',
        tasks: dueToday,
      })
    }

    if (thisWeek.length > 0) {
      result.push({
        key: 'this-week',
        label: 'This Week',
        icon: Sunrise,
        color: 'text-electric-blue',
        borderColor: 'border-l-electric-blue',
        tasks: thisWeek.sort((a, b) => new Date(a.end_date!).getTime() - new Date(b.end_date!).getTime()),
      })
    }

    if (upcoming.length > 0) {
      result.push({
        key: 'upcoming',
        label: 'Upcoming',
        icon: Clock,
        color: 'text-muted-foreground',
        borderColor: 'border-l-muted-foreground/30',
        tasks: upcoming.sort((a, b) => new Date(a.end_date!).getTime() - new Date(b.end_date!).getTime()),
      })
    }

    if (noDueDate.length > 0) {
      result.push({
        key: 'no-date',
        label: 'No Due Date',
        icon: Clock,
        color: 'text-muted-foreground/50',
        borderColor: 'border-l-muted/50',
        tasks: noDueDate,
      })
    }

    if (recentCompleted.length > 0) {
      result.push({
        key: 'completed',
        label: 'Recently Completed',
        icon: CheckCircle2,
        color: 'text-status-success',
        borderColor: 'border-l-status-success',
        tasks: recentCompleted,
      })
    }

    return result
  }, [tasks])

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="h-16 w-16 rounded-2xl bg-status-success/10 flex items-center justify-center mb-4">
          <CheckCircle2 className="h-8 w-8 text-status-success" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1">All caught up</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          You have no active tasks. Create a new task or enjoy the calm.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {groups.map(group => (
        <div key={group.key} className={cn('bg-background rounded-xl border border-l-4 overflow-hidden', group.borderColor)}>
          {/* Group header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/20">
            <group.icon className={cn('h-4 w-4', group.color)} />
            <span className={cn('text-xs font-semibold uppercase tracking-wider', group.color)}>
              {group.label}
            </span>
            <span className="text-xs font-medium tabular-nums text-muted-foreground">
              ({group.tasks.length})
            </span>
          </div>

          {/* Tasks */}
          <div className="divide-y divide-border/50">
            {group.tasks.map(task => (
              <TaskRow
                key={task.id}
                task={task}
                isSelected={selectedId === task.id}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
