'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Download, ScrollText } from 'lucide-react'
import { toast } from 'sonner'
import { exportMoneyAuditLogCsv, type MoneyAuditEntry } from '@/actions/money-audit'

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function summarisePayload(payload: Record<string, unknown> | null): string {
  if (!payload) return ''
  const parts: string[] = []
  for (const [key, value] of Object.entries(payload)) {
    if (value == null) continue
    if (parts.length >= 3) {
      parts.push('…')
      break
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      parts.push(`${key}: ${value}`)
    } else {
      parts.push(`${key}: …`)
    }
  }
  return parts.join(' · ')
}

export function AuditLogView({
  rows,
  nextCursor,
  hasPrevious,
}: {
  rows: MoneyAuditEntry[]
  nextCursor: string | null
  hasPrevious: boolean
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Showing up to 50 events. Cursor-paginated; older events on the next page.
        </p>
        <ExportCsvButton />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Money events</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState
              icon={<ScrollText className="h-10 w-10" />}
              title="No events yet"
              description="Money-section mutations will appear here as you and your team work."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Timestamp</th>
                    <th className="py-2 pr-4 font-medium">Actor</th>
                    <th className="py-2 pr-4 font-medium">Event</th>
                    <th className="py-2 pr-4 font-medium">Entity</th>
                    <th className="py-2 pr-4 font-medium">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/50 align-top">
                      <td className="py-2 pr-4 tabular-nums whitespace-nowrap text-muted-foreground">
                        {formatTimestamp(row.created_at)}
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">
                            {row.actor_full_name ?? row.actor_email ?? row.actor_specialist ?? 'System'}
                          </span>
                          {row.actor_specialist && (
                            <span className="text-[10px] text-muted-foreground">
                              specialist · {row.actor_specialist}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant="secondary" size="sm">
                          {row.event ?? row.action}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4">
                        <span className="text-foreground">{row.entity_type ?? '—'}</span>
                        {row.entity_id && (
                          <span className="block text-[10px] text-muted-foreground truncate max-w-[12ch]">
                            {row.entity_id}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground max-w-md truncate">
                        {summarisePayload(row.payload)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 mt-4 border-t border-border">
            <div>
              {hasPrevious && (
                <Link href="/money/settings/audit-log">
                  <Button variant="ghost" size="sm">First page</Button>
                </Link>
              )}
            </div>
            <div>
              {nextCursor && (
                <Link href={`/money/settings/audit-log?cursor=${encodeURIComponent(nextCursor)}`}>
                  <Button variant="secondary" size="sm">Older →</Button>
                </Link>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ExportCsvButton() {
  const [isPending, startTransition] = useTransition()
  const [, setDownloaded] = useState(false)

  function handleExport() {
    startTransition(async () => {
      const result = await exportMoneyAuditLogCsv()
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      try {
        const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = result.filename
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
        setDownloaded(true)
        if (result.truncated) {
          toast.warning(`Exported ${result.rows} rows (capped). Older events not included.`)
        } else {
          toast.success(`Exported ${result.rows} rows.`)
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Download failed')
      }
    })
  }

  return (
    <Button onClick={handleExport} disabled={isPending} size="sm">
      <Download className="h-4 w-4 mr-1" />
      {isPending ? 'Preparing…' : 'Export CSV'}
    </Button>
  )
}
