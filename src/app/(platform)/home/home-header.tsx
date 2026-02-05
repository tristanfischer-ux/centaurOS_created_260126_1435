'use client'

import { Badge } from '@/components/ui/badge'
import { typography } from '@/lib/design-system'
import { useRouter } from 'next/navigation'

interface HomeHeaderProps {
  totalUnread: number
  userName?: string
}

/**
 * Page header for the Home page
 * 
 * Displays the standard orange accent bar, greeting, subtitle,
 * and unread message count badge.
 */
export function HomeHeader({ totalUnread, userName }: HomeHeaderProps) {
  const router = useRouter()
  
  // Get time-based greeting
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const displayName = userName?.split(' ')[0] || 'there'

  // Handle jump to unread
  const handleJumpToUnread = () => {
    router.push('/home?jumpToUnread=true')
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className={typography.pageHeader}>
          <div className={typography.pageHeaderAccent} />
          <h1 className={typography.h1}>
            {greeting}, {displayName}
          </h1>
          {totalUnread > 0 && (
            <Badge 
              className="ml-2 bg-international-orange text-white cursor-pointer hover:bg-international-orange-hover transition-colors"
              onClick={handleJumpToUnread}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleJumpToUnread()
                }
              }}
              aria-label={`Jump to ${totalUnread} unread message${totalUnread !== 1 ? 's' : ''}`}
            >
              {totalUnread} unread
            </Badge>
          )}
        </div>
        <p className={typography.pageSubtitle}>
          Your messages, tasks, and daily overview
        </p>
      </div>
    </div>
  )
}
