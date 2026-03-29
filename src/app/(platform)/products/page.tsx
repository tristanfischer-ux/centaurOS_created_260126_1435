/**
 * @file page.tsx — Server component for the /products page.
 *
 * @description Authenticates the user, fetches products for the foundry,
 * and delegates rendering to the ProductListView client component.
 *
 * @related
 * - src/app/(platform)/products/product-list-view.tsx — Client component
 * - src/actions/products.ts — Server actions
 * - src/types/product.ts — Types
 */

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { getProducts } from '@/actions/products'
import { ProductListView } from './product-list-view'

export const metadata = {
  title: 'Products | ForgeOS',
  description: 'Your hardware products — from concept to market',
}

export default async function ProductsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const foundryId = await getFoundryIdCached()
  if (!foundryId) redirect('/today')

  const result = await getProducts()
  const products = result.data ?? []

  return <ProductListView products={products} />
}
