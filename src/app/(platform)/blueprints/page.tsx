import { Suspense } from 'react'
import { BlueprintsView } from './blueprints-view'
import { getBlueprints, getBlueprintTemplates } from '@/actions/blueprints'
import { Skeleton } from '@/components/ui/skeleton'

export const metadata = {
  title: 'Blueprints | CentaurOS',
  description: 'Map your knowledge domains, expertise, and supply chain',
}

async function BlueprintsData() {
  const [blueprintsResult, templatesResult] = await Promise.all([
    getBlueprints(),
    getBlueprintTemplates(),
  ])

  return (
    <BlueprintsView
      blueprints={blueprintsResult.data || []}
      templates={templatesResult.data || []}
    />
  )
}

function BlueprintsSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>

      {/* Cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-64 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

export default function BlueprintsPage() {
  return (
    <Suspense fallback={<BlueprintsSkeleton />}>
      <BlueprintsData />
    </Suspense>
  )
}
