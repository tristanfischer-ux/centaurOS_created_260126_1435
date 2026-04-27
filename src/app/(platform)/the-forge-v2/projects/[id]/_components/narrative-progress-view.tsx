/**
 * @file narrative-progress-view.tsx — founder-facing brief→PDF progress page.
 *
 * @description Replaces the engine-internals "running state" with a clean
 * narrative timeline that builds up as each stage completes. No specialist
 * names, no internal table names, no module pages exposed inline. The
 * final result is a downloadable PDF — that is the only artefact the
 * founder ever interacts with.
 *
 * Polls /api/forge-status/[id] every 5 seconds while running, slows to
 * 30 seconds once the run has finished (in case a re-render lands), and
 * stops entirely after 10 minutes idle.
 *
 * Voice rules per CLAUDE.md "Writing for Tristan":
 *   - No failure-mode framing
 *   - British spelling
 *   - No acronyms (spell every term out)
 *   - One clear next action per piece
 */

"use client"

import { useEffect, useRef, useState } from "react"
import { CheckCircle2, Circle, Download, Loader2 } from "lucide-react"

import type { AutopilotStage } from "@/actions/forge-v2-autopilot"
import {
    NARRATIVE_STAGE_ORDER,
    STAGE_NARRATIVES,
    TOTAL_STAGES,
    stageIndex,
} from "@/lib/forge-narrative/stage-narratives"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ForgeStatusResponse {
    projectName: string
    briefSummary: string | null
    currentStage: AutopilotStage | null
    completedStages: AutopilotStage[]
    finishedAt: string | null
    startedAt: string | null
    errorMessage: string | null
    pdfUrl: string | null
    pdfName: string | null
    pdfExpiresAt: string | null
}

interface NarrativeProgressViewProps {
    projectId: string
    initialProjectName: string
    initialBriefSummary: string | null
    initialStage: AutopilotStage | null
    initialCompletedStages: AutopilotStage[]
    initialFinishedAt: string | null
    initialErrorMessage: string | null
    initialPdfUrl: string | null
    initialPdfName: string | null
}

const POLL_INTERVAL_RUNNING_MS = 5_000
const POLL_INTERVAL_FINISHED_MS = 30_000
const POLL_STOP_AFTER_MS = 10 * 60 * 1000

