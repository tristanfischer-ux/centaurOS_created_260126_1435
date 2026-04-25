import {
  Hammer,
  UsersRound,
} from 'lucide-react'
import type { SidebarNavItem } from './types'

/**
 * WORKSHOP section — Wave 7 sidebar trim (2026-04-25, Tristan).
 *
 * Sidebar pared back to the four primary surfaces: Brainstorming, The Forge,
 * Investors, Suppliers. Team / Deliverables / Inspiration removed from the
 * primary nav. Investors lives in Money section, Suppliers in Marketplace
 * section.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getWorkshopNavigation(newForgeExperience: boolean = true): SidebarNavItem[] {
  const forgeHref = '/the-forge-v2'
  return [
    { name: 'Brainstorming', href: '/agents', icon: UsersRound, tooltip: 'Brainstorm with the Council — Sage, Priya, Fang, Fiona and the rest. Talk through any decision: product, fundraise, hiring, sequencing.' },
    { name: 'The Forge', href: forgeHref, icon: Hammer, tooltip: 'Describe what you are building — twenty minutes for the first pass, hours of detail after' },
  ]
}
