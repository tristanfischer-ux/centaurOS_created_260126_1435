/**
 * OperationsView — Operations artefact page (V2, mockup-faithful).
 *
 * Port of FORGE-MOCKUP-OPERATIONS.html. Scoped CSS under `.op2` keeps the
 * mockup's palette / typography isolated from the rest of the platform.
 *
 * Sections (top to bottom, matching the mockup order):
 *   1. Breadcrumb
 *   2. Page header — title + sub + CTAs
 *   3. Annotation note — what Operations is
 *   4. Alert banner — "this week's movers" (honest empty when no signals)
 *   5. Production timeline — per-module lead-time skeleton band
 *   6. Station schedule — honest empty until supplier awards land
 *   7. Assembly milestones — FAI / inspection gates (empty until revision locked)
 *   8. Shipping plan — quantity + first-ship date from brief, or honest empty
 *   9. Takt + cycle time — honest em-dashes until real production data
 *  10. BOM watch — honest empty until part-level pricing feeds exist
 *  11. Supplier scorecards — honest empty until supplier order history exists
 *  12. Revisions & variants — current revision only, honest empty for forks
 *  13. Compliance calendar — honest empty until compliance rules engine ships
 *  14. Annotation footer note
 *
 * Every data slot that isn't backed by real DB state renders an honest empty
 * state — never a fabricated HAPS/Drone/T-Motor example from the mockup.
 */

"use client"

import Link from "next/link"
import "./operations-v2.css"

// ─── Types ──────────────────────────────────────────────────────────────

/**
 * Provenance tag for a lead-time estimate. Mirrors the enum on
 * `CadLabModule.leadTimeSource`. `null` means the module has not been
 * tagged yet — the view renders "source unknown" in that case.
 */
export type LeadTimeSource =
    | "supplier-quote"
    | "ai-estimate"
    | "historical-analogue"
    | "specialist-judgement"
    | null

export interface OperationsProductionRow {
    /** Stable key for React. */
    id: string
    /** Module display chip, "M1"…"M9". */
    moduleNum: string
    /** Module name — shown as the row title. */
    moduleName: string
    /** Lead-time in weeks, or null when not estimated. */
    leadWeeks: number | null
    /**
     * Provenance of the lead-time estimate. Rendered as a small chip next to
     * the week number so founders can see at a glance whether a number is
     * grounded in a supplier quote or a specialist's judgement call. Null
     * when the module predates the provenance field.
     */
    leadTimeSource: LeadTimeSource
    /** Band width fraction (0–1) for the skeleton Gantt row. 0 = no band. */
    bandFraction: number
}

export interface OperationsViewProps {
    project: {
        id: string
        name: string
        designRevision: number
    }
    brief: {
        /** Quantity target free-text from the brief, e.g. "50 units". Null when undeclared. */
        quantityTarget: string | null
        /** First-ship date ISO string from brief constraints. Null when undeclared. */
        firstShipDateIso: string | null
    }
    summary: {
        moduleCount: number
        longestLeadWeeks: number | null
        /** Provenance tag for whichever module owns the longest lead time. */
        longestLeadSource: LeadTimeSource
        /** Sum of module estimatedMassKg, null when no module has an estimate. */
        currentMassKg: number | null
        /** Sum of module budgetMassKg, null when no module has a budget. */
        budgetMassKg: number | null
    }
    /** Pre-computed rows for the production-timeline skeleton. */
    productionRows: OperationsProductionRow[]
}

// ─── Helpers ────────────────────────────────────────────────────────────

function designRevisionToLetter(n: number): string {
    if (!Number.isFinite(n) || n < 1) return "1"
    if (n > 26) return String(n)
    return String.fromCharCode(64 + n)
}

function formatMass(kg: number | null): string {
    if (kg == null) return "—"
    if (kg >= 100) return `${Math.round(kg)} kg`
    return `${kg.toFixed(1)} kg`
}

