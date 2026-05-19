"use client"

/**
 * @file generate-export-button.tsx — V2 Export "Generate export" button.
 *
 * @description Calls exportProjectPdf() server action, receives a
 * base64-encoded PDF, and triggers a download via Blob URL. Keeps the
 * existing .ex2 scoped styling. Format/scope pickers stay disabled for
 * now — this button is always PDF / Everything. Those pickers get wired
 * in a later round once more formats land.
 */

import { useState, useTransition } from "react"

import { exportProjectPdf } from "@/actions/export-project-pdf"

interface GenerateExportButtonProps {
    projectId: string
}

type Status =
    | { kind: "idle" }
    | { kind: "running" }
    | { kind: "error"; message: string }

export function GenerateExportButton({
    projectId,
}: GenerateExportButtonProps): React.ReactElement {
    const [isPending, startTransition] = useTransition()
    const [status, setStatus] = useState<Status>({ kind: "idle" })

    const running = status.kind === "running" || isPending

    const handleClick = (): void => {
        setStatus({ kind: "running" })
        startTransition(() => {
            void (async () => {
                try {
                    const res = await exportProjectPdf(projectId)
                    if (!res.ok) {
                        setStatus({ kind: "error", message: res.error })
                        return
                    }
                    // Decode base64 → bytes → Blob → download via anchor.
                    const byteString = atob(res.base64)
                    const bytes = new Uint8Array(byteString.length)
                    for (let i = 0; i < byteString.length; i += 1) {
                        bytes[i] = byteString.charCodeAt(i)
                    }
                    const blob = new Blob([bytes], { type: "application/pdf" })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement("a")
                    a.href = url
                    a.download = res.filename
                    document.body.appendChild(a)
                    a.click()
                    a.remove()
                    // Revoke after a tick — some browsers need the URL
                    // alive for the click to succeed.
                    setTimeout(() => URL.revokeObjectURL(url), 1_000)
                    setStatus({ kind: "idle" })
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
                className="ex2-btn primary"
                onClick={handleClick}
                disabled={running}
                aria-busy={running}
                title="Generate a PDF bundle of Brief + Modules + BOM + Cost + Risks + Suppliers and download it."
            >
                {running ? "Rendering PDF…" : "Generate export"}
            </button>
            {status.kind === "error" && (
                <span
                    role="alert"
                    style={{ marginLeft: 10, fontSize: 13, color: "#dc2626" }}
                >
                    {status.message}
                </span>
            )}
        </>
    )
}
