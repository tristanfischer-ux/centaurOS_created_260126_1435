/**
 * @file page.tsx — Accounting integrations page
 *
 * @description Setup and manage connections to Xero, QuickBooks, FreeAgent.
 */

import type { Metadata } from 'next'
import { getIntegrations } from '@/actions/finance-integrations'
import { IntegrationsView } from './integrations-view'

export const metadata: Metadata = {
  title: 'Integrations | Finance',
  description: 'Connect your accounting software',
}

export default async function IntegrationsPage(): Promise<React.ReactNode> {
  const result = await getIntegrations().catch(() => ({
    data: null,
    error: 'Failed to load integrations',
  }))

  return <IntegrationsView initialData={result.data ?? []} />
}
