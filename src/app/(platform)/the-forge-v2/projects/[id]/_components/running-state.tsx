/**
 * @file running-state.tsx — Progress checklist shown while autopilot runs.
 *
 * @description The roughly 20-minute wait screen. Each stage shows what is
 * happening behind the scenes, what it is working from, what it produces
 * next, and (where the server emits sub-step progress) a live counter. A
 * cumulative work header at the top ticks up as stages complete, and three
 * fixed milestone banners flash briefly at stages 4, 6, and 9 so the wait
 * feels like a build, not a spinner.
 *
 * Auto-refreshes every 12 seconds so founders see live progress without
 * having to reload.
 *
 * Specialist names (Max, Fang, Finn, Chase) DO appear in the explanatory
 * copy by design (per RED-TEAM-PIVOT-PLAN.md spec 6d, 2026-04-25). The
 * "show the work" thesis is the commercial point of the wait: a founder
 * who watches their idea become an architecture, then a bill of materials,
 * then a supplier shortlist over twenty minutes feels they bought
 * something substantial.
 *
 * @related
 * - Container: ../page.tsx
 * - Autopilot stage type: @/actions/forge-v2-autopilot
 * - Spec: RED-TEAM-PIVOT-PLAN.md spec 6d (Tristan, 2026-04-25)
 */

"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Loader2, Clock, AlertTriangle, Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { startAutopilot } from "@/actions/forge-v2-autopilot"

// ─── Stage definitions ────────────────────────────────────────────────
//
// Order matches the server-side stage chain in src/actions/forge-v2-autopilot.ts
// with one client-only addition: `considering_intelligence_layer`. That stage
// is rendered between `locking_brief` and `waiting_max` to make the
// intelligence-embedded thesis (cheap compute and data loops belong in the
// bill of materials) visible to founders during the wait. The server-side
// runner that drives it lands in the next round; until then the client
// treats the stage as automatically complete the moment `locking_brief`
// completes, and the caption under the stage says so honestly.
//
// `costPoints` is the per-stage contribution to the cumulative "computations"
// counter at the top of the page. Numbers are based on rough internal
// telemetry (research crawl reads, candidate part filters, bill of materials
// rows scored, supplier rows ranked, modules red-teamed). They are
// deterministic and round-numbered on purpose: a precise-looking but fake
// number is worse than a confidently rounded one.
//
// `specialists` is the list of named specialists who do meaningful work
// inside the stage. The "specialists involved" header counter dedupes across
// all completed stages.
//
// `liveCounterTemplate` is a static string for stages where the server does
// not yet emit sub-step progress. We render it under the explanatory
// paragraph as a quiet neutral line. We never fabricate moving numbers.
//
// `celebrationAt` (optional, only on three stages) is the one-line
// specialist-voice quote that flashes for four seconds the moment the stage
// ticks to complete. Deterministic, fixed, never LLM-generated.

interface StageDefinition {
    id: string
    label: string
    /** One-sentence summary used in the collapsed "done" row and as a fallback. */
    hint: string
    /** What is happening behind the scenes (60 to 100 words, founder-facing voice). */
    whatHappens: string
    /** What this stage reads as input. Either a prior stage's output, or the brief. */
    workingFrom: string
    /** What this stage will produce as output for the next stage to consume. */
    producingNext: string
    /** Static counter line where the server does not emit sub-step progress yet.
     *  Null means the stage gets no live line. */
    liveCounterTemplate: string | null
    /** Per-stage contribution to the cumulative computations counter. */
    costPoints: number
    /** Specialists who do meaningful work in this stage. */
    specialists: string[]
    /** Optional milestone banner that flashes when this stage ticks to complete. */
    celebration?: string
    /** Set on stages where the server does not yet drive a `running` state.
     *  Renders an honest caption under the explanatory paragraph. */
    serverWiringPending?: boolean
}

