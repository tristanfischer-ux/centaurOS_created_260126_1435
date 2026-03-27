/**
 * @file forge-advisor-insights.tsx — Max's proactive insights for The Forge landing page
 *
 * @description Client component wrapper that calls generateForgeInsights on mount
 * and renders SpecialistInsightCards. Needed because forge-project-list.tsx is a
 * server component and cannot use hooks.
 *
 * @related
 * - Server action: src/actions/specialist-page-insights.ts (generateForgeInsights)
 * - Card component: src/components/specialists/specialist-insight-card.tsx
 */

'use client'

import { useCallback, useMemo } from 'react'
import { SpecialistInsightCard } from '@/components/specialists/specialist-insight-card'
import { usePageInsights } from '@/hooks/use-page-insights'
import { useAdvisorPanel } from '@/contexts/advisor-panel-context'
import { generateForgeInsights } from '@/actions/specialist-page-insights'
import type { AgentInsight } from '@/actions/agent-insights'
import type { CadLabProjectSummary } from '@/actions/cad-lab-projects'

// INTENT: Static coaching insight when no projects exist yet — no API call needed
const EMPTY_STATE_INSIGHT: AgentInsight = {
  id: 'max-forge-empty',
  foundry_id: '',
  specialist_id: 'cto',
  insight_type: 'recommendation',
  urgency: 'informational',
  title: 'Start your first project',
  body: "Start your first project to bring a product idea to life. I'll guide you through concept, design, specification, and sourcing.",
  domain_data: {},
  suggested_actions: [],
  is_read: false,
  is_dismissed: false,
  acted_on: false,
  acted_on_at: null,
  created_at: new Date().toISOString(),
  expires_at: null,
}

interface ForgeAdvisorInsightsProps {
  projects: CadLabProjectSummary[]
}

export function ForgeAdvisorInsights({ projects }: ForgeAdvisorInsightsProps) {
  const { openPanel } = useAdvisorPanel()
  const handleDiscuss = useCallback((specialistId: string, context: string) => {
    openPanel(specialistId, { handoffContext: context, contextLabel: 'The Forge' })
  }, [openPanel])

  const projectStats = useMemo(() => {
    let draftCount = 0
    let inProgressCount = 0
    let completedCount = 0
    for (const p of projects) {
      if (p.status === 'draft') draftCount++
      else if (p.status === 'complete' || p.status === 'rfq_created') completedCount++
      else inProgressCount++
    }
    return { projectCount: projects.length, draftCount, inProgressCount, completedCount, moduleTotal: 0 }
  }, [projects])

  const { insights, dismissInsight } = usePageInsights(
    () => generateForgeInsights(projectStats),
    projects.length > 0,
    { cacheKey: 'max-forge', emptyInsight: EMPTY_STATE_INSIGHT },
  )

  if (insights.length === 0) return null

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
    </div>
  )
}
