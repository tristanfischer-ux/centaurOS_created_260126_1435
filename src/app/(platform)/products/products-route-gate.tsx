/**
 * @file products-route-gate.tsx — Client-side pathname gate for /products/*.
 *
 * @description Decides whether to render the Coming Soon bridge or the legacy
 * read-only children based on the current pathname. Lives as a client
 * component so we can use usePathname() without a middleware header dance.
 *
 * @related
 * - src/app/(platform)/products/layout.tsx — server wrapper
 * - src/app/(platform)/products/coming-soon.tsx — bridge surface
 */

'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'

interface ProductsRouteGateProps {
  comingSoon: React.ReactNode
  children: React.ReactNode
}

export function ProductsRouteGate({ comingSoon, children }: ProductsRouteGateProps) {
  const pathname = usePathname() ?? ''

  // GATE: Only /products/legacy/* passes through to children. Everything else
  // under /products — including deep links that the old app supported like
  // /products/[uuid] — lands on the Coming Soon bridge. The safe default
  // when pathname is empty is the bridge, since we're in the Pre-Phase.
  const isLegacyRoute = pathname.startsWith('/products/legacy')

  return <>{isLegacyRoute ? children : comingSoon}</>
}
