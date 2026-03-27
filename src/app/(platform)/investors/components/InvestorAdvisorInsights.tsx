/**
 * @file InvestorAdvisorInsights.tsx — Fiona's proactive insights for the Investor Directory
 *
 * @description Client component wrapper that calls generateInvestorInsights on mount
 * and renders SpecialistInsightCards. Needed because the Investors page.tsx is a server
 * component and cannot use hooks.
 *
 * @related
 * - Server action: src/actions/specialist-page-insights.ts (generateInvestorInsights)
 * - Card component: src/components/specialists/specialist-insight-card.tsx
 */

'use client'

import { SpecialistInsightCard } from '@/components/specialists/specialist-insight-card'
import { usePageInsights } from '@/hooks/use-page-insights'
import { generateInvestorInsights } from '@/actions/specialist-page-insights'
import type { InvestorStats, ShortlistStage } from '@/actions/investors'

interface InvestorAdvisorInsightsProps {
  stats: InvestorStats
  shortlistIds: Record<string, ShortlistStage>
}

export function InvestorAdvisorInsights({ stats, shortlistIds }: InvestorAdvisorInsightsProps) {
  const shortlistCount = Object.keys(shortlistIds).length
  // INTENT: Extract unique firm types from subcategory breakdown for Fiona's context
  const shortlistTypes = stats.subcategoryBreakdown.slice(0, 5).map(s => s.name)
  const shortlistLocations = stats.regionBreakdown.slice(0, 5).map(r => r.name)

  const { insights, dismissInsight } = usePageInsights(
    () => generateInvestorInsights({
      totalFirms: stats.total,
      shortlistCount,
      shortlistTypes,
      shortlistLocations,
      activeFilters: '',
    }),
    stats.total > 0,
  )

  if (insights.length === 0) return null

  return (
    <div className="space-y-3">
      {insights.map((insight) => (
        <SpecialistInsightCard
          key={insight.id}
          insight={insight}
          onDismiss={() => dismissInsight(insight.id)}
          compact
        />
      ))}
    </div>
  )
}