function formatShipDate(iso: string | null): string {
    if (!iso) return "—"
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

/**
 * Maps a lead-time provenance enum to the plain-English caption shown on
 * the provenance chip. `ai-estimate` is labelled "specialist estimate" on
 * purpose — the platform rule is to never surface "AI" as the source of a
 * number to founders. Null / unknown tags render "source unknown" so the
 * gap is visible rather than silently hidden.
 */
function leadSourceLabel(source: LeadTimeSource): string {
    switch (source) {
        case "supplier-quote":       return "from supplier quote"
        case "ai-estimate":          return "specialist estimate"
        case "historical-analogue":  return "historical analogue"
        case "specialist-judgement": return "specialist judgement"
        default:                     return "source unknown"
    }
}

/** Tone class for the chip — visual differentiation between grounded
 *  (supplier quote, historical) vs. judgement-based (specialist) vs. unknown. */
function leadSourceTone(source: LeadTimeSource): "quote" | "historical" | "judgement" | "unknown" {
    switch (source) {
        case "supplier-quote":       return "quote"
        case "historical-analogue":  return "historical"
        case "ai-estimate":
        case "specialist-judgement": return "judgement"
        default:                     return "unknown"
    }
}

// ─── Provenance chip ────────────────────────────────────────────────────

/**
 * Small rounded-pill chip that labels the provenance of a lead-time
 * estimate. Rendered next to every week number on Operations so founders
 * can see at a glance whether a lead-time is grounded in a supplier quote
 * or a specialist's judgement. Tone classes map to subtle background
 * variants defined in operations-v2.css.
 */
function LeadSourceChip({ source }: { source: LeadTimeSource }): React.ReactElement {
    const tone = leadSourceTone(source)
    return (
        <span className={`op2-lead-src op2-lead-src-${tone}`} title="Source of this lead-time estimate">
            {leadSourceLabel(source)}
        </span>
    )
}

// ─── View ───────────────────────────────────────────────────────────────

export function OperationsView(props: OperationsViewProps): React.ReactElement {
    const { project, brief, summary, productionRows } = props
    const base = `/the-forge-v2/projects/${project.id}`

    const hasAnyLeadTime = summary.longestLeadWeeks != null && summary.longestLeadWeeks > 0
    const productionPlanDeclared = brief.quantityTarget != null || brief.firstShipDateIso != null

    return (
        <div className="op2">
            {/* ── Breadcrumb ─────────────────────────────── */}
            <div className="op2-breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <Link href={base}>{project.name}</Link>
                <span className="sep">›</span>
                <span className="current">Operations</span>
            </div>

            {/* ── Page header ────────────────────────────── */}
            <div className="op2-page-header">
                <div>
                    <h1>
                        <span className="op2-title-dot" aria-hidden="true" />
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                        </svg>
                        Operations · {project.name}
                    </h1>
                    <div className="sub">
                        Build the thing. Production cadence, station schedule, assembly milestones,
                        inspection gates and shipping plan — all rolled up from modules, suppliers and
                        the locked revision.
                    </div>
                </div>
                <div className="cta-group">
                    <span className="op2-btn soon" title="Ships once the production-plan store lands">
                        Email weekly digest
                    </span>
                    <Link href={`${base}/revisions`} className="op2-btn primary">
                        New revision
                    </Link>
                </div>
            </div>

            {/* ── Annotation note ────────────────────────── */}
            <div className="op2-annot">
                <strong>Note</strong>
                Operations aggregates post-design activity — production cadence, station schedule,
                first-article inspection gates and shipping milestones. Most rows below populate
                automatically once the brief is locked, supplier awards land, and the production
                plan is declared.
            </div>

            {/* ── Lead-time provenance legend ─────────────── */}
            <div className="op2-lead-legend">
                <strong>Lead times</strong> show the source of each estimate — supplier quote,
                specialist judgement, historical analogue, or specialist estimate.
            </div>

            {/* ── Alert banner — this week's movers ──────── */}
            <div className="op2-alert">
                <h3>This week&apos;s movers across Operations</h3>
                <p>
                    No price, lead-time or compliance movers surfaced yet. The movers feed
                    populates once BOM parts are shortlisted against suppliers and price-drift
                    tracking is enabled — nothing is inferred from module-level lead-times alone.
                </p>
            </div>

            {/* ── Summary strip ──────────────────────────── */}
            <div className="op2-summary">
                <div className="op2-sum-card">
                    <div className="label">Quantity target</div>
                    <div className="value">{brief.quantityTarget ?? "—"}</div>
                    <div className="delta">{brief.quantityTarget ? "from brief" : "declare in brief"}</div>
                </div>
                <div className="op2-sum-card">
                    <div className="label">Target first ship</div>
                    <div className="value">{formatShipDate(brief.firstShipDateIso)}</div>
                    <div className="delta">{brief.firstShipDateIso ? "from brief constraints" : "no date declared"}</div>
                </div>
                <div className="op2-sum-card">
                    <div className="label">Longest module lead</div>
                    <div className="value op2-sum-value-wrap">
                        {hasAnyLeadTime ? (
                            <>
                                <span>{summary.longestLeadWeeks} wk</span>
                                <LeadSourceChip source={summary.longestLeadSource} />
                            </>
                        ) : (
                            "—"
                        )}
                    </div>
                    <div className="delta">
                        {hasAnyLeadTime ? `across ${summary.moduleCount} modules` : "not estimated yet"}
                    </div>
                </div>
                <div className="op2-sum-card">
                    <div className="label">Current mass</div>
                    <div className="value">{formatMass(summary.currentMassKg)}</div>
                    <div className="delta">
                        {summary.budgetMassKg != null ? `budget ${formatMass(summary.budgetMassKg)}` : "budget not declared"}
                    </div>
                </div>
                <div className="op2-sum-card">
                    <div className="label">Stations</div>
                    <div className="value">—</div>
                    <div className="delta">populate once awards land</div>
                </div>
                <div className="op2-sum-card">
                    <div className="label">Open NCRs</div>
                    <div className="value">—</div>
                    <div className="delta">no NCR feed wired</div>
                </div>
            </div>

            {/* ── Production timeline ────────────────────── */}
            <div className="op2-section">
                <div className="op2-section-head">
                    <div>
                        <h2>Production timeline</h2>
                        <div className="sub">
                            Per-module lead-time roll-up · exact dates populate once supplier quotes
                            are accepted and the production plan is declared
                        </div>
                    </div>
                </div>
                <div className="op2-card">
                    {productionRows.length === 0 ? (
                        <div className="op2-empty">
                            No production plan declared yet. Decompose the concept into modules in
                            the CAD lab, then use the
                            {" "}<Link href={`${base}/brief`} className="op2-link">Brief editor</Link>{" "}
                            to set quantity target and target-first-ship date.
                        </div>
                    ) : (
                        <div className="op2-gantt">
                            {productionRows.map((row) => (
                                <div key={row.id} className="op2-gantt-row">
                                    <div className="op2-gantt-label">
                                        <span className="op2-mod-chip">{row.moduleNum}</span>
                                        <span className="op2-gantt-name">{row.moduleName}</span>
                                    </div>
                                    <div className="op2-gantt-track">
                                        {row.bandFraction > 0 ? (
                                            <div
                                                className="op2-gantt-band"
                                                style={{ width: `${Math.round(row.bandFraction * 100)}%` }}
                                            />
                                        ) : (
                                            <div className="op2-gantt-band empty" />
                                        )}
                                    </div>
                                    <div className="op2-gantt-lead">
                                        {row.leadWeeks != null ? (
                                            <>
                                                <span className="op2-gantt-lead-num">{row.leadWeeks} wk</span>
                                                <LeadSourceChip source={row.leadTimeSource} />
                                            </>
                                        ) : (
                                            <span className="op2-gantt-lead-num op2-gantt-lead-unknown">
                                                — <span className="op2-gantt-lead-unknown-meta">(source unknown)</span>
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                            <div className="op2-gantt-footnote">
                                Skeleton band reflects module lead-time only. Real start / finish
                                dates will populate once supplier quotes are accepted and locked
                                into the production plan.
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Station schedule ───────────────────────── */}
            <div className="op2-section">
                <div className="op2-section-head">
                    <div>
                        <h2>Station schedule</h2>
                        <div className="sub">
                            Work-cell assignments · operator loading · takt target
                        </div>
                    </div>
                </div>
                <div className="op2-card">
                    <div className="op2-empty">
                        Stations populate once supplier awards land. No awards yet — shortlist
                        suppliers from the
                        {" "}<Link href={`${base}/suppliers`} className="op2-link">Suppliers artefact</Link>{" "}
                        and the schedule will draw from awarded quotes.
                    </div>
                </div>
            </div>

            {/* ── Assembly milestones + FAI gates ────────── */}
            <div className="op2-section">
                <div className="op2-section-head">
                    <div>
                        <h2>Assembly milestones &amp; inspection gates</h2>
                        <div className="sub">
                            First-article inspection · dimensional gates · sub-assembly sign-offs
                        </div>
                    </div>
                </div>
                <div className="op2-card">
                    <div className="op2-empty">
                        FAI schedule appears once the revision is locked. Current revision
                        {" "}<strong>{designRevisionToLetter(project.designRevision)}</strong>{" "}
                        is still in draft — lock the revision in the
                        {" "}<Link href={`${base}/brief-lock`} className="op2-link">Brief lock flow</Link>{" "}
                        to generate inspection gates.
                    </div>
                </div>
            </div>

            {/* ── Shipping plan ──────────────────────────── */}
            <div className="op2-section">
                <div className="op2-section-head">
                    <div>
                        <h2>Shipping plan</h2>
                        <div className="sub">
                            Ship milestones · logistics · customer delivery dates
                        </div>
                    </div>
                </div>
                <div className="op2-card">
                    {productionPlanDeclared ? (
                        <div className="op2-ship-grid">
                            <div className="op2-ship-tile">
                                <div className="op2-ship-label">Quantity target</div>
                                <div className="op2-ship-value">{brief.quantityTarget ?? "—"}</div>
                                <div className="op2-ship-meta">declared in brief</div>
                            </div>
                            <div className="op2-ship-tile">
                                <div className="op2-ship-label">Target first ship</div>
                                <div className="op2-ship-value">{formatShipDate(brief.firstShipDateIso)}</div>
                                <div className="op2-ship-meta">
                                    {brief.firstShipDateIso ? "from brief constraints" : "not declared"}
                                </div>
                            </div>
                            <div className="op2-ship-tile">
                                <div className="op2-ship-label">Logistics plan</div>
                                <div className="op2-ship-value">—</div>
                                <div className="op2-ship-meta">populates once routes are signed</div>
                            </div>
                            <div className="op2-ship-tile">
                                <div className="op2-ship-label">Customer ship dates</div>
                                <div className="op2-ship-value">—</div>
                                <div className="op2-ship-meta">no customer orders yet</div>
                            </div>
                        </div>
                    ) : (
                        <div className="op2-empty">
                            No ship dates declared. Set a quantity target and target-first-ship date
                            in the{" "}
                            <Link href={`${base}/brief`} className="op2-link">Brief editor</Link>
                            {" "}to populate the shipping plan.
                        </div>
                    )}
                </div>
            </div>

            {/* ── Takt + cycle time ──────────────────────── */}
            <div className="op2-section">
                <div className="op2-section-head">
                    <div>
                        <h2>Takt &amp; cycle time</h2>
                        <div className="sub">
                            Rate targets · per-station cycle · bottleneck analysis
                        </div>
                    </div>
                </div>
                <div className="op2-takt-grid">
                    <div className="op2-card op2-takt-card">
                        <div className="op2-takt-label">Takt time</div>
                        <div className="op2-takt-value">—</div>
                        <div className="op2-takt-meta">
                            takt = available time ÷ quantity target. Populates once quantity and
                            production window are declared.
                        </div>
                    </div>
                    <div className="op2-card op2-takt-card">
                        <div className="op2-takt-label">Average cycle time</div>
                        <div className="op2-takt-value">—</div>
                        <div className="op2-takt-meta">
                            Cycle time populates per station once production runs begin.
                        </div>
                    </div>
                    <div className="op2-card op2-takt-card">
                        <div className="op2-takt-label">Bottleneck</div>
                        <div className="op2-takt-value">—</div>
                        <div className="op2-takt-meta">
                            The longest cycle vs takt surfaces here once station data exists.
                        </div>
                    </div>
                </div>
            </div>

            {/* ── BOM watch ──────────────────────────────── */}
            <div className="op2-section">
                <div className="op2-section-head">
                    <div>
                        <h2>BOM watch</h2>
                        <div className="sub">
                            Price + lead-time drift across every active BOM part
                        </div>
                    </div>
                    <span className="op2-btn soon">Filter: Active</span>
                </div>
                <div className="op2-table-wrap">
                    <table className="op2-table">
                        <thead>
                            <tr>
                                <th>Part · supplier</th>
                                <th>Current £</th>
                                <th>Δ 30d</th>
                                <th>Lead</th>
                                <th>Δ lead</th>
                                <th>Trend</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td colSpan={7} className="op2-table-empty">
                                    No parts tracked yet. BOM watch populates once parts are
                                    shortlisted against suppliers in the
                                    {" "}<Link href={`${base}/bom`} className="op2-link">BOM artefact</Link>.
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Supplier scorecards ────────────────────── */}
            <div className="op2-section">
                <div className="op2-section-head">
                    <div>
                        <h2>Supplier scorecards</h2>
                        <div className="sub">
                            Rolling 12 months · on-time · NCRs · price drift · comms
                        </div>
                    </div>
                    <span className="op2-btn soon">Sort: On-time</span>
                </div>
                <div className="op2-card">
                    <div className="op2-empty">
                        No supplier order history yet. Scorecards roll up once orders are placed
                        and closed against suppliers in the
                        {" "}<Link href={`${base}/suppliers`} className="op2-link">Suppliers artefact</Link>.
                        Ratings feed the marketplace once enough rows accumulate.
                    </div>
                </div>
            </div>

            {/* ── Revisions & variants ───────────────────── */}
            <div className="op2-section">
                <div className="op2-section-head">
                    <div>
                        <h2>Revisions &amp; variants</h2>
                        <div className="sub">
                            Fork a new revision from any shipped product · inherit BOM, suppliers,
                            compliance packet
                        </div>
                    </div>
                </div>
                <div className="op2-card">
                    <div className="op2-rev-node">
                        <div className="op2-rev-dot draft">
                            v{designRevisionToLetter(project.designRevision)}
                        </div>
                        <div className="op2-rev-body">
                            <div className="op2-rev-title">
                                {project.name} — revision {designRevisionToLetter(project.designRevision)}
                            </div>
                            <div className="op2-rev-meta">
                                Current working revision · not yet locked · no shipped baseline yet
                            </div>
                        </div>
                        <div className="op2-rev-stats">current</div>
                    </div>
                    <div className="op2-empty" style={{ marginTop: 8 }}>
                        No forks or variants yet. Lock the current revision to establish a
                        baseline — future revisions will fork from there and inherit BOM,
                        suppliers and the compliance packet.
                    </div>
                </div>
            </div>

            {/* ── Compliance calendar ────────────────────── */}
            <div className="op2-section">
                <div className="op2-section-head">
                    <div>
                        <h2>Compliance calendar</h2>
                        <div className="sub">
                            Cert + test-report renewals · regulatory transitions · auto-triggered
                            from BOM changes
                        </div>
                    </div>
                    <span className="op2-btn soon">Next 90 days</span>
                </div>
                <div className="op2-card">
                    <div className="op2-empty">
                        No renewals or regulatory items scheduled. The compliance calendar
                        auto-triggers from BOM and supplier changes once the rules engine and
                        cert registry are populated for this project.
                    </div>
                </div>
            </div>

            {/* ── Annotation footer ──────────────────────── */}
            <div className="op2-annot" style={{ marginTop: 24 }}>
                <strong>Note</strong>
                Operations auto-populates from upstream artefacts. Locking the revision generates
                inspection gates. Accepting supplier quotes generates stations and timeline dates.
                Declaring quantity + first-ship date in the Brief populates the shipping plan and
                takt. Until those upstream inputs land, every row stays in honest empty state.
            </div>
        </div>
    )
}
