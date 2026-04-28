import {
  FileOutput,
  History,
  Star,
  UsersRound,
} from 'lucide-react'
import type { SidebarNavItem } from './types'

/**
 * PLAN section — flag-aware during the Phase 3 rollout.
 *
 * When `new_plan_experience` is OFF (default), the section renders the legacy
 * 7-item structure: Strategy / Objectives / Tasks / Review / Reports /
 * Red Team / Knowledge. This is the pre-Phase-3 surface and continues to work
 * against all the existing routes.
 *
 * When `new_plan_experience` is ON, the section renders the 3-item structure
 * per SHARED-SIDEBAR.html + PLAN-MOCKUP-INDEX.html: Plan / Report / History.
 * These routes (/plan, /plan/report, /plan/history) land as part of Phase 3.
 *
 * Consumers should call `getPlanNavigation(flagOn)` rather than importing the
 * raw arrays. The named exports `planNavigation` (legacy) and
 * `planNavigationV2` (new) are kept public for shared surfaces that need a
 * specific variant without a flag read.
 *
 * Mirrors the `getWorkshopNavigation(newForgeExperience: boolean)` signature
 * in ./workshop.ts so both section-level flag switches read the same.
 */

// Hidden during pivot focus (2026-04-24): Strategy, Objectives, Tasks, Outputs,
// Review, Reports, Red Team, Knowledge.
// Only Brainstorm remains — the primary product surface post-pivot.
export const planNavigation: SidebarNavItem[] = [
  { name: 'Brainstorm', href: '/agents', icon: UsersRound, tooltip: 'Open the brainstorming page — idea prompts, huddles, and team meetings' },
]

export const planNavigationV2: SidebarNavItem[] = [
  { name: 'Plan', href: '/plan', icon: Star, tooltip: 'Your strategic workspace — goals, objectives, and tasks in one place' },
  { name: 'Report', href: '/plan/report', icon: FileOutput, tooltip: 'Ship weekly, monthly, and quarterly updates with grounded data' },
  { name: 'History', href: '/plan/history', icon: History, tooltip: 'Your auto-populated decision log — every choice, searchable' },
]

export function getPlanNavigation(newPlanExperience: boolean): SidebarNavItem[] {
  return newPlanExperience ? planNavigationV2 : planNavigation
}
