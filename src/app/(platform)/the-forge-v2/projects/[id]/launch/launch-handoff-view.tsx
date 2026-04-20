/**
 * LaunchHandoffView — Launch / Handoff artefact page (V2, mockup-faithful).
 *
 * Port of FORGE-MOCKUP-LAUNCH-HANDOFF.html. Scoped CSS under `.lh2` keeps
 * the mockup's palette / typography isolated from the rest of the platform.
 *
 * Sections (top to bottom, matching the mockup order):
 *   1. Breadcrumb
 *   2. Annotation note (what the launch gate is)
 *   3. Page header — title + sub
 *   4. Two-column grid
 *      Left column (launch-wrap card):
 *        a. Terminal head — "ready to ship" or "not ready, specific blockers"
 *        b. Pre-launch checklist — one row per gate, real status from data
 *        c. Transitions — Forge → Operations handover table (static IA)
 *        d. Stays in Forge — permanent build-time record (static copy)
 *        e. Post-launch automation — scheduled downstream actions
 *        f. Operations preview — first-ship / warranty / suppliers / risks
 *        g. Decision strip — Cancel + Ship (Ship disabled until ready)
 *      Right column (sidebar stack):
 *        • Why this matters (static)
 *        • Build snapshot (revision / suppliers / modules / parts / cost)
 *        • What you lose access to (static)
 *   5. Annotation footer
 *
 * Empty-state policy: every gate row and side-card stat is driven by what
 * is actually in the project payload. When a stat is unavailable we render
 * an em-dash plus an honest "not declared yet" caption — never a fabricated
 * HAPS / Astra / £148,240 value from the mockup.
 */

"use client"

import Link from "next/link"
import "./launch-handoff-v2.css"

// ─── Types ──────────────────────────────────────────────────────────────

export type LaunchGateState = "green" | "amber" | "red"

export interface LaunchGateRow {
    /** Stable key for React. */
    id: string
    /** Gate label — e.g. "Brief locked". */
    label: string
    /** One-line substatus — either a real stat, or an honest empty caption. */
    sub: string
    /** Traffic-light state. */
    state: LaunchGateState
    /** Owner / author attribution — "auto", role name, or specialist name. */
    by: string
}

