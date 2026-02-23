'use client'

/**
 * @file ReportHistory.tsx
 *
 * @description Displays a list of previously generated reports that the user
 * can click to reload. Fetches from the report_snapshots table via the
 * getReportHistory server action.
 *
 * @related
 * - src/actions/report-history.ts — Data source
 * - src/app/(platform)/reports/page.tsx — Parent page
 */

import { useEffect, useState, useCallback } from 'react'
import { FileText, Clock, AlertCircle } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { typography } from '@/lib/design-system'
import { getReportHistory } from '@/actions/report-history'

import type { ReportHistoryItem } from '@/actions/report-history'
import type { ReportDocument } from '@/lib/reports/report-document-types'

interface ReportHistoryProps {
  onLoadReport: (document: ReportDocument) => void
}

const REPORT_TYPE_LABELS: Record<string, string> = {
  'weekly-update': 'Weekly Update',
  weekly: 'Weekly',
  'board-pack': 'Board Pack',
  monthly: 'Monthly',
  daily: 'Daily',
  custom: 'Custom',
}

function getReportTypeLabel(type: string): string {
  return REPORT_TYPE_LABELS[type] ?? type
}

function getRelativeTime(dateString: string): string {
  const now = Date.now()
  const then = new Date(dateString).getTime()
  const diffMs = now - then

  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`

  return new Date(dateString).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })
}

export function ReportHistory({ onLoadReport }: ReportHistoryProps) {
  const [reports, setReports] = useState<ReportHistoryItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchHistory = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const result = await getReportHistory()
    if (result.success && result.reports) {
      setReports(result.reports)
    } else {
      setError(result.error ?? 'Failed to load report history')
    }

    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  return (
    <div className="space-y-4">
      {/* Section header with orange accent */}
      <div className={typography.pageHeader}>
        <div className={typography.pageHeaderAccent} />
        <h2 className={typography.h3}>Recent Reports</h2>
      </div>

      {isLoading && <LoadingSkeleton />}

      {!isLoading && error && (
        <Card>
          <CardContent className="flex items-center gap-3 py-8 text-center">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && reports.length === 0 && <EmptyState />}

      {!isLoading && !error && reports.length > 0 && (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {reports.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              onClick={() => onLoadReport(report.reportData)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ReportCard({
  report,
  onClick,
}: {
  report: ReportHistoryItem
  onClick: () => void
}) {
  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md w-[280px] shrink-0"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{getReportTypeLabel(report.reportType)}</Badge>
          <span className="text-xs text-muted-foreground">
            {new Date(report.reportDate).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        </div>

        {report.summaryText && (
          <p className="mt-2 line-clamp-2 text-sm text-foreground">
            {report.summaryText}
          </p>
        )}

        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>Generated {getRelativeTime(report.generatedAt)}</span>
        </div>
      </CardContent>
    </Card>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-28" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <FileText className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            No reports generated yet
          </p>
          <p className="text-xs text-muted-foreground">
            Create your first report above to see it here.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
