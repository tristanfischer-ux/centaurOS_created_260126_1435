'use client'

import { Pin } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PinnedIndicatorProps {
  isPinned: boolean
  className?: string
}

/**
 * Visual indicator for pinned messages
 */
export function PinnedIndicator({ isPinned, className }: PinnedIndicatorProps) {
  if (!isPinned) return null
  
  return (
    <div
      className={cn(
        'absolute -top-1 -left-1 z-10',
        'bg-international-orange rounded-full p-0.5',
        'shadow-sm',
        className
      )}
      title="Pinned message"
    >
      <Pin className="h-3 w-3 text-white fill-white rotate-45" />
    </div>
  )
}
