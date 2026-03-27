/**
 * @file insight-card-skeleton.tsx
 *
 * @description Loading skeleton that matches the SpecialistInsightCard layout.
 * Shows a subtle shimmer while the AI specialist insight is being generated.
 * Used by pages that call usePageInsights with isLoading state.
 */

import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

interface InsightCardSkeletonProps {
  className?: string
}

export function InsightCardSkeleton({ className }: InsightCardSkeletonProps) {
  return (
    <Card className={`border-l-4 border-l-muted p-4 bg-muted/10 ${className ?? ''}`}>
      <div className="flex items-start gap-3">
        <Skeleton className="h-6 w-6 rounded-full flex-shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3.5 w-14" />
          </div>
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-3/4" />
        </div>
      </div>
    </Card>
  )
}
