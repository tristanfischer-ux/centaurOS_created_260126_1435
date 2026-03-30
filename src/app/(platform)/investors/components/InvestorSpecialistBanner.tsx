"use client"

/**
 * @file InvestorSpecialistBanner.tsx
 *
 * @description Fiona (Fundraising) specialist banner shown above the investor page tabs.
 * Uses usePageBriefing for dynamic context-aware messaging.
 */

import { SpecialistBriefingHero } from '@/components/specialists/specialist-briefing-hero'
import { usePageBriefing } from '@/hooks/use-page-briefing'
import { generatePageBriefing } from '@/actions/specialist-page-insights'

export function InvestorSpecialistBanner() {
  const briefing = usePageBriefing(
    () => generatePageBriefing('fundraising-advisor', 'Investor directory page loaded', 'success'),
    'success',
    true,
    'briefing-investors',
  )

  return (
    <SpecialistBriefingHero
      specialistId="fundraising-advisor"
      specialistName="Fiona"
      specialistTitle="Fundraising"
      narrative={briefing.narrative}
      fallbackMessage="Browse and shortlist investors that match your stage, sector, and geography. I'll help you build a focused pipeline — not just a big list."
      isLoading={briefing.isLoading}
      severity={briefing.severity}
      context={{ type: 'general', title: 'Investors', description: 'Fiona on investors.', metadata: {} }}
      storageKey="investors"
    />
  )
}
