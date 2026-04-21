"use client"

/**
 * @file generate-system-illustration-button.tsx — V2 Modules hero action.
 *
 * @description Triggers the orchestrator that generates a 16:9 system
 * illustration for the project and writes the URL to
 * `cad_lab_projects.system_illustration_url`. On success, calls
 * `router.refresh()` so the Modules hero pane re-renders with the new image
 * instead of the "pending" blueprint placeholder.
 *
 * Empty-state policy: if the project has no modules yet, the button is
 * disabled with a title explaining Max needs to decompose first. We never
 * fake a URL or a success message.
 *
 * Label semantics:
 *   - "Generate system illustration" — no illustration exists yet
 *   - "Generating…"                  — request in flight
 *   - "Re-generate illustration"     — an illustration already exists and
 *                                      the button will overwrite it
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { generateSystemIllustrationForProject } from "@/actions/forge-v2-generate-system-illustration"

interface GenerateSystemIllustrationButtonProps {
    projectId: string
    /** True when the project already has modules — required precondition
     *  for the inner action to have anything to illustrate. */
    hasModules: boolean
    /** True when the project already has a rendered illustration URL —
     *  tunes the label from "Generate" to "Re-generate". */
    hasExisting: boolean
}

type Status =
    | { kind: "idle" }
    | { kind: "running" }
    | { kind: "done"; url: string }
    | { kind: "error"; message: string }

export function GenerateSystemIllustrationButton({
    projectId,
    hasModules,
    hasExisting,
}: GenerateSystemIllustrationButtonProps): React.ReactElement {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [status, setStatus] = useState<Status>({ kind: "idle" })

    const handleClick = (): void => {
        setStatus({ kind: "running" })
        startTransition(() => {
            void (async () => {
                try {
                    const res = await generateSystemIllustrationForProject(projectId)
                    if (!res.ok) {
                        setStatus({
                            kind: "error",
                            message: res.error,
                        })
                        return
                    }
                    setStatus({ kind: "done", url: res.url })
                    // Re-render the Modules server component so the new
                    // system_illustration_url flows into the hero pane.
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
    const disabled = running || !hasModules

    const label = running
        ? "Generating…"
        : hasExisting
            ? "Re-generate illustration"
            : "Generate system illustration"

    const disabledReason = !hasModules
        ? "Decompose with Max first — there's nothing to illustrate."
        : running
            ? "Generating system illustration…"
            : undefined

    return (
        <div
            className="m2-sysillus-wrap"
            style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}
        >
            <button
                type="button"
                className="m2-btn"
                onClick={handleClick}
                disabled={disabled}
                aria-busy={running}
                title={
                    disabledReason ??
                    "Generates a 16:9 system illustration from the project subject + module list."
                }
            >
                {label}
            </button>
            {status.kind === "done" && (
                <span
                    className="m2-sysillus-result"
                    style={{ fontSize: 13, color: "var(--muted-foreground, #6b7280)" }}
                >
                    New illustration ready.
                </span>
            )}
            {status.kind === "error" && (
                <span
                    className="m2-sysillus-result"
                    style={{ fontSize: 13, color: "#dc2626" }}
                >
                    {status.message}
                </span>
            )}
        </div>
    )
}
