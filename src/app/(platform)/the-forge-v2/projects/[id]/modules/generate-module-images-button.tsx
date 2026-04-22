"use client"

/**
 * @file generate-module-images-button.tsx — trigger for the tab-close-safe
 * per-module render chain.
 *
 * @description Previous implementation ran a sequential client-side for-
 * loop via generateOneModuleImage. That loop died whenever the browser
 * navigated away, closed the tab, or hit a network blip — modules past
 * the in-flight call never dispatched. Observed 2026-04-21: Container
 * Farm CF-40's Starboard Grow Rack was never rendered because I
 * navigated agent-browser to /suppliers mid-loop.
 *
 * New pattern: one server action call (startRenderAllRemainingModuleImages)
 * seeds state + schedules stage 1 via after(); the server chain then
 * walks every unrendered module with its own <300s Vercel budget per
 * stage. Browser closes / navigates / crashes — doesn't matter, server
 * keeps going. Progress surfaces via router.refresh() polling the
 * image_render_state jsonb column.
 *
 * Founders re-clicking after coming back to the tab hit ALREADY_RUNNING
 * if the chain is still in flight (UI shows live progress); if it
 * finished with failures they can click again to pick up the stragglers.
 *
 * @related
 *   - Server chain: src/actions/forge-v2-render-all-modules.ts
 *   - Migration: applied 2026-04-21 via Supabase MCP
 *     (adds image_render_state jsonb)
 *   - Single-module engine: src/actions/forge-v2-generate-one-module-image.ts
 */

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import {
    startRenderAllRemainingModuleImages,
    type ImageRenderState,
} from "@/actions/forge-v2-render-all-modules"

interface GenerateModuleImagesButtonProps {
    projectId: string
    /** Every module on the project, passed so the button can render
     *  labels ("Render remaining N of M"). Not used for loop driving
     *  anymore — the server owns that. */
    modules: Array<{
        id: string
        name: string
        hasImage: boolean
        mirrorOf: string | null
    }>
    /** Current server-side render state. Null if the chain has never
     *  run on this project. Loaded in the page and passed through so
     *  the initial render doesn't need to wait for a fetch. */
    initialRenderState: ImageRenderState | null
}

const POLL_INTERVAL_MS = 10_000
// Mirrors STALL_THRESHOLD_MS in src/actions/forge-v2-render-all-modules.ts.
// If a chain's started_at is older than this with finished_at still null,
// the server-side recovery branch will restart the chain on next click —
// but the client has to let founders actually click. Without this check
// the button stays disabled forever and the stall is unrecoverable from
// the UI. See bug 2026-04-22: OpenAI/Gemini per-module calls hang >15 min.
const STALL_MS = 15 * 60 * 1000

