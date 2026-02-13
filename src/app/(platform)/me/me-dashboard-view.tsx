/**
 * MeDashboardView — Client component for the personal command centre.
 *
 * @description Renders the personalized dashboard with greeting, focus cards,
 * weekly task timeline, objectives progress, activity heatmap, and quick actions.
 * Replaces the old generic SectionIntroPage for the "Me" section.
 *
 * @component
 *
 * @example
 * <MeDashboardView data={dashboardData} />
 */

'use client'

import { useEffect } from 'react'
import { typography } from '@/lib/design-system'
import { useSectionNewBadges } from '@/hooks/useSectionNewBadge'
import { FocusCards } from './components/focus-cards'
import { WeekTimeline } from './components/week-timeline'
import { ObjectivesProgress } from './components/objectives-progress'
import { ActivityHeatmap } from './components/activity-heatmap'
import { QuickActions } from './components/quick-actions'

import type { MeDashboardData } from '@/actions/me-dashboard'

interface MeDashboardViewProps {
  /** All dashboard data fetched server-side */
  data: MeDashboardData
}

/**
 * Returns a time-of-day greeting.
 *
 * @param {string} name - User's first name or display name
 * @returns {string} Greeting like "Good morning, Tristan"
 */
function getGreeting(name: string): string {
  const hour = new Date().getHours()
  if (hour < 12) return `Good morning, ${name}`
  if (hour < 17) return `Good afternoon, ${name}`
  return `Good evening, ${name}`
}

/**
 * Formats today's date as a human-readable string.
 *
 * @returns {string} e.g. "Wednesday, February 12, 2026"
 */
function formatToday(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function MeDashboardView({ data }: MeDashboardViewProps): React.ReactElement {
  const { markSectionSeen } = useSectionNewBadges()

  // Mark the "me" section as seen (preserves badge system behavior)
  useEffect(() => {
    markSectionSeen('me')
  }, [markSectionSeen])

  const firstName = data.greeting.name.split(' ')[0]

  return (
    <div className="space-y-8">
      {/* ── Greeting Header ──────────────────────────────────────────── */}
      <div className="pb-4 border-b border-muted">
        <div className={typography.pageHeader}>
          <div className={typography.pageHeaderAccent} />
          <h1 className={typography.h1}>
            {getGreeting(firstName)}
          </h1>
        </div>
        <p className={typography.pageSubtitle}>
          {formatToday()}
        </p>
      </div>

      {/* ── Focus Cards ──────────────────────────────────────────────── */}
      <FocusCards focus={data.focus} />

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
