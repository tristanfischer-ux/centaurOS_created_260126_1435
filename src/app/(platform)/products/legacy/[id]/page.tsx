/**
 * @file page.tsx — Server component for /products/legacy/[id].
 *
 * @description Read-only legacy detail view used during the Pre-Phase Coming
 * Soon period. Re-uses ProductDetailView with readOnly={true}; a fieldset
 * wraps every tab panel to disable all edit, mutate, and delete controls,
 * and a banner at the top makes the state clear.
 *
 * @related
 * - src/app/(platform)/products/[id]/product-detail-view.tsx — client component (readOnly prop)
 * - src/app/(platform)/products/layout.tsx — layout guard
 * - src/actions/products.ts — getProduct
 */

import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { getProduct } from '@/actions/products'
import { ProductDetailView } from '../../[id]/product-detail-view'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await getProduct(id)
  return {
    title: result.data ? `${result.data.name} (legacy, read-only)` : 'Product (legacy)',
  }
}

export default async function LegacyProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const foundryId = await getFoundryIdCached()
  if (!foundryId) redirect('/today')

  const { id } = await params
  const result = await getProduct(id)

  if (result.error || !result.data) {
    notFound()
  }

  return <ProductDetailView product={result.data} readOnly />
}
