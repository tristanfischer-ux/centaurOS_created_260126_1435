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

import { useCallback, useState } from 'react'
import { SpecialistInsightCard } from '@/components/specialists/specialist-insight-card'
import { InsightCardSkeleton } from '@/components/specialists/insight-card-skeleton'
import { usePageInsights } from '@/hooks/use-page-insights'
import { BriefSpecialistDialog } from '@/app/(platform)/agents/brief-specialist-dialog'
import { getSpecialistById } from '@/lib/agents/specialists-config'
import { generateInvestorInsights } from '@/actions/specialist-page-insights'
import type { InvestorStats, ShortlistStage } from '@/actions/investors'
import type { AgentInsight } from '@/actions/agent-insights'

const EMPTY_STATE_INSIGHT: AgentInsight = {
  id: 'fiona-investors-empty',
  foundry_id: '',
  specialist_id: 'fundraising-advisor',
  insight_type: 'recommendation',
  urgency: 'informational',
  title: 'Build your investor shortlist',
  body: "Browse the directory and shortlist investors that match your stage, sector, and cheque size. I'll help you prioritise and craft your outreach.",
  domain_data: {},
  suggested_actions: [],
  is_read: false,
  is_dismissed: false,
  acted_on: false,
  acted_on_at: null,
  created_at: new Date().toISOString(),
  expires_at: null,
}

interface InvestorAdvisorInsightsProps {
  stats: InvestorStats
  shortlistIds: Record<string, ShortlistStage>
}

export function InvestorAdvisorInsights({ stats, shortlistIds }: InvestorAdvisorInsightsProps) {
  const shortlistCount = Object.keys(shortlistIds).length
  // INTENT: Extract unique firm types from subcategory breakdown for Fiona's context
  const shortlistTypes = stats.subcategoryBreakdown.slice(0, 5).map(s => s.name)
  const shortlistLocations = stats.regionBreakdown.slice(0, 5).map(r => r.name)

  const [briefSpecialistId, setBriefSpecialistId] = useState<string | null>(null)
  const [briefHandoffContext, setBriefHandoffContext] = useState<string | null>(null)
  const briefSpecialist = briefSpecialistId ? getSpecialistById(briefSpecialistId) : null

  const handleDiscuss = useCallback((specialistId: string, context: string) => {
    setBriefHandoffContext(context)
    setBriefSpecialistId(specialistId)
  }, [])

  const { insights, dismissInsight, isLoading: insightsLoading } = usePageInsights(
    (fast) => generateInvestorInsights({
      totalFirms: stats.total,
      shortlistCount,
      shortlistTypes,
      shortlistLocations,
      activeFilters: '',
    }, fast),
    stats.total > 0,
    { cacheKey: 'fiona-investors', emptyInsight: EMPTY_STATE_INSIGHT },
  )

  if (insightsLoading) return <InsightCardSkeleton />
  if (insights.length === 0 && !briefSpecialist) return null

  return (
    <div className="space-y-3">
      {insights.map((insight) => (
        <SpecialistInsightCard
          key={insight.id}
          insight={insight}
          onDismiss={() => dismissInsight(insight.id)}
          onDiscuss={handleDiscuss}
          compact
        />
      ))}
      {briefSpecialist && (
        <BriefSpecialistDialog
          specialist={briefSpecialist}
          open={briefSpecialistId !== null}
          onOpenChange={(open) => {
            if (!open) {
              setBriefSpecialistId(null)
              setBriefHandoffContext(null)
            }
          }}
          handoffContext={briefHandoffContext}
          contextLabel="Investors"
        />
      )}
    </div>
  )
}
