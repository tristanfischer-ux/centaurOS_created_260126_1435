/**
 * @file page.tsx — P&L page (server component)
 *
 * @description Fetches cash out/in items and opening balance for
 * the Income Statement and Balance Sheet views.
 */

import { getPnlPageData } from '@/actions/cash-burn-pnl'
import { PnlView } from './pnl-view'

export const metadata = {
  title: 'P&L | ForgeOS',
  description: 'Projected Income Statement and Balance Sheet from cash flow data',
}

export default async function PnlPage() {
  const result = await getPnlPageData()

  return (
    <PnlView
      initialData={result.data}
      hasError={!!result.error}
    />
  )
}
