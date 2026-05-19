/**
 * @file runs/[id]/download/page.tsx — A1-minimal "ready" page.
 *
 * Server-side: load the run via the same status route used by the wait page
 * (via a direct admin query — RLS is enforced by user_id filter), render a
 * large download button pointing at the signed URL, and show the brief +
 * completion time. The signed URL is generated server-side on each render.
 */

import type { Metadata } from "next"
import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { z } from "zod"

import { withUser } from "@/lib/server-action-utils"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export const metadata: Metadata = {
    title: "Your engineering report is ready · The Forge",
    description: "Download your engineering report as a PDF.",
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PARAMS_SCHEMA = z.object({ id: z.string().regex(UUID_RE) })
const SIGNED_URL_TTL_SECONDS = 60 * 60

interface PageProps {
    params: Promise<{ id: string }>
}

interface LoadedRun {
    status: "pending" | "running" | "ready" | "failed"
    briefText: string
    startedAt: string | null
    readyAt: string | null
    signedUrl: string | null
    errorLog: string | null
    /** Self id — used to label which sibling card is "this" in the variations panel. */
    id: string
    /** When non-null, this row is a variation child of variationOf. */
    variationOf: string | null
    /** Human label, e.g. "3.5 MWh BESS". Null on standalone + parent rows. */
    variationLabel: string | null
    /** Sibling rows in the same variation set (parent + all children). Empty for standalone runs. */
    siblings: Array<{
        id: string
        status: "pending" | "running" | "ready" | "failed"
        label: string
        readyAt: string | null
        signedUrl: string | null
    }>
}

async function loadRun(jobId: string): Promise<LoadedRun | "not_found"> {
    return withUser(async ({ user }) => {
        const admin = createAdminClient()
        const { data: run, error } = await admin
            .from("pdf_engine_runs")
            .select(
                "id, user_id, status, brief_text, started_at, ready_at, pdf_storage_path, error_log, variation_of, variation_label, variations",
            )
            .eq("id", jobId)
            .maybeSingle()
        if (error || !run || run.user_id !== user.id) {
            return "not_found" as const
        }

        let signedUrl: string | null = null
        if (run.status === "ready" && typeof run.pdf_storage_path === "string") {
            try {
                const { data: signed } = await admin.storage
                    .from("pdf-engine-pdfs")
                    .createSignedUrl(run.pdf_storage_path, SIGNED_URL_TTL_SECONDS)
                if (signed?.signedUrl) signedUrl = signed.signedUrl
            } catch {
                // best-effort — user can refresh
            }
        }

        // Resolve siblings.
        //
        //   • Standalone run (variations IS NULL AND variation_of IS NULL)
        //     → no siblings, render the single-PDF layout.
        //   • Parent of a variation set (variations IS NOT NULL)
        //     → siblings = self + all rows where variation_of = self.id.
        //   • Variation child (variation_of IS NOT NULL)
        //     → siblings = parent + all rows where variation_of = parent.id.
        const parentId = (run.variation_of as string | null) ?? (run.id as string)
        const hasSiblings =
            (run.variation_of as string | null) !== null ||
            (run.variations !== null && run.variations !== undefined)

        const siblings: LoadedRun["siblings"] = []
        if (hasSiblings) {
            const { data: rels } = await admin
                .from("pdf_engine_runs")
                .select(
                    "id, status, pdf_storage_path, ready_at, variation_label, variation_of",
                )
                .or(`id.eq.${parentId},variation_of.eq.${parentId}`)
                .order("created_at", { ascending: true })

            if (rels) {
                for (const r of rels) {
                    let url: string | null = null
                    if (
                        r.status === "ready" &&
                        typeof r.pdf_storage_path === "string"
                    ) {
                        try {
                            const { data: signed } = await admin.storage
                                .from("pdf-engine-pdfs")
                                .createSignedUrl(
                                    r.pdf_storage_path,
                                    SIGNED_URL_TTL_SECONDS,
                                )
                            if (signed?.signedUrl) url = signed.signedUrl
                        } catch {
                            // best-effort
                        }
                    }
                    // Parent row uses "Base design" as its visible label so
                    // the founder understands which is "the original" brief.
                    const label =
                        (r.variation_label as string | null) ?? "Base design"
                    siblings.push({
                        id: r.id as string,
                        status: r.status as LoadedRun["status"],
                        label,
                        readyAt: (r.ready_at as string | null) ?? null,
                        signedUrl: url,
                    })
                }
            }
        }

        return {
            status: run.status as LoadedRun["status"],
            briefText: (run.brief_text as string) ?? "",
            startedAt: (run.started_at as string | null) ?? null,
            readyAt: (run.ready_at as string | null) ?? null,
            signedUrl,
            errorLog: (run.error_log as string | null) ?? null,
            id: run.id as string,
            variationOf: (run.variation_of as string | null) ?? null,
            variationLabel: (run.variation_label as string | null) ?? null,
            siblings,
        }
    })
}

function fmtDurationMs(ms: number): string {
    if (!Number.isFinite(ms) || ms <= 0) return "—"
    const totalSec = Math.floor(ms / 1000)
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    if (m === 0) return `${s}s`
    return `${m}m ${s.toString().padStart(2, "0")}s`
}

export default async function DownloadPage({
    params,
}: PageProps): Promise<React.ReactElement> {
    const parsed = PARAMS_SCHEMA.safeParse(await params)
    if (!parsed.success) notFound()

    const run = await loadRun(parsed.data.id)
    if (run === "not_found") notFound()

    // Variation-aware redirect: if this is a multi-PDF submission, don't bounce
    // the founder back to /wait just because THIS row isn't ready yet — they
    // may have already collected some siblings. Only bounce when ALL siblings
    // are still in progress.
    if (run.siblings.length > 0) {
        const anyReady = run.siblings.some((s) => s.status === "ready")
        if (!anyReady) {
            redirect(`/the-forge-v2/runs/${parsed.data.id}/wait`)
        }
    } else if (run.status === "pending" || run.status === "running") {
        redirect(`/the-forge-v2/runs/${parsed.data.id}/wait`)
    }

    if (run.status === "failed" && run.siblings.length === 0) {
        return (
            <div className="space-y-6 max-w-3xl">
                <div className="space-y-2">
                    <h1 className="text-3xl font-bold text-foreground">
                        The engine could not finish this report
                    </h1>
                </div>
                {run.errorLog ? (
                    <details className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                        <summary className="cursor-pointer font-medium">
                            Show what went wrong
                        </summary>
                        <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap font-mono text-xs">
                            {run.errorLog}
                        </pre>
                    </details>
                ) : null}
                <div>
                    <Link
                        href="/the-forge-v2/new-v2"
                        className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800"
                    >
                        Try again with a new brief
                    </Link>
                </div>
            </div>
        )
    }

    // status === "ready" OR variation page with at least one sibling ready
    const durationMs =
        run.startedAt && run.readyAt
            ? Date.parse(run.readyAt) - Date.parse(run.startedAt)
            : 0
    const readyAtLabel = run.readyAt
        ? new Date(run.readyAt).toLocaleString("en-GB", {
              dateStyle: "medium",
              timeStyle: "short",
          })
        : "—"

    // ─── Variation-set view ───────────────────────────────────────────────────
    // Render the sibling list as one card per variation with download / status.
    // Shown WHENEVER siblings.length > 0 (so even if this row is itself still
    // running, the founder sees progress on others).
    if (run.siblings.length > 0) {
        const total = run.siblings.length
        const readyCount = run.siblings.filter((s) => s.status === "ready")
            .length
        const allReady = readyCount === total
        return (
            <div className="space-y-6 max-w-3xl">
                <div className="space-y-2">
                    <h1 className="text-3xl font-bold text-foreground">
                        {allReady
                            ? `All ${total} engineering reports are ready`
                            : `${readyCount} of ${total} engineering reports ready`}
                    </h1>
                    <p className="text-muted-foreground">
                        You submitted {total} variation
                        {total === 1 ? "" : "s"} from one brief. Each PDF below
                        is independent — click to download. Links expire after
                        one hour; refresh the page to mint new ones.
                    </p>
                </div>

                <ul className="space-y-3">
                    {run.siblings.map((s) => {
                        const isThis = s.id === run.id
                        return (
                            <li
                                key={s.id}
                                className={`rounded-lg border bg-white p-4 shadow-sm flex items-center justify-between gap-4 ${
                                    isThis
                                        ? "border-slate-400"
                                        : "border-slate-200"
                                }`}
                            >
                                <div className="space-y-1 min-w-0">
                                    <div className="font-medium text-slate-900 truncate">
                                        {s.label}
                                        {isThis ? (
                                            <span className="ml-2 text-xs font-normal text-slate-500">
                                                (this page)
                                            </span>
                                        ) : null}
                                    </div>
                                    <div className="text-xs text-slate-500">
                                        {s.status === "ready"
                                            ? `Ready · ${
                                                  s.readyAt
                                                      ? new Date(
                                                            s.readyAt,
                                                        ).toLocaleString(
                                                            "en-GB",
                                                            {
                                                                dateStyle:
                                                                    "medium",
                                                                timeStyle:
                                                                    "short",
                                                            },
                                                        )
                                                      : ""
                                              }`
                                            : s.status === "running"
                                              ? "In progress…"
                                              : s.status === "pending"
                                                ? "Queued"
                                                : "Failed"}
                                    </div>
                                </div>
                                {s.status === "ready" && s.signedUrl ? (
                                    <a
                                        href={s.signedUrl}
                                        download
                                        className="shrink-0 inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800"
                                    >
                                        Download PDF
                                    </a>
                                ) : s.status === "ready" ? (
                                    <span className="shrink-0 text-xs text-amber-700">
                                        Link unavailable — refresh
                                    </span>
                                ) : s.status === "failed" ? (
                                    <Link
                                        href={`/the-forge-v2/runs/${s.id}/download`}
                                        className="shrink-0 text-sm text-slate-700 underline-offset-2 hover:underline"
                                    >
                                        See error
                                    </Link>
                                ) : (
                                    <Link
                                        href={`/the-forge-v2/runs/${s.id}/wait`}
                                        className="shrink-0 text-sm text-slate-700 underline-offset-2 hover:underline"
                                    >
                                        View progress
                                    </Link>
                                )}
                            </li>
                        )
                    })}
                </ul>

                <details className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    <summary className="cursor-pointer font-medium text-slate-900">
                        Show the brief you submitted
                    </summary>
                    <pre className="mt-3 whitespace-pre-wrap font-sans leading-relaxed">
                        {run.briefText}
                    </pre>
                </details>

                <div>
                    <Link
                        href="/the-forge-v2/new-v2"
                        className="text-sm font-medium text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline"
                    >
                        Submit another brief
                    </Link>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6 max-w-3xl">
            <div className="space-y-2">
                <h1 className="text-3xl font-bold text-foreground">
                    Your engineering report is ready
                </h1>
                <p className="text-muted-foreground">
                    Click the button below to download the PDF. The link is valid
                    for one hour from the time this page loaded — refresh the
                    page to mint a new one.
                </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm space-y-5">
                {run.signedUrl ? (
                    <a
                        href={run.signedUrl}
                        download
                        className="inline-flex items-center justify-center rounded-md bg-slate-900 px-6 py-3 text-base font-medium text-white shadow-sm transition-colors hover:bg-slate-800"
                    >
                        Download engineering report (PDF)
                    </a>
                ) : (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        The report is ready but we could not mint a download link.
                        Refresh the page to try again.
                    </div>
                )}

                <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                        <dt className="text-slate-500">Completed at</dt>
                        <dd className="font-medium text-slate-900">
                            {readyAtLabel}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-slate-500">Engine wall time</dt>
                        <dd className="font-medium text-slate-900">
                            {fmtDurationMs(durationMs)}
                        </dd>
                    </div>
                </dl>
            </div>

            <details className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <summary className="cursor-pointer font-medium text-slate-900">
                    Show the brief you submitted
                </summary>
                <pre className="mt-3 whitespace-pre-wrap font-sans leading-relaxed">
                    {run.briefText}
                </pre>
            </details>

            <div>
                <Link
                    href="/the-forge-v2/new-v2"
                    className="text-sm font-medium text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline"
                >
                    Submit another brief
                </Link>
            </div>
        </div>
    )
}
