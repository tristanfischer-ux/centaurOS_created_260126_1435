import {
  BarChart3,
  Building2,
  Flame,
  Sprout,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import type { SidebarNavItem } from './types'

/**
 * MONEY section — legacy 6-item Cash Burn group for Phase 1.
 *
 * Per PHASE-PLAN.md + Tristan 2026-04-19: keep the current Cash Burn / Cash
 * Out / Cash In / P&L / Investors / Fundraise structure until Phase 4
 * lands. Phase 4 will swap this file for the 3-item Cockpit · Plan · Raise
 * structure per SHARED-SIDEBAR.html, with strikethrough pedagogy for the
 * retired 6.
 *
 * The section label rendered in the sidebar stays "Cash Burn" during Phase
 * 1 (matches legacy user expectations); Phase 4 changes it to "MONEY [V2]".
 * Rename happens at Phase 4 land, not here.
 */

export const moneyLegacyNavigation: SidebarNavItem[] = [
  { name: 'Cash Burn', href: '/cash-burn', icon: Flame, tooltip: '52-week runway analysis with scenario modelling' },
  { name: 'Cash Out', href: '/cash-burn/cash-out', icon: TrendingDown, tooltip: 'Fixed and variable cost management' },
  { name: 'Cash In', href: '/cash-burn/cash-in', icon: TrendingUp, tooltip: 'Revenue, loans, equity, and grants' },
  { name: 'P&L', href: '/cash-burn/pnl', icon: BarChart3, tooltip: 'Projected Income Statement and Balance Sheet' },
  { name: 'Investors', href: '/investors', icon: Building2, tooltip: 'Browse 600 UK VC and PE firms — search, filter, and track outreach' },
  { name: 'Fundraise', href: '/fundraise', icon: Sprout, tooltip: 'Track your fundraise pipeline — shortlisted investors, outreach, and coverage' },
]
