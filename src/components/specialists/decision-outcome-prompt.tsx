'use client'

/**
 * @file decision-outcome-prompt.tsx
 *
 * @description Inline card rendered after a specialist response when the
 * conversation touches a topic matching a pending decision. Lets the founder
 * record how the decision turned out with a single tap.
 *
 * @related
 * - Server actions: src/actions/decision-outcomes.ts
 * - Dialog: src/app/(platform)/agents/brief-specialist-dialog.tsx (consumer)
 * - Decision journal: src/lib/agents/decision-journal.ts (data model)
 */

import { useState } from 'react'
import { ThumbsUp, ThumbsDown, Minus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { DecisionEntry, OutcomeStatus } from '@/lib/agents/decision-journal'
import { recordDecisionOutcome } from '@/actions/decision-outcomes'

interface DecisionOutcomePromptProps {
    decision: DecisionEntry
    compact?: boolean
    onDismiss: () => void
    onRecorded: (decisionId: string) => void
}

/**
 * Inline card that prompts the founder to record a decision outcome.
 *
 * @description Two-stage UI:
 * 1. Shows the decision snippet + three one-tap outcome buttons
 * 2. After tapping, shows an optional notes textarea + Save button
 *
 * @param decision - The pending decision entry to record an outcome for
 * @param compact - Smaller padding for panel mode (default: false)
 * @param onDismiss - Called when the user dismisses without recording
 * @param onRecorded - Called with the decision ID after a successful save
 */
export function DecisionOutcomePrompt({
    decision,
    compact = false,
    onDismiss,
    onRecorded,
}: DecisionOutcomePromptProps) {
    const [selected, setSelected] = useState<OutcomeStatus | null>(null)
    const [notes, setNotes] = useState('')
    const [saving, setSaving] = useState(false)

    const decisionDate = new Date(decision.createdAt).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
    })

    async function handleSave() {
        if (!selected) return
        setSaving(true)
        await recordDecisionOutcome(decision.id, selected, notes.trim() || undefined)
        setSaving(false)
        onRecorded(decision.id)
    }

    const padding = compact ? 'p-2.5' : 'p-3'

    return (
        <div className={`rounded-lg border border-border bg-muted/40 ${padding} text-sm animate-in fade-in slide-in-from-bottom-1 duration-200`}>
            {/* Header */}
            <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                    <p className="text-xs text-muted-foreground mb-0.5">How did this decision work out?</p>
                    <p className="text-foreground font-medium leading-snug line-clamp-2">
                        {decision.decision.slice(0, 120)}{decision.decision.length > 120 ? '…' : ''}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">Decided {decisionDate}</p>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={onDismiss}
                    aria-label="Dismiss"
                >
                    <X className="h-3 w-3" />
                </Button>
            </div>

            {/* Stage 1: Outcome buttons */}
            {!selected && (
                <div className="flex gap-1.5 flex-wrap">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 gap-1 text-success hover:bg-success/10 hover:text-success"
                        onClick={() => setSelected('positive')}
                    >
                        <ThumbsUp className="h-3.5 w-3.5" />
                        Worked
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setSelected('negative')}
                    >
                        <ThumbsDown className="h-3.5 w-3.5" />
                        {"Didn't work"}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 gap-1 text-warning hover:bg-warning/10 hover:text-warning"
                        onClick={() => setSelected('mixed')}
                    >
                        <Minus className="h-3.5 w-3.5" />
                        Mixed
                    </Button>
                </div>
            )}

            {/* Stage 2: Optional notes + save */}
            {selected && (
                <div className="space-y-2">
                    <Textarea
                        placeholder="Any notes? (optional)"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="h-16 text-sm resize-none"
                        autoFocus
                    />
                    <div className="flex gap-1.5">
                        <Button
                            size="sm"
                            className="h-7"
                            onClick={handleSave}
                            disabled={saving}
                        >
                            {saving ? 'Saving…' : 'Save'}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7"
                            onClick={() => setSelected(null)}
                        >
                            Back
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
