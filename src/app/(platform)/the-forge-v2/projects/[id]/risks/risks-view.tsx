/**
 * RisksView — Risks artefact page (V2, mockup-faithful).
 *
 * Port of FORGE-MOCKUP-RISKS.html (populated) + FORGE-MOCKUP-EMPTY-RISKS.html.
 * Scoped CSS under `.rk2` keeps the styling isolated.
 *
 * Data contract: there is no `risks` table yet. Every row in the list is
 * sourced from the modules JSONB — specifically `module.failureModes[]`
 * (rendered as "known failure modes", medium severity) and
 * `module.unknowns[]` (rendered as "open questions", low severity). Fields
 * the mockup shows but we don't yet store (owner, pivot-by date, impact
 * chip, body prose, grounding provenance) render honest "Not yet declared"
 * placeholders — never mockup-specific example text.
 *
 * When both arrays are empty across every module, the view falls back to
 * the empty-state hero from FORGE-MOCKUP-EMPTY-RISKS.html.
 *
 * Sections (top to bottom):
 *   1. Breadcrumb
 *   2. Page header — risk icon + title + counts chip + CTAs (Export / Filter / Raise)
 *   3. Annotation note
 *   4. Summary strip — 4 stat tiles (Blocking / Medium / Low · info / Resolved this week)
 *   5. Controls bar — search + filter chips (stubbed)
 *   6a. Populated: risk card stack grouped by severity
 *       Each card: severity banner + kicker + headline + impact chip + body
 *       paragraph + 4-field meta-grid + actions row + grounding strip.
 *   6b. Empty:     empty-state hero + risk library card
 *   7. Specialist recommendations card (empty-state for now)
 *   8. Design grounded in — teal pills + footnote
 */

"use client"

import Link from "next/link"
import "./risks-v2.css"

// ─── Types ──────────────────────────────────────────────────────────────

export type RiskSeverity = "high" | "med" | "low"

export interface RiskRow {
    /** Stable key for React. */
    id: string
    /** Severity band — drives pill + border + summary tile. */
    severity: RiskSeverity
    /** Short category line, e.g. "Known failure mode · Module" or "Open question · Module". */
    category: string
    /** One-line source/provenance tag (e.g. "From module decomposition"). */
    sourceBadge: string
    /** Risk headline — the raw failure-mode / unknown text from the module. */
    title: string
    /** Owning module id (deep-link target). */
    moduleId: string
    /** Owning module display name. */
    moduleName: string
    /** Optional longer-form body paragraph. Null when not yet captured. */
    body?: string | null
    /** Optional right-aligned impact chip copy (e.g. "Costs £860 if unresolved").
     *  Null when impact hasn't been scored yet. */
    impact?: string | null
    /** Optional named owner. Null until risks table ships. */
    owner?: string | null
    /** Optional pivot-by date copy. Null until risks table ships. */
    pivotByDate?: string | null
    /** Optional grounding/provenance copy for the teal strip. */
    groundingNote?: string | null
}

export interface RisksViewProps {
    project: {
        id: string
        name: string
    }
    counts: {
        blocking: number
        medium: number
        low: number
        resolved: number
        total: number
    }
    /** Flat list of risk rows, already ordered by severity (high → med → low). */
    risks: RiskRow[]
    /** How many engineering-library rows back the Design Grounded In pills. */
    grounding: {
        failureModeLibrary: number
        hardware: number
        materials: number
    }
}

// ─── View ───────────────────────────────────────────────────────────────

