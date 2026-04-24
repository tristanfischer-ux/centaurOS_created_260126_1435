/**
 * @file running-state.tsx — Progress checklist shown while autopilot runs.
 *
 * @description The "20-minute wait" screen. Shows a plain-language checklist
 * of what the Forge is doing right now, which steps have completed, and how
 * much more to go. Auto-refreshes every 12 seconds so founders see live
 * progress without having to reload.
 *
 * No specialist names (Max, Fang, Finn, Chase) appear here by design — V1
 * UX keeps the plumbing hidden.
 *
 * @related
 * - Container: ../page.tsx
 * - Autopilot stage type: @/actions/forge-v2-autopilot
 */

"use client"

import { useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Loader2, Clock, AlertTriangle } from "lucide-react"

import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { startAutopilot } from "@/actions/forge-v2-autopilot"

/** Plain-language step labels keyed by AutopilotStage. Must match the stage
 *  ids emitted by src/actions/forge-v2-autopilot.ts. */
const STAGES: Array<{ id: string; label: string; hint: string }> = [
    { id: "waiting_chase", label: "Researching the product space", hint: "Market, competitors, and regulatory signals." },
    { id: "locking_brief", label: "Locking rev 0.1 of the brief", hint: "Captures the version everything else builds on." },
    { id: "waiting_max", label: "Decomposing into modules", hint: "Splits the product into buildable subsystems." },
    { id: "waiting_sizing", label: "Sizing the system", hint: "Picks key dimensions, capacities, and counts." },
    { id: "waiting_layout", label: "Drafting the spatial plan", hint: "A top-down floor layout you can scale from." },
    { id: "waiting_bom", label: "Building the bill of materials", hint: "Parts per module with quantities and categories." },
    { id: "waiting_finn", label: "Estimating cost per unit", hint: "Unit cost with 80/20 sensitivity called out." },
    { id: "generating_illustration", label: "Drawing the system illustration", hint: "A hero render of the whole product." },
    { id: "matching_suppliers", label: "Matching suppliers", hint: "Shortlist across the parts that need sourcing." },
    { id: "running_fang_reviews", label: "Red-teaming every module", hint: "Design-for-manufacture review per module." },
    { id: "generating_pdf", label: "Compiling the plan", hint: "Inline plan + downloadable PDF." },
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

    // If finished, the server already redirected to /plan — but if for some
    // reason we land here with finished state, nudge to the plan.
    useEffect(() => {
        if (state?.finished_at && !state?.error) {
            router.replace(`/the-forge-v2/projects/${projectId}/plan`)
        }
    }, [state, projectId, router])

    function handleStart(): void {
        startTransition(async () => {
            const result = await startAutopilot(projectId)
            if (!result.ok) {
                // Surface via a simple alert for now — toast import chain
                // isn't needed since this is the "never-started" edge case.
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
                            This project hasn&apos;t been run yet. Starting takes about 20 minutes — you can close the tab and come back.
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
    const currentIndex = STAGES.findIndex((s) => s.id === state.stage)
    const totalStages = STAGES.length
    const doneCount = completed.size
    const progressPct = Math.round((doneCount / totalStages) * 100)
    const startedDate = new Date(state.started_at)
    const elapsedMin = Math.max(0, Math.round((Date.now() - startedDate.getTime()) / 60_000))
    const hasError = Boolean(state.error)

    return (
        <div className="space-y-6">
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
                                    : `${projectName} — ${doneCount} of ${totalStages} steps done, about ${Math.max(0, 20 - elapsedMin)} minutes to go.`}
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

            {/* Step checklist */}
            <Card className="rounded-xl overflow-hidden">
                <ul className="divide-y divide-border">
                    {STAGES.map((s, idx) => {
                        const isDone = completed.has(s.id)
                        const isFailed = failed.has(s.id)
                        const isActive = !isDone && !isFailed && idx === currentIndex
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
                                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                                        {s.hint}
                                    </p>
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
                When every step is green, the plan opens automatically. You can close the tab and come back — nothing gets lost.
            </p>
        </div>
    )
}
