'use client'

import Link from 'next/link'
import { Users, Circle, ChevronRight } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { UserAvatar } from '@/components/ui/user-avatar'

interface TeamMember {
  id: string
  full_name: string | null
  avatar_url: string | null
  role: string | null
  status: 'online' | 'away' | 'focus' | 'offline'
  last_seen: string | null
  current_task: { id: string; title: string; task_number?: number } | null
}

interface TeamPulseProps {
  teamMembers: TeamMember[]
  expanded?: boolean
}

/**
 * Team Pulse - Live presence and what everyone is working on.
 *
 * @description Shows team members with their online status and current task.
 * Uses UserAvatar for consistent role-based avatar coloring.
 */
export function TeamPulse({ teamMembers, expanded = false }: TeamPulseProps) {
  const onlineMembers = teamMembers.filter(m => m.status === 'online' || m.status === 'focus')
  const displayMembers = expanded ? teamMembers : teamMembers.slice(0, 6)

  return (
    <div className="bg-card rounded-2xl shadow-sm border overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b bg-gradient-to-r from-status-success-light/50 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-status-success-light rounded-lg">
              <Users className="w-5 h-5 text-status-success" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Team Pulse</h2>
              <p className="text-sm text-muted-foreground">
                {onlineMembers.length} of {teamMembers.length} online
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Team Members */}
      <div className="divide-y divide-muted">
        {displayMembers.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              No team members yet
            </p>
          </div>
        ) : (
          displayMembers.map((member) => (
            <div
              key={member.id}
              className="p-4 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-start gap-3">
                {/* Avatar with status indicator */}
                <div className="relative flex-shrink-0">
                  <UserAvatar
                    name={member.full_name || 'Unknown'}
                    role={member.role || 'Member'}
                    avatarUrl={member.avatar_url || undefined}
                    size="md"
                  />
                  <StatusIndicator status={member.status} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {member.full_name || 'Unknown'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {member.role || 'Member'}
                      </p>
                    </div>
                    <StatusBadge status={member.status} />
                  </div>

                  {/* Current Activity */}
                  {member.current_task ? (
                    <Link
                      href={`/new-tasks?taskId=${member.current_task.id}`}
                      className="mt-2 flex items-start gap-2 p-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors group"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground mb-0.5">Working on</p>
                        <p className="text-xs font-medium text-foreground group-hover:text-international-orange transition-colors line-clamp-2">
                          {member.current_task.title}
                        </p>
                        {member.current_task.task_number && (
                          <p className="text-xs text-muted-foreground font-mono mt-0.5">
                            #{member.current_task.task_number}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="w-3 h-3 text-muted-foreground group-hover:text-international-orange transition-colors flex-shrink-0 mt-0.5" />
                    </Link>
                  ) : member.status === 'offline' && member.last_seen ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Last seen {formatDistanceToNow(new Date(member.last_seen), { addSuffix: true })}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {!expanded && teamMembers.length > 6 && (
        <div className="p-4 bg-muted/50 border-t">
          <Link
            href="/team"
            className="text-sm text-international-orange hover:text-international-orange-hover font-medium flex items-center gap-1 group w-fit"
          >
            View all team members
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      )}
    </div>
  )
}

function StatusIndicator({ status }: { status: string }): React.ReactElement {
  const colors: Record<string, string> = {
    online: 'bg-status-success',
    focus: 'bg-status-warning',
    away: 'bg-status-warning',
    offline: 'bg-muted-foreground/40',
  }

  return (
    <div
      className={cn(
        'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card',
        colors[status] || colors.offline,
        (status === 'online' || status === 'focus') && 'animate-pulse'
      )}
    />
  )
}

function StatusBadge({ status }: { status: string }): React.ReactElement {
  const styles: Record<string, string> = {
    online: 'bg-status-success-light text-status-success-dark',
    focus: 'bg-status-warning-light text-status-warning-dark',
    away: 'bg-status-warning-light text-status-warning-dark',
    offline: 'bg-muted text-muted-foreground',
  }

  const labels: Record<string, string> = {
    online: 'Online',
    focus: 'Focus',
    away: 'Away',
    offline: 'Offline',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
        styles[status] || styles.offline
      )}
    >
      <Circle className="w-2 h-2 fill-current" />
      {labels[status] || 'Unknown'}
    </span>
  )
}