export function RisksView(props: RisksViewProps): React.ReactElement {
    const { project, counts, risks, grounding } = props

    const base = `/the-forge-v2/projects/${project.id}`
    const isEmpty = counts.total === 0

    // Group risks by severity for the populated state so the list renders
    // high-to-low with a small section header between each group.
    const groups: Array<{ key: RiskSeverity; label: string; rows: RiskRow[] }> = [
        { key: "high", label: "Blocking", rows: risks.filter((r) => r.severity === "high") },
        { key: "med", label: "Medium", rows: risks.filter((r) => r.severity === "med") },
        { key: "low", label: "Low / info", rows: risks.filter((r) => r.severity === "low") },
    ]

    const openChip = counts.total === 0
        ? "0 open"
        : counts.blocking > 0
            ? `${counts.total} open · ${counts.blocking} blocking`
            : `${counts.total} open`

    return (
        <div className="rk2">
            {/* ── Breadcrumb ──────────────────────────── */}
            <div className="rk2-breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <Link href={base}>{project.name}</Link>
                <span className="sep">›</span>
                <span className="current">Risks</span>
            </div>

            {/* ── Page header ─────────────────────────── */}
            <div className="rk2-page-header">
                <div>
                    <h1>
                        <span className="rk2-title-dot" aria-hidden="true" />
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
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        Risks · {project.name}
                        <span
                            className={`rk2-chip ${counts.blocking > 0 ? "danger" : "neutral"} solid`}
                            style={{ marginLeft: 6 }}
                        >
                            {openChip}
                        </span>
                    </h1>
                    <div className="sub">
                        Risks that could bite. Raised by your team, auto-surfaced from module failure modes,
                        or seeded from the library.
                    </div>
                </div>
                <div className="cta-group">
                    <span className="rk2-btn soon" title="Export for board ships with the risks table">
                        Export for board
                    </span>
                    <span className="rk2-btn soon" title="Risk filtering ships with the risks table">
                        Filter: Open
                    </span>
                    <Link href={`${base}/risks/new`} className="rk2-btn primary">
                        + Raise risk
                    </Link>
                </div>
            </div>

            <div className="rk2-annot">
                <strong>Note</strong>
                Until a dedicated risks store ships, this view surfaces known failure modes and open
                questions declared during module decomposition. Each row deep-links to its module so you
                can add mitigation context there.
            </div>

            {/* ── Summary strip ───────────────────────── */}
            <div className="rk2-summary">
                <div className="rk2-sum-card sev-high">
                    <div className="label">Blocking</div>
                    <div className={`value ${counts.blocking > 0 ? "red" : ""}`}>{counts.blocking}</div>
                    <div className="sub">Severity tracking ships with risks table</div>
                </div>
                <div className="rk2-sum-card sev-med">
                    <div className="label">Medium</div>
                    <div className={`value ${counts.medium > 0 ? "amber" : ""}`}>{counts.medium}</div>
                    <div className="sub">Known failure modes from modules</div>
                </div>
                <div className="rk2-sum-card sev-low">
                    <div className="label">Low / info</div>
                    <div className={`value ${counts.low > 0 ? "info" : ""}`}>{counts.low}</div>
                    <div className="sub">Open questions from modules</div>
                </div>
                <div className="rk2-sum-card sev-resolved">
                    <div className="label">Resolved this week</div>
                    <div className={`value ${counts.resolved > 0 ? "green" : ""}`}>{counts.resolved}</div>
                    <div className="sub">Closure log ships with risks table</div>
                </div>
            </div>

            {/* ── Controls ────────────────────────────── */}
            <div className="rk2-controls">
                <div className="search">
                    <input type="search" placeholder="Search risks and modules…" disabled />
                </div>
                <div className="sep" />
                <div className="group">
                    <span className="rk2-btn soon">Filter: Open</span>
                    <span className="rk2-btn soon">Group: Severity</span>
                    <span className="rk2-btn soon">Columns: All</span>
                </div>
                <div className="spacer">
                    <Link href={`${base}/specialists/vp-manufacturing`} className="rk2-btn">
                        Ask Fang about these risks
                    </Link>
                </div>
            </div>

            {/* ── Body: populated vs empty ────────────── */}
            {isEmpty ? (
                <>
                    <div className="rk2-empty-hero">
                        <div className="ic" aria-hidden="true">✓</div>
                        <h2>No risks raised yet.</h2>
                        <p>
                            That&apos;s normal for a project this new. Risks will appear as you build — your
                            team will raise them, modules will surface failure modes, and single-source
                            suppliers will flag themselves. You can also raise one now.
                        </p>
                        <div className="cta-group">
                            <Link href={`${base}/risks/new`} className="rk2-btn primary">
                                Raise your first risk →
                            </Link>
                            <span
                                className="rk2-btn soon"
                                title="Auto-surface populates after Brief-lock when modules are scaffolded"
                            >
                                Auto-surface from module Failure Modes — populates after Brief-lock
                            </span>
                        </div>
                        <div className="note">
                            Auto-surface pulls the top failure modes from each module&apos;s FMEA once the
                            Brief is locked and modules are scaffolded.
                        </div>
                    </div>

                    <div className="rk2-library">
                        <h3>Risk library — browse by category</h3>
                        <div className="sub">
                            Common hardware risk categories from other projects in your foundry. Library
                            authoring ships with the risks table; categories shown for reference.
                        </div>
                        <div className="pill-grid">
                            <span className="cat-pill"><span className="dot supply" aria-hidden="true" />Supply chain</span>
                            <span className="cat-pill"><span className="dot cert" aria-hidden="true" />Certification &amp; compliance</span>
                            <span className="cat-pill"><span className="dot tech" aria-hidden="true" />Technical &amp; engineering</span>
                            <span className="cat-pill"><span className="dot ops" aria-hidden="true" />Operations &amp; logistics</span>
                            <span className="cat-pill"><span className="dot market" aria-hidden="true" />Market &amp; customer</span>
                            <span className="cat-pill"><span className="dot cost" aria-hidden="true" />Cost &amp; cash</span>
                            <span className="cat-pill"><span className="dot cert" aria-hidden="true" />Single-source supplier</span>
                            <span className="cat-pill"><span className="dot supply" aria-hidden="true" />Long-lead material</span>
                            <span className="cat-pill"><span className="dot tech" aria-hidden="true" />First-article inspection</span>
                            <span className="cat-pill"><span className="dot ops" aria-hidden="true" />Customs &amp; duties</span>
                            <span className="cat-pill"><span className="dot cert" aria-hidden="true" />Cert expiry</span>
                            <span className="cat-pill"><span className="dot market" aria-hidden="true" />Pilot customer churn</span>
                        </div>
                    </div>
                </>
            ) : (
                <>
                    {/* ── How ownership & due dates work ──────── */}
                    <div className="rk2-how">
                        <div className="rk2-how__head">How ownership and due dates work</div>
                        <ul className="rk2-how__list">
                            <li>Owners and due dates land with the risk-tracking rewrite — today, risks surface as they&apos;re decomposed from your modules.</li>
                            <li>Every row below came from a module&apos;s known failure modes or open questions. Open the module to add mitigation context.</li>
                            <li>Once the dedicated risks table ships, you&apos;ll assign a named owner, set a pivot-by date, and close the loop with a status clock.</li>
                        </ul>
                        <div className="rk2-how__foot">
                            Questions → <Link href={`${base}/specialists/vp-manufacturing`}>ask Fang</Link> — he&apos;ll walk you through the current decomposition.
                        </div>
                    </div>

                    <div className="rk2-list">
                    {groups.map((g) => {
                        if (g.rows.length === 0) return null
                        return (
                            <section key={g.key}>
                                <div className="rk2-group-header">
                                    <span>{g.label}</span>
                                    <span className="count">{g.rows.length}</span>
                                </div>
                                <div className="rk2-list" style={{ marginTop: 4 }}>
                                    {g.rows.map((r) => (
                                        <RiskItem
                                            key={r.id}
                                            row={r}
                                            moduleHref={`${base}/modules/${r.moduleId}`}
                                        />
                                    ))}
                                </div>
                            </section>
                        )
                    })}
                    </div>
                </>
            )}

            {/* ── Specialist recommendations (always present) ── */}
            <div className="rk2-specialist" style={{ marginTop: 22 }}>
                <h3>
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                    >
                        <circle cx="12" cy="8" r="4" />
                        <path d="M5 22v-3a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v3" />
                    </svg>
                    Specialist recommendations
                </h3>
                <p>
                    Specialists add mitigation plans once module review runs. Ask Jian, Fang or Chase in
                    the Specialists panel to turn these failure modes and open questions into owned
                    mitigations with clear next actions.
                </p>
                <div className="actions">
                    <Link href={`${base}/specialists/vp-engineering`} className="rk2-btn sm">
                        Ask Jian (VP Engineering)
                    </Link>
                    <Link href={`${base}/specialists/vp-manufacturing`} className="rk2-btn sm">
                        Ask Fang (VP Manufacturing)
                    </Link>
                    <Link href={`${base}/specialists/vp-supply-chain`} className="rk2-btn sm">
                        Ask Chase (VP Supply)
                    </Link>
                </div>
            </div>

            {/* ── Design grounded in ──────────────────── */}
            <div className="rk2-grounded">
                <div className="head">
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                    >
                        <path d="M12 2l9 4v5c0 5-3.5 10-9 11-5.5-1-9-6-9-11V6l9-4z" />
                    </svg>
                    <span>Design grounded in</span>
                </div>
                <div className="pills">
                    <Link href="/the-forge-v2/library/materials" className="pill">
                        <span className="diamond" aria-hidden="true" /> Material library ({grounding.materials} rows)
                    </Link>
                    <Link href="/the-forge-v2/library/hardware" className="pill">
                        <span className="diamond" aria-hidden="true" /> Standard hardware ({grounding.hardware} rows)
                    </Link>
                    <Link href={`${base}/modules`} className="pill">
                        <span className="diamond" aria-hidden="true" /> Failure modes from {grounding.failureModeLibrary} module{grounding.failureModeLibrary === 1 ? "" : "s"}
                    </Link>
                </div>
                <p className="footnote">
                    Risk signals are grounded in the project&apos;s own module decomposition plus the ForgeOS
                    engineering library. Once mitigation authoring ships, specialist sign-off will attach
                    directly to each row.
                </p>
            </div>
        </div>
    )
}

