'use client'

/**
 * @file decision-outcome-card.tsx
 *
 * @description Displays a single decision with outcome recording UI.
 * Shows "How did this go?" CTA when the outcome is still pending.
 */

import { useState } from 'react'
import { Check, X, Scale, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { getSpecialistById } from '@/lib/agents/specialists-config'
import { updateDecisionOutcome } from '@/actions/decision-outcomes'
import type { DecisionEntry, OutcomeStatus } from '@/lib/agents/decision-journal'

const OUTCOME_CONFIG: Record<OutcomeStatus, {
    label: string
    className: string
    dotColor: string
}> = {
    pending: { label: 'Pending', className: 'bg-muted text-muted-foreground', dotColor: 'bg-muted-foreground' },
    positive: { label: 'Worked', className: 'bg-success/10 text-success', dotColor: 'bg-success' },
    negative: { label: "Didn't work", className: 'bg-destructive/10 text-destructive', dotColor: 'bg-destructive' },
    mixed: { label: 'Mixed', className: 'bg-warning/10 text-warning', dotColor: 'bg-warning' },
    unknown: { label: 'Unknown', className: 'bg-muted text-muted-foreground', dotColor: 'bg-muted-foreground' },
}

interface DecisionOutcomeCardProps {
    decision: DecisionEntry
    onOutcomeRecorded?: () => void
    className?: string
}

export function DecisionOutcomeCard({
    decision,
    onOutcomeRecorded,
    className,
}: DecisionOutcomeCardProps) {
    const [expanded, setExpanded] = useState(false)
    const [notes, setNotes] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const specialist = getSpecialistById(decision.specialistId)
    const config = OUTCOME_CONFIG[decision.outcomeStatus]
    const isPending = decision.outcomeStatus === 'pending'
    const daysAgo = Math.floor((Date.now() - new Date(decision.createdAt).getTime()) / 86400000)

    async function handleOutcome(status: OutcomeStatus) {
        setIsSubmitting(true)
        const { error } = await updateDecisionOutcome(decision.id, status, notes || undefined)
        setIsSubmitting(false)
        if (!error) {
            setExpanded(false)
            onOutcomeRecorded?.()
        }
    }

    return (
        <div className={cn('rounded-lg border p-3', className)}>
            <div className="flex items-start gap-2">
                <div className={cn('h-2 w-2 rounded-full mt-1.5 flex-shrink-0', config.dotColor)} />
                <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground leading-snug">
                        {decision.decision.slice(0, 200)}
                        {decision.decision.length > 200 ? '...' : ''}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                        {specialist && (
                            <span className="text-[10px] text-muted-foreground">
                                with {specialist.name}
                            </span>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                            {daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo}d ago`}
                        </span>
                        <Badge className={cn('text-[10px]', config.className)}>
                            {config.label}
                        </Badge>
                    </div>

                    {isPending && (
                        <div className="mt-2">
                            {!expanded ? (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setExpanded(true)}
                                    aria-expanded={expanded}
                                    className="h-6 px-2 text-[10px] text-international-orange hover:text-international-orange"
                                >
                                    How did this go?
                                    <ChevronDown className="h-2.5 w-2.5 ml-1" />
                                </Button>
                            ) : (
                                <div className="space-y-2 mt-1">
                                    <div className="flex gap-1.5">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleOutcome('positive')}
                                            disabled={isSubmitting}
                                            className="h-7 px-2 text-xs text-success hover:text-success hover:bg-success/10"
                                        >
                                            <Check className="h-3 w-3 mr-1" />
                                            Worked
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleOutcome('negative')}
                                            disabled={isSubmitting}
                                            className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                        >
                                            <X className="h-3 w-3 mr-1" />
                                            Didn&apos;t work
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleOutcome('mixed')}
                                            disabled={isSubmitting}
                                            className="h-7 px-2 text-xs text-warning hover:text-warning hover:bg-warning/10"
                                        >
                                            <Scale className="h-3 w-3 mr-1" />
                                            Mixed
                                        </Button>
                                    </div>
                                    <Textarea
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="Optional notes..."
                                        className="h-16 text-xs resize-none"
                                    />
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setExpanded(false)}
                                        className="h-6 px-2 text-[10px]"
                                    >
                                        <ChevronUp className="h-2.5 w-2.5 mr-1" />
                                        Cancel
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}

                    {decision.outcomeNotes && (
                        <p className="text-[10px] text-muted-foreground mt-1 italic">
                            {decision.outcomeNotes}
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}
