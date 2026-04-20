/**
 * AssumptionView — Validate / Assumption artefact page (V2).
 *
 * Mockup-faithful DOM ported from FORGE-MOCKUP-ASSUMPTION-TEST.html. The
 * mockup showcases a single drill-in "Progressive Maize WTP" assumption;
 * the production page inverts that: because no `assumptions` table exists
 * yet, every slot starts blank and the founder interacts with the form
 * client-side. Persistence is wired up in the next round when the
 * validation store ships.
 *
 * Sections (top to bottom, mirroring the mockup):
 *   1. Breadcrumb
 *   2. Page header — Validate icon + title + CTAs
 *   3. Empty-state note (when no ?id= is present)
 *   4. Hypothesis banner — R-tag, editable hypothesis, owner + status chip
 *   5. Status tracker bar (6 steps — purely visual)
 *   6. Test method picker (Survey / Interview / Prototype / Experiment)
 *   7. Test design grid — "What we're testing" + "Method" (both editable)
 *   8. Success / failure criteria grid (editable)
 *   9. Verdict picker (Validated / Mixed / Invalidated)
 *  10. Results placeholder
 *  11. Save row — disabled CTA + hint ("Persistence ships with the validation store")
 *
 * No mockup specifics (Progressive Maize, co-ops, £120–£150, Samuel Okello,
 * Prof. Wanjiru) are baked in as fallbacks. Placeholders are generic prompts.
 */

"use client"

import Link from "next/link"
import { useState } from "react"

import "./assumption-v2.css"

// ─── Types ─────────────────────────────────────────────────────────────

export type AssumptionTestMethod = "survey" | "interview" | "prototype" | "experiment"
export type AssumptionVerdict = "validated" | "mixed" | "invalidated"

export interface AssumptionViewProps {
    project: {
        id: string
        name: string
    }
    /** Optional assumption id from ?id=<uuid>. Null → blank-form mode. */
    assumptionId: string | null
}

// ─── Constants ─────────────────────────────────────────────────────────

const METHODS: Array<{ id: AssumptionTestMethod; name: string; desc: string }> = [
    { id: "survey", name: "Survey", desc: "Wide-reach questionnaire · named WTP, preference ranking, anchor price." },
    { id: "interview", name: "Interview", desc: "Named conversation with a target customer · discover decision-makers." },
    { id: "prototype", name: "Prototype demo", desc: "Show a working unit · observe reactions, commitments, deposits." },
    { id: "experiment", name: "Experiment", desc: "Fake-door, diary study, or price-ladder · quantitative signal." },
]

const TRACKER_STEPS: Array<{ label: string; hint: string }> = [
    { label: "Logged", hint: "When declared" },
    { label: "Hypothesis written", hint: "Phrased as a testable statement" },
    { label: "Test designed", hint: "Method + recipients + criteria" },
    { label: "Recipients booked", hint: "Who is giving the signal" },
    { label: "Test run", hint: "Data captured" },
    { label: "Decision", hint: "Validated / mixed / invalidated" },
]

// ─── View ──────────────────────────────────────────────────────────────

