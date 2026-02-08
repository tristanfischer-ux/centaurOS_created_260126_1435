'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { X, MessageSquarePlus, Sparkles } from 'lucide-react'
import { FeedbackDialog } from '@/components/feedback/feedback-dialog'

const DISMISSED_KEY = 'forgeos:founding-member-card:dismissed'

/**
 * FoundingMemberCard — Dashboard card acknowledging the user as an early access member.
 * 
 * @description Creates a sense of ownership and participation. Includes a CTA
 * to open the feedback dialog. Dismissible via localStorage.
 */
export function FoundingMemberCard() {
    const [isDismissed, setIsDismissed] = useState(true)
    const [isFeedbackOpen, setIsFeedbackOpen] = useState(false)

    useEffect(() => {
        try {
            const dismissed = localStorage.getItem(DISMISSED_KEY)
            if (!dismissed) {
                setIsDismissed(false)
            }
        } catch {
            // localStorage not available
        }
    }, [])

    const handleDismiss = (): void => {
        try {
            localStorage.setItem(DISMISSED_KEY, 'true')
        } catch {
            // localStorage not available
        }
        setIsDismissed(true)
    }

    if (isDismissed) return null

    return (
        <>
            <Card className="relative overflow-hidden border border-international-orange/20 bg-international-orange/5">
                {/* Accent bar */}
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-international-orange rounded-l-xl" />
                
                <CardContent className="pt-5 pb-5 pl-5 pr-4">
                    <div className="flex items-start gap-4">
                        {/* Icon */}
                        <div className="flex-shrink-0 p-2 bg-international-orange/10 rounded-lg">
                            <Sparkles className="h-5 w-5 text-international-orange" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                                <h3 className="text-sm font-semibold text-foreground">
                                    You&apos;re shaping ForgeOS
                                </h3>
                                <button
                                    onClick={handleDismiss}
                                    className="flex-shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                    aria-label="Dismiss"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                As a founding member, your feedback directly influences what we build. Every suggestion gets read by the team.
                            </p>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setIsFeedbackOpen(true)}
                                className="text-international-orange hover:text-international-orange hover:bg-international-orange/10 -ml-2 mt-1"
                            >
                                <MessageSquarePlus className="h-3.5 w-3.5" />
                                Share Feedback
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <FeedbackDialog
                open={isFeedbackOpen}
                onOpenChange={setIsFeedbackOpen}
            />
        </>
    )
}
