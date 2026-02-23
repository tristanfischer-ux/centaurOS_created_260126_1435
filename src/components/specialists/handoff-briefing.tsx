'use client'

/**
 * @file handoff-briefing.tsx
 *
 * @description Interstitial card shown before a specialist switch executes.
 * Summarizes the conversation and previews what the next specialist will work on.
 */

import { ArrowRight, MessageSquare, Lightbulb, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Specialist } from '@/app/(platform)/agents/specialists-data'

interface HandoffBriefingProps {
    /** The specialist being switched from */
    fromSpecialist: Specialist
    /** The specialist being switched to */
    toSpecialist: Specialist
    /** Summary of what was discussed */
    discussionSummary: string
    /** Key recommendations from the conversation */
    recommendations: string[]
    /** What the next specialist will focus on */
    nextFocus: string
    /** Confirm the handoff */
    onConfirm: () => void
    /** Cancel the handoff */
    onCancel: () => void
    className?: string
}

/**
 * Renders a briefing card before executing a specialist switch.
 */
export function HandoffBriefing({
    fromSpecialist,
    toSpecialist,
    discussionSummary,
    recommendations,
    nextFocus,
    onConfirm,
    onCancel,
    className,
}: HandoffBriefingProps) {
    return (
        <div
            className={cn(
                'rounded-xl border bg-card p-5 shadow-lg',
                'animate-in fade-in-0 zoom-in-95 duration-200',
                className,
            )}
        >
            <div className="flex items-center gap-2 mb-4">
                <span className="text-sm font-semibold text-foreground">{fromSpecialist.name}</span>
                <ArrowRight className="h-3.5 w-3.5 text-international-orange" />
                <span className="text-sm font-semibold text-international-orange">{toSpecialist.name}</span>
            </div>

            <div className="space-y-3">
                {/* What was discussed */}
                <div className="flex items-start gap-2">
                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Discussed
                        </p>
                        <p className="text-xs text-foreground leading-relaxed mt-0.5">
                            {discussionSummary}
                        </p>
                    </div>
                </div>

                {/* Key recommendations */}
                {recommendations.length > 0 && (
                    <div className="flex items-start gap-2">
                        <Lightbulb className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Key Recommendations
                            </p>
                            <ul className="mt-0.5 space-y-0.5">
                                {recommendations.slice(0, 3).map((rec, i) => (
                                    <li key={i} className="text-xs text-foreground leading-relaxed">
                                        {rec}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}

                {/* What next specialist will work on */}
                <div className="flex items-start gap-2">
                    <Target className="h-3.5 w-3.5 text-international-orange mt-0.5 flex-shrink-0" />
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {toSpecialist.name} will focus on
                        </p>
                        <p className="text-xs text-foreground leading-relaxed mt-0.5">
                            {nextFocus}
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2 mt-4 pt-3 border-t">
                <Button
                    size="sm"
                    onClick={onConfirm}
                    className="bg-international-orange hover:bg-international-orange-hover text-white gap-1.5"
                >
                    Switch to {toSpecialist.name}
                    <ArrowRight className="h-3.5 w-3.5" />
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onCancel}
                >
                    Cancel
                </Button>
            </div>
        </div>
    )
}
