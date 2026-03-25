'use client'

/**
 * @file harper-candidate-insights.tsx
 *
 * @description Post-search candidate evaluation from Harper (hiring-team specialist).
 * Takes search results and generates SpecialistInsightCards evaluating the top matches.
 */

import { useState, useEffect, useRef } from 'react'
import { SpecialistInsightCard } from '@/components/specialists/specialist-insight-card'
import { generateRecruitsInsights } from '@/actions/specialist-page-insights'
import type { AgentInsight } from '@/actions/agent-insights'

interface HarperCandidateInsightsProps {
  searchQuery: string
  resultCount: number
  topCategories: string[]
}

export function HarperCandidateInsights({
  searchQuery,
  resultCount,
  topCategories,
}: HarperCandidateInsightsProps) {
  const [insights, setInsights] = useState<AgentInsight[]>([])
  const lastQueryRef = useRef('')

  useEffect(() => {
    if (!searchQuery || searchQuery === lastQueryRef.current || resultCount === 0) return
    lastQueryRef.current = searchQuery

    // INTENT: Debounce — wait 2s after search settles before calling AI
    const timer = setTimeout(() => {
      generateRecruitsInsights({
        totalListings: resultCount,
        categories: topCategories,
        teamGaps: [],
        searchQuery,
      }).then((result) => {
        if (Array.isArray(result)) {
          setInsights(result)
        }
      }).catch(() => {
        // Non-critical — page works fine without insights
      })
    }, 2000)

    return () => clearTimeout(timer)
  }, [searchQuery, resultCount, topCategories])

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
