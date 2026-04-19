/**
 * @file page.tsx — /products/[id] detail page (Pre-Phase stub).
 *
 * @description During the Pre-Phase Coming Soon period, this page's output is
 * replaced by the ProductsLayout's route gate — any deep link under
 * /products/* lands on the Coming Soon bridge. This stub therefore returns
 * null; the layout renders everything visible.
 *
 * Founders can still reach their data via /products/legacy/[id], which is
 * explicitly allowed through the layout guard.
 *
 * When Phase 4 ships, the Coming Soon sidecar is removed and this file is
 * restored to the real detail view implementation.
 *
 * @related
 * - src/app/(platform)/products/layout.tsx — route gate (renders Coming Soon)
 * - src/app/(platform)/products/legacy/[id]/page.tsx — read-only archive
 */

export default function ProductDetailPage() {
  // INTENT: Layout gate renders the Coming Soon bridge in place of this stub.
  // Returning null keeps the page segment mounted without double-rendering.
  return null
}
