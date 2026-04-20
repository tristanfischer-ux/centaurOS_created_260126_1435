/**
 * RevisionsView — Revisions artefact page (V2, mockup-faithful).
 *
 * Port of FORGE-MOCKUP-REVISIONS.html. Scoped CSS under `.rv2` keeps the
 * styling isolated so the mockup's dark-header card and diff cards don't
 * leak into the rest of the platform.
 *
 * Sections (top to bottom):
 *   1. Breadcrumb
 *   2. Annotation note — explains what a revision is
 *   3. Dark header card — project name + rev arrow line (parent → current) + CTAs
 *   4. Diff summary strip — 4 stat tiles (parts / modules / mass / cost)
 *   5. "Inherited" diff-section — unchanged parts carried forward
 *   6. "Revision history" diff-section — list of every brief_revision row
 *   7. Compliance impact grid — 3 cells (new / new / re-test)
 *   8. Supplier overlap diff-section
 *
 * Empty-state policy: per-part diffs, mass, cost, compliance and supplier
 * specifics don't exist in the current data contract (brief_revisions only
 * stores label + summary + locked_at). Every such field renders an honest
 * "Revision-diff engine not yet wired" placeholder. No mockup specifics
 * (T800 prepreg, +2.4 kg, Helukabel) are fabricated.
 */

"use client"

import Link from "next/link"
import "./revisions-v2.css"

// ─── Types ──────────────────────────────────────────────────────────────

export interface RevisionRow {
    /** Stable key for React. */
    id: string
    /** 1, 2, 3 … (highest = most recent since we order desc). */
    revisionNumber: number
    /** Free-text label ("Revision A (current · locked)", "Draft 0.3 → Revision A"). */
    revisionLabel: string
    /** Short summary of what changed. */
    summary: string
    /** ISO timestamp — populated when the revision is frozen against suppliers. */
    lockedAt: string | null
    /** ISO timestamp — when this row was created. */
    createdAt: string
}

export interface RevisionsViewProps {
    project: {
        id: string
        name: string
        designRevision: number
    }
    /** All rows in `brief_revisions` for this project, ordered by
     *  `revision_number DESC` (newest first). May be empty. */
    revisions: RevisionRow[]
}

// ─── Helpers ────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
    if (!iso) return "—"
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return "—"
    return d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
    })
}

// ─── View ───────────────────────────────────────────────────────────────

