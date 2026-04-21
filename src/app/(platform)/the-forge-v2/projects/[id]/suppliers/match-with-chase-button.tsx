"use client"

/**
 * @file match-with-chase-button.tsx — V2 Suppliers shortlist trigger.
 *
 * @description Replaces the V1-redirect "Find more suppliers" link with a
 * native V2 action. Calls `matchSuppliersForProject()`, which fans out
 * Chase's existing per-module supplier scorer across every module in the
 * project and upserts the top candidates into `forge_supplier_shortlist`.
 * The parent page re-reads the shortlist after a successful match via
 * `router.refresh()` so the newly-populated suppliers grid renders inline
 * without a full page reload.
 *
 * Keeps the `.sp2` scoped CSS from suppliers-v2.css so the button visually
 * matches the mockup-faithful surface.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { matchSuppliersForProject } from "@/actions/forge-v2-supplier-match"

interface MatchWithChaseButtonProps {
    projectId: string
    /** Whether there's already at least one supplier on the shortlist — tunes
     *  the label between "Match with Chase" and "Re-match with Chase". */
    hasExisting: boolean
}

type Status =
    | { kind: "idle" }
    | { kind: "running" }
    | { kind: "done"; suppliersAdded: number; modulesMatched: number; modulesEmpty: number }
    | { kind: "error"; message: string }

export function MatchWithChaseButton({
    projectId,
    hasExisting,
}: MatchWithChaseButtonProps): React.ReactElement {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [status, setStatus] = useState<Status>({ kind: "idle" })

    const handleClick = (): void => {
        setStatus({ kind: "running" })
        startTransition(() => {
            void (async () => {
                try {
                    const res = await matchSuppliersForProject(projectId)
                    if (!res.ok) {
                        setStatus({
                            kind: "error",
                            message: res.error ?? "Couldn't run supplier match.",
                        })
                        return
                    }
                    setStatus({
                        kind: "done",
                        suppliersAdded: res.suppliersAdded,
                        modulesMatched: res.modulesMatched,
                        modulesEmpty: res.modulesEmpty,
                    })
                    // Re-render the server component so the new shortlist rows show up.
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

    const label = hasExisting ? "Re-match with Chase" : "Match suppliers with Chase"
    const running = isPending || status.kind === "running"

    return (
        <div className="sp2-match-wrap" style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <button
                type="button"
                className="sp2-btn primary"
                onClick={handleClick}
                disabled={running}
                aria-busy={running}
                title="Chase scores every module against the global supplier directory and writes the top matches into your shortlist."
            >
                {running ? "Chase is matching…" : label}
            </button>
            {status.kind === "done" && (
                <span className="sp2-match-result" style={{ fontSize: 13, color: "var(--muted-foreground, #6b7280)" }}>
                    {status.suppliersAdded > 0
                        ? `Added ${status.suppliersAdded} supplier${status.suppliersAdded === 1 ? "" : "s"}` +
                          (status.modulesEmpty > 0
                              ? ` · ${status.modulesEmpty} module${status.modulesEmpty === 1 ? "" : "s"} had no candidate`
                              : "")
                        : "No supplier candidates found — check module process/material fields."}
                </span>
            )}
            {status.kind === "error" && (
                <span className="sp2-match-result" style={{ fontSize: 13, color: "#dc2626" }}>
                    {status.message}
                </span>
            )}
        </div>
    )
}
