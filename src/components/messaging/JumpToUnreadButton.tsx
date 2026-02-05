'use client'

/**
 * JumpToUnreadButton - Floating action button to jump to first unread message
 * 
 * @description Appears when there are unread messages in a conversation.
 * Scrolls smoothly to the unread divider when clicked. Hides when user
 * scrolls near the unread messages.
 * 
 * @component
 */

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface JumpToUnreadButtonProps {
  /** Number of unread messages */
  unreadCount: number
  /** Callback to scroll to unread divider */
  onJumpToUnread: () => void
  /** ScrollArea element to monitor scroll position */
  scrollAreaRef?: React.RefObject<HTMLDivElement>
  /** Whether to show the button */
  show?: boolean
  /** Additional CSS classes */
  className?: string
}

export function JumpToUnreadButton({
  unreadCount,
  onJumpToUnread,
  scrollAreaRef,
  show = true,
  className
}: JumpToUnreadButtonProps) {
  const [isNearUnread, setIsNearUnread] = useState(false)

  // Monitor scroll position to hide button when near unread messages
  useEffect(() => {
    if (!scrollAreaRef?.current || !show) return

    const scrollArea = scrollAreaRef.current
    const handleScroll = () => {
      // Get scroll position
      const scrollTop = scrollArea.scrollTop
      const scrollHeight = scrollArea.scrollHeight
      const clientHeight = scrollArea.clientHeight
      
      // If scrolled to bottom 20%, consider "near unread"
      const scrollPercentage = (scrollTop + clientHeight) / scrollHeight
      setIsNearUnread(scrollPercentage > 0.8)
    }

    scrollArea.addEventListener('scroll', handleScroll)
    handleScroll() // Check initial position

    return () => {
      scrollArea.removeEventListener('scroll', handleScroll)
    }
  }, [scrollAreaRef, show])

  // Don't show if near unread messages or no unread count
  if (!show || unreadCount === 0 || isNearUnread) {
    return null
  }

  return (
    <div
      className={cn(
        'fixed bottom-24 right-6 z-10',
        'animate-in fade-in slide-in-from-bottom-4 duration-300',
        className
      )}
    >
      <Button
        onClick={onJumpToUnread}
        className={cn(
          'min-h-[44px] min-w-[44px] rounded-full shadow-lg',
          'bg-international-orange hover:bg-international-orange-hover text-white',
          'flex items-center gap-2 px-4'
        )}
        aria-label={`Jump to ${unreadCount} unread message${unreadCount !== 1 ? 's' : ''}`}
      >
        <ChevronDown className="h-4 w-4" />
        <span className="text-sm font-medium">Jump</span>
        <Badge 
          variant="secondary" 
          className="h-5 min-w-[20px] px-1.5 bg-white/20 text-white border-0"
        >
          {unreadCount}
        </Badge>
      </Button>
    </div>
  )
}
