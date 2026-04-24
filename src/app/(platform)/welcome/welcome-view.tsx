/**
 * WelcomeView — Client component for /welcome.
 *
 * @description First-login tour page. Opens with a hero + personal letter
 * from Tristan Fischer (Founder), a "Try these three in your first hour"
 * card with the primary CTA, a guided tour of every platform section with
 * its killer drop-in/output move, the 13-specialist roster, and a closing
 * CTA. Copy follows Tristan's first-person British voice and avoids the
 * "No AI Emphasis" phrases (no "AI-powered", "Smart", "Intelligent", etc.).
 *
 * The primary CTA (`Take me to Today`) marks the welcome as seen via the
 * `markWelcomeComplete` server action, then routes to `/today`.
 */

"use client"

import Link from "next/link"
import { useTransition } from "react"
import { useRouter } from "next/navigation"
import {
    ArrowRight,
    Waypoints,
    Flame,
    Hammer,
    Store,
    UserSearch,
    CalendarDays,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { markWelcomeComplete } from "@/actions/welcome"

const SPECIALISTS: ReadonlyArray<{ name: string; role: string }> = [
    { name: "Sage", role: "Strategy" },
    { name: "Max", role: "CTO" },
    { name: "Jian", role: "VP Engineering" },
    { name: "Priya", role: "Product" },
    { name: "Fang", role: "VP Manufacturing" },
    { name: "Chase", role: "VP Supply Chain" },
    { name: "Mia", role: "Growth" },
    { name: "Sal", role: "Sales" },
    { name: "Cal", role: "Chief of Staff" },
    { name: "Finn", role: "Finance" },
    { name: "Fiona", role: "Fundraising" },
    { name: "Harper", role: "People" },
    { name: "Leo", role: "Legal" },
]

interface WelcomeViewProps {
    /** First name used in the hero eyebrow greeting. Optional. */
    firstName?: string
}

export function WelcomeView({ firstName }: WelcomeViewProps): React.ReactElement {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    const handleContinue = (): void => {
        startTransition(async () => {
            await markWelcomeComplete()
            // DECISION 2026-04-24: post-pivot landing is /agents (Brainstorming).
            // Full Welcome-page rebuild in Phase B will update labels + CTA copy.
            router.push("/agents")
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
                            The operating system for hardware startups.
                        </p>
                    </div>
                </div>
            </section>

            {/* ─────────────────────────────────────────────────────── */}
            {/* Letter from Tristan                                     */}
            {/* ─────────────────────────────────────────────────────── */}
            <section className="px-4 sm:px-6 lg:px-12 pt-10 lg:pt-14">
                <div className="max-w-2xl space-y-5 text-base sm:text-[17px] leading-relaxed text-foreground">
                    <p className="font-medium">Welcome. I&apos;m Tristan Fischer.</p>
                    <p>
                        I&apos;ve spent 26 years running startups — software and hardware —
                        most recently Fischer Farms, one of the UK&apos;s larger vertical farms.
                        ForgeOS is the wish list of everything I could have had along the way.
                    </p>
                    <p>
                        A software founder builds one thing: the product. A hardware founder
                        builds two — the product, and all the infrastructure to make it.
                        Finding a factory. Negotiating leases. Procuring equipment. Hiring the
                        people to run it. Eighteen months can disappear before you&apos;ve shipped
                        anything, and by then your design team has iterated past whatever
                        equipment you bought.
                    </p>
                    <p>
                        Hardware has never had an AWS. Every founder reinvents the same wheels
                        — engineers, investors, IP, finance — all pre-revenue, all without the
                        budget. ForgeOS is my attempt to change that. What follows is a tour of
                        each area, and the exact moment you&apos;ll start saving time in it.
                    </p>
                    <div className="pt-2">
                        <p className="font-semibold text-foreground">— Tristan</p>
                        <p className="text-sm text-muted-foreground">Founder, Fractional Forge</p>
                    </div>
                </div>
            </section>

            {/* ─────────────────────────────────────────────────────── */}
            {/* First hour card + primary CTA                           */}
            {/* ─────────────────────────────────────────────────────── */}
            <section className="px-4 sm:px-6 lg:px-12 pt-10 lg:pt-14">
                <div className="max-w-3xl">
                    <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-5">
                        Try these three in your first hour
                    </p>
                    <Card className="border-2 border-international-orange/20 bg-gradient-to-br from-background to-international-orange/[0.04]">
                        <CardContent className="pt-6 pb-6 space-y-5">
                            <FirstHourStep
                                number={1}
                                title="Paste your business plan into Strategy."
                                body="Ten minutes later you have a full strategic tree — pillars, objectives, measurable KPIs, and atomic tasks — every objective linked to a line on your cashflow."
                            />
                            <FirstHourStep
                                number={2}
                                title="Drop your finance spreadsheet into Cash Burn."
                                body="It auto-categorises spend, flags anomalies, and returns three cashflow scenarios — Base, Optimistic, Pessimistic — with runway projections."
                            />
                            <FirstHourStep
                                number={3}
                                title="Write one paragraph about your product in The Forge."
                                body="You'll get a system architecture, a module decomposition, a skeleton Bill of Materials, reference images of each module, and a design report — before lunch."
                            />
                        </CardContent>
                    </Card>
                    <div className="mt-6 flex flex-wrap gap-3">
                        <Button
                            onClick={handleContinue}
                            disabled={isPending}
                            size="lg"
                            className="gap-2"
                        >
                            Take me to Today
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="lg" asChild>
                            <a href="#tour">Keep reading the tour</a>
                        </Button>
                    </div>
                </div>
            </section>

            <div id="tour" className="scroll-mt-8" />

            {/* ─────────────────────────────────────────────────────── */}
            {/* Section deep-dives                                      */}
            {/* ─────────────────────────────────────────────────────── */}
            <section className="px-4 sm:px-6 lg:px-12 pt-14 lg:pt-16 space-y-6 lg:space-y-8 max-w-4xl">
                <SectionBlock
                    icon={Waypoints}
                    label="Plan"
                    subtitle="Strategy, objectives, tasks, intelligence"
                    startHref="/strategy"
                    startLabel="Start in Strategy"
                    intro="Paste your business plan. Sage, your Strategy specialist, builds you a strategic tree — pillars, objectives, milestones, atomic tasks. Every objective links to a measurable outcome and a line on your cashflow, so you can see which objective is eating which £ of runway."
                    rows={[
                        [
                            "Objectives",
                            "Write one sentence; Sage returns success criteria, KPIs, dependencies, and the right specialist to own it.",
                        ],
                        [
                            "Tasks",
                            "Objectives auto-decompose into 1–3 day atomic work, scheduled against your team's historical velocity. It tells you “this objective needs one more engineer to ship on time” before you burn six weeks finding that out.",
                        ],
                        [
                            "Review",
                            "One-click weekly review — progress, blockers, wins, all-hands talking points, auto-drafted.",
                        ],
                        [
                            "Reports",
                            "Quarterly retrospectives, trend analysis, and pattern discovery across everything you've shipped.",
                        ],
                        [
                            "Red Team",
                            "Describe a decision — pricing, pivot, market entry. Five distinct perspectives (Bull, Bear, Realist, Disruptor, Wildcard) debate it across four rounds. The output isn't an argument, it's the single assumption your decision hinges on that you haven't tested yet.",
                        ],
                        [
                            "Knowledge",
                            "Drop in your past decks, emails, and docs. Every specialist afterwards references them automatically. You stop explaining your company from scratch.",
                        ],
                    ]}
                />
                <SectionBlock
                    icon={Flame}
                    label="Cash Burn"
                    subtitle="Your runway, and what changes it"
                    startHref="/cash-burn"
                    startLabel="Start in Cash Burn"
                    intro="Drop in your finance spreadsheet or QuickBooks export. Cash Burn auto-categorises spend, flags anomalies, and generates three cashflow scenarios with burn-down projections. When your runway drops below 60 days, it automatically creates a “Fundraising Required” task with the exact numbers you'll need."
                    rows={[
                        [
                            "Cash Out",
                            "Watches your spend and flags where you're paying well above market rate.",
                        ],
                        [
                            "Cash In",
                            "Extracts deal terms from your revenue log and shows when actual income drifts from forecast.",
                        ],
                        [
                            "P&L",
                            "Gross margin, operating margin, CAC payback, LTV:CAC, and your live path to breakeven, in one view.",
                        ],
                        [
                            "Investors",
                            "Your sector, stage, and target matched against 600 UK VC and PE firms. Filter “early-stage, food tech, UK” in plain English. Fiona, your Fundraising specialist, pulls each investor's portfolio and recent activity into every outreach brief.",
                        ],
                        [
                            "Fundraise",
                            "Fiona generates your fundraising playbook — outreach sequence, templates, diligence tracker, valuation model. Edit once, deploy across the whole list.",
                        ],
                    ]}
                />
                <SectionBlock
                    icon={Hammer}
                    label="Workshop"
                    subtitle="From idea to manufactured product"
                    startHref="/the-forge-v2"
                    startLabel="Start in The Forge"
                    intro="Type your product idea in one paragraph. Max, your CTO specialist, returns a system architecture diagram, a module decomposition (your product broken into 5–8 functional modules, each with its interface contract), a skeleton Bill of Materials, reference images of each module, and a design report with research, risks, and next steps."
                    rows={[
                        [
                            "Build",
                            "Jian, your VP Engineering specialist, generates detailed CAD specs, tolerance stack-ups, manufacturing process recommendations, and cost-per-unit estimates from live supplier quotes.",
                        ],
                        [
                            "Assemble",
                            "Fang, your VP Manufacturing specialist, returns assembly method sheets, tooling lists, and labour-hour estimates.",
                        ],
                        [
                            "Procurement",
                            "Chase, your VP Supply Chain specialist, searches hundreds of thousands of parts, auto-fills supplier quotes, flags long lead times, and ranks suppliers on reliability and price. If a supplier's lead time misses your launch window, it tells you — with alternatives already queued.",
                        ],
                        [
                            "Parts & BOM",
                            "Auto-generated, filterable by cost, lead time, supplier, risk. Export to CSV.",
                        ],
                        [
                            "Products",
                            "Create variants — Standard, Pro, SKU-by-SKU — and it re-runs the BOM and cost model for each.",
                        ],
                        [
                            "Browse & Inspiration",
                            "Manufacturing playbooks (injection moulding, PCB assembly, 3D printing) and curated learning paths tied to whatever stage you're at.",
                        ],
                    ]}
                    footnote="IP-sensitive? Mark the project, and designs never touch shared storage."
                />
                <SectionBlock
                    icon={Store}
                    label="Marketplace"
                    subtitle="Factories, suppliers, quotes"
                    startHref="/marketplace"
                    startLabel="Start in the Marketplace"
                    intro="Your BOM and specs go in. Matched suppliers come out. The Marketplace connects you to UK factories and vendors that already have the premises, the equipment, and the people — many with capacity they'd like to fill. Ranked shortlists for PCB assembly, injection moulding, 3D printing, testing labs, and fulfilment."
                    rows={[
                        [
                            "Quotes",
                            "Paste or generate. The system flags “Quote A is 30% cheaper but 6-week lead vs Quote B's 2-week” and recommends against your launch date.",
                        ],
                        [
                            "Orders",
                            "Every order in one place, auto-synced with supplier status, with delay alerts.",
                        ],
                    ]}
                />
                <SectionBlock
                    icon={UserSearch}
                    label="Recruits"
                    subtitle="Fractional executives and specialist hires"
                    startHref="/recruits"
                    startLabel="Start in Recruits"
                    intro="Describe the hole in your team. Harper, your People specialist, returns a matched list from a pool of fractional executives and full-time candidates, with job descriptions, interview questions, and a culture-fit checklist. If you need PCB engineering experience, Harper surfaces candidates with exactly that background and their portfolio."
                    rows={[]}
                />
                <SectionBlock
                    icon={CalendarDays}
                    label="Me"
                    subtitle="Your calendar, focus, daily brief"
                    startHref="/today"
                    startLabel="Start in Today"
                    intro="Your personal command deck — everything tied to what you need to do next."
                    rows={[
                        [
                            "Today",
                            "Your Morning Brief. Calendar, objectives, yesterday's wins, at-risk items. Ninety seconds, no manual status reporting.",
                        ],
                        [
                            "My Profile",
                            "Integrations, calendar sync, focus time blocked back to your calendar.",
                        ],
                        [
                            "Comms",
                            "A single feed of every meaningful change across your company — people, funding, product, orders.",
                        ],
                    ]}
                />
            </section>

            {/* ─────────────────────────────────────────────────────── */}
            {/* Specialists roster                                      */}
            {/* ─────────────────────────────────────────────────────── */}
            <section className="px-4 sm:px-6 lg:px-12 pt-14 lg:pt-16 max-w-4xl">
                <div className="flex items-center gap-3 mb-5">
                    <div className="h-8 w-1.5 bg-international-orange rounded-full" />
                    <h2 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
                        Your team of 13 specialists
                    </h2>
                </div>
                <p className="text-base text-muted-foreground mb-6 max-w-2xl leading-relaxed">
                    Each one is available from every section. Call them individually, or run a
                    30-minute huddle with any combination to workshop a problem. Post-meeting,
                    tasks auto-assign.
                </p>
                <Card className="border-border">
                    <CardContent className="pt-6 pb-6">
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
                            {SPECIALISTS.map((s) => (
                                <div key={s.name} className="flex items-baseline gap-2">
                                    <span className="text-sm font-semibold text-foreground">
                                        {s.name}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        — {s.role}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </section>

            {/* ─────────────────────────────────────────────────────── */}
            {/* Closing + final CTA                                     */}
            {/* ─────────────────────────────────────────────────────── */}
            <section className="px-4 sm:px-6 lg:px-12 pt-14 lg:pt-16 max-w-2xl">
                <p className="text-base sm:text-lg text-foreground mb-2">
                    Have a look around, and let me know how you get on.
                </p>
                <p className="font-semibold text-foreground">— Tristan</p>
                <p className="text-sm text-muted-foreground mb-8">Founder, Fractional Forge</p>
                <Button
                    onClick={handleContinue}
                    disabled={isPending}
                    size="lg"
                    className="gap-2"
                >
                    Take me to Today
                    <ArrowRight className="h-4 w-4" />
                </Button>
            </section>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────

function FirstHourStep({
    number,
    title,
    body,
}: {
    number: number
    title: string
    body: string
}): React.ReactElement {
    return (
        <div className="flex gap-4">
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-orange-50 text-international-orange font-semibold text-sm shrink-0">
                {number}
            </div>
            <div>
                <p className="text-base font-semibold text-foreground mb-1">{title}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
            </div>
        </div>
    )
}

interface SectionBlockProps {
    icon: React.ComponentType<{ className?: string }>
    label: string
    subtitle: string
    intro: string
    rows: ReadonlyArray<readonly [string, string]>
    startHref: string
    startLabel: string
    footnote?: string
}

function SectionBlock({
    icon: Icon,
    label,
    subtitle,
    intro,
    rows,
    startHref,
    startLabel,
    footnote,
}: SectionBlockProps): React.ReactElement {
    return (
        <Card className="border-border hover:border-international-orange/30 transition-colors duration-200">
            <CardContent className="pt-6 pb-6">
                <div className="flex items-start gap-4 mb-4">
                    <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-orange-50 shrink-0">
                        <Icon className="h-5 w-5 text-international-orange" />
                    </div>
                    <div>
                        <h3 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
                            {label}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
                    </div>
                </div>
                <p className="text-base text-foreground leading-relaxed mb-5">{intro}</p>
                {rows.length > 0 && (
                    <div className="space-y-3 mb-5">
                        {rows.map(([name, body]) => (
                            <div key={name} className="text-sm text-foreground">
                                <span className="font-semibold">{name}.</span>{" "}
                                <span className="text-muted-foreground leading-relaxed">
                                    {body}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
                {footnote && (
                    <p className="text-sm text-muted-foreground italic mb-5">{footnote}</p>
                )}
                <Link
                    href={startHref}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-international-orange hover:text-international-orange-hover transition-colors"
                >
                    {startLabel}
                    <ArrowRight className="h-4 w-4" />
                </Link>
            </CardContent>
        </Card>
    )
}
