/**
 * @file fundraise/page.tsx
 *
 * @description Fundraise Dashboard — server component entry point.
 * Shows pipeline funnel, coverage analysis, and recent activity for
 * the user's shortlisted investors.
 *
 * Revalidates every 60 seconds (ISR).
 */

import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { getFundraiseDashboardStats } from '@/actions/investors'
import { FundraiseView } from './fundraise-view'

export const revalidate = 60

function FundraiseDashboardLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-48" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
      <Skeleton className="h-48 rounded-xl" />
    </div>
  )
}

export default async function FundraisePage() {
  const stats = await getFundraiseDashboardStats().catch(() => null)

  return (
    <Suspense fallback={<FundraiseDashboardLoading />}>
      <FundraiseView initialStats={stats} />
    </Suspense>
  )
}
