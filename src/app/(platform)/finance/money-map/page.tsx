/**
 * @file page.tsx — Finance Money Map page
 *
 * @description Redirects to the Strategy canvas with the Money Map tab.
 * This provides a consistent URL under /finance while reusing the
 * existing Money Map implementation.
 */

import { redirect } from 'next/navigation'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Money Map | Finance | ForgeOS',
  description: 'Visualise your revenue streams, costs, and profitability',
}

export default function FinanceMoneyMapPage(): never {
  redirect('/canvas?tab=money-map')
}