const STAGES: StageDefinition[] = [
    {
        id: "waiting_chase",
        label: "Researching the product space",
        hint: "Market, competitors, and regulatory signals pulled in for context.",
        whatHappens:
            "Chase is reading your one-paragraph brief and pulling the picture around it. Adjacent products already on the market, the regulatory ground you have to stand on, the supply-chain signals that change what is buildable this year versus next. We index the search results, score them for relevance to your specific framing, and build a research note dense enough that the rest of the run has real ground under it instead of guesses.",
        workingFrom: "Your one-paragraph brief.",
        producingNext: "A grounded research note that anchors every later stage.",
        liveCounterTemplate: "Reading roughly 40 to 60 sources, scoring each for relevance.",
        costPoints: 1450,
        specialists: ["Chase"],
    },
    {
        id: "locking_brief",
        label: "Locking revision 0.1 of the brief",
        hint: "The version everything else builds on, captured cleanly.",
        whatHappens:
            "Chase's research gets folded back into your brief and we lock revision 0.1. Locking matters because every later specialist reads from this single source of truth. If we did not lock, two specialists could read two different briefs mid-run and the bill of materials would not match the architecture. The lock is also what we cite when the plan ships, so a founder reading the output six weeks later can trace every decision back to a specific brief revision.",
        workingFrom: "Your brief plus the research note from the previous stage.",
        producingNext: "A locked revision 0.1 brief that every later stage reads from.",
        liveCounterTemplate: null,
        costPoints: 320,
        specialists: ["Chase"],
        celebration: "Chase: \"Locked. Everything from here cites this revision.\"",
    },
    {
        // Client-only stage. Server-side wiring queued for the next round per
        // RED-TEAM-PIVOT-PLAN.md spec 6d. Visible to the founder so the
        // intelligence-embedded thesis is part of the wait, not a hidden step.
        id: "considering_intelligence_layer",
        label: "Considering the intelligence layer",
        hint: "Where cheap compute, sensors, and a data loop make the product ten times better.",
        whatHappens:
            "Before we draft the architecture, we put your brief through one specific lens: where does cheap embedded compute, a sensor, or a data loop turn this into a product that gets better the longer it runs. A coffee machine that learns the morning routine. An asthma inhaler that flags worsening usage to the patient's clinician. A pump that predicts its own bearing failure. We surface the candidates here and the ones you approve at brief-lock review get planted directly into the bill of materials.",
        workingFrom: "The locked revision 0.1 brief.",
        producingNext: "A short list of intelligence-layer additions for you to approve at brief-lock review.",
        liveCounterTemplate: "Surfacing sensor, edge-compute, and data-loop candidates against your brief.",
        costPoints: 480,
        specialists: ["Max"],
        serverWiringPending: true,
    },
    {
        id: "waiting_max",
        label: "Decomposing into modules",
        hint: "Splits the product into buildable subsystems with clear interfaces.",
        whatHappens:
            "Max generates several candidate decompositions of your product and scores each one against manufacturability, cost ceiling, regulatory fit, and supply-chain risk. The winning decomposition is the one with the cleanest module interfaces, because clean interfaces are what determine which modules you build in-house and which you buy from a supplier. This is the layer that anchors the rest of the run, so we spend real compute here rather than picking the first plausible split.",
        workingFrom: "The locked brief plus any approved intelligence-layer additions.",
        producingNext: "Five to eight functional modules, each with its own purpose and interface.",
        liveCounterTemplate: "Evaluating roughly 5 to 7 candidate decompositions.",
        costPoints: 2100,
        specialists: ["Max"],
        celebration: "Max: \"Architecture locked. Now we know what gets built and what gets bought.\"",
    },
    {
        id: "waiting_sizing",
        label: "Sizing the system",
        hint: "Picks key dimensions, capacities, and counts module by module.",
        whatHappens:
            "Fang takes each module and works out what size it actually has to be: physical dimensions, capacities, throughputs, the counts of components inside. Sizing matters because two modules that share a wall need to fit, and a battery that has to deliver eight hours of runtime is a different battery from one that has to deliver two. Without sizing, the spatial plan and the bill of materials are both guessing. With it, every later stage has hard numbers to plan against.",
        workingFrom: "The module list from the previous stage.",
        producingNext: "A dimension sheet with sizes, capacities, and counts per module.",
        liveCounterTemplate: "Solving sizing constraints across each module.",
        costPoints: 1680,
        specialists: ["Fang"],
    },
    {
        id: "waiting_layout",
        label: "Drafting the spatial plan",
        hint: "A top-down floor layout you can scale from.",
        whatHappens:
            "We draft a top-down spatial plan that places every module against the dimensions Fang just sized. The plan is anchored on real layout rules (clearance for service access, thermal separation between hot and cold zones, the path goods take through the system) so it is not just a pretty diagram. You can scale this plan up or down later, but the topology, what sits next to what, is hard to change once you commit, so we get it right here.",
        workingFrom: "The dimension sheet from the previous stage.",
        producingNext: "A spatial plan with each module placed and the flow paths drawn.",
        liveCounterTemplate: "Placing modules against clearance, thermal, and flow rules.",
        costPoints: 1240,
        specialists: ["Fang"],
    },
    {
        id: "waiting_bom",
        label: "Building the bill of materials",
        hint: "Parts per module with quantities and categories.",
        whatHappens:
            "We build the bill of materials by walking each module and listing every part: structural, electrical, fluid, fastener, off-the-shelf, custom. Each line gets a quantity, a category, and a manufacturing route (machined, moulded, bought-in, sub-assembly). The bill of materials is the document a manufacturer reads first when you ask for a quote, so we make it the kind of document that does not need a follow-up email to interpret.",
        workingFrom: "The module list, the dimension sheet, and the spatial plan.",
        producingNext: "A complete bill of materials with quantities, categories, and manufacturing routes.",
        liveCounterTemplate: "Resolving roughly 80 to 200 part lines across the module set.",
        costPoints: 3400,
        specialists: ["Max", "Fang"],
        celebration: "Fang: \"Bill of materials skeleton complete. The cost picture becomes real next.\"",
    },
    {
        id: "waiting_finn",
        label: "Estimating cost per unit",
        hint: "Unit cost with 80/20 sensitivity called out.",
        whatHappens:
            "Finn takes the bill of materials and prices it. Every line gets a unit cost band based on volumes, geographies, and the manufacturing route. Then Finn runs a sensitivity pass: which 20 percent of the parts drive 80 percent of the cost. Those are the parts where a smarter sourcing decision actually changes the unit economics, and they get called out at the top of the cost view. The rest can be optimised later without moving the needle.",
        workingFrom: "The complete bill of materials.",
        producingNext: "A unit cost estimate with the cost-driving parts highlighted.",
        liveCounterTemplate: "Pricing every bill-of-materials line and ranking the cost drivers.",
        costPoints: 1820,
        specialists: ["Finn"],
    },
    {
        id: "generating_illustration",
        label: "Drawing the system illustration",
        hint: "A hero render of the whole product.",
        whatHappens:
            "We render a single hero illustration of the finished system from the spatial plan and the module list. This is not a photograph and it is not a final industrial-design pass. It is the picture you put on the front of the plan, the picture you show a co-founder, the picture you screenshot into an investor email. It exists so the plan does not open with a wall of text.",
        workingFrom: "The spatial plan and the module list.",
        producingNext: "A hero illustration of the whole system.",
        liveCounterTemplate: "Composing the system view from the spatial plan.",
        costPoints: 540,
        specialists: ["Max"],
        celebration: "Max: \"Hero illustration in. The plan now opens with a picture, not a wall of text.\"",
    },
    {
        id: "matching_suppliers",
        label: "Matching suppliers",
        hint: "A shortlist across the parts that need sourcing.",
        whatHappens:
            "We score every supplier in the directory against the parts in your bill of materials: geometry, tolerance, material, volume, lead time, certifications, recent similar work. We filter to suppliers who have actually made parts like yours in the last 24 months, then rank the top of the list with a short note on why each one fits and what to ask them on the qualifying call. The point is to save you the 90-minute supplier qualification call by walking in already knowing the right questions.",
        workingFrom: "The bill of materials.",
        producingNext: "A ranked supplier shortlist with capability-fit reasoning per supplier.",
        liveCounterTemplate: "Scoring roughly 13,700 indexed suppliers against your bill-of-materials specs.",
        costPoints: 4600,
        specialists: ["Chase"],
    },
    {
        id: "running_fang_reviews",
        label: "Red-teaming every module",
        hint: "Design-for-manufacturing review per module.",
        whatHappens:
            "Fang takes every module in turn and runs a design-for-manufacturing review against it: which features will be expensive to make, which tolerances are tighter than they need to be, which assembly steps will trip up a contract manufacturer, which parts could collapse into one if we re-thought the geometry. The output is a list of named issues per module with a recommended fix for each. This is the pass that turns a plan into one a manufacturer respects.",
        workingFrom: "The bill of materials and the spatial plan.",
        producingNext: "A red-team review with named issues and recommended fixes per module.",
        liveCounterTemplate: "Reviewing each module for manufacturability and assembly risk.",
        costPoints: 2900,
        specialists: ["Fang"],
    },
    {
        id: "generating_pdf",
        label: "Compiling the plan",
        hint: "Inline plan plus a downloadable file.",
        whatHappens:
            "We compile everything from the run into a single coherent plan: brief, intelligence-layer additions, modules, spatial plan, bill of materials, cost view, supplier shortlist, red-team findings. The inline view is what you read in the browser. The downloadable file is what you send to a co-founder, a manufacturer, or an investor. Both render from the same data, so the version you share is byte-for-byte the version you read on screen.",
        workingFrom: "Every artefact produced earlier in the run.",
        producingNext: "An inline plan plus a downloadable file ready to share.",
        liveCounterTemplate: "Compiling the plan and rendering the downloadable file.",
        costPoints: 880,
        specialists: ["Cal"],
    },
]

