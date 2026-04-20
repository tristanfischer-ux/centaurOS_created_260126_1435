/**
 * ConnectXeroView — /money/connect/xero (V2, mockup-faithful PREVIEW).
 *
 * DOM ported 1:1 from MONEY-MOCKUP-CONNECT-XERO.html. Scoped to `.xer2`.
 * Everything a founder will see once Xero OAuth lands is rendered here so
 * the flow reads as a design sign-off surface: stepper, provider tiles,
 * OAuth card, account-mapping table, historical-import settings, sync
 * cadence, rail cards, footer.
 *
 * Preview contract (V1):
 *   - Whole page is the empty / preparation state. A "Preview" chip sits
 *     in the page header; a banner below it names what wires up next round.
 *   - Provider tiles and settings controls are all visually disabled.
 *   - "Connect with Xero" button calls `handleConnectAttempt`, which logs
 *     to console and surfaces an inline "Not yet wired" note. No redirect,
 *     no toast library needed.
 *   - All numeric mockup specifics (£34,220/mo, 28 accounts, 4 of 28 need
 *     confirmation, "Connected · forge-nimbus", token expiry) have been
 *     STRIPPED per the only-real-supabase-data rule. Their container rows
 *     still render, captioned honestly ("— · populates from Xero when
 *     connected").
 *   - Copy voice: first-person, British spelling ("accounting", "optimise",
 *     "organisation"), no "AI" framing. Orange title-dot.
 *
 * When Xero OAuth lands:
 *   1. Flip `isConnected` + `isWired` off the hardcoded `false` to derived
 *      state from `finance-integrations.ts`.
 *   2. Replace `handleConnectAttempt` with a server action that initiates
 *      the OAuth dance and redirects the founder to Xero.
 *   3. Remove the "Preview" chip, banner, and disabled attribute from the
 *      connect button.
 *   4. Populate the stripped-for-preview fields from live data.
 */

"use client"

import Link from "next/link"
import { useState } from "react"

import "./connect-xero-v2.css"

// ─── Data ──────────────────────────────────────────────────────────────

/**
 * Provider roster — matches the mockup's four-tile row. `key` doubles as
 * a CSS modifier so each tile gets its own brand colour without leaking
 * inline styles.
 */
interface ProviderTile {
    key: "xero" | "qbo" | "fa" | "bank"
    glyph: string
    name: string
    caption: string
}

const PROVIDERS: ReadonlyArray<ProviderTile> = [
    {
        key: "xero",
        glyph: "X",
        name: "Xero",
        caption: "UK / NZ / AU standard",
    },
    {
        key: "qbo",
        glyph: "QB",
        name: "QuickBooks",
        caption: "US standard · online + desktop",
    },
    {
        key: "fa",
        glyph: "FA",
        name: "FreeAgent",
        caption: "UK · NatWest + RBS integrated",
    },
    {
        key: "bank",
        glyph: "+",
        name: "Direct bank (Plaid)",
        caption: "No bookkeeper? Connect bank directly",
    },
]

/** What the connector reads from Xero — used by the "what we read" rail card. */
const READ_SCOPES: ReadonlyArray<string> = [
    "Transactions (cash out / in)",
    "Account balances",
    "Invoices (sent + received)",
    "Contacts (vendors, customers)",
    "Bank feed status",
    "Chart of accounts",
]

/** Surfaces that populate after connection — rail card. */
interface SurfaceChange {
    surface: string
    note: string
}
const SURFACE_CHANGES: ReadonlyArray<SurfaceChange> = [
    {
        surface: "Cockpit",
        note: "cash at bank, burn, runway switch from manual to actuals",
    },
    {
        surface: "Variance",
        note: "plan vs actuals populates automatically",
    },
    {
        surface: "P&L",
        note: "an \u201cActual\u201d column becomes available",
    },
    {
        surface: "Cost items",
        note: "get a last-6-months actual history chart",
    },
    {
        surface: "Finn",
        note: "can spot real anomalies, not just plan drift",
    },
]

