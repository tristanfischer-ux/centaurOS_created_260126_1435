import { redirect } from 'next/navigation'

/**
 * @file marketplace/page.tsx
 *
 * @description Suppliers browse page — removed from website nav 2026-05-20
 * per Tristan: "I want to remove the suppliers page from the website,
 * not get rid of the data." The supplier matching infra
 * (match_marketplace_listings_v2 RPC, Gemini 3.5 Flash explainer,
 * 8,347-listing pgvector corpus) remains alive and is consumed inside
 * Forge PDF output per the 2026-04-24 plumbing decision. Direct visits
 * to /marketplace redirect to The Forge — that is where supplier
 * results now surface for founders.
 *
 * To restore the browse surface: replace this file with the prior
 * SupplierSearchPanel composition (see git history before 2026-05-20).
 */

export default function MarketplacePage(): never {
  redirect('/the-forge-v2')
}
