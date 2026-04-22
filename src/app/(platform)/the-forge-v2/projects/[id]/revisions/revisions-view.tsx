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
 *   3. Pedagogy card ("How this works") — only shown on first revision
 *   4. Dense dark hero banner — project name + version chip + metric-row
 *      (Parts changed · Mass delta · Cost delta · Outstanding issues) +
 *      Accept / Promote CTAs. Metrics render "—" until the revision-diff
 *      engine lands.
 *   5. "Inherited from vX · unchanged" summary block
 *   6. Change list by subsystem — one card per module with per-part chips
 *   7. "Revision history" diff-section — list of every brief_revision row
 *   8. Compliance impact grid — 3 cells (new / new / re-test)
 *   9. Supplier overlap diff-section
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

/**
 * Subsystem row used by the "Change list" section. Represents one module in
 * the current revision. Per-part diffs (added / modified / removed + mass
 * delta + cost delta) don't exist in the schema today — when the diff
 * engine lands, extend this interface with a `changes: ChangeRow[]` field
 * and the view will swap its honest empty state for diff rows.
 */
export interface ChangeListModule {
    id: string
    /** Short badge used in the group header, e.g. "M1". */
    code: string
    /** Module display name, e.g. "Upper Fuselage Deck". */
    name: string
    /** One-line purpose, used as the group subtitle. */
    purpose: string
    /** Major parts currently declared on this module — shown as a chip list
     *  so founders can see what will participate in future diffs. */
    keyParts: string[]
    /** Optional AI-estimated mass so the card shows a current-state tile even
     *  before the diff engine ships mass deltas. */
    estimatedMassKg: number | null
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
    /** Current-revision module list used to drive the subsystem-grouped
     *  change list. May be empty when decomposition hasn't run. */
    changeListModules: ChangeListModule[]
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
    const { project, revisions, changeListModules } = props
    const base = `/the-forge-v2/projects/${project.id}`

    // Pedagogy card policy: show the "How this works" explainer only when
    // the founder hasn't locked a second revision yet. Once they've built
    // real history (2+ rows), dive straight into the data.
    const showPedagogy = revisions.length <= 1

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

            {/* ── How this works — pedagogy card, hidden once the founder
                 has built real revision history (2+ rows). First-revision
                 visitors still get the explainer; power users dive straight
                 into the data. */}
            {showPedagogy && (
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
            )}

            {/* ── Dense dark hero banner ──────────────────
                 Combines the title · version chip · shipped date · metric-row
                 · Accept/Promote CTAs in a single block so founders see the
                 revision's state at a glance. Mirrors FORGE-MOCKUP-REVISIONS
                 but with honest "—" placeholders for the metrics that the
                 revision-diff engine doesn't yet emit. */}
            <div className="rv2-header-card">
                <div className="rv2-header-top">
                    <div>
                        <h1>
                            <span className="rv2-title-dot" aria-hidden="true" />
                            {project.name}
                            <span
                                className={`rv2-version-chip ${hasLockedCurrent ? "locked" : "draft"}`}
                            >
                                v{current.revisionNumber}
                                {hasLockedCurrent ? " · locked" : " · draft"}
                            </span>
                        </h1>
                        <div className="sub">
                            {parent
                                ? `Forked from v${parent.revisionNumber} · ${hasLockedCurrent ? `locked ${formatDate(current.lockedAt)}` : `draft since ${formatDate(current.createdAt)}`}`
                                : hasLockedCurrent
                                    ? `First revision on file · locked ${formatDate(current.lockedAt)}`
                                    : `First revision on file · draft since ${formatDate(current.createdAt)}`
                            }
                        </div>
                    </div>
                    <div className="rv2-header-ctas">
                        <Link
                            href={`${base}/revisions/merge`}
                            className="rv2-btn on-dark"
                            aria-label="Accept this revision"
                        >
                            Accept revision
                        </Link>
                        <Link
                            href={`${base}/brief-lock`}
                            className="rv2-btn primary"
                            aria-label="Promote this revision to active"
                        >
                            {hasLockedCurrent ? "Promote to active" : "Lock revision"}
                        </Link>
                    </div>
                </div>

                {/* Rev line — parent → current chain, visual at-a-glance. */}
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
                </div>

                {/* Metric-row — four KPIs embedded in the dark banner.
                    Values are honest "—" until the revision-diff engine
                    lands. When parent === null there's nothing to diff
                    against, so the sub-copy tells the reader that directly
                    rather than suggesting the engine is broken. */}
                <div className="rv2-hero-metrics" role="group" aria-label="Revision metrics">
                    <HeroMetric
                        label="Parts changed"
                        value="—"
                        sub={parent ? "diff engine not yet wired" : "no prior revision to diff"}
                    />
                    <HeroMetric
                        label="Mass delta"
                        value="—"
                        sub={parent ? "mass roll-up pending" : "no prior revision to diff"}
                    />
                    <HeroMetric
                        label="Cost delta"
                        value="—"
                        sub={parent ? "cost roll-up pending" : "no prior revision to diff"}
                    />
                    <HeroMetric
                        label="Outstanding issues"
                        value="—"
                        sub="risk tracker wires next"
                    />
                </div>
            </div>

