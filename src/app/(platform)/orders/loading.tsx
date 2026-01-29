import { OrderCardSkeleton } from "@/components/orders"

export default function OrdersLoading() {
  return (
    <div className="p-6 space-y-6">
      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-32 bg-muted rounded animate-pulse" />
          <div className="h-4 w-48 bg-muted rounded animate-pulse" />
        </div>
        <div className="h-9 w-24 bg-muted rounded animate-pulse" />
      </div>

      {/* Filters skeleton */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="h-10 w-full sm:w-64 bg-muted rounded animate-pulse" />
        <div className="h-10 w-full sm:w-44 bg-muted rounded animate-pulse" />
        <div className="h-10 flex-1 max-w-md bg-muted rounded animate-pulse" />
      </div>

      {/* Results summary skeleton */}
      <div className="h-4 w-40 bg-muted rounded animate-pulse" />

      {/* Cards grid skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <OrderCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
