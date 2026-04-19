import {
  Brain,
  CheckSquare,
  ClipboardCheck,
  FileOutput,
  Swords,
  Target,
  Waypoints,
} from 'lucide-react'
import type { SidebarNavItem } from './types'

/**
 * PLAN section — legacy 7-item structure for Phase 1.
 *
 * Per PHASE-PLAN.md + Tristan 2026-04-19: keep the current Strategy /
 * Objectives / Tasks / Review / Reports / Red Team / Knowledge structure
 * until Phase 3 lands. Phase 3 will swap this file out (single-file swap)
 * for the 3-item Plan · Report · History structure per SHARED-SIDEBAR.html.
 *
 * Do NOT anticipate Phase 3 here — SHARED-SIDEBAR.html shows the end state;
 * during Phase 1 we ship the pre-redesign nav to avoid 404s on routes that
 * don't exist yet (/plan, /plan/report, /plan/history land in Phase 3).
 */

export const planNavigation: SidebarNavItem[] = [
  { name: 'Strategy', href: '/strategy', icon: Waypoints, tooltip: 'Your strategic direction — pillars, progress, and health at a glance' },
  { name: 'Objectives', href: '/new-objectives', icon: Target, tooltip: 'Milestones that move the strategy forward' },
  { name: 'Tasks', href: '/new-tasks', icon: CheckSquare, tooltip: 'Day-to-day work that delivers on objectives' },
  { name: 'Review', href: '/review', icon: ClipboardCheck, tooltip: 'Content, tasks, and actions awaiting your approval' },
  { name: 'Reports', href: '/reports', icon: FileOutput, tooltip: 'Generate polished weekly updates and board packs from your live data' },
  { name: 'Red Team', href: '/red-team', icon: Swords, tooltip: 'Stress-test decisions with multi-LLM adversarial debate' },
  { name: 'Knowledge', href: '/knowledge', icon: Brain, tooltip: "Your team's accumulated knowledge — every document and decision sharpens the next answer" },
]
