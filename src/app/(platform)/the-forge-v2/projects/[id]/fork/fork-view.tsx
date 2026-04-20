/**
 * ForkView — Fork artefact page (V2, data-wired).
 *
 * Mockup-faithful port of FORGE-MOCKUP-FORK.html, scoped down per the
 * Fork V1 brief: side-by-side pane with (left) the current locked
 * revision summary (read-only) and (right) a new-revision form
 * scaffold. The real editor lives behind the Brief page lock/unlock
 * flow — so every form control renders disabled with honest copy.
 *
 * Sections (top to bottom):
 *   1. Breadcrumb
 *   2. Page header — fork icon + title + orange title-dot + revision chip
 *   3. (If not locked) Info card steering the user to brief-lock first
 *   4. Side-by-side grid:
 *      - Left pane: current revision summary (mission / target customers /
 *        why-now / constraints) — greyed out, read-only.
 *      - Right pane: new-revision form (title + what-changed + tags)
 *        all disabled, with honest empty-state note at the top.
 *   5. CTA row — Cancel → Brief + disabled Start-new-revision.
 *
 * No data is synthesised. When a narrative field is absent on the
 * current brief, the slot renders "Not yet declared" in the subtle tone,
 * not the mockup's HAPS example copy.
 */

"use client"

import Link from "next/link"
import "./fork-v2.css"

// ─── Types ─────────────────────────────────────────────────────────────

export interface ForkCurrentRevision {
    /** Revision letter — A, B, ... derived from designRevision. */
    letter: string
    /** True once brief_locked_at is set on the project. */
    isLocked: boolean
    /** ISO timestamp of the lock (or createdAt when still draft). */
    stampedAt: string
}

export interface ForkNarrative {
    mission: string | null
    targetCustomers: string | null
    whyNow: string | null
}

export interface ForkConstraints {
    unitCostCeiling: string | null
    firstShipDate: string | null
    maxMass: string | null
    batchSize: string | null
    markets: string | null
    productionRegion: string | null
}

export interface ForkViewProps {
    project: {
        id: string
        name: string
        subject: string
        designRevision: number
    }
    currentRevision: ForkCurrentRevision
    narrative: ForkNarrative
    constraints: ForkConstraints
    /** Optional summary of the highest brief_revisions row (may be empty). */
    latestRevisionSummary: string | null
}

// ─── View ──────────────────────────────────────────────────────────────

