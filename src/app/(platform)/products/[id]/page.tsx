/**
 * @file page.tsx — Server component for the /products/[id] detail page.
 *
 * @description Authenticates the user, fetches the product by ID,
 * and delegates rendering to the ProductDetailView client component.
 *
 * @related
 * - src/app/(platform)/products/[id]/product-detail-view.tsx — Client component
 * - src/actions/products.ts — Server actions
 */

import { redirect } from 'next/navigation'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { getProduct } from '@/actions/products'
import { ProductDetailView } from './product-detail-view'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await getProduct(id)
  return {
    title: result.data ? `${result.data.name} | Products` : 'Product',
  }
}

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const foundryId = await getFoundryIdCached()
  if (!foundryId) redirect('/investors')

  const { id } = await params
  const result = await getProduct(id)

  if (result.error || !result.data) {
    notFound()
  }

  return <ProductDetailView product={result.data} />
}
