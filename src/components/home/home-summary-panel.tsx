'use client'

/**
 * HomeSummaryPanel Component
 * 
 * Container for all summary sections in the Home page right column.
 * Includes:
 * - Action items (overdue, decisions, blockers)
 * - Tasks due (today, this week)
 * - Team activity
 */

import { cn } from '@/lib/utils'
import { ActionItemsSection } from './action-items-section'
import { TasksDueSection } from './tasks-due-section'
import { TeamActivitySection } from './team-activity-section'
import { HomeAnalytics } from './home-analytics'
import { Skeleton } from '@/components/ui/skeleton'

interface ActionTask {
  id: string
  title: string
  status: string
  end_date: string | null
  created_at: string
  assignee?: {
    id: string
    full_name: string | null
    role: string | null
  } | null
  creator?: {
    id: string
    full_name: string | null
  } | null
}

interface BlockerStandup {
  id: string
  blockers: string
  blocker_severity: string | null
  needs_help: boolean
  user: {
    id: string
    full_name: string | null
    role: string | null
  }
}

interface TaskDue {
  id: string
  title: string
  status: string
  end_date: string
  task_number?: number
  assignee?: {
    id: string
    full_name: string | null
    avatar_url?: string | null
  } | null
  objective?: {
    id: string
    title: string
  } | null
}

interface TeamMemberActivity {
  id: string
  full_name: string | null
  avatar_url?: string | null
  role: string | null
  presence_status?: 'online' | 'away' | 'focus' | 'offline'
  current_task?: {
    id: string
    title: string
  } | null
  tasks_this_week: {
    id: string
    title: string
    end_date: string | null
  }[]
}

/** Member with messaging metadata for analytics */
interface AnalyticsMember {
  id: string
  full_name: string | null
  unread_count?: number
}

/** Task with messaging metadata for analytics */
interface AnalyticsTask {
  id: string
  unread_message_count?: number
}

export interface HomeSummaryPanelProps {
  // Action items data
  overdueTasks: ActionTask[]
  pendingDecisions: ActionTask[]
  blockers: BlockerStandup[]
  
  // Tasks due data
  tasksDueToday: TaskDue[]
  tasksDueThisWeek: TaskDue[]
  
  // Team activity data
  teamMembers: TeamMemberActivity[]
  
  // Analytics data (optional - for unread message charts)
  members?: AnalyticsMember[]
  tasks?: AnalyticsTask[]
  
  // User context
  userId: string
  userRole?: string
  foundryId: string
  isExecutiveOrFounder: boolean
  
  // Callbacks
  onTaskClick?: (taskId: string) => void
  
  // Layout
  className?: string
}

/**
 * Main summary panel with all sections
 */
export function HomeSummaryPanel({
  overdueTasks,
  pendingDecisions,
  blockers,
  tasksDueToday,
  tasksDueThisWeek,
  teamMembers,
  members,
  tasks,
  userId,
  userRole,
  foundryId,
  isExecutiveOrFounder,
  onTaskClick,
  className
}: HomeSummaryPanelProps) {
  return (
    <div className={cn("flex flex-col h-full overflow-hidden", className)}>
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Quick Analytics at top */}
        <HomeAnalytics
          members={members}
          tasks={tasks}
          teamMembers={teamMembers}
          overdueTasks={overdueTasks}
          pendingDecisions={pendingDecisions}
          blockers={blockers}
          tasksDueToday={tasksDueToday}
          tasksDueThisWeek={tasksDueThisWeek}
          isExecutiveOrFounder={isExecutiveOrFounder}
        />
        
        {/* Action Items */}
        <ActionItemsSection
          overdueTasks={overdueTasks}
          pendingDecisions={pendingDecisions}
          blockers={blockers}
          isExecutiveOrFounder={isExecutiveOrFounder}
        />
        
        {/* Tasks Due Today & This Week */}
        <TasksDueSection
          tasksDueToday={tasksDueToday}
          tasksDueThisWeek={tasksDueThisWeek}
          onTaskClick={onTaskClick}
        />
        
        {/* Team Activity */}
        <TeamActivitySection
          teamMembers={teamMembers}
        />
      </div>
    </div>
  )
}

/**
 * Loading skeleton for the summary panel
 */
export function HomeSummaryPanelSkeleton() {
  return (
    <div className="flex flex-col h-full overflow-hidden p-4 space-y-4">
      {/* Action items skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-24 w-full" />
      </div>
      
      {/* Tasks due skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-32 w-full" />
      </div>
      
      {/* Team activity skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  )
}
