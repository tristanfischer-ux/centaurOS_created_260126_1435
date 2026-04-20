/**
 * InterviewCreateView — "Log an interview" form page (V2, mockup-faithful).
 *
 * Port of FORGE-MOCKUP-INTERVIEW-CREATE.html. Scoped CSS under `.ic2` keeps
 * the styling isolated. The atomic unit is the quote — one person, one quote,
 * tagged. There is no `customer_interviews` / `interviews` table in the live
 * schema yet, so nothing persists: the form is fully interactive (interviewee
 * identity, segment, date, verbatim quote, notes, tag chips + blocker
 * banner), but the primary Save button is disabled with a tooltip pointing
 * at the next migration.
 *
 * Empty-state policy: we don't fabricate mockup-specific interviewee history
 * (Priya Shah / Jae-woo Kim / Anja Köhler / etc. from the mockup reference
 * only a single Tristan-authored demo hypothesis). Instead the right-hand
 * "Interviews on this hypothesis" card renders a generic template
 * interview-question list for hardware startups — honest content in the
 * same slot so structure and spacing match the mockup.
 *
 * Sections (top to bottom, per mockup reading order):
 *   1. Breadcrumb
 *   2. Page header — title + sub
 *   3. Grid: LEFT (form card) · RIGHT (context sidebar)
 *        LEFT:    Interviewee name + anon toggle
 *                 Role / company (paired)
 *                 Segment select
 *                 Interview date
 *                 Quote (verbatim, textarea)
 *                 Notes (textarea, optional)
 *                 Tag chip row + blocker banner (conditional)
 *                 Actions — Cancel · Save & log another · Save (disabled)
 *                 Actions helper copy
 *        RIGHT:   "Logging against" — project context card
 *                 "Interviews on this hypothesis" — template question list
 *                 "What makes a useful interview quote?" — help list
 *   4. Page foot — evidence-not-task note
 */

"use client"

import Link from "next/link"
import { useState } from "react"
import "./interview-create-v2.css"

// ─── Types ──────────────────────────────────────────────────────────────

type Tag =
    | "must-have"
    | "nice-to-have"
    | "#blocker"
    | "#willing-to-pay"
    | "#price-sensitive"
    | "#churn-risk"
    | "#champion"
    | "#compete-wins"

type ChipTone = "neutral" | "danger" | "success" | "warning" | "info"

export interface InterviewCreateViewProps {
    project: {
        id: string
        name: string
    }
}

// ─── Constants ──────────────────────────────────────────────────────────

/**
 * Tag palette — mockup pairs certain tags to colour tones when selected.
 * Tones mirror the mockup's `.chip.on.neutral|danger|success|warning|info`
 * classes, and the order matches the mockup's left-to-right chip row.
 */
const TAG_CHIPS: Array<{ key: Tag; label: string; tone: ChipTone }> = [
    { key: "must-have", label: "must-have", tone: "neutral" },
    { key: "nice-to-have", label: "nice-to-have", tone: "neutral" },
    { key: "#blocker", label: "#blocker", tone: "danger" },
    { key: "#willing-to-pay", label: "#willing-to-pay", tone: "success" },
    { key: "#price-sensitive", label: "#price-sensitive", tone: "warning" },
    { key: "#churn-risk", label: "#churn-risk", tone: "danger" },
    { key: "#champion", label: "#champion", tone: "info" },
    { key: "#compete-wins", label: "#compete-wins", tone: "success" },
]

/**
 * Generic interview-question prompts for hardware startups. Replaces the
 * mockup's invented interviewee-history rows (Priya Shah / Jae-woo Kim /
 * etc.) because fabricating those into production would read as fake per
 * the empty-state policy. Same visual slot, honest content.
 */
const TEMPLATE_QUESTIONS: Array<{ n: string; r: string }> = [
    {
        n: "Walk me through the last time this problem cost you something.",
        r: "Opens with a concrete, recent story — not a hypothetical.",
    },
    {
        n: "What have you already tried? What did you hate about it?",
        r: "Surfaces competitive alternatives and the sharpest pain.",
    },
    {
        n: "If this was solved tomorrow, what would you do with the time or money you got back?",
        r: "Tests whether the pain is worth paying for.",
    },
    {
        n: "Who else on your team is affected by this?",
        r: "Maps the buying committee — champions, blockers, budget holders.",
    },
    {
        n: "What would need to be true for you to pay £X for a tool that fixes this?",
        r: "Surfaces willingness-to-pay anchors and hidden dealbreakers.",
    },
]

// ─── View ───────────────────────────────────────────────────────────────

