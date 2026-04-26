import {
  CalendarDays,
  Compass,
  UserCircle,
} from 'lucide-react'
import type { SidebarNavItem } from './types'

/**
 * ME section — personal pages. Welcome + Today rendered first, then the rest.
 *
 * Knowledge moved to Plan section (organisational, not personal).
 * Supplier Portal is a separate section — see ./supplier-portal.
 *
 * Hidden during pivot focus (2026-04-24): Comms, Time, Google Apps.
 */

export const welcomeNavItem: SidebarNavItem = {
  name: 'Welcome',
  href: '/welcome',
  icon: Compass,
  tooltip: 'A tour of Fractional Forge from Tristan — the sections, the specialists, and where to start',
}

export const todayNavItem: SidebarNavItem = {
  name: 'Today',
  href: '/today',
  icon: CalendarDays,
  tooltip: 'Your personalized daily focus — tasks, risks, and wins',
}

export const meNavigation: SidebarNavItem[] = [
  { name: 'My Profile', href: '/my-profile', icon: UserCircle, tooltip: 'Your profile, companies, and marketplace presence' },
]
