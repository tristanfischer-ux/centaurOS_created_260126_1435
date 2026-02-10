'use client'

import Link from 'next/link'
import { Activity, CheckCircle2, Target, Plus } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { UserAvatar } from '@/components/ui/user-avatar'

interface ActivityItemData {
  type: string
  timestamp: string
  task_id?: string
  task_title?: string
  task_number?: number
  objective_id?: string
  objective_title?: string
  user: { id?: string; full_name: string | null; avatar_url?: string | null } | null
}

interface ActivityFeedProps {
  activities: ActivityItemData[]
  expanded?: boolean
}

/**
 * Recent Activity Feed - What's happening in your foundry.
 *
 * @description Lightweight feed showing task/objective events. Uses UserAvatar
 * for consistent avatar rendering. Links route to correct /new-tasks?taskId= format.
 */
export function ActivityFeed({ activities, expanded = false }: ActivityFeedProps) {
  const displayActivities = expanded ? activities : activities.slice(0, 8)

  return (
    <div className="bg-card rounded-2xl shadow-sm border overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b bg-gradient-to-r from-chart-5/10 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-chart-5/10 rounded-lg">
              <Activity className="w-5 h-5 text-chart-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Recent Activity</h2>
              <p className="text-sm text-muted-foreground">What's happening in your foundry</p>
            </div>
          </div>
        </div>
      </div>

      {/* Activity List */}
      <div className="divide-y divide-muted max-h-[500px] overflow-y-auto">
        {displayActivities.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
              <Activity className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No recent activity</p>
          </div>
        ) : (
          displayActivities.map((activity, index) => (
            <ActivityRow
              key={`${activity.type}-${activity.timestamp}-${index}`}
              activity={activity}
            />
          ))
        )}
      </div>
    </div>
  )
}

function ActivityRow({ activity }: { activity: ActivityItemData }): React.ReactElement {
  const icon = getActivityIcon(activity.type)
  const color = getActivityColor(activity.type)
  const message = getActivityMessage(activity)
  const link = getActivityLink(activity)

  return (
    <div className="p-4 hover:bg-muted/30 transition-colors group">
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={cn(
            'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center',
            color.bg
          )}
        >
          {icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            {/* User Avatar */}
            {activity.user && (
              <UserAvatar
                name={activity.user.full_name || 'Unknown'}
                avatarUrl={activity.user.avatar_url || undefined}
                size="xs"
              />
            )}

            <div className="flex-1 min-w-0">
              {link ? (
                <Link
                  href={link}
                  className="text-sm text-foreground hover:text-international-orange transition-colors"
                >
                  {message}
                </Link>
              ) : (
                <p className="text-sm text-foreground">{message}</p>
              )}

              <p className="text-xs text-muted-foreground mt-0.5">
                {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function getActivityIcon(type: string): React.ReactElement {
  const iconClass = 'w-4 h-4'

  switch (type) {
    case 'task_completed':
      return <CheckCircle2 className={cn(iconClass, 'text-status-success')} />
    case 'task_created':
      return <Plus className={cn(iconClass, 'text-status-info')} />
    case 'objective_created':
      return <Target className={cn(iconClass, 'text-chart-5')} />
    default:
      return <Activity className={cn(iconClass, 'text-muted-foreground')} />
  }
}

function getActivityColor(type: string): { bg: string } {
  switch (type) {
    case 'task_completed':
      return { bg: 'bg-status-success-light' }
    case 'task_created':
      return { bg: 'bg-status-info-light' }
    case 'objective_created':
      return { bg: 'bg-chart-5/10' }
    default:
      return { bg: 'bg-muted' }
  }
}

function getActivityMessage(activity: ActivityItemData): React.ReactNode {
  const userName = activity.user?.full_name || 'Someone'

  switch (activity.type) {
    case 'task_completed':
      return (
        <span>
          <strong>{userName}</strong> completed task{' '}
          {activity.task_number && (
            <span className="font-mono text-xs">#{activity.task_number}</span>
          )}
        </span>
      )
    case 'task_created':
      return (
        <span>
          <strong>{userName}</strong> created a new task{' '}
          {activity.task_number && (
            <span className="font-mono text-xs">#{activity.task_number}</span>
          )}
        </span>
      )
    case 'objective_created':
      return (
        <span>
          <strong>{userName}</strong> created objective{' '}
          <em className="text-international-orange">
            &ldquo;{activity.objective_title}&rdquo;
          </em>
        </span>
      )
    default:
      return `${userName} performed an action`
  }
}

function getActivityLink(activity: ActivityItemData): string | null {
  if (activity.task_id) return `/new-tasks?taskId=${activity.task_id}`
  if (activity.objective_id) return `/objectives/${activity.objective_id}`
  return null
}
