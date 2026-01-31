import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { BlueprintDetailView } from './blueprint-detail-view'
import {
  getBlueprint,
  getBlueprintCoverage,
  getBlueprintSummary,
  getNextAction,
  getBlueprintMilestones,
  getBlueprintSuppliers,
} from '@/actions/blueprints'
import { Skeleton } from '@/components/ui/skeleton'
import { DomainCoverageWithDetails } from '@/types/blueprints'

export const metadata = {
  title: 'Blueprint | CentaurOS',
}

interface BlueprintDetailPageProps {
  params: Promise<{ id: string }>
}

async function BlueprintDetailData({ params }: BlueprintDetailPageProps) {
  const { id } = await params

  const [blueprintResult, coverageResult, summaryResult, nextActionResult, milestonesResult, suppliersResult] = await Promise.all([
    getBlueprint(id),
    getBlueprintCoverage(id),
    getBlueprintSummary(id),
    getNextAction(id),
    getBlueprintMilestones(id),
    getBlueprintSuppliers(id),
  ])

  if (!blueprintResult.data) {
    notFound()
  }

  return (
    <BlueprintDetailView
      blueprint={blueprintResult.data}
      coverage={(coverageResult.data || []) as DomainCoverageWithDetails[]}
      summary={summaryResult.data}
      nextAction={nextActionResult.data}
      milestones={milestonesResult.data || []}
      suppliers={suppliersResult.data || []}
    />
  )
}

function BlueprintDetailSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-64" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>

      {/* Main content */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <Skeleton className="h-[500px] rounded-lg" />
        </div>
        <div>
          <Skeleton className="h-[300px] rounded-lg" />
        </div>
      </div>
    </div>
  )
}

export default function BlueprintDetailPage(props: BlueprintDetailPageProps) {
  return (
    <Suspense fallback={<BlueprintDetailSkeleton />}>
      <BlueprintDetailData {...props} />
    </Suspense>
  )
}
