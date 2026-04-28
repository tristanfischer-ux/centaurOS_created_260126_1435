/**
 * Money V2 layout — flag guard for all /money/* routes.
 *
 * Any user whose `new_money_experience` flag is off sees a 404 when they hit
 * a /money/* route. Legacy Cash Burn routes (/cash-burn/*) remain mounted in
 * parallel and continue to serve until Chunk 7 cutover.
 */

import { notFound } from 'next/navigation'
import { getCurrentUserFeatureFlag } from '@/lib/features/flags'
import { FLAG_NEW_MONEY_EXPERIENCE } from '@/lib/features/keys'

// Data is strictly per-user / per-foundry.
export const dynamic = 'force-dynamic'

export default async function MoneyLayout({ children }: { children: React.ReactNode }) {
  const enabled = await getCurrentUserFeatureFlag(FLAG_NEW_MONEY_EXPERIENCE)
  if (!enabled) notFound()
  return <>{children}</>
}
