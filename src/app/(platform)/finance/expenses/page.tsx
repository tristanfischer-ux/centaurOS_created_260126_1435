/**
 * @file page.tsx — Expense tracking page
 *
 * @description Lists all expenses with filters and quick entry form.
 */

import type { Metadata } from 'next'
import { getExpenses } from '@/actions/finance-expenses'
import { ExpensesView } from './expenses-view'

export const metadata: Metadata = {
  title: 'Expenses | Finance',
  description: 'Track and manage business expenses',
}

export default async function ExpensesPage(): Promise<React.ReactNode> {
  const result = await getExpenses().catch(() => ({
    data: null,
    error: 'Failed to load expenses',
  }))

  return <ExpensesView initialData={result.data ?? []} />
}
