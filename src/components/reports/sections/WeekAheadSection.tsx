'use client'

/**
 * @file WeekAheadSection.tsx
 *
 * @description Visual week-ahead section with a calendar strip overview and
 * rich task cards grouped by day, replacing the plain list layout.
 */

import { CalendarDays, Circle, CheckCircle2 } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ReportSectionHeader, SectionNarrativeIntro } from '@/components/reports/report-visuals'

import type { WeekAheadSectionData, UpcomingTask, ReportTemplateId } from '@/lib/reports/report-document-types'

interface WeekAheadSectionProps extends WeekAheadSectionData {
  templateId?: ReportTemplateId
  sectionNumber?: number
}

function formatDayOfWeek(dateStr: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(new Date(dateStr))
}

function formatDayNumber(dateStr: string): string {
  return new Intl.DateTimeFormat('en-US', { day: 'numeric' }).format(new Date(dateStr))
}

function formatGroupDate(dateStr: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
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

function CalendarStrip({ dateGroups }: { dateGroups: Map<string, UpcomingTask[]> }): React.JSX.Element {
  const sortedDates = [...dateGroups.keys()].sort()
  const maxTasks = Math.max(...[...dateGroups.values()].map(t => t.length), 1)

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {sortedDates.map((dateKey) => {
        const tasks = dateGroups.get(dateKey)!
        const intensity = tasks.length / maxTasks

        return (
          <div
            key={dateKey}
            className="flex flex-col items-center gap-1 min-w-[4rem] rounded-xl bg-muted/40 px-3 py-2.5 text-center"
          >
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {formatDayOfWeek(dateKey)}
            </span>
            <span className="text-lg font-display font-bold text-foreground">
              {formatDayNumber(dateKey)}
            </span>
            <div
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                intensity > 0.6
                  ? 'bg-international-orange/15 text-international-orange'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {tasks.length} task{tasks.length !== 1 && 's'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function WeekAheadSection({
  tasks,
  totalDueNextWeek,
  sectionNarrative,
  templateId,
  sectionNumber,
}: WeekAheadSectionProps): React.JSX.Element {
  const dateGroups = groupByDate(tasks)
  const sortedDates = [...dateGroups.keys()].sort()

  return (
    <section className="space-y-8">
      <ReportSectionHeader
        title="Week Ahead"
        icon={CalendarDays}
        templateId={templateId}
        sectionNumber={sectionNumber}
      />
      <SectionNarrativeIntro narrative={sectionNarrative} />

      {/* Summary callout */}
      <div className="flex items-center gap-3 rounded-xl bg-muted/30 px-5 py-3">
        <CalendarDays className="h-5 w-5 text-international-orange shrink-0" />
        <p className="text-sm text-foreground">
          <span className="font-semibold">{totalDueNextWeek} task{totalDueNextWeek !== 1 ? 's' : ''}</span>
          {' '}due across{' '}
          <span className="font-semibold">{sortedDates.length} day{sortedDates.length !== 1 ? 's' : ''}</span>
          {' '}in the next week
        </p>
      </div>

      {/* Calendar strip overview */}
      {sortedDates.length > 0 && <CalendarStrip dateGroups={dateGroups} />}

      {/* Empty state */}
      {sortedDates.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/30 py-14 text-center">
          <CheckCircle2 className="h-10 w-10 text-status-success" />
          <p className="mt-4 text-sm font-medium text-foreground">
            The week ahead is clear
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            No tasks due in the next 7 days
          </p>
        </div>
      )}

      {/* Task cards grouped by day */}
      <div className="space-y-6">
        {sortedDates.map((dateKey) => {
          const dayTasks = dateGroups.get(dateKey)!
          return (
            <div key={dateKey} className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-international-orange" />
                {formatGroupDate(dateKey)}
                <span className="text-xs font-normal text-muted-foreground">
                  ({dayTasks.length})
                </span>
              </h3>
              <div className="space-y-1.5 pl-4 border-l-2 border-muted">
                {dayTasks.map((task) => (
                  <Card key={task.id} className="border-none bg-muted/20 shadow-none">
                    <CardContent className="flex items-center gap-3 p-3">
                      <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">
                          {task.title}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          {task.assigneeName && <span>{task.assigneeName}</span>}
                          {task.assigneeName && task.objectiveTitle && <span>·</span>}
                          {task.objectiveTitle && (
                            <span className="truncate">{task.objectiveTitle}</span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
