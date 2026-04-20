/**
 * ComposeView — The global Comms compose surface (V2, mockup-faithful).
 *
 * Mockup-faithful DOM ported from FORGE-MOCKUP-COMPOSE.html. Scoped to
 * `.cm2`. One composer serves every "Message X" / "Reply" / "Send draft"
 * action in the system.
 *
 * Interaction contract (V1):
 *   - Recipient: select from `recentRecipients` prop or type a free-form
 *     address. Form is fully interactive.
 *   - Channel: pick from Email / Slack / iMessage (no wiring yet — label
 *     only travels with the draft).
 *   - Subject + body: fully editable textareas.
 *   - Tone modes (Direct / Formal / Repair): visual toggle; no rewrite
 *     happens client-side — the selected tone ships with the payload
 *     when Send lands.
 *   - Send / Schedule: disabled with "Send ships with the comms mutation
 *     (next round)" helper. No submit path is wired.
 *   - Save draft: disabled (same reason).
 *   - Recent recipients: read-only click-to-fill — fills the To field and
 *     moves focus there so the draft picks up the chosen contact.
 *
 * Banned mockup specifics we do NOT render:
 *   - HAPS / Astra / James Holloway / Chase auto-flag text. The mockup
 *     showed a seeded chase; production boots blank until a real context
 *     source exists.
 *   - Thread history + relationship tiles with fake counters. We render
 *     the visual frames with honest empty-state copy instead.
 *
 * Sections (top to bottom, matching the mockup 1:1):
 *   1. Breadcrumb — Today › Comms › Compose message
 *   2. Annotation note (mockup parity — keep the "one composer" framing)
 *   3. Page title + subhead
 *   4. Compose grid (2-column: main composer / side context stack)
 *      a. Main composer — header with tone toggle, 3 meta fields
 *         (To / Channel / Subject / Attach), body textarea, footer actions
 *      b. Side — Why this message · Recent thread · Relationship
 *         (all three render empty-state copy until real context wires in)
 *   5. Tone-modes annotation note
 */

"use client"

import Link from "next/link"
import { useCallback, useRef, useState } from "react"
import "./compose-v2.css"

// ─── Types ─────────────────────────────────────────────────────────────

export type ComposeChannel = "email" | "slack" | "imessage"

export type ComposeTone = "direct" | "formal" | "repair"

export interface RecentRecipient {
    /** Stable key for React (profile id, contact id — anything unique). */
    id: string
    /** Display name — "James Holloway". */
    name: string
    /** Primary address for the chosen channel. Optional for display-only rows. */
    address: string | null
    /** Role / company hint rendered under the name — "Commercial Director · Astra". */
    role: string | null
    /** Relative timestamp — "2d ago" / "Fri". Null if not known. */
    lastAt: string | null
}

export interface ComposeViewProps {
    /**
     * Recent recipients the founder might want to message again.
     * Empty array → card renders honest "No recent recipients" empty state.
     */
    recentRecipients: RecentRecipient[]
    /** Signed-in user's display name — seeds the signature block. */
    senderName: string | null
}

// ─── View ──────────────────────────────────────────────────────────────

