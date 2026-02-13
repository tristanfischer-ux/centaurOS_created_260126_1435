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

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Waypoints, Hammer, Store, X } from 'lucide-react'
import { typography } from '@/lib/design-system'
import { useSectionNewBadges } from '@/hooks/useSectionNewBadge'
import { isBefore, isToday as isDateToday } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { MorningBriefingCard } from '@/components/nudges/MorningBriefing'
import { PriorityQueue } from '@/components/dashboard/priority-queue'
import { FocusCards } from './components/focus-cards'
import { WeekTimeline } from './components/week-timeline'
import { ObjectivesProgress } from './components/objectives-progress'
import { ActivityHeatmap } from './components/activity-heatmap'
import { QuickActions } from './components/quick-actions'

import type { MeDashboardData } from '@/actions/me-dashboard'

const WELCOME_DISMISSED_KEY = 'forgeos-welcome-dismissed'

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
  const [isWelcomeDismissed, setIsWelcomeDismissed] = useState(true)

  // Mark the "me" section as seen (preserves badge system behavior)
  useEffect(() => {
    markSectionSeen('me')
  }, [markSectionSeen])

  // Check localStorage for welcome card dismissal (client-side only)
  useEffect(() => {
    const dismissed = localStorage.getItem(WELCOME_DISMISSED_KEY)
    if (!dismissed) {
      setIsWelcomeDismissed(false)
    }
  }, [])

  /** Dismiss the welcome card and persist to localStorage */
  function handleDismissWelcome(): void {
    localStorage.setItem(WELCOME_DISMISSED_KEY, 'true')
    setIsWelcomeDismissed(true)
  }

  const firstName = data.greeting.name.split(' ')[0]

  // Map priority tasks to PriorityQueue's expected shape (task_number: optional, not null)
  const pqTasks = data.priorityTasks.map(t => ({
    ...t,
    task_number: t.task_number ?? undefined,
  }))

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

      {/* ── Welcome Orientation Card (first-time visitors only) ────── */}
      {!isWelcomeDismissed && (
        <Card className="relative border-2 border-international-orange/20 bg-gradient-to-br from-background to-international-orange/[0.03]">
          <button
            onClick={handleDismissWelcome}
            className="absolute top-4 right-4 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Dismiss welcome card"
          >
            <X className="h-4 w-4" />
          </button>
          <CardContent className="pt-6 pb-5">
            <h3 className="text-lg font-semibold text-foreground mb-1">
              Welcome to your command center
            </h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-2xl">
              Everything that needs your attention today is right here. When you&apos;re ready to do more, explore the rest of ForgeOS:
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/plan"
                className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2.5 text-sm font-medium text-electric-blue hover:bg-blue-100 transition-colors"
              >
                <Waypoints className="h-4 w-4" />
                Plan — set goals &amp; create plans
              </Link>
              <Link
                href="/workshop"
                className="inline-flex items-center gap-2 rounded-lg bg-orange-50 px-4 py-2.5 text-sm font-medium text-international-orange hover:bg-orange-100 transition-colors"
              >
                <Hammer className="h-4 w-4" />
                Workshop — build &amp; execute
              </Link>
              <Link
                href="/marketplace-hub"
                className="inline-flex items-center gap-2 rounded-lg bg-teal-50 px-4 py-2.5 text-sm font-medium text-teal-600 hover:bg-teal-100 transition-colors"
              >
                <Store className="h-4 w-4" />
                Marketplace — find help &amp; supplies
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

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
