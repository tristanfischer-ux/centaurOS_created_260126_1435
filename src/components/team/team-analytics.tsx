"use client"

import { TeamCapacityChart } from "./charts/capacity-chart"
import { TaskPipelineChart } from "./charts/pipeline-chart"
import { TopPerformersChart } from "./charts/performers-chart"
import { AgentPairingChart } from "./charts/centaur-chart"

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
}

interface TeamAnalyticsProps {
  /** All team members with their metrics */
  members: TeamMember[]
}

/**
 * TeamAnalytics - Compact analytics dashboard for team page.
 * 
 * @description Displays 4 small charts showing team capacity, 
 * task pipeline, top performers, and agent pairing status.
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
  const aiAgents = members.filter(m => m.role === 'AI_Agent')

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <TeamCapacityChart members={humanMembers} />
      <TaskPipelineChart members={members} />
      <TopPerformersChart members={members} />
      <AgentPairingChart humanMembers={humanMembers} aiAgentCount={aiAgents.length} />
    </div>
  )
}
