/**
 * RisksView — Risks artefact page (V2, mockup-faithful).
 *
 * Port of FORGE-MOCKUP-RISKS.html (populated) + FORGE-MOCKUP-EMPTY-RISKS.html.
 * Scoped CSS under `.rk2` keeps the styling isolated.
 *
 * Data contract: there is no `risks` table yet. Every row in the list is
 * sourced from the modules JSONB — specifically `module.failureModes[]`
 * (rendered as "known failure modes", medium severity) and
 * `module.unknowns[]` (rendered as "open questions", low severity).
 *
 * When both arrays are empty across every module, the view falls back to
 * the empty-state hero from FORGE-MOCKUP-EMPTY-RISKS.html.
 *
 * Sections (top to bottom):
 *   1. Breadcrumb
 *   2. Page header — risk icon + title + counts chip + CTAs
 *   3. Annotation note
 *   4. Summary strip — 4 stat tiles (blocking / medium / low / resolved)
 *   5. Controls bar — search + filter chips (stubbed)
 *   6a. Populated: risk list grouped by severity with meta grid
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
                    <span className="rk2-btn soon" title="Raising dedicated risks ships with the risks table">
                        + Raise risk
                    </span>
                    <span className="rk2-btn soon" title="Export for board ships with the risks table">
                        Export for board
                    </span>
                    <Link href={`${base}/modules`} className="rk2-btn primary">
                        Open modules
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
                    <div className="sub">No severity tracking yet · 0 auto-derived</div>
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
                    <div className="label">Resolved</div>
                    <div className={`value ${counts.resolved > 0 ? "green" : ""}`}>{counts.resolved}</div>
                    <div className="sub">Status tracking ships with the risks table</div>
                </div>
            </div>

            {/* ── Controls ────────────────────────────── */}
            <div className="rk2-controls">
                <div className="search">
                    <input type="search" placeholder="Search risks, modules, owners…" disabled />
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
                            That&apos;s normal for a project this early. Risks will appear as you build — your
                            team will raise them, modules will surface failure modes, and single-source
                            suppliers will flag themselves.
                        </p>
                        <div className="cta-group">
                            <Link href={`${base}/modules`} className="rk2-btn primary">
                                Open modules
                            </Link>
                            <span className="rk2-btn soon" title="Raising dedicated risks ships with the risks table">
                                + Raise risk
                            </span>
                        </div>
                        <div className="note">
                            Auto-surface pulls failure modes + unknowns from each module once decomposition is
                            complete. Raising bespoke risks ships with the dedicated risks table.
                        </div>
                    </div>

                    <div className="rk2-library">
                        <h3>Risk library — browse by category</h3>
                        <div className="sub">
                            Common hardware risk categories. Library authoring ships with the risks table;
                            categories shown for reference.
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

function RiskItem({ row, moduleHref }: { row: RiskRow; moduleHref: string }): React.ReactElement {
    const sevClass =
        row.severity === "high" ? "sev-high" : row.severity === "med" ? "sev-med" : "sev-low"
    const pillClass =
        row.severity === "high" ? "high" : row.severity === "med" ? "med" : "low"
    const pillLabel =
        row.severity === "high" ? "Blocking" : row.severity === "med" ? "Medium" : "Low · info"

    return (
        <div className={`rk2-item ${sevClass}`}>
            <div className="rk2-item-header">
                <div className="rk2-item-title">
                    <div className="kicker">
                        <span className={`rk2-sev-pill ${pillClass}`}>{pillLabel}</span>
                        <span className="cat">{row.category}</span>
                        <span className="source-badge">{row.sourceBadge}</span>
                    </div>
                    <h3>{row.title}</h3>
                </div>
                <Link href={moduleHref} className="rk2-btn sm" style={{ flexShrink: 0 }}>
                    Open module
                </Link>
            </div>

            <div className="rk2-meta-grid">
                <div className="m">
                    <div className="k">Owner</div>
                    <div className="v muted">—</div>
                </div>
                <div className="m">
                    <div className="k">Affects</div>
                    <div className="v">
                        <Link href={moduleHref} style={{ color: "var(--rk-brand)", textDecoration: "none", fontWeight: 600 }}>
                            {row.moduleName}
                        </Link>
                    </div>
                </div>
                <div className="m">
                    <div className="k">Due date</div>
                    <div className="v muted tnum">—</div>
                </div>
                <div className="m">
                    <div className="k">Status</div>
                    <div className="v">
                        <span className="rk2-sev-pill low" style={{ textTransform: "uppercase" }}>Noted</span>
                    </div>
                </div>
            </div>

            <div className="rk2-item-actions">
                <Link href={moduleHref} className="rk2-btn sm">
                    View in module
                </Link>
                <span className="rk2-btn sm soon" title="Mitigation authoring ships with the risks table">
                    Add mitigation
                </span>
                <span className="rk2-btn sm soon" title="Assignment ships with the risks table">
                    Assign owner
                </span>
            </div>

            <div className="rk2-grounding-strip">
                <span className="dot" aria-hidden="true" />
                Sourced from module decomposition · deep-link opens the module&apos;s failure-mode section
            </div>
        </div>
    )
}
