'use client'

/**
 * @file handoff-card.tsx
 *
 * @description Rich handoff suggestion card with specialist avatar,
 * reason for the handoff, and a prominent CTA.
 */

import Image from 'next/image'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Specialist } from '@/app/(platform)/agents/specialists-data'

interface HandoffCardProps {
    /** The specialist being recommended */
    suggested: Specialist
    /** Why this specialist is recommended */
    reason: string
    /** Number of messages in current conversation */
    messageCount?: number
    /** Called when user clicks "Continue with..." */
    onContinue: () => void
    /** Called when user clicks "Stay here" */
    onStay: () => void
    className?: string
}

/**
 * Renders a rich handoff suggestion card.
 */
export function HandoffCard({
    suggested,
    reason,
    messageCount = 0,
    onContinue,
    onStay,
    className,
}: HandoffCardProps) {
    return (
        <div
            className={cn(
                'rounded-xl bg-international-orange/10 border border-international-orange/20 p-4',
                'animate-in slide-in-from-bottom-2 duration-300',
                className,
            )}
        >
            <div className="flex items-start gap-3">
                <div className="flex-shrink-0 relative h-10 w-10 rounded-full overflow-hidden bg-muted">
                    {suggested.avatarImage ? (
                        <Image
                            src={suggested.avatarImage}
                            alt={suggested.name}
                            fill
                            unoptimized
                            className="object-cover"
                            sizes="40px"
                        />
                    ) : (
                        <div className="flex items-center justify-center h-full w-full">
                            <span className="text-sm font-display font-semibold text-foreground">
                                {suggested.name.charAt(0)}
                            </span>
                        </div>
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">
                        {suggested.name}
                        <span className="text-xs font-normal text-muted-foreground ml-1.5">
                            {suggested.title}
                        </span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        {reason}
                    </p>
                    {messageCount > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                            Will transfer: {messageCount} message{messageCount !== 1 ? 's' : ''} of context
                        </p>
                    )}
                    <div className="flex items-center gap-2 mt-3">
                        <Button
                            size="sm"
                            onClick={onContinue}
                            className="bg-international-orange hover:bg-international-orange-hover text-white gap-1.5"
                        >
                            Continue with {suggested.name}
                            <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onStay}
                            className="text-muted-foreground"
                        >
                            Stay here
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
