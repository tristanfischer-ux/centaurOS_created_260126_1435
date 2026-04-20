/**
 * UnarchiveView — Unarchive confirmation page (V2, data-wired).
 *
 * Mockup-faithful port of FORGE-MOCKUP-UNARCHIVE.html (Variant A — clean
 * unarchive). The mockup's Variant B (previously promoted to Forge) covers
 * the hypothesis → project re-link case, which lives in the Products
 * lifecycle, not here. This page is strictly the project-level unarchive.
 *
 * Sections (top to bottom):
 *   1. Breadcrumb
 *   2. Page header — orange title-dot + title + lead paragraph
 *   3. Either:
 *        a. Confirmation card (archived project) — meta, lead, info banner,
 *           Cancel + Unarchive CTA.
 *        b. "Already active" state (project has no archived_at) — friendly
 *           note + link back to workspace. No action available.
 *
 * Voice: first-person, British. No "AI" in copy. Orange primary — unarchive
 * is forward motion (restoring work), not a cautionary act.
 */

"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { unarchiveCadLabProject } from "@/actions/cad-lab-projects"

import "./unarchive-v2.css"

// ─── Types ─────────────────────────────────────────────────────────────

export interface UnarchiveViewProps {
    project: {
        id: string
        name: string
        subject: string
    }
    /** ISO timestamp when archived, or null if the project is already active. */
    archivedAt: string | null
}

// ─── View ──────────────────────────────────────────────────────────────

export function UnarchiveView(props: UnarchiveViewProps): React.ReactElement {
    const { project, archivedAt } = props
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    const workspaceHref = `/the-forge-v2/projects/${project.id}`
    const workspaceRootHref = `/the-forge-v2`

    const isArchived = archivedAt !== null

    const handleUnarchive = (): void => {
        setErrorMessage(null)
        startTransition(async () => {
            const result = await unarchiveCadLabProject(project.id)
            if ("error" in result) {
                setErrorMessage(result.error)
                return
            }
            // On success, return to the workspace list so the restored
            // project is visible amongst active work.
            router.push(workspaceRootHref)
            router.refresh()
        })
    }

    return (
        <div className="uar2">
            {/* ── Breadcrumb ───────────────────────────────────────── */}
            <div className="uar2-breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <Link href={workspaceHref}>{project.name}</Link>
                <span className="sep">›</span>
                <span className="current">Unarchive</span>
            </div>

            {/* ── Page header ─────────────────────────────────────── */}
            <div className="uar2-page-header">
                <div>
                    <h1>
                        <span className="uar2-title-dot" aria-hidden="true" />
                        Unarchive project
                    </h1>
                    <p className="lead">
                        Restore an archived project to your active workspace. Brief, modules, specialist reviews, cost estimates, RFQ drafts — everything is intact. They were never deleted, just hidden.
                    </p>
                </div>
            </div>

            {/* ── Stack (card centred, consistent with mockup) ────── */}
            <div className="uar2-stack">
                {isArchived ? (
                    <ArchivedConfirmation
                        project={project}
                        archivedAt={archivedAt}
                        onUnarchive={handleUnarchive}
                        isPending={isPending}
                        errorMessage={errorMessage}
                        cancelHref={workspaceHref}
                    />
                ) : (
                    <AlreadyActiveState
                        projectName={project.name}
                        workspaceHref={workspaceHref}
                        workspaceRootHref={workspaceRootHref}
                    />
                )}
            </div>
        </div>
    )
}

// ─── Subcomponents ─────────────────────────────────────────────────────

function ArchivedConfirmation(props: {
    project: UnarchiveViewProps["project"]
    archivedAt: string
    onUnarchive: () => void
    isPending: boolean
    errorMessage: string | null
    cancelHref: string
}): React.ReactElement {
    const { project, archivedAt, onUnarchive, isPending, errorMessage, cancelHref } = props
    const archivedLabel = formatIsoDate(archivedAt)

    return (
        <div
            className="uar2-card"
            role="dialog"
            aria-labelledby="uar2-title"
        >
            <div className="uar2-card-head">
                <h2 id="uar2-title">Unarchive project</h2>
                <div className="uar2-meta">
                    <span>Archived {archivedLabel}</span>
                </div>
            </div>

            <div className="uar2-card-body">
                <div className="uar2-subject">{project.name}</div>
                {project.subject && project.subject !== project.name ? (
                    <p className="uar2-subject-desc">{project.subject}</p>
                ) : null}

                <p className="uar2-explain">
                    Unarchiving restores this project to the active workspace at its previous stage. Brief, modules, specialist reviews, cost estimates, and readiness items are intact — they were never deleted, just hidden behind the archive filter.
                </p>

                <div className="uar2-banner info">
                    <div className="b-icon" aria-hidden="true">i</div>
                    <div className="b-body">
                        Archive is reversible. You can keep iterating on this project after unarchiving, or archive it again later — the audit trail keeps the full history either way.
                    </div>
                </div>

                {errorMessage ? (
                    <div className="uar2-banner error" role="alert">
                        <div className="b-icon" aria-hidden="true">!</div>
                        <div className="b-body">
                            <strong>Couldn&rsquo;t unarchive.</strong> {errorMessage}
                        </div>
                    </div>
                ) : null}
            </div>

            <div className="uar2-card-foot">
                <Link href={cancelHref} className="uar2-btn ghost">
                    Cancel
                </Link>
                <button
                    type="button"
                    className="uar2-btn primary"
                    onClick={onUnarchive}
                    disabled={isPending}
                    aria-busy={isPending}
                >
                    {isPending ? "Unarchiving…" : "Unarchive"}
                </button>
            </div>
        </div>
    )
}

function AlreadyActiveState(props: {
    projectName: string
    workspaceHref: string
    workspaceRootHref: string
}): React.ReactElement {
    const { projectName, workspaceHref, workspaceRootHref } = props
    return (
        <div className="uar2-card" role="status" aria-live="polite">
            <div className="uar2-card-head">
                <h2>Already active</h2>
                <div className="uar2-meta">
                    <span>Nothing to unarchive</span>
                </div>
            </div>

            <div className="uar2-card-body">
                <div className="uar2-subject">{projectName}</div>

                <p className="uar2-explain">
                    This project is already in the active workspace. I kept you here so the URL still resolves — but there&rsquo;s no unarchive action to take.
                </p>

                <div className="uar2-banner success">
                    <div className="b-icon" aria-hidden="true">✓</div>
                    <div className="b-body">
                        Head back to the workspace to pick up where you left off, or open the project directly.
                    </div>
                </div>
            </div>

            <div className="uar2-card-foot">
                <Link href={workspaceRootHref} className="uar2-btn ghost">
                    Back to workspace
                </Link>
                <Link href={workspaceHref} className="uar2-btn primary">
                    Open {projectName}
                </Link>
            </div>
        </div>
    )
}

// ─── Helpers ───────────────────────────────────────────────────────────

function formatIsoDate(iso: string): string {
    if (!iso) return ""
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
    })
}
