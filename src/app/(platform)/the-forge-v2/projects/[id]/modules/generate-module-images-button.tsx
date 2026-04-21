"use client"

/**
 * @file generate-module-images-button.tsx — per-module loop trigger.
 *
 * @description Generates Nano Banana blueprints for every module by calling
 * the per-module server action `generateOneModuleImage(projectId, moduleId)`
 * once per module, sequentially, with live progress.
 *
 * TRIED: a batch server action that rendered every module in one call
 * (`generateModuleImagesForProject`). Problem: 10 modules × ~30–60s per image
 * pushed the wall-clock past Vercel's 300s `maxDuration`, the function was
 * killed before the persist step, the button silently reset, and zero
 * modules landed. Evidence: project 352f5660 on 2026-04-21 — three attempts,
 * 0 modules persisted, no error surfaced.
 *
 * The per-module loop gives each call its own <300s budget (~60s typical).
 * On tab-close or network blip we can resume from the first module still
 * missing an imageUrl — no special state needed because the DB already
 * records progress.
 *
 * @related
 * - Per-module action: src/actions/forge-v2-generate-one-module-image.ts
 * - Legacy batch:      src/actions/forge-v2-generate-module-images.ts (retained)
 * - Sibling pattern:   src/app/(platform)/the-forge-v2/projects/[id]/suppliers/
 *                      match-with-chase-button.tsx
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { generateOneModuleImage } from "@/actions/forge-v2-generate-one-module-image"

interface GenerateModuleImagesButtonProps {
    projectId: string
    /** Every module on the project. Mirror modules (those with `mirrorOf`)
     *  are reordered internally so their primary renders first — the
     *  per-module server action then produces the mirror's image by
     *  flipping the primary's PNG instead of burning another Gemini call. */
    modules: Array<{
        id: string
        name: string
        hasImage: boolean
        mirrorOf: string | null
    }>
}

interface ProgressState {
    kind: "running"
    total: number
    completed: number
    failed: number
    currentName: string
}

type Status =
    | { kind: "idle" }
    | ProgressState
    | { kind: "done"; successCount: number; failedCount: number }
    | { kind: "error"; message: string }

export function GenerateModuleImagesButton({
    projectId,
    modules,
}: GenerateModuleImagesButtonProps): React.ReactElement {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [status, setStatus] = useState<Status>({ kind: "idle" })

    const moduleCount = modules.length
    const renderedCount = modules.filter((m) => m.hasImage).length
    const allRendered = moduleCount > 0 && renderedCount === moduleCount

    const handleClick = (): void => {
        if (moduleCount === 0) return
        // Resume semantics: only render modules that don't have an image
        // yet. Founders re-clicking after a tab close shouldn't re-pay for
        // images that already landed.
        const raw = modules.filter((m) => !m.hasImage)
        const base = raw.length === 0 ? [...modules] : raw

        // Reorder so primaries render BEFORE their mirrors. The per-module
        // server action short-circuits a mirror render by flipping the
        // primary's PNG (~100ms) instead of burning a fresh Gemini call
        // (~30-60s), but only when the primary already has an imageUrl.
        // The most common ordering bug ("Starboard Solar Wing rendered
        // first, Port Solar Wing rendered second, both take full time
        // and diverge visibly") is fixed here once.
        const primaries = base.filter((m) => !m.mirrorOf)
        const mirrors = base.filter((m) => m.mirrorOf)
        const queue = [...primaries, ...mirrors]

        setStatus({
            kind: "running",
            total: queue.length,
            completed: 0,
            failed: 0,
            currentName: queue[0]?.name ?? "",
        })

        startTransition(() => {
            void (async () => {
                let completed = 0
                let failed = 0
                for (const m of queue) {
                    setStatus({
                        kind: "running",
                        total: queue.length,
                        completed,
                        failed,
                        currentName: m.name,
                    })
                    try {
                        const res = await generateOneModuleImage(projectId, m.id)
                        if (res.ok) {
                            completed += 1
                            // Progressive refresh — founder sees each module
                            // flip from placeholder to real render as it
                            // lands, not a single snap at the end.
                            router.refresh()
                        } else {
                            failed += 1
                            console.warn(
                                `[generate-module-images] ${m.id} failed:`,
                                res.error,
                                res.errorCode,
                            )
                        }
                    } catch (err) {
                        failed += 1
                        console.error(
                            `[generate-module-images] ${m.id} threw:`,
                            err instanceof Error ? err.message : err,
                        )
                    }
                }
                setStatus({
                    kind: "done",
                    successCount: completed,
                    failedCount: failed,
                })
                router.refresh()
            })()
        })
    }

    const running = isPending || status.kind === "running"
    const disabled = running || moduleCount === 0

    const runningLabel =
        status.kind === "running"
            ? `Rendering ${status.completed + 1} of ${status.total}${
                  status.currentName ? " · " + status.currentName : ""
              }…`
            : "Generating…"

    const idleLabel = allRendered
        ? "Re-render all modules"
        : renderedCount > 0
            ? `Render remaining ${moduleCount - renderedCount} of ${moduleCount}`
            : "Generate module renders"

    const disabledTitle =
        moduleCount === 0
            ? "Run Max's decomposition first — module renders generate once modules exist."
            : "Each module gets its own Nano Banana blueprint (~30–60s per module)."

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
                aria-busy={running}
                title={disabledTitle}
            >
                {running ? runningLabel : idleLabel}
            </button>
            {status.kind === "running" && (
                <span
                    className="m2-gen-images-progress"
                    style={{ fontSize: 13, color: "var(--muted-foreground, #6b7280)" }}
                >
                    {status.completed} done
                    {status.failed > 0 ? ` · ${status.failed} failed` : ""}
                </span>
            )}
            {status.kind === "done" && (
                <span
                    className="m2-gen-images-result"
                    style={{ fontSize: 13, color: "var(--muted-foreground, #6b7280)" }}
                >
                    {status.successCount > 0
                        ? `Generated ${status.successCount} render${status.successCount === 1 ? "" : "s"}` +
                          (status.failedCount > 0
                              ? ` · ${status.failedCount} failed (retry the button)`
                              : "")
                        : status.failedCount > 0
                            ? `${status.failedCount} render${status.failedCount === 1 ? "" : "s"} failed — please retry.`
                            : "No renders generated."}
                </span>
            )}
            {status.kind === "error" && (
                <span
                    className="m2-gen-images-result"
                    style={{ fontSize: 13, color: "#dc2626" }}
                >
                    {status.message}
                </span>
            )}
        </div>
    )
}
