"use client"

/**
 * @file specialist-council-dialog.tsx
 *
 * @description Specialist Council Dialog - autonomous specialist debates
 * with Chief of Staff synthesis. Users provide a topic, specialists debate
 * among themselves (without user involvement), and Cal synthesizes into a
 * decision recommendation report.
 *
 * @related
 * - specialists-data.ts -- Specialist roster
 * - run-specialist-council.ts -- Server action
 * - /api/agents/council -- API endpoint
 */

import { useState, useCallback } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
    Loader2,
    Play,
    AlertCircle,
    CheckCircle2,
    Users,
    MessageSquare,
    Scale,
    Target,
    Lightbulb,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    runSpecialistCouncil,
    type CouncilResult,
    type CouncilActionResult,
} from '@/actions/run-specialist-council'

interface SpecialistCouncilDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SpecialistCouncilDialog({
    open,
    onOpenChange,
}: SpecialistCouncilDialogProps) {
    const [topic, setTopic] = useState('')
    const [context, setContext] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<CouncilResult | null>(null)

    const handleRunCouncil = useCallback(async () => {
        if (!topic.trim()) {
            setError('Please enter a topic for the council to discuss')
            return
        }

        setIsLoading(true)
        setError(null)
        setResult(null)

        try {
            const actionResult = await runSpecialistCouncil({
                topic: topic.trim(),
                context: context.trim() || undefined,
            })

            if (!actionResult.success) {
                setError(actionResult.error)
            } else {
                setResult(actionResult.data)
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to run council'
            setError(message)
        } finally {
            setIsLoading(false)
        }
    }, [topic, context])

    const handleClose = useCallback(() => {
        setTopic('')
        setContext('')
        setError(null)
        setResult(null)
        onOpenChange(false)
    }, [onOpenChange])

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent size="xl" className="max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-international-orange" />
                        Specialist Council
                    </DialogTitle>
                    <DialogDescription>
                        Your specialists will debate the topic among themselves.
                        Cal (Chief of Staff) will synthesize their discussion into a decision recommendation.
                    </DialogDescription>
                </DialogHeader>

                {!result ? (
                    // Setup Phase
                    <div className="space-y-6 py-4" aria-busy={isLoading} aria-live="polite">
                        <div className="space-y-2">
                            <Label htmlFor="topic" className="text-sm font-medium">
                                What should the council discuss?{' '}
                                <span className="text-destructive" aria-label="required">*</span>
                            </Label>
                            <Textarea
                                id="topic"
                                value={topic}
                                onChange={(e) => setTopic(e.target.value)}
                                placeholder="e.g., Should we hire a VP of Sales before launching?"
                                className="min-h-[80px]"
                                disabled={isLoading}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="context" className="text-sm font-medium">
                                Additional context <span className="text-muted-foreground">(optional)</span>
                            </Label>
                            <Textarea
                                id="context"
                                value={context}
                                onChange={(e) => setContext(e.target.value)}
                                placeholder="Any background information the council should know..."
                                className="min-h-[80px]"
                                disabled={isLoading}
                            />
                        </div>

                        {error && (
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>Error</AlertTitle>
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        {isLoading && (
                            <div className="space-y-4">
                                <Alert>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <AlertTitle>Council in Progress</AlertTitle>
                                    <AlertDescription>
                                        Specialists are debating. This typically takes 1-2 minutes.
                                    </AlertDescription>
                                </Alert>
                                <div className="flex items-center justify-center py-8">
                                    <div className="text-center space-y-2">
                                        <Loader2 className="h-8 w-8 animate-spin text-international-orange mx-auto" />
                                        <p className="text-sm text-muted-foreground">
                                            Running 3 debate rounds with{' '}
                                            <span className="font-medium text-foreground">
                                                Chief of Staff, Strategist, Finance Lead...
                                            </span>
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    // Results Phase
                    <div
                        className="flex-1 overflow-y-auto space-y-6 py-4"
                        role="region"
                        aria-label="Council results"
                    >
                        {/* Executive Summary */}
                        <div className="bg-muted/50 rounded-lg p-4">
                            <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                                <MessageSquare className="h-4 w-4 text-international-orange" />
                                Executive Summary
                            </h3>
                            <p className="text-muted-foreground">
                                {result.report.executive_summary}
                            </p>
                        </div>

                        {/* Specialist Positions */}
                        <div className="space-y-3">
                            <h3 className="font-semibold text-foreground flex items-center gap-2">
                                <Users className="h-4 w-4" />
                                Specialist Positions
                            </h3>
                            <div className="grid gap-3">
                                {result.report.positions.map((position, idx) => (
                                    <div
                                        key={idx}
                                        className="border rounded-lg p-3 space-y-2"
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="font-medium text-foreground">
                                                {position.specialist}
                                            </span>
                                            <Badge
                                                variant={
                                                    position.conviction === 'high'
                                                        ? 'default'
                                                        : position.conviction === 'medium'
                                                        ? 'secondary'
                                                        : 'outline'
                                                }
                                                className={cn(
                                                    position.conviction === 'high' &&
                                                        'bg-international-orange'
                                                )}
                                            >
                                                {position.conviction} conviction
                                            </Badge>
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                            {position.key_position}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Tensions */}
                        {result.report.tensions.length > 0 && (
                            <div className="space-y-3">
                                <h3 className="font-semibold text-foreground flex items-center gap-2">
                                    <Scale className="h-4 w-4 text-status-warning" />
                                    Key Tensions
                                </h3>
                                <div className="space-y-2">
                                    {result.report.tensions.map((tension, idx) => (
                                        <Alert key={idx} className="border-status-warning bg-status-warning-light">
                                            <AlertCircle className="h-4 w-4" />
                                            <AlertDescription>
                                                <span className="font-medium">
                                                    {tension.between.join(' vs ')}
                                                </span>
                                                {': '}
                                                {tension.description}
                                            </AlertDescription>
                                        </Alert>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Consensus */}
                        {result.report.consensus.length > 0 && (
                            <div className="space-y-3">
                                <h3 className="font-semibold text-foreground flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-status-success" />
                                    Areas of Consensus
                                </h3>
                                <ul className="space-y-1">
                                    {result.report.consensus.map((item, idx) => (
                                        <li
                                            key={idx}
                                            className="flex items-start gap-2 text-sm text-muted-foreground"
                                        >
                                            <CheckCircle2 className="h-4 w-4 text-status-success mt-0.5 flex-shrink-0" />
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Recommendations */}
                        {result.report.recommendations.length > 0 && (
                            <div className="space-y-3">
                                <h3 className="font-semibold text-foreground flex items-center gap-2">
                                    <Target className="h-4 w-4 text-international-orange" />
                                    Recommendations
                                </h3>
                                <ul className="space-y-2">
                                    {result.report.recommendations.map((rec, idx) => (
                                        <li
                                            key={idx}
                                            className="flex items-start gap-2 text-sm"
                                        >
                                            <span className="font-medium text-international-orange">
                                                {idx + 1}.
                                            </span>
                                            <span className="text-foreground">{rec}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Decision Options */}
                        {result.report.decision_options.length > 0 && (
                            <div className="space-y-3">
                                <h3 className="font-semibold text-foreground flex items-center gap-2">
                                    <Lightbulb className="h-4 w-4" />
                                    Decision Options for You
                                </h3>
                                <div className="space-y-3">
                                    {result.report.decision_options.map((option, idx) => (
                                        <div
                                            key={idx}
                                            className="border rounded-lg p-3 space-y-2"
                                        >
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="font-normal">
                                                    Option {idx + 1}
                                                </Badge>
                                                <span className="font-medium text-foreground">
                                                    {option.option}
                                                </span>
                                            </div>
                                            {option.supporters.length > 0 && (
                                                <p className="text-xs text-muted-foreground">
                                                    Supported by: {option.supporters.join(', ')}
                                                </p>
                                            )}
                                            <p className="text-sm text-muted-foreground">
                                                {option.rationale}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <DialogFooter>
                    {!result ? (
                        <div className="flex w-full items-center justify-between">
                            <Button
                                variant="secondary"
                                onClick={handleClose}
                                disabled={isLoading}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleRunCouncil}
                                disabled={isLoading || !topic.trim()}
                                className="bg-international-orange hover:bg-international-orange-hover"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        Running Council...
                                    </>
                                ) : (
                                    <>
                                        <Play className="h-4 w-4 mr-2" />
                                        Run Council
                                    </>
                                )}
                            </Button>
                        </div>
                    ) : (
                        <div className="flex w-full items-center justify-between">
                            <Button
                                variant="secondary"
                                onClick={() => setResult(null)}
                            >
                                Ask Another Question
                            </Button>
                            <Button
                                onClick={handleClose}
                                className="bg-international-orange hover:bg-international-orange-hover"
                            >
                                Done
                            </Button>
                        </div>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
