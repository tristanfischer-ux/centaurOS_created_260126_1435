/**
 * @file page.tsx — /products/[id] deep-link redirect (Pre-Phase).
 *
 * @description During the Pre-Phase Coming Soon period, any deep link to
 * /products/[id] (from CAD Lab, Fundraise, P&L product-column, Objectives,
 * notifications, etc.) redirects server-side to the read-only legacy view at
 * /products/legacy/[id]. Founders who click a "view linked product" link
 * from elsewhere in the app land on their actual data, not on the Coming
 * Soon bridge.
 *
 * If the id does not resolve to a product the user has access to, the legacy
 * detail page handles the 404 / not-found path.
 *
 * Server-side redirect via `next/navigation#redirect` throws a NEXT_REDIRECT
 * error that Next.js catches and converts to a 307 before the layout tree
 * renders — no Coming Soon flash.
 *
 * When Phase 4 ships, this file is restored to the real detail view
 * implementation.
 *
 * @related
 * - src/app/(platform)/products/layout.tsx — route gate (renders Coming Soon for non-legacy paths)
 * - src/app/(platform)/products/legacy/[id]/page.tsx — read-only destination
 * - Red-team R3 finding P2 (2026-04-19) — 8 cross-section links would have dead-ended on Coming Soon
 */

import { redirect } from 'next/navigation'

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/products/legacy/${id}`)
}
