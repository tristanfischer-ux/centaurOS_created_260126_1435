import {
  Store,
  UserSearch,
} from 'lucide-react'
import type { SidebarNavItem } from './types'

/**
 * MARKETPLACE section — PEOPLE + SUPPLIES sub-groups.
 *
 * Playbooks content moved into the Objectives page as "Other ideas for you
 * to be getting on with". Learn/educational content moved to Workshop as
 * "Inspiration". This mirrors the Team page pattern (your stuff +
 * marketplace).
 *
 * Hidden during pivot focus (2026-04-24): Guild, Apprenticeship, Quotes, Orders.
 */

export const marketplacePeopleNavigation: SidebarNavItem[] = [
  { name: 'Recruits', href: '/recruits', icon: UserSearch, tooltip: 'Find expert talent — fractional executives, specialists, and consultants' },
]

export const marketplaceSuppliesNavigation: SidebarNavItem[] = [
  { name: 'Marketplace', href: '/marketplace', icon: Store, tooltip: 'Find experts, suppliers, products, and services' },
]