            {/* ── Inherited from parent — summary block ──
                 Mirrors the "Inherited from v1.0 · unchanged" card in the
                 mockup. Lists what carries forward without fabricating
                 module counts we don't track yet. */}
            <div className="rv2-diff-section">
                <h3>
                    {parent
                        ? `Inherited from v${parent.revisionNumber} · unchanged`
                        : "Inherited from parent · origin revision"
                    }
                    <span className="count">
                        {parent
                            ? `v${parent.revisionNumber} → v${current.revisionNumber}`
                            : "no parent yet"
                        }
                    </span>
                </h3>
                <ul className="rv2-inherited-list">
                    <li><strong>BOM</strong> carries across from the parent revision. Parts, quantities and supplier bindings stay stable until an explicit change lands on this revision.</li>
                    <li><strong>Supplier shortlist</strong> carries across. Suppliers already quoting the parent continue quoting — no RFQ re-runs on inherited parts.</li>
                    <li><strong>Compliance packet</strong> (cert list, test reports, DOA evidence) carries across unless a diff invalidates a cert.</li>
                    <li><strong>Modules and geometry spine</strong> carry across. Only changed modules re-run the specialist pipeline.</li>
                </ul>
                <p className="muted" style={{ marginTop: "12px" }}>
                    Part-level diff visibility lands once the revision-diff engine is wired —
                    until then, the subsystem cards below show what each module currently
                    declares. The "Revision history" section further down is the canonical
                    list of locked snapshots on this project.
                </p>
            </div>

            {/* ── Change list by subsystem ──────────────
                 One card per module in the current revision. Mockup shows
                 add/modify/remove rows with per-part mass + cost deltas —
                 that level of detail requires the diff engine. Until then,
                 each card surfaces the module's current-state parts so
                 founders can see what will participate in future diffs. */}
            <div className="rv2-change-list">
                <div className="rv2-change-list__head">
                    <div>
                        <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700 }}>
                            Change list by subsystem
                        </h3>
                        <div className="rv2-change-list__sub">
                            {changeListModules.length > 0
                                ? `${changeListModules.length} module${changeListModules.length === 1 ? "" : "s"} · diff engine not yet wired`
                                : "No modules declared · decomposition hasn't run yet"
                            }
                        </div>
                    </div>
                </div>

                {changeListModules.length === 0 ? (
                    <div className="rv2-change-empty">
                        <p>
                            Once Max runs decomposition on this project, each module will
                            appear here as its own subsystem card. When the revision-diff
                            engine ships, the cards show added / modified / removed parts
                            with mass and cost deltas per row. Today the cards are a
                            current-state preview of what will be compared.
                        </p>
                        <Link href={`${base}/modules`} className="rv2-btn">
                            Open modules →
                        </Link>
                    </div>
                ) : (
                    <div className="rv2-change-groups">
                        {changeListModules.map((m) => (
                            <div key={m.id} className="rv2-change-group">
                                <div className="rv2-change-group__head">
                                    <div className="rv2-change-group__title">
                                        <span className="rv2-change-group__code">{m.code}</span>
                                        <span className="rv2-change-group__name">{m.name}</span>
                                    </div>
                                    <div className="rv2-change-group__meta">
                                        {m.estimatedMassKg != null ? (
                                            <span>est. {m.estimatedMassKg.toFixed(2)} kg</span>
                                        ) : (
                                            <span className="muted">mass pending</span>
                                        )}
                                    </div>
                                </div>
                                {m.purpose && (
                                    <div className="rv2-change-group__purpose">{m.purpose}</div>
                                )}
                                {m.keyParts.length > 0 ? (
                                    <>
                                        <div className="rv2-change-group__parts-head">
                                            Current parts · {m.keyParts.length}
                                        </div>
                                        <ul className="rv2-change-group__parts">
                                            {m.keyParts.map((p, i) => (
                                                <li key={`${m.id}-part-${i}`} className="rv2-change-row">
                                                    <div className="rv2-change-row__mark" aria-hidden="true">·</div>
                                                    <div className="rv2-change-row__body">
                                                        <div className="name">{p}</div>
                                                    </div>
                                                    <div className="rv2-change-row__delta muted">—</div>
                                                    <div className="rv2-change-row__delta muted">—</div>
                                                </li>
                                            ))}
                                        </ul>
                                        <div className="rv2-change-group__note">
                                            No per-part diffs yet — add/modify/remove rows with
                                            mass and cost deltas land when the revision-diff
                                            engine ships.
                                        </div>
                                    </>
                                ) : (
                                    <div className="rv2-change-group__note">
                                        No parts declared on this module yet. Open the module
                                        to add parts — they'll appear here once saved.
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
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

// ─── Subcomponents ─────────────────────────────────────────────────────

/**
 * HeroMetric — a single stat tile inside the dark hero banner.
 *
 * INTENT: Mockup shows four metric tiles on a dark background. The real diff
 * engine doesn't yet emit these numbers, so every invocation currently passes
 * `value="—"`. The component stays generic so it'll render real numbers
 * (+2.4 kg, +£11.4k, etc.) unchanged once the engine lands.
 */
function HeroMetric({
    label,
    value,
    sub,
}: {
    label: string
    value: string
    sub: string
}): React.ReactElement {
    return (
        <div className="rv2-hero-metric">
            <div className="rv2-hero-metric__label">{label}</div>
            <div className="rv2-hero-metric__value">{value}</div>
            <div className="rv2-hero-metric__sub">{sub}</div>
        </div>
    )
}
