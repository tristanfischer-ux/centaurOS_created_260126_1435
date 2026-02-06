'use client'

/**
 * UpdatesFeedItem Component
 *
 * @description A single row in the Updates activity feed. Shows the
 * task or objective name, latest note preview, author avatar,
 * relative timestamp, and an unread indicator.
 *
 * @component
 *
 * @example
 * <UpdatesFeedItem
 *   item={activityItem}
 *   isSelected={selectedId === activityItem.id}
 *   onClick={() => handleSelect(activityItem)}
 * />
 */

import { cn } from '@/lib/utils'
import { UserAvatar } from '@/components/ui/user-avatar'
import { Badge } from '@/components/ui/badge'
import {
  MessageSquare,
  Target,
  GitCommit,
  ChevronRight
} from 'lucide-react'
import { formatDistanceToNowStrict } from 'date-fns'
import type { ActivityItem } from '@/types/activity'

interface UpdatesFeedItemProps {
  /** The activity item to render */
  item: ActivityItem
  /** Whether this item is currently selected */
  isSelected: boolean
  /** Number of unread notes in this thread (if grouped) */
  unreadCount?: number
  /** Click handler */
  onClick: () => void
}

/**
 * Returns an icon and color based on the activity item type.
 */
function getItemIcon(item: ActivityItem): { icon: React.ElementType; colorClass: string } {
  if (item.type === 'task_history') {
    return { icon: GitCommit, colorClass: 'text-muted-foreground' }
  }
  if (item.source.type === 'objective') {
    return { icon: Target, colorClass: 'text-international-orange' }
  }
  return { icon: MessageSquare, colorClass: 'text-electric-blue' }
}

/**
 * Formats the relative time in a compact way.
 */
function formatTime(dateStr: string): string {
  try {
    return formatDistanceToNowStrict(new Date(dateStr), { addSuffix: false })
      .replace(' seconds', 's')
      .replace(' second', 's')
      .replace(' minutes', 'm')
      .replace(' minute', 'm')
      .replace(' hours', 'h')
      .replace(' hour', 'h')
      .replace(' days', 'd')
      .replace(' day', 'd')
      .replace(' weeks', 'w')
      .replace(' week', 'w')
      .replace(' months', 'mo')
      .replace(' month', 'mo')
  } catch {
    return ''
  }
}

/**
 * Single feed item representing a task or objective with recent activity.
 */
export function UpdatesFeedItem({
  item,
  isSelected,
  unreadCount,
  onClick
}: UpdatesFeedItemProps) {
  const { icon: TypeIcon, colorClass } = getItemIcon(item)
  const isUnread = item.is_unread
  const timeAgo = formatTime(item.created_at)

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-4 transition-colors border-b border-muted',
        'hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isSelected && 'bg-muted/70 border-l-2 border-l-international-orange',
        !isSelected && isUnread && 'bg-international-orange/5'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Unread dot */}
        <div className="flex-shrink-0 w-2 pt-2">
          {isUnread && (
            <div className="h-2 w-2 rounded-full bg-international-orange" />
          )}
        </div>

        {/* Type icon */}
        <div className="flex-shrink-0 pt-0.5">
          <TypeIcon className={cn('h-4 w-4', colorClass)} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-1">
          {/* Source name + time */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className={cn(
                'text-sm truncate',
                isUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground'
              )}>
                {item.source.title}
              </span>
              {item.source.task_number && (
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  #{item.source.task_number}
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {timeAgo}
            </span>
          </div>

          {/* Note preview */}
          <p className={cn(
            'text-xs line-clamp-2',
            isUnread ? 'text-foreground' : 'text-muted-foreground'
          )}>
            {item.type === 'task_history' ? (
              <span className="italic">{item.author.full_name || 'Someone'} {item.content}</span>
            ) : (
              item.content
            )}
          </p>

          {/* Author + metadata */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <UserAvatar
                name={item.author.full_name || '?'}
                role={item.author.role}
                avatarUrl={item.author.avatar_url}
                size="xs"
              />
              <span className="text-xs text-muted-foreground truncate">
                {item.author.full_name || 'Unknown'}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {unreadCount && unreadCount > 1 && (
                <Badge className="bg-international-orange text-white text-[10px] px-1.5 py-0">
                  {unreadCount} new
                </Badge>
              )}
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </div>
        </div>
      </div>
    </button>
  )
}
