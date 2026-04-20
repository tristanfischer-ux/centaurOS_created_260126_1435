/**
 * HypothesisCreateView — "New hypothesis" form page (V2, mockup-faithful).
 *
 * Port of FORGE-MOCKUP-HYPOTHESIS-CREATE.html. Scoped CSS under `.hc2` keeps
 * the styling isolated. No `hypotheses` table exists yet, so nothing persists:
 * the form is fully interactive (If/Then/Because grammar, live one-liner
 * preview, customer segment, traction explainer), but the primary Submit is
 * disabled with a tooltip pointing at the validation store.
 *
 * Empty-state: form starts blank (no HAPS-specific pre-fill). A right-rail
 * examples card shows 3 generic If/Then/Because templates so a founder seeing
 * the page for the first time knows the shape of a good hypothesis.
 *
 * Sections (top to bottom):
 *   1. Context chips (links back to project + risks)
 *   2. Breadcrumb
 *   3. Hero header — kicker + title + sub
 *   4. Annotation note (RT4 grammar lock)
 *   5. Grid: LEFT (form card + actions) · RIGHT (examples aside)
 *        LEFT:  If / Then / Because (required, min 10 chars) + live preview
 *               + Customer segment (optional) + Traction explainer (optional)
 *               + Actions row (Cancel · Save draft (soon) · Create (disabled))
 *               + Info banner
 *        RIGHT: Examples card — 3 generic hypothesis templates + foot note
 *   6. Trailing context chips
 */

"use client"

import Link from "next/link"
import { useState } from "react"
import "./hypothesis-create-v2.css"

// ─── Types ──────────────────────────────────────────────────────────────

export interface HypothesisCreateViewProps {
    project: {
        id: string
        name: string
    }
}

// ─── Constants ──────────────────────────────────────────────────────────

const MIN_CHARS = 10

/**
 * Generic hypothesis templates for the right-rail examples card. Kept
 * deliberately non-HAPS-specific so the empty-state is useful to any founder
 * hitting this page on day one.
 */
const EXAMPLES: Array<{ iff: string; then: string; because: string }> = [
    {
        iff: "we add a free 14-day self-serve tier to the existing paid plan",
        then: "weekly activations lift ≥ 30% and paid conversion holds above 5%",
        because: "3 user interviews said pricing is the last blocker, not feature fit",
    },
    {
        iff: "we replace the quote form with a live-price configurator",
        then: "quote-to-order conversion moves from 11% to 18% within one quarter",
        because: "a competitor launched the same flow and their CAC dropped visibly in public filings",
    },
    {
        iff: "we partner with one distributor in Germany for the entry product",
        then: "we reach £120k ARR in EU within 6 months without a local hire",
        because: "the distributor already stocks adjacent categories into the same buying teams",
    },
]

// ─── Helpers ────────────────────────────────────────────────────────────

/** Truncate a long side of the one-liner preview to 140 chars, mockup-faithful. */
function truncate(value: string, max = 140): string {
    if (value.length <= max) return value
    return `${value.slice(0, max - 1).trimEnd()}…`
}

// ─── View ───────────────────────────────────────────────────────────────

