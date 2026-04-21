"use client"

/**
 * @file ship-button.tsx — V2 Launch "Ship and hand off" client button.
 *
 * @description Wraps the shipCadLabProject server action. Shows progress
 * and error inline; on success calls router.refresh() so the Launch page
 * re-reads cad_lab_projects and flips into the post-ship read-only render.
 * Keeps the .lh2 scoped styling from launch-handoff-v2.css.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { shipCadLabProject } from "@/actions/ship-project"

interface ShipButtonProps {
    projectId: string
    isReady: boolean
    blockerCount: number
}

type Status =
    | { kind: "idle" }
    | { kind: "running" }
    | { kind: "error"; message: string }

export function ShipButton({
    projectId,
    isReady,
    blockerCount,
}: ShipButtonProps): React.ReactElement {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [status, setStatus] = useState<Status>({ kind: "idle" })

    const disabled = !isReady || status.kind === "running" || isPending
    const title = !isReady
        ? `Close ${blockerCount || "the remaining"} blocker${blockerCount === 1 ? "" : "s"} first`
        : status.kind === "running"
            ? "Shipping — please wait"
            : "Flip canonical ownership from Forge to Operations. Terminal — only reversible by forking the project."

    const handleClick = (): void => {
        if (!isReady) return
        const confirmed = window.confirm(
            "Ship and hand off — terminal. The current revision becomes the as-shipped record and ownership moves to Operations. Cancel out of this dialog to abort.",
        )
        if (!confirmed) return

        setStatus({ kind: "running" })
        startTransition(() => {
            void (async () => {
                try {
                    const res = await shipCadLabProject(projectId)
                    if (!res.ok) {
                        setStatus({ kind: "error", message: res.error })
                        return
                    }
                    setStatus({ kind: "idle" })
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

    return (
        <>
            <button
                type="button"
                className={`lh2-btn-ship ${disabled ? "disabled" : ""}`}
                onClick={handleClick}
                disabled={disabled}
                aria-disabled={disabled}
                title={title}
            >
                {status.kind === "running" ? "Shipping…" : "Ship and hand off"}
            </button>
            {status.kind === "error" && (
                <div
                    className="lh2-ship-error"
                    role="alert"
                    style={{
                        marginTop: 8,
                        color: "#dc2626",
                        fontSize: 13,
                    }}
                >
                    {status.message}
                </div>
            )}
        </>
    )
}
