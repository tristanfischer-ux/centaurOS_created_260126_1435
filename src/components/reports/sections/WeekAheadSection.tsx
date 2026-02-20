'use client'

import { CalendarDays } from 'lucide-react'

import { cn } from '@/lib/utils'

import type { WeekAheadSectionData, UpcomingTask } from '@/lib/reports/report-document-types'

type WeekAheadSectionProps = WeekAheadSectionData

function formatGroupDate(dateStr: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date(dateStr))
}

function formatTaskDate(dateStr: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(dateStr))
}

function groupByDate(tasks: UpcomingTask[]): Map<string, UpcomingTask[]> {
  const groups = new Map<string, UpcomingTask[]>()
  for (const task of tasks) {
    const dateKey = task.dueDate.slice(0, 10)
    const existing = groups.get(dateKey) ?? []
    existing.push(task)
    groups.set(dateKey, existing)
  }
  return groups
}

export function WeekAheadSection({
  tasks,
  totalDueNextWeek,
}: WeekAheadSectionProps) {
  const dateGroups = groupByDate(tasks)
  const sortedDates = [...dateGroups.keys()].sort()

  return (
    <section className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="h-6 w-1 rounded-full bg-international-orange" />
        <h2 className="text-2xl font-display font-bold text-foreground">
          Week Ahead
        </h2>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CalendarDays className="h-4 w-4" />
        <span>
          {totalDueNextWeek} task{totalDueNextWeek !== 1 ? 's' : ''} due in the
          next 7 days
        </span>
      </div>

      {sortedDates.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-muted/30 py-12 text-center">
          <CalendarDays className="h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-foreground">
            No upcoming tasks
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            The week ahead is clear
          </p>
        </div>
      )}

      <div className="space-y-6">
        {sortedDates.map((dateKey) => {
          const dayTasks = dateGroups.get(dateKey)!
          return (
            <div key={dateKey} className="space-y-2">
              <h3 className="text-sm font-medium text-foreground">
                {formatGroupDate(dateKey)}
              </h3>
              <div className="space-y-1">
                {dayTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between gap-4 rounded-lg border bg-card p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {task.title}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        {task.assigneeName && <span>{task.assigneeName}</span>}
                        {task.assigneeName && task.objectiveTitle && (
                          <span>·</span>
                        )}
                        {task.objectiveTitle && (
                          <span className="truncate">{task.objectiveTitle}</span>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatTaskDate(task.dueDate)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
