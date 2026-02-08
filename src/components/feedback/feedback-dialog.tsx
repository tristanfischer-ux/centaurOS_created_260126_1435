'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import { submitFeedback, type FeedbackCategory } from '@/actions/feedback'
import { toast } from 'sonner'
import {
    Bug,
    Lightbulb,
    HelpCircle,
    Heart,
    Loader2,
    Send,
    AlertCircle,
} from 'lucide-react'

const CATEGORY_OPTIONS: {
    value: FeedbackCategory
    label: string
    icon: typeof Bug
    description: string
}[] = [
    {
        value: 'bug',
        label: 'Bug',
        icon: Bug,
        description: 'Something isn\'t working right',
    },
    {
        value: 'idea',
        label: 'Idea',
        icon: Lightbulb,
        description: 'A feature or improvement',
    },
    {
        value: 'confusion',
        label: 'Confused',
        icon: HelpCircle,
        description: 'Something is unclear',
    },
    {
        value: 'praise',
        label: 'Love it',
        icon: Heart,
        description: 'Something you appreciate',
    },
]

const MAX_MESSAGE_LENGTH = 2000

interface FeedbackDialogProps {
    /** Whether the dialog is open */
    open: boolean
    /** Callback when dialog open state changes */
    onOpenChange: (open: boolean) => void
    /** Optional pre-filled feature name (when opened from a beta badge) */
    featureName?: string
}

/**
 * FeedbackDialog — Lightweight contextual feedback form for early access users.
 * 
 * @description Captures feedback with category (bug/idea/confusion/praise),
 * free-text message, and auto-detected page context. Designed to feel like
 * insider access rather than a support ticket.
 * 
 * @param props.open - Dialog visibility
 * @param props.onOpenChange - Open state callback
 * @param props.featureName - Optional feature name to pre-fill context
 */
export function FeedbackDialog({ open, onOpenChange, featureName }: FeedbackDialogProps) {
    const pathname = usePathname()
    const [category, setCategory] = useState<FeedbackCategory>('idea')
    const [message, setMessage] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Reset form when dialog opens
    useEffect(() => {
        if (open) {
            setCategory('idea')
            setMessage('')
            setError(null)
        }
    }, [open])

    const handleSubmit = async (): Promise<void> => {
        if (!message.trim()) {
            setError('Please share what\'s on your mind')
            return
        }

        if (message.trim().length < 5) {
            setError('Please share a bit more detail (at least 5 characters)')
            return
        }

        setIsSubmitting(true)
        setError(null)

        const result = await submitFeedback({
            category,
            message: message.trim(),
            pageRoute: pathname,
            featureName: featureName || undefined,
        })

        setIsSubmitting(false)

        if (result.success) {
            toast.success('Thanks for the feedback! Every bit helps shape ForgeOS.')
            onOpenChange(false)
        } else {
            setError(result.error || 'Something went wrong. Please try again.')
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="md">
                <DialogHeader>
                    <DialogTitle className="text-xl">Share Feedback</DialogTitle>
                    <DialogDescription className="text-base">
                        You&apos;re helping build ForgeOS. Every piece of feedback gets read by the team.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                    {/* Category Selection */}
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">What kind of feedback?</Label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {CATEGORY_OPTIONS.map((option) => {
                                const Icon = option.icon
                                const isSelected = category === option.value
                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => {
                                            setCategory(option.value)
                                            if (error) setError(null)
                                        }}
                                        className={cn(
                                            'flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all duration-200 text-center',
                                            isSelected
                                                ? 'border-international-orange bg-international-orange/5 text-foreground'
                                                : 'border-transparent bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                                        )}
                                    >
                                        <Icon className={cn(
                                            'h-5 w-5',
                                            isSelected ? 'text-international-orange' : 'text-muted-foreground'
                                        )} />
                                        <span className="text-xs font-medium">{option.label}</span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Message */}
                    <div className="space-y-2">
                        <Label htmlFor="feedback-message" className="text-sm font-medium">
                            What&apos;s on your mind?
                        </Label>
                        <Textarea
                            id="feedback-message"
                            value={message}
                            onChange={(e) => {
                                setMessage(e.target.value)
                                if (error) setError(null)
                            }}
                            placeholder={
                                category === 'bug'
                                    ? 'Describe what happened and what you expected...'
                                    : category === 'idea'
                                        ? 'What would make ForgeOS better for you?'
                                        : category === 'confusion'
                                            ? 'What was unclear or hard to find?'
                                            : 'What\'s working well for you?'
                            }
                            maxLength={MAX_MESSAGE_LENGTH}
                            rows={4}
                            className="resize-none"
                            aria-required
                            aria-invalid={!!error}
                            aria-describedby={error ? 'feedback-error' : undefined}
                        />
                        <p className="text-xs text-muted-foreground text-right">
                            {message.length} / {MAX_MESSAGE_LENGTH}
                        </p>
                    </div>

                    {/* Context indicator */}
                    {featureName && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                            <span>About:</span>
                            <span className="font-medium text-foreground">{featureName}</span>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription id="feedback-error" role="alert">
                                {error}
                            </AlertDescription>
                        </Alert>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        variant="secondary"
                        onClick={() => onOpenChange(false)}
                        disabled={isSubmitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isSubmitting || !message.trim()}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Sending...
                            </>
                        ) : (
                            <>
                                <Send className="h-4 w-4" />
                                Send Feedback
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
