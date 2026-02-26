/**
 * @file page.tsx — Cash Burn main page (server component)
 *
 * @description Fetches burn data (cash out, cash in, scenarios) and
 * passes to the client-side CashBurnView for interactive scenario analysis.
 */

import { getBurnPageData } from '@/actions/cash-burn-scenarios'
import { CashBurnView } from './cash-burn-view'

export const metadata = {
  title: 'Cash Burn | ForgeOS',
  description: 'Scenario-based cash burn analysis with 52-week runway projections',
}

export default async function CashBurnPage() {
  const result = await getBurnPageData()

  return (
    <CashBurnView
      initialData={result.data}
      hasError={!!result.error}
    />
  )
}