export function GenerateModuleImagesButton({
    projectId,
    modules,
    initialRenderState,
}: GenerateModuleImagesButtonProps): React.ReactElement {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [clickError, setClickError] = useState<string | null>(null)

    const moduleCount = modules.length
    const renderedCount = modules.filter((m) => m.hasImage).length

    const state = initialRenderState
    const isStalled =
        state !== null &&
        state.finished_at === null &&
        Date.now() - Date.parse(state.started_at) > STALL_MS
    const isRunning =
        state !== null && state.finished_at === null && !isStalled
    const isFinished =
        state !== null && state.finished_at !== null

    // ── Polling ─────────────────────────────────────────────────────────
    // router.refresh() re-reads image_render_state from the server
    // component tree. Stops as soon as the chain finishes. No cleanup
    // needed on isRunning = false — setInterval is already cleared by
    // the previous effect run.
    useEffect(() => {
        if (!isRunning) return
        const t = setInterval(() => {
            router.refresh()
        }, POLL_INTERVAL_MS)
        return () => clearInterval(t)
    }, [isRunning, router])

    const handleClick = (): void => {
        if (moduleCount === 0) return
        setClickError(null)
        startTransition(() => {
            void (async () => {
                const res = await startRenderAllRemainingModuleImages(projectId)
                if (!res.ok) {
                    // ALREADY_RUNNING is a valid no-op — the server is
                    // already doing what we wanted. Don't show as error.
                    if (res.errorCode === "ALREADY_RUNNING") {
                        router.refresh()
                        return
                    }
                    setClickError(res.error)
                    return
                }
                router.refresh()
            })()
        })
    }

    const disabled = isRunning || isPending || moduleCount === 0
    const showingLive = isRunning || isPending

    // ── Labels ──────────────────────────────────────────────────────────
    const currentModule = state?.current_id
        ? modules.find((m) => m.id === state.current_id)
        : null
    const progress = state
        ? state.completed_ids.length + state.failed_ids.length
        : 0

    const runningLabel = state
        ? `Rendering ${progress + 1} of ${state.total}${
              currentModule ? " · " + currentModule.name : ""
          }…`
        : "Starting…"

    const allRendered = moduleCount > 0 && renderedCount === moduleCount
    const idleLabel = isStalled
        ? "Previous run stalled — click to restart"
        : allRendered
            ? "Re-render all modules"
            : renderedCount > 0
                ? `Render remaining ${moduleCount - renderedCount} of ${moduleCount}`
                : "Generate module renders"

    // Per-module render is ~1 min on gpt-image-2 default quality.
    // Chain runs 2-at-a-time, so an N-module project finishes in ~N/2 minutes
    // wall-clock. A typical 8-10 module project lands in 4-5 min; we state
    // "about 3 minutes" as the expectation because the first module is
    // usable within 60s and most founders don't watch the whole chain.
    const disabledTitle =
        moduleCount === 0
            ? "Run Max's decomposition first — module renders generate once modules exist."
            : "Each module render takes about 1 minute. The full set takes around 3 minutes and runs server-side — you can leave this page and come back."

    return (
        <div
            className="m2-gen-images-wrap"
            style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}
        >
            <button
                type="button"
                className="m2-btn"
                onClick={handleClick}
                disabled={disabled}
                aria-busy={showingLive}
                title={disabledTitle}
            >
                {showingLive ? runningLabel : idleLabel}
            </button>
            {isRunning && state && (
                <span
                    className="m2-gen-images-progress"
                    style={{ fontSize: 13, color: "var(--muted-foreground, #6b7280)" }}
                    title="The render chain lives on the server — you can close this tab and come back, progress keeps going."
                >
                    {state.completed_ids.length} done
                    {state.failed_ids.length > 0
                        ? ` · ${state.failed_ids.length} failed`
                        : ""}
                    {" · about 3 min total · safe to leave this page"}
                </span>
            )}
            {isFinished && state && !isRunning && (
                <span
                    className="m2-gen-images-result"
                    style={{ fontSize: 13, color: "var(--muted-foreground, #6b7280)" }}
                >
                    {state.completed_ids.length > 0
                        ? `Generated ${state.completed_ids.length} render${state.completed_ids.length === 1 ? "" : "s"}` +
                          (state.failed_ids.length > 0
                              ? ` · ${state.failed_ids.length} failed (click to retry)`
                              : "")
                        : state.failed_ids.length > 0
                            ? `${state.failed_ids.length} render${state.failed_ids.length === 1 ? "" : "s"} failed — please retry.`
                            : "No renders generated."}
                </span>
            )}
            {isStalled && (
                <span
                    className="m2-gen-images-stalled"
                    style={{ fontSize: 13, color: "#b45309" }}
                >
                    Previous chain stalled — click to resume from where it left off.
                </span>
            )}
            {!showingLive && !isFinished && !isStalled && moduleCount > 0 && !allRendered && (
                <span
                    className="m2-gen-images-hint"
                    style={{ fontSize: 13, color: "var(--muted-foreground, #6b7280)" }}
                >
                    About 3 minutes · runs in the background · you can leave this page
                </span>
            )}
            {clickError && (
                <span
                    className="m2-gen-images-result"
                    style={{ fontSize: 13, color: "#dc2626" }}
                >
                    {clickError}
                </span>
            )}
        </div>
    )
}
