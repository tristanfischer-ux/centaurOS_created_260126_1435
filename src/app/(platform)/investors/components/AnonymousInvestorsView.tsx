/**
 * @file AnonymousInvestorsView.tsx
 *
 * @description Server component that renders the unauthenticated /investors
 * landing surface per RED-TEAM-PIVOT-PLAN Tier 2 steps 13-15. The visitor
 * sees a 2-line "save my work" banner, a fully-rendered teaser match card
 * for a curated investor (Planet A by default), four blurred locked cards
 * for the rest, and a strong signup CTA. Any meaningful interaction (search
 * submit, locked card click, draft email click) opens the signup wall modal
 * framed as "save this to your private sandbox".
 *
 * Owns no data fetching itself — the page-level loader hands in the teaser
 * bundle from getAnonymousInvestorsTeaser() so the server component can
 * stay synchronous and easy to read.
 *
 * @security Public — renders only public-by-design fields (firm title,
 * sector, stage, cheque range). Contacts, deep tier-gated fields, and the
 * directory deep dive (/investors/[id]) all stay behind auth.
 */

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import type { AnonymousInvestorsTeaser } from "@/actions/investors"
import { AnonymousInvestorsClient } from "./AnonymousInvestorsClient"

interface AnonymousInvestorsViewProps {
    teaser: AnonymousInvestorsTeaser
}

export function AnonymousInvestorsView({ teaser }: AnonymousInvestorsViewProps) {
    const { teaserFirm, teaserMatchOutput, blurredFirms, sentinelContext, totalFirms } = teaser

    return (
        <div className="space-y-8">
            {/* Header — minimal anonymous shell, no sidebar so the page header
              * doubles as the page identifier. */}
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
                            Save my work
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
                        ? `${totalFirms.toLocaleString()} investors. One example match below, the rest open up after signup.`
                        : "Find the investors who actually fund your sector and stage."}
                </p>
            </header>

            {/* Anonymous banner — the "save my work" framing per Tier 2 step 14.
              * Honest, two-line, leads with what the visitor can DO next. */}
            <section className="rounded-lg border border-international-orange/30 bg-international-orange/[0.06] px-4 py-3 sm:px-5 sm:py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-sm font-semibold text-foreground">
                            You are browsing anonymously.
                        </p>
                        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                            Sign up to save searches and run your own against your live foundry profile. Takes 20 seconds.
                        </p>
                    </div>
                    <Link
                        href="/signup?from=investors-anonymous"
                        className="inline-flex items-center justify-center gap-1.5 rounded-md bg-international-orange hover:bg-international-orange-hover text-white px-4 py-2.5 text-xs font-mono font-bold uppercase tracking-widest transition-colors whitespace-nowrap"
                    >
                        Save my work
                        <ArrowRight className="h-3 w-3" />
                    </Link>
                </div>
            </section>

            {/* Sentinel context line — this is the foundry profile the teaser
              * was generated against, made visible so the founder understands
              * the example is not random and can map their own profile to it. */}
            <section className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-xs sm:text-sm">
                <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Example profile.</span>{" "}
                    The match below was generated for a sample{" "}
                    <span className="font-medium text-foreground">{sentinelContext.stage}</span>{" "}
                    <span className="font-medium text-foreground">{sentinelContext.sector}</span>{" "}
                    founder with{" "}
                    <span className="font-medium text-foreground">{sentinelContext.traction}</span>
                    . Once you sign up, the page rebuilds the same view against your real foundry profile.
                </p>
            </section>

            {/* Client section: search box + signup wall modal + teaser card +
              * blurred cards. All interactivity lives here so the server
              * component can stay free of "use client". */}
            <AnonymousInvestorsClient
                teaserFirm={teaserFirm}
                teaserMatchOutput={teaserMatchOutput}
                blurredFirms={blurredFirms}
            />

            {/* Bottom CTA — stronger version of the top banner, after the
              * founder has read the teaser and decided whether they want
              * the rest of the matches against their own profile. */}
            <section className="rounded-xl border border-international-orange/40 bg-international-orange/[0.08] px-5 py-6 sm:px-8 sm:py-8 text-center space-y-3">
                <h2 className="text-lg sm:text-xl font-display font-semibold text-foreground">
                    See the rest of your matches
                </h2>
                <p className="text-sm text-muted-foreground max-w-xl mx-auto leading-relaxed">
                    Every investor in your shortlist arrives with a why-fit paragraph, a how-to-pitch line, and a drafted opening email. Sign up to run the search against your live profile, save it to your private sandbox, and start outreach.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
                    <Link
                        href="/signup?from=investors-anonymous"
                        className="inline-flex items-center justify-center gap-2 rounded-md bg-international-orange hover:bg-international-orange-hover text-white px-6 py-3 text-xs font-mono font-bold uppercase tracking-widest transition-colors min-h-[44px]"
                    >
                        Sign up to see your matches
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
