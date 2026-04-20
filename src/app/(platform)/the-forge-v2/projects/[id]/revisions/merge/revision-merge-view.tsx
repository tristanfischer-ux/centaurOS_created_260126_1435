/**
 * RevisionMergeView — Revision-merge cockpit (V2, mockup-faithful).
 *
 * Port of FORGE-MOCKUP-REVISION-MERGE.html. Scoped CSS under `.rm2` keeps the
 * merge-specific styling (light-gradient head card, revision-tree SVG,
 * strategy selector, diff table, conflict walkthrough) isolated from the
 * rest of the platform.
 *
 * Sections (top to bottom):
 *   1. Breadcrumb
 *   2. Annotation note — why merges are rare and high-stakes
 *   3. Page title + lede
 *   4. Two-column grid — main merge-wrap card + right-hand side cards
 *      Main card:
 *        - Merge head (source + target summary)
 *        - Revision tree SVG (source → new → target)
 *        - Merge strategy selector (3 options)
 *        - Artefact-level diff summary (table of 9 artefacts in the mockup)
 *        - Conflict walkthrough example
 *        - Foot actions (Cancel / Preview / Execute)
 *      Side cards:
 *        - Why merge now
 *        - Merge impact
 *        - After merge
 *
 * Data contract today:
 *   - `brief_revisions` stores revision_number + revision_label + summary +
 *     locked_at only. Per-artefact diffs, conflict counts, supplier re-quotes,
 *     cost ceilings etc. do NOT exist in the schema today.
 *   - Query params `?from=<N>&to=<N>` pick source + target; default is the two
 *     most recent revisions.
 *   - If fewer than 2 revisions exist, render the empty-state card that
 *     points at `/fork`.
 *
 * Empty-state policy: per the brief, this page is the cockpit only. Artefact
 * diffs, conflict counts, cost reconciliation and the merge mutation itself
 * are NOT wired. Every such field renders honest copy ("not yet wired", "—",
 * "ships next round"). No mockup specifics (£195,000, 67 conflicts, Royal
 * Navy, 3 units shipped) are fabricated.
 */

"use client"

import Link from "next/link"
import "./revision-merge-v2.css"

// ─── Types ──────────────────────────────────────────────────────────────

