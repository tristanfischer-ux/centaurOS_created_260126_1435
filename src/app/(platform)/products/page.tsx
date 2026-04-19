/**
 * @file page.tsx — /products root page (Pre-Phase stub).
 *
 * @description During the Pre-Phase Coming Soon period, this page's output is
 * replaced by the ProductsLayout's route gate — it swaps to the Coming Soon
 * bridge whenever the pathname is under /products but not /products/legacy.
 * This stub therefore returns null; the layout renders everything visible.
 *
 * When Phase 4 ships, the Coming Soon sidecar is removed and this file is
 * restored to the real list view implementation. The pre-sidecar version
 * lives at the legacy route (/products/legacy) so no work is lost.
 *
 * @related
 * - src/app/(platform)/products/layout.tsx — route gate (renders Coming Soon)
 * - src/app/(platform)/products/legacy/page.tsx — read-only archive
 */

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Products',
  description: 'Products is being redesigned — coming soon',
}

export default function ProductsPage() {
  // INTENT: The layout gate renders the Coming Soon bridge in place of this
  // stub for live /products/* paths. Returning null keeps the page segment
  // rendered (Next requires something) without duplicating the bridge.
  return null
}
