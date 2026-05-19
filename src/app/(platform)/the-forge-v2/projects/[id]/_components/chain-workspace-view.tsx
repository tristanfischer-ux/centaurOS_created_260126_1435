"use client"

/**
 * @file chain-workspace-view.tsx — client view for chain-engine projects.
 *
 * @description Shows brief, chain status, and PDF download. Polls every 30s
 * while status ∈ {pending, running}. Refreshes the page when status becomes
 * terminal (ready or failed) so the signed URL gets minted server-side.
 *
 * Status model:
 *   pending  — INSERT landed, worker hasn't claimed yet (≤30s)
 *   running  — worker spawned the chain (60-90 min for heatpump)
 *   ready    — PDF uploaded, signed URL minted server-side, download visible
 *   failed   — error_log has the diagnostic
 *
 * No autopilot stages, no specialist names, no module gallery, no BOM table.
 * The chain produces one artefact (the PDF); the workspace shows that one
 * artefact.
 */

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

export interface ChainRun {
    id: string
    status: string
    briefText: string | null
    pdfStoragePath: string | null
    errorLog: string | null
    createdAt: string | null
    startedAt: string | null
    readyAt: string | null
}

interface Props {
    projectId: string
    projectName: string
    projectSubject: string
    run: ChainRun | null
    initialPdfUrl: string | null
}

