"use client"

/**
 * @file discover-suppliers-button.tsx — founder-facing trigger for the
 * demand-driven supplier discovery loop.
 *
 * @description When the Chase shortlist for a project comes back thin
 * (< 3 suppliers, or empty because the directory has zero coverage for
 * the project's niche — horticulture, HVAC, shipping containers, etc.),
 * this button fires `discoverSuppliersForGap(projectId, moduleId)`. The
 * action kicks a Claude Opus web_search call against the gap's industry
 * / process / material, persists up to 10 real UK/EU companies as
 * unverified-ai-discovery rows in the suppliers directory, then re-runs
 * matchSuppliersForProject so the shortlist refreshes.
 *
 * V0 UI: one button that fires discovery for a single module (the first
 * one with < 3 matches or, on empty shortlist, modules[0]). Progress is
 * reported inline via the returned job summary; full progress polling +
 * per-module chips are V1.
 *
 * @related
 *   - Server action: src/actions/forge-v2-supplier-discovery.ts
 *   - Plan: SUPPLIER-DISCOVERY-PLAN.md
 *   - Red team: SUPPLIER-DISCOVERY-REDTEAM.md
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { discoverSuppliersForGap } from "@/actions/forge-v2-supplier-discovery"

interface DiscoverSuppliersButtonProps {
    projectId: string
    /** Module we're running discovery against. Usually `modules[0]`
     *  when the shortlist is totally empty — one of the "make" modules
     *  when we want to fill a specific gap. */
    moduleId: string
    /** Module display name — shown in the running-state copy so the
     *  founder knows which subsystem Chase is searching against. */
    moduleName: string
}

type Status =
    | { kind: "idle" }
    | { kind: "running" }
    | {
          kind: "done"
          candidatesReturned: number
          candidatesPersisted: number
          error?: string
      }
    | { kind: "error"; message: string }

export function DiscoverSuppliersButton({
    projectId,
    moduleId,
    moduleName,
}: DiscoverSuppliersButtonProps): React.ReactElement {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [status, setStatus] = useState<Status>({ kind: "idle" })

    const handleClick = (): void => {
        setStatus({ kind: "running" })
        startTransition(() => {
            void (async () => {
                try {
                    const res = await discoverSuppliersForGap(projectId, moduleId)
                    if (!res.ok) {
                        setStatus({ kind: "error", message: res.error })
                        return
                    }
                    setStatus({
                        kind: "done",
                        candidatesReturned: res.job.candidatesReturned,
                        candidatesPersisted: res.job.candidatesPersisted,
                        error: res.job.error,
                    })
                    // New suppliers landed + the shortlist re-matched
                    // against them inside the action. Refresh so the
                    // page picks up the new rows.
                    router.refresh()
                } catch (err) {
                    setStatus({
                        kind: "error",
                        message:
                            err instanceof Error ? err.message : "Unknown error",
                    })
                }
            })()
        })
    }

    const running = isPending || status.kind === "running"

    const label = running
        ? `Chase is researching ${moduleName.toLowerCase()}…`
        : "Ask Chase to research the web"

    return (
        <div
            className="sp2-discover-wrap"
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 6,
                marginTop: 10,
            }}
        >
            <button
                type="button"
                className="sp2-btn"
                onClick={handleClick}
                disabled={running}
                aria-busy={running}
                title={
                    running
                        ? "Chase is running Claude Opus with the web_search tool — 60–90s typical"
                        : `Runs Claude Opus web_search against the ${moduleName} gap. Up to 10 real UK/EU companies land as unverified candidates in the directory, then Chase re-matches so the shortlist refreshes. About £0.30 per run.`
                }
            >
                {label}
            </button>
            {status.kind === "done" && (
                <div
                    className="sp2-discover-status"
                    style={{ fontSize: 12, color: "var(--muted-foreground, #6b7280)", maxWidth: 520 }}
                >
                    {status.candidatesPersisted > 0 ? (
                        <>
                            <strong>
                                Chase found {status.candidatesReturned} candidate
                                {status.candidatesReturned === 1 ? "" : "s"}
                            </strong>
                            {" "}
                            · persisted {status.candidatesPersisted} as unverified-ai-discovery rows. Scroll down to see them in the shortlist.
                        </>
                    ) : status.candidatesReturned > 0 ? (
                        <>
                            Chase found {status.candidatesReturned}, but all were duplicates of existing directory entries — no new rows persisted. Shortlist should still have refreshed.
                        </>
                    ) : (
                        <>
                            {status.error ??
                                "Chase didn't find any real UK/EU matches for this gap. Try a broader process description or come back when the directory grows."}
                        </>
                    )}
                </div>
            )}
            {status.kind === "error" && (
                <div
                    className="sp2-discover-status"
                    style={{ fontSize: 12, color: "#dc2626", maxWidth: 520 }}
                >
                    {status.message}
                </div>
            )}
        </div>
    )
}
