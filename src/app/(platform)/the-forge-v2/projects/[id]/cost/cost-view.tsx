/**
 * CostView — Cost artefact page (V2, mockup-faithful).
 *
 * Port of FORGE-MOCKUP-COST.html. Scoped CSS under `.c2` keeps styling
 * isolated so the mockup's palette/typography don't leak into the rest of
 * the platform.
 *
 * Sections (top to bottom):
 *   1. Breadcrumb
 *   2. Page header — Cost icon + title + ceiling-band chip + CTAs
 *   3. Annotation note — canonical-cost-page explainer
 *   4. Cost hero — big all-in number + ceiling bar + 4 sub-cards
 *      (Unit BOM / + OFE solar / + NRE amortised / = All-in)
 *   5. Annotation note — ceiling-bar explainer
 *   6. Cost waterfall — one row per module (real estimate data), grouped
 *      by broad category heuristic with horizontal bars + source tag
 *   7. Design grounded in — teal library pills + footnote
 *   8. Annotation note — "every line has a source"
 *   9. Estimate vs quote vs benchmark — honest empty state until RFQs
 *      populate real supplier response data
 *
 * Every number traces to a real source (aiCostEstimates, brief constraints,
 * library counts) or renders "—" / an honest empty state. No synthetic
 * mockup rows (Wing Rib £85 · CMS, T-Motor, etc.) leak into production.
 */

"use client"

import Link from "next/link"

import "./cost-v2.css"

// ─── Types ──────────────────────────────────────────────────────────────

export type CostCategory =
    | "structure"
    | "electrical"
    | "prop"
    | "labour"
    | "inspect"
    | "logistics"
    | "solar"
    | "nre"
    | "neutral"

export interface CostWaterfallRow {
    /** Stable React key. */
    id: string
    /** Display name — module name. */
    name: string
    /** Broad category for the coloured bar + caption. */
    category: CostCategory
    /** Display label for the category (e.g. "Structure", "Electrical"). */
    categoryLabel: string
    /** GBP value per unit. */
    valueGbp: number
    /** Source tag (e.g. "AI estimate · medium confidence"). */
    source: string
    /** Deep-link target (usually the module page). */
    href: string | null
}

export interface CostSubcard {
    label: string
    /** Null renders "—" with a muted tone. */
    valueGbp: number | null
    /** One-line subtitle under the number. */
    sub: string
    /** `danger` for the All-in card when over ceiling, `success` when under. */
    tone?: "neutral" | "danger" | "success"
}

export interface GroundingCounts {
    materials: number
    hardware: number
    processes: number
}

export interface CostViewProps {
    project: {
        id: string
        name: string
        designRevision: number
    }
    /** All-in unit cost in GBP — sum of Unit BOM + OFE + NRE (nulls as 0). Null when no estimates. */
    allInGbp: number | null
    /** Unit BOM roll-up (sum of module totalPerUnit). Null when no estimates. */
    unitBomGbp: number | null
    /** Owner-furnished solar in GBP — null until declared on the brief. */
    ofeGbp: number | null
    /** NRE amortised per unit — null until declared on the brief. */
    nreGbp: number | null
    /** Unit cost ceiling declared on the Brief — null when not set. */
    ceilingGbp: number | null
    /** Rows rendered in the waterfall — one per module. */
    rows: CostWaterfallRow[]
    /** Engineering-library row counts for the grounding pills. */
    grounding: GroundingCounts
}

// ─── Helpers ────────────────────────────────────────────────────────────

function formatGbp(value: number | null): string {
    if (value == null) return "—"
    if (Math.abs(value) >= 1_000_000) return `£${(value / 1_000_000).toFixed(2)}M`
    if (Math.abs(value) >= 10_000) return `£${Math.round(value / 1000).toLocaleString()}k`
    if (Math.abs(value) >= 1000) return `£${(value / 1000).toFixed(1)}k`
    return `£${Math.round(value).toLocaleString()}`
}

function formatGbpExact(value: number | null): string {
    if (value == null) return "—"
    return `£${Math.round(value).toLocaleString()}`
}

