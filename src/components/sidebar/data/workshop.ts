import {
  Hammer,
} from 'lucide-react'
import type { SidebarNavItem } from './types'

/**
 * WORKSHOP section — Forge routing.
 *
 * The Forge entry is flag-aware: when `new_forge_experience` is true the
 * link routes to /the-forge-v2 (Phase 1 rebuild); otherwise to legacy
 * /the-forge. DEFAULT IS OFF to preserve the original experience — users
 * opt in per-profile when ready. CAD Lab remains at /the-forge/cad-lab
 * regardless.
 *
 * Rollback 2026-04-20: unconditional cutover to /the-forge-v2 reverted
 * because the V2 experience had unaddressed issues in production. Per-user
 * opt-in via new_forge_experience flag is the safer path.
 */

// Hidden during pivot focus (2026-04-24): Products, Browse, Team.
// Moved to Brainstorming 2026-04-24: Specialists (renamed "Brainstorm"), Outputs.
// Moved to Marketplace + renamed "Manufacturing Techniques" 2026-04-24: Inspiration.
export function getWorkshopNavigation(newForgeExperience: boolean = false): SidebarNavItem[] {
  const forgeHref = newForgeExperience ? '/the-forge-v2' : '/the-forge'
  return [
    { name: 'The Forge', href: forgeHref, icon: Hammer, tooltip: 'Explore materials, manufacturing approaches, and find suppliers' },
  ]
}
