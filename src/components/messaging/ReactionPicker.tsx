'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { SmilePlus } from 'lucide-react'
import { QUICK_REACTIONS, EMOJI_SHORTCODES } from '@/hooks/useReactions'

interface ReactionPickerProps {
  onSelect: (emoji: string) => void
  trigger?: React.ReactNode
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}

// Extended emoji categories for the picker
const EMOJI_CATEGORIES = {
  'Frequently Used': QUICK_REACTIONS,
  'Smileys': ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😌', '😍', '🥰', '😘'],
  'Gestures': ['👍', '👎', '👏', '🙌', '🤝', '👋', '✋', '🤚', '🖐️', '✌️', '🤞', '🤟', '🤘', '💪', '🙏'],
  'Symbols': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '❣️', '💕', '💞', '💓', '💗', '💖', '💝', '💘'],
  'Objects': ['⭐', '✨', '🔥', '💯', '🎉', '🎊', '🎁', '🏆', '🥇', '🎯', '✅', '❌', '⚠️', '🚀', '💡'],
}

export function ReactionPicker({
  onSelect,
  trigger,
  align = 'start',
  side = 'top',
  className
}: ReactionPickerProps) {
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const handleSelect = (emoji: string) => {
    onSelect(emoji)
    setOpen(false)
    setSearchQuery('')
  }

  // Filter emojis based on search
  const filteredCategories = searchQuery
    ? {
        'Search Results': Object.values(EMOJI_CATEGORIES)
          .flat()
          .filter(emoji => {
            // Check if emoji matches or any shortcode matches
            const matchesShortcode = Object.entries(EMOJI_SHORTCODES)
              .some(([code, e]) => e === emoji && code.includes(searchQuery.toLowerCase()))
            return emoji.includes(searchQuery) || matchesShortcode
          })
      }
    : EMOJI_CATEGORIES

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger || (
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-7 w-7 p-0", className)}
            aria-label="Add reaction"
          >
            <SmilePlus className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent 
        className="w-80 p-0" 
        align={align} 
        side={side}
        sideOffset={8}
      >
        {/* Search */}
        <div className="p-2 border-b">
          <input
            type="text"
            placeholder="Search emoji..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-muted rounded-md border-0 outline-none focus:ring-2 focus:ring-electric-blue"
            autoFocus
          />
        </div>

        {/* Emoji grid */}
        <div className="max-h-[300px] overflow-y-auto p-2">
          {Object.entries(filteredCategories).map(([category, emojis]) => {
            if (emojis.length === 0) return null
            
            return (
              <div key={category} className="mb-3 last:mb-0">
                <p className="text-xs font-medium text-muted-foreground mb-2 px-1">
                  {category}
                </p>
                <div className="grid grid-cols-8 gap-1">
                  {emojis.map((emoji, index) => (
                    <button
                      key={`${emoji}-${index}`}
                      onClick={() => handleSelect(emoji)}
                      className={cn(
                        "h-8 w-8 flex items-center justify-center rounded",
                        "text-xl hover:bg-muted transition-colors",
                        "focus:outline-none focus:ring-2 focus:ring-electric-blue"
                      )}
                      aria-label={`React with ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}

          {searchQuery && Object.values(filteredCategories).flat().length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No emoji found for "{searchQuery}"
            </p>
          )}
        </div>

        {/* Quick reactions footer */}
        <div className="border-t p-2 bg-muted/50">
          <p className="text-xs text-muted-foreground mb-2">Quick reactions</p>
          <div className="flex gap-1">
            {QUICK_REACTIONS.slice(0, 8).map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleSelect(emoji)}
                className={cn(
                  "h-8 w-8 flex items-center justify-center rounded",
                  "text-lg hover:bg-background transition-colors"
                )}
                aria-label={`React with ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Inline quick reaction buttons (for hovering over messages)
 */
export function QuickReactionBar({
  onSelect,
  className
}: {
  onSelect: (emoji: string) => void
  className?: string
}) {
  return (
    <div className={cn(
      "flex items-center gap-0.5 p-1 bg-background border rounded-lg shadow-sm",
      className
    )}>
      {QUICK_REACTIONS.slice(0, 6).map((emoji) => (
        <button
          key={emoji}
          onClick={() => onSelect(emoji)}
          className={cn(
            "h-7 w-7 flex items-center justify-center rounded",
            "text-base hover:bg-muted transition-colors"
          )}
          aria-label={`React with ${emoji}`}
        >
          {emoji}
        </button>
      ))}
      <ReactionPicker
        onSelect={onSelect}
        trigger={
          <button className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted transition-colors">
            <SmilePlus className="h-4 w-4 text-muted-foreground" />
          </button>
        }
      />
    </div>
  )
}
