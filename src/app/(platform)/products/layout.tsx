/**
 * @file layout.tsx — Products route layout.
 *
 * @description Simple passthrough after the Pre-Phase Coming Soon sidecar was
 * lifted on 2026-04-20. The Products section is live in beta — users now reach
 * the real list + detail views directly. Legacy routes and the middleware
 * deep-link redirect were also removed in the same change.
 *
 * Per-page metadata still lives on each page file; this layout only sets the
 * tab title fallback.
 */

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Products | ForgeOS',
  description:
    'Hardware products — concept to market. Market assessment, unit economics, fundability scoring, and cross-linking with The Forge.',
}

export default function ProductsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
