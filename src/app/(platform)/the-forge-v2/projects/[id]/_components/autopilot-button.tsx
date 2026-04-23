"use client"

/**
 * @file autopilot-button.tsx — Workspace CTA for the one-click V2 pipeline walk.
 *
 * @description Three visual states, driven by `autopilot_state` on the
 * server:
 *
 *   1. NULL      → "Run autopilot" primary CTA
 *   2. Running   → Disabled chip: "Autopilot running · {stage}" + last-
 *                  updated timestamp. Component polls router.refresh()
 *                  every 15s so the chip advances as stages complete.
 *   3. Finished  → Green chip: "Autopilot finished · {n} stages complete".
 *                  Also handles the failure terminal state:
 *                  "Autopilot stopped · {stage} failed".
 *
 * The autopilot walk itself runs post-response via next/server's after()
 * — the click handler only seeds initial state + schedules stage 1.
 * From the founder's point of view, the button immediately transitions
 * to "Running" and they can close the tab.
 *
 * Server-driven polling via router.refresh(): simpler than a websocket,
 * and the autopilot state column is the single source of truth so no
 * client-side state machine is needed.
 */

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import {
    startAutopilot,
    type AutopilotStage,
    type AutopilotState,
    type StartAutopilotResult,
} from "@/actions/forge-v2-autopilot"

interface AutopilotButtonProps {
    projectId: string
    /** Current autopilot state from the server. Null = never run. */
    autopilotState: AutopilotState | null
}

const STAGE_LABELS: Record<AutopilotStage, string> = {
    waiting_chase: "waiting for research",
    locking_brief: "locking brief",
    waiting_max: "waiting for Max",
    waiting_sizing: "sizing the design (Fang)",
    waiting_layout: "laying out spatial plan (Fang)",
    waiting_bom: "waiting for BOM",
    waiting_finn: "waiting for Finn",
    generating_illustration: "illustrating system",
    matching_suppliers: "matching suppliers",
    running_fang_reviews: "running Fang reviews",
    generating_pdf: "generating PDF pack",
    done: "done",
}

const POLL_INTERVAL_MS = 15_000

export function AutopilotButton({
    projectId,
    autopilotState,
}: AutopilotButtonProps): React.ReactElement {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [clickError, setClickError] = useState<string | null>(null)

    const isRunning =
        autopilotState !== null && autopilotState.finished_at === null
    const isFinished =
        autopilotState !== null && autopilotState.finished_at !== null
    const hasFailed = isFinished && autopilotState.failed_stages.length > 0

    // ── Polling while running ─────────────────────────────────────────
    // router.refresh() re-fetches the server component tree which
    // re-reads autopilot_state, so the chip advances as the walk
    // progresses. We stop polling as soon as the server says we're done.
    useEffect(() => {
        if (!isRunning) return
        const t = setInterval(() => {
            router.refresh()
        }, POLL_INTERVAL_MS)
        return () => {
            clearInterval(t)
        }
    }, [isRunning, router])

    const handleStart = (): void => {
        setClickError(null)
        startTransition(() => {
            void (async () => {
                let res: StartAutopilotResult
                try {
                    res = await startAutopilot(projectId)
                } catch (err) {
                    setClickError(
                        err instanceof Error
                            ? err.message
                            : "Couldn't start autopilot.",
                    )
                    return
                }
                if (!res.ok) {
                    setClickError(res.error)
                    return
                }
                // Immediately refresh so the button flips to "running"
                // without waiting for the first poll.
                router.refresh()
            })()
        })
    }

    // ── Render ────────────────────────────────────────────────────────

    if (isRunning) {
        const stageLabel =
            STAGE_LABELS[autopilotState.stage] ?? autopilotState.stage
        return (
            <button
                type="button"
                className="w2-btn sm"
                disabled
                aria-busy
                title={`Autopilot is walking the pipeline. Started ${formatRelative(autopilotState.started_at)}.`}
                style={{ cursor: "not-allowed" }}
            >
                Autopilot running · {stageLabel}
                <span
                    style={{
                        marginLeft: 8,
                        fontSize: 11,
                        opacity: 0.7,
                    }}
                >
                    {formatRelative(autopilotState.started_at)}
                </span>
            </button>
        )
    }

    if (isFinished) {
        if (hasFailed) {
            const failedStage = autopilotState.failed_stages[0]
            const label = failedStage
                ? (STAGE_LABELS[failedStage as AutopilotStage] ?? failedStage)
                : "unknown"
            return (
                <div style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
                    <button
                        type="button"
                        className="w2-btn sm ghost"
                        onClick={handleStart}
                        disabled={isPending}
                        title={
                            autopilotState.error ??
                            "Autopilot stopped on a failed stage. Click to restart."
                        }
                    >
                        Autopilot stopped · {label} failed · Restart?
                    </button>
                    {clickError ? (
                        <span style={{ fontSize: 12, color: "#dc2626" }}>
                            {clickError}
                        </span>
                    ) : null}
                </div>
            )
        }
        return (
            <button
                type="button"
                className="w2-btn sm"
                disabled
                title={`Finished ${formatRelative(autopilotState.finished_at!)}.`}
                style={{
                    color: "#047857",
                    borderColor: "#a7f3d0",
                    background: "#ecfdf5",
                }}
            >
                Autopilot finished · {autopilotState.completed_stages.length}{" "}
                stage{autopilotState.completed_stages.length === 1 ? "" : "s"}{" "}
                complete
            </button>
        )
    }

    // Idle — never run, or the state is null.
    return (
        <div style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
            <button
                type="button"
                className="w2-btn primary"
                onClick={handleStart}
                disabled={isPending}
                aria-busy={isPending}
                title="Walks Chase → Max → BOM → Finn → illustration → suppliers → Fang reviews. About 10-20 minutes. You can close this tab."
            >
                {isPending ? "Starting…" : "Run autopilot"}
            </button>
            {clickError ? (
                <span style={{ fontSize: 12, color: "#dc2626" }}>
                    {clickError}
                </span>
            ) : null}
        </div>
    )
}

// ─── Helpers ───────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
    const t = new Date(iso).getTime()
    if (!Number.isFinite(t)) return ""
    const diffMs = Date.now() - t
    const diffSec = Math.round(diffMs / 1000)
    if (diffSec < 60) return `${diffSec}s ago`
    const diffMin = Math.round(diffSec / 60)
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHr = Math.round(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h ago`
    return new Date(iso).toLocaleDateString()
}
