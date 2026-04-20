/**
 * UpdateSendView — /money/updates/send (V2, mockup-faithful PREVIEW).
 *
 * DOM ported from MONEY-MOCKUP-UPDATE-SEND.html. Scoped to `.upd2`.
 * Mirrors the "preview before send" flow for a monthly investor update — a
 * founder drafts subject / headline / body in the editor, then sees what
 * recipients will see plus send settings, schedule, recipients list.
 *
 * Preview contract (V1):
 *   - Editor boots EMPTY. No mockup specifics are rendered as seed content
 *     (no Nimbus / NimFarm / Henry Lane Fox / Octopus investor names / KPI
 *     numbers). The founder sees blank fields and honest "no draft yet"
 *     empty states.
 *   - Subject, headline, and body persist to `localStorage` under
 *     `money-v2:update-send:draft` so nothing is lost between visits.
 *   - Recipients rail renders an honest empty-state message — the live
 *     pipeline → recipient resolution lands with the outbound-delivery
 *     mutation next round. No fake recipient rows.
 *   - Send / Schedule / Test-send buttons fire a toast with an honest
 *     "Outbound delivery wires up next round — your draft is saved
 *     locally" message. No email is sent.
 *   - Schedule picker is visual-only (Send now / Tue 10am / Custom pills)
 *     and state travels with the locally-saved draft.
 *
 * Banned mockup specifics we do NOT render:
 *   - Tristan Fischer · tristan@nimbus.ag From line (real sender populates
 *     from auth context once delivery wires — preview shows "Your name" +
 *     a "sender wires on delivery" pill).
 *   - 14 recipients count + stage pills (DD / Closed / Meeting / Auto) —
 *     pipeline → recipient query doesn't exist yet.
 *   - Pre-populated headline / KPI card / traction bullets / ask — all
 *     per-founder fabricated. The founder types their own when drafting.
 *
 * Copy voice: first-person, British spelling ("programme", "organisation",
 * "optimise"), no "AI" framing. Orange title-dot per ForgeOS V2 spec.
 */

"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import "./update-send-v2.css"

// ─── Local draft persistence ───────────────────────────────────────────
//
// DECISION: persist the draft to localStorage so the founder doesn't lose
// the message when they tab away. Server-side `investor_update` table is
// the proper home once the Phase-2 migrations + outbound delivery land
// (per MONEY-SCHEMA §investor_update). Until then, localStorage is the
// only honest way to say "Save draft" and mean it.
const DRAFT_STORAGE_KEY = "money-v2:update-send:draft"

type SchedulePick = "now" | "tue_10" | "custom"

interface PersistedDraft {
    subject: string
    headline: string
    body: string
    schedule: SchedulePick
    savedAt: string
}

export interface UpdateSendViewProps {
    /** Signed-in user's display name — seeds the From row preview. */
    senderName: string | null
    /** Signed-in user's email — shown as the intended sender in the preview. */
    senderEmail: string | null
    /** Foundry display name — seeds the email footer. Null means "your foundry". */
    foundryName: string | null
}

