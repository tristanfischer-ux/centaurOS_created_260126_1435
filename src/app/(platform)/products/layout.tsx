/**
 * @file layout.tsx — Pre-Phase Products route guard.
 *
 * @description Every request under /products passes through this layout. If the
 * path is /products or anything else under /products/* (except /products/legacy),
 * we render the Coming Soon bridge. Deep links under /products/legacy pass
 * through to their children — the read-only legacy views — so founders can
 * still see their data while the new workbench is built.
 *
 * The pathname is read on the client via usePathname(), so the actual decision
 * is made inside <ProductsRouteGate>. The server layout pre-renders both
 * surfaces and hands them as slots.
 *
 * This sits behind a dedicated branch (feat/products-coming-soon) and will
 * be removed when the new Products experience ships in Phase 4.
 *
 * @related
 * - src/app/(platform)/products/coming-soon.tsx — the bridge surface
 * - src/app/(platform)/products/products-route-gate.tsx — client gate
 * - src/app/(platform)/products/legacy/page.tsx — read-only list
 * - src/app/(platform)/products/legacy/[id]/page.tsx — read-only detail
 */

import type { Metadata } from 'next'
import { ProductsComingSoon } from './coming-soon'
import { ProductsRouteGate } from './products-route-gate'

// FIX: Layout-level metadata prevents the root-layout "ForgeOS — The Operating
// System for Hardware Startups" marketing title from flashing for /products/*
// URLs on navigation. Layout metadata wins the Next 15 cascade for descendants
// unless a page.tsx overrides. The Coming Soon and legacy read-only surfaces
// inherit this; the forthcoming Phase 4 detail pages will override with their
// own per-product titles.
export const metadata: Metadata = {
  title: 'Products | ForgeOS',
  description:
    'Products is being redesigned — a market-validation workbench covering hypothesis testing, TAM/SAM/SOM, evidence logs, unit economics, and investor-readiness.',
}

export default async function ProductsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // PERF: Pre-render the Coming Soon surface on the server so the client gate
  // can swap between it and {children} without a second round-trip when the
  // user navigates between deep /products/* links.
  const comingSoon = await ProductsComingSoon()

  return (
    <ProductsRouteGate comingSoon={comingSoon}>
      {children}
    </ProductsRouteGate>
  )
}
