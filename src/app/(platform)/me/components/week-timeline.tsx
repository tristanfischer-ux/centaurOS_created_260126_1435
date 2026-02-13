/**
 * WeekTimeline — Compact weekly task view for the personal dashboard.
 *
 * @description Displays tasks grouped by weekday (Mon-Fri) with today
 * visually highlighted. Shows task status with color-coded indicators.
 * Includes an encouraging empty state with CTA.
 *
 * @component
 */

'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar, ArrowRight, CheckCircle2, Clock, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface WeekTimelineProps {
  /** Tasks with due dates within the current week */
  tasks: Array<{
    id: string
    title: string
    status: string
    dueDate: string
    priority: string
  }>
}

/** Weekday definition for the timeline columns. */
interface WeekDay {
  label: string
  shortLabel: string
  dateStr: string
  isToday: boolean
}

/**
 * Generates the 5 weekdays (Mon-Fri) for the current week.
 *
 * @returns {WeekDay[]} Array of weekday definitions
 */
function getWeekDays(): WeekDay[] {
  const now = new Date()
  const day = now.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + mondayOffset)
  monday.setHours(0, 0, 0, 0)

  const todayStr = now.toISOString().split('T')[0]
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  const fullLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

  return labels.map((label, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const dateStr = d.toISOString().split('T')[0]
    return {
      label: fullLabels[i],
      shortLabel: label,
      dateStr,
      isToday: dateStr === todayStr,
    }
  })
}

/**
 * Returns a status icon component for a task status.
 *
 * @param {string} status - Task status string
 * @returns {React.ReactElement} Status icon
 */
function StatusIcon({ status }: { status: string }): React.ReactElement {
  if (status === 'Completed') {
    return <CheckCircle2 className="h-3.5 w-3.5 text-status-success flex-shrink-0" />
  }
  if (status === 'Pending' || status === 'Accepted') {
    return <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
  }
  return <Circle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
}

export function WeekTimeline({ tasks }: WeekTimelineProps): React.ReactElement {
  const weekDays = getWeekDays()

  // Group tasks by date
  const tasksByDate = new Map<string, typeof tasks>()
  for (const task of tasks) {
    const existing = tasksByDate.get(task.dueDate) ?? []
    existing.push(task)
    tasksByDate.set(task.dueDate, existing)
  }

  const hasTasks = tasks.length > 0

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1 h-6 bg-international-orange rounded-full" />
            <CardTitle className="text-base">My Week</CardTitle>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/new-tasks" className="text-muted-foreground hover:text-foreground">
              View all tasks
              <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {hasTasks ? (
          <div className="grid grid-cols-5 gap-2">
            {weekDays.map((day) => {
              const dayTasks = tasksByDate.get(day.dateStr) ?? []
              return (
                <div key={day.dateStr} className="min-w-0">
                  {/* Day header */}
                  <div className={cn(
                    'text-center py-1.5 px-1 rounded-lg mb-2 text-xs font-medium',
                    day.isToday
                      ? 'bg-international-orange text-background'
                      : 'bg-muted text-muted-foreground',
                  )}>
                    <span className="hidden sm:inline">{day.label}</span>
                    <span className="sm:hidden">{day.shortLabel}</span>
                    <div className={cn(
                      'text-[10px] mt-0.5',
                      day.isToday ? 'text-background/80' : 'text-muted-foreground/60',
                    )}>
                      {new Date(day.dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>

                  {/* Tasks */}
                  <div className="space-y-1.5">
                    {dayTasks.length === 0 && (
                      <div className="h-8 flex items-center justify-center">
                        <span className="text-[10px] text-muted-foreground/40">—</span>
                      </div>
                    )}
                    {dayTasks.map((task) => (
                      <Link
                        key={task.id}
                        href={`/new-tasks?task=${task.id}`}
                        className="block"
                      >
                        <div className={cn(
                          'flex items-start gap-1.5 px-2 py-1.5 rounded-lg text-xs',
                          'bg-muted/50 hover:bg-muted transition-colors cursor-pointer',
                          task.status === 'Completed' && 'opacity-60',
                        )}>
                          <StatusIcon status={task.status} />
                          <span className="text-foreground leading-tight line-clamp-2 min-w-0">
                            {task.title}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-8">
            <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center mb-3">
              <Calendar className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">
              No tasks this week
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Your week is wide open — time to plan ahead
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link href="/new-tasks">
                Create a task
                <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
