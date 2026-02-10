import { Suspense } from 'react'
import { ProductXRayView } from './product-xray-view'
import { Skeleton } from '@/components/ui/skeleton'

export const metadata = {
  title: 'Product X-Ray | ForgeOS',
  description:
    'Deep product analysis connecting strategy, objectives, tasks, team, agents, inspiration, and marketplace.',
}

export default function ProductXRayPage() {
  return (
    <Suspense fallback={<ProductXRaySkeleton />}>
      <ProductXRayView />
    </Suspense>
  )
}

/**
 * Loading skeleton for the Product X-Ray page.
 */
function ProductXRaySkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3 pb-4 border-b border-muted">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-5 w-[28rem]" />
      </div>

      {/* Section cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
    </div>
  )
}
