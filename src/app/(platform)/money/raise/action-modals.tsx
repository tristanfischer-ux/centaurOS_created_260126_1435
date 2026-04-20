/**
 * action-modals.tsx — inline modal components for the Raise surface.
 *
 * Three modals:
 *   1. PipelineMoveModal  — port of MONEY-MOCKUP-PIPELINE-MOVE.html
 *   2. PassInvestorModal  — port of MONEY-MOCKUP-PASS-INVESTOR.html
 *   3. LogTouchModal      — port of MONEY-MOCKUP-LOG-TOUCH.html
 *
 * These are UI scaffolds — the server-side wiring lives in a future
 * `money-raise.ts` action file. Each modal captures the fields the mockup
 * specifies, validates locally, and shows an honest "saving wires up with
 * the money-raise actions" state on submit.
 *
 * Used by: ../raise-view.tsx (bulk actions — none today) and
 * ./investors/[investorId]/investor-detail-view.tsx (per-investor actions).
 *
 * Scope of the parallel sub-agent run: these live inside /money/raise/ only.
 */

"use client"

import { useState } from "react"

// ─── Shared types ────────────────────────────────────────────────────────

export interface ModalInvestor {
    /** investor_pipeline_state.id */
    id: string
    displayName: string
    currentStage: string
}

export interface ActionModalBaseProps {
    investor: ModalInvestor
    onClose: () => void
}

// ─── Shared shell ────────────────────────────────────────────────────────

function ModalShell(props: {
    title: string
    subtitle: string
    onClose: () => void
    children: React.ReactNode
    footer: React.ReactNode
}): React.ReactElement {
    return (
        <div
            className="rse2-modal-shade"
            role="dialog"
            aria-modal="true"
            aria-label={props.title}
            onClick={(e) => {
                if (e.target === e.currentTarget) props.onClose()
            }}
        >
            <div className="rse2-modal">
                <div className="rse2-modal-head">
                    <div>
                        <h3>{props.title}</h3>
                        <p className="rse2-modal-sub">{props.subtitle}</p>
                    </div>
                    <button
                        type="button"
                        onClick={props.onClose}
                        className="rse2-btn sm"
                        aria-label="Close modal"
                    >
                        Close
                    </button>
                </div>
                <div className="rse2-modal-body">{props.children}</div>
                <div className="rse2-modal-foot">{props.footer}</div>
            </div>
        </div>
    )
}

// ─── 1. Pipeline move ────────────────────────────────────────────────────

const STAGES: ReadonlyArray<{ key: string; label: string }> = [
    { key: "target", label: "Target" },
    { key: "researching", label: "Researching" },
    { key: "contacted", label: "Contacted" },
    { key: "meeting", label: "Meeting" },
    { key: "due_diligence", label: "Due diligence" },
    { key: "verbal", label: "Verbal" },
    { key: "closed", label: "Closed" },
]

