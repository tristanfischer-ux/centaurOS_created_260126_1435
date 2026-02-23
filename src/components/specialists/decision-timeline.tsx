'use client'

/**
 * @file decision-timeline.tsx
 *
 * @description Visual vertical timeline of decisions made with a specialist.
 * Shows outcome status dots, pattern summary, and inline outcome recording.
 */

import { useState, useEffect } from 'react'
import { Scale, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getDecisionTimeline } from '@/actions/decision-outcomes'
import { detectDecisionPatterns } from '@/lib/agents/decision-journal'
import type { DecisionEntry } from '@/lib/agents/decision-journal'
import { DecisionOutcomeCard } from './decision-outcome-card'

const OUTCOME_DOT: Record<string, string> = {
    pending: 'bg-muted-foreground',
    positive: 'bg-success',
    negative: 'bg-destructive',
    mixed: 'bg-warning',
    unknown: 'bg-muted-foreground',
}

interface DecisionTimelineProps {
    specialistId?: string
    className?: string
}

export function DecisionTimeline({ specialistId, className }: DecisionTimelineProps) {
    const [decisions, setDecisions] = useState<DecisionEntry[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [patterns, setPatterns] = useState<string[]>([])

    async function load() {
        setIsLoading(true)
        const { data } = await getDecisionTimeline(specialistId)
        setDecisions(data)
        setPatterns(detectDecisionPatterns(data))
        setIsLoading(false)
    }

    useEffect(() => {
        load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [specialistId])

    if (isLoading) {
        return (
            <div className={cn('flex items-center justify-center py-8', className)}>
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
                <span className="text-sm text-muted-foreground">Loading decisions...</span>
            </div>
        )
    }

    if (decisions.length === 0) {
        return (
            <div className={cn('text-center py-8', className)}>
                <Scale className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No decisions recorded yet.</p>
                <p className="text-xs text-muted-foreground mt-1">
                    Decisions are captured automatically during conversations.
                </p>
            </div>
        )
    }

    return (
        <div className={cn('space-y-4', className)}>
            {/* Pattern summary */}
            {patterns.length > 0 && (
                <div className="rounded-lg bg-muted/30 border p-3 space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Decision Patterns
                    </p>
                    {patterns.map((pattern, i) => (
                        <p key={i} className="text-xs text-muted-foreground leading-relaxed">
                            {pattern}
                        </p>
                    ))}
                </div>
            )}

            {/* Timeline */}
            <div className="relative pl-4" role="list">
                {/* Vertical line */}
                <div className="absolute left-[7px] top-0 bottom-0 w-px bg-border" aria-hidden="true" />

                <div className="space-y-3">
                    {decisions.map((decision) => (
                        <div key={decision.id} className="relative" role="listitem">
                            {/* Dot */}
                            <div
                                className={cn(
                                    'absolute left-[-13px] top-3 h-3 w-3 rounded-full border-2 border-background',
                                    OUTCOME_DOT[decision.outcomeStatus] ?? OUTCOME_DOT.pending,
                                )}
                            />
                            <DecisionOutcomeCard
                                decision={decision}
                                onOutcomeRecorded={load}
                            />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
