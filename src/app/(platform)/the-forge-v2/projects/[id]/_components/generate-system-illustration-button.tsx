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
import { generateConceptRenderForProject } from "@/actions/forge-v2-generate-concept-render"

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
                    // Fire BOTH hero images in parallel — system blueprint
                    // (right panel) + photoreal concept render (left panel).
                    // Promise.allSettled so one failing doesn't mask the
                    // other's success.
                    const [systemRes, conceptRes] = await Promise.allSettled([
                        generateSystemIllustrationForProject(projectId),
                        generateConceptRenderForProject(projectId),
                    ])
                    const systemOk =
                        systemRes.status === "fulfilled" && systemRes.value.ok
                    const conceptOk =
                        conceptRes.status === "fulfilled" && conceptRes.value.ok
                    if (systemOk) {
                        setStatus({
                            kind: "done",
                            url: (systemRes as PromiseFulfilledResult<{ ok: true; url: string }>).value.url,
                        })
                    } else if (conceptOk) {
                        setStatus({
                            kind: "done",
                            url: (conceptRes as PromiseFulfilledResult<{ ok: true; url: string }>).value.url,
                        })
                    } else {
                        const err =
                            systemRes.status === "fulfilled" && !systemRes.value.ok
                                ? systemRes.value.error
                                : conceptRes.status === "fulfilled" && !conceptRes.value.ok
                                    ? conceptRes.value.error
                                    : "Both illustrations failed. Retry in a moment."
                        setStatus({ kind: "error", message: err })
                        return
                    }
                    // Re-render so both hero panes pick up the new URLs.
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
            ? "Re-generate illustrations"
            : "Generate illustrations"

    const disabledReason = !hasModules
        ? "Decompose with Max first — there's nothing to illustrate."
        : running
            ? "Generating both hero illustrations…"
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
                    "Generates both hero images in parallel: the photoreal concept render (left) and the technical system blueprint (right). ~60–90s total."
                }
            >
                {label}
            </button>
            {status.kind === "done" && (
                <span
                    className="m2-sysillus-result"
                    style={{ fontSize: 13, color: "var(--muted-foreground, #6b7280)" }}
                >
                    New illustrations ready.
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
