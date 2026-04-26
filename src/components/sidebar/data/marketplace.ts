import {
  Store,
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
 * Recruits removed 2026-04-25 — page pulled from V1 scope.
 */

export const marketplacePeopleNavigation: SidebarNavItem[] = []

export const marketplaceSuppliesNavigation: SidebarNavItem[] = [
  { name: 'Suppliers', href: '/marketplace', icon: Store, tooltip: 'Find suppliers and manufacturers' },
]
