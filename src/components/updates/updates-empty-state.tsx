'use client'

/**
 * Empty state components for the Updates page.
 *
 * @description Provides encouraging empty states when there are no
 * activity items to display or when no thread is selected.
 *
 * @component
 */

import { Bell, BellOff, Inbox, MousePointerClick } from 'lucide-react'

/**
 * Empty state shown when the activity feed has no items.
 */
export function FeedEmptyState({ filter }: { filter: string }) {
  if (filter === 'unread') {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-status-success-light border border-status-success/20 flex items-center justify-center mx-auto mb-4">
            <BellOff className="h-8 w-8 text-status-success" />
          </div>
          <h3 className="text-lg font-display font-semibold text-foreground mb-2">
            All caught up
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You have no unread updates. New notes and changes will appear here
            as your team collaborates.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-international-orange/10 border border-muted flex items-center justify-center mx-auto mb-4">
          <Inbox className="h-8 w-8 text-international-orange" />
        </div>
        <h3 className="text-lg font-display font-semibold text-foreground mb-2">
          No updates yet
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          When team members add notes to tasks or objectives, their updates
          will appear here in one place.
        </p>
      </div>
    </div>
  )
}

/**
 * Empty state shown in the right panel when no thread is selected.
 */
export function ThreadEmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-muted border flex items-center justify-center mx-auto mb-4">
          <MousePointerClick className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-display font-semibold text-foreground mb-2">
          Select an update
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Click on an item from the feed to see the full conversation thread,
          task details, and reply inline.
        </p>
      </div>
    </div>
  )
}