export function ChainWorkspaceView({
    projectId,
    projectName,
    projectSubject,
    run,
    initialPdfUrl,
}: Props): React.ReactElement {
    const router = useRouter()
    const isTerminal = run?.status === "ready" || run?.status === "failed"
    const [, setTick] = useState(0)

    // Poll every 30s while the chain is running. router.refresh() re-runs the
    // server component which re-queries pdf_engine_runs and re-mints the
    // signed URL when status flips to ready.
    useEffect(() => {
        if (isTerminal || !run) return
        const interval = setInterval(() => {
            router.refresh()
            setTick((t) => t + 1)
        }, 30_000)
        return () => clearInterval(interval)
    }, [isTerminal, run, router])

    const elapsedSeconds = computeElapsedSeconds(run)

    return (
        <div className="w2-chain">
            <nav className="w2-breadcrumb" aria-label="Breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span> › </span>
                <span>{projectName}</span>
            </nav>

            <header className="w2-chain-header">
                <h1>{projectName}</h1>
                <p className="w2-chain-sub">
                    Engineering report — chain engine, 60–90 min end-to-end.
                </p>
            </header>

            <section className="w2-chain-panel">
                <h2>Brief</h2>
                <pre className="w2-chain-brief">{projectSubject || "(no brief)"}</pre>
            </section>

            {!run ? (
                <section className="w2-chain-panel w2-chain-empty">
                    <h2>No chain run yet</h2>
                    <p>
                        The project row exists but no pdf_engine_runs row has
                        been queued for it. This usually means the founder
                        landed here directly without using the Start flow.
                        Submit a brief at <Link href="/the-forge-v2/start">/start</Link>{" "}
                        to begin.
                    </p>
                </section>
            ) : run.status === "ready" ? (
                <section className="w2-chain-panel w2-chain-ready">
                    <h2>Report ready</h2>
                    <p>
                        Chain completed in {formatDuration(elapsedSeconds)}.
                        The 60+ page engineering report is ready to download.
                    </p>
                    {initialPdfUrl ? (
                        <a
                            href={initialPdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w2-chain-download"
                        >
                            Download PDF →
                        </a>
                    ) : (
                        <p className="w2-chain-error">
                            Status is ready but no signed URL could be minted.
                            Refresh the page to try again.
                        </p>
                    )}
                </section>
            ) : run.status === "failed" ? (
                <section className="w2-chain-panel w2-chain-failed">
                    <h2>Chain failed</h2>
                    <p>
                        The chain engine returned an error after{" "}
                        {formatDuration(elapsedSeconds)}.
                    </p>
                    {run.errorLog ? (
                        <pre className="w2-chain-error-log">{run.errorLog}</pre>
                    ) : null}
                </section>
            ) : (
                <section className="w2-chain-panel w2-chain-running">
                    <h2>
                        {run.status === "running" ? "Building report" : "Queued"}
                    </h2>
                    <p>
                        {run.status === "running"
                            ? "The chain is running on the Mac Studio worker. This page polls every 30 seconds. Typical heatpump-class runs take 60–90 minutes."
                            : "Waiting for the worker to claim this job. The worker polls every 30 seconds; the job should start within a minute."}
                    </p>
                    {elapsedSeconds > 0 ? (
                        <p className="w2-chain-elapsed">
                            Elapsed: {formatDuration(elapsedSeconds)}
                        </p>
                    ) : null}
                    <p className="w2-chain-note">
                        You can close this tab — the chain runs server-side and
                        the PDF will be here when you come back.
                    </p>
                </section>
            )}

            <style jsx>{`
                .w2-chain {
                    max-width: 800px;
                    margin: 0 auto;
                    padding: 24px;
                    color: #1a1a1a;
                }
                .w2-breadcrumb {
                    font-size: 13px;
                    color: #666;
                    margin-bottom: 16px;
                }
                .w2-breadcrumb a {
                    color: #444;
                    text-decoration: none;
                }
                .w2-breadcrumb a:hover {
                    text-decoration: underline;
                }
                .w2-chain-header h1 {
                    font-size: 28px;
                    margin: 0 0 4px 0;
                    font-weight: 600;
                }
                .w2-chain-sub {
                    color: #666;
                    font-size: 14px;
                    margin: 0 0 24px 0;
                }
                .w2-chain-panel {
                    background: #fafafa;
                    border: 1px solid #e5e5e5;
                    border-radius: 8px;
                    padding: 20px;
                    margin-bottom: 16px;
                }
                .w2-chain-panel h2 {
                    font-size: 16px;
                    font-weight: 600;
                    margin: 0 0 12px 0;
                }
                .w2-chain-brief {
                    background: white;
                    border: 1px solid #e5e5e5;
                    border-radius: 4px;
                    padding: 12px;
                    font-size: 13px;
                    line-height: 1.5;
                    white-space: pre-wrap;
                    word-break: break-word;
                    margin: 0;
                    font-family: ui-monospace, "SF Mono", monospace;
                }
                .w2-chain-running { background: #f0f7ff; border-color: #b8d4f5; }
                .w2-chain-ready { background: #f0fdf4; border-color: #86efac; }
                .w2-chain-failed { background: #fef2f2; border-color: #fca5a5; }
                .w2-chain-empty { background: #fefce8; border-color: #fde68a; }
                .w2-chain-elapsed {
                    font-size: 13px;
                    color: #555;
                    margin: 8px 0;
                }
                .w2-chain-note {
                    font-size: 12px;
                    color: #888;
                    margin: 12px 0 0 0;
                }
                .w2-chain-download {
                    display: inline-block;
                    margin-top: 12px;
                    padding: 10px 16px;
                    background: #1a1a1a;
                    color: white;
                    text-decoration: none;
                    border-radius: 6px;
                    font-weight: 600;
                    font-size: 14px;
                }
                .w2-chain-download:hover {
                    background: #333;
                }
                .w2-chain-error,
                .w2-chain-error-log {
                    background: white;
                    border: 1px solid #fca5a5;
                    border-radius: 4px;
                    padding: 12px;
                    font-size: 12px;
                    color: #991b1b;
                    white-space: pre-wrap;
                    word-break: break-word;
                    margin: 12px 0 0 0;
                }
            `}</style>
        </div>
    )
}

function computeElapsedSeconds(run: ChainRun | null): number {
    if (!run) return 0
    const start = run.startedAt ?? run.createdAt
    if (!start) return 0
    const end = run.readyAt ?? new Date().toISOString()
    return Math.max(
        0,
        Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000),
    )
}

function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    if (minutes < 60) return `${minutes}m ${remainingSeconds}s`
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return `${hours}h ${remainingMinutes}m`
}