export function UpdateSendView(props: UpdateSendViewProps): React.ReactElement {
    const { senderName, senderEmail, foundryName } = props

    const [subject, setSubject] = useState<string>("")
    const [headline, setHeadline] = useState<string>("")
    const [body, setBody] = useState<string>("")
    const [schedule, setSchedule] = useState<SchedulePick>("now")
    const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)

    const subjectInputRef = useRef<HTMLInputElement>(null)

    // Rehydrate any previously saved local draft on mount so the founder
    // never loses work when they tab away. Runs client-only.
    useEffect(() => {
        if (typeof window === "undefined") return
        try {
            const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY)
            if (!raw) return
            const parsed = JSON.parse(raw) as PersistedDraft
            if (typeof parsed !== "object" || parsed === null) return
            if (typeof parsed.subject === "string") setSubject(parsed.subject)
            if (typeof parsed.headline === "string") setHeadline(parsed.headline)
            if (typeof parsed.body === "string") setBody(parsed.body)
            if (parsed.schedule === "now" || parsed.schedule === "tue_10" || parsed.schedule === "custom") {
                setSchedule(parsed.schedule)
            }
            if (typeof parsed.savedAt === "string") setLastSavedAt(parsed.savedAt)
        } catch (err) {
            console.warn("[money/updates/send] failed to rehydrate local draft:", err)
        }
    }, [])

    const hasContent =
        subject.trim().length > 0 ||
        headline.trim().length > 0 ||
        body.trim().length > 0

    const handleSaveDraft = useCallback(() => {
        if (typeof window === "undefined") return
        if (!hasContent) {
            toast.error("Nothing to save yet — write a subject, headline, or body first.")
            return
        }
        const savedAt = new Date().toISOString()
        const payload: PersistedDraft = {
            subject,
            headline,
            body,
            schedule,
            savedAt,
        }
        try {
            window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload))
            setLastSavedAt(savedAt)
            toast.success("Draft saved to this browser.")
        } catch (err) {
            console.error("[money/updates/send] failed to save draft:", err)
            toast.error("Could not save the draft locally — check browser storage.")
        }
    }, [subject, headline, body, schedule, hasContent])

    const handleSend = useCallback(() => {
        handleSaveDraft()
        toast("Outbound delivery wires up next round — your draft is saved locally.", {
            description:
                "Per-recipient send (Resend / SES) lands with the next build, together with open + reply tracking.",
        })
    }, [handleSaveDraft])

    const handleTestSend = useCallback(() => {
        handleSaveDraft()
        toast("Test-send wires up with the delivery mutation.", {
            description: "Your draft is saved locally until then.",
        })
    }, [handleSaveDraft])

    const senderLabel = senderName && senderName.trim().length > 0
        ? senderName.trim()
        : "Your name"
    const senderAddress = senderEmail && senderEmail.trim().length > 0
        ? senderEmail.trim()
        : "your.address@foundry.example"
    const footerFoundry = foundryName && foundryName.trim().length > 0
        ? foundryName.trim()
        : "Your foundry"

    const footMeta = lastSavedAt
        ? `Draft · saved locally ${formatRelative(lastSavedAt)}`
        : "Draft · not yet saved"

    return (
        <div className="upd2">
            {/* ── Breadcrumb ───────────────────────────────────────────── */}
            <div className="upd2-crumbs-row">
                <nav className="upd2-crumbs" aria-label="Breadcrumb">
                    <Link href="/money/cockpit">Money</Link>
                    <span className="sep" aria-hidden="true">›</span>
                    <Link href="/money/raise">Raise</Link>
                    <span className="sep" aria-hidden="true">›</span>
                    <Link href="/money/board">Investor update</Link>
                    <span className="sep" aria-hidden="true">›</span>
                    <span className="current">Send preview</span>
                </nav>
                <div className="upd2-chips">
                    <Link href="/money/board" className="upd2-btn sm">
                        ← Back to editor
                    </Link>
                </div>
            </div>

            {/* ── Preview banner — honest state of what works today ───── */}
            <div className="upd2-preview-banner" role="status" aria-live="polite">
                <span className="upd2-preview-badge">Preview</span>
                <span className="upd2-preview-text">
                    Send preview is in preview. <strong>Save draft</strong> persists
                    to this browser so nothing is lost between visits. Outbound
                    delivery, recipient resolution, and open / reply tracking wire
                    up next round.
                </span>
            </div>

            {/* ── Page head ────────────────────────────────────────────── */}
            <header className="upd2-head">
                <h1 className="upd2-title">
                    <span className="upd2-title-dot" aria-hidden="true" />
                    Preview before send
                </h1>
                <p className="upd2-sub">
                    A last look at the update before your investors see it. Draft
                    locally here; send once the outbound delivery wires up.
                </p>
            </header>

            {/* ── Grid: email preview + editable fields | rail ────────── */}
            <div className="upd2-grid">
                <div>
                    {/* Subject field */}
                    <div className="upd2-field-block">
                        <h3>Subject</h3>
                        <p className="sub">What lands in their inbox preview pane.</p>
                        <input
                            ref={subjectInputRef}
                            type="text"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder={`${footerFoundry} · ${monthYearLabel()} update`}
                            aria-label="Email subject"
                        />
                    </div>

                    {/* Email chrome + editable body */}
                    <div className="upd2-email">
                        <div className="upd2-email-head">
                            <div className="upd2-eh-row">
                                <span className="upd2-eh-label">From</span>
                                <span className="upd2-eh-val">
                                    <strong>{senderLabel}</strong>
                                    {" "}
                                    &lt;{senderAddress}&gt;
                                </span>
                            </div>
                            <div className="upd2-eh-row">
                                <span className="upd2-eh-label">To</span>
                                <span className="upd2-eh-val">
                                    <em>Recipient list populates from your pipeline once delivery wires — no fake names shown.</em>
                                </span>
                            </div>
                            <div className="upd2-eh-row">
                                <span className="upd2-eh-label">Subject</span>
                                <span className="upd2-eh-val">
                                    {subject.trim().length > 0 ? (
                                        <strong>{subject}</strong>
                                    ) : (
                                        <em>Type a subject above to see the preview line.</em>
                                    )}
                                </span>
                            </div>
                            <div className="upd2-eh-row">
                                <span className="upd2-eh-label">Preview</span>
                                <span className="upd2-eh-val">
                                    {headline.trim().length > 0 ? (
                                        <em>{truncate(headline, 140)}</em>
                                    ) : (
                                        <em>Your headline below seeds the inbox preview.</em>
                                    )}
                                </span>
                            </div>
                        </div>

                        <div className="upd2-email-body">
                            {!hasContent ? (
                                <div className="upd2-email-empty">
                                    <strong>Editor opens empty</strong>
                                    Drafts save locally in this browser. Type your headline
                                    and body in the fields below to see the email take shape.
                                </div>
                            ) : (
                                <div aria-live="polite">
                                    {headline.trim().length > 0 ? (
                                        <p style={{
                                            background: "var(--c-brand-soft)",
                                            borderLeft: "4px solid var(--c-brand)",
                                            padding: "14px 18px",
                                            borderRadius: "0 8px 8px 0",
                                            marginBottom: 16,
                                            fontSize: 13.5,
                                            lineHeight: 1.55,
                                            color: "#7c2d12",
                                            whiteSpace: "pre-wrap",
                                        }}>
                                            {headline}
                                        </p>
                                    ) : null}
                                    {body.trim().length > 0 ? (
                                        <div style={{
                                            fontSize: 13,
                                            lineHeight: 1.6,
                                            color: "var(--c-fg)",
                                            whiteSpace: "pre-wrap",
                                        }}>
                                            {body}
                                        </div>
                                    ) : null}
                                </div>
                            )}
                        </div>

                        <div className="upd2-email-foot">
                            {footerFoundry} · sent via ForgeOS (when delivery wires)
                        </div>
                    </div>

                    {/* Headline editable */}
                    <div className="upd2-field-block" style={{ marginTop: 14 }}>
                        <h3>Headline</h3>
                        <p className="sub">
                            One-sentence summary. Sits at the top of the email so scanners get
                            the month in five seconds.
                        </p>
                        <textarea
                            value={headline}
                            onChange={(e) => setHeadline(e.target.value)}
                            placeholder="The month we... — lead with the biggest thing that happened, in your own voice."
                            aria-label="Headline"
                            style={{ minHeight: 90 }}
                        />
                    </div>

                    {/* Body editable */}
                    <div className="upd2-field-block">
                        <h3>Body</h3>
                        <p className="sub">
                            Write it how you&rsquo;d tell a co-founder on a call. Specific
                            numbers &gt; adjectives; one clear ask at the end.
                        </p>
                        <textarea
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            placeholder={
                                "The money\nCash, runway, burn, MRR — fill in from your Cockpit.\n\n" +
                                "Traction\nWhat shipped or closed this month.\n\n" +
                                "Round\nWhere the raise stands — committed / verbal / in DD / weeks to close.\n\n" +
                                "What\u2019s hard\nOne thing that isn\u2019t going well. Honest.\n\n" +
                                "Ask\nOne or two specific asks — intros you need, feedback on a document, hires."
                            }
                            aria-label="Body"
                        />
                    </div>
                </div>

                {/* ── Rail ──────────────────────────────────────────────── */}
                <aside className="upd2-rail" aria-label="Send settings">
                    <div className="upd2-rail-card">
                        <div className="upd2-rail-head">Recipients</div>
                        <div className="upd2-rail-empty">
                            Recipient list populates from your Raise pipeline once
                            outbound delivery wires. Until then, drafts save locally
                            and aren&rsquo;t sent.
                        </div>
                    </div>

                    <div className="upd2-rail-card">
                        <div className="upd2-rail-head">Send settings</div>
                        <div className="upd2-rail-body" style={{ padding: "10px 16px" }}>
                            <div className="upd2-setting-row">
                                <strong>Subject</strong>
                                <div>
                                    {subject.trim().length > 0
                                        ? truncate(subject, 60)
                                        : "— add one above"}
                                </div>
                            </div>
                            <div className="upd2-setting-row">
                                <strong>Send from</strong>
                                <div>{senderAddress} · wires on delivery</div>
                            </div>
                            <div className="upd2-setting-row">
                                <strong>BCC</strong>
                                <div>Yourself, for your records · wires on delivery</div>
                            </div>
                            <div className="upd2-setting-row">
                                <strong>Attachments</strong>
                                <div>HTML only · PDF on request · wires on delivery</div>
                            </div>
                            <div className="upd2-setting-row">
                                <strong>Tracking</strong>
                                <div>Opens · link clicks · replies to inbox · wires on delivery</div>
                            </div>
                        </div>
                    </div>

                    <div className="upd2-rail-card">
                        <div className="upd2-rail-head">Schedule</div>
                        <div className="upd2-rail-body">
                            <div style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 4 }}>
                                Pick when this would go out — choice persists with your
                                local draft.
                            </div>
                            <div className="upd2-pills" role="radiogroup" aria-label="Schedule">
                                <button
                                    type="button"
                                    className={`upd2-pill${schedule === "now" ? " active" : ""}`}
                                    onClick={() => setSchedule("now")}
                                    role="radio"
                                    aria-checked={schedule === "now"}
                                >
                                    Send now
                                </button>
                                <button
                                    type="button"
                                    className={`upd2-pill${schedule === "tue_10" ? " active" : ""}`}
                                    onClick={() => setSchedule("tue_10")}
                                    role="radio"
                                    aria-checked={schedule === "tue_10"}
                                >
                                    Tue 10am
                                </button>
                                <button
                                    type="button"
                                    className={`upd2-pill${schedule === "custom" ? " active" : ""}`}
                                    onClick={() => setSchedule("custom")}
                                    role="radio"
                                    aria-checked={schedule === "custom"}
                                >
                                    Custom
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="upd2-rail-card">
                        <div className="upd2-rail-head">What you&rsquo;ll see after</div>
                        <div className="upd2-rail-body" style={{ color: "var(--c-fg-muted)" }}>
                            Once delivery wires, sent updates appear as past updates in
                            the Board pack. Open + click tracking populates over 48 hours.
                            Replies thread into your inbox and show on each investor detail page.
                        </div>
                    </div>
                </aside>
            </div>

            {/* ── Action bar ───────────────────────────────────────────── */}
            <div className="upd2-actions">
                <div className="upd2-actions-meta">{footMeta}</div>
                <div className="upd2-actions-btns">
                    <Link href="/money/board" className="upd2-btn">
                        ← Edit
                    </Link>
                    <button
                        type="button"
                        className="upd2-btn"
                        onClick={handleSaveDraft}
                        aria-label="Save draft to this browser"
                        title="Save this draft to your browser so nothing is lost"
                    >
                        Save draft
                    </button>
                    <button
                        type="button"
                        className="upd2-btn"
                        onClick={handleTestSend}
                        aria-label="Test-send — wires up with the delivery mutation"
                        title="Test-send wires up with the delivery mutation"
                    >
                        Test-send to me
                    </button>
                    <button
                        type="button"
                        className="upd2-btn primary"
                        onClick={handleSend}
                        aria-label="Send — outbound delivery wires up next round"
                        title="Outbound delivery wires up next round — click to save your draft locally"
                    >
                        Send →
                    </button>
                </div>
            </div>

            {/* ── Annotation ──────────────────────────────────────────── */}
            <div className="upd2-annot">
                <strong>Note</strong> Per-recipient open, click, and reply tracking
                populate through a delivery-service webhook (Resend / SES). Schema
                lands with MONEY-SCHEMA §investor_update + §investor_update_recipient
                — see the handover doc for the Phase-2 migration order.
            </div>
        </div>
    )
}

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Coarse relative-time formatter — "just now" / "2m ago" / "3h ago" / a
 * locale date string past 24h. Pure client-side; falls back to the raw
 * ISO string when parsing fails.
 */
function formatRelative(iso: string): string {
    const then = Date.parse(iso)
    if (Number.isNaN(then)) return iso
    const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000))
    if (seconds < 45) return "just now"
    if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`
    try {
        return new Date(then).toLocaleDateString()
    } catch {
        return iso
    }
}

function truncate(s: string, max: number): string {
    const trimmed = s.trim()
    if (trimmed.length <= max) return trimmed
    return `${trimmed.slice(0, max - 1)}…`
}

/** "April '26" — seeded month label used in placeholders. British-style. */
function monthYearLabel(): string {
    try {
        const d = new Date()
        const month = d.toLocaleString("en-GB", { month: "long" })
        const yy = String(d.getFullYear()).slice(2)
        return `${month} '${yy}`
    } catch {
        return "this month"
    }
}
