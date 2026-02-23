/**
 * FocusCards — Top-row metric cards for the personal dashboard.
 *
 * @description Displays 4 focus metrics: tasks due today, overdue tasks,
 * unread updates, and tasks completed this week. Each card has a visual
 * icon, prominent number, and contextual color coding.
 *
 * @component
 */

'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import {
  CalendarClock,
  AlertTriangle,
  Bell,
  CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface FocusCardsProps {
  /** Focus metric data */
  focus: {
    tasksDueToday: number
    overdueTasks: number
    unreadUpdates: number
    completedThisWeek: number
  }
}

/**
 * Individual focus metric card definition.
 */
interface FocusMetric {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  href: string
  /** Whether to highlight with a warning/accent color when value > 0 */
  warnWhenPositive?: boolean
  /** Whether to use success styling when value is 0 */
  successWhenZero?: boolean
  /** Text shown below the number */
  detail: string
}

export function FocusCards({ focus }: FocusCardsProps): React.ReactElement {
  const metrics: FocusMetric[] = [
    {
      label: 'Due Today',
      value: focus.tasksDueToday,
      icon: CalendarClock,
      href: '/new-tasks',
      warnWhenPositive: true,
      successWhenZero: true,
      detail: focus.tasksDueToday === 0 ? 'All clear' : 'tasks need attention',
    },
    {
      label: 'Overdue',
      value: focus.overdueTasks,
      icon: AlertTriangle,
      href: '/new-tasks',
      warnWhenPositive: true,
      successWhenZero: true,
      detail: focus.overdueTasks === 0 ? 'Nothing overdue' : 'past due date',
    },
    {
      label: 'Unread Updates',
      value: focus.unreadUpdates,
      icon: Bell,
      href: '/updates',
      detail: focus.unreadUpdates === 0 ? 'All caught up' : 'waiting for you',
    },
    {
      label: 'Completed This Week',
      value: focus.completedThisWeek,
      icon: CheckCircle2,
      href: '/new-tasks',
      detail: focus.completedThisWeek === 0 ? 'Get started' : 'tasks done',
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {metrics.map((metric) => (
        <FocusCard key={metric.label} metric={metric} />
      ))}
    </div>
  )
}

/**
 * FocusCard — Single metric card with icon, value, and contextual styling.
 */
function FocusCard({ metric }: { metric: FocusMetric }): React.ReactElement {
  const Icon = metric.icon
  const hasValue = metric.value > 0
  const isWarning = metric.warnWhenPositive && hasValue
  const isSuccess = metric.successWhenZero && !hasValue

  return (
    <Link href={metric.href}>
      <Card className={cn(
        'group transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer h-full',
        isWarning && 'border-destructive/30',
      )}>
        <CardContent className="pt-5 pb-4">
          {/* Icon */}
          <div className={cn(
            'flex items-center justify-center w-10 h-10 rounded-xl mb-3 transition-colors',
            isWarning && 'bg-status-error-light',
            isSuccess && 'bg-status-success-light',
            !isWarning && !isSuccess && 'bg-muted',
          )}>
            <Icon className={cn(
              'h-5 w-5',
              isWarning && 'text-destructive',
              isSuccess && 'text-status-success',
              !isWarning && !isSuccess && 'text-muted-foreground',
            )} />
          </div>

          {/* Label */}
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
            {metric.label}
          </p>

          {/* Value */}
          <p className={cn(
            'text-3xl font-bold tracking-tight',
            isWarning && 'text-destructive',
            isSuccess && 'text-status-success',
            !isWarning && !isSuccess && 'text-foreground',
          )}>
            {metric.value}
          </p>

          {/* Detail */}
          <p className="text-xs text-muted-foreground mt-0.5">
            {metric.detail}
          </p>
        </CardContent>
      </Card>
    </Link>
  )
}
