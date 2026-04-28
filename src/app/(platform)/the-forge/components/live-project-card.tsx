"use client"

/**
 * @file live-project-card.tsx — Dashboard project card with live autopilot polling.
 *
 * @description Wraps the static CadLab project card with live polling against
 * /api/forge-status/[id] every 8 seconds while the autopilot is in a non-terminal
 * state. Terminal states (done / failed / never-started) render statically and
 * do NOT poll.
 *
 * Visual signals:
 *   - Pulsing orange dot (#ff4500) next to the stage label when actively running
 *   - Live stage label from STAGE_NARRATIVES[currentStage].label
 *   - One-line inFlight commentary beneath the label while running
 *   - Progress bar numerator updates live from completedStages.length
 *   - Check-circle on done; static badge on failed; nothing when no autopilot
 *
 * Voice rules (per CLAUDE.md):
 *   - British spelling
 *   - No acronyms
 *   - No failure-mode framing
 *   - No AI emphasis
 */

import { useEffect, useRef, useState, useCallback } from "react"
import Image from "next/image"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { Clock, Flame, CheckCircle2 } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cadLabProjectUrl } from "@/lib/forge-routes"
import { PromoteToProductButton } from "./promote-to-product-button"
import { STAGE_NARRATIVES } from "@/lib/forge-narrative/stage-narratives"
import type { CadLabProjectSummary } from "@/actions/cad-lab-projects"
import type { AutopilotStage } from "@/actions/forge-v2-autopilot"

// ─── Poll interval ────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 8_000

// ─── Terminal stages — cards in these states do NOT poll ─────────────────────
const TERMINAL_STAGES = new Set<AutopilotStage>(["done", "failed"])

// ─── Static stage config (legacy status → label + badge) ─────────────────────
// Mirrors the STAGE_CONFIG in recent-projects-grid.tsx so terminal / never-started
// projects use the same friendly labels as before.
const LEGACY_STAGE_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "success" | "warning" | "info" }> = {
    draft: { label: "Not yet started", variant: "secondary" },
    researched: { label: "Market researched", variant: "info" },
    interface_ready: { label: "Architecture in progress", variant: "warning" },
    generated: { label: "Report generating", variant: "warning" },
    complete: { label: "Report ready", variant: "success" },
}

// ─── Progress mapping (legacy status → completed stage count out of 12) ───────
const LEGACY_PIPELINE_PROGRESS: Record<string, number> = {
    draft: 0,
    researched: 2,
    interface_ready: 5,
    generated: 10,
    complete: 12,
}
const PIPELINE_TOTAL = 12

// ─── Types ────────────────────────────────────────────────────────────────────

