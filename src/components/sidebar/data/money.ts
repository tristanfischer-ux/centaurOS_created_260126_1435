import {
  BarChart3,
  Building2,
  CircleDot,
  Flame,
  Gauge,
  Grid2X2,
  Sprout,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import type { SidebarNavItem } from './types'

/**
 * MONEY section — flag-aware.
 *
 * Flag OFF (default): legacy 6-item Cash Burn group (Cash Burn · Cash Out ·
 * Cash In · P&L · Investors · Fundraise). Routes `/cash-burn/*`, `/investors`,
 * `/fundraise`. This is the state on `main` and what every user sees until
 * their `new_money_experience` flag flips on.
 *
 * Flag ON: 3-item MONEY V2 group (Cockpit · Plan · Raise). Routes
 * `/money/cockpit`, `/money/plan`, `/money/raise`. Section header label
 * reads "MONEY [V2]" via `getMoneySectionLabel(flag)` helper.
 *
 * See Sidebar.tsx for consumer pattern. The flag is resolved in the
 * platform layout (src/app/(platform)/layout.tsx) via
 * `getFeatureFlag(supabase, user.id, FLAG_NEW_MONEY_EXPERIENCE)` and passed
 * to Sidebar as `newMoneyExperienceEnabled` prop.
 *
 * Data preservation: legacy `/cash-burn/*` + `/investors` + `/fundraise`
 * routes remain mounted post-cutover for 90 days (per MONEY-SCHEMA §5.4) so
 * users with bookmarked links still land somewhere useful. The legacy
 * navigation array stays exported to keep anything that imports it (old
 * sidebar code, tests, tooling) working during the rollout window.
 */

export const moneyLegacyNavigation: SidebarNavItem[] = [
  { name: 'Cash Burn', href: '/cash-burn', icon: Flame, tooltip: '52-week runway analysis with scenario modelling' },
  { name: 'Cash Out', href: '/cash-burn/cash-out', icon: TrendingDown, tooltip: 'Fixed and variable cost management' },
  { name: 'Cash In', href: '/cash-burn/cash-in', icon: TrendingUp, tooltip: 'Revenue, loans, equity, and grants' },
  { name: 'P&L', href: '/cash-burn/pnl', icon: BarChart3, tooltip: 'Projected Income Statement and Balance Sheet' },
  { name: 'Investors', href: '/investors', icon: Building2, tooltip: 'Browse 600 UK VC and PE firms — search, filter, and track outreach' },
  { name: 'Fundraise', href: '/fundraise', icon: Sprout, tooltip: 'Track your fundraise pipeline — shortlisted investors, outreach, and coverage' },
]

export const moneyV2Navigation: SidebarNavItem[] = [
  { name: 'Cockpit', href: '/money/cockpit', icon: Gauge, tooltip: 'Runway cockpit — cash balance, forecast, upcoming commitments' },
  { name: 'Plan', href: '/money/plan', icon: Grid2X2, tooltip: 'Plan line items + scenarios + variance vs Xero actuals' },
  { name: 'Raise', href: '/money/raise', icon: CircleDot, tooltip: 'Investor pipeline + thesis + pitch prep + monthly updates' },
]

/**
 * Return the nav array to render for the MONEY sidebar group. Pass the
 * resolved-per-user `new_money_experience` flag value.
 */
export function getMoneyNavigation(newMoneyExperience: boolean): SidebarNavItem[] {
  return newMoneyExperience ? moneyV2Navigation : moneyLegacyNavigation
}

/**
 * Section header label — "Cash Burn" (legacy) or "MONEY [V2]" (flagged on).
 * The [V2] tag is intentional pedagogy during the rollout window to signal
 * the surface has changed vs the legacy experience.
 */
export function getMoneySectionLabel(newMoneyExperience: boolean): string {
  return newMoneyExperience ? 'MONEY [V2]' : 'Cash Burn'
}

/**
 * Intro route for the MONEY section header click. Legacy → /cash-burn;
 * V2 → /money/cockpit (the runway cockpit is the obvious landing page).
 */
export function getMoneyIntroRoute(newMoneyExperience: boolean): string {
  return newMoneyExperience ? '/money/cockpit' : '/cash-burn'
}
