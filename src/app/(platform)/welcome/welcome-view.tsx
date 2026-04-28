/**
 * WelcomeView — Client component for /welcome.
 *
 * @description First-login tour page rebuilt 2026-04-25 for the post-pivot
 * product: Brainstorming-led, Fundraising-focused, with a trimmed sidebar
 * (Brainstorming · Fundraising · Workshop · Marketplace).
 *
 * Structure: hero + personal letter from Tristan → "Try these three in
 * your first hour" card pointing at brainstorm/investors/forge → guided
 * tour of the four current sidebar sections with their canonical
 * drop-in/output → trimmed roster of the four key leaders (Fang, Chase,
 * Fiona, Sage) with a link to all 13 → closing CTA.
 *
 * Copy follows Tristan's first-person British voice and the in-product
 * "No AI Emphasis" rule — no "AI-powered", "Smart", "Intelligent",
 * AI-agent counts, robot/brain icons. Specialists are referred to as
 * "specialists", never "AI agents".
 *
 * The primary CTA marks the welcome as seen via the `markWelcomeComplete`
 * server action, then routes to `/agents` (the Brainstorming page —
 * post-pivot default landing).
 */

"use client"

import Link from "next/link"
import { useTransition } from "react"
import { useRouter } from "next/navigation"
import {
    ArrowRight,
    Sparkles,
    Building2,
    Hammer,
    Store,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { markWelcomeComplete } from "@/actions/welcome"

// INTENT: Trimmed roster — the four key leaders the founder will speak to most
// in the post-pivot product. Forge pole (Fang + Chase) + Investors pole (Fiona)
// + Strategy glue (Sage). All 13 still live at /agents.
const KEY_LEADERS: ReadonlyArray<{ name: string; role: string; reason: string }> = [
    { name: "Sage", role: "Strategy", reason: "Frames every brainstorm and stress-tests big calls." },
    { name: "Fang", role: "VP Manufacturing", reason: "Picks the manufacturing route and the cost ceiling." },
    { name: "Chase", role: "VP Supply Chain", reason: "Finds the suppliers and ranks them on price + lead time." },
    { name: "Fiona", role: "Fundraising", reason: "Matches you to investors and writes the outreach." },
]

interface WelcomeViewProps {
    /** First name used in the hero eyebrow greeting. Optional. */
    firstName?: string
    /** When true, the foundry profile is missing — show the profile setup prompt. */
    foundryProfileMissing?: boolean
}

export function WelcomeView({ firstName, foundryProfileMissing = false }: WelcomeViewProps): React.ReactElement {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    const handleContinue = (): void => {
        startTransition(async () => {
            await markWelcomeComplete()
            // 2026-04-24: post-pivot landing is /agents (Brainstorming).
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
                    <p className="font-medium">{"Welcome. I’m Tristan Fischer."}</p>
                    <p>
                        {"I’ve spent 26 years running startups — software and hardware — most recently Fischer Farms, one of the UK’s larger vertical farms. ForgeOS is the wish list of everything I could have had along the way."}
                    </p>
                    <p>
                        {"A software founder builds one thing: the product. A hardware founder builds two — the product, and all the infrastructure to make it. Finding a factory. Negotiating leases. Procuring equipment. Hiring the people to run it. Eighteen months can disappear before you’ve shipped anything."}
                    </p>
                    <p>
                        {"ForgeOS gives you a team of 13 specialists, an investor database of 600 UK funds, and a workspace that turns a paragraph about your product into a system architecture. Use it to think out loud, find capital, and actually build the thing."}
                    </p>
                    <div className="pt-2">
                        <p className="font-semibold text-foreground">{"— Tristan"}</p>
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
                                title={"Brainstorm something you’re stuck on."}
                                body={"Pick one of the eight idea prompts on the Brainstorming page, or type your own. Sage and three other specialists run the conversation, ask good questions, and leave you with the next step instead of more reading."}
                            />
                            <FirstHourStep
                                number={2}
                                title="Search the investor database."
                                body="Six hundred UK VC and PE firms, matched against your stage, sector, and cheque size. Fiona surfaces the dozen you should actually approach this week and writes the opening line."
                            />
                            <FirstHourStep
                                number={3}
                                title="Drop your product idea into The Forge."
                                body={"One paragraph in. A system architecture, a module decomposition, a skeleton Bill of Materials, and a shortlist of UK manufacturers — out — before lunch."}
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
                            Take me to Brainstorming
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
            {/* Section deep-dives — match the four current sidebar
                sections (Brainstorming · Fundraising · Workshop ·
                Marketplace) in the order they appear in the sidebar. */}
            {/* ─────────────────────────────────────────────────────── */}
            <section className="px-4 sm:px-6 lg:px-12 pt-14 lg:pt-16 space-y-6 lg:space-y-8 max-w-4xl">
                <SectionBlock
                    icon={Sparkles}
                    label="Brainstorming"
                    subtitle="Ideas in, decisions out"
                    startHref="/agents"
                    startLabel="Open Brainstorming"
                    intro={"The Brainstorming page is the front door. Eight curated questions are waiting — pricing, hiring, fundraising, build-vs-partner — each one already paired with the specialists best placed to answer it. Or type your own topic and four key leaders pick it up. The output isn’t a chat log; it’s a decision and the next step."}
                    rows={[
                        [
                            "Strategy",
                            "Sage frames the bigger picture. Drop a business plan or paste your one-liner — back comes a strategic tree of pillars, objectives, and atomic tasks, each linked to a measurable outcome.",
                        ],
                        [
                            "Objectives",
                            "Each objective auto-decomposes into 1–3-day tasks scheduled against your team’s velocity. The system tells you “this objective needs one more engineer to ship on time” before you spend six weeks finding out.",
                        ],
                        [
                            "Tasks",
                            "Day-to-day work tied to the objectives that justify the burn. Drag, assign, mark done, see it ladder up to the strategic pillar.",
                        ],
                        [
                            "Outputs",
                            "Every deliverable your specialists have produced — pitch decks, financial models, strategy briefs, CAD exports — searchable by specialist or document type.",
                        ],
                    ]}
                />
                <SectionBlock
                    icon={Building2}
                    label="Fundraising"
                    subtitle={"Find the investors who’d back you"}
                    startHref="/investors"
                    startLabel="Open the investor database"
                    intro={"Six hundred UK VC and PE firms profiled and matched to your sector, stage, and cheque size. Filter in plain English — “early-stage food tech”, “hardware climate fund”, “family office angels writing £250K”. Fiona pulls each investor’s portfolio and recent activity into every outreach brief, so the email lands in their inbox already personalised."}
                    rows={[]}
                />
                <SectionBlock
                    icon={Hammer}
                    label="Workshop"
                    subtitle="From idea to manufactured product"
                    startHref="/the-forge-v2"
                    startLabel="Open The Forge"
                    intro="Type your product idea in one paragraph. Max, your CTO specialist, returns a system architecture diagram, a module decomposition, a skeleton Bill of Materials, reference images of each module, and a design report with research, risks, and next steps. Jian (engineering), Fang (manufacturing), and Chase (supply chain) take it from there."
                    rows={[
                        [
                            "Build",
                            "Jian generates detailed CAD specs, tolerance stack-ups, manufacturing process recommendations, and cost-per-unit estimates from live supplier quotes.",
                        ],
                        [
                            "Assemble",
                            "Fang returns assembly method sheets, tooling lists, and labour-hour estimates.",
                        ],
                        [
                            "Procurement",
                            "Chase searches hundreds of thousands of parts, auto-fills supplier quotes, flags long lead times, and ranks suppliers on reliability and price.",
                        ],
                    ]}
                    footnote="IP-sensitive? Mark the project, and designs never touch shared storage."
                />
                <SectionBlock
                    icon={Store}
                    label="Marketplace"
                    subtitle="Fractional Executives · Suppliers · Manufacturing Techniques"
                    startHref="/marketplace"
                    startLabel="Open the Marketplace"
                    intro="Three doors into the same physical world: experienced fractional executives ready to fill a gap on your team, UK suppliers and contract manufacturers ranked on capability and lead time, and a library of manufacturing techniques (injection moulding, PCB assembly, 3D printing, CNC) so you stop over-specifying tolerances by 2x."
                    rows={[
                        [
                            "Fractional Executives",
                            "Describe the hole in your team. Harper returns matched candidates with portfolios, interview questions, and a culture-fit checklist. Fractional, contract, or full-time — your choice.",
                        ],
                        [
                            "Suppliers",
                            "Your Bill of Materials goes in. Ranked supplier shortlists come out — PCB assembly, injection moulding, 3D printing, testing labs, fulfilment.",
                        ],
                        [
                            "Manufacturing Techniques",
                            "Curated tutorials and Q&A on the decisions that quietly cost the most: when to mould vs CNC, when tolerances are overkill, when a cheaper material outperforms.",
                        ],
                    ]}
                />
            </section>

            {/* ─────────────────────────────────────────────────────── */}
            {/* Trimmed key-leaders roster                              */}
            {/* ─────────────────────────────────────────────────────── */}
            <section className="px-4 sm:px-6 lg:px-12 pt-14 lg:pt-16 max-w-4xl">
                <div className="flex items-center gap-3 mb-5">
                    <div className="h-8 w-1.5 bg-international-orange rounded-full" />
                    <h2 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
                        Your four key leaders
                    </h2>
                </div>
                <p className="text-base text-muted-foreground mb-6 max-w-2xl leading-relaxed">
                    Most brainstorming sessions land with one of these four. The other nine
                    specialists are a click away whenever a conversation needs them — Max,
                    Jian, Priya, Mia, Sal, Cal, Finn, Harper, Leo.
                </p>
                <Card className="border-border">
                    <CardContent className="pt-6 pb-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                            {KEY_LEADERS.map((leader) => (
                                <div key={leader.name} className="flex flex-col">
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-base font-semibold text-foreground">
                                            {leader.name}
                                        </span>
                                        <span className="text-sm text-muted-foreground">
                                            — {leader.role}
                                        </span>
                                    </div>
                                    <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                                        {leader.reason}
                                    </p>
                                </div>
                            ))}
                        </div>
                        <Link
                            href="/agents"
                            className="inline-flex items-center gap-1.5 text-sm font-semibold text-international-orange hover:underline mt-5"
                        >
                            See all 13 specialists
                            <ArrowRight className="h-4 w-4" />
                        </Link>
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
                    Take me to Brainstorming
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
                                <span className="text-muted-foreground leading-relaxed">{body}</span>
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
