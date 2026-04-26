"use client"

/**
 * @file InvestorSpecialistBanner.tsx
 *
 * @description Specialist banner placeholder — removed specialist briefing UI per design direction.
 * File retained to avoid breaking any future import.
 */

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface InvestorSpecialistBannerProps {
  companyContext?: {
    sector?: string | null
    stage?: string | null
    fundingStatus?: string | null
    seekingFunding?: boolean
  }
  investorStats?: {
    total: number
    activeDeploying: number
    deepProfiled: number
    partnerCount: number
  }
  shortlistCount?: number
}

export function InvestorSpecialistBanner(_props: InvestorSpecialistBannerProps) {
  return null
}
