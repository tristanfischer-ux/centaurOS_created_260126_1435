import { Skeleton } from '@/components/ui/skeleton'

/**
 * Dashboard loading skeleton matching the two-column layout.
 */
export default function DashboardLoading() {
  return (
    <div>
      {/* Hero skeleton */}
      <div className="bg-gradient-to-r from-international-orange/10 via-orange-100/50 to-amber-50/30 border-b border-orange-200/50 px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6">
        {/* Greeting */}
        <div className="space-y-2">
          <Skeleton className="h-12 w-80" />
          <Skeleton className="h-5 w-96" />
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>

        {/* View tabs */}
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24 rounded-lg" />
          <Skeleton className="h-10 w-24 rounded-lg" />
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
      </div>

      {/* Two-column grid */}
      <div className="px-4 sm:px-6 lg:px-8 pb-8 mt-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column */}
          <div className="space-y-6">
            {/* Priority Queue */}
            <div className="bg-card rounded-2xl border overflow-hidden">
              <div className="p-6 border-b">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-9 w-9 rounded-lg" />
                  <div className="space-y-1">
                    <Skeleton className="h-5 w-36" />
                    <Skeleton className="h-4 w-52" />
                  </div>
                </div>
              </div>
              <div className="divide-y divide-muted">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="p-4 flex items-start gap-3">
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* Objectives */}
            <div className="bg-card rounded-2xl border overflow-hidden">
              <div className="p-6 border-b">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-9 w-9 rounded-lg" />
                  <div className="space-y-1">
                    <Skeleton className="h-5 w-36" />
                    <Skeleton className="h-4 w-44" />
                  </div>
                </div>
              </div>
              <div className="p-6 space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="rounded-xl border p-4 space-y-3">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-2 w-full rounded-full" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                ))}
              </div>
            </div>

            {/* Team Pulse */}
            <div className="bg-card rounded-2xl border overflow-hidden">
              <div className="p-6 border-b">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-9 w-9 rounded-lg" />
                  <div className="space-y-1">
                    <Skeleton className="h-5 w-28" />
                    <Skeleton className="h-4 w-36" />
                  </div>
                </div>
              </div>
              <div className="divide-y divide-muted">
                {[1, 2, 3].map(i => (
                  <div key={i} className="p-4 flex items-start gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
