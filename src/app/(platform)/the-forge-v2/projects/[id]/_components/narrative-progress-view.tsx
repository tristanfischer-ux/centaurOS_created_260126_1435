/**
 * @file narrative-progress-view.tsx — founder-facing brief→PDF progress page.
 *
 * @description Hosts the 12-stage NASA-mission-control progress timeline.
 * Polls /api/forge-status/[id] every 8 seconds while running, slows to
 * 30 seconds once the run has finished (in case a re-render lands), and
 * stops entirely after 10 minutes idle. Resume on return is server-side:
 * the stage state lives in autopilot_state on the project row, so closing
 * the tab and coming back picks up exactly where the engine is.
 *
 * Voice rules per CLAUDE.md "Writing for Tristan":
 *   - No failure-mode framing
 *   - British spelling
 *   - No acronyms (spell every term out)
 *   - One clear next action per piece
 *   - No AI emphasis
 */

"use client"

import { useEffect, useRef, useState } from "react"
import { Download } from "lucide-react"

import type { AutopilotStage } from "@/actions/forge-v2-autopilot"
import {
    TOTAL_STAGES,
} from "@/lib/forge-narrative/stage-narratives"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ProgressTimeline } from "./progress-timeline"
import type { StageOutcomes, StageDetails } from "./progress-timeline"

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
    stageOutcomes: StageOutcomes
    stageDetails: StageDetails
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

// Flow B spec: poll every 8 seconds while any stage is active.
const POLL_INTERVAL_RUNNING_MS = 8_000
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
        stageOutcomes: {},
        stageDetails: {},
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

            {/* ── NASA-mission-control 12-stage timeline ──────────────── */}
            <Card>
                <CardContent className="py-6 px-4 sm:px-6">
                    <ProgressTimeline
                        currentStage={status.currentStage}
                        completedStages={status.completedStages}
                        isFinished={isFinished && hasPdf}
                        stageOutcomes={status.stageOutcomes}
                        stageDetails={status.stageDetails}
                    />
                </CardContent>
            </Card>

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
