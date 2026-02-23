/**
 * @file page.tsx — Finance Money Map page
 *
 * @description Renders the Money Map directly under /finance/money-map.
 * Previously redirected to the Strategy canvas, but that route was
 * deprecated in favour of the standalone Strategy page — breaking the
 * tab‑param chain. Now renders MoneyMapClient inline.
 */

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { MoneyMapClient } from '@/app/(platform)/money-map/money-map-client'

export const metadata: Metadata = {
  title: 'Money Map | Finance | ForgeOS',
  description: 'Visualise your revenue streams, costs, and profitability',
}

export default async function FinanceMoneyMapPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return <MoneyMapClient />
}
