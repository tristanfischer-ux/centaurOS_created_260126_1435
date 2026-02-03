import { Suspense } from 'react'
import { InspirationView } from './inspiration-view'
import { Skeleton } from '@/components/ui/skeleton'
import { getBlueprintTemplates } from '@/actions/blueprints'
import { getObjectivePacks, getSavedPackIds } from '@/actions/packs'

export const metadata = {
  title: 'Inspiration | CentaurOS',
  description: 'Get ideas on what to do next. Discover opportunities, find experts, and turn insights into action.',
}

async function InspirationData() {
  const [templatesResult, packsResult, savedPacksResult] = await Promise.all([
    getBlueprintTemplates(),
    getObjectivePacks(),
    getSavedPackIds(),
  ])

  // Convert Set to array for serialization
  const initialSavedPackIds = Array.from(savedPacksResult.savedIds || [])

  return (
    <InspirationView 
      templates={templatesResult.data || []}
      packs={packsResult.packs || []}
      initialSavedPackIds={initialSavedPackIds}
    />
  )
}

export default function InspirationPage() {
  return (
    <Suspense fallback={<InspirationSkeleton />}>
      <InspirationData />
    </Suspense>
  )
}

function InspirationSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header skeleton */}
      <div className="space-y-4 pb-4 border-b border-slate-100">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-96" />
      </div>
      
      {/* Category cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-64 w-full" />
        ))}
      </div>
    </div>
  )
}
