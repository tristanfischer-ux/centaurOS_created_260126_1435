'use client'

/**
 * @file conversation-starter-grid.tsx
 *
 * @description Renders structured conversation starters as categorized
 * mini-cards instead of flat chips. Groups by category and shows depth
 * indicators for each starter.
 */

import { Zap, MessageSquare, Brain } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StructuredStarter, StarterDepth } from '@/lib/utils/starter-parser'

const DEPTH_CONFIG: Record<StarterDepth, {
    icon: typeof Zap
    label: string
    className: string
}> = {
    quick: { icon: Zap, label: 'Quick', className: 'text-success' },
    medium: { icon: MessageSquare, label: 'Medium', className: 'text-status-info' },
    deep: { icon: Brain, label: 'Deep dive', className: 'text-international-orange' },
}

interface ConversationStarterGridProps {
    starters: StructuredStarter[]
    onSelect: (prompt: string) => void
    disabled?: boolean
    className?: string
}

/**
 * Renders starters grouped by category as clickable mini-cards.
 */
export function ConversationStarterGrid({
    starters,
    onSelect,
    disabled = false,
    className,
}: ConversationStarterGridProps) {
    // Group starters by category
    const grouped = starters.reduce<Record<string, StructuredStarter[]>>((acc, starter) => {
        const key = starter.category
        if (!acc[key]) acc[key] = []
        acc[key].push(starter)
        return acc
    }, {})

    const categories = Object.keys(grouped)

    return (
        <div className={cn('space-y-3', className)}>
            {categories.map((category) => (
                <div key={category}>
                    {categories.length > 1 && (
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                            {category}
                        </p>
                    )}
                    <div className="space-y-1.5">
                        {grouped[category].map((starter) => {
                            const depthCfg = DEPTH_CONFIG[starter.depth]
                            const DepthIcon = depthCfg.icon
                            return (
                                <button
                                    key={starter.prompt}
                                    type="button"
                                    onClick={() => onSelect(starter.prompt)}
                                    disabled={disabled}
                                    className={cn(
                                        'w-full text-left rounded-lg border bg-background p-2.5',
                                        'hover:border-international-orange/40 hover:bg-muted/30',
                                        'transition-all duration-150',
                                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-international-orange focus-visible:ring-offset-2',
                                        'disabled:opacity-50 disabled:cursor-not-allowed',
                                    )}
                                >
                                    <div className="flex items-start gap-2">
                                        <DepthIcon className={cn('h-3.5 w-3.5 mt-0.5 flex-shrink-0', depthCfg.className)} />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-medium text-foreground leading-snug">
                                                {starter.prompt}
                                            </p>
                                            {starter.description && (
                                                <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                                                    {starter.description}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </div>
            ))}
        </div>
    )
}
