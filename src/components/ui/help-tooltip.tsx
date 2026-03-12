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
          <span className={className}>
            <HelpCircle className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors cursor-help" />
          </span>
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-[250px]">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