export function NarrativeProgressView({
    projectId,
    initialProjectName,
    initialBriefSummary,
    initialStage,
    initialCompletedStages,
    initialFinishedAt,
    initialErrorMessage,
    initialPdfUrl,
    initialPdfName,
}: NarrativeProgressViewProps): React.ReactElement {
    const [status, setStatus] = useState<ForgeStatusResponse>(() => ({
        projectName: initialProjectName,
        briefSummary: initialBriefSummary,
        currentStage: initialStage,
        completedStages: initialCompletedStages,
        finishedAt: initialFinishedAt,
        startedAt: null,
        errorMessage: initialErrorMessage,
        pdfUrl: initialPdfUrl,
        pdfName: initialPdfName,
        pdfExpiresAt: null,
    }))

    const startedPollingAtRef = useRef<number>(Date.now())

    useEffect(() => {
        let cancelled = false

        async function tick(): Promise<void> {
            try {
                const res = await fetch(`/api/forge-status/${projectId}`, {
                    cache: "no-store",
                })
                if (!res.ok) return
                const json = (await res.json()) as ForgeStatusResponse
                if (cancelled) return
                setStatus(json)
            } catch {
                // network blips are silent — next tick will recover
            }
        }

        function nextDelay(): number | null {
            const elapsed = Date.now() - startedPollingAtRef.current
            if (elapsed > POLL_STOP_AFTER_MS) return null
            return status.finishedAt
                ? POLL_INTERVAL_FINISHED_MS
                : POLL_INTERVAL_RUNNING_MS
        }

        const delay = nextDelay()
        if (delay === null) return
        const interval = setInterval(() => {
            void tick()
        }, delay)

        // Fire one immediately to refresh state on mount.
        void tick()

        return () => {
            cancelled = true
            clearInterval(interval)
        }
    }, [projectId, status.finishedAt])

    const isFinished = status.finishedAt != null
    const hasPdf = !!status.pdfUrl
    const completedCount = status.completedStages.length
    const totalCount = TOTAL_STAGES
    const percent = Math.min(
        100,
        Math.round((completedCount / totalCount) * 100),
    )

    return (
        <div className="space-y-8">
            {/* ── Heading ─────────────────────────────────────────────── */}
            <header className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight">
                    {status.projectName}
                </h1>
                {status.briefSummary && (
                    <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
                        {status.briefSummary}
                    </p>
                )}
            </header>

            {/* ── Ready banner with download button ───────────────────── */}
            {hasPdf && (
                <Card className="border-international-orange/40 bg-international-orange/5">
                    <CardContent className="py-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 className="text-lg font-semibold">
                                Your plan is ready
                            </h2>
                            <p className="text-sm text-muted-foreground mt-1 max-w-md">
                                The full report is below as a downloadable PDF — cover summary,
                                modules, bill of materials, suppliers, risks, and the full audit log.
                            </p>
                        </div>
                        <Button
                            asChild
                            size="lg"
                            className="bg-international-orange hover:bg-international-orange/90 text-white gap-2"
                        >
                            <a
                                href={status.pdfUrl!}
                                target="_blank"
                                rel="noopener noreferrer"
                                download={status.pdfName ?? undefined}
                            >
                                <Download className="h-4 w-4" />
                                Download the plan
                            </a>
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* ── Soft error banner ──────────────────────────────────── */}
            {!hasPdf && isFinished && status.errorMessage && (
                <Card className="border-amber-500/30 bg-amber-50">
                    <CardContent className="py-5">
                        <p className="text-sm text-amber-900 leading-relaxed">
                            The Forge stopped before producing the final PDF. The most useful next
                            step is to refresh this page in a minute — the engine retries on its own.
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* ── Progress header ─────────────────────────────────────── */}
            {!hasPdf && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                        <p className="font-medium">
                            {isFinished
                                ? "Wrapping up"
                                : completedCount === 0
                                    ? "Getting started"
                                    : `Stage ${Math.min(
                                          completedCount + 1,
                                          totalCount,
                                      )} of ${totalCount}`}
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                            {percent}%
                        </p>
                    </div>
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                            className="h-full bg-international-orange transition-all duration-500"
                            style={{ width: `${percent}%` }}
                        />
                    </div>
                </div>
            )}

            {/* ── Vertical narrative timeline ──────────────────────────── */}
            <ol className="space-y-4">
                {NARRATIVE_STAGE_ORDER.map((stage, idx) => {
                    const narrative = STAGE_NARRATIVES[stage]
                    const isDone =
                        status.completedStages.includes(stage) ||
                        (status.currentStage != null &&
                            stageIndex(status.currentStage) > idx) ||
                        (isFinished && hasPdf)
                    const isCurrent =
                        !isDone &&
                        status.currentStage === stage &&
                        !isFinished
                    const isPending = !isDone && !isCurrent

                    return (
                        <li
                            key={stage}
                            className={cn(
                                "flex gap-4 transition-opacity",
                                isPending && "opacity-50",
                            )}
                        >
                            <div className="flex flex-col items-center pt-0.5">
                                {isDone ? (
                                    <CheckCircle2 className="h-5 w-5 text-international-orange shrink-0" />
                                ) : isCurrent ? (
                                    <Loader2 className="h-5 w-5 text-international-orange animate-spin shrink-0" />
                                ) : (
                                    <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
                                )}
                                {idx < NARRATIVE_STAGE_ORDER.length - 1 && (
                                    <div
                                        className={cn(
                                            "w-px flex-1 mt-2",
                                            isDone
                                                ? "bg-international-orange/40"
                                                : "bg-border",
                                        )}
                                    />
                                )}
                            </div>
                            <div className="pb-4 space-y-1">
                                <p
                                    className={cn(
                                        "font-medium leading-snug",
                                        isDone && "text-foreground",
                                        isCurrent && "text-foreground",
                                        isPending && "text-muted-foreground",
                                    )}
                                >
                                    {narrative.label}
                                </p>
                                {isDone && (
                                    <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
                                        {narrative.narrative}
                                    </p>
                                )}
                                {isCurrent && (
                                    <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
                                        {narrative.inFlight}
                                    </p>
                                )}
                            </div>
                        </li>
                    )
                })}
            </ol>

            {/* ── Footer reassurance while running ────────────────────── */}
            {!hasPdf && !isFinished && (
                <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
                    This page refreshes on its own. You can close the tab and come back —
                    your plan keeps building. Twenty minutes for the first pass, hours of
                    detail in the report itself.
                </p>
            )}
        </div>
    )
}
