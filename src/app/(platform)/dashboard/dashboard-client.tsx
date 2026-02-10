'use client'

import { useState } from 'react'
import { DashboardHero } from '@/components/dashboard/dashboard-hero'
import { PriorityQueue } from '@/components/dashboard/priority-queue'
import { ObjectiveCards } from '@/components/dashboard/objective-cards'
import { TeamPulse } from '@/components/dashboard/team-pulse'
import { ActivityFeed } from '@/components/dashboard/activity-feed'
import { ProductivityChart } from '@/components/dashboard/productivity-chart'
import { RecommendedForYou } from '@/components/dashboard/recommended-for-you'
import { FoundingMemberCard } from '@/components/dashboard/founding-member-card'
import { UnreadUpdatesCard } from '@/components/dashboard/unread-updates-card'

interface User {
  id: string
  fullName: string
  role: string
  avatarUrl: string | null
}

// Using `any` for props that come directly from Supabase query results
// in the server component. The generated Supabase types use union enums
// and nullable columns that don't align 1:1 with the client interfaces.
/* eslint-disable @typescript-eslint/no-explicit-any */
type TaskCompletionStat = { date: string; label: string; myTasks: number; teamTasks: number }
type UnreadCounts = { direct: number; task: number; total: number }

export interface DashboardClientProps {
  user: User
  foundryId: string
  myTasks: any[]
  objectives: any[]
  teamPresence: any[]
  recentActivity: any[]
  taskCompletionStats: TaskCompletionStat[]
  overdueTasks: any[]
  tasksDueToday: any[]
  tasksDueThisWeek: any[]
  blockers: any[]
  pendingDecisions: any[]
  unreadCounts: UnreadCounts
  isExecutiveOrFounder: boolean
  dailyFocus: string
}

/**
 * Dashboard Client - Streamlined command center.
 *
 * @description Pruned from 12+ widgets to 7 focused ones:
 * - Hero with consolidated metrics (6 cards)
 * - Two-column overview: PriorityQueue (left) + Objectives/Team/Recommendations (right)
 * - My Tasks and Team Activity view tabs
 *
 * Removed: StatsCards (merged into Hero), QuickActions (duplicate of sidebar),
 * MarketplaceSpotlight (double-selling), WorkflowTemplatesPreview (sidebar link),
 * full ActivityFeed (replaced with UnreadUpdatesCard linking to Updates page).
 *
 * Mobile ordering: PriorityQueue first, then Objectives, Team, Recommendations.
 */
export function DashboardClient({
  user,
  myTasks,
  objectives,
  teamPresence,
  recentActivity,
  taskCompletionStats,
  overdueTasks,
  tasksDueToday,
  unreadCounts,
  dailyFocus,
}: DashboardClientProps) {
  const [selectedView, setSelectedView] = useState<'overview' | 'tasks' | 'team'>('overview')

  // Calculate key metrics
  const totalTasks = myTasks.length
  const todayTasks = tasksDueToday.filter(t => myTasks.some(mt => mt.id === t.id)).length
  const overdueCount = overdueTasks.filter(t => myTasks.some(mt => mt.id === t.id)).length
  const activeObjectives = objectives.filter(
    o => o.status === 'Active' || o.status === 'In_Progress'
  ).length
  const teamOnline = teamPresence.filter(
    m => m.status === 'online' || m.status === 'focus'
  ).length

  return (
    <div className="min-h-screen">
      {/* Hero Section — greeting + consolidated metrics + view tabs */}
      <DashboardHero
        userName={user.fullName}
        userRole={user.role}
        totalTasks={totalTasks}
        todayTasks={todayTasks}
        overdueCount={overdueCount}
        unreadCount={unreadCounts.total}
        activeObjectives={activeObjectives}
        teamOnline={teamOnline}
        teamTotal={teamPresence.length}
        dailyFocus={dailyFocus}
        onViewChange={setSelectedView}
        selectedView={selectedView}
      />

      {/* Main Dashboard Content */}
      <div className="px-4 sm:px-6 lg:px-8 pb-8 space-y-6 mt-6">
        {/* ─── OVERVIEW TAB ─── */}
        {selectedView === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column — What to do */}
            <div className="space-y-6 order-2 lg:order-1">
              <FoundingMemberCard />
              <PriorityQueue
                myTasks={myTasks}
                overdueTasks={overdueTasks}
                tasksDueToday={tasksDueToday}
                userId={user.id}
              />
              <ProductivityChart data={taskCompletionStats} />
            </div>

            {/* Right Column — Awareness & growth */}
            <div className="space-y-6 order-1 lg:order-2">
              <ObjectiveCards objectives={objectives} />
              <TeamPulse teamMembers={teamPresence} />
              <RecommendedForYou
                objectives={objectives}
                teamSize={teamPresence.length}
                taskCount={totalTasks}
                hasWorkflows={false}
              />
              <UnreadUpdatesCard unreadCount={unreadCounts.total} />
            </div>
          </div>
        )}

        {/* ─── MY TASKS TAB ─── */}
        {selectedView === 'tasks' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PriorityQueue
              myTasks={myTasks}
              overdueTasks={overdueTasks}
              tasksDueToday={tasksDueToday}
              userId={user.id}
            />
            <div className="space-y-6">
              <ObjectiveCards objectives={objectives} />
              <ProductivityChart data={taskCompletionStats} />
            </div>
          </div>
        )}

        {/* ─── TEAM ACTIVITY TAB ─── */}
        {selectedView === 'team' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TeamPulse teamMembers={teamPresence} expanded />
            <ActivityFeed activities={recentActivity} expanded />
          </div>
        )}
      </div>
    </div>
  )
}
