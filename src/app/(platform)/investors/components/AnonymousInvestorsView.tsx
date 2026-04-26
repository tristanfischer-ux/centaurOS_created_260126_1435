/**
 * @file AnonymousInvestorsView.tsx
 *
 * @description Server component that renders the unauthenticated /investors
 * landing surface. The visitor sees:
 *   1. A minimal anonymous header with ForgeOS brand and nav links.
 *   2. A sentinel-context banner explaining the example profile.
 *   3. 10 fully-rendered hand-curated match cards (no blurred cards, no wall
 *      during the scroll). Each card has a solid-orange EXAMPLE pill.
 *   4. A two-route wall after the 10th card — sign up OR refer a friend.
 *      Both routes are first-class options, neither is dimmed.
 *   5. The search box stays visible; typing + submitting opens the same
 *      two-route wall because real-time search requires the live pipeline.
 *
 * Copy voice: British spelling, no em dashes, no emojis, first-person,
 * semantic design tokens, light theme. Failure-mode framing avoided — the
 * wall headline is "Want your own matches?", not "You've run out of free
 * views".
 *
 * @security Public — renders only hand-curated sentinel content. No real
 * foundry data, no auth-gated fields. Contacts and deep-dive profiles stay
 * behind auth.
 */

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import type { AnonymousInvestorsTeaser } from "@/actions/investors"
import { AnonymousInvestorsClient } from "./AnonymousInvestorsClient"
import { ANONYMOUS_TEASER_CARDS, SENTINEL_CONTEXT } from "@/lib/investors/anonymous-teaser-matches"

interface AnonymousInvestorsViewProps {
    teaser: AnonymousInvestorsTeaser
}

export function AnonymousInvestorsView({ teaser }: AnonymousInvestorsViewProps) {
    const { totalFirms } = teaser

    return (
        <div className="space-y-8">
            {/* Header — minimal anonymous shell. No sidebar on this route group
              * so this header doubles as the page identifier and top nav. */}
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
                            href="/signup?from=investors-anonymous"
                            className="inline-flex items-center gap-1.5 rounded-md bg-international-orange hover:bg-international-orange-hover text-white px-4 py-2 text-xs font-mono font-bold uppercase tracking-widest transition-colors"
                        >
                            Start free
                            <ArrowRight className="h-3 w-3" />
                        </Link>
                    </div>
                </div>
                <div className="mt-6 flex items-center gap-3 mb-1">
                    <div className="h-8 w-1.5 bg-international-orange rounded-full shadow-[0_0_10px_rgba(255,69,0,0.5)]" />
                    <h1 className="text-2xl font-display font-bold tracking-tight text-foreground">
                        Investors
                    </h1>
                </div>
                <p className="text-muted-foreground text-sm font-medium pl-4">
                    {totalFirms > 0
                        ? `${totalFirms.toLocaleString()} investors. Ten example matches below. Sign up to run your own.`
                        : "Find the investors who actually fund your sector and stage."}
                </p>
            </header>

            {/* Sentinel context banner — makes clear these are illustrative matches
              * drafted against a sample profile, not a real one. */}
            <section className="rounded-lg bg-muted/40 px-4 py-3 text-xs sm:text-sm">
                <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Example profile.</span>{" "}
                    The matches below were drafted for a sample{" "}
                    <span className="font-medium text-foreground">{SENTINEL_CONTEXT.stage}</span>{" "}
                    <span className="font-medium text-foreground">{SENTINEL_CONTEXT.sector}</span>{" "}
                    founder with{" "}
                    <span className="font-medium text-foreground">{SENTINEL_CONTEXT.traction}</span>
                    . Sign up to run the same view against your real profile.
                </p>
            </section>

            {/* Client section: search box + 10 curated cards + two-route wall.
              * All interactivity and state lives here — the server component
              * stays free of "use client". */}
            <AnonymousInvestorsClient teaserCards={ANONYMOUS_TEASER_CARDS} />
        </div>
    )
}
