/**
 * GmailImportView — Money · Raise · Import a Gmail thread as a touch.
 *
 * Mockup-faithful port of MONEY-MOCKUP-GMAIL-IMPORT.html. Scoped to
 * `.gml2`. The whole page is a preparation / preview state — Gmail
 * OAuth, thread fetch, forward-to-inbox MIME parsing, and extraction
 * LLM calls are all pre-wiring. A preview banner at the top says so in
 * plain words. Every CTA below it is disabled with honest copy; the
 * sample thread + extracted-fields block render static content so the
 * founder can see what the flow will look like once it's live.
 *
 * Sections (top to bottom, matching the mockup):
 *   1. Breadcrumb — Money › Raise › Log touch › Import from Gmail
 *   2. Cancel link (right-aligned) — routes to /today (Log-touch page
 *      is not yet built in the V2 cutover wave)
 *   3. Preview banner — honest "Gmail import wires up next round"
 *   4. Page header — orange title dot + title + subtitle
 *   5. 01 · Pick a method — two-up card grid (OAuth + Forward-to-inbox)
 *   6. 02 · Paste the thread URL — input + disabled Fetch button
 *   7. 03 · Email thread preview — three stacked messages (sample)
 *   8. 04 · Extracted fields — eight rows of label / value / confidence
 *   9. Footer action bar — Cancel · Edit-as-form · Import thread (all
 *      disabled bar Cancel)
 *
 * Banned mockup specifics we explicitly do NOT render:
 *   - Enabled Fetch / Connect / Import buttons that go nowhere — every
 *     action is disabled until OAuth + extraction pipelines land.
 *   - Fake "success" toasts or imported-task previews — the "three
 *     tasks will be created" footer note is descriptive copy only.
 *   - Real investor records backing the sample thread — the Simon King
 *     thread renders as a static preview clearly inside a
 *     preview-banner-tagged page.
 */

"use client"

import Link from "next/link"

import "./gmail-import-v2.css"

// ─── View ──────────────────────────────────────────────────────────────

