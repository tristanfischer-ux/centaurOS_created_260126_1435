'use client'

import { HelpCircle } from 'lucide-react'
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
}

/**
 * Contextual help tooltip — renders a small ? icon that shows explanatory text on hover.
 * @description Use next to headings/labels where domain-specific concepts need clarification.
 * @param content - Short help text (1-2 sentences max)
 * @param side - Tooltip placement relative to icon
 * @param className - Additional classes for the icon wrapper
 */
export function HelpTooltip({ content, side = 'top', className }: HelpTooltipProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="img"
            aria-label="Help"
            className={`inline-flex items-center align-middle cursor-help ${className ?? ''}`}
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