interface LiveStatus {
    currentStage: AutopilotStage | null
    completedStages: AutopilotStage[]
    finishedAt: string | null
    errorMessage: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Determine whether a project needs live polling.
 * Projects that never ran autopilot, or whose autopilot has ended (done / failed),
 * do NOT poll.
 */
function isActivelyRunning(state: CadLabProjectSummary["autopilotState"]): boolean {
    if (!state) return false
    if (state.finished_at) return false
    const stage = state.stage as AutopilotStage
    return !TERMINAL_STAGES.has(stage)
}

/**
 * Derive the initial live status from the autopilot state baked into the
 * server-rendered project summary. Avoids a gratuitous first fetch.
 */
function initialLiveStatus(state: CadLabProjectSummary["autopilotState"]): LiveStatus | null {
    if (!state) return null
    return {
        currentStage: state.stage as AutopilotStage,
        completedStages: state.completed_stages as AutopilotStage[],
        finishedAt: state.finished_at,
        errorMessage: state.error ?? null,
    }
}

// ─── Sub-component: Pulsing live indicator ────────────────────────────────────

function PulseDot(): React.ReactElement {
    return (
        <span className="relative flex h-2 w-2 shrink-0" aria-label="live update in progress">
            <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                style={{ backgroundColor: "#ff4500" }}
            />
            <span
                className="relative inline-flex rounded-full h-2 w-2"
                style={{ backgroundColor: "#ff4500" }}
            />
        </span>
    )
}

// ─── Main card ────────────────────────────────────────────────────────────────

interface LiveProjectCardProps {
    project: CadLabProjectSummary
    canPromote?: boolean
}

/**
 * @description Project card that live-polls /api/forge-status/[id] while the
 * autopilot is actively running. Degrades gracefully: projects that have never
 * started autopilot or have finished (done / failed) render statically with no
 * polling overhead.
 */
export function LiveProjectCard({ project, canPromote }: LiveProjectCardProps): React.ReactElement {
    const displayName = project.subject || project.name || "Untitled Project"

    // Derive initial state from server-rendered autopilot_state
    const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(() =>
        initialLiveStatus(project.autopilotState)
    )

    // Track whether we are currently polling
    const pollingRef = useRef(false)
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

    // Determine the stage to display (prefer live, fall back to static)
    const currentStage: AutopilotStage | null = liveStatus?.currentStage ?? null
    const completedStages: AutopilotStage[] = liveStatus?.completedStages ?? []
    const finishedAt: string | null = liveStatus?.finishedAt ?? null

    // Is the engine currently in flight?
    const isRunning = currentStage !== null && !TERMINAL_STAGES.has(currentStage) && !finishedAt

    // Poll the status endpoint
    const poll = useCallback(async () => {
        if (pollingRef.current) return // prevent concurrent fetches
        pollingRef.current = true
        try {
            const res = await fetch(`/api/forge-status/${project.id}`, { cache: "no-store" })
            if (!res.ok) return
            const data = await res.json() as {
                currentStage: AutopilotStage | null
                completedStages: AutopilotStage[]
                finishedAt: string | null
                errorMessage: string | null
            }
            setLiveStatus({
                currentStage: data.currentStage,
                completedStages: data.completedStages ?? [],
                finishedAt: data.finishedAt,
                errorMessage: data.errorMessage,
            })
        } catch {
            // non-fatal — silently skip this tick
        } finally {
            pollingRef.current = false
        }
    }, [project.id])

    // Start / stop polling based on whether the project is actively running
    useEffect(() => {
        const shouldPoll = isActivelyRunning(project.autopilotState) || isRunning
        if (!shouldPoll) {
            // Clear any existing interval and bail
            if (intervalRef.current !== null) {
                clearInterval(intervalRef.current)
                intervalRef.current = null
            }
            return
        }

        // Start interval — immediate first tick so the card updates straight away
        void poll()
        intervalRef.current = setInterval(() => { void poll() }, POLL_INTERVAL_MS)

        return () => {
            if (intervalRef.current !== null) {
                clearInterval(intervalRef.current)
                intervalRef.current = null
            }
        }
        // INTENT: we deliberately only depend on isRunning and project.id so the
        // interval doesn't reset on every render. poll() is stable via useCallback.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isRunning, project.id])

    // Stop polling once we detect a terminal state from the server
    useEffect(() => {
        if (currentStage && TERMINAL_STAGES.has(currentStage)) {
            if (intervalRef.current !== null) {
                clearInterval(intervalRef.current)
                intervalRef.current = null
            }
        }
    }, [currentStage])

    // ─── Render helpers ───────────────────────────────────────────────────────

    // Live stage narrative (from STAGE_NARRATIVES) when autopilot is active
    const liveNarrative = currentStage && currentStage !== "done" && currentStage !== "failed"
        ? STAGE_NARRATIVES[currentStage]
        : null

    // Progress: prefer live completedStages count, else fall back to legacy map
    const liveProgress = completedStages.length
    const legacyProgress = LEGACY_PIPELINE_PROGRESS[project.status] ?? 0
    const progress = liveStatus ? liveProgress : legacyProgress

    // Badge: live overrides legacy
    function renderBadge(): React.ReactElement {
        if (isRunning && liveNarrative) {
            return (
                <Badge variant="warning" className="gap-1.5 items-center">
                    <PulseDot />
                    {liveNarrative.label}
                </Badge>
            )
        }
        if (currentStage === "done" || finishedAt) {
            return (
                <Badge variant="success" className="gap-1 items-center">
                    <CheckCircle2 className="h-3 w-3" />
                    Report ready
                </Badge>
            )
        }
        if (currentStage === "failed") {
            return <Badge variant="destructive">Stopped</Badge>
        }
        // Fall back to legacy status badge
        const legacy = LEGACY_STAGE_CONFIG[project.status] ?? LEGACY_STAGE_CONFIG.draft
        return <Badge variant={legacy.variant}>{legacy.label}</Badge>
    }

    // ─── Card JSX ─────────────────────────────────────────────────────────────

    return (
        <Link href={cadLabProjectUrl(project.id)}>
            <Card className="group cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5">
                {/* Thumbnail */}
                <div className="h-32 rounded-t-xl overflow-hidden bg-gradient-to-br from-international-orange/5 to-muted relative">
                    {project.thumbnailSvg ? (
                        <Image
                            src={project.thumbnailSvg}
                            alt={`${displayName} thumbnail`}
                            fill
                            className="object-contain p-4"
                            unoptimized
                        />
                    ) : project.systemIllustrationUrl ? (
                        <Image
                            src={project.systemIllustrationUrl}
                            alt={`${displayName} overview`}
                            fill
                            className="object-cover"
                            unoptimized
                        />
                    ) : (
                        <div className="flex items-center justify-center h-full">
                            <Flame className="h-10 w-10 text-international-orange/30" />
                        </div>
                    )}
                    <div className="absolute top-3 right-3">
                        {renderBadge()}
                    </div>
                </div>

                <CardContent className="pt-4 space-y-2">
                    {/* Project name */}
                    <h3 className="font-semibold text-foreground line-clamp-2 group-hover:text-international-orange transition-colors">
                        {displayName}
                    </h3>

                    {/* In-flight commentary — only shown while actively running */}
                    {isRunning && liveNarrative && (
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            {liveNarrative.inFlight}
                        </p>
                    )}

                    {/* Timestamp */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}
                        </span>
                    </div>

                    {/* Pipeline progress bar — x/12 stages, updates live */}
                    <div className="flex items-center gap-2">
                        <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                            <div
                                className="h-full bg-international-orange rounded-full transition-all duration-500"
                                style={{ width: `${(progress / PIPELINE_TOTAL) * 100}%` }}
                            />
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums">
                            {progress}/{PIPELINE_TOTAL} stages
                        </span>
                    </div>

                    {/* Promote to Product — eligible projects only */}
                    {canPromote && (
                        <div className="pt-1">
                            <PromoteToProductButton projectId={project.id} />
                        </div>
                    )}
                </CardContent>
            </Card>
        </Link>
    )
}
