'use client'

import { cn } from '@/lib/utils'
import { AlertTriangle, Calendar, Clock, ClipboardCheck, ListChecks, Inbox } from 'lucide-react'

interface SmartSummaryProps {
  totalTasks: number
  dueToday: number
  overdue: number
  needsReview: number
  myActiveTasks: number
  activeFilter: string | null
  onFilterChange: (filter: string | null) => void
}

export function SmartSummary({
  totalTasks,
  dueToday,
  overdue,
  needsReview,
  myActiveTasks,
  activeFilter,
  onFilterChange,
}: SmartSummaryProps) {
  const pills = [
    {
      key: 'my-tasks',
      label: 'My Tasks',
      count: myActiveTasks,
      icon: ListChecks,
      color: 'text-international-orange',
      activeBg: 'bg-international-orange/10 border-international-orange/30',
    },
    {
      key: 'due-today',
      label: 'Due Today',
      count: dueToday,
      icon: Calendar,
      color: 'text-status-warning',
      activeBg: 'bg-status-warning/10 border-status-warning/30',
    },
    {
      key: 'overdue',
      label: 'Overdue',
      count: overdue,
      icon: AlertTriangle,
      color: 'text-status-error',
      activeBg: 'bg-status-error/10 border-status-error/30',
    },
    {
      key: 'needs-review',
      label: 'Needs Review',
      count: needsReview,
      icon: ClipboardCheck,
      color: 'text-electric-blue',
      activeBg: 'bg-electric-blue/10 border-electric-blue/30',
    },
    {
      key: null as string | null,
      label: 'All Tasks',
      count: totalTasks,
      icon: Inbox,
      color: 'text-muted-foreground',
      activeBg: 'bg-muted border-muted-foreground/30',
    },
  ]

  return (
    <div className="flex flex-wrap items-center gap-2">
      {pills.map((pill) => {
        const isActive = activeFilter === pill.key
        return (
          <button
            key={pill.key ?? 'all'}
            onClick={() => onFilterChange(isActive ? null : pill.key)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-200',
              'hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isActive
                ? cn(pill.activeBg, 'shadow-sm')
                : 'bg-card border hover:border-foreground/20 text-muted-foreground'
            )}
          >
            <pill.icon className={cn('h-3.5 w-3.5', isActive ? pill.color : '')} />
            {pill.label}
            {pill.count > 0 && (
              <span className={cn(
                'tabular-nums font-semibold',
                isActive ? pill.color : ''
              )}>
                {pill.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
