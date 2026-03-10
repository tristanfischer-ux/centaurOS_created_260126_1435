'use client'

/**
 * Empty state components for the Updates page.
 *
 * @description Provides encouraging empty states when there are no
 * activity items to display or when no thread is selected.
 *
 * @component
 */

import { BellOff, Inbox, MousePointerClick } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

/**
 * Empty state shown when the activity feed has no items.
 */
export function FeedEmptyState({ filter }: { filter: string }) {
  if (filter === 'unread') {
    return (
      <EmptyState
        icon={
          <div className="w-16 h-16 rounded-2xl bg-status-success-light border border-status-success/20 flex items-center justify-center opacity-100">
            <BellOff className="h-8 w-8 text-status-success" />
          </div>
        }
        title="All caught up"
        description="You have no unread updates. New notes and changes will appear here as your team collaborates."
        className="flex-1 p-8"
      />
    )
  }

  return (
    <EmptyState
      icon={
        <div className="w-16 h-16 rounded-2xl bg-international-orange/10 border border-muted flex items-center justify-center opacity-100">
          <Inbox className="h-8 w-8 text-international-orange" />
        </div>
      }
      title="No updates yet"
      description="When team members add notes to tasks or objectives, their updates will appear here in one place."
      className="flex-1 p-8"
    />
  )
}

/**
 * Empty state shown in the right panel when no thread is selected.
 */
export function ThreadEmptyState() {
  return (
    <EmptyState
      icon={
        <div className="w-16 h-16 rounded-2xl bg-muted border flex items-center justify-center opacity-100">
          <MousePointerClick className="h-8 w-8 text-muted-foreground" />
        </div>
      }
      title="Select an update"
      description="Click on an item from the feed to see the full conversation thread, task details, and reply inline."
      className="flex-1 p-8"
    />
  )
}
