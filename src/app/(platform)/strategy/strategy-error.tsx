'use client'

/**
 * @file strategy-error.tsx
 *
 * @description Error state component for the Strategy page.
 * Shows when data fetching fails, with a clear message and retry action.
 */

import { useRouter } from 'next/navigation'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { typography } from '@/lib/design-system'

interface StrategyErrorProps {
  /** User-facing error message */
  message: string
  /** Optional technical detail (shown smaller) */
  detail?: string
}

/**
 * StrategyError - Error state for the Strategy page.
 *
 * @description Shows a friendly error message with a retry button
 * when strategy data fails to load.
 */
export function StrategyError({ message, detail }: StrategyErrorProps) {
  const router = useRouter()

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="min-w-0 flex-1">
        <div className={typography.pageHeader}>
          <div className={typography.pageHeaderAccent} />
          <h1 className={typography.h1}>Strategy</h1>
        </div>
      </div>

      {/* Error State */}
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <div className="rounded-full bg-status-warning-light p-4">
          <AlertTriangle className="h-8 w-8 text-status-warning" />
        </div>
        <div className="text-center space-y-2 max-w-md">
          <h2 className="text-lg font-semibold text-foreground">{message}</h2>
          {detail && (
            <p className="text-sm text-muted-foreground font-mono">{detail}</p>
          )}
        </div>
        <Button
          onClick={() => router.refresh()}
          variant="outline"
          className="mt-4"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
      </div>
    </div>
  )
}
