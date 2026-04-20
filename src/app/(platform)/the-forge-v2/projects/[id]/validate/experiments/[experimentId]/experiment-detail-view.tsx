/**
 * ExperimentDetailView — Experiment Detail artefact page (V2, mockup-faithful).
 *
 * Port of FORGE-MOCKUP-EXPERIMENT-DETAIL.html. Scoped CSS under `.ed2` keeps
 * the styling isolated so the mockup's brand-soft criterion card, decision
 * radio-group and meta-bar don't leak into the rest of the platform.
 *
 * Sections (top to bottom):
 *   1. Cross-mockup reference chips
 *   2. Breadcrumb
 *   3. Page header — experiment name + status badge + archive CTA
 *   4. Meta-bar — Assumption → Experiment → Result → Decision flow stages
 *   5. Context card — hypothesis, method, assumption(s), dates, sample
 *   6. Pre-declared success criterion — locked bar the experiment was designed against
 *   7. Method card — how the experiment was run
 *   8. Result — headline stats + response-breakdown chart
 *   9. Decision — KEEP / ITERATE / KILL radio-group (WAI-ARIA)
 *  10. Linked assumptions — pending transition preview
 *  11. Notes textarea
 *  12. Actions bar — Back / Save decision
 *  13. Last-updated footer
 *
 * Data contract / empty-state policy:
 *   The `experiments` table does not exist yet. This view accepts the route
 *   param `experimentId` and renders the full mockup layout with honest empty
 *   slots — every data field shows "—" or a neutral "Not yet captured. Log
 *   experiment results via the validation flow." line. Mockup specifics
 *   (RecycloPack, Price-survey Feb batch, 70% yes at £299, the 6 unprompted
 *   pre-orders, assumption R4/R3, locked-at 07 Feb, Tristan as owner) are
 *   NEVER fabricated. Decision state is "not yet captured" — no option is
 *   pre-selected. Save and archive buttons are disabled until wiring lands.
 */

"use client"

import Link from "next/link"
import "./experiment-detail-v2.css"

// ─── Types ──────────────────────────────────────────────────────────────

export interface ExperimentDetailViewProps {
    project: {
        id: string
        name: string
    }
    /** The route-param experiment ID. Surfaced in microcopy so the reader
     *  knows which experiment this page is scoped to, even though no row
     *  exists in the database yet. */
    experimentId: string
}

// ─── View ───────────────────────────────────────────────────────────────

const EMPTY_FIELD = "—"
const EMPTY_LONG = "Not yet captured. Log experiment results via the validation flow."

