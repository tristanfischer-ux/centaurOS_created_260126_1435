"use client"

import { Card, CardContent } from "@/components/ui/card"
import { MessageSquare, Users, AlertTriangle, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

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
 * HomeAnalytics - Compact horizontal stats bar for home/inbox page.
 * 
 * @description Displays key metrics in a single scannable row: unread messages,
 * team online count, overdue tasks, and tasks due today. Provides instant 
 * situational awareness without taking up excessive vertical space.
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
  tasksDueToday,
}: HomeAnalyticsProps) {
  // Calculate metrics
  const unreadCount = members.reduce((sum, m) => sum + (m.unread_count || 0), 0)
                    + tasks.reduce((sum, t) => sum + (t.unread_message_count || 0), 0)
  const onlineCount = teamMembers.filter(m => m.presence_status === 'online').length
  const overdueCount = overdueTasks.length
  const dueTodayCount = tasksDueToday.length

  return (
    <Card className="border bg-background mb-4">
      <CardContent className="py-2.5 px-3">
        <div className="flex items-center justify-between text-xs">
          {/* Unread messages */}
          <div className="flex items-center gap-1">
            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-semibold text-foreground">{unreadCount}</span>
            <span className="text-muted-foreground">msgs</span>
          </div>
          
          {/* Team online */}
          <div className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-semibold text-foreground">{onlineCount}</span>
            <span className="text-muted-foreground">online</span>
          </div>
          
          {/* Overdue tasks */}
          <div className={cn(
            "flex items-center gap-1",
            overdueCount > 0 && "text-destructive"
          )}>
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="font-semibold">{overdueCount}</span>
            <span className={overdueCount > 0 ? "" : "text-muted-foreground"}>overdue</span>
          </div>
          
          {/* Due today */}
          <div className={cn(
            "flex items-center gap-1",
            dueTodayCount > 0 && "text-status-warning"
          )}>
            <Clock className="h-3.5 w-3.5" />
            <span className="font-semibold">{dueTodayCount}</span>
            <span className={dueTodayCount > 0 ? "" : "text-muted-foreground"}>today</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