export function ForkView(props: ForkViewProps): React.ReactElement {
    const { project, currentRevision, narrative, constraints, latestRevisionSummary } = props

    const workspaceHref = `/the-forge-v2/projects/${project.id}`
    const briefHref = `/the-forge-v2/projects/${project.id}/brief`
    const briefLockHref = `/the-forge-v2/projects/${project.id}/brief-lock`

    const stampedLabel = formatIsoDate(currentRevision.stampedAt)

    return (
        <div className="fk2">
            {/* ── Breadcrumb ───────────────────────────────────────── */}
            <div className="fk2-breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <Link href={workspaceHref}>{project.name}</Link>
                <span className="sep">›</span>
                <span className="current">Fork</span>
            </div>

            {/* ── Page header ─────────────────────────────────────── */}
            <div className="fk2-page-header">
                <div>
                    <h1>
                        <span className="fk2-title-dot" aria-hidden="true" />
                        <svg
                            width="22"
                            height="22"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                        >
                            <circle cx="6" cy="6" r="3" />
                            <circle cx="6" cy="18" r="3" />
                            <circle cx="18" cy="6" r="3" />
                            <path d="M18 9v3a3 3 0 0 1-3 3H9" />
                            <path d="M6 9v6" />
                        </svg>
                        Fork brief · {project.name}
                        <RevisionChip
                            letter={currentRevision.letter}
                            isLocked={currentRevision.isLocked}
                        />
                    </h1>
                    <div className="sub">
                        Start a new revision from the current brief. The parent stays untouched — suppliers keep citing it until the new revision is locked.
                    </div>
                </div>
            </div>

            {/* ── Not-locked guard ────────────────────────────────── */}
            {!currentRevision.isLocked && (
                <div className="fk2-info-card" role="note">
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                    >
                        <rect x="3" y="11" width="18" height="11" rx="2" />
                        <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                    </svg>
                    <div>
                        <strong>Fork starts from a locked revision.</strong>
                        This brief is still in draft — nothing to fork yet. Lock the brief first, then come back here to start the next revision.
                        <br />
                        <Link href={briefLockHref} className="lock-cta">Open brief lock →</Link>
                    </div>
                </div>
            )}

            {/* ── Side-by-side grid ───────────────────────────────── */}
            <div className="fk2-grid">
                {/* Left: current revision (read-only) */}
                <div className="fk2-pane readonly">
                    <div className="fk2-pane-head">
                        <div className="eyebrow">Current revision</div>
                        <h2>
                            Revision {currentRevision.letter}
                            <span
                                className={`fk2-chip ${currentRevision.isLocked ? "brand" : "warning"}`}
                            >
                                {currentRevision.isLocked ? "Locked" : "Draft"}
                            </span>
                        </h2>
                        <p>
                            {currentRevision.isLocked
                                ? `Locked ${stampedLabel}. Read-only snapshot — this is the source of the fork.`
                                : `Created ${stampedLabel}. Draft snapshot — not yet locked.`}
                        </p>
                    </div>
                    <div className="fk2-pane-body">
                        <NarrativeField k="Mission" value={narrative.mission} />
                        <NarrativeField k="Target customers" value={narrative.targetCustomers} />
                        <NarrativeField k="Why now" value={narrative.whyNow} />

                        <div className="fk2-field">
                            <div className="k">Constraints declared</div>
                            <div className="fk2-constraints-grid">
                                <ConstraintItem k="Unit cost ceiling" v={constraints.unitCostCeiling} />
                                <ConstraintItem k="Target first ship" v={constraints.firstShipDate} />
                                <ConstraintItem k="Max mass" v={constraints.maxMass} />
                                <ConstraintItem k="Batch 1" v={constraints.batchSize} />
                                <ConstraintItem k="Markets" v={constraints.markets} />
                                <ConstraintItem k="Production" v={constraints.productionRegion} />
                            </div>
                        </div>

                        {latestRevisionSummary ? (
                            <div className="fk2-field">
                                <div className="k">Latest change note</div>
                                <div className="v">{latestRevisionSummary}</div>
                            </div>
                        ) : null}
                    </div>
                </div>

                {/* Right: new-revision form (all disabled) */}
                <div className="fk2-pane">
                    <div className="fk2-pane-head">
                        <div className="eyebrow">New revision</div>
                        <h2>
                            Revision {nextRevisionLetter(project.designRevision)}
                            <span className="fk2-chip">Scaffold</span>
                        </h2>
                        <p>Describe what changes in the new revision. Downstream artefacts re-run after lock.</p>
                    </div>
                    <div className="fk2-pane-body">
                        <div className="fk2-form-empty">
                            <strong>Form editing ships next round.</strong>
                            For now, the lock / unlock flow runs through the <Link href={briefHref}>Brief page</Link>. Fields below show the shape of the new-revision form so the team can pressure-test the flow before wiring.
                        </div>

                        <div className="fk2-form-field">
                            <label htmlFor="fk2-title">Title</label>
                            <input
                                id="fk2-title"
                                type="text"
                                placeholder={`e.g. ${project.name} — Revision ${nextRevisionLetter(project.designRevision)}`}
                                disabled
                                aria-disabled="true"
                            />
                            <p className="hint">Shown on revision history and on the Brief header once locked.</p>
                        </div>

                        <div className="fk2-form-field">
                            <label htmlFor="fk2-summary">What changed</label>
                            <textarea
                                id="fk2-summary"
                                placeholder="One clear paragraph — what drove this revision? Customer ask, certification update, supplier swap, design learning."
                                disabled
                                aria-disabled="true"
                            />
                            <p className="hint">The change log — readable by specialists six months from now without extra context.</p>
                        </div>

                        <div className="fk2-form-field">
                            <label htmlFor="fk2-tags">Tags</label>
                            <div
                                id="fk2-tags"
                                className="fk2-tags"
                                role="group"
                                aria-disabled="true"
                                aria-label="Tags (disabled — editor ships next round)"
                            >
                                <span className="fk2-tag">supplier-swap</span>
                                <span className="fk2-tag">tolerance</span>
                                <span className="fk2-tag">cost-down</span>
                            </div>
                            <p className="hint">Optional — used for filtering revision history and tripping audit triggers.</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── CTA row ─────────────────────────────────────────── */}
            <div className="fk2-cta-row">
                <div className="fk2-cta-note">
                    Creating a new revision will keep the parent locked and intact. Suppliers continue quoting the parent until the new revision is locked.
                </div>
                <div className="fk2-btn-group">
                    <Link href={briefHref} className="fk2-btn ghost">Cancel — back to Brief</Link>
                    <button
                        type="button"
                        className="fk2-btn primary"
                        disabled
                        aria-disabled="true"
                        title="Form editing ships next round — use the Brief page lock flow for now."
                    >
                        Start new revision →
                    </button>
                </div>
            </div>
        </div>
    )
}

// ─── Subcomponents ─────────────────────────────────────────────────────

function RevisionChip({ letter, isLocked }: { letter: string; isLocked: boolean }): React.ReactElement {
    return (
        <span className={`fk2-chip ${isLocked ? "brand" : "warning"}`}>
            Revision {letter}{isLocked ? " · locked" : " · draft"}
        </span>
    )
}

function NarrativeField({ k, value }: { k: string; value: string | null }): React.ReactElement {
    const hasValue = typeof value === "string" && value.trim().length > 0
    return (
        <div className="fk2-field">
            <div className="k">{k}</div>
            <div className={`v${hasValue ? "" : " empty"}`}>
                {hasValue ? value : "Not yet declared"}
            </div>
        </div>
    )
}

function ConstraintItem({ k, v }: { k: string; v: string | null }): React.ReactElement {
    const hasValue = typeof v === "string" && v.trim().length > 0
    return (
        <div className="c-item">
            <span className="c-k">{k}:</span>{" "}
            {hasValue ? <strong>{v}</strong> : <span className="empty">—</span>}
        </div>
    )
}

// ─── Helpers ───────────────────────────────────────────────────────────

function nextRevisionLetter(current: number): string {
    const next = Math.max(1, current) + 1
    return designRevisionToLetter(next)
}

function designRevisionToLetter(n: number): string {
    if (!Number.isFinite(n) || n < 1) return "A"
    const idx = Math.floor(n) - 1
    if (idx < 26) return String.fromCharCode(65 + idx)
    // Two-letter fallback for >26 revisions (AA, AB, ...).
    const first = Math.floor(idx / 26) - 1
    const second = idx % 26
    return `${String.fromCharCode(65 + first)}${String.fromCharCode(65 + second)}`
}

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
