import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getAuditLogs } from '@/actions/audit'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { UserAvatar } from '@/components/ui/user-avatar'
import { ScrollText } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import Link from 'next/link'

// ─── Action label + badge variant mapping ────────────────────────────────────

const ACTION_CONFIG: Record<string, { label: string; variant: 'info' | 'destructive' | 'warning' | 'success' | 'secondary' }> = {
  'user.invited': { label: 'User Invited', variant: 'info' },
  'team.deleted': { label: 'Team Deleted', variant: 'destructive' },
  'task.deleted': { label: 'Task Deleted', variant: 'destructive' },
  'objective.deleted': { label: 'Objective Deleted', variant: 'destructive' },
  'listing.claimed': { label: 'Listing Claimed', variant: 'success' },
  'settings.updated': { label: 'Settings Updated', variant: 'secondary' },
}

function getActionConfig(action: string) {
  return ACTION_CONFIG[action] ?? { label: action, variant: 'secondary' as const }
}

// ─── Metadata formatter ──────────────────────────────────────────────────────

function formatMetadata(metadata: Record<string, unknown> | null | undefined): string {
  if (!metadata || typeof metadata !== 'object') return '—'
  const parts: string[] = []
  for (const [key, value] of Object.entries(metadata)) {
    if (value == null) continue
    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())
    if (Array.isArray(value)) {
      parts.push(`${label}: ${value.length > 3 ? `${value.slice(0, 3).join(', ')}… (${value.length})` : value.join(', ')}`)
    } else {
      parts.push(`${label}: ${value}`)
    }
  }
  return parts.join(' · ') || '—'
}

// ─── Page ────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ action?: string; page?: string }>
}

export default async function AuditLogPage({ searchParams }: PageProps) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // AUTH: Founder-only access check
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'Founder') {
    return (
      <div className="max-w-5xl">
        <EmptyState
          icon={<ScrollText className="h-10 w-10" />}
          title="Access Denied"
          description="Only Founders can view the audit log."
        />
      </div>
    )
  }

  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1)
  const limit = 50
  const offset = (page - 1) * limit

  // SECURITY: Only allow known action values — reject arbitrary strings
  const allActions = Object.keys(ACTION_CONFIG)
  const actionFilter = params.action && allActions.includes(params.action) ? params.action : undefined

  const { data: logs, count } = await getAuditLogs({
    action: actionFilter,
    limit,
    offset,
  })

  const totalPages = Math.ceil(count / limit)

  return (
    <div className="max-w-5xl space-y-6">
      {/* Action filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/settings/audit-log">
          <Badge variant={!params.action ? 'default' : 'outline'} size="sm" className="cursor-pointer">
            All
          </Badge>
        </Link>
        {allActions.map(action => {
          const config = getActionConfig(action)
          const isActive = params.action === action
          return (
            <Link key={action} href={`/settings/audit-log?action=${action}`}>
              <Badge
                variant={isActive ? config.variant : 'outline'}
                size="sm"
                className="cursor-pointer"
              >
                {config.label}
              </Badge>
            </Link>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-display">Audit Log</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <EmptyState
              icon={<ScrollText className="h-10 w-10" />}
              title="No audit events"
              description={params.action ? 'No events match this filter.' : 'Activity will appear here as your team takes actions.'}
            />
          ) : (
            <div className="divide-y divide-border">
              {logs.map(log => {
                const config = getActionConfig(log.action)
                const createdAt = new Date(log.created_at)
                const profile = log.profiles

                return (
                  <div key={log.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    {/* User avatar */}
                    <UserAvatar
                      name={profile?.full_name ?? 'Unknown'}
                      role={(profile?.role as 'Founder' | 'Executive' | 'Apprentice') ?? 'Apprentice'}
                      size="sm"
                    />

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">
                          {profile?.full_name ?? 'Unknown user'}
                        </span>
                        <Badge variant={config.variant} size="sm">
                          {config.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {formatMetadata(log.metadata)}
                      </p>
                    </div>

                    {/* Timestamp */}
                    <time
                      dateTime={log.created_at}
                      title={format(createdAt, 'PPpp')}
                      className="text-xs text-muted-foreground whitespace-nowrap shrink-0"
                    >
                      {formatDistanceToNow(createdAt, { addSuffix: true })}
                    </time>
                  </div>
                )
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 mt-4 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Page {page} of {totalPages} ({count} events)
              </p>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={`/settings/audit-log?${new URLSearchParams({
                      ...(params.action ? { action: params.action } : {}),
                      page: String(page - 1),
                    })}`}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Previous
                  </Link>
                )}
                {page < totalPages && (
                  <Link
                    href={`/settings/audit-log?${new URLSearchParams({
                      ...(params.action ? { action: params.action } : {}),
                      page: String(page + 1),
                    })}`}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Next
                  </Link>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
