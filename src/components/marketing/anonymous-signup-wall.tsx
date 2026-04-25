/**
 * @file anonymous-signup-wall.tsx
 *
 * @description Reusable signup wall modal for anonymous landing surfaces.
 * Used by /investors, /agents, and /the-forge-v2 anonymous landings per
 * RED-TEAM-PIVOT-PLAN Tier 2 steps 14-16.
 *
 * The modal is framed as "save this to your private sandbox" rather than
 * "you must sign up to continue". The close action is always "skip and keep
 * browsing" so the visitor never feels trapped.
 *
 * Voice rules: no em dashes, British spelling, semantic tokens, no emojis,
 * positive framing, specific numbers over adjectives.
 *
 * @security Public — no auth dependency.
 */

"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"

export interface SignupWallCopy {
    title: string
    body: string
}

interface AnonymousSignupWallProps {
    /** Whether the dialog is open. */
    open: boolean
    /** Called when the dialog open state changes. */
    onOpenChange: (open: boolean) => void
    /** Copy to show inside the dialog. */
    copy: SignupWallCopy
    /**
     * The href for the primary CTA. Typically /signup?from=<source>
     * with optional extra query params (e.g. ?q=typed-query).
     */
    signupHref: string
    /** Label for the primary CTA button. */
    ctaLabel?: string
}

/**
 * Signup wall modal shared by anonymous landing surfaces (/agents,
 * /the-forge-v2, /investors). Caller controls open state and copy;
 * the modal handles layout and CTA.
 */
export function AnonymousSignupWall({
    open,
    onOpenChange,
    copy,
    signupHref,
    ctaLabel = "Save to my private sandbox",
}: AnonymousSignupWallProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-base sm:text-lg font-semibold tracking-tight">
                        {copy.title}
                    </DialogTitle>
                    <DialogDescription className="text-sm leading-relaxed text-muted-foreground pt-1">
                        {copy.body}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 pt-2">
                    <Button
                        asChild
                        className="w-full bg-international-orange hover:bg-international-orange-hover text-white"
                    >
                        <Link href={signupHref}>
                            {ctaLabel}
                            <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                        </Link>
                    </Button>
                    <button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors min-h-[44px]"
                    >
                        Or skip and keep browsing
                    </button>
                    <p className="text-[11px] text-center text-muted-foreground pt-1">
                        Free forever, no credit card required. Takes 20 seconds.
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    )
}
