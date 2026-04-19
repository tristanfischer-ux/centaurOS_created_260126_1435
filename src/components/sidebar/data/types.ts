import type { LucideIcon } from 'lucide-react'

/**
 * Shape of a single sidebar nav item. Matches the existing inline shape in
 * src/components/Sidebar.tsx — extracted here so section-owned data files
 * can export typed arrays that the sidebar component consumes.
 *
 * One file per section (see ./me, ./plan, ./money, ./workshop, ./marketplace,
 * ./supplier-portal). Later phases (Plan in PR #3, Money in PR #4) swap their
 * section's data file in isolation; no sidebar-component edit needed.
 */
export interface SidebarNavItem {
  name: string
  href: string
  icon: LucideIcon
  tooltip?: string
  indent?: boolean
  badge?: number
}
