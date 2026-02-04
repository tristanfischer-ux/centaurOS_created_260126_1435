"use client"

import { UnreadMessagesChart } from "./charts/unread-messages-chart"
import { TeamOnlineChart } from "./charts/team-online-chart"
import { TodaysPulseChart } from "./charts/todays-pulse-chart"
import { ActionRequiredChart } from "./charts/action-required-chart"

/**
 * Member with messaging metadata for analytics.
 */
export interface AnalyticsMember {
  id: string
  full_name: string | null
  unread_count?: number
}

/**
 * Task with messaging metadata for analytics.
 */
export interface AnalyticsTask {
  id: string
  unread_message_count?: number
}

/**
 * Team member with presence for analytics.
 */
export interface AnalyticsTeamMember {
  id: string
  full_name: string | null
  avatar_url?: string | null
  presence_status?: 'online' | 'away' | 'focus' | 'offline'
}

/**
 * Action task for analytics.
 */
export interface AnalyticsActionTask {
  id: string
}

/**
 * Blocker for analytics.
 */
export interface AnalyticsBlocker {
  id: string
}

/**
 * Task due for analytics.
 */
export interface AnalyticsTaskDue {
  id: string
}

interface HomeAnalyticsProps {
  /** Members with unread message counts */
  members?: AnalyticsMember[]
  /** Tasks with unread message counts */
  tasks?: AnalyticsTask[]
  /** Team members with presence status */
  teamMembers: AnalyticsTeamMember[]
  /** Overdue tasks */
  overdueTasks: AnalyticsActionTask[]
  /** Pending decisions (executive only) */
  pendingDecisions: AnalyticsActionTask[]
  /** Blockers from standups */
  blockers: AnalyticsBlocker[]
  /** Tasks due today */
  tasksDueToday: AnalyticsTaskDue[]
  /** Tasks due this week */
  tasksDueThisWeek: AnalyticsTaskDue[]
  /** Whether user is executive or founder */
  isExecutiveOrFounder: boolean
}

/**
 * HomeAnalytics - Compact analytics dashboard for home/inbox page.
 * 
 * @description Displays 4 small metric cards showing unread messages,
 * team availability, today's urgency, and action items requiring attention.
 * Provides instant situational awareness at the top of the summary panel.
 * 
 * @component
 * 
 * @example
 * <HomeAnalytics
 *   members={members}
 *   tasks={tasks}
 *   teamMembers={teamMembers}
 *   overdueTasks={overdueTasks}
 *   pendingDecisions={pendingDecisions}
 *   blockers={blockers}
 *   tasksDueToday={tasksDueToday}
 *   tasksDueThisWeek={tasksDueThisWeek}
 *   isExecutiveOrFounder={isExecutiveOrFounder}
 * />
 */
export function HomeAnalytics({
  members = [],
  tasks = [],
  teamMembers,
  overdueTasks,
  pendingDecisions,
  blockers,
  tasksDueToday,
  tasksDueThisWeek,
  isExecutiveOrFounder
}: HomeAnalyticsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 mb-4">
      <UnreadMessagesChart members={members} tasks={tasks} />
      <TeamOnlineChart teamMembers={teamMembers} />
      <TodaysPulseChart 
        overdueTasks={overdueTasks}
        tasksDueToday={tasksDueToday}
        tasksDueThisWeek={tasksDueThisWeek}
      />
      <ActionRequiredChart
        overdueTasks={overdueTasks}
        pendingDecisions={pendingDecisions}
        blockers={blockers}
        isExecutiveOrFounder={isExecutiveOrFounder}
      />
    </div>
  )
}