export function HypothesisCreateView(props: HypothesisCreateViewProps): React.ReactElement {
    const { project } = props
    const base = `/the-forge-v2/projects/${project.id}`

    // ── Form state (local only — no mutation wired) ─────────────────────
    const [ifChange, setIfChange] = useState("")
    const [thenImpact, setThenImpact] = useState("")
    const [becauseAssumption, setBecauseAssumption] = useState("")
    const [customerSegment, setCustomerSegment] = useState("")
    const [segmentPick, setSegmentPick] = useState("")
    const [tractionExplainer, setTractionExplainer] = useState("")

    const ifLen = ifChange.length
    const thenLen = thenImpact.length
    const becauseLen = becauseAssumption.length

    const ifMet = ifLen >= MIN_CHARS
    const thenMet = thenLen >= MIN_CHARS
    const becauseMet = becauseLen >= MIN_CHARS
    const allMet = ifMet && thenMet && becauseMet

    // Identify the blocking field for the disabled-submit helper text.
    let blockerLabel: "If" | "Then" | "Because" | null = null
    let blockerLen = 0
    if (!ifMet) {
        blockerLabel = "If"
        blockerLen = ifLen
    } else if (!thenMet) {
        blockerLabel = "Then"
        blockerLen = thenLen
    } else if (!becauseMet) {
        blockerLabel = "Because"
        blockerLen = becauseLen
    }

    return (
        <div className="hc2">
            {/* ── Top context chips ───────────────────── */}
            <div className="hc2-ctx-chips">
                <Link href={base}>← {project.name} (project)</Link>
                <Link href={`${base}/risks`}>Risks</Link>
                <Link href={`${base}/brief`}>Brief</Link>
            </div>

            {/* ── Breadcrumb ──────────────────────────── */}
            <div className="hc2-breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <Link href={base}>{project.name}</Link>
                <span className="sep">›</span>
                <span className="current">New hypothesis</span>
            </div>

            {/* ── Hero header ─────────────────────────── */}
            <div className="hc2-hero-head">
                <div className="kicker">Net-new hypothesis · 3 fields</div>
                <h1>New hypothesis</h1>
                <div className="sub">
                    Start a testable proposition. Three fields. Ten seconds of thought each.
                </div>
            </div>

            <div className="hc2-page-annot">
                <strong>Grammar lock</strong>
                Form enforces <code>If / Then / Because</code> grammar in three separate required text
                columns. Each min 10 characters. The cached one-liner used on list views is derived from
                the If and Then fields — you don&apos;t write it.
            </div>

            <div className="hc2-grid">
                {/* ═════ LEFT — FORM ═══════════════════ */}
                <div>
                    <div className="hc2-form-card">
                        {/* Field 1 — If */}
                        <div className={`hc2-field ${!ifMet && ifLen > 0 ? "has-error" : ""}`}>
                            <div className="hc2-field-head">
                                <label className="hc2-field-label" htmlFor="if_change">
                                    <span className="grammar-chip">If</span>
                                    The change<span className="req">*</span>
                                    {ifMet && <span className="met-tick" aria-hidden="true">✓</span>}
                                </label>
                                <span
                                    className={`hc2-char-count ${ifMet ? "met" : ifLen > 0 ? "error" : ""}`}
                                >
                                    {ifLen} / min {MIN_CHARS} chars
                                </span>
                            </div>
                            <textarea
                                id="if_change"
                                name="if_change"
                                placeholder="If we launch a free self-serve tier for solo founders…"
                                aria-required="true"
                                value={ifChange}
                                onChange={(e) => setIfChange(e.target.value)}
                            />
                            {!ifMet && ifLen > 0 && (
                                <div className="hc2-error-line">
                                    Needs at least {MIN_CHARS} characters. Describe the change you&apos;re proposing.
                                </div>
                            )}
                            <div className="hc2-helper">
                                <strong>The change you&apos;re proposing.</strong> A product, price, channel,
                                feature.
                            </div>
                        </div>

                        {/* Field 2 — Then */}
                        <div className={`hc2-field ${!thenMet && thenLen > 0 ? "has-error" : ""}`}>
                            <div className="hc2-field-head">
                                <label className="hc2-field-label" htmlFor="then_impact">
                                    <span className="grammar-chip">Then</span>
                                    The impact<span className="req">*</span>
                                    {thenMet && <span className="met-tick" aria-hidden="true">✓</span>}
                                </label>
                                <span
                                    className={`hc2-char-count ${thenMet ? "met" : thenLen > 0 ? "error" : ""}`}
                                >
                                    {thenLen} / min {MIN_CHARS} chars
                                </span>
                            </div>
                            <textarea
                                id="then_impact"
                                name="then_impact"
                                placeholder="Then weekly activations lift 30% and paid conversion holds above 5%."
                                aria-required="true"
                                value={thenImpact}
                                onChange={(e) => setThenImpact(e.target.value)}
                            />
                            {!thenMet && thenLen > 0 && (
                                <div className="hc2-error-line">
                                    Needs at least {MIN_CHARS} characters. Name the measurable impact.
                                </div>
                            )}
                            <div className="hc2-helper">
                                <strong>The measurable impact if the change works.</strong>
                            </div>
                        </div>

                        {/* Field 3 — Because */}
                        <div
                            className={`hc2-field ${
                                !becauseMet && becauseLen > 0 ? "has-error" : ""
                            }`}
                        >
                            <div className="hc2-field-head">
                                <label className="hc2-field-label" htmlFor="because_assumption">
                                    <span className="grammar-chip">Because</span>
                                    The assumption<span className="req">*</span>
                                    {becauseMet && <span className="met-tick" aria-hidden="true">✓</span>}
                                </label>
                                <span
                                    className={`hc2-char-count ${
                                        becauseMet ? "met" : becauseLen > 0 ? "error" : ""
                                    }`}
                                >
                                    {becauseLen} / min {MIN_CHARS} chars
                                </span>
                            </div>
                            <textarea
                                id="because_assumption"
                                name="because_assumption"
                                placeholder="Because 3 interviews confirmed pricing is the last blocker, not feature fit."
                                aria-required="true"
                                value={becauseAssumption}
                                onChange={(e) => setBecauseAssumption(e.target.value)}
                            />
                            {!becauseMet && becauseLen > 0 && (
                                <div className="hc2-error-line">
                                    Needs at least {MIN_CHARS} characters. Name the riskiest assumption — the
                                    thing that could be wrong.
                                </div>
                            )}
                            <div className="hc2-helper">
                                <strong>The assumption you&apos;re testing.</strong> This is the riskiest bit
                                — name the thing that could be wrong.
                            </div>
                        </div>

                        {/* Live preview of cached one-liner */}
                        <div className="hc2-preview-card" aria-live="polite">
                            <div className="prev-label">Preview · cached one-liner for list view</div>
                            <div className="prev-body">
                                &quot;If{" "}
                                {ifChange ? (
                                    <span className="prev-filled">{truncate(ifChange)}</span>
                                ) : (
                                    <span className="prev-placeholder">[change]</span>
                                )}
                                , then{" "}
                                {thenImpact ? (
                                    <span className="prev-filled">{truncate(thenImpact)}</span>
                                ) : (
                                    <span className="prev-placeholder">[impact]</span>
                                )}
                                &quot;
                            </div>
                            <div className="prev-note">
                                Updates live as you type. Truncated to 140 chars per side. Will land in the
                                validation store once persistence ships.
                            </div>
                        </div>

                        {/* Optional row: customer segment */}
                        <div className="hc2-opt-row">
                            <div className="hc2-field-head">
                                <label className="hc2-field-label" htmlFor="customer_segment">
                                    Customer segment
                                    <span className="opt-badge">Optional</span>
                                </label>
                                <span className="hc2-char-count">Pick one or type your own</span>
                            </div>
                            <div className="segment-row">
                                <input
                                    type="text"
                                    id="customer_segment"
                                    name="customer_segment"
                                    placeholder="e.g. Solo founders running pre-seed hardware startups"
                                    value={customerSegment}
                                    onChange={(e) => setCustomerSegment(e.target.value)}
                                />
                                <select
                                    id="segment_pick"
                                    name="segment_pick"
                                    aria-label="Pick a common segment"
                                    value={segmentPick}
                                    onChange={(e) => setSegmentPick(e.target.value)}
                                >
                                    <option value="">— pick a common segment —</option>
                                    <option>Solo founders</option>
                                    <option>Small teams (2–10)</option>
                                    <option>Growth-stage operators</option>
                                    <option>Enterprise buyers</option>
                                    <option>Distributors / resellers</option>
                                    <option>Other</option>
                                </select>
                            </div>
                            <div className="hc2-helper">
                                Primary cohort you&apos;re targeting. You can refine this once you&apos;ve
                                logged 2–3 customer interviews.
                            </div>
                        </div>

                        {/* Optional row: traction explainer */}
                        <div className="hc2-opt-row">
                            <div className="hc2-field-head">
                                <label className="hc2-field-label" htmlFor="traction_explainer">
                                    Traction explainer
                                    <span className="opt-badge">Optional</span>
                                </label>
                                <span className="hc2-char-count">Shown to investors</span>
                            </div>
                            <textarea
                                id="traction_explainer"
                                name="traction_explainer"
                                placeholder="If LOIs don't exist yet, describe why the hypothesis is still worth testing — early evidence, interviews, adjacent data."
                                value={tractionExplainer}
                                onChange={(e) => setTractionExplainer(e.target.value)}
                            />
                            <div className="hc2-helper">
                                If signed LOIs don&apos;t exist yet, describe why the hypothesis is still
                                worth testing. Shown to investors alongside early evidence.
                            </div>
                        </div>
                    </div>

                    {/* Actions row */}
                    <div className="hc2-actions-card">
                        <div className="hc2-actions-row">
                            <div className="hc2-actions-left">
                                <Link href={base} className="hc2-btn ghost">
                                    Cancel
                                </Link>
                            </div>
                            <div className="hc2-actions-right">
                                <span
                                    className="hc2-btn ghost disabled"
                                    title="Draft saving ships with the validation store"
                                    aria-disabled="true"
                                >
                                    Save as draft
                                </span>
                                <div className="hc2-primary-wrap">
                                    <button
                                        type="button"
                                        className="hc2-btn primary lg disabled"
                                        disabled
                                        aria-disabled="true"
                                        aria-describedby="hc2-submit-hint"
                                        title="Hypothesis persistence ships with the validation store"
                                    >
                                        Create hypothesis &amp; seed assumptions
                                    </button>
                                    <span
                                        id="hc2-submit-hint"
                                        className={`primary-helper ${!allMet ? "err" : ""}`}
                                    >
                                        {blockerLabel ? (
                                            <>
                                                Disabled — <code>{blockerLabel}</code> field is too short (
                                                {blockerLen} / {MIN_CHARS} chars min). Fix the field to
                                                enable.
                                            </>
                                        ) : (
                                            <>
                                                Hypothesis persistence ships with the validation store.
                                            </>
                                        )}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="hc2-info-banner">
                            <div>
                                <strong>After creation</strong> you can add interviews, LOIs, and market
                                sizing from the Hypothesis tabs. You can&apos;t promote to The Forge until
                                at least 3 readiness items are closed.
                            </div>
                        </div>
                    </div>
                </div>

                {/* ═════ RIGHT — EXAMPLES ═════════════ */}
                <aside className="hc2-aside">
                    <div className="hc2-examples-card">
                        <h3>
                            <span className="hdot" aria-hidden="true" />
                            Examples
                        </h3>
                        <div className="subhead">
                            Three generic templates. Copy the shape — a product, a measurable outcome, a
                            risky assumption named out loud.
                        </div>

                        {EXAMPLES.map((ex, idx) => (
                            <div key={idx} className="hc2-example">
                                <div className="ex-line">
                                    <span className="ex-grammar ig">If</span>
                                    {ex.iff}
                                </div>
                                <div className="ex-line">
                                    <span className="ex-grammar tg">Then</span>
                                    {ex.then}
                                </div>
                                <div className="ex-line">
                                    <span className="ex-grammar bg">Because</span>
                                    {ex.because}
                                </div>
                            </div>
                        ))}

                        <div className="hc2-examples-foot">
                            Templates don&apos;t pre-fill the form — they&apos;re here so you see the shape
                            before writing your own. A good hypothesis names the change, the measurable
                            outcome, and the one assumption that could be wrong.
                        </div>
                    </div>
                </aside>
            </div>

            {/* ── Trailing context chips ──────────────── */}
            <div className="hc2-ctx-chips" style={{ marginTop: 24 }}>
                <Link href={base}>Back to {project.name}</Link>
                <Link href={`${base}/risks`}>Risks</Link>
                <Link href={`${base}/brief`}>Project brief</Link>
            </div>
        </div>
    )
}