export function InterviewCreateView(
    props: InterviewCreateViewProps,
): React.ReactElement {
    const { project } = props
    const base = `/the-forge-v2/projects/${project.id}`

    // ── Form state (local only — no mutation wired) ─────────────────
    const [name, setName] = useState("")
    const [anonymous, setAnonymous] = useState(false)
    const [role, setRole] = useState("")
    const [company, setCompany] = useState("")
    const [segment, setSegment] = useState("")
    const [date, setDate] = useState("")
    const [quote, setQuote] = useState("")
    const [notes, setNotes] = useState("")
    const [tags, setTags] = useState<Set<Tag>>(new Set())
    const [customTag, setCustomTag] = useState("")

    const toggleTag = (key: Tag): void => {
        setTags((prev) => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })
    }

    const hasBlocker = tags.has("#blocker")

    return (
        <div className="ic2">
            {/* ── Breadcrumb ──────────────────────────── */}
            <nav className="ic2-breadcrumb" aria-label="Breadcrumb">
                <Link href="/the-forge-v2">Forge</Link>
                <span className="sep">›</span>
                <Link href={base}>{project.name}</Link>
                <span className="sep">›</span>
                <Link href={`${base}#validate`}>Validate</Link>
                <span className="sep">›</span>
                <span className="current">Log an interview</span>
            </nav>

            {/* ── Page header ─────────────────────────── */}
            <header className="ic2-page-head">
                <h1>Log an interview</h1>
                <p className="sub">
                    The atomic unit is the quote. One person. One quote. Tag it so Cal
                    can pull it into your synthesis ribbon and so investors see the
                    pattern.
                </p>
            </header>

            <div className="ic2-form-grid">
                {/* ═════ LEFT — FORM ══════════════════════ */}
                <form
                    className="ic2-form-card"
                    onSubmit={(e) => e.preventDefault()}
                >
                    {/* Interviewee name */}
                    <div className="ic2-field">
                        <label className="lbl" htmlFor="ic2-name">
                            Interviewee name<span className="req">*</span>
                        </label>
                        <input
                            id="ic2-name"
                            className="ic2-input"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Sarah Alvarez"
                        />
                        <label className="ic2-check-inline">
                            <input
                                type="checkbox"
                                checked={anonymous}
                                onChange={(e) => setAnonymous(e.target.checked)}
                            />{" "}
                            Keep anonymous
                        </label>
                        <div className="helper">
                            Anonymous interviews still count as evidence; we don&apos;t
                            surface the name in shared exports but do keep it for your
                            records.
                        </div>
                    </div>

                    {/* Role + company (paired) */}
                    <div className="ic2-field">
                        <div className="ic2-row-2">
                            <div>
                                <label className="lbl" htmlFor="ic2-role">
                                    Role
                                </label>
                                <input
                                    id="ic2-role"
                                    className="ic2-input"
                                    type="text"
                                    value={role}
                                    onChange={(e) => setRole(e.target.value)}
                                    placeholder="e.g. Community manager"
                                />
                            </div>
                            <div>
                                <label className="lbl" htmlFor="ic2-company">
                                    Company
                                </label>
                                <input
                                    id="ic2-company"
                                    className="ic2-input"
                                    type="text"
                                    value={company}
                                    onChange={(e) => setCompany(e.target.value)}
                                    placeholder="e.g. London Grow-Share"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Segment */}
                    <div className="ic2-field">
                        <label className="lbl" htmlFor="ic2-segment">
                            Segment
                        </label>
                        <select
                            id="ic2-segment"
                            className="ic2-select"
                            value={segment}
                            onChange={(e) => setSegment(e.target.value)}
                        >
                            <option value="">— pick a segment —</option>
                            <option value="early-adopter">
                                Early adopter / pilot buyer
                            </option>
                            <option value="mainstream-buyer">
                                Mainstream buyer
                            </option>
                            <option value="channel-partner">
                                Channel partner / distributor
                            </option>
                            <option value="other">Other</option>
                        </select>
                        <div className="helper">
                            Match to a segment from your Market tab if one fits — lets the
                            Action tab filter by segment. Segments wire in against real
                            market-sizing rows once the validate tables ship.
                        </div>
                    </div>

                    {/* Interview date */}
                    <div className="ic2-field">
                        <label className="lbl" htmlFor="ic2-date">
                            Interview date
                        </label>
                        <input
                            id="ic2-date"
                            className="ic2-input"
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            style={{ maxWidth: 200 }}
                        />
                    </div>

                    {/* Quote */}
                    <div className="ic2-field">
                        <label className="lbl" htmlFor="ic2-quote">
                            Quote<span className="req">*</span>
                            <span className="note">
                                minimum 20 characters · verbatim
                            </span>
                        </label>
                        <textarea
                            id="ic2-quote"
                            className="ic2-textarea quote"
                            value={quote}
                            onChange={(e) => setQuote(e.target.value)}
                            placeholder="Paste the single sharpest verbatim sentence from the interview. Not a summary — their words."
                        />
                    </div>

                    {/* Notes */}
                    <div className="ic2-field">
                        <label className="lbl" htmlFor="ic2-notes">
                            Notes<span className="note">optional</span>
                        </label>
                        <textarea
                            id="ic2-notes"
                            className="ic2-textarea"
                            rows={4}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Context around the quote. Who else was in the room, what was happening in their week, what you asked that provoked this answer."
                        />
                    </div>

                    {/* Tags + blocker banner */}
                    <div className="ic2-field">
                        <label className="lbl">
                            Tags
                            <span className="note">
                                Tagging with <code>#blocker</code> surfaces this on Today
                                for 7 days at high urgency.
                            </span>
                        </label>
                        <div className="ic2-chip-row">
                            {TAG_CHIPS.map((chip) => {
                                const on = tags.has(chip.key)
                                return (
                                    <button
                                        key={chip.key}
                                        type="button"
                                        className={`ic2-chip ${on ? `on ${chip.tone}` : ""}`}
                                        onClick={() => toggleTag(chip.key)}
                                        aria-pressed={on}
                                    >
                                        {chip.label}
                                        {on ? <span className="x">×</span> : null}
                                    </button>
                                )
                            })}
                            <input
                                className="ic2-chip-custom"
                                type="text"
                                value={customTag}
                                onChange={(e) => setCustomTag(e.target.value)}
                                placeholder="+ add tag"
                            />
                        </div>
                        {hasBlocker ? (
                            <div className="ic2-blocker-banner" role="status">
                                <span className="bb-ic" aria-hidden="true">
                                    ⚑
                                </span>
                                <div>
                                    <strong>Today signal will fire on save.</strong> This
                                    blocker will sit on your Today feed at high urgency
                                    for 7 days or until you close it with a response.
                                </div>
                            </div>
                        ) : null}
                    </div>

                    {/* Action bar */}
                    <div className="ic2-actions-bar">
                        <Link
                            href={`${base}#validate`}
                            className="ic2-btn ghost"
                        >
                            Cancel
                        </Link>
                        <span
                            className="ic2-btn secondary soon"
                            title="Interview persistence ships next round"
                            aria-disabled="true"
                        >
                            Save &amp; log another
                        </span>
                        <span
                            className="ic2-btn primary soon"
                            title="Interview persistence ships next round"
                            aria-disabled="true"
                        >
                            Save
                        </span>
                    </div>
                    <div className="ic2-actions-helper">
                        Saves to the Evidence tab once the interviews table ships.
                        Linked assumptions will update on next visit. You&apos;ll be
                        able to edit the quote later but the created_at stamp is locked.
                    </div>
                </form>

                {/* ═════ RIGHT — CONTEXT SIDEBAR ══════════ */}
                <aside className="ic2-ctx-wrap">
                    <div className="ic2-ctx-card">
                        <h4>Logging against</h4>
                        <div className="hyp-title">{project.name}</div>
                        <div className="hyp-meta">
                            Project · customer-validation evidence
                            <br />
                            <Link href={base}>Open project →</Link>
                        </div>
                    </div>

                    <div className="ic2-ctx-card">
                        <h4>Template interview questions</h4>
                        {TEMPLATE_QUESTIONS.map((q, idx) => (
                            <div key={idx} className="ic2-tq-row">
                                <span className="n">{q.n}</span>
                                <span className="r">{q.r}</span>
                            </div>
                        ))}
                    </div>

                    <div className="ic2-ctx-card">
                        <h4>What makes a useful interview quote?</h4>
                        <ul className="ic2-help-list">
                            <li>
                                <strong>One speaker.</strong> One person&apos;s words, not
                                a paraphrase of the room.
                            </li>
                            <li>
                                <strong>One sentence.</strong> Verbatim. Paste what they
                                actually said; keep the filler if it&apos;s part of the
                                meaning.
                            </li>
                            <li>
                                <strong>Tagged.</strong> Pick at least one tag so Cal can
                                thread this into the synthesis ribbon and the Action tab
                                can route it.
                            </li>
                        </ul>
                    </div>
                </aside>
            </div>

            <div className="ic2-page-foot">
                This is an evidence record. It&apos;s not a task. If you want to
                follow up with this person later, add a task from Today.
            </div>
        </div>
    )
}
