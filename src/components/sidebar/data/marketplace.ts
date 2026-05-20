import {
  Store,
} from 'lucide-react'
import type { SidebarNavItem } from './types'

/**
 * MARKETPLACE section — empty post-2026-05-20 nav simplification.
 *
 * Tristan 2026-05-20: Suppliers page removed from website nav. Supplier data
 * + matching infra (match_marketplace_listings_v2, Gemini 3.5 Flash explainer,
 * 8,347-listing pgvector corpus) remain alive and reachable directly via
 * /marketplace and inside Forge PDF generation. Just unlisted from the
 * sidebar — consistent with the 2026-04-24 pivot decision that suppliers
 * belong INSIDE Forge output rather than as their own browse surface.
 *
 * App nav as of 2026-05-20: Welcome / My Profile / Brainstorm / The Forge /
 * Investors. The Money / Fundraising section is flag-gated separately.
 *
 * Arrays remain exported as empty to keep Sidebar.tsx imports working.
 * Restore by re-adding the SidebarNavItem entries.
 */

export const marketplacePeopleNavigation: SidebarNavItem[] = [
  // Fractional Executives hidden during pivot focus (2026-04-24).
]

export const marketplaceSuppliesNavigation: SidebarNavItem[] = [
  // Suppliers removed from nav 2026-05-20 — see file-level comment.
]
