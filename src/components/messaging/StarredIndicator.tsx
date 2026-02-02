'use client'

import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StarredIndicatorProps {
  isStarred: boolean
  className?: string
}

/**
 * Visual indicator for starred messages
 */
export function StarredIndicator({ isStarred, className }: StarredIndicatorProps) {
  if (!isStarred) return null
  
  return (
    <div
      className={cn(
        'absolute -top-1 -right-1 z-10',
        'bg-amber-500 rounded-full p-0.5',
        'shadow-sm',
        className
      )}
      title="Starred message"
    >
      <Star className="h-3 w-3 text-white fill-white" />
    </div>
  )
}