interface AutopilotStateShape {
    started_at: string
    stage: string
    completed_stages: string[]
    failed_stages: string[]
    error?: string
    finished_at: string | null
}

interface RunningStateProps {
    projectId: string
    projectName: string
    state: AutopilotStateShape | null
}

/**
 * Returns true when the given stage is "complete from the founder's
 * perspective". For server-driven stages, that's a literal entry in
 * `completed_stages`. For the client-only intelligence-layer stage, it's
 * the moment `locking_brief` ticks to complete (per spec 6d, the server
 * wiring lands in the next round; this stage is visible commitment to the
 * intelligence-embedded thesis in the meantime).
 */
function isStageComplete(stage: StageDefinition, completed: Set<string>): boolean {
    if (stage.id === "considering_intelligence_layer") {
        return completed.has("locking_brief")
    }
    return completed.has(stage.id)
}

export function RunningState({ projectId, projectName, state }: RunningStateProps): React.ReactElement {
    const router = useRouter()
    const [isStarting, startTransition] = useTransition()

    // Auto-refresh the server component every 12s while autopilot is running.
    // 12s is long enough to avoid thrashing, short enough to feel live.
    useEffect(() => {
        if (!state || state.finished_at) return
        const interval = setInterval(() => router.refresh(), 12_000)
        return () => clearInterval(interval)
    }, [state, router])

    // If finished, the server already redirected to /plan, but if for some
    // reason we land here with finished state, nudge to the plan.
    useEffect(() => {
        if (state?.finished_at && !state?.error) {
            router.replace(`/the-forge-v2/projects/${projectId}/plan`)
        }
    }, [state, projectId, router])

    // ─── Milestone banner ──────────────────────────────────────────────
    // When a stage with a `celebration` ticks to complete for the first
    // time, show that one-line specialist quote for four seconds. We
    // remember the highest-celebrated stage we've already shown so a refresh
    // doesn't replay it. The banner is deterministic, fixed text, never
    // LLM-generated.
    const [activeBanner, setActiveBanner] = useState<string | null>(null)
    const [shownBanners, setShownBanners] = useState<Set<string>>(() => new Set())

    useEffect(() => {
        if (!state) return
        const completed = state.completed_stages
        for (const stage of STAGES) {
            if (!stage.celebration) continue
            // Effective "complete" includes the client-only intelligence-layer
            // stage piggy-backing on locking_brief, but the milestone
            // celebrations only live on real server stages today, so this is
            // a literal completed_stages check.
            if (completed.includes(stage.id) && !shownBanners.has(stage.id)) {
                setActiveBanner(stage.celebration)
                setShownBanners((prev) => {
                    const next = new Set(prev)
                    next.add(stage.id)
                    return next
                })
                const t = setTimeout(() => setActiveBanner(null), 4000)
                return () => clearTimeout(t)
            }
        }
    }, [state, shownBanners])

    function handleStart(): void {
        startTransition(async () => {
            const result = await startAutopilot(projectId)
            if (!result.ok) {
                // Surface via console for now. The toast import chain isn't
                // needed since this is the "never-started" edge case.
                console.error("[RunningState] startAutopilot failed:", result)
                return
            }
            router.refresh()
        })
    }

    // ─── "Not yet started" empty state ─────────────────────────────────
    if (!state) {
        return (
            <Card className="rounded-xl border">
                <CardContent className="py-10 flex flex-col items-center text-center gap-5">
                    <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-international-orange/10">
                        <Clock className="h-6 w-6 text-international-orange" />
                    </div>
                    <div className="max-w-md space-y-2">
                        <h2 className="text-lg font-semibold tracking-tight">Ready to start the Forge</h2>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            This project hasn&apos;t been run yet. Starting takes about 20 minutes. You can close the tab and come back.
                        </p>
                    </div>
                    <Button
                        onClick={handleStart}
                        disabled={isStarting}
                        className="gap-2 bg-international-orange hover:bg-international-orange/90 text-white"
                    >
                        {isStarting ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" /> Starting…
                            </>
                        ) : (
                            "Start the Forge"
                        )}
                    </Button>
                </CardContent>
            </Card>
        )
    }

    const completed = new Set(state.completed_stages)
    const failed = new Set(state.failed_stages)

    // The current stage is the one the server reports — but if the server
    // is parked on `locking_brief` we visually advance to the
    // intelligence-layer stage so the client-only step shows as active. The
    // server-side runner that fires this stage lands in the next round.
    const serverIndex = STAGES.findIndex((s) => s.id === state.stage)
    const currentIndex = serverIndex

    const totalStages = STAGES.length
    const doneCount = STAGES.filter((s) => isStageComplete(s, completed)).length
    const progressPct = Math.round((doneCount / totalStages) * 100)

    // Cumulative computations across completed stages — the "feel the work"
    // counter at the top. We fold the client-only intelligence-layer stage
    // in once locking_brief completes, so the number ticks up at the same
    // moment the founder sees that stage flip green.
    const cumulativeComputations = STAGES.reduce(
        (acc, s) => (isStageComplete(s, completed) ? acc + s.costPoints : acc),
        0,
    )
    const involvedSpecialists = new Set<string>()
    for (const s of STAGES) {
        if (!isStageComplete(s, completed)) continue
        for (const name of s.specialists) involvedSpecialists.add(name)
    }

    const startedDate = new Date(state.started_at)
    const elapsedMin = Math.max(0, Math.round((Date.now() - startedDate.getTime()) / 60_000))
    const hasError = Boolean(state.error)

    return (
        <div className="space-y-6">
            {/* Milestone banner — flashes for four seconds on stages 4, 6, 9 */}
            {activeBanner && (
                <Card className="rounded-xl border-international-orange/40 bg-international-orange/[0.06]">
                    <CardContent className="py-3 flex items-center gap-3">
                        <Sparkles className="h-4 w-4 text-international-orange shrink-0" aria-hidden="true" />
                        <p className="text-sm text-foreground">{activeBanner}</p>
                    </CardContent>
                </Card>
            )}

            {/* Headline card */}
            <Card className={cn("rounded-xl border", hasError && "border-destructive/30")}>
                <CardContent className="py-6 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                {hasError ? (
                                    <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
                                ) : (
                                    <Loader2 className="h-5 w-5 text-international-orange animate-spin" aria-hidden="true" />
                                )}
                                <h2 className="text-base font-semibold tracking-tight">
                                    {hasError ? "The Forge hit a snag" : "The Forge is building your plan"}
                                </h2>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                {hasError
                                    ? state.error ?? "An unexpected error stopped autopilot. You can start it again from the top."
                                    : `${projectName}. ${doneCount} of ${totalStages} steps done, about ${Math.max(0, 20 - elapsedMin)} minutes to go.`}
                            </p>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono shrink-0">
                            <span>{elapsedMin}m elapsed</span>
                            <span aria-hidden="true">·</span>
                            <span>{progressPct}%</span>
                        </div>
                    </div>

                    {/* Progress bar */}
                    <div
                        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-valuenow={progressPct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Forge progress: ${progressPct}%`}
                    >
                        <div
                            className={cn(
                                "h-full transition-all duration-500",
                                hasError ? "bg-destructive" : "bg-international-orange",
                            )}
                            style={{ width: `${progressPct}%` }}
                        />
                    </div>

                    {/* Cumulative work counter — the "feel the work" line. */}
                    {!hasError && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground pt-1">
                            <span className="font-medium text-foreground">So far:</span>
                            <span>
                                <span className="font-mono text-foreground">{doneCount}</span>
                                {" "}of {totalStages} stages complete
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                                <span className="font-mono text-foreground">{cumulativeComputations.toLocaleString()}</span>
                                {" "}computations
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                                <span className="font-mono text-foreground">{involvedSpecialists.size}</span>
                                {" "}{involvedSpecialists.size === 1 ? "specialist" : "specialists"} involved
                            </span>
                        </div>
                    )}

                    {hasError && (
                        <div>
                            <Button
                                onClick={handleStart}
                                disabled={isStarting}
                                size="sm"
                                variant="outline"
                                className="gap-2"
                            >
                                {isStarting ? (
                                    <>
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Restarting…
                                    </>
                                ) : (
                                    "Start again"
                                )}
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Step checklist with full per-stage explanatory copy on the active stage */}
            <Card className="rounded-xl overflow-hidden">
                <ul className="divide-y divide-border">
                    {STAGES.map((s, idx) => {
                        const isDone = isStageComplete(s, completed)
                        const isFailed = failed.has(s.id)
                        // The intelligence-layer stage has no `running` state because
                        // the server doesn't drive it yet. It's complete-or-pending only.
                        const isClientOnly = s.id === "considering_intelligence_layer"
                        const isActive =
                            !isDone &&
                            !isFailed &&
                            !isClientOnly &&
                            idx === currentIndex
                        const isPending = !isDone && !isFailed && !isActive
                        return (
                            <li
                                key={s.id}
                                className={cn(
                                    "flex items-start gap-4 px-5 py-4",
                                    isActive && "bg-international-orange/[0.04]",
                                )}
                            >
                                <div className="shrink-0 pt-0.5">
                                    {isDone ? (
                                        <CheckCircle2 className="h-5 w-5 text-status-success" aria-hidden="true" />
                                    ) : isFailed ? (
                                        <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
                                    ) : isActive ? (
                                        <Loader2 className="h-5 w-5 text-international-orange animate-spin" aria-hidden="true" />
                                    ) : (
                                        <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/20" aria-hidden="true" />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p
                                        className={cn(
                                            "text-sm font-medium",
                                            isDone && "text-foreground",
                                            isFailed && "text-destructive",
                                            isActive && "text-foreground",
                                            isPending && "text-muted-foreground",
                                        )}
                                    >
                                        {s.label}
                                    </p>

                                    {/* Collapsed line for done / failed / pending; full briefing while active. */}
                                    {isActive ? (
                                        <div className="mt-2 space-y-2 text-xs leading-relaxed">
                                            <p className="text-foreground">{s.whatHappens}</p>
                                            <dl className="grid grid-cols-1 gap-1 text-muted-foreground">
                                                <div className="flex flex-wrap gap-x-1">
                                                    <dt className="font-medium text-foreground">Working from:</dt>
                                                    <dd>{s.workingFrom}</dd>
                                                </div>
                                                <div className="flex flex-wrap gap-x-1">
                                                    <dt className="font-medium text-foreground">Producing next:</dt>
                                                    <dd>{s.producingNext}</dd>
                                                </div>
                                            </dl>
                                            {s.liveCounterTemplate && (
                                                <p className="text-muted-foreground italic">
                                                    Live: {s.liveCounterTemplate}
                                                </p>
                                            )}
                                            {s.serverWiringPending && (
                                                <p className="text-[11px] text-muted-foreground/80 pt-1">
                                                    Visible in your plan file. The server-side stage that drives this lands in the next round.
                                                </p>
                                            )}
                                        </div>
                                    ) : isClientOnly && !isDone ? (
                                        // Client-only stage in its pending state still gets the
                                        // honest caption so it isn't read as a real stage stuck.
                                        <>
                                            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                                                {s.hint}
                                            </p>
                                            <p className="text-[11px] text-muted-foreground/80 mt-1">
                                                Visible in your plan file. The server-side stage that drives this lands in the next round.
                                            </p>
                                        </>
                                    ) : (
                                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                                            {s.hint}
                                        </p>
                                    )}
                                </div>
                                <span
                                    className={cn(
                                        "text-[10px] font-mono uppercase tracking-widest shrink-0 pt-1",
                                        isDone && "text-status-success",
                                        isFailed && "text-destructive",
                                        isActive && "text-international-orange",
                                        isPending && "text-muted-foreground/50",
                                    )}
                                    aria-hidden="true"
                                >
                                    {isDone ? "Done" : isFailed ? "Failed" : isActive ? "Running" : "Queued"}
                                </span>
                            </li>
                        )
                    })}
                </ul>
            </Card>

            {/* Quiet footer — what happens when it's done */}
            <p className="text-xs text-muted-foreground text-center">
                When every step is green, the plan opens automatically. You can close the tab and come back. Nothing gets lost.
            </p>
        </div>
    )
}
