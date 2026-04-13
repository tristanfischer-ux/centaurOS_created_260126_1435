/**
 * @file page.tsx — Cash Flow Forecasting page
 *
 * @description Server component that fetches recurring revenue and cost data,
 * then passes it to the client view for interactive scenario modeling.
 */

import type { Metadata } from 'next'
import { getCashFlowData } from '@/actions/finance-forecast'
import { CashFlowView } from './cash-flow-view'

export const metadata: Metadata = {
  title: 'Cash Flow | Finance',
  description: 'Forward-looking cash flow projections with scenario modeling',
}

export default async function CashFlowPage(): Promise<React.ReactNode> {
  const result = await getCashFlowData(12).catch(() => ({
    data: null,
    error: 'Failed to load cash flow data',
  }))

  return (
    <CashFlowView
      initialData={result.data}
      hasError={!result.data}
    />
  )
}
