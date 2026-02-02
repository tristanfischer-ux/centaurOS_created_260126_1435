'use client'

import { cn } from '@/lib/utils'
import { ReactionPicker } from './ReactionPicker'
import type { ReactionGroup } from '@/actions/reactions'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface ReactionDisplayProps {
  reactions: ReactionGroup[]
  onToggle: (emoji: string) => void
  onAddNew: (emoji: string) => void
  className?: string
  showAddButton?: boolean
}

/**
 * Display reactions below a message with toggle and add functionality
 */
export function ReactionDisplay({
  reactions,
  onToggle,
  onAddNew,
  className,
  showAddButton = true
}: ReactionDisplayProps) {
  if (reactions.length === 0 && !showAddButton) {
    return null
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5 mt-1.5", className)}>
      <TooltipProvider delayDuration={300}>
        {reactions.map((reaction) => (
          <Tooltip key={reaction.emoji}>
            <TooltipTrigger asChild>
              <button
                onClick={() => onToggle(reaction.emoji)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-sm",
                  "border transition-all duration-150",
                  "hover:scale-105 active:scale-95",
                  reaction.hasReacted
                    ? "bg-electric-blue-light border-electric-blue text-electric-blue font-medium"
                    : "bg-muted border-transparent hover:border-border text-foreground"
                )}
                aria-label={`${reaction.emoji} ${reaction.count} ${reaction.count === 1 ? 'reaction' : 'reactions'}${reaction.hasReacted ? ', you reacted' : ''}`}
              >
                <span className="text-base leading-none">{reaction.emoji}</span>
                <span className="text-xs">{reaction.count}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[200px]">
              <div className="text-xs">
                {reaction.users.slice(0, 10).map((user, i) => (
                  <span key={user.id}>
                    {user.full_name || 'Someone'}
                    {i < Math.min(reaction.users.length, 10) - 1 && ', '}
                  </span>
                ))}
                {reaction.users.length > 10 && (
                  <span> and {reaction.users.length - 10} more</span>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </TooltipProvider>

      {showAddButton && (
        <ReactionPicker
          onSelect={onAddNew}
          align="start"
          side="top"
        />
      )}
    </div>
  )
}

/**
 * Compact reaction display for message lists/previews
 */
export function CompactReactionDisplay({
  reactions,
  maxVisible = 3,
  className
}: {
  reactions: ReactionGroup[]
  maxVisible?: number
  className?: string
}) {
  if (reactions.length === 0) return null

  const visibleReactions = reactions.slice(0, maxVisible)
  const remainingCount = reactions.length - maxVisible
  const totalCount = reactions.reduce((sum, r) => sum + r.count, 0)

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <div className="flex -space-x-0.5">
        {visibleReactions.map((reaction) => (
          <span
            key={reaction.emoji}
            className="text-sm"
            title={`${reaction.count} ${reaction.emoji}`}
          >
            {reaction.emoji}
          </span>
        ))}
      </div>
      {remainingCount > 0 && (
        <span className="text-xs text-muted-foreground">
          +{remainingCount}
        </span>
      )}
      <span className="text-xs text-muted-foreground">
        {totalCount}
      </span>
    </div>
  )
}
