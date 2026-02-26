/**
 * @file page.tsx — Cash Out page (server component)
 *
 * @description Fetches active cost items and passes to the client view.
 */

import { getCashOutItems } from '@/actions/cash-burn-out'
import { CashOutView } from './cash-out-view'

export const metadata = {
  title: 'Cash Out | ForgeOS',
  description: 'Manage fixed and variable cost items for cash burn modelling',
}

export default async function CashOutPage() {
  const result = await getCashOutItems()

  return (
    <CashOutView
      initialItems={result.data ?? []}
      hasError={!!result.error}
    />
  )
}