export function GmailImportView(): React.ReactElement {
    return (
        <div className="gml2">
            <div className="gml2-wrap">
                {/* 1 · Breadcrumb + 2 · Cancel */}
                <div className="gml2-pagehead">
                    <nav className="gml2-crumbs" aria-label="Breadcrumb">
                        <Link href="/investors">Money</Link>
                        <span className="gml2-crumb-sep" aria-hidden="true">›</span>
                        <Link href="/investors">Raise</Link>
                        <span className="gml2-crumb-sep" aria-hidden="true">›</span>
                        <Link href="/investors">Log touch</Link>
                        <span className="gml2-crumb-sep" aria-hidden="true">›</span>
                        <span className="gml2-crumb-current">Import from Gmail</span>
                    </nav>
                    <div className="gml2-pagehead-actions">
                        <Link href="/investors" className="gml2-btn gml2-btn-sm">
                            ← Cancel
                        </Link>
                    </div>
                </div>

                {/* 3 · Preview banner — honest state of the world */}
                <div className="gml2-banner" role="note">
                    <strong>Preview · Gmail import wires up next round.</strong>
                    <span>
                        The page below shows the flow as it&rsquo;ll look once
                        the OAuth handshake and thread extractor land. The
                        sample thread and extracted fields are illustrative —
                        nothing on this page saves or imports yet.
                    </span>
                </div>

                {/* 4 · Header card — orange title dot */}
                <div className="gml2-head">
                    <h1 className="gml2-title">
                        <span className="gml2-title-dot" aria-hidden="true" />
                        Import a Gmail thread as a touch
                    </h1>
                    <p className="gml2-sub">
                        Paste a Gmail URL or forward the thread to your
                        unique inbox. I&rsquo;ll parse sender, subject, body,
                        and asks — you review before it attaches to the
                        investor.
                    </p>
                </div>

                {/* 5 · 01 Pick a method */}
                <section className="gml2-section" aria-labelledby="gml2-s1">
                    <h3 id="gml2-s1" className="gml2-section-title">
                        01 · Pick a method
                    </h3>
                    <div className="gml2-method-grid">
                        <div className="gml2-method gml2-method--active" aria-disabled="true">
                            <div className="gml2-method-ic" aria-hidden="true">⚭</div>
                            <h4 className="gml2-method-name">Connect Gmail (OAuth)</h4>
                            <p className="gml2-method-desc">
                                Read-only access to your Gmail. Paste any
                                thread URL and we import instantly. Best for
                                frequent imports.
                            </p>
                            <span className="gml2-method-badge">Recommended</span>
                        </div>
                        <div className="gml2-method" aria-disabled="true">
                            <div className="gml2-method-ic" aria-hidden="true">✉</div>
                            <h4 className="gml2-method-name">Forward to inbox</h4>
                            <p className="gml2-method-desc">
                                Forward any email to your ForgeOS inbox at{" "}
                                <code className="gml2-inline-code">
                                    your-foundry+fwd@inbox.forgeos.app
                                </code>
                                . We parse it asynchronously.
                            </p>
                        </div>
                    </div>
                </section>

                {/* 6 · 02 Paste the thread URL */}
                <section className="gml2-section" aria-labelledby="gml2-s2">
                    <h3 id="gml2-s2" className="gml2-section-title">
                        02 · Paste the thread URL
                    </h3>
                    <p className="gml2-section-sub">
                        From Gmail: open the thread, copy URL from browser
                        address bar. Only this thread is read, not your full
                        inbox.
                    </p>
                    <div className="gml2-url-row">
                        <input
                            type="text"
                            className="gml2-url-input"
                            defaultValue="https://mail.google.com/mail/u/0/#inbox/FMfcgzQbfQhZgLGFLkGnBMrmCcXZqspV"
                            readOnly
                            aria-label="Gmail thread URL (preview)"
                        />
                        <button
                            type="button"
                            className="gml2-btn gml2-btn-primary"
                            disabled
                            aria-disabled="true"
                            title="Fetch wires up next round."
                        >
                            Fetch →
                        </button>
                    </div>
                    <div className="gml2-hint">
                        Works with any thread you can access · 2-way shared +
                        labels respected.
                    </div>
                </section>

                {/* 7 · 03 Email thread preview */}
                <section className="gml2-section" aria-labelledby="gml2-s3">
                    <h3 id="gml2-s3" className="gml2-section-title">
                        03 · Email thread · 3 messages · Simon King ↔ you
                    </h3>
                    <p className="gml2-section-sub">
                        Preview before attaching. Edit any extracted field
                        before saving.
                    </p>

                    <article className="gml2-thread" aria-label="Sample Gmail thread preview">
                        <div className="gml2-msg">
                            <div className="gml2-msg-from">
                                Simon King{" "}
                                <small>&lt;simon.king@octopusventures.com&gt;</small>
                            </div>
                            <div className="gml2-msg-date">
                                Thu 17 Apr · 09:14 BST · to tristan@nimbus.ag
                            </div>
                            <div className="gml2-msg-subject">
                                Re: Nimbus Robotics · follow-up
                            </div>
                            <div className="gml2-msg-body">{SAMPLE_MESSAGE_BODY}</div>
                        </div>

                        <div className="gml2-msg gml2-msg--collapsed">
                            <div className="gml2-msg-from">
                                Tristan Fischer{" "}
                                <small>&lt;tristan@nimbus.ag&gt;</small>
                            </div>
                            <div className="gml2-msg-date">Mon 15 Apr · 18:22 BST</div>
                            <div className="gml2-msg-body gml2-msg-body--muted">
                                Simon, thanks for the call today. Sharing the
                                deck we discussed...
                            </div>
                        </div>

                        <div className="gml2-msg gml2-msg--collapsed">
                            <div className="gml2-msg-from">Simon King</div>
                            <div className="gml2-msg-date">Thu 08 Apr · 14:30 BST</div>
                            <div className="gml2-msg-body gml2-msg-body--muted">
                                Max introduced me to your work...
                            </div>
                        </div>
                    </article>
                </section>

                {/* 8 · 04 Extracted fields */}
                <section className="gml2-section" aria-labelledby="gml2-s4">
                    <h3 id="gml2-s4" className="gml2-section-title">
                        04 · Extracted fields · review before import
                    </h3>
                    <p className="gml2-section-sub">
                        Below are the fields Log Touch normally captures.
                        Edit anything that&rsquo;s wrong.
                    </p>

                    <dl className="gml2-extract">
                        <ExtractRow
                            label="Investor"
                            value={
                                <>
                                    <strong>Simon King · Octopus Ventures</strong>
                                    <br />
                                    <small className="gml2-extract-note">
                                        Matched on email domain + existing
                                        investor record
                                    </small>
                                </>
                            }
                            confidence="98% match"
                            confidenceTone="high"
                        />
                        <ExtractRow
                            label="Type"
                            value={
                                <>
                                    <strong>Email</strong> · 3-message thread ·
                                    2 from them, 1 from you
                                </>
                            }
                            confidence="100%"
                            confidenceTone="high"
                        />
                        <ExtractRow
                            label="Most recent"
                            value={
                                <>
                                    <strong>17 Apr · 09:14 BST</strong> — inbound
                                    from Simon
                                </>
                            }
                            confidence="100%"
                            confidenceTone="high"
                        />
                        <ExtractRow
                            label="Subject"
                            value="Re: Nimbus Robotics · follow-up"
                            confidence="100%"
                            confidenceTone="high"
                        />
                        <ExtractRow
                            label="Outcome"
                            value={
                                <>
                                    <strong>Positive · moving forward</strong>
                                    <br />
                                    <small className="gml2-extract-note">
                                        Signals: &ldquo;loved the pilot
                                        traction&rdquo;, requesting materials
                                        for IC
                                    </small>
                                </>
                            }
                            confidence="Suggested · confirm?"
                            confidenceTone="medium"
                        />
                        <ExtractRow
                            label="What they asked for"
                            value={
                                <>
                                    <ol className="gml2-extract-list">
                                        <li>
                                            Financial model — monthly to end of
                                            &rsquo;27
                                        </li>
                                        <li>
                                            Sensitivity analysis on NimFarm
                                            slippage (12 wk)
                                        </li>
                                        <li>
                                            Thoughts on non-capital help
                                            (intros, hires)
                                        </li>
                                    </ol>
                                    <small className="gml2-extract-note">
                                        Each will become a task auto-assigned
                                        to Finn + you.
                                    </small>
                                </>
                            }
                            action={
                                <button
                                    type="button"
                                    className="gml2-btn gml2-btn-sm gml2-btn-edit"
                                    disabled
                                    aria-disabled="true"
                                    title="Edit wires up next round."
                                >
                                    Edit
                                </button>
                            }
                        />
                        <ExtractRow
                            label="Key quote"
                            value={
                                <span className="gml2-extract-quote">
                                    &ldquo;Loved the pilot traction.&rdquo;
                                </span>
                            }
                            confidence="Suggested"
                            confidenceTone="medium"
                        />
                        <ExtractRow
                            label="Deadline implied"
                            value={
                                <>
                                    <strong>Tuesday 22 April EOD</strong>
                                    <br />
                                    <small className="gml2-extract-note">
                                        Will create a task with this as due
                                        date
                                    </small>
                                </>
                            }
                            confidence="95%"
                            confidenceTone="high"
                        />
                    </dl>
                </section>

                {/* 9 · Footer action bar */}
                <div className="gml2-footbar" role="navigation" aria-label="Import actions">
                    <div className="gml2-footbar-meta">
                        Ready to import · attaches 3-msg thread to Simon
                        King&rsquo;s record · creates 3 tasks
                    </div>
                    <div className="gml2-footbar-actions">
                        <Link href="/investors" className="gml2-btn">
                            Cancel
                        </Link>
                        <button
                            type="button"
                            className="gml2-btn"
                            disabled
                            aria-disabled="true"
                            title="Edit-as-form wires up next round."
                        >
                            Edit as Log Touch form
                        </button>
                        <button
                            type="button"
                            className="gml2-btn gml2-btn-primary"
                            disabled
                            aria-disabled="true"
                            title="Import wires up next round."
                        >
                            Import thread →
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─── Internals ─────────────────────────────────────────────────────────

type ConfidenceTone = "high" | "medium"

interface ExtractRowProps {
    label: string
    value: React.ReactNode
    confidence?: string
    confidenceTone?: ConfidenceTone
    action?: React.ReactNode
}

function ExtractRow({
    label,
    value,
    confidence,
    confidenceTone = "high",
    action,
}: ExtractRowProps): React.ReactElement {
    return (
        <div className="gml2-extract-row">
            <dt className="gml2-extract-label">{label}</dt>
            <dd className="gml2-extract-value">{value}</dd>
            <div className="gml2-extract-tail">
                {confidence ? (
                    <span
                        className={`gml2-extract-conf gml2-extract-conf--${confidenceTone}`}
                    >
                        {confidence}
                    </span>
                ) : null}
                {action}
            </div>
        </div>
    )
}

// ─── Sample preview content ────────────────────────────────────────────

const SAMPLE_MESSAGE_BODY = `Tristan,

Loved the pilot traction. Before our partner meeting on Thursday, I need a few things:

1. Your model broken out monthly to end of '27, not just quarterly
2. Sensitivity analysis: what happens to runway if NimFarm slips their milestone by 12 weeks?
3. Any thoughts on how we can help beyond capital (intros, hires, etc.)

Can you send by Tuesday EOD? Happy to jump on a call if easier.

Simon

---
Octopus Ventures`
