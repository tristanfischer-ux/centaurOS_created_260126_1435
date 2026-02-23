/**
 * @file page.tsx — Funding pipeline page
 *
 * @description Kanban-style pipeline for tracking funding opportunities
 * across stages from research to won/lost.
 */

import type { Metadata } from 'next'
import { getFundingOpportunities } from '@/actions/finance-funding'
import { FundingView } from './funding-view'

export const metadata: Metadata = {
  title: 'Funding | Finance | ForgeOS',
  description: 'Track funding opportunities and grant applications',
}

export default async function FundingPage(): Promise<React.ReactNode> {
  const result = await getFundingOpportunities().catch(() => ({
    data: null,
    error: 'Failed to load funding',
  }))

  return <FundingView initialData={result.data ?? []} />
}
