import {
  AppWindow,
  CalendarDays,
  Clock,
  Compass,
  MessageCircle,
  UserCircle,
} from 'lucide-react'
import type { SidebarNavItem } from './types'

/**
 * ME section — personal pages. Welcome + Today rendered first, then the rest.
 *
 * Knowledge moved to Plan section (organisational, not personal).
 * Supplier Portal is a separate section — see ./supplier-portal.
 */

export const welcomeNavItem: SidebarNavItem = {
  name: 'Welcome',
  href: '/welcome',
  icon: Compass,
  tooltip: 'A tour of ForgeOS from Tristan — the sections, the specialists, and where to start',
}

export const todayNavItem: SidebarNavItem = {
  name: 'Today',
  href: '/today',
  icon: CalendarDays,
  tooltip: 'Your personalized daily focus — tasks, risks, and wins',
}

export const meNavigation: SidebarNavItem[] = [
  { name: 'My Profile', href: '/my-profile', icon: UserCircle, tooltip: 'Your profile, companies, and marketplace presence' },
  { name: 'Comms', href: '/updates', icon: MessageCircle, tooltip: 'Activity feed, conversations, and direct messages' },
  { name: 'Time', href: '/time', icon: Clock, tooltip: 'Track hours across your projects and tasks' },
  { name: 'Google Apps', href: '/google-apps', icon: AppWindow, tooltip: 'Your Google Drive, Docs, Calendar, and Email' },
]
