"use client"

/**
 * @file generate-module-images-button.tsx — V2 Modules trigger for per-module
 *   render generation.
 *
 * @description Calls `generateModuleImagesForProject()`, which fans out the
 * existing CAD Lab per-module image generator across every module on the
 * project and persists each new `imageUrl` back onto `cad_lab_projects.modules`.
 * On success we `router.refresh()` so the Modules page re-reads the now-
 * populated modules array and the module detail pages' Nano Banana slots
 * flip from "Concept render not yet generated" to the real blueprint.
 *
 * Generation is slow (~15–30s per module × up to 10 modules ≈ 2.5–5 min end
 * to end). Inside Vercel's 300s cap for typical 8–10-module projects, but
 * the UI needs to make the wait explicit or founders will assume the app
 * froze and refresh. We surface the module count in the spinner label and
 * disable the button while pending.
 *
 * @related
 * - Action:   src/actions/forge-v2-generate-module-images.ts
 * - Sibling:  src/app/(platform)/the-forge-v2/projects/[id]/suppliers/
 *             match-with-chase-button.tsx (pattern reference)
 * - Parent:   modules-view.tsx
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { generateModuleImagesForProject } from "@/actions/forge-v2-generate-module-images"

interface GenerateModuleImagesButtonProps {
    projectId: string
    /** How many modules exist on the project — used for the spinner label
     *  ("Generating 9 module renders…") and to disable the button when 0. */
    moduleCount: number
}

type Status =
    | { kind: "idle" }
    | { kind: "running" }
    | { kind: "done"; successCount: number; failedCount: number }
    | { kind: "error"; message: string }

export function GenerateModuleImagesButton({
    projectId,
    moduleCount,
}: GenerateModuleImagesButtonProps): React.ReactElement {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [status, setStatus] = useState<Status>({ kind: "idle" })

    const handleClick = (): void => {
        setStatus({ kind: "running" })
        startTransition(() => {
            void (async () => {
                try {
                    const res = await generateModuleImagesForProject(projectId)
                    if (!res.ok) {
                        setStatus({
                            kind: "error",
                            message: res.error ?? "Couldn't generate module renders.",
                        })
                        return
                    }
                    setStatus({
                        kind: "done",
                        successCount: res.successCount,
                        failedCount: res.failedCount,
                    })
                    // Re-render the server components so the persisted
                    // imageUrls flow through to module detail pages.
                    router.refresh()
                } catch (err) {
                    setStatus({
                        kind: "error",
                        message: err instanceof Error ? err.message : "Unknown error",
                    })
                }
            })()
        })
    }

    const running = isPending || status.kind === "running"
    const disabled = running || moduleCount === 0

    const runningLabel =
        moduleCount === 1
            ? "Generating 1 module render…"
            : `Generating ${moduleCount} module renders…`

    const idleLabel = "Generate module renders"

    // Honest tooltip when disabled — never pretend the action is available
    // before decomposition has produced modules.
    const disabledTitle =
        moduleCount === 0
            ? "Run Max's decomposition first — module renders generate once modules exist."
            : "Each module gets a Nano Banana blueprint (~15–30s per module)."

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
            {status.kind === "done" && (
                <span
                    className="m2-gen-images-result"
                    style={{ fontSize: 13, color: "var(--muted-foreground, #6b7280)" }}
                >
                    {status.successCount > 0
                        ? `Generated ${status.successCount} render${status.successCount === 1 ? "" : "s"}` +
                          (status.failedCount > 0
                              ? ` · ${status.failedCount} failed`
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
