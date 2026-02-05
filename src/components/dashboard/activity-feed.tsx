'use client'

import Link from 'next/link'
import { Activity, CheckCircle2, Target, Plus, ChevronRight } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

interface ActivityItem {
  type: string
  timestamp: string
  task_id?: string
  task_title?: string
  task_number?: number
  objective_id?: string
  objective_title?: string
  user: { full_name: string | null; avatar_url?: string | null } | null
}

interface ActivityFeedProps {
  activities: ActivityItem[]
  expanded?: boolean
}

/**
 * Real-time Activity Feed - What's happening in your foundry
 */
export function ActivityFeed({ activities, expanded = false }: ActivityFeedProps) {
  const displayActivities = expanded ? activities : activities.slice(0, 8)
  
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-purple-50/50 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Activity className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Recent Activity</h2>
              <p className="text-sm text-muted-foreground">What's happening in your foundry</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Activity List */}
      <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
        {displayActivities.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <Activity className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-sm text-muted-foreground">
              No recent activity
            </p>
          </div>
        ) : (
          displayActivities.map((activity, index) => (
            <ActivityItem key={`${activity.type}-${activity.timestamp}-${index}`} activity={activity} />
          ))
        )}
      </div>
    </div>
  )
}

function ActivityItem({ activity }: { activity: ActivityItem }) {
  const icon = getActivityIcon(activity.type)
  const color = getActivityColor(activity.type)
  const message = getActivityMessage(activity)
  const link = getActivityLink(activity)
  
  return (
    <div className="p-4 hover:bg-slate-50 transition-colors group">
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={cn(
          "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center",
          color.bg
        )}>
          {icon}
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            {/* User Avatar */}
            {activity.user && (
              <Avatar className="w-6 h-6 flex-shrink-0">
                <AvatarImage src={activity.user.avatar_url || undefined} />
                <AvatarFallback className="text-xs">
                  {activity.user.full_name?.[0]?.toUpperCase() || '?'}
                </AvatarFallback>
              </Avatar>
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

function getActivityIcon(type: string) {
  const iconClass = "w-4 h-4"
  
  switch (type) {
    case 'task_completed':
      return <CheckCircle2 className={cn(iconClass, "text-green-600")} />
    case 'task_created':
      return <Plus className={cn(iconClass, "text-blue-600")} />
    case 'objective_created':
      return <Target className={cn(iconClass, "text-purple-600")} />
    default:
      return <Activity className={cn(iconClass, "text-slate-600")} />
  }
}

function getActivityColor(type: string) {
  switch (type) {
    case 'task_completed':
      return { bg: 'bg-green-100', text: 'text-green-700' }
    case 'task_created':
      return { bg: 'bg-blue-100', text: 'text-blue-700' }
    case 'objective_created':
      return { bg: 'bg-purple-100', text: 'text-purple-700' }
    default:
      return { bg: 'bg-slate-100', text: 'text-slate-700' }
  }
}

function getActivityMessage(activity: ActivityItem) {
  const userName = activity.user?.full_name || 'Someone'
  
  switch (activity.type) {
    case 'task_completed':
      return (
        <span>
          <strong>{userName}</strong> completed task{' '}
          {activity.task_number && <span className="font-mono text-xs">#{activity.task_number}</span>}
        </span>
      )
    case 'task_created':
      return (
        <span>
          <strong>{userName}</strong> created a new task{' '}
          {activity.task_number && <span className="font-mono text-xs">#{activity.task_number}</span>}
        </span>
      )
    case 'objective_created':
      return (
        <span>
          <strong>{userName}</strong> created objective{' '}
          <em className="text-international-orange">"{activity.objective_title}"</em>
        </span>
      )
    default:
      return `${userName} performed an action`
  }
}

function getActivityLink(activity: ActivityItem) {
  if (activity.task_id) return `/tasks/${activity.task_id}`
  if (activity.objective_id) return `/objectives/${activity.objective_id}`
  return null
}
