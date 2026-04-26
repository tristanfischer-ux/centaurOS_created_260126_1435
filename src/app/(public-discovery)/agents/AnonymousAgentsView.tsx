/**
 * @file AnonymousAgentsView.tsx
 *
 * @description Server component that renders the unauthenticated /agents
 * landing surface per RED-TEAM-PIVOT-PLAN Tier 2 step 16. Mirrors the
 * pattern from AnonymousInvestorsView (commit 4ca0f085).
 *
 * The visitor sees:
 * 1. Anonymous banner ("You are browsing anonymously")
 * 2. Council tier picker: Quick / Full / Deep / Strategy. Quick is visible;
 *    the other three display a lock overlay. Any click on a locked tier opens
 *    the signup wall.
 * 3. A hand-crafted teaser brainstorm transcript (Sage + Fiona discussing
 *    "Should we raise a Series A or extend our runway?") so the visitor sees
 *    real specialist depth before committing.
 * 4. Three blurred meeting cards labelled "Sign up to start your own
 *    brainstorm".
 * 5. Bottom CTA to sign up.
 *
 * Voice rules: no em dashes, British spelling, no emojis, semantic tokens.
 *
 * @security Public — no data fetching; all content is hand-crafted copy.
 */

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { AnonymousAgentsClient } from "./AnonymousAgentsClient"

export function AnonymousAgentsView() {
    return (
        <div className="space-y-8">
            {/* Header */}
            <header className="pb-4 border-b border-border">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-international-orange transition-colors"
                    >
                        <span className="h-2 w-2 rounded-full bg-international-orange" />
                        ForgeOS
                    </Link>
                    <div className="flex items-center gap-3">
                        <Link
                            href="/login"
                            className="text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                        >
                            Sign in
                        </Link>
                        <Link
                            href="/signup?from=agents-anonymous"
                            className="inline-flex items-center gap-1.5 rounded-md bg-international-orange hover:bg-international-orange-hover text-white px-4 py-2 text-xs font-mono font-bold uppercase tracking-widest transition-colors"
                        >
                            Save my work
                            <ArrowRight className="h-3 w-3" />
                        </Link>
                    </div>
                </div>
                <div className="mt-6 flex items-center gap-3 mb-1">
                    <div className="h-8 w-1.5 bg-international-orange rounded-full shadow-[0_0_10px_rgba(255,69,0,0.5)]" />
                    <h1 className="text-2xl font-display font-bold tracking-tight text-foreground">
                        Your Specialist Team
                    </h1>
                </div>
                <p className="text-muted-foreground text-sm font-medium pl-4">
                    13 specialists. Talk to any of them one-on-one, or join a team huddle.
                </p>
            </header>

            {/* Anonymous banner */}
            <section className="rounded-lg border border-international-orange/30 bg-international-orange/[0.06] px-4 py-3 sm:px-5 sm:py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-sm font-semibold text-foreground">
                            You are browsing anonymously.
                        </p>
                        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                            Sign up to save meetings to your private sandbox and run brainstorms against your live company profile. Takes 20 seconds.
                        </p>
                    </div>
                    <Link
                        href="/signup?from=agents-anonymous"
                        className="inline-flex items-center justify-center gap-1.5 rounded-md bg-international-orange hover:bg-international-orange-hover text-white px-4 py-2.5 text-xs font-mono font-bold uppercase tracking-widest transition-colors whitespace-nowrap"
                    >
                        Save my work
                        <ArrowRight className="h-3 w-3" />
                    </Link>
                </div>
            </section>

            {/* Client section: tier picker + teaser transcript + blurred cards + signup wall */}
            <AnonymousAgentsClient />

            {/* Bottom CTA */}
            <section className="rounded-xl border border-international-orange/40 bg-international-orange/[0.08] px-5 py-6 sm:px-8 sm:py-8 text-center space-y-3">
                <h2 className="text-lg sm:text-xl font-display font-semibold text-foreground">
                    Start your own brainstorm
                </h2>
                <p className="text-sm text-muted-foreground max-w-xl mx-auto leading-relaxed">
                    Every meeting arrives with a full transcript, a structured summary, and action items attributed to each specialist. Sign up to run meetings against your live company profile and save them to your private sandbox.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
                    <Link
                        href="/signup?from=agents-anonymous"
                        className="inline-flex items-center justify-center gap-2 rounded-md bg-international-orange hover:bg-international-orange-hover text-white px-6 py-3 text-xs font-mono font-bold uppercase tracking-widest transition-colors min-h-[44px]"
                    >
                        Sign up to run your first meeting
                        <ArrowRight className="h-3 w-3" />
                    </Link>
                    <Link
                        href="/login"
                        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-xs font-mono uppercase tracking-widest transition-colors min-h-[44px]"
                    >
                        Already have an account? Sign in
                    </Link>
                </div>
                <p className="text-[11px] text-muted-foreground pt-1">
                    Free forever, no credit card required. Cancel anytime, never auto-billed.
                </p>
            </section>
        </div>
    )
}
