import { Skeleton } from '@/components/ui/skeleton'

export default function PitchPrepLoading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      {/* Alert skeleton */}
      <Skeleton className="h-16 w-full" />

      {/* Cards skeleton */}
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    </div>
  )
}
