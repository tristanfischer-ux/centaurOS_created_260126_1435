import {
  GraduationCap,
  MessageSquarePlus,
  ScrollText,
  ShoppingBag,
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
 */

export const marketplacePeopleNavigation: SidebarNavItem[] = [
  { name: 'Recruits', href: '/recruits', icon: UserSearch, tooltip: 'Find expert talent — fractional executives, specialists, and consultants' },
  { name: 'Guild', href: '/guild', icon: GraduationCap, tooltip: 'Community hub — events, networking, apprentice pool' },
  { name: 'Apprenticeship', href: '/apprenticeship', icon: ScrollText, tooltip: 'Track apprenticeship progress, OTJT hours, and learning modules' },
]

export const marketplaceSuppliesNavigation: SidebarNavItem[] = [
  { name: 'Marketplace', href: '/marketplace', icon: Store, tooltip: 'Find experts, suppliers, products, and services' },
  { name: 'Quotes', href: '/marketplace/quotes', icon: MessageSquarePlus, tooltip: 'Track your quote requests to suppliers' },
  { name: 'Orders', href: '/marketplace-orders', icon: ShoppingBag, tooltip: 'View and manage your marketplace orders' },
]