// ─── Risk item row ──────────────────────────────────────────────────────
// Ports FORGE-MOCKUP-RISKS.html's `.risk-item` card 1:1. Every mockup slot
// is rendered: severity banner + kicker + title + impact chip (right) +
// body paragraph + 4-field meta-grid (Owner / Affects / Pivot-by date /
// Grounding) + actions row + teal grounding strip. Fields we don't yet
// store (body, impact, owner, pivotByDate, groundingNote) fall back to an
// honest "Not yet declared" — never the mockup's Astra / Zimmermann /
// CFRP example text.

const NOT_DECLARED = "Not yet declared"

function RiskItem({ row, moduleHref }: { row: RiskRow; moduleHref: string }): React.ReactElement {
    const sevClass =
        row.severity === "high" ? "sev-high" : row.severity === "med" ? "sev-med" : "sev-low"
    const pillClass =
        row.severity === "high" ? "high" : row.severity === "med" ? "med" : "low"
    const pillLabel =
        row.severity === "high" ? "Blocking" : row.severity === "med" ? "Medium" : "Low · info"
    const chipClass =
        row.severity === "high" ? "danger" : row.severity === "med" ? "warning" : "info"

    return (
        <div className={`rk2-item ${sevClass}`}>
            {/* Header: kicker + title on the left, impact chip on the right */}
            <div className="rk2-item-header">
                <div className="rk2-item-title">
                    <div className="kicker">
                        <span className={`rk2-sev-pill ${pillClass}`}>{pillLabel}</span>
                        <span className="cat">{row.category}</span>
                        <span className="source-badge">{row.sourceBadge}</span>
                    </div>
                    <h3>{row.title}</h3>
                </div>
                {row.impact ? (
                    <span className={`rk2-chip ${chipClass} solid`} style={{ flexShrink: 0 }}>
                        {row.impact}
                    </span>
                ) : (
                    <span className="rk2-chip neutral" style={{ flexShrink: 0 }} title="Impact scoring ships with the risks table">
                        Impact not yet scored
                    </span>
                )}
            </div>

            {/* Body: risk description paragraph. Honest empty state when we
                only have the headline (which is the vast majority of rows
                today — they come from module failureModes[] / unknowns[]). */}
            <div className="rk2-item-body">
                {row.body ?? (
                    <span className="rk2-empty-inline">
                        Longer-form description ships with the risks table. Open the module to add
                        mitigation context and a clearer narrative for this risk.
                    </span>
                )}
            </div>

            {/* 4-field meta-grid — matches the mockup's Owner / Affects /
                Pivot-by date / Grounding row. Every slot renders honestly:
                real data when present, "Not yet declared" when absent. */}
            <div className="rk2-meta-grid">
                <div className="m">
                    <div className="k">Owner</div>
                    <div className={`v ${row.owner ? "" : "muted"}`}>
                        {row.owner ?? NOT_DECLARED}
                    </div>
                </div>
                <div className="m">
                    <div className="k">Affects</div>
                    <div className="v">
                        <Link
                            href={moduleHref}
                            style={{ color: "var(--rk-brand)", textDecoration: "none", fontWeight: 600 }}
                        >
                            {row.moduleName}
                        </Link>
                    </div>
                </div>
                <div className="m">
                    <div className="k">Pivot-by date</div>
                    <div className={`v tnum ${row.pivotByDate ? "" : "muted"}`}>
                        {row.pivotByDate ?? NOT_DECLARED}
                    </div>
                </div>
                <div className="m">
                    <div className="k">Grounding</div>
                    <div className={`v ${row.groundingNote ? "" : "muted"}`}>
                        {row.groundingNote ?? "Module decomposition"}
                    </div>
                </div>
            </div>

            {/* Actions row — matches the mockup's button cluster at the
                bottom of each card. Open-module is always available; the
                other two surface as "soon" until the risks table lands. */}
            <div className="rk2-item-actions">
                <Link href={moduleHref} className="rk2-btn primary sm">
                    Open module
                </Link>
                <span
                    className="rk2-btn sm soon"
                    title="Mitigation authoring ships with the risks table"
                >
                    Add mitigation
                </span>
                <span
                    className="rk2-btn ghost sm soon"
                    title="Accept-risk flow ships with the risks table"
                >
                    Accept risk + document
                </span>
            </div>

            {/* Grounding strip — teal dot + provenance hint, matches the
                mockup's `.grounding-strip` block at the foot of each card. */}
            <div className="rk2-grounding-strip">
                <span className="dot" aria-hidden="true" />
                Sourced from module decomposition · deep-link opens the module&apos;s failure-mode section
            </div>
        </div>
    )
}
