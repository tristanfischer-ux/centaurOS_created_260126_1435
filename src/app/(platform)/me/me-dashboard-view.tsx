/**
 * MeDashboardBody — Client component rendering the dashboard widget section.
 *
 * @description Renders the functional dashboard widgets: Morning Briefing,
 * Focus Cards, Priority Queue, Week Timeline, Objectives Progress,
 * Activity Heatmap, and Quick Actions. Designed to be composed below the
 * shared SectionIntroPage by MeSectionIntro.
 *
 * @component
 *
 * @example
 * <MeDashboardBody data={dashboardData} />
 */

'use client'

import { isBefore, isToday as isDateToday } from 'date-fns'
import { MorningBriefingCard } from '@/components/nudges/MorningBriefing'
import { PriorityQueue } from '@/components/dashboard/priority-queue'
import { FocusCards } from './components/focus-cards'
import { WeekTimeline } from './components/week-timeline'
import { ObjectivesProgress } from './components/objectives-progress'
import { ActivityHeatmap } from './components/activity-heatmap'
import { QuickActions } from './components/quick-actions'

import type { MeDashboardData } from '@/actions/me-dashboard'

interface MeDashboardBodyProps {
  /** All dashboard data fetched server-side */
  data: MeDashboardData
}

export function MeDashboardBody({ data }: MeDashboardBodyProps): React.ReactElement {
  // Map priority tasks to PriorityQueue's expected shape (task_number: optional, not null)
  const pqTasks = data.priorityTasks.map(t => ({
    ...t,
    task_number: t.task_number ?? undefined,
  }))

  return (
    <div className="space-y-8">
      {/* ── Morning Briefing (AI-powered daily focus) ────────────────── */}
      <MorningBriefingCard />

      {/* ── Focus Cards ──────────────────────────────────────────────── */}
      <FocusCards focus={data.focus} />

      {/* ── Priority Queue ────────────────────────────────────────────── */}
      <PriorityQueue
        myTasks={pqTasks}
        overdueTasks={pqTasks.filter(t =>
          t.end_date && isBefore(new Date(t.end_date), new Date()) && !isDateToday(new Date(t.end_date))
        )}
        tasksDueToday={pqTasks.filter(t =>
          t.end_date && isDateToday(new Date(t.end_date))
        )}
        userId={data.userId}
      />

      {/* ── Week Timeline ────────────────────────────────────────────── */}
      <WeekTimeline tasks={data.weekTasks} />

      {/* ── Objectives + Activity (side by side on desktop) ──────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ObjectivesProgress objectives={data.topObjectives} />
        <ActivityHeatmap
          heatmap={data.activityHeatmap}
          streak={data.currentStreak}
        />
      </div>

      {/* ── Quick Actions ────────────────────────────────────────────── */}
      <QuickActions />
    </div>
  )
}
