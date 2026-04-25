"use client"

/**
 * @file strategy-health-review.tsx
 *
 * @description Specialist banner placeholder — removed specialist briefing UI per design direction.
 * File retained to avoid breaking imports in strategy-dashboard.tsx.
 */

interface StrategyHealthReviewProps {
  pillars?: { title: string; health: string; progress: number; overdueTasks: number; objectiveCount?: number }[]
  purposeSummary?: string | null
  totalObjectives?: number
  unlinkedObjectiveCount?: number
  className?: string
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function StrategyHealthReview(_props: StrategyHealthReviewProps) {
  return null
}