export interface LaunchHandoffViewProps {
    project: {
        id: string
        name: string
        designRevision: number
    }
    /** Overall readiness — when false the ship button is disabled. */
    isReady: boolean
    /** Ordered list of specific blockers to show in the not-ready banner. */
    blockers: string[]
    /** Pre-launch checklist rows (order matters — matches the mockup). */
    gates: LaunchGateRow[]
    /** Build-snapshot side card values. Null → em-dash in the row. */
    snapshot: {
        currentRevision: string
        moduleCount: number
        partCount: number | null
        supplierCount: number
        cadFileCount: number
        regulatoryCount: number
        unitCostCeilingGbp: number | null
        firstShipDateIso: string | null
        quantityTarget: string | null
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────

function formatShipDate(iso: string | null): string {
    if (!iso) return "—"
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

function formatGbp(n: number | null): string {
    if (n == null) return "—"
    return `£${n.toLocaleString("en-GB")}`
}

// ─── View ───────────────────────────────────────────────────────────────

export function LaunchHandoffView(props: LaunchHandoffViewProps): React.ReactElement {
    const { project, isReady, blockers, gates, snapshot } = props
    const base = `/the-forge-v2/projects/${project.id}`

    return (
        <div className="lh2">
            {/* ── Breadcrumb ─────────────────────────────── */}
            <div className="lh2-breadcrumb">
                <Link href="/the-forge-v2">The Forge</Link>
                <span className="sep">›</span>
                <Link href={base}>{project.name}</Link>
                <span className="sep">›</span>
                <span className="current">Ship &amp; hand off to Operations</span>
            </div>

            {/* ── Annotation note ────────────────────────── */}
            <div className="lh2-annot">
                <strong>Note</strong>
                The launch gate is terminal — the current revision is what ships. Changes
                post-launch happen in Operations (field-service revisions) or as a new Fork.
                The artefact spine persists; what changes is which surface owns the live
                record. Forge owns build-time; Operations owns ship-time onwards. This page
                is the transition itself.
            </div>

            {/* ── Page header ────────────────────────────── */}
            <h1 className="lh2-title">Ship {project.name} and hand off to Operations</h1>
            <p className="lh2-subtitle">
                Launching moves the canonical surface from Forge to Operations. Build-time
                concerns (BOM, Suppliers, Risks) become ops-time surfaces (BOM Watch,
                Supplier Scorecards, Compliance Calendar, Revisions).
            </p>

            {/* ── Two-column grid ────────────────────────── */}
            <div className="lh2-grid">

                {/* ── Left: launch wrap ──────────────────── */}
                <div className="lh2-wrap">

                    {/* ── Terminal head ──────────────────── */}
                    {isReady ? (
                        <div className="lh2-terminal-head ready">
                            <div className="lh2-ship-icon" aria-hidden="true">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                            </div>
                            <div className="body">
                                <strong>All launch gates green. You&apos;re clear to ship.</strong>
                                <div className="sub">
                                    {project.name} · first unit ready · reviews signed · warranty active on
                                    despatch. This is a deliberate, reviewed handoff — not an automation.
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="lh2-terminal-head not-ready">
                            <div className="lh2-ship-icon" aria-hidden="true">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 9v4" />
                                    <path d="M12 17h.01" />
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                </svg>
                            </div>
                            <div className="body">
                                <strong>Not ready to ship yet.</strong>
                                <div className="sub">
                                    {blockers.length === 0
                                        ? "Close the remaining gates below before the handoff package can be generated."
                                        : `${blockers.length} blocker${blockers.length === 1 ? "" : "s"}: ${blockers.join(" · ")}`}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Pre-launch checklist ───────────── */}
                    <div className="lh2-section-title">
                        Pre-launch checklist · {isReady
                            ? "all items closed"
                            : `${gates.filter(g => g.state === "green").length} of ${gates.length} closed`}
                    </div>
                    <div className="lh2-checklist">
                        {gates.map((gate) => (
                            <div key={gate.id} className="lh2-check-row">
                                <div className={`lh2-check ${gate.state}`}>
                                    {gate.state === "green" ? "✓" : gate.state === "amber" ? "!" : ""}
                                </div>
                                <div>
                                    <div className="lh2-item-label">{gate.label}</div>
                                    <div className="lh2-item-sub">{gate.sub}</div>
                                </div>
                                <div className="lh2-by">{gate.by}</div>
                            </div>
                        ))}
                    </div>

                    {/* ── Transitions table ──────────────── */}
                    <div className="lh2-section-title">What transitions from Forge to Operations</div>
                    <div className="lh2-transitions">
                        <div className="lh2-tr-row head">
                            <div className="from-val">Build-time artefact (Forge)</div>
                            <div className="arrow-col"></div>
                            <div className="to-val">Ops-time surface (Operations)</div>
                        </div>
                        <div className="lh2-tr-row">
                            <div className="from-val">
                                <div className="v-title">Forge BOM</div>
                                <div className="v-sub">
                                    {snapshot.partCount != null
                                        ? `${snapshot.partCount} line item${snapshot.partCount === 1 ? "" : "s"} across ${snapshot.moduleCount} module${snapshot.moduleCount === 1 ? "" : "s"} · canonical during build`
                                        : `Across ${snapshot.moduleCount} module${snapshot.moduleCount === 1 ? "" : "s"} · canonical during build`}
                                </div>
                            </div>
                            <div className="arrow-col">→</div>
                            <div className="to-val">
                                <div className="v-title">Operations BOM Watch</div>
                                <div className="v-sub">
                                    Live tracking of cert expiries, price drift, lead-time drift, NCRs.
                                    Alerts when a supplier or part breaches tolerance.
                                </div>
                            </div>
                        </div>
                        <div className="lh2-tr-row">
                            <div className="from-val">
                                <div className="v-title">Forge Suppliers</div>
                                <div className="v-sub">
                                    {snapshot.supplierCount > 0
                                        ? `${snapshot.supplierCount} shortlisted · RFQ + scoring during build`
                                        : "Shortlist + RFQ + scoring during build"}
                                </div>
                            </div>
                            <div className="arrow-col">→</div>
                            <div className="to-val">
                                <div className="v-title">Operations Supplier Scorecards</div>
                                <div className="v-sub">
                                    OTD · quality (ppm) · renewal cadence · incident count. Monthly
                                    refresh. Scorecards influence future RFQs automatically.
                                </div>
                            </div>
                        </div>
                        <div className="lh2-tr-row">
                            <div className="from-val">
                                <div className="v-title">Forge Risks &amp; Regulatory</div>
                                <div className="v-sub">
                                    {snapshot.regulatoryCount > 0
                                        ? `${snapshot.regulatoryCount} regulatory item${snapshot.regulatoryCount === 1 ? "" : "s"} declared · failure modes + unknowns logged per module`
                                        : "Failure modes + unknowns logged per module · regulatory posture not yet declared"}
                                </div>
                            </div>
                            <div className="arrow-col">→</div>
                            <div className="to-val">
                                <div className="v-title">Operations Compliance Calendar + Incident log</div>
                                <div className="v-sub">
                                    Calendar tracks cert renewals. Incidents logged in structured
                                    form, linked back to the risk register.
                                </div>
                            </div>
                        </div>
                        <div className="lh2-tr-row">
                            <div className="from-val">
                                <div className="v-title">Forge Revisions</div>
                                <div className="v-sub">
                                    Current: revision {snapshot.currentRevision} · build-time version history
                                </div>
                            </div>
                            <div className="arrow-col">→</div>
                            <div className="to-val">
                                <div className="v-title">Operations Revisions surface</div>
                                <div className="v-sub">
                                    Future field-service revisions live here. Each revision gets
                                    its own supplier deltas and risk notes.
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── Stays in Forge ─────────────────── */}
                    <div className="lh2-section-title">What stays in Forge · read-only</div>
                    <div className="lh2-stays-card">
                        <h4>Permanent build-time record</h4>
                        <p>
                            The &quot;as-shipped&quot; snapshot of the product freezes in Forge as
                            the reference record. It&apos;s read-only from now on. If you need to
                            change any of it, open a Fork.
                        </p>
                        <div className="lh2-stays-list">
                            <div className="item">The Brief as shipped (revision {snapshot.currentRevision})</div>
                            <div className="item">Modules as designed</div>
                            <div className="item">
                                {snapshot.cadFileCount > 0
                                    ? `CAD geometry · ${snapshot.cadFileCount} file${snapshot.cadFileCount === 1 ? "" : "s"} uploaded`
                                    : "CAD geometry · none uploaded yet"}
                            </div>
                            <div className="item">
                                {snapshot.unitCostCeilingGbp != null
                                    ? `Cost model · ceiling ${formatGbp(snapshot.unitCostCeilingGbp)}/unit`
                                    : "Cost model · no ceiling declared"}
                            </div>
                            <div className="item">Inspection &amp; test plan per module</div>
                            <div className="item">Build history timeline</div>
                        </div>
                    </div>

                    {/* ── Post-launch automation ─────────── */}
                    <div className="lh2-section-title">Post-launch enablement · automatic</div>
                    <div className="lh2-automation">
                        <h4>Scheduled downstream actions (run without you)</h4>
                        <ul>
                            <li>
                                First <strong>BOM Watch scan</strong> runs at <strong>T+7 days</strong>.
                                Cert expiries, price drift on recent RFQs, lead-time drift detection.
                            </li>
                            <li>
                                <strong>Supplier scorecards initialised</strong> at T+30 days.
                                OTD / quality / renewal data accumulates from there.
                            </li>
                            <li>
                                <strong>Warranty clock starts on despatch</strong> — T+0 is the
                                despatch date, not the launch date.
                            </li>
                            <li>
                                <strong>Compliance calendar</strong> seeded from the regulatory
                                posture — renewal reminders auto-schedule at 30-day and 7-day windows.
                            </li>
                            <li>
                                <strong>Customer success cadence:</strong> structured check-ins at
                                T+7, T+30, T+90. Feedback flows into the Risks register and
                                Revisions backlog.
                            </li>
                        </ul>
                    </div>

                    {/* ── Operations preview ─────────────── */}
                    <div className="lh2-section-title">
                        Operations preview · {project.name} immediately after handoff
                    </div>
                    <div className="lh2-ops-preview">
                        <h4>What {project.name} looks like in Operations · T+0</h4>
                        <div className="lh2-ops-caption">
                            This is the card you&apos;ll see when you visit the Operations surface
                            after shipping. It replaces the Forge Workspace view for this project.
                        </div>
                        <div className="lh2-ops-grid">
                            <div className="lh2-ops-metric">
                                <div className="k">First ship</div>
                                <div className="v">{formatShipDate(snapshot.firstShipDateIso)}</div>
                                <div className="sub">
                                    {snapshot.firstShipDateIso ? "from brief constraints" : "no date declared"}
                                </div>
                            </div>
                            <div className="lh2-ops-metric">
                                <div className="k">Quantity target</div>
                                <div className="v">{snapshot.quantityTarget ?? "—"}</div>
                                <div className="sub">
                                    {snapshot.quantityTarget ? "from brief" : "not declared"}
                                </div>
                            </div>
                            <div className="lh2-ops-metric">
                                <div className="k">Suppliers watched</div>
                                <div className="v">{snapshot.supplierCount}</div>
                                <div className="sub">
                                    {snapshot.supplierCount > 0 ? "scorecards populate at T+30d" : "no shortlist yet"}
                                </div>
                            </div>
                            <div className="lh2-ops-metric">
                                <div className="k">Regulatory items</div>
                                <div className="v">{snapshot.regulatoryCount}</div>
                                <div className="sub">
                                    {snapshot.regulatoryCount > 0 ? "tracked in compliance calendar" : "none declared"}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── Decision strip ─────────────────── */}
                    <div className="lh2-decision-strip">
                        <div className="hint">
                            Shipping is a deliberate act — British understatement, not confetti.
                            Reviewed and ready, or not at all.
                        </div>
                        <Link href={base} className="lh2-btn-ghost">
                            Cancel · not shipping yet
                        </Link>
                        {isReady ? (
                            <span
                                className="lh2-btn-ship disabled"
                                aria-disabled="true"
                                title="Handoff package generation wires in a later round"
                            >
                                Ship and hand off
                            </span>
                        ) : (
                            <span
                                className="lh2-btn-ship disabled"
                                aria-disabled="true"
                                title={`Close ${blockers.length || "the remaining"} blocker${blockers.length === 1 ? "" : "s"} first`}
                            >
                                Ship and hand off
                            </span>
                        )}
                    </div>

                </div>

                {/* ── Right: sidebar stack ───────────────── */}
                <div>
                    <div className="lh2-side-card">
                        <h4>Why this matters</h4>
                        <p>
                            Most product tools forget about the product after launch. In hardware,
                            that&apos;s where most of the cost lives — supplier drift, cert
                            renewals, warranty claims.
                        </p>
                        <p>
                            Operations is where ForgeOS keeps paying off. Launch is the handover,
                            not the end.
                        </p>
                    </div>
                    <div className="lh2-side-card">
                        <h4>Build snapshot</h4>
                        <div className="row">
                            <div className="k">Current revision</div>
                            <div className="v">{snapshot.currentRevision}</div>
                        </div>
                        <div className="row">
                            <div className="k">Modules</div>
                            <div className="v">{snapshot.moduleCount}</div>
                        </div>
                        <div className="row">
                            <div className="k">Parts</div>
                            <div className="v">{snapshot.partCount ?? "—"}</div>
                        </div>
                        <div className="row">
                            <div className="k">Suppliers shortlisted</div>
                            <div className="v">{snapshot.supplierCount}</div>
                        </div>
                        <div className="row">
                            <div className="k">CAD files</div>
                            <div className="v">{snapshot.cadFileCount}</div>
                        </div>
                        <div className="row">
                            <div className="k">Regulatory items</div>
                            <div className="v">{snapshot.regulatoryCount}</div>
                        </div>
                        <div className="row">
                            <div className="k">Unit cost ceiling</div>
                            <div className="v">{formatGbp(snapshot.unitCostCeilingGbp)}</div>
                        </div>
                    </div>
                    <div className="lh2-side-card">
                        <h4>What you lose access to</h4>
                        <p>
                            Nothing, really. Forge stays browseable. You just lose the
                            edit-pencil on the BOM, Suppliers, and Risks. Edits from here
                            onwards flow through Operations — with a forwarding trail.
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Annotation footer ──────────────────────── */}
            <div className="lh2-annot" style={{ marginTop: 24 }}>
                <strong>Note</strong>
                Naming choice — &quot;Ship and hand off&quot; rather than &quot;Launch&quot;
                because the launch-y verb sets wrong expectations. Hardware shipping is
                unglamorous; it&apos;s paperwork and serial stamps. The button is a sober
                green, not a gradient. Celebration happens in the customer&apos;s hangar,
                not in the UI.
            </div>
        </div>
    )
}