// ─── View ──────────────────────────────────────────────────────────────

export function ConnectXeroView(): React.ReactElement {
    const [attempted, setAttempted] = useState(false)

    // Preview-state click handler. No OAuth redirect happens today — the
    // provider abstraction in `src/actions/finance-integrations.ts` is
    // orphaned, and there is no `xero_connection` row to write. We surface
    // an inline note the founder can read instead of faking a redirect.
    function handleConnectAttempt(): void {
        console.info(
            "[money/connect/xero] Xero OAuth handshake is not wired yet — preview state.",
        )
        setAttempted(true)
    }

    return (
        <div className="xer2">
            <div className="xer2-wrap">
                {/* ── Breadcrumb + preview chip ─────────────────────────── */}
                <div className="xer2-crumbs-row">
                    <nav className="xer2-crumbs" aria-label="Breadcrumb">
                        <Link href="/money/cockpit">Money</Link>
                        <span className="xer2-crumb-sep" aria-hidden="true">
                            ›
                        </span>
                        <Link href="/money/cockpit">Cockpit</Link>
                        <span className="xer2-crumb-sep" aria-hidden="true">
                            ›
                        </span>
                        <span className="xer2-crumb-current">
                            Connect accounting
                        </span>
                    </nav>
                    <div className="xer2-chips">
                        <span className="xer2-preview-chip" title="This page is a preview — the Xero connection wires up next round.">
                            Preview
                        </span>
                        <Link href="/money/cockpit" className="xer2-btn">
                            ← Back
                        </Link>
                    </div>
                </div>

                {/* ── Honest-state banner ───────────────────────────────── */}
                <div className="xer2-banner" role="note">
                    <strong>Xero connection wires up next round — bookmark this page.</strong>{" "}
                    Everything below is the finished flow you&rsquo;ll see
                    once it ships: provider choice, OAuth handshake, account
                    mapping, history import, sync cadence. No handshake fires
                    today; nothing is written to Supabase from this screen
                    yet. Mapping and sync settings preview so you can see
                    what&rsquo;ll be asked of you — they save once the
                    connector is live.
                </div>

                {/* ── Title head ────────────────────────────────────────── */}
                <header className="xer2-head">
                    <h1 className="xer2-title">
                        <span
                            className="xer2-title-dot"
                            aria-hidden="true"
                        />
                        Connect your accounting
                    </h1>
                    <p className="xer2-sub">
                        Once connected, the Cockpit and Variance view show{" "}
                        <strong>actuals</strong>, not forecasts. Plan stays
                        driven by your manual inputs — actuals only ever
                        read, never write, so the integration can&rsquo;t
                        corrupt your planning numbers.
                    </p>
                </header>

                {/* ── Stepper ───────────────────────────────────────────── */}
                <ol className="xer2-stepper" aria-label="Connection steps">
                    <li className="xer2-step">
                        <span className="xer2-step-n">01</span>
                        <span className="xer2-step-lbl">Provider</span>
                        <span className="xer2-step-sub">Pick one</span>
                    </li>
                    <li className="xer2-step">
                        <span className="xer2-step-n">02</span>
                        <span className="xer2-step-lbl">Authenticate</span>
                        <span className="xer2-step-sub">OAuth with PKCE</span>
                    </li>
                    <li className="xer2-step">
                        <span className="xer2-step-n">03</span>
                        <span className="xer2-step-lbl">Map accounts</span>
                        <span className="xer2-step-sub">Auto-match + confirm</span>
                    </li>
                    <li className="xer2-step">
                        <span className="xer2-step-n">04</span>
                        <span className="xer2-step-lbl">Historical import</span>
                        <span className="xer2-step-sub">Pick a window</span>
                    </li>
                    <li className="xer2-step">
                        <span className="xer2-step-n">05</span>
                        <span className="xer2-step-lbl">Sync + verify</span>
                        <span className="xer2-step-sub">Pick cadence</span>
                    </li>
                </ol>

                <div className="xer2-main">
                    <div className="xer2-col">
                        {/* ── 01 · Provider ──────────────────────────────── */}
                        <section className="xer2-section" aria-labelledby="xer2-sec-provider">
                            <h3 id="xer2-sec-provider">01 · Provider</h3>
                            <p className="xer2-section-sub">
                                Pick your accounting system. Xero is the UK /
                                NZ / AU default; QuickBooks is the US
                                default. FreeAgent is best if your bank is
                                NatWest or RBS. Direct bank (Plaid) is for
                                founders without a bookkeeper yet.
                            </p>
                            <div className="xer2-prov-grid">
                                {PROVIDERS.map((p) => (
                                    <div
                                        key={p.key}
                                        className={`xer2-prov-tile xer2-prov-tile--${p.key}`}
                                        aria-disabled="true"
                                        title="Provider choice saves once the connector is live."
                                    >
                                        <div className="xer2-prov-logo">
                                            {p.glyph}
                                        </div>
                                        <div className="xer2-prov-name">
                                            {p.name}
                                        </div>
                                        <div className="xer2-prov-sub">
                                            {p.caption}
                                        </div>
                                        <span className="xer2-prov-status">
                                            Not yet wired
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <p className="xer2-section-foot">
                                Can&rsquo;t see your provider? Wave, Sage and
                                Zoho Books are on the roadmap. You can carry
                                on with manual Plan entries in the meantime —
                                Plan works fully without a connection, you
                                just don&rsquo;t get automatic Variance.
                            </p>
                        </section>

                        {/* ── 02 · Authenticate ──────────────────────────── */}
                        <section className="xer2-section" aria-labelledby="xer2-sec-auth">
                            <h3 id="xer2-sec-auth">02 · Authenticate</h3>
                            <p className="xer2-section-sub">
                                OAuth 2.0 with PKCE. You&rsquo;ll be sent to
                                Xero, sign in with your Xero login, and
                                approve read-only scopes. Tokens come back
                                encrypted and scoped to this foundry.
                            </p>
                            <div className="xer2-oauth-card">
                                <div
                                    className="xer2-oauth-ic"
                                    aria-hidden="true"
                                >
                                    X
                                </div>
                                <div className="xer2-oauth-body">
                                    <h4>Connect with Xero</h4>
                                    <p>
                                        <strong>Scopes we&rsquo;ll ask for:</strong>{" "}
                                        <code>accounting.transactions.read</code>,{" "}
                                        <code>accounting.reports.read</code>,{" "}
                                        <code>accounting.contacts.read</code>.{" "}
                                        We never write to Xero.
                                    </p>
                                </div>
                                <div className="xer2-oauth-actions">
                                    <button
                                        type="button"
                                        className="xer2-oauth-btn"
                                        onClick={handleConnectAttempt}
                                        aria-disabled="true"
                                        title="OAuth handshake wires up next round."
                                    >
                                        Connect with Xero
                                    </button>
                                    {attempted ? (
                                        <div
                                            className="xer2-oauth-note"
                                            role="status"
                                        >
                                            The OAuth handshake is being
                                            wired up next round. You&rsquo;ll
                                            be emailed when it&rsquo;s live.
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </section>

                        {/* ── 03 · Map accounts (preview structure only) ── */}
                        <section className="xer2-section" aria-labelledby="xer2-sec-map">
                            <h3 id="xer2-sec-map">
                                03 · Map Xero accounts to ForgeOS categories
                            </h3>
                            <p className="xer2-section-sub">
                                We&rsquo;ll auto-match every Xero account to
                                a ForgeOS Plan category, confidence-scored.
                                You only confirm the ambiguous ones — the
                                high-confidence matches apply silently.
                                Mapping drives the category in Plan and the
                                P&amp;L rollup.
                            </p>
                            <div className="xer2-map-head">
                                <div>Xero account</div>
                                <div aria-hidden="true" />
                                <div>ForgeOS category</div>
                                <div className="xer2-map-head-right">
                                    Confidence
                                </div>
                            </div>
                            <div className="xer2-map-empty">
                                Your chart of accounts populates here once
                                Xero is connected. The mapping is
                                confidence-scored per row and you only
                                confirm the ambiguous ones.
                            </div>
                        </section>

                        {/* ── 04 · Historical import ─────────────────────── */}
                        <section className="xer2-section" aria-labelledby="xer2-sec-hist">
                            <h3 id="xer2-sec-hist">04 · Historical import</h3>
                            <p className="xer2-section-sub">
                                How far back to import transactions. More
                                history = richer Variance trend but a longer
                                initial sync.
                            </p>
                            <div className="xer2-sync-row">
                                <div className="xer2-sync-lab">
                                    Period
                                    <small>How far back</small>
                                </div>
                                <select
                                    className="xer2-select"
                                    defaultValue="12"
                                    disabled
                                    aria-disabled="true"
                                    aria-label="Historical import window"
                                >
                                    <option value="3">
                                        3 months (fast · ~2 min sync)
                                    </option>
                                    <option value="6">
                                        6 months (balanced · ~6 min)
                                    </option>
                                    <option value="12">
                                        12 months (recommended · ~12 min)
                                    </option>
                                    <option value="all">
                                        All history (full · may take 30+ min)
                                    </option>
                                </select>
                            </div>
                            <div className="xer2-sync-row">
                                <div className="xer2-sync-lab">
                                    Include draft invoices
                                    <small>Unreconciled items</small>
                                </div>
                                <select
                                    className="xer2-select"
                                    defaultValue="skip"
                                    disabled
                                    aria-disabled="true"
                                    aria-label="Draft invoice handling"
                                >
                                    <option value="flag">
                                        Yes · flag separately
                                    </option>
                                    <option value="blend">
                                        Yes · blend in
                                    </option>
                                    <option value="skip">
                                        No · skip drafts
                                    </option>
                                </select>
                            </div>
                            <div className="xer2-sync-row">
                                <div className="xer2-sync-lab">
                                    Reclassify uncategorised
                                    <small>
                                        Xero items without an account
                                    </small>
                                </div>
                                <select
                                    className="xer2-select"
                                    defaultValue="prompt"
                                    disabled
                                    aria-disabled="true"
                                    aria-label="Uncategorised reclassification"
                                >
                                    <option value="prompt">
                                        Prompt me to reclassify
                                        (recommended)
                                    </option>
                                    <option value="skip">
                                        Skip
                                    </option>
                                </select>
                            </div>
                        </section>

                        {/* ── 05 · Ongoing sync ──────────────────────────── */}
                        <section className="xer2-section" aria-labelledby="xer2-sec-sync">
                            <h3 id="xer2-sec-sync">05 · Ongoing sync</h3>
                            <p className="xer2-section-sub">
                                How often to refresh after the initial
                                import.
                            </p>
                            <div className="xer2-sync-row">
                                <div className="xer2-sync-lab">
                                    Sync frequency
                                </div>
                                <select
                                    className="xer2-select"
                                    defaultValue="15m"
                                    disabled
                                    aria-disabled="true"
                                    aria-label="Sync frequency"
                                >
                                    <option value="15m">
                                        Every 15 minutes (recommended)
                                    </option>
                                    <option value="1h">Every hour</option>
                                    <option value="4h">Every 4 hours</option>
                                    <option value="1d">Daily</option>
                                    <option value="manual">Manual only</option>
                                </select>
                            </div>
                            <div className="xer2-sync-row">
                                <div className="xer2-sync-lab">
                                    Webhooks
                                    <small>
                                        Real-time · when Xero supports
                                    </small>
                                </div>
                                <select
                                    className="xer2-select"
                                    defaultValue="on"
                                    disabled
                                    aria-disabled="true"
                                    aria-label="Webhook setting"
                                >
                                    <option value="on">
                                        Enabled (uses Xero webhooks for
                                        instant sync)
                                    </option>
                                    <option value="off">Disabled</option>
                                </select>
                            </div>
                            <div className="xer2-sync-row">
                                <div className="xer2-sync-lab">
                                    Alerts
                                    <small>When to notify you</small>
                                </div>
                                <select
                                    className="xer2-select"
                                    defaultValue="important"
                                    disabled
                                    aria-disabled="true"
                                    aria-label="Alert setting"
                                >
                                    <option value="important">
                                        Sync failed · large unexpected
                                        transaction
                                    </option>
                                    <option value="all">
                                        All sync events
                                    </option>
                                    <option value="none">None</option>
                                </select>
                            </div>
                            <div className="xer2-sync-row">
                                <div className="xer2-sync-lab">
                                    Auto-reconcile
                                    <small>
                                        Match Plan items to actuals
                                    </small>
                                </div>
                                <select
                                    className="xer2-select"
                                    defaultValue="auto"
                                    disabled
                                    aria-disabled="true"
                                    aria-label="Reconcile setting"
                                >
                                    <option value="auto">
                                        Yes · Plan line auto-links to Xero
                                        account
                                    </option>
                                    <option value="manual">
                                        Manual matching only
                                    </option>
                                </select>
                            </div>
                        </section>
                    </div>

                    {/* ── Rail ───────────────────────────────────────────── */}
                    <aside className="xer2-rail" aria-label="Connection notes">
                        <div className="xer2-status-strip">
                            <span className="xer2-status-ic" aria-hidden="true">
                                ◷
                            </span>
                            <div className="xer2-status-body">
                                <strong>Not connected yet</strong>
                                <br />
                                Everything read-only. Tokens encrypt
                                per-foundry when the handshake lands.
                            </div>
                        </div>

                        <div className="xer2-rail-card">
                            <div className="xer2-rail-head">
                                What changes after connection
                            </div>
                            <ul className="xer2-rail-list">
                                {SURFACE_CHANGES.map((s) => (
                                    <li key={s.surface}>
                                        <strong>{s.surface}</strong> —{" "}
                                        {s.note}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="xer2-rail-card">
                            <div className="xer2-rail-head">
                                What we read (never write)
                            </div>
                            <ul className="xer2-rail-list xer2-rail-list--checks">
                                {READ_SCOPES.map((scope) => (
                                    <li key={scope}>{scope}</li>
                                ))}
                            </ul>
                            <p className="xer2-rail-foot">
                                We don&rsquo;t read payroll details, invoice
                                attachments, or user logs.
                            </p>
                        </div>

                        <div className="xer2-rail-card">
                            <div className="xer2-rail-head">Security</div>
                            <p className="xer2-rail-p">
                                OAuth 2.0 with PKCE. Tokens stored encrypted
                                at rest (AES-256) and scoped to your
                                foundry. Revoke access any time via Xero or
                                here. Full access log available in Settings
                                → Audit.
                            </p>
                        </div>

                        <div className="xer2-rail-card">
                            <div className="xer2-rail-head">Need help?</div>
                            <p className="xer2-rail-p">
                                <strong>
                                    Your accountant can map too.
                                </strong>{" "}
                                Invite them for a read-only session once the
                                connector ships.
                            </p>
                        </div>
                    </aside>
                </div>

                {/* ── Footer ────────────────────────────────────────────── */}
                <div
                    className="xer2-footbar"
                    role="navigation"
                    aria-label="Connect controls"
                >
                    <div className="xer2-footmeta">
                        Preview — Xero OAuth handshake wires up next round.
                        Mapping and sync settings save once the connector is
                        live.
                    </div>
                    <div className="xer2-footbtns">
                        <Link href="/money/cockpit" className="xer2-btn">
                            Cancel
                        </Link>
                        <button
                            type="button"
                            className="xer2-btn"
                            disabled
                            aria-disabled="true"
                            title="Dry-run preview runs once the connector is live."
                        >
                            Run dry-run
                        </button>
                        <button
                            type="button"
                            className="xer2-btn xer2-btn--primary"
                            onClick={handleConnectAttempt}
                            aria-disabled="true"
                            title="OAuth handshake wires up next round."
                        >
                            Confirm + sync →
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
