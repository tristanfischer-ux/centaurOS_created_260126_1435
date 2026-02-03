'use client'

/**
 * StandupStatusBanner - Prompts users to submit their daily standup
 * 
 * @description Displays a prominent banner when user hasn't submitted
 * today's standup. Includes inline form dialog for quick submission.
 * 
 * @component
 */

import { useState, useEffect, useTransition } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { 
    MessageSquare, 
    CheckCircle2, 
    Target, 
    AlertTriangle,
    Smile,
    Meh,
    Frown,
    Loader2
} from 'lucide-react'
import { getMyTodayStandup, submitStandup, type Standup } from '@/actions/standups'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const moodOptions = [
    { value: 'great', icon: Smile, label: 'Great', color: 'text-status-success bg-status-success-light border-status-success' },
    { value: 'good', icon: Smile, label: 'Good', color: 'text-status-info bg-status-info-light border' },
    { value: 'okay', icon: Meh, label: 'Okay', color: 'text-status-warning bg-status-warning-light border-status-warning' },
    { value: 'struggling', icon: Frown, label: 'Struggling', color: 'text-destructive bg-status-error-light border-destructive' }
] as const

interface StandupStatusBannerProps {
    /** Callback when standup is submitted */
    onSubmitted?: () => void
}

export function StandupStatusBanner({ onSubmitted }: StandupStatusBannerProps) {
    const [standup, setStandup] = useState<Standup | null | undefined>(undefined)
    const [showDialog, setShowDialog] = useState(false)
    const [isPending, startTransition] = useTransition()
    
    // Form state
    const [completed, setCompleted] = useState('')
    const [planned, setPlanned] = useState('')
    const [blockers, setBlockers] = useState('')
    const [mood, setMood] = useState<'great' | 'good' | 'okay' | 'struggling' | null>(null)
    const [needsHelp, setNeedsHelp] = useState(false)

    useEffect(() => {
        let mounted = true
        
        async function checkStandup() {
            const result = await getMyTodayStandup()
            if (mounted) {
                setStandup(result.data)
            }
        }
        
        checkStandup()
        
        return () => {
            mounted = false
        }
    }, [])

    const handleSubmit = async () => {
        startTransition(async () => {
            const result = await submitStandup({
                completed: completed || undefined,
                planned: planned || undefined,
                blockers: blockers || undefined,
                needsHelp,
                mood: mood || undefined
            })
            
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Standup submitted!')
                setStandup(result.data)
                setShowDialog(false)
                onSubmitted?.()
            }
        })
    }

    // Loading state - don't show anything while checking
    if (standup === undefined) {
        return null
    }

    // Already submitted - don't show banner
    if (standup !== null) {
        return null
    }

    return (
        <>
            <Alert className="bg-status-warning-light border-status-warning">
                <MessageSquare className="h-4 w-4 text-status-warning" />
                <AlertDescription className="flex items-center justify-between">
                    <span className="text-status-warning-dark font-medium">
                        You haven't submitted your daily standup yet.
                    </span>
                    <Button 
                        variant="secondary" 
                        size="sm"
                        onClick={() => setShowDialog(true)}
                        className="ml-4 bg-background hover:bg-muted"
                    >
                        Submit now
                    </Button>
                </AlertDescription>
            </Alert>

            <Dialog open={showDialog} onOpenChange={setShowDialog}>
                <DialogContent size="md">
                    <DialogHeader>
                        <DialogTitle>Daily Standup</DialogTitle>
                    </DialogHeader>
                    
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label htmlFor="standup-completed" className="text-sm font-medium text-foreground flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-status-success" />
                                What did you accomplish?
                            </label>
                            <Textarea
                                id="standup-completed"
                                value={completed}
                                onChange={(e) => setCompleted(e.target.value)}
                                placeholder="Yesterday I completed..."
                                className="min-h-[80px] bg-background border"
                            />
                        </div>
                        
                        <div className="space-y-2">
                            <label htmlFor="standup-planned" className="text-sm font-medium text-foreground flex items-center gap-2">
                                <Target className="h-4 w-4 text-status-info" />
                                What will you work on today?
                            </label>
                            <Textarea
                                id="standup-planned"
                                value={planned}
                                onChange={(e) => setPlanned(e.target.value)}
                                placeholder="Today I plan to..."
                                className="min-h-[80px] bg-background border"
                            />
                        </div>
                        
                        <div className="space-y-2">
                            <label htmlFor="standup-blockers" className="text-sm font-medium text-foreground flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-status-warning" />
                                Any blockers or issues?
                            </label>
                            <Textarea
                                id="standup-blockers"
                                value={blockers}
                                onChange={(e) => setBlockers(e.target.value)}
                                placeholder="I'm blocked by... (or leave empty)"
                                className="min-h-[60px] bg-background border"
                            />
                            {blockers && (
                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={needsHelp}
                                        onChange={(e) => setNeedsHelp(e.target.checked)}
                                        className="rounded border"
                                    />
                                    <span className="text-muted-foreground">I need help unblocking this</span>
                                </label>
                            )}
                        </div>
                        
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">How are you feeling?</label>
                            <div className="flex gap-2">
                                {moodOptions.map((option) => {
                                    const Icon = option.icon
                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => setMood(option.value)}
                                            className={cn(
                                                'flex-1 py-2 px-3 rounded-lg border transition-all',
                                                mood === option.value
                                                    ? option.color + ' border-2'
                                                    : 'border hover:border-muted-foreground/30 bg-background'
                                            )}
                                        >
                                            <Icon className={cn(
                                                'h-5 w-5 mx-auto',
                                                mood === option.value ? '' : 'text-muted-foreground'
                                            )} />
                                            <span className={cn(
                                                'text-xs block mt-1',
                                                mood === option.value ? '' : 'text-muted-foreground'
                                            )}>
                                                {option.label}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setShowDialog(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={isPending || (!completed && !planned)}
                        >
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Submit Standup
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
