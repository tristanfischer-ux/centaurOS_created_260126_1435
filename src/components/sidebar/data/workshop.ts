import {
  Hammer,
} from 'lucide-react'
import type { SidebarNavItem } from './types'

/**
 * WORKSHOP section — Forge routing.
 *
 * The Forge entry unconditionally routes to /the-forge-v2, the canonical
 * V2 narrative-pipeline experience. The V1 legacy surface (/the-forge)
 * issues its own redirect to /the-forge-v2, so both paths converge.
 *
 * The `newForgeExperience` flag parameter is retained for API compatibility
 * (Sidebar.tsx still passes it) but no longer gates the href — V2 is the
 * only entry point for all users.
 *
 * History:
 * - Rollback 2026-04-20: unconditional cutover reverted (V2 had issues).
 * - Reinstated 2026-04-29 (loop-25): V2 is now the canonical surface;
 *   V1 must not be reachable for any user including production foundries.
 */

// Hidden during pivot focus (2026-04-24): Products, Browse, Team.
// Moved to Brainstorming 2026-04-24: Specialists (renamed "Brainstorm"), Outputs.
// Moved to Marketplace + renamed "Manufacturing Techniques" 2026-04-24: Inspiration.
export function getWorkshopNavigation(_newForgeExperience: boolean = false): SidebarNavItem[] {
  return [
    { name: 'The Forge', href: '/the-forge-v2', icon: Hammer, tooltip: 'Explore materials, manufacturing approaches, and find suppliers' },
  ]
}
