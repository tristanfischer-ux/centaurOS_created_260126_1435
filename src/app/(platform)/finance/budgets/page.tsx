/**
 * @file page.tsx — Budget vs Actual tracking page
 *
 * @description Shows budget allocations with actual spend from Money Map,
 * variance indicators, and budget creation.
 */

import type { Metadata } from 'next'
import { getBudgetsVsActual } from '@/actions/finance-budgets'
import { BudgetsView } from './budgets-view'

export const metadata: Metadata = {
  title: 'Budgets | Finance | ForgeOS',
  description: 'Track budget allocations vs actual spend',
}

export default async function BudgetsPage(): Promise<React.ReactNode> {
  const result = await getBudgetsVsActual().catch(() => ({
    data: null,
    error: 'Failed to load budgets',
  }))

  return <BudgetsView initialData={result.data ?? []} />
}
