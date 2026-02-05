'use client'

/**
 * UnreadDivider - Visual indicator showing where unread messages begin
 * 
 * @description Shows an orange divider line with "Unread Messages" label
 * and unread count. Used to help users quickly identify which messages
 * they haven't read yet.
 * 
 * @component
 */

import { forwardRef } from 'react'
import { cn } from '@/lib/utils'
import { Bell } from 'lucide-react'

interface UnreadDividerProps {
  /** Number of unread messages */
  unreadCount: number
  /** Additional CSS classes */
  className?: string
}

export const UnreadDivider = forwardRef<HTMLDivElement, UnreadDividerProps>(
  ({ unreadCount, className }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center gap-3 py-4 my-2',
          'animate-in fade-in duration-300',
          className
        )}
        role="separator"
        aria-label={`${unreadCount} unread message${unreadCount !== 1 ? 's' : ''}`}
      >
        {/* Left line */}
        <div className="flex-1 h-px bg-international-orange" />
        
        {/* Label */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-international-orange-light border border-international-orange/30">
          <Bell className="h-3 w-3 text-international-orange" />
          <span className="text-xs font-medium uppercase tracking-wider text-international-orange">
            {unreadCount} Unread Message{unreadCount !== 1 ? 's' : ''}
          </span>
        </div>
        
        {/* Right line */}
        <div className="flex-1 h-px bg-international-orange" />
      </div>
    )
  }
)

UnreadDivider.displayName = 'UnreadDivider'