export function AssumptionView(props: AssumptionViewProps): React.ReactElement {
    const { project, assumptionId } = props
    const briefHref = `/the-forge-v2/projects/${project.id}/brief`
    const workspaceHref = `/the-forge-v2/projects/${project.id}`

    const [hypothesis, setHypothesis] = useState<string>("")
    const [method, setMethod] = useState<AssumptionTestMethod | null>(null)
    const [whatTesting, setWhatTesting] = useState<string>("")
    const [howTesting, setHowTesting] = useState<string>("")
    const [successCriteria, setSuccessCriteria] = useState<string>("")
    const [failureCriteria, setFailureCriteria] = useState<string>("")
    const [verdict, setVerdict] = useState<AssumptionVerdict | null>(null)

    // Tracker step inference — done/active/pending based on what the user has
    // filled in. Purely visual; nothing persists until the validation store ships.
    const activeStepIndex = computeActiveStep({
        hypothesis,
        method,
        whatTesting,
        howTesting,
        successCriteria,
        failureCriteria,
        verdict,
    })

    return (
        <div className="at2">
            {/* ── Breadcrumb ──────────────────────────────────────── */}
            <div className="at2-breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <Link href={workspaceHref}>{project.name}</Link>
                <span className="sep">›</span>
                <span className="current">Validate · Assumption</span>
            </div>

            {/* ── Page header ─────────────────────────────────────── */}
            <div className="at2-page-header">
                <h1>
                    <span className="at2-title-dot" aria-hidden="true" />
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M9 3v6l-5 11h16l-5-11V3" />
                        <path d="M8 3h8" />
                        <path d="M7 14h10" />
                    </svg>
                    Assumption test
                </h1>
                <div className="sub">Turn a belief into a test — hypothesis, method, recipients, pass/fail criteria. Pre-commit the decision tree before the data arrives.</div>
            </div>

            {/* ── Empty-state note (no id passed) ─────────────────── */}
            {assumptionId === null && (
                <div className="at2-empty">
                    <h3>No assumptions tracked yet</h3>
                    <p>
                        This is a preview of how the flow will look. Every risky assumption gets its own test design: hypothesis, method, recipients, explicit pass/fail criteria.
                    </p>
                    <p>
                        Declare your first assumption on the <Link href={briefHref}>Brief</Link> — the one most likely to be wrong, and most expensive to be wrong about.
                    </p>
                </div>
            )}

            <div className="at2-note">
                <strong>Preview mode.</strong> Assumption persistence ships with the validation store (next round). Fill the form to feel the shape — nothing is saved yet.
            </div>

            {/* ── Hypothesis banner ───────────────────────────────── */}
            <div className="at2-hyp-banner">
                <div>
                    <div className="lbl"><span className="rp">R?</span> Riskiest untested assumption</div>
                    <textarea
                        className="hyp-input"
                        placeholder="Write the hypothesis as a testable statement. Example: Our target segment will pay £X for this device, and the decision-maker is the end user (not an intermediary)."
                        value={hypothesis}
                        onChange={(e) => setHypothesis(e.target.value)}
                        rows={2}
                    />
                    <div className="meta">
                        Owner: you · linked to <Link href={briefHref}>Brief</Link>
                        {assumptionId !== null && <> · reference <code style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>{assumptionId}</code></>}
                    </div>
                </div>
                <div>
                    <div className={activeStepIndex >= 2 ? "status-chip" : "status-chip muted"}>
                        {statusLabel(activeStepIndex)}
                    </div>
                    <div className="status-sub">Step {Math.min(activeStepIndex + 1, TRACKER_STEPS.length)} of {TRACKER_STEPS.length}</div>
                </div>
            </div>

            {/* ── Tracker bar ─────────────────────────────────────── */}
            <div className="at2-tracker-bar">
                {TRACKER_STEPS.map((step, idx) => {
                    const state = idx < activeStepIndex ? "done" : idx === activeStepIndex ? "active" : "pending"
                    return (
                        <div key={step.label} className={`at2-tr-step ${state}`}>
                            <div className="st-n">{idx + 1}</div>
                            <div className="st-t">{step.label}</div>
                            <div className="st-date">{step.hint}</div>
                        </div>
                    )
                })}
            </div>

            {/* ── Method picker ───────────────────────────────────── */}
            <div className="at2-sec-h">Test method</div>
            <div className="at2-method-grid" role="radiogroup" aria-label="Test method">
                {METHODS.map((m) => {
                    const active = method === m.id
                    return (
                        <button
                            key={m.id}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            className={`at2-method-btn${active ? " active" : ""}`}
                            onClick={() => setMethod(m.id)}
                        >
                            <span className="m-name">{m.name}</span>
                            <span className="m-desc">{m.desc}</span>
                        </button>
                    )
                })}
            </div>

            {/* ── Test design grid ────────────────────────────────── */}
            <div className="at2-sec-h">Test design</div>
            <div className="at2-test-grid">
                <div className="at2-card">
                    <h3>What we&apos;re actually testing</h3>
                    <p style={{ color: "var(--a-fg-muted)" }}>
                        Name the specific decision the test will settle. &ldquo;Will they like it?&rdquo; is not a test — &ldquo;Will they pay £X and who signs off?&rdquo; is.
                    </p>
                    <textarea
                        className="at2-textarea"
                        placeholder="Not: whether they like it (they will). But: whether they&apos;ll commit at the declared price, and who the real decision-maker is."
                        value={whatTesting}
                        onChange={(e) => setWhatTesting(e.target.value)}
                    />
                </div>
                <div className="at2-card">
                    <h3>Method · how you&apos;ll run it</h3>
                    <p style={{ color: "var(--a-fg-muted)" }}>
                        Write the steps in order. Specific numbers beat adjectives — price ladder, commitment ask, deposit %.
                    </p>
                    <textarea
                        className="at2-textarea"
                        placeholder="1. Demo · how long, where&#10;2. Price-ladder reveal · what prices&#10;3. Commitment ask · what deposit, what timeline&#10;4. Record intermediaries · who else needs to agree"
                        value={howTesting}
                        onChange={(e) => setHowTesting(e.target.value)}
                    />
                </div>
            </div>

            {/* ── Criteria ────────────────────────────────────────── */}
            <div className="at2-sec-h">Success / failure criteria</div>
            <div className="at2-crit-grid">
                <div className="at2-crit-card pass">
                    <h3>Validated if…</h3>
                    <textarea
                        className="at2-textarea"
                        placeholder={"Specific, named thresholds. Example:\n• ≥3 of 5 commit at £X without prompting for discount\n• ≥2 put down a 10% non-refundable deposit within 14 days\n• Median named WTP is ≥£Y"}
                        value={successCriteria}
                        onChange={(e) => setSuccessCriteria(e.target.value)}
                    />
                </div>
                <div className="at2-crit-card fail">
                    <h3>Invalidated if…</h3>
                    <textarea
                        className="at2-textarea"
                        placeholder={"The observations that would kill this hypothesis. Example:\n• ≥3 of 5 anchor below £Z\n• 0 of 5 put down a deposit\n• Decision-maker routes through a slow procurement cycle"}
                        value={failureCriteria}
                        onChange={(e) => setFailureCriteria(e.target.value)}
                    />
                </div>
            </div>

            {/* ── Verdict picker ──────────────────────────────────── */}
            <div className="at2-sec-h">Pre-committed verdict <span className="sub">· record the outcome after the test runs</span></div>
            <div className="at2-verdict-grid" role="radiogroup" aria-label="Verdict">
                <VerdictButton id="validated" active={verdict} onChange={setVerdict} label="Validated" tone="pass" />
                <VerdictButton id="mixed" active={verdict} onChange={setVerdict} label="Mixed" tone="mixed" />
                <VerdictButton id="invalidated" active={verdict} onChange={setVerdict} label="Invalidated" tone="fail" />
            </div>

            {/* ── Results placeholder ─────────────────────────────── */}
            <div className="at2-sec-h">Results <span className="sub">· populated once the test runs</span></div>
            <div className="at2-results-placeholder">
                <h3>Awaiting test data</h3>
                <p>Recipients, transcripts, and outcomes will populate here after you run the test.</p>
                <p style={{ marginTop: 10, fontSize: 12 }}>Expected format: one row per recipient · named outcome · linked transcript · intermediary pattern.</p>
            </div>

            {/* ── Save row (disabled — persistence ships next round) */}
            <div className="at2-save-row">
                <span className="at2-save-hint">Assumption persistence ships with the validation store (next round).</span>
                <button type="button" className="at2-btn" disabled aria-disabled="true">Save draft</button>
                <button type="button" className="at2-btn primary" disabled aria-disabled="true">Lock test design</button>
            </div>
        </div>
    )
}

