'use client'

/**
 * @file ReportDownloads.tsx
 *
 * @description Central archive of all exported reports — CAD Lab, general
 * reports, presentations. Shows a table with download/delete actions and
 * runs lazy cleanup of expired rows on mount.
 *
 * @related
 * - src/actions/report-downloads.ts — Server actions
 * - src/app/(platform)/reports/page.tsx — Parent page (Downloads tab)
 */

import { useEffect, useState, useCallback } from 'react'
import { Download, Trash2, FileText, Presentation, File, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import {
  getReportDownloads,
  cleanExpiredReportDownloads,
  deleteReportDownload,
} from '@/actions/report-downloads'
import type { ReportDownloadRow } from '@/actions/report-downloads'

const SOURCE_LABELS: Record<string, string> = {
  'cad-lab': 'CAD Lab',
  reports: 'Reports',
  investors: 'Investors',
  finance: 'Finance',
  agents: 'Agents',
}

const FORMAT_ICONS: Record<string, typeof FileText> = {
  docx: FileText,
  pptx: Presentation,
  pdf: File,
  csv: FileText,
  png: File,
}

function formatFileSize(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ReportDownloads() {
  const [downloads, setDownloads] = useState<ReportDownloadRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadDownloads = useCallback(async () => {
    const result = await getReportDownloads()
    if ('downloads' in result) {
      setDownloads(result.downloads)
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    loadDownloads()
    // Lazy cleanup — fire and forget
    cleanExpiredReportDownloads().catch(() => {})
  }, [loadDownloads])

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id)
    const result = await deleteReportDownload(id)
    if ('error' in result) {
      toast.error(`Delete failed: ${result.error}`)
    } else {
      setDownloads((prev) => prev.filter((d) => d.id !== id))
      toast.success('Download removed')
    }
    setDeletingId(null)
  }, [])

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (downloads.length === 0) {
    return (
      <EmptyState
        icon={<Download className="h-10 w-10" />}
        title="No downloads yet"
        description="Export a report from CAD Lab or the Reports tab — it will appear here for re-download."
      />
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Format</th>
                <th className="px-4 py-3 font-medium">Size</th>
                <th className="px-4 py-3 font-medium">Generated</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {downloads.map((dl) => {
                const FormatIcon = FORMAT_ICONS[dl.fileFormat] ?? File
                return (
                  <tr key={dl.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground max-w-[240px] truncate">
                      {dl.reportName}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary">{SOURCE_LABELS[dl.reportSource] ?? dl.reportSource}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <FormatIcon className="h-3.5 w-3.5" />
                        <span className="uppercase">{dl.fileFormat}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatFileSize(dl.fileSizeBytes)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(dl.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {dl.signedUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                          >
                            <a href={dl.signedUrl} download target="_blank" rel="noopener noreferrer">
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(dl.id)}
                          disabled={deletingId === dl.id}
                        >
                          {deletingId === dl.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
