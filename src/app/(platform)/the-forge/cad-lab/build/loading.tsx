import { Skeleton } from '@/components/ui/skeleton'

export default function BuildLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-5 w-64" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-xl border p-4 space-y-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-[300px] w-full rounded-lg" />
        </div>
        <div className="bg-card rounded-xl border p-4 space-y-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-[300px] w-full rounded-lg" />
        </div>
      </div>
    </div>
  )
}
