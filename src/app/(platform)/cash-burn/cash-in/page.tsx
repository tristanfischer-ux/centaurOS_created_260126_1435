/**
 * @file page.tsx — Cash In page (server component)
 *
 * @description Fetches active cash inflow items and passes to the client view.
 */

import { getCashInItems } from '@/actions/cash-burn-in'
import { CashInView } from './cash-in-view'

export const metadata = {
  title: 'Cash In | ForgeOS',
  description: 'Manage revenue, loans, equity, and grant inflows for burn modelling',
}

export default async function CashInPage() {
  const result = await getCashInItems()

  return (
    <CashInView
      initialItems={result.data ?? []}
      hasError={!!result.error}
    />
  )
}
