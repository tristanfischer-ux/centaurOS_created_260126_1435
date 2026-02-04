"use client"

import { StatusFunnelChart } from "./charts/status-funnel-chart"
import { DueDatesChart } from "./charts/due-dates-chart"
import { RiskLevelChart } from "./charts/risk-level-chart"
import { CompletionRateChart } from "./charts/completion-rate-chart"

/**
 * Task data required for analytics charts.
 */
export interface AnalyticsTask {
  id: string
  status: string | null
  risk_level?: string | null
  end_date: string | null
  created_at: string | null
}

interface TasksAnalyticsProps {
  /** All tasks to analyze */
  tasks: AnalyticsTask[]
}

/**
 * TasksAnalytics - Compact analytics dashboard for tasks page.
 * 
 * @description Displays 4 small charts showing status funnel,
 * due date urgency, risk level distribution, and completion rate.
 * Charts surface actionable insights: bottlenecks, overdue items, and progress.
 * 
 * @component
 * 
 * @example
 * <TasksAnalytics tasks={tasks} />
 */
export function TasksAnalytics({ tasks }: TasksAnalyticsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <StatusFunnelChart tasks={tasks} />
      <DueDatesChart tasks={tasks} />
      <RiskLevelChart tasks={tasks} />
      <CompletionRateChart tasks={tasks} />
    </div>
  )
}
