import {
  BookOpen,
  Store,
  UserSearch,
} from 'lucide-react'
import type { SidebarNavItem } from './types'

/**
 * MARKETPLACE section — flat 3-item list post-pivot.
 *
 * 2026-04-24: People/Supplies sub-headers collapsed. Inspiration moved here
 * from Workshop and renamed "Manufacturing Techniques". Items:
 *   - Hire People  (was "Recruits")
 *   - Suppliers    (was "Marketplace")
 *   - Manufacturing Techniques  (was "Inspiration" under Workshop)
 *
 * Hidden during pivot focus (2026-04-24): Guild, Apprenticeship, Quotes, Orders.
 * Arrays remain split (People / Supplies) for Sidebar.tsx render order; the
 * sub-header labels have been removed from the rendering.
 */

export const marketplacePeopleNavigation: SidebarNavItem[] = [
  { name: 'Hire People', href: '/recruits', icon: UserSearch, tooltip: 'Find expert talent — fractional executives, specialists, and consultants' },
]

export const marketplaceSuppliesNavigation: SidebarNavItem[] = [
  { name: 'Suppliers', href: '/marketplace', icon: Store, tooltip: 'Find experts, suppliers, products, and services' },
  { name: 'Manufacturing Techniques', href: '/learn', icon: BookOpen, tooltip: 'Techniques, tutorials, and expert guidance to level up your skills' },
]
