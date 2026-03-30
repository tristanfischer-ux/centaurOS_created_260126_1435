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

  const severity = useMemo(() => {
    if (shortlistCount === 0) return 'warning' as const
    return 'success' as const
  }, [shortlistCount])

  const briefing = usePageBriefing(
    () => generatePageBriefing('fundraising-advisor', briefingContext, severity),
    severity,
    true,
    'briefing-investors',
  )

  const fallback = shortlistCount === 0
    ? "You haven't shortlisted any investors yet. Tell me your target raise and I'll help you build a focused pipeline — the right 20 investors beat a list of 200."
    : `You have ${shortlistCount} investor${shortlistCount !== 1 ? 's' : ''} shortlisted. Let me review your pipeline for gaps in stage coverage, sector fit, and geography.`

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