export function ComposeView(props: ComposeViewProps): React.ReactElement {
    const { recentRecipients, senderName } = props

    const [tone, setTone] = useState<ComposeTone>("direct")
    const [channel, setChannel] = useState<ComposeChannel>("email")
    const [to, setTo] = useState<string>("")
    const [subject, setSubject] = useState<string>("")
    const [body, setBody] = useState<string>("")

    const toInputRef = useRef<HTMLInputElement>(null)

    const handleRecentSelect = useCallback(
        (r: RecentRecipient) => {
            const formatted = r.address
                ? `${r.name} <${r.address}>`
                : r.name
            setTo(formatted)
            // Move focus into the To field so the draft picks up the
            // chosen contact and keyboard users stay on-path.
            toInputRef.current?.focus()
        },
        []
    )

    const signatureName = senderName && senderName.trim().length > 0
        ? senderName.trim()
        : "Your name"

    const sendDisabledLabel = "Send ships with the comms mutation (next round)"

    return (
        <div className="cm2">
            {/* ── Breadcrumb ─────────────────────────────────────────── */}
            <nav className="cm2-breadcrumb" aria-label="Breadcrumb">
                <Link href="/today">Today</Link>
                <span className="sep">›</span>
                <Link href="/the-forge-v2/compose">Comms</Link>
                <span className="sep">›</span>
                <span className="current">Compose message</span>
            </nav>

            {/* ── Annotation note (mockup parity) ───────────────────── */}
            <div className="cm2-annot">
                <strong>Note</strong> One composer serves every &ldquo;Message X&rdquo; /
                &ldquo;Reply&rdquo; / &ldquo;Send draft&rdquo; action in the system. Tone toggle lets
                you pick direct / formal / repair. Attachments, recipient context,
                and thread history wire into this view once the comms history lands.
                Nothing sends without your confirm.
            </div>

            {/* ── Page title ─────────────────────────────────────────── */}
            <h1 className="cm2-page-title"><span className="cm2-title-dot" aria-hidden="true" />Compose message</h1>
            <p className="cm2-page-sub">
                New outbound draft · pick a channel, add a recipient, write
                the message. Send lands with the comms mutation next round.
            </p>

            <div className="cm2-compose-grid">
                {/* ── Main composer ────────────────────────────────── */}
                <div className="cm2-compose-main">
                    <div className="cm2-compose-header">
                        <h2>New message</h2>
                        <div className="cm2-mode-toggle" role="tablist" aria-label="Tone">
                            <ToneButton
                                label="Direct"
                                value="direct"
                                active={tone === "direct"}
                                onSelect={setTone}
                            />
                            <ToneButton
                                label="Formal"
                                value="formal"
                                active={tone === "formal"}
                                onSelect={setTone}
                            />
                            <ToneButton
                                label="Repair"
                                value="repair"
                                active={tone === "repair"}
                                onSelect={setTone}
                            />
                        </div>
                    </div>

                    <div className="cm2-compose-fields">
                        {/* To */}
                        <div className="cm2-compose-field">
                            <div className="cm2-label">To</div>
                            <div className="cm2-value">
                                <input
                                    ref={toInputRef}
                                    type="text"
                                    value={to}
                                    onChange={(e) => setTo(e.target.value)}
                                    placeholder="Name &lt;email@company.com&gt;"
                                    aria-label="Recipient"
                                />
                            </div>
                            <button
                                type="button"
                                className="cm2-field-aux"
                                disabled
                                aria-label="Add Cc — ships with the comms mutation"
                            >
                                + Cc
                            </button>
                        </div>

                        {/* Channel */}
                        <div className="cm2-compose-field">
                            <div className="cm2-label">Channel</div>
                            <div className="cm2-value">
                                <select
                                    className="cm2-channel-select"
                                    value={channel}
                                    onChange={(e) => setChannel(e.target.value as ComposeChannel)}
                                    aria-label="Channel"
                                >
                                    <option value="email">Email</option>
                                    <option value="slack">Slack</option>
                                    <option value="imessage">iMessage</option>
                                </select>
                            </div>
                            <span className="cm2-grounding-pill">Channel wiring · next round</span>
                        </div>

                        {/* Subject */}
                        <div className="cm2-compose-field">
                            <div className="cm2-label">Subject</div>
                            <div className="cm2-value">
                                <input
                                    type="text"
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    placeholder="Short, specific, and dated if there is a deadline"
                                    aria-label="Subject"
                                />
                            </div>
                            <span className="cm2-grounding-pill">Draft · local only</span>
                        </div>

                        {/* Attach */}
                        <div className="cm2-compose-field">
                            <div className="cm2-label">Attach</div>
                            <div className="cm2-value">
                                <span style={{ color: "var(--c-fg-muted)", fontSize: 12.5 }}>
                                    No attachments yet — file upload wires in next round
                                </span>
                            </div>
                            <button
                                type="button"
                                className="cm2-field-aux"
                                disabled
                                aria-label="Add attachment — ships with the comms mutation"
                            >
                                + Add
                            </button>
                        </div>
                    </div>

                    {/* Body */}
                    <div className="cm2-compose-body">
                        <textarea
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            placeholder={
                                `Hi [name],\n\nLead with the ask in the first sentence — they will scan, ` +
                                `not read. One paragraph of context, one paragraph of ask, one line of ` +
                                `action.\n\nThanks,\n${signatureName}`
                            }
                            aria-label="Message body"
                        />
                        <div className="cm2-signature">
                            {signatureName}
                            <br />
                            Founder, Fractional Forge
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="cm2-compose-foot">
                        <div className="cm2-foot-actions">
                            <button
                                type="button"
                                className="cm2-btn primary"
                                disabled
                                aria-label={sendDisabledLabel}
                                title={sendDisabledLabel}
                            >
                                Send now
                            </button>
                            <button
                                type="button"
                                className="cm2-btn"
                                disabled
                                aria-label={sendDisabledLabel}
                                title={sendDisabledLabel}
                            >
                                Schedule
                            </button>
                            <button
                                type="button"
                                className="cm2-btn ghost"
                                disabled
                                aria-label={sendDisabledLabel}
                                title={sendDisabledLabel}
                            >
                                Save draft
                            </button>
                        </div>
                        <div className="cm2-foot-meta">
                            Draft · {countEdits(to, subject, body)} edits from you · not yet saved
                        </div>
                    </div>
                </div>

                {/* ── Side: context ─────────────────────────────────── */}
                <div className="cm2-compose-side">
                    {/* Why this message */}
                    <div className="cm2-side-card">
                        <h4>Why this message</h4>
                        <div className="cm2-side-empty">
                            Priority + value-at-risk rationale lands here when the compose
                            view opens from a Today signal. Until then this card stays neutral.
                        </div>
                    </div>

                    {/* Recent recipients */}
                    <div className="cm2-side-card">
                        <h4>Recent recipients</h4>
                        {recentRecipients.length > 0 ? (
                            recentRecipients.map((r) => (
                                <button
                                    key={r.id}
                                    type="button"
                                    className="cm2-recent-item"
                                    onClick={() => handleRecentSelect(r)}
                                    aria-label={`Message ${r.name} again`}
                                >
                                    <div>
                                        <div className="cm2-recent-name">{r.name}</div>
                                        {r.role ? (
                                            <div className="cm2-recent-role">{r.role}</div>
                                        ) : null}
                                    </div>
                                    {r.lastAt ? (
                                        <div className="cm2-recent-when">{r.lastAt}</div>
                                    ) : null}
                                </button>
                            ))
                        ) : (
                            <div className="cm2-side-empty">
                                No recent recipients — the comms history wires
                                into this view next round.
                            </div>
                        )}
                    </div>

                    {/* Thread history */}
                    <div className="cm2-side-card">
                        <h4>Recent thread</h4>
                        <div className="cm2-side-empty">
                            Thread history populates when the composer is launched from
                            an existing conversation. Pick a recipient above to pull in
                            prior messages.
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Tone annotation note ───────────────────────────────── */}
            <div className="cm2-annot">
                <strong>Note</strong> Three tone modes: <em>Direct</em> (default), <em>Formal</em>
                {" "}(re-draft in legalese when a contract is involved), <em>Repair</em>
                {" "}(explicitly acknowledge the gap, warmer open — used when a
                relationship has taken a hit). The chosen tone travels with the
                draft once the rewrite endpoint lands; client-side the toggle is
                visual only today.
            </div>
        </div>
    )
}

// ─── Subcomponents ─────────────────────────────────────────────────────

function ToneButton({
    label,
    value,
    active,
    onSelect,
}: {
    label: string
    value: ComposeTone
    active: boolean
    onSelect: (t: ComposeTone) => void
}): React.ReactElement {
    return (
        <button
            type="button"
            role="tab"
            aria-selected={active}
            className={active ? "active" : undefined}
            onClick={() => onSelect(value)}
        >
            {label}
        </button>
    )
}

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Coarse "how much has the user written" meter — drives the footer text
 * "Draft · N edits from you" in the mockup. We count non-empty fields as
 * a proxy until an undo-stack lands.
 */
function countEdits(to: string, subject: string, body: string): number {
    let n = 0
    if (to.trim().length > 0) n += 1
    if (subject.trim().length > 0) n += 1
    if (body.trim().length > 0) n += 1
    return n
}