export function PipelineMoveModal(props: ActionModalBaseProps): React.ReactElement {
    const { investor, onClose } = props
    const [toStage, setToStage] = useState<string>("verbal")
    const [amount, setAmount] = useState<string>("")
    const [terms, setTerms] = useState<string>("safe_round")
    const [leadRole, setLeadRole] = useState<string>("undecided")
    const [conditions, setConditions] = useState<string>("")
    const [notes, setNotes] = useState<string>("")
    const [submitted, setSubmitted] = useState(false)

    const requiresCommit = toStage === "verbal" || toStage === "closed"

    return (
        <ModalShell
            title={`Move ${investor.displayName}`}
            subtitle={`Currently in ${stageLabel(investor.currentStage)}`}
            onClose={onClose}
            footer={
                <>
                    <button
                        type="button"
                        className="rse2-btn"
                        onClick={onClose}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="rse2-btn primary"
                        onClick={() => setSubmitted(true)}
                        disabled={
                            submitted ||
                            toStage === investor.currentStage ||
                            (requiresCommit && amount.trim().length === 0)
                        }
                    >
                        {submitted ? "Scaffolded — wire with money-raise" : "Save move"}
                    </button>
                </>
            }
        >
            <div className="rse2-modal-fld">
                <label htmlFor="rse2-move-to">Move to stage</label>
                <div className="rse2-target-grid">
                    {STAGES.map((s) => (
                        <button
                            type="button"
                            key={s.key}
                            className={`rse2-target-opt ${
                                toStage === s.key ? "chosen" : ""
                            } ${investor.currentStage === s.key ? "current" : ""}`}
                            disabled={investor.currentStage === s.key}
                            onClick={() => setToStage(s.key)}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
                <p className="rse2-hint">
                    Backward moves (to Passed) use the Pass flow — different capture
                    fields because the learning is the reason.
                </p>
            </div>

            {requiresCommit && (
                <>
                    <div className="rse2-modal-fld">
                        <label htmlFor="rse2-move-amount">
                            Committed amount <span className="req">*</span>
                        </label>
                        <input
                            id="rse2-move-amount"
                            type="text"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="£250,000"
                        />
                        <p className="rse2-hint">
                            Counts toward round progress immediately at
                            probability-weighted value.
                        </p>
                    </div>
                    <div className="rse2-modal-fld two">
                        <div>
                            <label htmlFor="rse2-move-terms">Proposed terms</label>
                            <select
                                id="rse2-move-terms"
                                value={terms}
                                onChange={(e) => setTerms(e.target.value)}
                            >
                                <option value="safe_round">SAFE at round cap</option>
                                <option value="safe_custom">SAFE · different cap</option>
                                <option value="priced">Priced equity</option>
                                <option value="other">Other (custom)</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="rse2-move-lead">Lead / follower</label>
                            <select
                                id="rse2-move-lead"
                                value={leadRole}
                                onChange={(e) => setLeadRole(e.target.value)}
                            >
                                <option value="lead">Lead</option>
                                <option value="co_lead">Co-lead</option>
                                <option value="follower">Follower</option>
                                <option value="undecided">Undecided</option>
                            </select>
                        </div>
                    </div>
                </>
            )}

            <div className="rse2-modal-fld">
                <label htmlFor="rse2-move-conditions">
                    Conditions / caveats{" "}
                    <span className="opt">Optional</span>
                </label>
                <textarea
                    id="rse2-move-conditions"
                    value={conditions}
                    onChange={(e) => setConditions(e.target.value)}
                    rows={3}
                    placeholder="e.g. contingent on sending the updated model by Tuesday"
                />
            </div>
            <div className="rse2-modal-fld">
                <label htmlFor="rse2-move-notes">
                    Notes <span className="opt">For your records</span>
                </label>
                <textarea
                    id="rse2-move-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                />
            </div>

            {submitted && (
                <div className="rse2-modal-info">
                    Saved locally — server-side persistence wires up when the
                    <code> money-raise.ts</code> server action file lands.
                </div>
            )}
        </ModalShell>
    )
}

// ─── 2. Pass investor ────────────────────────────────────────────────────

const PASS_REASONS: ReadonlyArray<{ key: string; label: string; hint: string }> = [
    {
        key: "too_early",
        label: "Too early for them",
        hint: "Stage fit wrong — wanted more traction / revenue",
    },
    {
        key: "wrong_thesis",
        label: "Wrong thesis",
        hint: "Sector / model doesn't match what they invest in",
    },
    {
        key: "silent",
        label: "Silent · no reply",
        hint: "No explicit pass — they stopped responding",
    },
    {
        key: "cheque_mismatch",
        label: "Cheque size mismatch",
        hint: "Our ask was too small / too big for their fund",
    },
    {
        key: "portfolio_conflict",
        label: "Portfolio conflict",
        hint: "Already invested in a competitor",
    },
    {
        key: "team_concerns",
        label: "Team concerns",
        hint: "Didn't see team fit",
    },
    {
        key: "unit_economics",
        label: "Unit economics / model",
        hint: "Didn't believe in the margins / path to profitability",
    },
    {
        key: "other",
        label: "Other / custom reason",
        hint: "None of the above fits",
    },
]

export function PassInvestorModal(props: ActionModalBaseProps): React.ReactElement {
    const { investor, onClose } = props
    const [reason, setReason] = useState<string | null>(null)
    const [narrative, setNarrative] = useState<string>("")
    const [warmth, setWarmth] = useState<string>("cold")
    const [revisit, setRevisit] = useState<string>("monthly_update")
    const [submitted, setSubmitted] = useState(false)

    return (
        <ModalShell
            title={`Mark ${investor.displayName} as passed`}
            subtitle="Capture the reason — it feeds the thesis engine."
            onClose={onClose}
            footer={
                <>
                    <button type="button" className="rse2-btn" onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="rse2-btn primary"
                        onClick={() => setSubmitted(true)}
                        disabled={submitted || reason === null}
                    >
                        {submitted
                            ? "Scaffolded — wire with money-raise"
                            : "Mark as passed"}
                    </button>
                </>
            }
        >
            <div className="rse2-modal-fld">
                <label>
                    Why did they pass? <span className="req">*</span>
                </label>
                <div className="rse2-reason-grid">
                    {PASS_REASONS.map((r) => (
                        <button
                            type="button"
                            key={r.key}
                            className={`rse2-reason-opt ${
                                reason === r.key ? "active" : ""
                            }`}
                            onClick={() => setReason(r.key)}
                        >
                            <div className="label">{r.label}</div>
                            <div className="hint">{r.hint}</div>
                        </button>
                    ))}
                </div>
            </div>

            <div className="rse2-modal-fld">
                <label htmlFor="rse2-pass-narrative">
                    How the pass happened{" "}
                    <span className="opt">For future pattern matching</span>
                </label>
                <textarea
                    id="rse2-pass-narrative"
                    value={narrative}
                    onChange={(e) => setNarrative(e.target.value)}
                    rows={4}
                />
            </div>

            <div className="rse2-modal-fld two">
                <div>
                    <label htmlFor="rse2-pass-warmth">Warmth at pass</label>
                    <select
                        id="rse2-pass-warmth"
                        value={warmth}
                        onChange={(e) => setWarmth(e.target.value)}
                    >
                        <option value="cold">Cold · hard pass</option>
                        <option value="lukewarm">Lukewarm · probably not</option>
                        <option value="timing">Warm but timing · try later</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="rse2-pass-revisit">Revisit in 6 months?</label>
                    <select
                        id="rse2-pass-revisit"
                        value={revisit}
                        onChange={(e) => setRevisit(e.target.value)}
                    >
                        <option value="monthly_update">
                            Yes — monthly update
                        </option>
                        <option value="close_seed">
                            Yes — when seed opens
                        </option>
                        <option value="archive">No — archive permanently</option>
                    </select>
                </div>
            </div>

            {submitted && (
                <div className="rse2-modal-info">
                    Saved locally — server-side persistence wires up when the
                    <code> money-raise.ts</code> server action file lands.
                </div>
            )}
        </ModalShell>
    )
}

// ─── 3. Log touch ────────────────────────────────────────────────────────

const TOUCH_TYPES: ReadonlyArray<{ key: string; label: string; sub: string }> = [
    { key: "email", label: "Email", sub: "Inbound / outbound" },
    { key: "meeting", label: "Meeting", sub: "Call / video / in-person" },
    { key: "linkedin", label: "LinkedIn", sub: "DM or interaction" },
    { key: "sms", label: "SMS / WhatsApp", sub: "Informal message" },
    { key: "conference", label: "Conference", sub: "Event · chat on floor" },
    { key: "other", label: "Other", sub: "Custom note" },
]

const OUTCOMES: ReadonlyArray<{ key: string; label: string; tone: string }> = [
    { key: "positive", label: "Positive · moving forward", tone: "pos" },
    { key: "more_info", label: "Neutral · more info requested", tone: "neu" },
    { key: "considering", label: "Neutral · they're considering", tone: "neu" },
    { key: "pass_fit", label: "Pass · wrong fit", tone: "neg" },
    { key: "pass_timing", label: "Pass · timing", tone: "neg" },
    { key: "pass_silent", label: "Pass · no reason given", tone: "neg" },
]

export function LogTouchModal(props: ActionModalBaseProps): React.ReactElement {
    const { investor, onClose } = props
    const [touchType, setTouchType] = useState<string>("meeting")
    const [dateStr, setDateStr] = useState<string>(
        new Date().toISOString().slice(0, 10),
    )
    const [duration, setDuration] = useState<string>("45")
    const [outcome, setOutcome] = useState<string>("more_info")
    const [asks, setAsks] = useState<string>("")
    const [notes, setNotes] = useState<string>("")
    const [keyQuote, setKeyQuote] = useState<string>("")
    const [submitted, setSubmitted] = useState(false)

    const showDuration = touchType === "meeting" || touchType === "conference"

    return (
        <ModalShell
            title={`Log a touch with ${investor.displayName}`}
            subtitle="Every interaction lives on the relationship timeline and feeds Fiona's next pre-brief."
            onClose={onClose}
            footer={
                <>
                    <button type="button" className="rse2-btn" onClick={onClose}>
                        Discard
                    </button>
                    <button
                        type="button"
                        className="rse2-btn primary"
                        onClick={() => setSubmitted(true)}
                        disabled={submitted || notes.trim().length === 0}
                    >
                        {submitted
                            ? "Scaffolded — wire with money-raise"
                            : "Save touch"}
                    </button>
                </>
            }
        >
            <div className="rse2-modal-fld">
                <label>Type</label>
                <div className="rse2-type-grid">
                    {TOUCH_TYPES.map((t) => (
                        <button
                            type="button"
                            key={t.key}
                            className={`rse2-type-opt ${
                                touchType === t.key ? "active" : ""
                            }`}
                            onClick={() => setTouchType(t.key)}
                        >
                            <div className="label">{t.label}</div>
                            <div className="sub">{t.sub}</div>
                        </button>
                    ))}
                </div>
            </div>

            <div className={`rse2-modal-fld ${showDuration ? "three" : "two"}`}>
                <div>
                    <label htmlFor="rse2-touch-date">
                        Date <span className="req">*</span>
                    </label>
                    <input
                        id="rse2-touch-date"
                        type="date"
                        value={dateStr}
                        onChange={(e) => setDateStr(e.target.value)}
                    />
                </div>
                {showDuration && (
                    <div>
                        <label htmlFor="rse2-touch-duration">Duration (min)</label>
                        <select
                            id="rse2-touch-duration"
                            value={duration}
                            onChange={(e) => setDuration(e.target.value)}
                        >
                            <option value="30">30 min</option>
                            <option value="45">45 min</option>
                            <option value="60">60 min</option>
                            <option value="90">90 min</option>
                        </select>
                    </div>
                )}
                <div>
                    <label htmlFor="rse2-touch-outcome">Outcome</label>
                    <select
                        id="rse2-touch-outcome"
                        value={outcome}
                        onChange={(e) => setOutcome(e.target.value)}
                    >
                        {OUTCOMES.map((o) => (
                            <option key={o.key} value={o.key}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="rse2-modal-fld">
                <label htmlFor="rse2-touch-notes">
                    Notes <span className="req">*</span>
                </label>
                <textarea
                    id="rse2-touch-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={5}
                    placeholder="What happened, what was said, what they care about."
                />
            </div>

            <div className="rse2-modal-fld">
                <label htmlFor="rse2-touch-asks">
                    What they asked for{" "}
                    <span className="opt">One per line · each becomes a task</span>
                </label>
                <textarea
                    id="rse2-touch-asks"
                    value={asks}
                    onChange={(e) => setAsks(e.target.value)}
                    rows={3}
                    placeholder="Updated financial model&#10;Customer reference call&#10;Warm intro to …"
                />
            </div>

            <div className="rse2-modal-fld">
                <label htmlFor="rse2-touch-quote">
                    Key quote <span className="opt">One-liner for later</span>
                </label>
                <input
                    id="rse2-touch-quote"
                    type="text"
                    value={keyQuote}
                    onChange={(e) => setKeyQuote(e.target.value)}
                    placeholder="'We'd be disappointed if we weren't at the top of your list when you decide.'"
                />
            </div>

            {submitted && (
                <div className="rse2-modal-info">
                    Saved locally — server-side persistence wires up when the
                    <code> money-raise.ts</code> server action file lands.
                </div>
            )}
        </ModalShell>
    )
}

// ─── Helpers ────────────────────────────────────────────────────────────

function stageLabel(stage: string): string {
    const found = STAGES.find((s) => s.key === stage)
    if (found) return found.label
    if (stage === "passed") return "Passed"
    return stage
}
