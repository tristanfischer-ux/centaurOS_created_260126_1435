/**
 * WelcomeView — Client component for /welcome.
 *
 * @description Post-login landing page (Tristan 2026-04-27: Welcome is now
 * the first page after login — replaces the earlier auto-redirect to
 * /investors). Opens with a hero + short personal letter from Tristan Fischer
 * (Founder), four tiles pointing at the four primary destinations
 * (Brainstorming / The Forge / Investors / Suppliers), and a closing line.
 *
 * The four tiles ARE the primary call-to-action — the user picks their own
 * starting point. There is no longer a single "Go to Investors" button at
 * the bottom because that decision belongs to the founder, not the product.
 *
 * Copy follows Tristan's first-person British voice and the in-product
 * "No AI Emphasis" rule (no "AI-powered", "Smart", "Intelligent", etc.).
 */

"use client"

import Link from "next/link"
import { useTransition } from "react"
import { useRouter } from "next/navigation"
import {
    ArrowRight,
    MessageSquare,
    Hammer,
    Users,
    Package,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { markWelcomeComplete, setFoundryQuickProfile } from "@/actions/welcome"
import { useState } from "react"
import { toast } from "sonner"

interface WelcomeViewProps {
    /** First name used in the hero eyebrow greeting. Optional. */
    firstName?: string
    /** When true, the user's foundry has no stage/sector/industry yet —
     *  show the Quick set-up card so downstream sections work. */
    foundryProfileMissing?: boolean
}

const STAGE_OPTIONS = [
    "Pre-Seed",
    "Seed",
    "Series A",
    "Series B",
    "Series C",
    "Growth",
] as const

// {label, value} — value must match foundries.sector CHECK constraint:
// aerospace | agriculture | automotive | construction | consumer_electronics |
// defence | energy | food_processing | logistics | manufacturing | marine |
// medical | mining | robotics | other.
const SECTOR_OPTIONS: ReadonlyArray<{ label: string; value: string }> = [
    { label: "Climate / energy",       value: "energy" },
    { label: "Medical device",         value: "medical" },
    { label: "AgTech",                 value: "agriculture" },
    { label: "Food processing",        value: "food_processing" },
    { label: "Aerospace / drones",     value: "aerospace" },
    { label: "Defence",                value: "defence" },
    { label: "Manufacturing",          value: "manufacturing" },
    { label: "Consumer electronics",   value: "consumer_electronics" },
    { label: "Robotics",               value: "robotics" },
    { label: "Automotive / mobility",  value: "automotive" },
    { label: "Construction",           value: "construction" },
    { label: "Marine",                 value: "marine" },
    { label: "Mining",                 value: "mining" },
    { label: "Logistics",              value: "logistics" },
    { label: "Other hardware",         value: "other" },
] as const

export function WelcomeView({ firstName, foundryProfileMissing }: WelcomeViewProps): React.ReactElement {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [profileSaved, setProfileSaved] = useState(false)
    const [stage, setStage] = useState("")
    const [sector, setSector] = useState("")

    /**
     * Mark the welcome tour as seen. Does NOT redirect — the founder picks
     * their own destination from the four section tiles. Tristan 2026-04-27:
     * Welcome is the home; Welcome is not a turnstile.
     */
    const handleMarkComplete = (): void => {
        startTransition(async () => {
            await markWelcomeComplete()
            // Soft refresh so the sidebar / nav reflects the cleared
            // first-login state, but stay on /welcome so the user can pick
            // their own destination from the section tiles above.
            router.refresh()
        })
    }

    /** Save the founder's Quick set-up (stage + sector). After save, the
     *  Quick set-up card hides and the four section tiles below work
     *  with full match-scoring rather than degraded anonymous-tier UX. */
    const handleQuickProfile = (): void => {
        if (!stage && !sector) {
            toast.error("Pick at least a stage or a sector — both is best.")
            return
        }
        startTransition(async () => {
            const result = await setFoundryQuickProfile({
                stage: stage || null,
                sector: sector || null,
                industry: null, // industry column has its own enum/check; skip
                                // — stage + sector are enough for matching.
            })
            if (result.success) {
                setProfileSaved(true)
                toast.success("Saved. Investor and supplier matches will use this.")
                router.refresh()
            } else {
                toast.error("Couldn't save just now. Please try again.")
            }
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
                        {/* Tristan 2026-04-28 (post-Gemini final-check):
                            switched from vertical-bar-beside-title to
                            horizontal-bar-above-title for the welcome hero.
                            Gemini's recommended marketing-hero variant —
                            short horizontal accent bar above the H1, no
                            eyebrow. The smaller H2 section headers below
                            keep the vertical-bar-beside variant (compact). */}
                        <div className="mb-4">
                            <div className="h-1.5 w-14 bg-international-orange rounded-full shadow-[0_0_10px_rgba(255,69,0,0.4)] mb-4" />
                            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground">
                                Welcome to{" "}
                                <span className="text-international-orange">Fractional Forge</span>.
                            </h1>
                        </div>
                        <p className="text-lg sm:text-xl text-muted-foreground font-light">
                            Four tools for hardware founders: sharpen your thinking, design
                            your product, find the right investors, and source the right
                            suppliers.
                        </p>
                    </div>
                </div>
            </section>

            {/* ─────────────────────────────────────────────────────── */}
            {/* Quick set-up — only when foundry stage/sector are missing */}
            {/* ─────────────────────────────────────────────────────── */}
            {foundryProfileMissing && !profileSaved && (
                <section className="px-4 sm:px-6 lg:px-12 pt-8">
                    <div className="max-w-3xl">
                        <Card className="border-2 border-international-orange/30 bg-international-orange/[0.04]">
                            <CardContent className="pt-5 pb-5">
                                <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-2">
                                    Quick set-up · 20 seconds
                                </p>
                                <h2 className="text-lg sm:text-xl font-bold text-foreground tracking-tight mb-1">
                                    Tell me your stage and sector — I&rsquo;ll match the right investors and suppliers.
                                </h2>
                                <p className="text-sm text-muted-foreground mb-4 max-w-2xl">
                                    Without this, search runs on the deck text alone — useful, but match scoring won&rsquo;t reflect your stage or sector. You can change these any time from your profile.
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                                    <label className="block">
                                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Stage</span>
                                        <select
                                            value={stage}
                                            onChange={(e) => setStage(e.target.value)}
                                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-international-orange"
                                        >
                                            <option value="">Pick stage…</option>
                                            {STAGE_OPTIONS.map((s) => (
                                                <option key={s} value={s}>{s}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <label className="block">
                                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Sector</span>
                                        <select
                                            value={sector}
                                            onChange={(e) => setSector(e.target.value)}
                                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-international-orange"
                                        >
                                            <option value="">Pick sector…</option>
                                            {SECTOR_OPTIONS.map((s) => (
                                                <option key={s.value} value={s.value}>{s.label}</option>
                                            ))}
                                        </select>
                                    </label>
                                </div>
                                <Button
                                    onClick={handleQuickProfile}
                                    disabled={isPending}
                                    size="sm"
                                    className="gap-1.5"
                                >
                                    Save and continue
                                    <ArrowRight className="h-3.5 w-3.5" />
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                </section>
            )}

            {/* ─────────────────────────────────────────────────────── */}
            {/* Short letter from Tristan                               */}
            {/* ─────────────────────────────────────────────────────── */}
            <section className="px-4 sm:px-6 lg:px-12 pt-10 lg:pt-14">
                <div className="max-w-2xl space-y-5 text-base sm:text-[17px] leading-relaxed text-foreground">
                    <p className="font-medium">I&apos;m Tristan Fischer.</p>
                    <p>
                        I&apos;ve spent 26 years running startups — software and hardware —
                        most recently Fischer Farms, one of the United Kingdom&apos;s larger
                        vertical farms. Fractional Forge is the set of tools I wish I&apos;d
                        had: a way to think through hard decisions with context-aware
                        specialists, design a product to manufacturable spec, find the
                        investors most likely to back you, and shortlist the suppliers
                        who&apos;ll actually build it.
                    </p>
                    <p>
                        There are four surfaces. Here&apos;s what each one does and where to
                        start.
                    </p>
                </div>
            </section>

            {/* ─────────────────────────────────────────────────────── */}
            {/* Four primary surface tiles                              */}
            {/* ─────────────────────────────────────────────────────── */}
            <section className="px-4 sm:px-6 lg:px-12 pt-10 lg:pt-12">
                <div className="max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                    <SectionTile
                        icon={MessageSquare}
                        label="Brainstorming"
                        description="Ask a hard question — pricing, positioning, build vs. buy, a specific supplier risk. Four specialists answer in parallel from different angles: strategy, engineering, manufacturing, finance. Fiona closes with a consensus and the one action to take."
                        href="/agents"
                        ctaLabel="Open Brainstorming"
                    />
                    <SectionTile
                        icon={Hammer}
                        label="The Forge"
                        description="Describe what you&rsquo;re building in a paragraph. A twenty-minute autopilot returns a system architecture, module decomposition, bill of materials, cost estimate, supplier shortlist, and risk register — ready to share with a contract manufacturer."
                        href="/the-forge-v2"
                        ctaLabel="Open The Forge"
                    />
                    <SectionTile
                        icon={Users}
                        label="Investors"
                        description="Paste your deck or describe your company. Fractional Forge ranks the investors most likely to back you — with a fit score, a plain-English explanation of why each firm would be interested, and a drafted intro email for each match."
                        href="/investors"
                        ctaLabel="Open Investors"
                    />
                    <SectionTile
                        icon={Package}
                        label="Suppliers"
                        description="Describe what you need — a specific material, process capability, or component. Fractional Forge searches the directory of UK and European manufacturers and returns a shortlist with a plain-English reason why each one matches your specification."
                        href="/marketplace"
                        ctaLabel="Open Suppliers"
                    />
                </div>
            </section>

            {/* ─────────────────────────────────────────────────────── */}
            {/* How founders use it — 3 short scenarios                */}
            {/* ─────────────────────────────────────────────────────── */}
            <section className="px-4 sm:px-6 lg:px-12 pt-10 lg:pt-14">
                <div className="max-w-3xl">
                    {/* Tristan 2026-04-28 (audit cross-cutting fix #3): replaced
                        grey-uppercase eyebrow with the canonical red-bar +
                        bold H2 pattern (audit flagged grey-uppercase H2s as
                        cross-cutting drift). */}
                    <div className="flex items-center gap-3 mb-5">
                        <div className="h-6 w-1 bg-international-orange rounded-full" />
                        <h2 className="text-lg sm:text-xl font-bold text-foreground tracking-tight">
                            How founders use it
                        </h2>
                    </div>
                    <div className="space-y-5">
                        <ScenarioRow
                            number="01"
                            text="A founder at the idea stage uses Brainstorming to pressure-test whether their product is manufacturable at the price point investors expect, then runs The Forge to get a real bill of materials before their first investor meeting."
                        />
                        <ScenarioRow
                            number="02"
                            text="A founder raising a seed round pastes their deck into Investors, gets a ranked list of 50 firms with fit scores and drafted intro emails, and works through them in order — starting with the highest-fit deep-tech funds."
                        />
                        <ScenarioRow
                            number="03"
                            text="A founder who has a design locked but no supply chain uses Suppliers to find contract manufacturers in their target region, then asks Brainstorming to help them evaluate which one to approach first."
                        />
                    </div>
                </div>
            </section>

            {/* ─────────────────────────────────────────────────────── */}
            {/* Pick where to start — the four tiles above ARE the CTAs;  */}
            {/* this card just acknowledges the welcome and offers to     */}
            {/* dismiss it once the user has had a look around.           */}
            {/* ─────────────────────────────────────────────────────── */}
            <section className="px-4 sm:px-6 lg:px-12 pt-10 lg:pt-14">
                <div className="max-w-3xl">
                    <Card className="border-2 border-international-orange/20 bg-gradient-to-br from-background to-international-orange/[0.04]">
                        <CardContent className="pt-6 pb-6">
                            {/* Tristan 2026-04-28 (audit fix): same red-bar
                                pattern instead of the grey-uppercase eyebrow.
                                "Pick where to start" merged into the H2. */}
                            <div className="flex items-center gap-3 mb-2">
                                <div className="h-6 w-1 bg-international-orange rounded-full" />
                                <h2 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
                                    Pick where to start
                                </h2>
                            </div>
                            <h3 className="text-lg sm:text-xl text-foreground tracking-tight mb-2">
                                Open whichever section is most useful right now.
                            </h3>
                            <p className="text-base text-muted-foreground leading-relaxed mb-5 max-w-2xl">
                                If you have a hard decision to think through, open
                                Brainstorming. If you have a product to design, open The
                                Forge. If you&rsquo;re raising, open Investors. If you need a
                                manufacturer, open Suppliers. You can come back to this page
                                from the sidebar any time.
                            </p>
                            <div className="flex flex-wrap gap-3">
                                <Link href="/agents">
                                    <Button size="lg" variant="outline" className="gap-2">
                                        <MessageSquare className="h-4 w-4" /> Brainstorming
                                    </Button>
                                </Link>
                                <Link href="/the-forge-v2">
                                    <Button size="lg" variant="outline" className="gap-2">
                                        <Hammer className="h-4 w-4" /> The Forge
                                    </Button>
                                </Link>
                                <Link href="/investors">
                                    <Button size="lg" variant="outline" className="gap-2">
                                        <Users className="h-4 w-4" /> Investors
                                    </Button>
                                </Link>
                                <Link href="/marketplace">
                                    <Button size="lg" variant="outline" className="gap-2">
                                        <Package className="h-4 w-4" /> Suppliers
                                    </Button>
                                </Link>
                                <Button
                                    onClick={handleMarkComplete}
                                    disabled={isPending}
                                    variant="ghost"
                                    size="lg"
                                >
                                    Don&rsquo;t show this on next sign-in
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

interface ScenarioRowProps {
    number: string
    text: string
}

function ScenarioRow({ number, text }: ScenarioRowProps): React.ReactElement {
    return (
        <div className="flex gap-4">
            <span className="text-xs font-mono text-muted-foreground pt-1 shrink-0 w-6">
                {number}
            </span>
            <p className="text-base text-foreground leading-relaxed">{text}</p>
        </div>
    )
}
