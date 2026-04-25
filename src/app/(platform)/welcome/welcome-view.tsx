/**
 * WelcomeView — Client component for /welcome.
 *
 * @description First-login landing page. Opens with a hero + short personal
 * letter from Tristan Fischer (Founder), four tiles pointing at the V2
 * sidebar sections (Today / Forge / Cash Burn / Marketplace), a primary CTA
 * to start a new project, and a closing line. Copy follows Tristan's
 * first-person British voice and the in-product "No AI Emphasis" rule
 * (no "AI-powered", "Smart", "Intelligent", etc.).
 *
 * The primary CTA (`Start a new project`) marks the welcome as seen via the
 * `markWelcomeComplete` server action, then routes to `/the-forge-v2/new`.
 * A secondary CTA marks it seen and routes to `/today` for users who'd
 * rather start from their morning brief.
 */

"use client"

import Link from "next/link"
import { useTransition } from "react"
import { useRouter } from "next/navigation"
import {
    ArrowRight,
    CalendarDays,
    Hammer,
    Flame,
    Store,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { markWelcomeComplete } from "@/actions/welcome"

interface WelcomeViewProps {
    /** First name used in the hero eyebrow greeting. Optional. */
    firstName?: string
}

export function WelcomeView({ firstName }: WelcomeViewProps): React.ReactElement {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    const handleStartProject = (): void => {
        startTransition(async () => {
            await markWelcomeComplete()
            router.push("/the-forge-v2/new")
        })
    }

    const handleGoToToday = (): void => {
        startTransition(async () => {
            await markWelcomeComplete()
            // RED-TEAM-PIVOT-PLAN Tier 2 step 17: post-welcome destination
            // is /investors. Founders who skip the new-project tour still
            // land on the killer-feature surface. The handler name kept as
            // `handleGoToToday` for git-blame continuity, scheduled rename
            // when the welcome tour gets its next refresh.
            router.push("/investors")
        })
    }

    return (
        <div className="pb-16">
            {/* ─────────────────────────────────────────────────────── */}
            {/* Hero                                                    */}
            {/* ─────────────────────────────────────────────────────── */}
            <section className="relative overflow-hidden rounded-b-2xl bg-gradient-to-br from-background via-background to-orange-50/40">
                <div className="relative z-10 px-4 sm:px-6 lg:px-12 pt-10 sm:pt-14 lg:pt-20 pb-10 sm:pb-14">
                    <div className="max-w-3xl">
                        <div className="flex items-center gap-3 mb-5">
                            <div className="h-10 w-2 bg-international-orange rounded-full shadow-[0_0_10px_rgba(255,69,0,0.4)]" />
                            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                                {firstName ? `Welcome, ${firstName}` : "Welcome"}
                            </p>
                        </div>
                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground mb-4">
                            Welcome to <span className="text-international-orange">ForgeOS</span>.
                        </h1>
                        <p className="text-lg sm:text-xl text-muted-foreground font-light">
                            A single workspace for planning, building, cash, and selling your hardware products.
                        </p>
                    </div>
                </div>
            </section>

            {/* ─────────────────────────────────────────────────────── */}
            {/* Short letter from Tristan                               */}
            {/* ─────────────────────────────────────────────────────── */}
            <section className="px-4 sm:px-6 lg:px-12 pt-10 lg:pt-14">
                <div className="max-w-2xl space-y-5 text-base sm:text-[17px] leading-relaxed text-foreground">
                    <p className="font-medium">Welcome. I&apos;m Tristan Fischer.</p>
                    <p>
                        I&apos;ve spent 26 years running startups — software and hardware — most
                        recently Fischer Farms, one of the UK&apos;s larger vertical farms.
                        ForgeOS is the wish list of everything I could have had along the way:
                        one place to plan the company, design the product, track the cash, and
                        meet the suppliers who&apos;ll build it with you.
                    </p>
                    <p>
                        Here are the four doors into the workspace. Open the one that matches
                        what&apos;s in front of you today.
                    </p>
                </div>
            </section>

            {/* ─────────────────────────────────────────────────────── */}
            {/* Four V2 section tiles                                   */}
            {/* ─────────────────────────────────────────────────────── */}
            <section className="px-4 sm:px-6 lg:px-12 pt-10 lg:pt-12">
                <div className="max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                    <SectionTile
                        icon={CalendarDays}
                        label="Today"
                        description="What's on your plate — tasks, risks, wins, and the calendar for the day — in one morning brief."
                        href="/today"
                        ctaLabel="Open Today"
                    />
                    <SectionTile
                        icon={Hammer}
                        label="Forge"
                        description="Plan, build, and ship your hardware products. Architecture, Bill of Materials, suppliers, revisions — all in one project."
                        href="/the-forge-v2"
                        ctaLabel="Open the Forge"
                    />
                    <SectionTile
                        icon={Flame}
                        label="Cash Burn"
                        description="Your runway on a single screen. Drop in your finance spreadsheet to see scenarios, the line items eating your cash, and when you&rsquo;ll need to raise."
                        href="/cash-burn"
                        ctaLabel="Open Cash Burn"
                    />
                    <SectionTile
                        icon={Store}
                        label="Marketplace"
                        description="Sell through Fractional Forge. List your products and services, take quote requests, and manage orders with UK founders and suppliers."
                        href="/marketplace"
                        ctaLabel="Open the Marketplace"
                    />
                </div>
            </section>

            {/* ─────────────────────────────────────────────────────── */}
            {/* Primary CTA                                             */}
            {/* ─────────────────────────────────────────────────────── */}
            <section className="px-4 sm:px-6 lg:px-12 pt-10 lg:pt-14">
                <div className="max-w-3xl">
                    <Card className="border-2 border-international-orange/20 bg-gradient-to-br from-background to-international-orange/[0.04]">
                        <CardContent className="pt-6 pb-6">
                            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">
                                Start here
                            </p>
                            <h2 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight mb-2">
                                Start a new project in the Forge.
                            </h2>
                            <p className="text-base text-muted-foreground leading-relaxed mb-5 max-w-2xl">
                                Describe your product in a paragraph. The Forge returns a
                                system architecture, a module decomposition, a skeleton Bill of
                                Materials, and a design report — before lunch.
                            </p>
                            <div className="flex flex-wrap gap-3">
                                <Button
                                    onClick={handleStartProject}
                                    disabled={isPending}
                                    size="lg"
                                    className="gap-2"
                                >
                                    Start a new project
                                    <ArrowRight className="h-4 w-4" />
                                </Button>
                                <Button
                                    onClick={handleGoToToday}
                                    disabled={isPending}
                                    variant="ghost"
                                    size="lg"
                                >
                                    See investors who would back you instead
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </section>

            {/* ─────────────────────────────────────────────────────── */}
            {/* Closing                                                 */}
            {/* ─────────────────────────────────────────────────────── */}
            <section className="px-4 sm:px-6 lg:px-12 pt-14 lg:pt-16 max-w-2xl">
                <p className="text-base sm:text-lg text-foreground mb-2">
                    Have a look around, and let me know how you get on.
                </p>
                <p className="font-semibold text-foreground">— Tristan</p>
                <p className="text-sm text-muted-foreground">Founder, Fractional Forge</p>
            </section>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────

interface SectionTileProps {
    icon: React.ComponentType<{ className?: string }>
    label: string
    description: string
    href: string
    ctaLabel: string
}

function SectionTile({
    icon: Icon,
    label,
    description,
    href,
    ctaLabel,
}: SectionTileProps): React.ReactElement {
    return (
        <Card className="border-border hover:border-international-orange/30 hover:-translate-y-0.5 transition-all duration-200">
            <CardContent className="pt-6 pb-6 h-full flex flex-col">
                <div className="flex items-start gap-4 mb-4">
                    <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-orange-50 shrink-0">
                        <Icon className="h-5 w-5 text-international-orange" />
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight pt-1">
                        {label}
                    </h3>
                </div>
                <p className="text-base text-foreground leading-relaxed mb-5 flex-1">
                    {description}
                </p>
                <Link
                    href={href}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-international-orange hover:text-international-orange-hover transition-colors"
                >
                    {ctaLabel}
                    <ArrowRight className="h-4 w-4" />
                </Link>
            </CardContent>
        </Card>
    )
}
