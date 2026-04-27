import {
  Building2,
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

// Hidden during pivot focus (2026-04-24): Cash Burn, Cash Out, Cash In, P&L, Fundraise.
// Investors stays — primary product surface post-pivot.
export const moneyLegacyNavigation: SidebarNavItem[] = [
  { name: 'Investors', href: '/investors', icon: Building2, tooltip: 'Search VC, PE, accelerator, grant and family-office investors — filter and track outreach' },
]