export interface RevisionRow {
    /** Stable key for React. */
    id: string
    /** 1, 2, 3 … (highest = most recent since we order desc in the loader). */
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

export interface RevisionMergeViewProps {
    project: {
        id: string
        name: string
        designRevision: number
    }
    /** All rows in `brief_revisions` for this project, ordered by
     *  `revision_number DESC` (newest first). May be empty. */
    revisions: RevisionRow[]
    /** Source revision number from ?from=. Null if the param was absent. */
    fromRevision: number | null
    /** Target revision number from ?to=. Null if the param was absent. */
    toRevision: number | null
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

/**
 * Pick the source + target rows. Prefers `?from=` / `?to=` query params when
 * both resolve to an existing revision. Falls back to "newest two":
 *   - source = second-newest (index 1)
 *   - target = newest        (index 0)
 *
 * Returns `null` for either slot if the caller explicitly asked for a row
 * that doesn't exist — callers then fall back to default-resolution.
 */
function resolvePair(
    revisions: RevisionRow[],
    fromRev: number | null,
    toRev: number | null,
): { source: RevisionRow; target: RevisionRow } | null {
    if (revisions.length < 2) return null

    const newest = revisions[0]
    const prev = revisions[1]

    const fromRow = fromRev != null ? revisions.find((r) => r.revisionNumber === fromRev) : null
    const toRow = toRev != null ? revisions.find((r) => r.revisionNumber === toRev) : null

    const source = fromRow ?? prev
    const target = toRow ?? newest

    // If both resolved to the same row, we can't merge a rev into itself —
    // fall back to default pair.
    if (source.revisionNumber === target.revisionNumber) {
        return { source: prev, target: newest }
    }

    return { source, target }
}

// ─── View ───────────────────────────────────────────────────────────────

export function RevisionMergeView(props: RevisionMergeViewProps): React.ReactElement {
    const { project, revisions, fromRevision, toRevision } = props
    const base = `/the-forge-v2/projects/${project.id}`

    // ── Empty state: fewer than 2 revisions ───────────────────────
    // Per brief: show a card explaining the requirement and point at /fork.
    if (revisions.length < 2) {
        return (
            <div className="rm2">
                <div className="rm2-breadcrumb">
                    <Link href="/the-forge-v2">Forge</Link>
                    <span className="sep">›</span>
                    <Link href={base}>{project.name}</Link>
                    <span className="sep">›</span>
                    <Link href={`${base}/revisions`}>Revisions</Link>
                    <span className="sep">›</span>
                    <span className="current">Merge</span>
                </div>

                <div className="rm2-empty">
                    <div className="icon" aria-hidden="true">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="6" cy="6" r="3" />
                            <circle cx="6" cy="18" r="3" />
                            <path d="M6 9v6" />
                            <path d="M18 6a3 3 0 1 1-6 0" />
                            <path d="M15 9v3a6 6 0 0 0 6 6" />
                        </svg>
                    </div>
                    <h2>Need at least 2 revisions to merge</h2>
                    <p>
                        Fork the brief to create a second revision. Once two or more locked revisions
                        exist you can pick any pair to merge.
                    </p>
                    <Link href={`${base}/fork`} className="rm2-btn-primary">
                        Go to fork
                    </Link>
                </div>
            </div>
        )
    }

    const pair = resolvePair(revisions, fromRevision, toRevision)
    // `pair` is guaranteed non-null when revisions.length >= 2 by resolvePair.
    // Fallback here is defensive only.
    if (!pair) {
        return (
            <div className="rm2">
                <div className="rm2-breadcrumb">
                    <Link href="/the-forge-v2">Forge</Link>
                    <span className="sep">›</span>
                    <Link href={base}>{project.name}</Link>
                    <span className="sep">›</span>
                    <Link href={`${base}/revisions`}>Revisions</Link>
                    <span className="sep">›</span>
                    <span className="current">Merge</span>
                </div>
                <div className="rm2-empty">
                    <h2>Could not resolve a revision pair to merge</h2>
                    <p>Pick two different revisions and try again.</p>
                    <Link href={`${base}/revisions`} className="rm2-btn-primary">
                        Back to revisions
                    </Link>
                </div>
            </div>
        )
    }

    const { source, target } = pair
    const sourceLabel = `v${source.revisionNumber}`
    const targetLabel = `v${target.revisionNumber}`
    const nextRevisionNumber = Math.max(...revisions.map((r) => r.revisionNumber)) + 1
    const newLabel = `v${nextRevisionNumber}`

    return (
        <div className="rm2">
            {/* ── Breadcrumb ──────────────────────────── */}
            <div className="rm2-breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <Link href={base}>{project.name}</Link>
                <span className="sep">›</span>
                <Link href={`${base}/revisions`}>Revisions</Link>
                <span className="sep">›</span>
                <span className="current">
                    Merge {sourceLabel} → {newLabel}
                </span>
            </div>

            {/* ── Annotation note ─────────────────────── */}
            <div className="rm2-annot">
                <strong>Note</strong>
                Merges are rare but high-stakes. A bad merge corrupts the artefact spine; that&apos;s
                why each conflict is explicit. Most teams fork and merge once or twice in a
                product&apos;s life. The decision tree is: accept from source ({sourceLabel}), keep
                from target ({targetLabel}), or manually reconcile (both values are wrong; you set a
                new one). ForgeOS never auto-resolves at artefact granularity — the founder signs off
                each conflict.
            </div>

            {/* ── Page title + lede ────────────────────── */}
            <h1 className="rm2-title">
                <span className="rm2-title-dot" aria-hidden="true" />
                Merge {sourceLabel} → {newLabel}
            </h1>
            <p className="rm2-lede">
                Fold {source.revisionLabel || sourceLabel} back into the main line. Conflicts
                resolve at artefact granularity — each artefact is either accepted from source
                ({sourceLabel}), kept from target ({targetLabel}), or manually reconciled.
            </p>

            {/* ── Two-column grid ─────────────────────── */}
            <div className="rm2-grid">

                {/* ── Main merge card ────────────────────── */}
                <div className="rm2-wrap">

                    {/* ── Merge head ───────────────────────── */}
                    <div className="rm2-head">
                        <h2>Merge preview — artefact diff engine not yet wired</h2>
                        <p>
                            Source: <strong>{sourceLabel}{source.revisionLabel ? ` — ${source.revisionLabel}` : ""}</strong>
                            {source.lockedAt ? ` · locked ${formatDate(source.lockedAt)}` : " · draft"}
                            {" · "}Target: <strong>{targetLabel}{target.revisionLabel ? ` — ${target.revisionLabel}` : ""}</strong>
                            {target.lockedAt ? ` · locked ${formatDate(target.lockedAt)}` : " · draft"}
                            {" · "}New revision: <strong>{newLabel}</strong> (pending · will be created on merge).
                        </p>
                    </div>

                    {/* ── Revision tree SVG ───────────────── */}
                    <div className="rm2-tree-section">
                        <h3>Revision tree · before and after</h3>
                        <div className="rm2-tree">
                            <svg viewBox="0 0 700 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Revision merge tree diagram">
                                <g>
                                    {/* Target (shipped / current main line) */}
                                    <circle cx="90" cy="110" r="22" fill="#16a34a" stroke="#fff" strokeWidth="3" />
                                    <text x="90" y="115" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">{targetLabel}</text>
                                    <text x="90" y="152" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#1c1917">
                                        {target.lockedAt ? "TARGET · LOCKED" : "TARGET · DRAFT"}
                                    </text>
                                    <text x="90" y="166" textAnchor="middle" fontSize="9.5" fill="#78716c">
                                        {formatDate(target.lockedAt ?? target.createdAt)}
                                    </text>

                                    {/* Connector target → source fork */}
                                    <line x1="112" y1="110" x2="310" y2="60" stroke="#78716c" strokeWidth="1.6" />

                                    {/* Source (fork / branch) */}
                                    <circle cx="330" cy="50" r="22" fill="#2563eb" stroke="#fff" strokeWidth="3" />
                                    <text x="330" y="55" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">{sourceLabel}</text>
                                    <text x="370" y="48" textAnchor="start" fontSize="11.5" fontWeight="700" fill="#2563eb">
                                        {source.revisionLabel || sourceLabel} — source
                                    </text>
                                    <text x="370" y="62" textAnchor="start" fontSize="10" fill="#78716c">
                                        {source.lockedAt ? `locked ${formatDate(source.lockedAt)}` : "draft"}
                                    </text>

                                    {/* Connector source → new (merging) */}
                                    <line x1="352" y1="50" x2="560" y2="100" stroke="#ff4500" strokeWidth="2.5" strokeDasharray="5,3" />

                                    {/* Connector target → new (merging) */}
                                    <line x1="112" y1="110" x2="560" y2="108" stroke="#ff4500" strokeWidth="2.5" strokeDasharray="5,3" />

                                    {/* New revision (merging now) */}
                                    <circle cx="580" cy="108" r="26" fill="#fff" stroke="#ff4500" strokeWidth="3" strokeDasharray="6,4" />
                                    <text x="580" y="114" textAnchor="middle" fontSize="12" fontWeight="700" fill="#ff4500">{newLabel}</text>
                                    <text x="580" y="150" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#ff4500">MERGING NOW</text>
                                    <text x="580" y="164" textAnchor="middle" fontSize="9.5" fill="#78716c">new revision · pending</text>

                                    {/* Legend */}
                                    <g transform="translate(20,188)" fontSize="10">
                                        <circle cx="6" cy="0" r="5" fill="#16a34a" />
                                        <text x="14" y="4" fill="#1c1917">Target</text>
                                        <circle cx="70" cy="0" r="5" fill="#2563eb" />
                                        <text x="78" y="4" fill="#1c1917">Source</text>
                                        <circle cx="150" cy="0" r="5" fill="#fff" stroke="#ff4500" strokeWidth="1.5" strokeDasharray="3,2" />
                                        <text x="158" y="4" fill="#1c1917">Merging (new)</text>
                                    </g>
                                </g>
                            </svg>
                        </div>
                    </div>

                    {/* ── Merge strategy ──────────────────── */}
                    <div className="rm2-strategy">
                        <h3>Merge strategy</h3>
                        <div className="rm2-strat-choice">
                            <div className="rm2-strat-opt selected">
                                <h4>Merge all to {newLabel}</h4>
                                <p>
                                    Unify both lines. Fold conflicts per-artefact below. Creates a single
                                    downstream revision.
                                </p>
                            </div>
                            <div className="rm2-strat-opt">
                                <h4>Cherry-pick</h4>
                                <p>
                                    Pick specific artefacts from {sourceLabel} into the target main line.
                                    Other artefacts stay siloed.
                                </p>
                            </div>
                            <div className="rm2-strat-opt">
                                <h4>Preserve {sourceLabel} as separate variant</h4>
                                <p>
                                    Don&apos;t merge. {sourceLabel} keeps shipping as a variant indefinitely.
                                    Accepts parallel maintenance cost.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* ── Artefact-level diff summary ─────── */}
                    {/* Honest empty state: brief_revisions has no artefact-diff payload
                        today. We still port the full artefact taxonomy from the mockup
                        (Brief / Modules / BOM / Suppliers / Risks / Cost / Experts /
                        Geometry / Launch) so the reader can see the shape of a future
                        merge. Status + counts read "not yet wired" across the board. */}
                    <div className="rm2-artefact-diff">
                        <h3>Artefact-level diff summary · 9 artefacts</h3>
                        <div className="rm2-diff-table">
                            <div className="rm2-dt-row head">
                                <div>Artefact</div>
                                <div>Deltas</div>
                                <div>Status</div>
                                <div>Action</div>
                            </div>

                            {ARTEFACTS.map((a) => (
                                <div key={a.name} className="rm2-dt-row">
                                    <div className="a-name">{a.name}</div>
                                    <div>
                                        <div className="a-desc">{a.desc}</div>
                                    </div>
                                    <div>
                                        <span className="a-status muted">not yet wired</span>
                                    </div>
                                    <span className="a-action disabled">Review diffs →</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ── Conflict walkthrough example ────── */}
                    {/* Kept as a visual placeholder. The mockup demonstrates the resolve
                        UX with a cost-ceiling example; we render the same shell with
                        honest empty-state copy so the reader sees what WILL land once
                        the diff engine ships. No fabricated £ values. */}
                    <div className="rm2-conflict-card">
                        <h4>
                            Conflict walkthrough — shape of a future resolve
                            <span className="chip">not wired</span>
                        </h4>
                        <p>
                            Once the revision-diff engine is wired, each conflict surfaces as its own
                            decision: accept from source ({sourceLabel}), keep target ({targetLabel}),
                            or reconcile to a new value. The founder signs off every conflict — ForgeOS
                            never auto-resolves at artefact granularity. The three cards below show the
                            resolve pattern; values land with the diff engine.
                        </p>
                        <div className="rm2-conflict-values">
                            <div className="rm2-conflict-val">
                                <div className="cv-label">From {targetLabel}</div>
                                <div className="cv-value">—</div>
                                <div className="cv-sub">Target value will appear here.</div>
                            </div>
                            <div className="rm2-conflict-val">
                                <div className="cv-label">Reconcile (new)</div>
                                <div className="cv-value">—</div>
                                <div className="cv-sub">Manual value entry will appear here.</div>
                            </div>
                            <div className="rm2-conflict-val">
                                <div className="cv-label">From {sourceLabel}</div>
                                <div className="cv-value">—</div>
                                <div className="cv-sub">Source value will appear here.</div>
                            </div>
                        </div>
                    </div>

                    {/* ── Foot actions ────────────────────── */}
                    <div className="rm2-foot">
                        <Link href={`${base}/revisions`} className="rm2-btn-ghost">Cancel</Link>
                        <div className="rm2-foot-actions">
                            <span className="rm2-btn-secondary disabled" aria-disabled="true">
                                Preview merged {newLabel}
                            </span>
                            <span className="rm2-btn-primary disabled" aria-disabled="true">
                                Merge mutation ships next round
                                <span className="sub">creates new revision {newLabel}</span>
                            </span>
                        </div>
                    </div>

                </div>

                {/* ── Right column: side cards ──────────── */}
                <div className="rm2-side-col">
                    <div className="rm2-side-card">
                        <h4>Why merge now</h4>
                        <p>
                            Merges fold a fork back into the main line so future revisions inherit a
                            single unified spine. Once both lines are validated, a merge stops the
                            parallel-maintenance cost.
                        </p>
                        <p>
                            Alternative: keep {sourceLabel} as a permanent variant and accept parallel
                            BOM + supplier maintenance. Choose the merge when the suppliers, BOM and
                            compliance packet overlap enough to justify reconciliation.
                        </p>
                    </div>
                    <div className="rm2-side-card">
                        <h4>Merge impact</h4>
                        <div className="row"><div className="k">Total conflicts</div><div className="v muted">—</div></div>
                        <div className="row"><div className="k">Artefacts touched</div><div className="v muted">—</div></div>
                        <div className="row"><div className="k">Suppliers re-quoted</div><div className="v muted">—</div></div>
                        <div className="row"><div className="k">New cost ceiling</div><div className="v muted">—</div></div>
                        <div className="row"><div className="k">Est. reconcile time</div><div className="v muted">—</div></div>
                    </div>
                    <div className="rm2-side-card">
                        <h4>After merge</h4>
                        <p>
                            {targetLabel} stays shipped. {sourceLabel} stays shipped. {newLabel} becomes
                            the new active revision. Future forks branch from {newLabel}.
                        </p>
                        <p>
                            Operational units keep reporting into their original revisions;
                            {" "}{newLabel} starts a fresh scorecard once the diff engine lands.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─── Data ───────────────────────────────────────────────────────────────

/**
 * The 9 artefact rows ported from the mockup's diff table. Descriptions are
 * generic (no project-specific fabrications) so the table teaches the reader
 * which artefacts a future merge will cover, without inventing deltas the
 * data contract can't provide.
 */
const ARTEFACTS: ReadonlyArray<{ name: string; desc: string }> = [
    {
        name: "Brief",
        desc: "Cost ceiling, regulatory envelope and customer list surface here once the diff engine reads both revisions side-by-side.",
    },
    {
        name: "Modules",
        desc: "Module-level configuration conflicts (architecture swaps, alternative sub-systems) surface here per module.",
    },
    {
        name: "BOM",
        desc: "Part-level swaps and additions surface here. Each swap is explicit — accept source, keep target, or reconcile.",
    },
    {
        name: "Suppliers",
        desc: "Shortlist deltas and new vendors added on either line surface here. Overlapping suppliers carry forward by default.",
    },
    {
        name: "Risks",
        desc: "Risks added on either line surface here. The merge preserves both risk registers unless a line explicitly retires a risk.",
    },
    {
        name: "Cost",
        desc: "Cost ceiling and unit-cost deltas surface here. A single reconciled number lands on the merged revision.",
    },
    {
        name: "Experts",
        desc: "Specialist rosters merge here. New advisors added on either line fold into the combined roster.",
    },
    {
        name: "Geometry",
        desc: "Part-level geometry revisions surface here. The geometry spine has to stay aligned across both source and target.",
    },
    {
        name: "Launch",
        desc: "Launch plans from both lines surface here. They can merge as a single plan or ship as two distinct launches under the new revision.",
    },
]
