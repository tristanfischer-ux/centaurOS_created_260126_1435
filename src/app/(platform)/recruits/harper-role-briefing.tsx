'use client'

/**
 * @file harper-role-briefing.tsx
 *
 * @description Pre-search role briefing from Harper (hiring-team specialist).
 * Renders as urgency-coded SpecialistInsightCards, matching the pattern
 * used on Fundraise, Investors, Team, and Marketplace pages.
 */

import { useState, useEffect, useRef } from 'react'
import { SpecialistInsightCard } from '@/components/specialists/specialist-insight-card'
import { generateRecruitsInsights } from '@/actions/specialist-page-insights'
import type { AgentInsight } from '@/actions/agent-insights'

interface HarperRoleBriefingProps {
  totalListings: number
  categories: string[]
}

export function HarperRoleBriefing({ totalListings, categories }: HarperRoleBriefingProps) {
  const [insights, setInsights] = useState<AgentInsight[]>([])
  const fetched = useRef(false)

  useEffect(() => {
    if (fetched.current) return
    fetched.current = true

    generateRecruitsInsights({
      totalListings,
      categories,
      teamGaps: [],
    }).then((result) => {
      if (Array.isArray(result) && result.length > 0) {
        setInsights(result)
      }
    }).catch(() => { /* Non-critical */ })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (insights.length === 0) return null

  return (
    <div className="space-y-3">
      {insights.map((insight) => (
        <SpecialistInsightCard
          key={insight.id}
          insight={insight}
          onDismiss={() => setInsights(prev => prev.filter(i => i.id !== insight.id))}
          compact
        />
      ))}
    </div>
  )
}
