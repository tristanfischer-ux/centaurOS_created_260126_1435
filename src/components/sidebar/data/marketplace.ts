import {
  Store,
} from 'lucide-react'
import type { SidebarNavItem } from './types'

/**
 * MARKETPLACE section — simplified post-pivot.
 *
 * 2026-04-24 pivot focus: Suppliers only. Hidden items: Fractional Executives
 * (was "Recruits"), Manufacturing Techniques (was "Inspiration" under Workshop),
 * Guild, Apprenticeship, Quotes, Orders.
 *
 * Arrays remain split (People / Supplies) for Sidebar.tsx render order.
 * People array is empty during pivot focus — only Suppliers is active.
 */

export const marketplacePeopleNavigation: SidebarNavItem[] = [
  // Fractional Executives hidden during pivot focus (2026-04-24).
]

export const marketplaceSuppliesNavigation: SidebarNavItem[] = [
  { name: 'Suppliers', href: '/marketplace', icon: Store, tooltip: 'Find experts, suppliers, products, and services' },
  // Manufacturing Techniques hidden during pivot focus (2026-04-24).
]
