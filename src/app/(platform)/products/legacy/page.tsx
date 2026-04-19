/**
 * @file page.tsx — Server component for /products/legacy.
 *
 * @description Read-only legacy list view used during the Pre-Phase Coming
 * Soon period. Re-uses ProductListView with readOnly={true}; every creation,
 * edit, and delete control is hidden. Founders can click through to a
 * read-only detail view at /products/legacy/[id].
 *
 * This route is intentionally bypassed by the Products layout guard (see
 * products-route-gate.tsx) so deep links still work during the Pre-Phase.
 *
 * @related
 * - src/app/(platform)/products/product-list-view.tsx — client component (readOnly prop)
 * - src/app/(platform)/products/layout.tsx — layout guard
 * - src/actions/products.ts — getProducts
 */

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { getProducts } from '@/actions/products'
import { ProductListView } from '../product-list-view'

export const metadata: Metadata = {
  title: 'Products (legacy, read-only)',
  description: 'Your existing product records — read-only while the new workbench is built',
}

export default async function LegacyProductsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const foundryId = await getFoundryIdCached()
  if (!foundryId) redirect('/today')

  const result = await getProducts()
  const products = result.data ?? []

  return <ProductListView products={products} readOnly />
}
