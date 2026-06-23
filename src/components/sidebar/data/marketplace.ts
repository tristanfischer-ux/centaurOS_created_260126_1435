import {
  Store,
} from 'lucide-react'
import type { SidebarNavItem } from './types'

/**
 * MARKETPLACE section.
 *
 * Tristan 2026-05-20: the old /marketplace browse surface was retired (it now
 * redirects to The Forge). The supplier data + matching infra
 * (match_marketplace_listings_v2, Gemini 3.5 Flash explainer, pgvector corpus)
 * stayed alive throughout — only the nav entry was removed.
 *
 * Re-link 2026-06-23: the WORKING supplier search/directory surface lives at
 * /suppliers/search (server page → searchSuppliers in src/actions/suppliers.ts;
 * semantic + FTS + keyword fallback). Re-added a "Suppliers" nav item pointing
 * at it so founders can reach supplier search from the sidebar again. The old
 * /marketplace → /the-forge-v2 redirect is left in place — it does not block
 * reaching /suppliers/search.
 *
 * Restore further entries by re-adding SidebarNavItem objects here.
 */

export const marketplacePeopleNavigation: SidebarNavItem[] = [
  // Fractional Executives hidden during pivot focus (2026-04-24).
]

export const marketplaceSuppliesNavigation: SidebarNavItem[] = [
  {
    name: 'Suppliers',
    href: '/suppliers/search',
    icon: Store,
    tooltip: 'Search the supplier directory — describe what you need and get ranked matches',
  },
]