function formatGbpDelta(value: number): string {
    const abs = Math.abs(value)
    if (abs >= 1000) return `£${(abs / 1000).toFixed(1)}k`
    return `£${Math.round(abs).toLocaleString()}`
}

// ─── View ───────────────────────────────────────────────────────────────

export function CostView(props: CostViewProps): React.ReactElement {
    const {
        project,
        allInGbp,
        unitBomGbp,
        ofeGbp,
        nreGbp,
        ceilingGbp,
        rows,
        grounding,
    } = props

    const base = `/the-forge-v2/projects/${project.id}`

    // ── Empty state ──────────────────────────────────────────────
    // Fires when the project has no AI cost estimates yet (and therefore
    // no modules with a known cost roll-up). Keeps the page honest:
    // £0 headline, "not set" ceiling, four-source explainer, placeholder
    // waterfall. Mirrors FORGE-MOCKUP-EMPTY-COST.html 1:1.
    const isEmpty = rows.length === 0 && unitBomGbp == null
    if (isEmpty) {
        return (
            <div className="c2">
                {/* ── Breadcrumb ──────────────────────────── */}
                <div className="c2-breadcrumb">
                    <Link href="/the-forge-v2">Forge</Link>
                    <span className="sep">›</span>
                    <Link href={base}>{project.name}</Link>
                    <span className="sep">›</span>
                    <span className="current">Cost</span>
                </div>

                {/* ── Page header ─────────────────────────── */}
                <div className="c2-page-header">
                    <div>
                        <h1>
                            <span className="c2-title-dot" aria-hidden="true" />
                            Unit cost
                            <span className="c2-chip neutral solid" style={{ marginLeft: 6 }}>
                                Envelope not set
                            </span>
                        </h1>
                    </div>
                </div>
                <div className="c2-empty-sub">
                    Live unit cost: BOM + NRE + overhead, traced to every contributing line.
                </div>

                {/* ── Hero strip ──────────────────────────── */}
                <div className="c2-empty-hero">
                    <div className="metric">
                        <div className="k">Cost per unit</div>
                        <div className="v">£0</div>
                        <div className="detail">All sources empty</div>
                    </div>
                    <div className="metric ceiling">
                        <div className="k">Target ceiling</div>
                        <div className="v">—</div>
                        <div className="detail">Pulled from your Brief once set</div>
                    </div>
                    <div className="metric">
                        <div className="k">Headroom</div>
                        <div className="v">n/a</div>
                        <div className="detail">Ceiling − unit cost</div>
                    </div>
                    <Link href={`${base}/brief`} className="set-cta">
                        Set your cost envelope →
                    </Link>
                </div>

                {/* ── Explainer — four sources ────────────── */}
                <div className="c2-empty-explainer">
                    <div className="c2-empty-explainer-title">
                        <strong>Your cost artefact pulls from four sources.</strong>{" "}
                        Today all of them are empty — once any has data, it appears in the waterfall below.
                    </div>

                    <div className="c2-empty-source">
                        <span className="sk">
                            BOM <span className="status-dot" />
                        </span>
                        <strong>Live material &amp; part cost.</strong> Every line in the BOM contributes directly.
                        <div className="empty-note">
                            No BOM lines yet ·{" "}
                            <Link href={`${base}/bom`}>add one →</Link>
                        </div>
                    </div>

                    <div className="c2-empty-source">
                        <span className="sk">
                            Suppliers <span className="status-dot" />
                        </span>
                        <strong>Quoted unit prices.</strong> Replaces list prices once supplier quotes come in.
                        <div className="empty-note">No suppliers shortlisted yet</div>
                    </div>

                    <div className="c2-empty-source">
                        <span className="sk">
                            NRE <span className="status-dot" />
                        </span>
                        <strong>Non-recurring engineering.</strong> Tooling, first-article inspection, cert fees — amortised over the batch.
                        <div className="empty-note">No NRE entries</div>
                    </div>

                    <div className="c2-empty-source">
                        <span className="sk">
                            Cash Burn <span className="status-dot" />
                        </span>
                        <strong>Allocated overhead.</strong> Share of monthly burn attributed to this project.
                        <div className="empty-note">Cash Burn not connected · soon</div>
                    </div>
                </div>

                {/* ── Empty waterfall ─────────────────────── */}
                <div className="c2-empty-waterfall">
                    <div className="head">
                        <h3>Cost waterfall — unit build-up</h3>
                        <span className="sub">BOM → Suppliers → NRE → Overhead → Unit cost</span>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th>Bucket</th>
                                <th>Source</th>
                                <th>Lines</th>
                                <th className="num" style={{ textAlign: "right" }}>Per unit</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="placeholder">Direct material</td>
                                <td className="placeholder">BOM (live)</td>
                                <td className="placeholder">—</td>
                                <td className="num">£0.00</td>
                            </tr>
                            <tr>
                                <td className="placeholder">Direct labour</td>
                                <td className="placeholder">Assembly plan</td>
                                <td className="placeholder">—</td>
                                <td className="num">£0.00</td>
                            </tr>
                            <tr>
                                <td className="placeholder">Tooling &amp; NRE (amortised)</td>
                                <td className="placeholder">Manual entry</td>
                                <td className="placeholder">—</td>
                                <td className="num">£0.00</td>
                            </tr>
                            <tr>
                                <td className="placeholder">Certification &amp; compliance</td>
                                <td className="placeholder">Launch artefact</td>
                                <td className="placeholder">—</td>
                                <td className="num">£0.00</td>
                            </tr>
                            <tr>
                                <td className="placeholder">Allocated overhead</td>
                                <td className="placeholder">Cash Burn · soon</td>
                                <td className="placeholder">—</td>
                                <td className="num">£0.00</td>
                            </tr>
                            <tr className="total">
                                <td>Unit cost</td>
                                <td />
                                <td />
                                <td className="num">£0.00</td>
                            </tr>
                        </tbody>
                    </table>

                    <div className="overlay">
                        <p>
                            Rows will populate and numbers will roll up as each source gets its first entry.{" "}
                            <Link href={`${base}/bom`}>Start with BOM →</Link>
                        </p>
                    </div>
                </div>
            </div>
        )
    }

    // ── Ceiling comparison ───────────────────────────────────────
    const hasAllIn = allInGbp != null
    const hasCeiling = ceilingGbp != null
    const overAmount =
        hasAllIn && hasCeiling && allInGbp > ceilingGbp ? allInGbp - ceilingGbp : null
    const underAmount =
        hasAllIn && hasCeiling && allInGbp <= ceilingGbp ? ceilingGbp - allInGbp : null
    const isOver = overAmount != null
    const isUnder = underAmount != null
    const ceilingPct =
        hasAllIn && hasCeiling && ceilingGbp > 0
            ? Math.round((allInGbp / ceilingGbp) * 100)
            : null

    // Chip copy mirrors mockup: "±20% band · £22k over ceiling".
    let chipTone: "warning" | "success" | "neutral" = "neutral"
    let chipLabel = "±20% band · no ceiling declared"
    if (isOver && overAmount != null) {
        chipTone = "warning"
        chipLabel = `±20% band · ${formatGbpDelta(overAmount)} over ceiling`
    } else if (isUnder && underAmount != null) {
        chipTone = "success"
        chipLabel = `±20% band · ${formatGbpDelta(underAmount)} under ceiling`
    } else if (!hasAllIn) {
        chipLabel = "±20% band · no estimates yet"
    }

    // Ceiling-bar width: at 100% show fill at 100%, at >100% stretch visually
    // (mockup pushes fill beyond 100% using width > 100%, capped at ~150% so
    // it doesn't overflow the track). When no ceiling declared → neutral.
    let ceilingFillPct = 0
    if (hasAllIn && hasCeiling && ceilingGbp > 0) {
        ceilingFillPct = Math.min(150, (allInGbp / ceilingGbp) * 100)
    }
    // Marker sits on the ceiling line within the visible track.
    const markerLeftPct = hasAllIn && hasCeiling && ceilingFillPct > 100 ? 100 / (ceilingFillPct / 100) : 100
    const markerClampedPct = Math.min(100, Math.max(0, markerLeftPct))

    // ── Subcards ─────────────────────────────────────────────────
    const unitBomCard: CostSubcard = {
        label: "Unit BOM",
        valueGbp: unitBomGbp,
        sub:
            unitBomGbp != null
                ? `module roll-up · ${rows.length} module${rows.length === 1 ? "" : "s"}`
                : "no module estimates yet",
    }
    const ofeCard: CostSubcard = {
        label: "+ OFE solar",
        valueGbp: ofeGbp,
        sub: ofeGbp != null ? "owner-furnished" : "Not declared on Brief",
    }
    const nreCard: CostSubcard = {
        label: "+ NRE amortised",
        valueGbp: nreGbp,
        sub: nreGbp != null ? "tooling amortised" : "Not declared on Brief",
    }
    const allInCard: CostSubcard = {
        label: "= All-in",
        valueGbp: allInGbp,
        sub:
            allInGbp == null
                ? "—"
                : isOver && overAmount != null
                    ? `${formatGbpDelta(overAmount)} over`
                    : isUnder && underAmount != null
                        ? `${formatGbpDelta(underAmount)} under`
                        : "no ceiling declared",
        tone: isOver ? "danger" : isUnder ? "success" : "neutral",
    }

    const needsBriefAugment = ofeGbp == null || nreGbp == null

    const totalForBarPct = rows.reduce((sum, r) => sum + r.valueGbp, 0)

    return (
        <div className="c2">
            {/* ── Breadcrumb ──────────────────────────── */}
            <div className="c2-breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <Link href={base}>{project.name}</Link>
                <span className="sep">›</span>
                <span className="current">Cost</span>
            </div>

            {/* ── Page header ─────────────────────────── */}
            <div className="c2-page-header">
                <div>
                    <h1>
                        <span className="c2-title-dot" aria-hidden="true" />
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M15 9.5a3 3 0 0 0-3-2.5c-1.66 0-3 1.34-3 3 0 .83.34 1.58.88 2.12m.12 2.88h5.5M8 17h7" />
                        </svg>
                        Cost · {project.name}
                        <span className={`c2-chip ${chipTone} solid`} style={{ marginLeft: 6 }}>
                            {chipLabel}
                        </span>
                    </h1>
                    <div className="sub">
                        Unit BOM · labour · inspection · solar (OFE) · NRE amortised. Every layer traced to source.
                    </div>
                </div>
                <div className="cta-group">
                    <span className="c2-btn soon" title="Ships once export bundles wire up">Export for board</span>
                    <span className="c2-btn soon" title="Variant forking ships once revision history lands">
                        Model v{revisionToVariantLabel(project.designRevision)} variant
                    </span>
                </div>
            </div>

            <div className="c2-annot">
                <strong>Note</strong>
                This is the canonical cost page. Every number cited on Today / Workspace / BOM / Brief
                reconciles here with an explicit source. Cost appears as three numbers throughout the product:
                Unit BOM ({formatGbp(unitBomGbp)}), All-in ({formatGbp(allInGbp)}),
                vs ceiling ({formatGbp(ceilingGbp)}). This page explains why.
            </div>

            {/* ── Cost hero ────────────────────────────── */}
            <div className="c2-hero">
                <div>
                    <div className="headline-label">All-in unit cost</div>
                    <div className={`big-num ${isOver ? "over" : ""}`}>
                        {formatGbpExact(allInGbp)}
                    </div>
                    {isOver && overAmount != null ? (
                        <div className="breach-note over">
                            {formatGbpDelta(overAmount)} over the Brief&apos;s {formatGbp(ceilingGbp)} ceiling — requires a decision or scope change
                        </div>
                    ) : isUnder && underAmount != null ? (
                        <div className="breach-note under">
                            {formatGbpDelta(underAmount)} under the Brief&apos;s {formatGbp(ceilingGbp)} ceiling — headroom for contingency
                        </div>
                    ) : !hasAllIn ? (
                        <div className="breach-note neutral">
                            No module cost estimates yet — open the CAD lab to run a first-pass cost review
                        </div>
                    ) : (
                        <div className="breach-note neutral">
                            No cost ceiling declared on the Brief
                        </div>
                    )}

                    <div className="c2-ceiling-bar">
                        <div className="bar">
                            <div
                                className={`fill ${hasCeiling ? "" : "neutral"}`}
                                style={{ width: hasCeiling && hasAllIn ? `${ceilingFillPct}%` : "0%" }}
                            />
                            {hasCeiling && hasAllIn && (
                                <div
                                    className="marker"
                                    style={{ left: `${markerClampedPct}%` }}
                                    aria-hidden="true"
                                />
                            )}
                        </div>
                        {hasCeiling ? (
                            <div className="label">
                                <span>£0</span>
                                <span>{formatGbp(ceilingGbp)} ceiling</span>
                                {hasAllIn && ceilingPct != null ? (
                                    <span className={isOver ? "over" : "under"}>
                                        {formatGbp(allInGbp)} current · {ceilingPct}%
                                    </span>
                                ) : (
                                    <span>{formatGbp(allInGbp)}</span>
                                )}
                            </div>
                        ) : (
                            <div className="caption">No cost ceiling declared on the Brief</div>
                        )}
                    </div>
                </div>

                <div className="c2-hero-subcards">
                    <div className="c2-subcard">
                        <div className="label">{unitBomCard.label}</div>
                        <div className={`num ${unitBomCard.valueGbp == null ? "empty" : ""}`}>
                            {formatGbpExact(unitBomCard.valueGbp)}
                        </div>
                        <div className="sub">{unitBomCard.sub}</div>
                    </div>
                    <div className="c2-subcard">
                        <div className="label">{ofeCard.label}</div>
                        <div className={`num ${ofeCard.valueGbp == null ? "empty" : ""}`}>
                            {formatGbpExact(ofeCard.valueGbp)}
                        </div>
                        <div className="sub">{ofeCard.sub}</div>
                    </div>
                    <div className="c2-subcard">
                        <div className="label">{nreCard.label}</div>
                        <div className={`num ${nreCard.valueGbp == null ? "empty" : ""}`}>
                            {formatGbpExact(nreCard.valueGbp)}
                        </div>
                        <div className="sub">{nreCard.sub}</div>
                    </div>
                    <div
                        className={`c2-subcard ${allInCard.tone === "danger" ? "danger" : allInCard.tone === "success" ? "success" : ""}`}
                    >
                        <div className="label">{allInCard.label}</div>
                        <div className={`num ${allInCard.valueGbp == null ? "empty" : ""}`}>
                            {formatGbpExact(allInCard.valueGbp)}
                        </div>
                        <div className="sub">{allInCard.sub}</div>
                    </div>
                    {needsBriefAugment && (
                        <div className="c2-hero-note">
                            Add OFE + NRE to the Brief to see the true all-in.
                        </div>
                    )}
                </div>
            </div>

            <div className="c2-annot">
                <strong>Note</strong>
                Ceiling-bar shows ±100% range so any overrun is visible in one glance. The four sub-cards show
                the cost stack as one mental model — unit BOM, plus owner-furnished items, plus non-recurring
                engineering amortised over the batch, equals the all-in number you defend to the board.
            </div>

            {/* ── Cost waterfall ──────────────────────── */}
            <div className="c2-waterfall">
                <h3>Cost waterfall · where the {formatGbp(unitBomGbp)} goes</h3>

                {rows.length === 0 ? (
                    <div className="c2-waterfall-empty">
                        No module cost estimates yet. Run a cost pass per module in the CAD lab to populate this waterfall.
                    </div>
                ) : (
                    <>
                        {rows.map((row) => {
                            const pct = totalForBarPct > 0 ? (row.valueGbp / totalForBarPct) * 100 : 0
                            const barWidth = Math.max(2, Math.min(100, pct))
                            return (
                                <div key={row.id} className="c2-wf-row">
                                    <div className="name">
                                        {row.href ? (
                                            <Link href={row.href} style={{ color: "inherit" }}>
                                                {row.name}
                                            </Link>
                                        ) : (
                                            row.name
                                        )}
                                        <div className="category">{row.categoryLabel}</div>
                                    </div>
                                    <div className="num">{formatGbpExact(row.valueGbp)}</div>
                                    <div className="bar">
                                        <div className={`fill ${row.category}`} style={{ width: `${barWidth}%` }} />
                                    </div>
                                    <div className="num">{pct.toFixed(1)}%</div>
                                    <div className="source">{row.source}</div>
                                </div>
                            )
                        })}
                        <div className="c2-wf-row total">
                            <div className="name">UNIT BOM ROLL-UP</div>
                            <div className="num">{formatGbpExact(unitBomGbp)}</div>
                            <div className="bar">
                                <div className="fill total" style={{ width: "100%" }} />
                            </div>
                            <div className="num">100%</div>
                            <div className="source">sum of module estimates</div>
                        </div>
                    </>
                )}
            </div>

            {/* ── Design grounded in ──────────────────── */}
            <div className="c2-grounded">
                <div className="head">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 2l9 4v5c0 5-3.5 10-9 11-5.5-1-9-6-9-11V6l9-4z" />
                    </svg>
                    <span>Design grounded in</span>
                </div>
                <div className="pills">
                    <Link href="/the-forge-v2/library/materials" className="pill">
                        <span className="diamond" aria-hidden="true" /> Material library ({grounding.materials} rows)
                    </Link>
                    <Link href="/the-forge-v2/library/processes" className="pill">
                        <span className="diamond" aria-hidden="true" /> Process capability limits ({grounding.processes} methods)
                    </Link>
                    <Link href="/the-forge-v2/library/hardware" className="pill">
                        <span className="diamond" aria-hidden="true" /> Standard hardware ({grounding.hardware} rows)
                    </Link>
                </div>
                <p className="footnote">
                    Specifications informed by verified engineering data — material properties, ISO hardware
                    dimensions, and process capability limits from the ForgeOS engineering library.
                </p>
            </div>

            <div className="c2-annot">
                <strong>Note</strong>
                Every cost line has a source. Module names link back to the module page so a founder questioning
                any number can trace it. No opaque &ldquo;overheads&rdquo; bucket.
            </div>

            {/* ── Estimate vs quote vs benchmark ──────── */}
            <div className="c2-quotes">
                <h3>Estimate vs received quote vs industry benchmark</h3>
                <div className="sub">
                    For each major BOM line, compare the specialist estimate, actual supplier quote (once received),
                    and RFQ-response benchmark from other ForgeOS foundries. Benchmarks only shown at N ≥ 5.
                </div>

                <div className="c2-quote-row header">
                    <div>Line item</div>
                    <div className="num">Estimate</div>
                    <div className="num">Received quote</div>
                    <div className="num">Benchmark median</div>
                    <div>Verdict</div>
                    <div />
                </div>

                <div className="c2-quote-empty">
                    <strong>No supplier quotes received yet.</strong>
                    <br />
                    Once RFQs go out and responses come back, the estimate-vs-quote-vs-benchmark grid shows up here.
                    <br />
                    <Link
                        href={`${base}/suppliers`}
                        style={{ color: "var(--c-brand)", fontWeight: 600, marginTop: 8, display: "inline-block" }}
                    >
                        Open Suppliers →
                    </Link>
                </div>
            </div>
        </div>
    )
}

// ─── Local helpers ──────────────────────────────────────────────────────

/** Maps integer design revision to a "v1.1 / v1.2 …" variant label. */
function revisionToVariantLabel(n: number): string {
    if (!Number.isFinite(n) || n < 1) return "1.1"
    return `1.${n}`
}
