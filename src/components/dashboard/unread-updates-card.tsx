'use client'

import Link from 'next/link'
import { Bell, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface UnreadUpdatesCardProps {
  /** Total unread count across task comments, objective comments, and messages */
  unreadCount: number
}

/**
 * Compact card linking to the Updates page with unread count.
 *
 * @description Replaces the full ActivityFeed on the dashboard.
 * The Updates page is the canonical place for activity — the dashboard
 * just nudges users there when there are unread items.
 */
export function UnreadUpdatesCard({ unreadCount }: UnreadUpdatesCardProps) {
  const hasUnread = unreadCount > 0

  return (
    <Link
      href="/updates"
      className={cn(
        'group flex items-center gap-4 rounded-xl border p-5 transition-all duration-200',
        hasUnread
          ? 'border-international-orange/20 bg-international-orange/5 hover:bg-international-orange/10'
          : 'bg-card hover:bg-muted/50'
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          'flex-shrink-0 flex items-center justify-center rounded-xl h-11 w-11',
          hasUnread
            ? 'bg-international-orange/10'
            : 'bg-muted'
        )}
      >
        <Bell
          className={cn(
            'h-5 w-5',
            hasUnread ? 'text-international-orange' : 'text-muted-foreground'
          )}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">
          {hasUnread
            ? `${unreadCount} unread update${unreadCount !== 1 ? 's' : ''}`
            : 'All caught up'}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {hasUnread
            ? 'Notes, comments, and changes on your work'
            : 'No new activity since you last checked'}
        </p>
      </div>

      {/* Arrow */}
      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-international-orange transition-colors flex-shrink-0" />
    </Link>
  )
}
