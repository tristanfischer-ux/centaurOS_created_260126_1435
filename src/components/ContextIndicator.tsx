/**
 * @file ContextIndicator.tsx — Persistent context strip showing the active zone.
 *
 * @description Shows whether the user is in "Personal Space" (Me/Marketplace sections)
 * or a company workspace (Plan/Workshop sections). Prevents "where am I?" confusion
 * when users have multiple companies.
 *
 * @related
 * - Sidebar: src/components/Sidebar.tsx
 * - Section registry: src/lib/features/section-registry.ts
 */

'use client'

import { usePathname } from 'next/navigation'
import { User, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Routes that belong to the "Person" (Me) zone or are not company-specific.
 * Everything not in this list is treated as Company context.
 */
const PERSON_ROUTES = [
  '/home',
  '/me',
  '/my-profile',
  '/marketplace',
  '/marketplace-hub',
  '/marketplace-orders',
  '/recruits',
  '/guild',
  '/apprenticeship',
  '/playbooks',
  '/settings',
]

/**
 * Determines if the current route is a person-level route.
 */
function isPersonRoute(pathname: string): boolean {
  return PERSON_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  )
}

interface ContextIndicatorProps {
  foundryName: string
  userName: string
}

/**
 * ContextIndicator — Persistent strip showing whether the user is in
 * "Personal Space" or a specific company workspace.
 *
 * @description Prevents the "where am I?" confusion when users have
 * multiple companies. Always visible at the top of the content area.
 *
 * @param {string} foundryName - The active company/foundry name
 * @param {string} userName - The current user's display name
 */
export function ContextIndicator({
  foundryName,
  userName,
}: ContextIndicatorProps): React.ReactElement {
  const pathname = usePathname()
  const isPerson = isPersonRoute(pathname)

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-4 sm:px-6 lg:px-8 py-2 text-xs font-medium border-b transition-colors',
        isPerson
          ? 'bg-muted/30 text-muted-foreground border-slate-100'
          : 'bg-orange-50/50 text-international-orange border-orange-100/50'
      )}
    >
      {isPerson ? (
        <>
          <User className="h-3.5 w-3.5" />
          <span>
            {userName} &middot; Personal Space
          </span>
        </>
      ) : (
        <>
          <Building2 className="h-3.5 w-3.5" />
          <span>{foundryName}</span>
        </>
      )}
    </div>
  )
}
