"use client"

import { HealthOverviewChart } from "./charts/health-overview-chart"
import { ProgressDistributionChart } from "./charts/progress-distribution-chart"
import { TaskStatusMixChart } from "./charts/task-status-mix-chart"
import { AttentionNeededChart } from "./charts/attention-needed-chart"

/**
 * Task data within an objective for analytics.
 */
export interface AnalyticsTask {
  id: string
  status: string | null
  end_date: string | null
}

/**
 * Objective data required for analytics charts.
 */
export interface AnalyticsObjective {
  id: string
  title: string
  created_at: string | null
  tasks: AnalyticsTask[]
}

interface ObjectivesAnalyticsProps {
  /** All objectives to analyze */
  objectives: AnalyticsObjective[]
}

/**
 * ObjectivesAnalytics - Compact analytics dashboard for objectives page.
 * 
 * @description Displays 4 small charts showing health overview,
 * progress distribution, task status mix, and attention needed items.
 * Charts surface actionable insights about portfolio health.
 * 
 * @component
 * 
 * @example
 * <ObjectivesAnalytics objectives={objectives} />
 */
export function ObjectivesAnalytics({ objectives }: ObjectivesAnalyticsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <HealthOverviewChart objectives={objectives} />
      <ProgressDistributionChart objectives={objectives} />
      <TaskStatusMixChart objectives={objectives} />
      <AttentionNeededChart objectives={objectives} />
    </div>
  )
}
