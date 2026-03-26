/**
 * @file cal-daily-summary.tsx
 *
 * @description Cal's daily executive summary — urgency-triaged insights
 * rendered after the hero narrative card on the Today page. Fires a single
 * Haiku call on mount and renders SpecialistInsightCard instances.
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { SpecialistInsightCard } from '@/components/specialists/specialist-insight-card'
import { generateTodayBriefing, type TodayInsightInput } from '@/actions/specialist-page-insights'
import type { AgentInsight } from '@/actions/agent-insights'

interface CalDailySummaryProps {
  input: TodayInsightInput
}

export function CalDailySummary({ input }: CalDailySummaryProps) {
  const [insights, setInsights] = useState<AgentInsight[]>([])
  const fetched = useRef(false)

  useEffect(() => {
    // SECURITY: Prevent duplicate AI calls from React Strict Mode double-mount
    if (fetched.current) return

    // Don't waste an AI credit when there's nothing meaningful to triage
    const hasData = input.overdueCount > 0 || input.dueToday > 0 || input.completedToday > 0
      || input.blockerCount > 0 || input.pendingApprovalCount > 0 || input.atRiskObjectiveCount > 0
      || input.strategyAtRisk > 0 || input.strategyOffTrack > 0 || input.unreadMessages > 0
    if (!hasData) return

    fetched.current = true

    generateTodayBriefing(input)
      .then((result) => {
        if (Array.isArray(result) && result.length > 0) {
          setInsights(result)
        }
      })
      .catch(() => { /* Non-critical — section collapses gracefully */ })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (insights.length === 0) return null

  return (
    <motion.div
      className="space-y-3"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {insights.map((insight) => (
        <SpecialistInsightCard
          key={insight.id}
          insight={insight}
          onDismiss={() => setInsights(prev => prev.filter(i => i.id !== insight.id))}
          compact
        />
      ))}
    </motion.div>
  )
}
