"use client"

/**
 * @file InvestorSpecialistBanner.tsx
 *
 * @description Fiona (Fundraising) specialist banner shown above the investor page tabs.
 * Uses usePageBriefing with rich company + investor context so Fiona gives
 * actionable advice (how much to raise, which investor types, pipeline gaps).
 */

import { useMemo } from 'react'
import { SpecialistBriefingHero } from '@/components/specialists/specialist-briefing-hero'
import { usePageBriefing } from '@/hooks/use-page-briefing'
import { generatePageBriefing } from '@/actions/specialist-page-insights'

interface InvestorSpecialistBannerProps {
  /** Company profile data for context */
  companyContext?: {
    sector?: string | null
    stage?: string | null
    fundingStatus?: string | null
    seekingFunding?: boolean
  }
  /** Investor database stats */
  investorStats?: {
    total: number
    activeDeploying: number
    deepProfiled: number
    partnerCount: number
  }
  /** Number of investors shortlisted */
  shortlistCount?: number
}

export function InvestorSpecialistBanner({
  companyContext,
  investorStats,
  shortlistCount = 0,
}: InvestorSpecialistBannerProps) {
  // INTENT: Build rich context so Fiona gives specific, actionable advice
  // (not generic "goldmine of warm connections")
  const briefingContext = useMemo(() => {
    const parts: string[] = []

    // Company situation
    if (companyContext?.stage) parts.push(`Company stage: ${companyContext.stage}`)
    if (companyContext?.sector) parts.push(`Sector: ${companyContext.sector}`)
    if (companyContext?.fundingStatus) parts.push(`Funding status: ${companyContext.fundingStatus}`)
    if (companyContext?.seekingFunding) parts.push('Currently seeking funding')

    // Investor pipeline
    if (investorStats) {
      parts.push(`Investor database: ${investorStats.total} firms, ${investorStats.activeDeploying} actively deploying, ${investorStats.deepProfiled} deep-profiled, ${investorStats.partnerCount} partner contacts`)
    }
    parts.push(`Shortlisted investors: ${shortlistCount}`)

    if (shortlistCount === 0) {
      parts.push('No investors shortlisted yet — founder needs help building a focused pipeline')
    } else if (shortlistCount < 5) {
      parts.push('Pipeline is thin — suggest expanding the shortlist with specific criteria')
    }

    return parts.join('. ')
  }, [companyContext, investorStats, shortlistCount])

  // INTENT: Empty shortlist is a starting point, not a warning. 'warning'
  // severity feeds failure framing into the AI briefing. Keep positive tone
  // unless there's a real signal (e.g. existing shortlist went stale — TBD
  // when we add last-contact tracking).
  const severity = useMemo(() => 'success' as const, [])

  const briefing = usePageBriefing(
    () => generatePageBriefing('fundraising-advisor', briefingContext, severity),
    severity,
    true,
    'briefing-investors',
  )

  const fallback = "I'm Fiona. Investors decide in 90 seconds whether you're worth a meeting — so let's find the ones already primed to say yes. I've built matching that finds investors by thesis fit, not just sector tags. Try the search with your one-line pitch and see who lights up."

  return (
    <SpecialistBriefingHero
      specialistId="fundraising-advisor"
      specialistName="Fiona"
      specialistTitle="Fundraising"
      narrative={briefing.narrative}
      fallbackMessage={fallback}
      isLoading={briefing.isLoading}
      severity={briefing.severity}
      context={{ type: 'general', title: 'Investors', description: briefingContext, metadata: {} }}
      storageKey="investors"
    />
  )
}