export function ExperimentDetailView(
    props: ExperimentDetailViewProps,
): React.ReactElement {
    const { project, experimentId } = props
    const base = `/the-forge-v2/projects/${project.id}`
    const validateBase = `${base}/validate`

    return (
        <div className="ed2">

            {/* ── Cross-mockup reference chips ───────────── */}
            <div className="ed2-ctx-chips" aria-hidden="true">
                <Link href={base} className="ed2-ctx-chip">← PROJECT</Link>
                <Link href={validateBase} className="ed2-ctx-chip">VALIDATE</Link>
                <span className="ed2-ctx-chip active">EXPERIMENT DETAIL</span>
            </div>

            {/* ── Breadcrumb ─────────────────────────────── */}
            <nav className="ed2-breadcrumb" aria-label="Breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <Link href={base}>{project.name}</Link>
                <span className="sep">›</span>
                <Link href={validateBase}>Validate</Link>
                <span className="sep">›</span>
                <span className="current">Experiment · {experimentId}</span>
            </nav>

            {/* ── Page header ────────────────────────────── */}
            <div className="ed2-header">
                <div className="left">
                    <h1>
                        Experiment {EMPTY_FIELD}
                        <span className="status-badge">Not yet captured</span>
                    </h1>
                    <div className="ed2-sub">
                        Experiment on <strong>{project.name}</strong> ·
                        {" "}method <code>{EMPTY_FIELD}</code> ·
                        {" "}ran {EMPTY_FIELD} · {EMPTY_FIELD} respondents · owner {EMPTY_FIELD}
                    </div>
                </div>
                <div>
                    <button type="button" className="ed2-ghost-btn" disabled>
                        Archive
                    </button>
                </div>
            </div>

            {/* ── Meta-bar: Assumption → Experiment → Result → Decision ── */}
            <div className="ed2-meta-bar">
                <div className="meta-title">Flow</div>
                <div className="meta-stages">
                    <div className="ed2-meta-stage">
                        <div className="stage-num">01</div>
                        <div className="stage-name">Assumption</div>
                        <div className="stage-owner">{EMPTY_FIELD}</div>
                    </div>
                    <span className="ed2-meta-stage-arrow" aria-hidden="true">▸</span>
                    <div className="ed2-meta-stage">
                        <div className="stage-num">02</div>
                        <div className="stage-name">Experiment</div>
                        <div className="stage-owner">{EMPTY_FIELD}</div>
                    </div>
                    <span className="ed2-meta-stage-arrow" aria-hidden="true">▸</span>
                    <div className="ed2-meta-stage">
                        <div className="stage-num">03</div>
                        <div className="stage-name">Result logged</div>
                        <div className="stage-owner">{EMPTY_FIELD}</div>
                    </div>
                    <span className="ed2-meta-stage-arrow" aria-hidden="true">▸</span>
                    <div className="ed2-meta-stage active">
                        <div className="stage-num">04</div>
                        <div className="stage-name">Decision pending</div>
                        <div className="stage-owner">you</div>
                    </div>
                </div>
            </div>

            {/* ── Context ────────────────────────────────── */}
            <div className="ed2-sec-h">Context</div>
            <div className="ed2-card">
                <div className="ed2-ctx-grid">
                    <div className="row">
                        <div className="k">Hypothesis</div>
                        <div className="v muted">{EMPTY_LONG}</div>
                    </div>
                    <div className="row">
                        <div className="k">Test method</div>
                        <div className="v muted">{EMPTY_FIELD}</div>
                    </div>
                    <div className="row">
                        <div className="k">Assumption(s)</div>
                        <div className="v muted">{EMPTY_LONG}</div>
                    </div>
                    <div className="row">
                        <div className="k">Started</div>
                        <div className="v muted">{EMPTY_FIELD}</div>
                    </div>
                    <div className="row">
                        <div className="k">Ended</div>
                        <div className="v muted">{EMPTY_FIELD}</div>
                    </div>
                    <div className="row">
                        <div className="k">Sample</div>
                        <div className="v muted">{EMPTY_FIELD}</div>
                    </div>
                </div>
            </div>

            {/* ── Pre-declared success criterion ─────────── */}
            <div className="ed2-sec-h">Pre-declared success criterion</div>
            <div className="ed2-criterion">
                <div className="lock">Locked at experiment creation · {EMPTY_FIELD}</div>
                <p className="bar muted">{EMPTY_LONG}</p>
                <p className="note">
                    The criterion is the bar the experiment was designed against. It can&apos;t
                    be edited after the experiment runs — that&apos;s what stops post-hoc
                    rationalisation. If the bar was wrong, log a new experiment.
                </p>
            </div>

            {/* ── Method ─────────────────────────────────── */}
            <div className="ed2-sec-h">Method</div>
            <div className="ed2-card">
                <p style={{ color: "var(--ed-fg-muted)" }}>{EMPTY_LONG}</p>
            </div>

            {/* ── Result ─────────────────────────────────── */}
            <div className="ed2-sec-h">Result</div>
            <div className="ed2-card">
                <div className="ed2-result-grid">
                    <div>
                        <div className="ed2-result-stat">
                            <div className="lbl">Headline</div>
                            <div className="big muted">{EMPTY_FIELD}</div>
                            <div className="sub">{EMPTY_LONG}</div>
                        </div>
                        <div className="ed2-result-stat">
                            <div className="lbl">Secondary metric</div>
                            <div className="big muted">{EMPTY_FIELD}</div>
                            <div className="sub">{EMPTY_LONG}</div>
                        </div>
                        <div className="ed2-result-stat">
                            <div className="lbl">Unprompted signal</div>
                            <div className="big muted">{EMPTY_FIELD}</div>
                            <div className="sub">{EMPTY_LONG}</div>
                        </div>
                    </div>
                    <div className="ed2-chart-stack">
                        <h4>Response breakdown</h4>
                        <p className="empty-note">{EMPTY_LONG}</p>
                    </div>
                </div>
            </div>

            {/* ── Decision · WAI-ARIA radiogroup ─────────── */}
            <div className="ed2-sec-h" id="ed2-decision-heading">Decision</div>
            <div
                className="ed2-decision-grid"
                role="radiogroup"
                aria-labelledby="ed2-decision-heading"
            >
                <div
                    className="ed2-dec-card keep"
                    role="radio"
                    aria-checked="false"
                    aria-disabled="true"
                    tabIndex={0}
                >
                    <div className="dec-head">
                        <div className="dec-radio" aria-hidden="true"></div>
                        <div className="dec-name">KEEP</div>
                    </div>
                    <p className="dec-line">
                        Evidence clears the bar. Move the assumption to <code>valid</code> and
                        flow credibility into the Action tab.
                    </p>
                    <p className="dec-what">
                        <strong>What this does:</strong> flips linked assumptions to
                        {" "}<code>valid</code>, unlocks the dependent readiness checklist item,
                        writes a <code>valid</code> event to Today.
                    </p>
                </div>

                <div
                    className="ed2-dec-card iterate"
                    role="radio"
                    aria-checked="false"
                    aria-disabled="true"
                    tabIndex={-1}
                >
                    <div className="dec-head">
                        <div className="dec-radio" aria-hidden="true"></div>
                        <div className="dec-name">ITERATE</div>
                    </div>
                    <p className="dec-line">
                        Evidence is mixed. Run a refinement — a different price point, a
                        different segment — before the assumption moves either way.
                    </p>
                    <p className="dec-what">
                        <strong>What this does:</strong> leaves the assumption at
                        {" "}<code>testing</code>, opens a fresh experiment drawer pre-filled
                        with the current criterion so the next bar is explicit.
                    </p>
                </div>

                <div
                    className="ed2-dec-card kill"
                    role="radio"
                    aria-checked="false"
                    aria-disabled="true"
                    tabIndex={-1}
                >
                    <div className="dec-head">
                        <div className="dec-radio" aria-hidden="true"></div>
                        <div className="dec-name">KILL</div>
                    </div>
                    <p className="dec-line">
                        Evidence points the other way. Move the assumption to
                        {" "}<code>invalid</code>. Consider archiving this hypothesis or
                        pivoting to the next.
                    </p>
                    <p className="dec-what">
                        <strong>What this does:</strong> flips linked assumptions to
                        {" "}<code>invalid</code>, writes a critical event to Today, offers an
                        archive-reason picker on the hypothesis.
                    </p>
                </div>
            </div>

            {/* ── Linked assumptions ─────────────────────── */}
            <div className="ed2-sec-h">Linked assumptions — what will move when you save</div>
            <div className="ed2-assum-row">
                <div className="text">
                    <div className="label">Assumption</div>
                    <span style={{ color: "var(--ed-fg-muted)", fontStyle: "italic" }}>
                        {EMPTY_LONG}
                    </span>
                </div>
                <div className="transition">
                    <span className="ed2-status-pill ed2-status-untested">Untested</span>
                    <span className="arrow" aria-hidden="true">→</span>
                    <span className="ed2-status-pill ed2-status-untested">Untested</span>
                </div>
            </div>

            {/* ── Notes ──────────────────────────────────── */}
            <div className="ed2-sec-h">Notes · why you picked this</div>
            <div className="ed2-card">
                <textarea
                    className="ed2-notes"
                    placeholder="Write a short note for the audit trail — what tipped the decision, what surprised you, what the next test should look at…"
                    disabled
                    aria-label="Decision notes"
                />
                <div className="ed2-notes-hint">
                    Stored in <code>experiments.result_summary</code> · visible to everyone
                    on the foundry with Products read access. Notes wire in once the
                    validation flow lands.
                </div>
            </div>

            {/* ── Actions ────────────────────────────────── */}
            <div className="ed2-actions-bar">
                <Link href={validateBase} className="ed2-back-btn">
                    ← Back to Validate
                </Link>
                <div className="right">
                    <span className="ed2-empty-hint">
                        Save wires in once the validation flow is wired.
                    </span>
                    <button type="button" className="ed2-save-btn" disabled>
                        Save decision
                    </button>
                </div>
            </div>

            <div className="ed2-ts-footer">
                Experiment ID · <code>{experimentId}</code>
            </div>
        </div>
    )
}