export function RevisionsView(props: RevisionsViewProps): React.ReactElement {
    const { project, revisions } = props
    const base = `/the-forge-v2/projects/${project.id}`

    // Empty state — no revisions yet. Per brief: render an empty-state card
    // that points at brief-lock. Never fake rows.
    if (revisions.length === 0) {
        return (
            <div className="rv2">
                <div className="rv2-breadcrumb">
                    <Link href="/the-forge-v2">Forge</Link>
                    <span className="sep">›</span>
                    <Link href={base}>{project.name}</Link>
                    <span className="sep">›</span>
                    <span className="current">Revisions</span>
                </div>

                <div className="rv2-empty">
                    <div className="icon" aria-hidden="true">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="6" cy="6" r="3" />
                            <circle cx="6" cy="18" r="3" />
                            <path d="M6 9v6" />
                            <path d="M18 6a3 3 0 1 1-6 0" />
                            <path d="M15 9v3a6 6 0 0 0 6 6" />
                        </svg>
                    </div>
                    <h2>No revisions yet</h2>
                    <p>
                        Lock your first brief to start a revision history. Locked revisions are the
                        units suppliers quote against — forks carry the BOM, suppliers and
                        compliance packet forward.
                    </p>
                    <Link href={`${base}/brief-lock`} className="rv2-btn primary">
                        Go to brief lock
                    </Link>
                </div>
            </div>
        )
    }

    // Determine parent/child for the header arrow. The newest row is current;
    // the row immediately below it (if any) is the parent.
    const current = revisions[0]
    const parent = revisions.length > 1 ? revisions[1] : null

    // Locked status for the header. Only one revision is "current · locked"
    // in the HAPS seed; others are drafts.
    const hasLockedCurrent = current.lockedAt != null

    return (
        <div className="rv2">
            {/* ── Breadcrumb ──────────────────────────── */}
            <div className="rv2-breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <Link href={base}>{project.name}</Link>
                <span className="sep">›</span>
                <span className="current">Revisions</span>
            </div>

            {/* ── Annotation note ─────────────────────── */}
            <div className="rv2-annot">
                <strong>Note</strong>
                Revisions are the cycle primitive. Each locked revision inherits the BOM,
                supplier shortlist and compliance packet from its parent. Only the diff
                re-runs the specialist pipeline. Forks (e.g. a maritime-hardened variant)
                land here as new rows — the parent stays live for suppliers already quoting
                against it.
            </div>

            {/* ── How this works ──────────────────────── */}
            <div className="rv2-how">
                <div className="rv2-how__head">How this works</div>
                <ul className="rv2-how__list">
                    <li>Create a new revision when your brief, BOM, or cost changes materially — say, after a supplier quote swap or a scope cut.</li>
                    <li>Each revision is a named snapshot (Rev A / B / C…). Old revisions stay readable. You can compare any two side by side.</li>
                    <li>Lock Rev N to send it to Forge — suppliers, specialists, and manufacturing plan all pin to the locked revision.</li>
                </ul>
                <div className="rv2-how__foot">
                    Questions → <Link href="/the-forge/ask">/the-forge/ask</Link> — ask a specialist
                </div>
            </div>

            {/* ── Dark header card ────────────────────── */}
            <div className="rv2-header-card">
                <h1>{project.name}</h1>
                <div className="sub">
                    {parent
                        ? `Forked from v${parent.revisionNumber} · ${revisions.length} revision${revisions.length === 1 ? "" : "s"} recorded`
                        : `First revision on file · locked ${formatDate(current.lockedAt)}`
                    }
                </div>
                <div className="rv2-rev-line">
                    {parent && (
                        <>
                            <div className={`rv2-rev-dot ${parent.lockedAt ? "parent" : "draft"}`}>
                                v{parent.revisionNumber}
                                {parent.lockedAt ? ` · locked ${formatDate(parent.lockedAt)}` : " · draft"}
                            </div>
                            <span className="rv2-rev-arrow" aria-hidden="true">→</span>
                        </>
                    )}
                    <div className={`rv2-rev-dot ${current.lockedAt ? "parent" : "child"}`}>
                        v{current.revisionNumber}
                        {current.lockedAt ? ` · locked ${formatDate(current.lockedAt)}` : " · draft"}
                    </div>
                    <div className="cta-spacer">
                        <Link href={`${base}/brief-lock`} className="rv2-btn on-dark">
                            {hasLockedCurrent ? "Fork new revision" : "Lock revision"}
                        </Link>
                        <Link href={`${base}/brief`} className="rv2-btn primary">
                            View brief
                        </Link>
                    </div>
                </div>
            </div>

            {/* ── Diff summary strip ──────────────────── */}
            {/* Honest empty-state: the diff-engine for per-part/mass/cost/supplier
                deltas hasn't shipped yet. Mirrors the mockup grid but shows "—" so
                the reader can see what WILL land once the diff engine is wired. */}
            <div className="rv2-diff-summary">
                <div className="rv2-diff-card">
                    <div className="label">Parts changed</div>
                    <div className="value muted">—</div>
                    <div className="sub">diff engine not yet wired</div>
                </div>
                <div className="rv2-diff-card">
                    <div className="label">Modules affected</div>
                    <div className="value muted">—</div>
                    <div className="sub">per-module diff ships next</div>
                </div>
                <div className="rv2-diff-card">
                    <div className="label">Mass impact</div>
                    <div className="value muted">—</div>
                    <div className="sub">mass roll-up pending</div>
                </div>
                <div className="rv2-diff-card">
                    <div className="label">Cost impact</div>
                    <div className="value muted">—</div>
                    <div className="sub">cost roll-up pending</div>
                </div>
            </div>

            {/* ── Inherited from parent ───────────────── */}
            <div className="rv2-diff-section">
                <h3>
                    Inherited from parent revision
                    <span className="count">
                        {parent
                            ? `v${parent.revisionNumber} → v${current.revisionNumber}`
                            : "origin revision"
                        }
                    </span>
                </h3>
                <p className="muted">
                    BOM, supplier shortlist and compliance packet carry across from the parent
                    revision by default. <strong>Only the diff re-runs the specialist pipeline.</strong>
                    {" "}First-article inspection on shared parts does not re-run.
                    Part-level diff visibility lands once the revision-diff engine is wired —
                    the list below is the canonical revision history today.
                </p>
            </div>

            {/* ── Revision history — one row per brief_revision ── */}
            <div className="rv2-diff-section">
                <h3>
                    Revision history
                    <span className="count">
                        {revisions.length} row{revisions.length === 1 ? "" : "s"} · newest first
                    </span>
                </h3>
                <div>
                    {revisions.map((r) => {
                        const isCurrent = r.revisionNumber === current.revisionNumber
                        const numClass = r.lockedAt
                            ? isCurrent ? "current" : "locked"
                            : ""
                        return (
                            <div key={r.id} className="rv2-rev-row">
                                <div className={`num ${numClass}`}>v{r.revisionNumber}</div>
                                <div>
                                    <div className="label">{r.revisionLabel}</div>
                                    {r.summary && <div className="summary">{r.summary}</div>}
                                </div>
                                <div className="meta">
                                    {formatDate(r.createdAt)}
                                    <br />
                                    <span className={`status ${r.lockedAt ? "locked" : "draft"}`}>
                                        {r.lockedAt ? "Locked" : "Draft"}
                                    </span>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* ── Compliance impact ───────────────────── */}
            <div className="rv2-diff-section">
                <h3>
                    Compliance impact
                    <span className="count">re-test flags per revision pending</span>
                </h3>
                <div className="rv2-compliance-grid">
                    <div className="rv2-compliance-cell">
                        <div className="tag">Inherited</div>
                        <div className="title">Compliance packet carried forward</div>
                        <div className="desc">
                            Cert list, test reports and DOA evidence inherit from the parent
                            revision unless a diff triggers a re-test.
                        </div>
                    </div>
                    <div className="rv2-compliance-cell">
                        <div className="tag">Pending</div>
                        <div className="title">New-cert detection</div>
                        <div className="desc">
                            Added parts or materials that require new qualification (salt-fog,
                            water-ingress, etc.) will surface here once the diff engine ships.
                        </div>
                    </div>
                    <div className="rv2-compliance-cell retest">
                        <div className="tag">Pending</div>
                        <div className="title">Re-test detection</div>
                        <div className="desc">
                            Geometry or chemistry changes that invalidate an existing cert
                            (UN38.3, IP ratings) will raise a re-test flag here.
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Supplier overlap ────────────────────── */}
            <div className="rv2-diff-section">
                <h3>
                    Supplier overlap
                    <span className="count">shortlist carries forward</span>
                </h3>
                <p>
                    <strong>Suppliers from the parent revision are reused by default.</strong>
                    {" "}No RFQ re-runs are needed on inherited parts. Per-part supplier swaps
                    (e.g. marine-rated cabling for a maritime fork) surface here once the
                    revision-diff engine is wired. Until then, use the{" "}
                    <Link href={`${base}/suppliers`} style={{ color: "var(--rv-brand)", fontWeight: 600, textDecoration: "none" }}>
                        Suppliers artefact
                    </Link>
                    {" "}to see the current shortlist.
                </p>
            </div>
        </div>
    )
}