// ─── Subcomponents ─────────────────────────────────────────────────────

function VerdictButton({
    id,
    active,
    onChange,
    label,
    tone,
}: {
    id: AssumptionVerdict
    active: AssumptionVerdict | null
    onChange: (v: AssumptionVerdict) => void
    label: string
    tone: "pass" | "mixed" | "fail"
}): React.ReactElement {
    const isActive = active === id
    return (
        <button
            type="button"
            role="radio"
            aria-checked={isActive}
            className={`at2-verdict-btn${isActive ? ` active ${tone}` : ""}`}
            onClick={() => onChange(id)}
        >
            {label}
        </button>
    )
}

// ─── Helpers ───────────────────────────────────────────────────────────

function computeActiveStep(state: {
    hypothesis: string
    method: AssumptionTestMethod | null
    whatTesting: string
    howTesting: string
    successCriteria: string
    failureCriteria: string
    verdict: AssumptionVerdict | null
}): number {
    // 0 Logged (always true since the page exists)
    // 1 Hypothesis written
    // 2 Test designed (method + what + how + both criteria)
    // 3 Recipients booked (no UI yet; skipped)
    // 4 Test run (no UI yet; skipped)
    // 5 Decision (verdict picked)
    if (state.verdict !== null) return 5
    const hasDesign = state.method !== null
        && state.whatTesting.trim().length > 0
        && state.howTesting.trim().length > 0
        && state.successCriteria.trim().length > 0
        && state.failureCriteria.trim().length > 0
    if (hasDesign) return 2
    if (state.hypothesis.trim().length > 0) return 1
    return 0
}

function statusLabel(stepIdx: number): string {
    switch (stepIdx) {
        case 0: return "Not started"
        case 1: return "Writing hypothesis"
        case 2: return "Designing test"
        case 3: return "Booking recipients"
        case 4: return "Running test"
        case 5: return "Decision recorded"
        default: return "Not started"
    }
}
