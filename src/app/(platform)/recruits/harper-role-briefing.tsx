'use client'

/**
 * @file harper-role-briefing.tsx
 *
 * @description Pre-search role briefing from Harper (hiring-team specialist).
 * Renders as urgency-coded SpecialistInsightCards, matching the pattern
 * used on Fundraise, Investors, Team, and Marketplace pages.
 */

import { useCallback, useState } from 'react'
import { SpecialistInsightCard } from '@/components/specialists/specialist-insight-card'
import { usePageInsights } from '@/hooks/use-page-insights'
import { BriefSpecialistDialog } from '@/app/(platform)/agents/brief-specialist-dialog'
import { getSpecialistById } from '@/lib/agents/specialists-config'
import { generateRecruitsInsights } from '@/actions/specialist-page-insights'
import type { AgentInsight } from '@/actions/agent-insights'

const EMPTY_STATE_INSIGHT: AgentInsight = {
  id: 'harper-recruits-empty',
  foundry_id: '',
  specialist_id: 'hiring-team',
  insight_type: 'recommendation',
  urgency: 'informational',
  title: 'Find the right talent',
  body: "Browse the talent marketplace to find specialists for your team. I can help you identify skill gaps and prioritise your first hires.",
  domain_data: {},
  suggested_actions: [],
  is_read: false,
  is_dismissed: false,
  acted_on: false,
  acted_on_at: null,
  created_at: new Date().toISOString(),
  expires_at: null,
}

interface HarperRoleBriefingProps {
  totalListings: number
  categories: string[]
}

export function HarperRoleBriefing({ totalListings, categories }: HarperRoleBriefingProps) {
  const [briefSpecialistId, setBriefSpecialistId] = useState<string | null>(null)
  const [briefHandoffContext, setBriefHandoffContext] = useState<string | null>(null)
  const briefSpecialist = briefSpecialistId ? getSpecialistById(briefSpecialistId) : null

  const handleDiscuss = useCallback((specialistId: string, context: string) => {
    setBriefHandoffContext(context)
    setBriefSpecialistId(specialistId)
  }, [])

  const { insights, dismissInsight } = usePageInsights(
    (fast) => generateRecruitsInsights({
      totalListings,
      categories,
      teamGaps: [],
    }, fast),
    totalListings > 0,
    { cacheKey: 'harper-recruits', emptyInsight: EMPTY_STATE_INSIGHT },
  )

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
          contextLabel="Fractional Executives"
        />
      )}
    </div>
  )
}
