"use client"

import { TeamCapacityChart } from "./charts/capacity-chart"
import { TaskPipelineChart } from "./charts/pipeline-chart"
import { TopPerformersChart } from "./charts/performers-chart"
import { TaskDeadlinesChart } from "./charts/deadlines-chart"

/**
 * Member data required for team analytics charts.
 * 
 * @description This interface defines the shape of member data needed
 * for calculating and displaying team analytics metrics.
 */
export interface TeamMember {
  id: string
  full_name: string | null
  role: string
  activeTasks: number
  completedTasks: number
  pendingTasks: number
  rejectedTasks: number
  paired_ai_id?: string | null
  taskDetails?: {
    active: { end_date: string | null }[]
    pending: { end_date: string | null }[]
  }
}

interface TeamAnalyticsProps {
  /** All team members with their metrics */
  members: TeamMember[]
}

/**
 * TeamAnalytics - Compact analytics dashboard for team page.
 * 
 * @description Displays 4 small charts showing team capacity, 
 * task pipeline, top performers, and task deadline distribution.
 * Charts are designed to be compact (h-[140px]) to not overwhelm
 * the main team list below.
 * 
 * @component
 * 
 * @example
 * <TeamAnalytics members={membersWithMetrics} />
 */
export function TeamAnalytics({ members }: TeamAnalyticsProps) {
  // Filter out AI agents for human-specific metrics
  const humanMembers = members.filter(m => m.role !== 'AI_Agent')

  // Collect all task end_dates from active + pending tasks across all members
  const taskEndDates: (string | null)[] = members.flatMap(m => {
    const active = m.taskDetails?.active?.map(t => t.end_date) || []
    const pending = m.taskDetails?.pending?.map(t => t.end_date) || []
    return [...active, ...pending]
  })

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <TeamCapacityChart members={humanMembers} />
      <TaskPipelineChart members={members} />
      <TopPerformersChart members={members} />
      <TaskDeadlinesChart taskEndDates={taskEndDates} />
    </div>
  )
}
