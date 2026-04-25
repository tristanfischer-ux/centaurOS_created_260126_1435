/**
 * @file AnonymousForgeClient.tsx
 *
 * @description Client interactivity for the unauthenticated /the-forge-v2
 * landing per RED-TEAM-PIVOT-PLAN Tier 2 step 16. Owns:
 *
 * 1. Inline demo grid: five real Forge project packs as clickable PDF links.
 *    Uses the same demo metadata as the marketing forge-demo-grid.tsx but
 *    renders a lighter, app-style card grid (no marketing animations).
 * 2. A "Start a project" textarea. Typing triggers the signup wall after 6
 *    characters; submitting the form also triggers the wall.
 * 3. A blurred "featured workspace preview" card with a "Sign up to start
 *    your own" lock overlay.
 * 4. The AnonymousSignupWall modal shared with /investors and /agents.
 *
 * Voice rules: no em dashes, British spelling, no emojis, semantic tokens.
 */

"use client"

import { useCallback, useState } from "react"
import Image from "next/image"
import { ArrowRight, ExternalLink, FileText, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { AnonymousSignupWall, type SignupWallCopy } from "@/components/marketing/anonymous-signup-wall"

// ─── Demo data (mirrors forge-demo-grid.tsx) ─────────────────────────────────

const DEMOS = [
    {
        slug: "01-BESS",
        heading: "Battery energy storage system",
        acronym: "BESS",
        subHeading: "Forty-foot containerised, 3.5 megawatt-hour, 1.5 megawatt",
        coverPath: "/forge-demos/thumbnails/01-BESS-cover.png",
        pdfPath: "/forge-demos/01-BESS.pdf",
        stats: { pages: 58, modules: 6, bomRows: 53, suppliers: 29 },
        cost: { unit: "£1,276,480", headroomLabel: "Over by £1.1m", isOver: true },
    },
    {
        slug: "02-HAPS-Wren",
        heading: "High-altitude pseudo-satellite",
        acronym: "HAPS, Wren-style",
        subHeading: "Solar plus hydrogen hybrid, twenty-kilometre ceiling",
        coverPath: "/forge-demos/thumbnails/02-HAPS-Wren-cover.png",
        pdfPath: "/forge-demos/02-HAPS-Wren.pdf",
        stats: { pages: 59, modules: 8, bomRows: 86, suppliers: 25 },
        cost: { unit: "£1,473,750", headroomLabel: "Under by £1.0m", isOver: false },
    },
    {
        slug: "03-Vertical-Farm",
        heading: "Modular vertical farm",
        acronym: undefined,
        subHeading: "Forty-foot container, year-round leafy greens",
        coverPath: "/forge-demos/thumbnails/03-Vertical-Farm-cover.png",
        pdfPath: "/forge-demos/03-Vertical-Farm.pdf",
        stats: { pages: 60, modules: 8, bomRows: 70, suppliers: 32 },
        cost: { unit: "£69,555", headroomLabel: "Under by £80k", isOver: false },
    },
    {
        slug: "04-Desalination",
        heading: "Containerised seawater desalination",
        acronym: "sea water reverse osmosis",
        subHeading: "Five hundred cubic metres of potable water per day",
        coverPath: "/forge-demos/thumbnails/04-Desalination-cover.png",
        pdfPath: "/forge-demos/04-Desalination.pdf",
        stats: { pages: 60, modules: 7, bomRows: 68, suppliers: 32 },
        cost: { unit: "£247,980", headroomLabel: "Under by £102k", isOver: false },
    },
    {
        slug: "05-Hedgerow",
        heading: "Hedgerow garden bird feeder",
        acronym: undefined,
        subHeading: "Premium, camera plus solar plus on-device inference",
        coverPath: "/forge-demos/thumbnails/05-Hedgerow-cover.png",
        pdfPath: "/forge-demos/05-Hedgerow.pdf",
        stats: { pages: 49, modules: 7, bomRows: 70, suppliers: 21 },
        cost: { unit: "£354", headroomLabel: "Over by £199", isOver: true },
    },
] as const

// ─── Signup wall copy ─────────────────────────────────────────────────────────

type WallTrigger = "textarea" | "workspace-preview"

const WALL_COPY: Record<WallTrigger, SignupWallCopy> = {
    textarea: {
        title: "Save this project to your private sandbox",
        body: "Sign up to run the Forge against your concept. The brief, modules, bill of materials, supplier shortlist, failure modes, and cost envelope all save to your private sandbox so you can share them with co-founders or investors.",
    },
    "workspace-preview": {
        title: "Start your own project workspace",
        body: "Sign up to create a project workspace like the one below. Everything the Forge produces saves to your private sandbox, ready to download as a PDF or share as a link.",
    },
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AnonymousForgeClient() {
    const [projectValue, setProjectValue] = useState("")
    const [wallOpen, setWallOpen] = useState(false)
    const [wallTrigger, setWallTrigger] = useState<WallTrigger>("textarea")

    const openWall = useCallback((trigger: WallTrigger) => {
        setWallTrigger(trigger)
        setWallOpen(true)
    }, [])

    const handleProjectChange = useCallback(
        (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            const val = e.target.value
            setProjectValue(val)
            if (val.length === 6) {
                openWall("textarea")
            }
        },
        [openWall],
    )

    const handleSubmit = useCallback(
        (e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault()
            openWall("textarea")
        },
        [openWall],
    )

    const signupHref = (() => {
        const trimmed = projectValue.trim()
        const base = "/signup?from=forge-anonymous"
        return trimmed
            ? `${base}&concept=${encodeURIComponent(trimmed)}`
            : base
    })()

    return (
        <>
            {/* ── What the Forge produces ───────────────────────────────── */}
            <section className="space-y-4">
                <div className="space-y-1">
                    <p className="text-xs font-mono uppercase tracking-widest text-international-orange">
                        What the Forge produces
                    </p>
                    <h2 className="text-xl font-display font-bold text-foreground">
                        Five real Forge runs, full project packs
                    </h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        Each pack includes a brief, modules, bill of materials, supplier shortlist, failure modes, standards, and a cost envelope. Two came back over budget. The system tells you. You decide.
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {DEMOS.map((demo) => (
                        <a
                            key={demo.slug}
                            href={demo.pdfPath}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Open the ${demo.heading} project pack PDF`}
                            className="group block"
                        >
                            <Card className="h-full overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md group-active:scale-[0.99]">
                                {/* Cover */}
                                <div className="relative aspect-[3/4] w-full bg-muted overflow-hidden">
                                    <Image
                                        src={demo.coverPath}
                                        alt={`Cover of the ${demo.heading} project pack`}
                                        fill
                                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                                        className="object-cover object-top"
                                    />
                                </div>
                                <CardContent className="p-4 space-y-2">
                                    <div className="flex items-start justify-between gap-2 flex-wrap">
                                        <h3 className="text-sm font-semibold text-foreground leading-snug">
                                            {demo.heading}
                                            {demo.acronym ? (
                                                <span className="font-normal text-muted-foreground">
                                                    {" "}({demo.acronym})
                                                </span>
                                            ) : null}
                                        </h3>
                                        <span
                                            className={cn(
                                                "inline-flex shrink-0 items-center px-2 py-0.5 rounded-full border text-[10px] font-mono uppercase tracking-widest",
                                                demo.cost.isOver
                                                    ? "bg-warning/10 text-warning border-warning/20"
                                                    : "bg-success/10 text-success border-success/20",
                                            )}
                                        >
                                            {demo.cost.headroomLabel}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        {demo.subHeading}
                                    </p>
                                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-0.5">
                                        <span>{demo.stats.pages} pages</span>
                                        <span>{demo.stats.modules} modules</span>
                                        <span>{demo.stats.suppliers} suppliers</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs text-international-orange font-medium pt-0.5">
                                        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                                        <span>Read the full pack</span>
                                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                                    </div>
                                </CardContent>
                            </Card>
                        </a>
                    ))}
                </div>

                <p className="text-[11px] text-muted-foreground">
                    Generated 25 April 2026 against the live Forge pipeline. Same pipeline a £20 Starter user gets.
                </p>
            </section>

            {/* ── Start a project ───────────────────────────────────────── */}
            <section className="space-y-3">
                <h2 className="text-sm font-semibold text-foreground">
                    Start a project
                </h2>
                <form onSubmit={handleSubmit} className="space-y-2">
                    <label htmlFor="anonymous-forge-concept" className="sr-only">
                        Describe what you want to build
                    </label>
                    <textarea
                        id="anonymous-forge-concept"
                        value={projectValue}
                        onChange={handleProjectChange}
                        rows={3}
                        placeholder="Describe what you want to build. The more specific you are, the better the first pass."
                        className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-international-orange focus:border-transparent resize-none"
                    />
                    <Button
                        type="submit"
                        className="bg-international-orange hover:bg-international-orange-hover text-white gap-1.5"
                    >
                        Run the Forge
                        <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                </form>
                <p className="text-[11px] text-muted-foreground">
                    Your project saves to your private sandbox the moment you sign up.
                </p>
            </section>

            {/* ── Blurred workspace preview ─────────────────────────────── */}
            <section className="space-y-3">
                <h2 className="text-sm font-semibold text-foreground">
                    Featured workspace preview
                </h2>
                <button
                    type="button"
                    onClick={() => openWall("workspace-preview")}
                    className="w-full text-left group"
                    aria-label="Locked workspace preview. Sign up to start your own."
                >
                    <Card className="relative overflow-hidden transition-all group-hover:border-international-orange/50">
                        {/* Blurred content — representative workspace layout */}
                        <div className="select-none filter blur-[3px] pointer-events-none">
                            <CardContent className="p-5 space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="h-6 w-6 rounded-full bg-international-orange/20" />
                                    <div className="space-y-1 flex-1">
                                        <div className="h-3 w-48 rounded bg-muted" />
                                        <div className="h-2.5 w-32 rounded bg-muted/70" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    {[0, 1, 2].map((i) => (
                                        <div key={i} className="rounded-lg bg-muted/40 p-3 space-y-1.5">
                                            <div className="h-2.5 w-16 rounded bg-muted" />
                                            <div className="h-5 w-10 rounded bg-muted/70" />
                                        </div>
                                    ))}
                                </div>
                                <div className="space-y-2">
                                    <div className="h-3 w-full rounded bg-muted/60" />
                                    <div className="h-3 w-5/6 rounded bg-muted/50" />
                                    <div className="h-3 w-4/6 rounded bg-muted/40" />
                                </div>
                                <div className="space-y-1.5">
                                    {[0, 1, 2, 3].map((i) => (
                                        <div
                                            key={i}
                                            className="flex items-center gap-2 p-2 rounded-md bg-muted/30"
                                        >
                                            <div className="h-2.5 w-2.5 rounded-full bg-muted" />
                                            <div className="h-2.5 w-40 rounded bg-muted/60" />
                                            <div className="ml-auto h-2.5 w-12 rounded bg-muted/40" />
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </div>

                        {/* Lock overlay */}
                        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
                            <div className="rounded-xl border bg-card shadow-lg p-5 max-w-sm text-center space-y-3">
                                <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-international-orange/10 mx-auto">
                                    <Lock className="h-5 w-5 text-international-orange" />
                                </div>
                                <p className="text-sm font-semibold text-foreground">
                                    Sign up to start your own
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Every project gets a full workspace: brief, modules, bill of materials, cost, suppliers, and a downloadable project pack.
                                </p>
                                <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-widest text-international-orange">
                                    Start for free
                                    <ArrowRight className="h-3 w-3" />
                                </div>
                            </div>
                        </div>
                    </Card>
                </button>
            </section>

            {/* ── Signup wall ───────────────────────────────────────────── */}
            <AnonymousSignupWall
                open={wallOpen}
                onOpenChange={setWallOpen}
                copy={WALL_COPY[wallTrigger]}
                signupHref={signupHref}
                ctaLabel="Save to my private sandbox"
            />
        </>
    )
}
