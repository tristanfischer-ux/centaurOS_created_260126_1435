'use client'

import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface HelpTooltipProps {
  content: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
  /** Set false when inside an already-focusable element (e.g. TabsTrigger) to avoid rogue tab stops */
  focusable?: boolean
}

/**
 * Contextual help tooltip — renders a small ? icon that shows explanatory text on hover.
 * @description Use next to headings/labels where domain-specific concepts need clarification.
 * @param content - Short help text (1-2 sentences max)
 * @param side - Tooltip placement relative to icon
 * @param className - Additional classes for the icon wrapper
 */
export function HelpTooltip({ content, side = 'top', className, focusable = true }: HelpTooltipProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={focusable ? 0 : -1}
            aria-label="Help"
            className={cn(
              'inline-flex items-center align-middle cursor-help rounded-sm',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              className
            )}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <HelpCircle className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
          </span>
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-[250px]">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
