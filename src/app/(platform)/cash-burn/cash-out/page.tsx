/**
 * @file page.tsx — Cash Out page (server component)
 *
 * @description Fetches active cost items and passes to the client view.
 */

import { getCashOutItems, getFoundryHumanProfiles } from '@/actions/cash-burn-out'
import { CashOutView } from './cash-out-view'

export const metadata = {
  title: 'Cash Out | ForgeOS',
  description: 'Manage fixed and variable cost items for cash burn modelling',
}

export default async function CashOutPage() {
  const [itemsResult, profilesResult] = await Promise.all([
    getCashOutItems(),
    getFoundryHumanProfiles(),
  ])

  return (
    <CashOutView
      initialItems={itemsResult.data ?? []}
      hasError={!!itemsResult.error}
      humanProfiles={profilesResult.data ?? []}
    />
  )
}
