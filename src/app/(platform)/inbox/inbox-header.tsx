'use client'

import { Badge } from '@/components/ui/badge'
import { typography } from '@/lib/design-system'

interface InboxHeaderProps {
  totalUnread: number
}

/**
 * Page header for the Inbox page
 * 
 * Displays the standard orange accent bar, title, subtitle,
 * and unread message count badge.
 */
export function InboxHeader({ totalUnread }: InboxHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className={typography.pageHeader}>
          <div className={typography.pageHeaderAccent} />
          <h1 className={typography.h1}>Inbox</h1>
          {totalUnread > 0 && (
            <Badge className="ml-2 bg-international-orange text-white">
              {totalUnread} unread
            </Badge>
          )}
        </div>
        <p className={typography.pageSubtitle}>
          Message your team and discuss tasks in one place
        </p>
      </div>
    </div>
  )
}
