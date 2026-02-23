'use client'

/**
 * @file context-layer-pill.tsx
 *
 * @description Collapsed/expanded pill showing how many context layers
 * were used when generating a specialist response. Gives the founder
 * visibility into the intelligence backing each answer.
 */

import { useState } from 'react'
import { Brain, ChevronDown, ChevronUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface ContextLayerPillProps {
    /** Names of context layers that were active */
    activeLayers: string[]
    className?: string
}

/**
 * Renders a collapsible pill showing the number of context layers used.
 * Expanding reveals individual layer badges.
 */
export function ContextLayerPill({ activeLayers, className }: ContextLayerPillProps) {
    const [expanded, setExpanded] = useState(false)

    if (activeLayers.length === 0) return null

    return (
        <div className={cn('inline-flex flex-col', className)}>
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                aria-expanded={expanded}
                className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-[10px] text-muted-foreground hover:bg-muted transition-colors"
            >
                <Brain className="h-3 w-3" />
                <span>{activeLayers.length} context layer{activeLayers.length !== 1 ? 's' : ''} used</span>
                {expanded ? (
                    <ChevronUp className="h-2.5 w-2.5" />
                ) : (
                    <ChevronDown className="h-2.5 w-2.5" />
                )}
            </button>
            {expanded && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                    {activeLayers.map((layer) => (
                        <Badge
                            key={layer}
                            variant="secondary"
                            className="text-[10px] font-normal"
                        >
                            {layer}
                        </Badge>
                    ))}
                </div>
            )}
        </div>
    )
}
