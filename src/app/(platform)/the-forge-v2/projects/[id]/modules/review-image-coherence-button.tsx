"use client"

/**
 * @file review-image-coherence-button.tsx — Layer D of the image
 * coherence plan. Triggers reviewImageCoherence() which (a) asks Opus
 * vision which module images look out-of-family with the cover, and
 * (b) regenerates up to 3 outliers using Layer C's cover-as-reference
 * wiring.
 *
 * Appears on the modules page next to the "Generate module renders"
 * button. Only meaningful once both the cover and at least one module
 * image exist — the server action returns NO_COVER / NO_MODULES in
 * those cases and the UI surfaces that verbatim.
 *
 * @related
 *   - Server action: src/actions/forge-v2-review-image-coherence.ts
 *   - Sibling: src/app/.../modules/generate-module-images-button.tsx
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import {
    reviewImageCoherence,
    type CoherenceOutlier,
} from "@/actions/forge-v2-review-image-coherence"

interface ReviewImageCoherenceButtonProps {
    projectId: string
    /** Enabled only when the cover + at least one module image exist.
     *  The parent (ModulesView) knows this from the project props. */
    ready: boolean
}

type Status =
    | { kind: "idle" }
    | { kind: "running" }
    | {
          kind: "done"
          reviewedCount: number
          outliers: CoherenceOutlier[]
          modelUsed: string
      }
    | { kind: "error"; message: string }

export function ReviewImageCoherenceButton({
    projectId,
    ready,
}: ReviewImageCoherenceButtonProps): React.ReactElement {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [status, setStatus] = useState<Status>({ kind: "idle" })

    const handleClick = (): void => {
        if (!ready) return
        setStatus({ kind: "running" })
        startTransition(() => {
            void (async () => {
                const res = await reviewImageCoherence(projectId)
                if (!res.ok) {
                    setStatus({ kind: "error", message: res.error })
                    return
                }
                setStatus({
                    kind: "done",
                    reviewedCount: res.reviewedCount,
                    outliers: res.outliers,
                    modelUsed: res.modelUsed,
                })
                // Any regenerations modified cad_lab_projects.modules;
                // refresh so the new images flip into view.
                router.refresh()
            })()
        })
    }

    const disabled = !ready || isPending || status.kind === "running"
    const running = isPending || status.kind === "running"

    const disabledTitle = !ready
        ? "Generate the cover illustration and at least one module render first."
        : "Ask Claude Opus to flag module images that look out-of-family with the cover, then regenerate the top 3 outliers."

    const regenCount =
        status.kind === "done" ? status.outliers.filter((o) => o.regenerated).length : 0
    const unregenOutliers =
        status.kind === "done" ? status.outliers.filter((o) => !o.regenerated) : []

    return (
        <div
            className="m2-coh-wrap"
            style={{ display: "inline-flex", alignItems: "flex-start", gap: 10, flexDirection: "column" }}
        >
            <button
                type="button"
                className="m2-btn"
                onClick={handleClick}
                disabled={disabled}
                aria-busy={running}
                title={disabledTitle}
            >
                {running ? "Reviewing for coherence…" : "Review image coherence"}
            </button>
            {status.kind === "done" && (
                <div style={{ fontSize: 12, color: "var(--muted-foreground, #6b7280)", maxWidth: 520 }}>
                    {status.outliers.length === 0 ? (
                        <span>
                            Reviewed {status.reviewedCount} images — all in family with the cover.
                        </span>
                    ) : (
                        <>
                            <div>
                                Reviewed {status.reviewedCount} images · flagged{" "}
                                {status.outliers.length} outlier
                                {status.outliers.length === 1 ? "" : "s"} · regenerated{" "}
                                {regenCount}.
                            </div>
                            {status.outliers.map((o) => (
                                <div key={o.moduleId} style={{ marginTop: 4 }}>
                                    <strong>{o.moduleId}</strong> ({o.severity}
                                    {o.regenerated
                                        ? " — regenerated"
                                        : o.regenError
                                            ? ` — regen failed: ${o.regenError}`
                                            : " — queued (hit per-invocation cap)"}
                                    ): {o.reason}
                                </div>
                            ))}
                            {unregenOutliers.length > 0 && (
                                <div style={{ marginTop: 6 }}>
                                    Click again to regenerate the remaining outlier
                                    {unregenOutliers.length === 1 ? "" : "s"}.
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
            {status.kind === "error" && (
                <div style={{ fontSize: 12, color: "#dc2626", maxWidth: 520 }}>
                    {status.message}
                </div>
            )}
        </div>
    )
}
