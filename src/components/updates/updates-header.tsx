'use client'

/**
 * UpdatesHeader Component
 *
 * @description Page header for the Updates (New Inbox) page.
 * Displays the standard orange accent bar, page title, subtitle,
 * and a summary metrics row showing unread counts.
 *
 * @component
 */

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { typography } from '@/lib/design-system'
import {
  MessageSquare,
  Target,
  CheckCheck,
  Bell
} from 'lucide-react'

interface UpdatesHeaderProps {
  /** Total number of unread activity items */
  unreadCount: number
  /** Number of tasks with unread notes */
  tasksWithUpdates: number
  /** Number of objectives with unread notes */
  objectivesWithUpdates: number
  /** Callback to mark all items as read */
  onMarkAllRead?: () => void
  /** Whether the mark-all-read operation is in progress */
  isMarkingRead?: boolean
}

/**
 * Header with orange accent bar and summary metrics for the Updates page.
 */
export function UpdatesHeader({
  unreadCount,
  tasksWithUpdates,
  objectivesWithUpdates,
  onMarkAllRead,
  isMarkingRead = false
}: UpdatesHeaderProps) {
  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>Comms</h1>
            {unreadCount > 0 && (
              <Badge
                className="ml-2 bg-international-orange text-white"
                aria-label={`${unreadCount} unread update${unreadCount !== 1 ? 's' : ''}`}
              >
                {unreadCount} unread
              </Badge>
            )}
          </div>
          <p className={typography.pageSubtitle}>
            Activity feed, conversations, and direct messages — all in one place
          </p>
        </div>

        {/* Mark all read action */}
        {unreadCount > 0 && onMarkAllRead && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onMarkAllRead}
            disabled={isMarkingRead}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <CheckCheck className="h-4 w-4" />
            {isMarkingRead ? 'Marking...' : 'Mark all read'}
          </Button>
        )}
      </div>

      {/* Summary metrics row */}
      {(unreadCount > 0 || tasksWithUpdates > 0 || objectivesWithUpdates > 0) && (
        <div className="flex items-center gap-4 pl-4 text-sm">
          {tasksWithUpdates > 0 && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <MessageSquare className="h-3.5 w-3.5" />
              <span>
                {tasksWithUpdates} task{tasksWithUpdates !== 1 ? 's' : ''} with new notes
              </span>
            </div>
          )}
          {objectivesWithUpdates > 0 && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Target className="h-3.5 w-3.5" />
              <span>
                {objectivesWithUpdates} objective{objectivesWithUpdates !== 1 ? 's' : ''} updated
              </span>
            </div>
          )}
          {unreadCount === 0 && (
            <div className="flex items-center gap-1.5 text-status-success">
              <Bell className="h-3.5 w-3.5" />
              <span>All caught up</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
