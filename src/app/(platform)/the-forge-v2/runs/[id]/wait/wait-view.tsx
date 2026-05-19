"use client"

/**
 * @file runs/[id]/wait/wait-view.tsx — client poller for the wait interstitial.
 */

import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

interface StatusResponse {
    status: "pending" | "running" | "ready" | "failed"
    started_at: string | null
    ready_at: string | null
    pdf_signed_url: string | null
    error_log: string | null
    brief_text: string
    project_id: string | null
    error?: string
}

const POLL_INTERVAL_MS = 5_000

function fmtElapsed(startISO: string | null): string {
    if (!startISO) return "—"
    const startMs = Date.parse(startISO)
    if (!Number.isFinite(startMs)) return "—"
    const elapsedSec = Math.max(0, Math.floor((Date.now() - startMs) / 1000))
    const m = Math.floor(elapsedSec / 60)
    const s = elapsedSec % 60
    return `${m}m ${s.toString().padStart(2, "0")}s`
}

export function WaitView({ jobId }: { jobId: string }): React.ReactElement {
    const router = useRouter()
    const [status, setStatus] = useState<StatusResponse | null>(null)
    const [fetchError, setFetchError] = useState<string | null>(null)
    const [nowTick, setNowTick] = useState(0)

    // Poll status.
    useEffect(() => {
        let cancelled = false

        async function poll(): Promise<void> {
            try {
                const res = await fetch(`/api/pdf-engine-v2/status/${jobId}`, {
                    cache: "no-store",
                })
                if (cancelled) return
                const data = (await res.json()) as StatusResponse
                if (!res.ok) {
                    setFetchError(
                        data?.error ?? `Status check failed (HTTP ${res.status})`,
                    )
                    return
                }
                setFetchError(null)
                setStatus(data)
                if (data.status === "ready") {
                    router.push(`/the-forge-v2/runs/${jobId}/download`)
                }
            } catch (err) {
                if (!cancelled) {
                    setFetchError(
                        err instanceof Error
                            ? err.message
                            : "Network error — will retry.",
                    )
                }
            }
        }

        void poll()
        const interval = setInterval(poll, POLL_INTERVAL_MS)
        return () => {
            cancelled = true
            clearInterval(interval)
        }
    }, [jobId, router])

    // Tick once per second so elapsed-time keeps updating.
    useEffect(() => {
        const t = setInterval(() => setNowTick((n) => n + 1), 1000)
        return () => clearInterval(t)
    }, [])

    const isFailed = status?.status === "failed"
    const elapsed = fmtElapsed(status?.started_at ?? null)
    // Reference nowTick so the linter knows it's used to drive elapsed time.
    void nowTick

    return (
        <div className="space-y-6 max-w-3xl">
            <div className="space-y-2">
                <h1 className="text-3xl font-bold text-foreground">
                    Generating your engineering report
                </h1>
                <p className="text-muted-foreground">
                    The engine is reading your brief, decomposing the product into
                    modules, sizing each one, costing the bill of materials,
                    shortlisting suppliers, and writing the report. This typically
                    takes 40 to 60 minutes.
                </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm space-y-5">
                {isFailed ? (
                    <FailedPanel status={status} jobId={jobId} />
                ) : (
                    <RunningPanel status={status} elapsed={elapsed} />
                )}
            </div>

            {fetchError ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {fetchError}
                </div>
            ) : null}

            {status?.brief_text ? (
                <details className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    <summary className="cursor-pointer font-medium text-slate-900">
                        Show the brief you submitted
                    </summary>
                    <pre className="mt-3 whitespace-pre-wrap font-sans leading-relaxed">
                        {status.brief_text}
                    </pre>
                </details>
            ) : null}
        </div>
    )
}

function RunningPanel({
    status,
    elapsed,
}: {
    status: StatusResponse | null
    elapsed: string
}): React.ReactElement {
    const label =
        status?.status === "pending"
            ? "Waiting for the worker to pick up your brief…"
            : status?.status === "running"
                ? "Engine running — building your report"
                : "Connecting…"

    return (
        <>
            <div className="flex items-center gap-3">
                <span
                    className="inline-block h-3 w-3 animate-pulse rounded-full bg-slate-900"
                    aria-hidden="true"
                />
                <span className="text-base font-medium text-slate-900">{label}</span>
            </div>

            {/* Indeterminate progress bar */}
            <div
                className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                aria-label="Engine progress"
            >
                <div className="h-full w-1/3 animate-[indeterminate_2.4s_ease-in-out_infinite] rounded-full bg-slate-900" />
            </div>

            <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                    <dt className="text-slate-500">Status</dt>
                    <dd className="font-medium text-slate-900">
                        {status?.status ?? "loading"}
                    </dd>
                </div>
                <div>
                    <dt className="text-slate-500">Elapsed</dt>
                    <dd className="font-medium text-slate-900">{elapsed}</dd>
                </div>
            </dl>

            <p className="text-xs text-slate-500">
                This page polls every five seconds. You can leave the tab open or
                bookmark this URL and come back later.
            </p>

            <style jsx>{`
                @keyframes indeterminate {
                    0% {
                        transform: translateX(-100%);
                    }
                    50% {
                        transform: translateX(150%);
                    }
                    100% {
                        transform: translateX(350%);
                    }
                }
            `}</style>
        </>
    )
}

function FailedPanel({
    status,
    jobId,
}: {
    status: StatusResponse | null
    jobId: string
}): React.ReactElement {
    return (
        <>
            <div className="flex items-center gap-3">
                <span
                    className="inline-block h-3 w-3 rounded-full bg-rose-600"
                    aria-hidden="true"
                />
                <span className="text-base font-medium text-slate-900">
                    The engine could not finish this report
                </span>
            </div>
            {status?.error_log ? (
                <details className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                    <summary className="cursor-pointer font-medium">
                        Show what went wrong
                    </summary>
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-xs">
                        {status.error_log}
                    </pre>
                </details>
            ) : null}
            <div className="flex items-center gap-3">
                <Link
                    href="/the-forge-v2/new-v2"
                    className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800"
                >
                    Try again with a new brief
                </Link>
                <span className="text-xs text-slate-500">
                    Job id: <span className="font-mono">{jobId}</span>
                </span>
            </div>
        </>
    )
}
