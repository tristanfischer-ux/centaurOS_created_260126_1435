/**
 * @file page.tsx — Cash Out page (server component)
 *
 * @description Fetches active cost items and passes to the client view.
 */

import { getCashOutItems, getFoundryHumanProfiles, getCompanyContextForWizard } from '@/actions/cash-burn-out'
import { CashOutView } from './cash-out-view'

export const metadata = {
  title: 'Cash Out',
  description: 'Manage fixed and variable cost items for cash burn modelling',
}

export default async function CashOutPage() {
  const [itemsResult, profilesResult, contextResult] = await Promise.all([
    getCashOutItems(),
    getFoundryHumanProfiles(),
    getCompanyContextForWizard(),
  ])

  return (
    <CashOutView
      initialItems={itemsResult.data ?? []}
      hasError={!!itemsResult.error}
      humanProfiles={profilesResult.data ?? []}
      companyContext={contextResult.data ?? null}
    />
  )
}
