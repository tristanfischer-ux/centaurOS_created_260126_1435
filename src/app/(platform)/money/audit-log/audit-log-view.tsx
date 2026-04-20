/**
 * AuditLogView — Money Audit log page (V2, mockup-faithful).
 *
 * Port of MONEY-MOCKUP-AUDIT-LOG.html. Scoped CSS under `.aud2` keeps the
 * mockup's palette / typography isolated from the rest of the platform.
 *
 * Sections (top to bottom, matching the mockup order):
 *   1. Breadcrumb
 *   2. Page header — title + sub + stats tiles + Export CSV CTA
 *   3. Filters row — search + action + scope + member + range
 *   4. Log table — header row + event rows (or honest empty state)
 *   5. Engineering annotation footer
 *
 * Empty-state policy: the `audit_log` table exists (per main schema) but
 * Money V2 server actions have not shipped yet, so no rows with
 * `entity_type LIKE 'money_%'` exist today. When the query returns zero
 * rows, render the agreed-upon honest empty-state copy — never fabricate
 * the Tristan/Jian/Helen example events shown in the mockup.
 *
 * Filters are rendered as visible, disabled controls. The filter wiring
 * lands once real Money mutations exist — until then, an enabled filter
 * would only ever operate on an empty dataset.
 */

"use client"

import Link from "next/link"
import "./audit-log-v2.css"

// ─── Types ──────────────────────────────────────────────────────────────

/**
 * Broad classification of an audit event. Derived from the `action` field
 * on `audit_log` at query time; falls back to `neutral` when the action
 * keyword doesn't match one of the five known buckets.
 */
export type AuditActionPill =
    | "create"
    | "edit"
    | "delete"
    | "login"
    | "auto"
    | "neutral"

/**
 * Human-facing label for the action pill. Keeps the SQL action keyword
 * ("created" / "updated" / "sync_ran" / …) out of the UI so the mockup's
 * "Move" / "Invite" / "Connect" / "Sync" vocabulary stays intact.
 */
export interface AuditEventRow {
    /** Stable key — audit_log.id. */
    id: string
    /** ISO timestamp from audit_log.created_at. */
    createdAtIso: string
    /**
     * Pre-formatted "Today · 09:24" / "18 Apr · 17:22" label. Server
     * derives this so we keep timezone formatting out of the client and
     * avoid hydration mismatch on the initials / dates.
     */
    whenLabel: string
    /** Actor display name — "Tristan", "Jian", "Helen (accountant)", "System". */
    actorName: string
    /** 2-letter initials for the avatar circle. "✱" for system events. */
    actorInitials: string
    /** Tone for the avatar background — brand | system | default. */
    actorTone: "brand" | "system" | "default"
    /**
     * Headline "what happened" sentence, as plain text. Example:
     * `edited cost line Payroll — 5 FTEs`. Rendered after the bold
     * actor name so the sentence reads "Tristan edited cost line …".
     */
    whatHappened: string
    /**
     * Optional diff / detail line rendered in the monospace meta style.
     * Null when the audit row's metadata / payload has no useful context.
     */
    diffLine: string | null
    /**
     * Scope breadcrumb — "Plan · line item", "Raise · pipeline", etc.
     * Derived from `entity_type` + `section` at query time.
     */
    scopeLabel: string
    /** Pill bucket — see AuditActionPill. */
    actionPill: AuditActionPill
    /** Plain-English pill label — "Edit", "Move", "Create", "Connect". */
    actionPillLabel: string
}

export interface AuditLogViewProps {
    /**
     * Header stat tile values. Each is nullable — if the DB has no rows
     * yet, we render an em-dash rather than a fabricated "23 today" count.
     */
    stats: {
        eventsToday: number | null
        lastSevenDays: number | null
        membersLogged: number | null
        /** "7 yr" / "5 yr" — reads from money_settings when that table lands, null until then. */
        retentionLabel: string | null
    }
    /**
     * Pre-formatted event rows ready to render. Empty array → honest empty
     * state. Server applies the foundry-scoped + `entity_type LIKE 'money_%'`
     * filter before passing rows through.
     */
    rows: AuditEventRow[]
    /**
     * Total count for the "N events match" line in the filters row.
     * Null when we couldn't compute a count (empty state hides the line).
     */
    matchCount: number | null
}

// ─── View ───────────────────────────────────────────────────────────────

export function AuditLogView(props: AuditLogViewProps): React.ReactElement {
    const { stats, rows, matchCount } = props
    const hasRows = rows.length > 0

    return (
        <div className="aud2">
            {/* ── Breadcrumb ─────────────────────────────── */}
            <div className="aud2-breadcrumb">
                <Link href="/money/cockpit">Money</Link>
                <span className="sep">›</span>
                <span className="current">Audit log</span>
            </div>

            {/* ── Page header ────────────────────────────── */}
            <div className="aud2-head">
                <div className="aud2-head-cta">
                    <span
                        className="aud2-btn soon"
                        title="Export CSV lands once the Money V2 audit surface is wired end-to-end"
                    >
                        Export CSV
                    </span>
                </div>
                <div className="aud2-head-title">
                    <span className="aud2-title-dot" aria-hidden="true" />
                    <h1>Audit log</h1>
                </div>
                <div className="sub">
                    Chronological record of all material changes in Money. Invaluable for investor
                    due diligence, accountant handoffs, and &ldquo;who moved my runway?&rdquo;
                    mysteries. Retained per the foundry&apos;s data-retention setting.
                </div>

                <div className="aud2-stats-row">
                    <div className="aud2-stat-tile">
                        <div className="lab">Events today</div>
                        <div className="val">{stats.eventsToday ?? "—"}</div>
                    </div>
                    <div className="aud2-stat-tile">
                        <div className="lab">Last 7 days</div>
                        <div className="val">{stats.lastSevenDays ?? "—"}</div>
                    </div>
                    <div className="aud2-stat-tile">
                        <div className="lab">Members logged</div>
                        <div className="val">{stats.membersLogged ?? "—"}</div>
                    </div>
                    <div className="aud2-stat-tile">
                        <div className="lab">Retention</div>
                        <div className="val">{stats.retentionLabel ?? "—"}</div>
                    </div>
                </div>
            </div>

            {/* ── Filters row ────────────────────────────── */}
            <div className="aud2-filters">
                <span className="lab">Filter</span>
                <input
                    type="text"
                    placeholder="Search · 'payroll', 'scenario', 'Xero'…"
                    disabled
                    aria-label="Search audit events"
                />
                <select disabled aria-label="Filter by action">
                    <option>All actions</option>
                    <option>Create only</option>
                    <option>Edit only</option>
                    <option>Delete only</option>
                </select>
                <select disabled aria-label="Filter by scope">
                    <option>All scopes</option>
                    <option>Plan</option>
                    <option>Scenarios</option>
                    <option>Raise</option>
                    <option>Settings</option>
                    <option>Permissions</option>
                    <option>Integrations</option>
                </select>
                <select disabled aria-label="Filter by member">
                    <option>All members</option>
                </select>
                <select disabled aria-label="Filter by date range">
                    <option>Last 7 days</option>
                    <option>Last 30 days</option>
                    <option>Last quarter</option>
                    <option>All time</option>
                </select>
                <span className="spacer" />
                <span className="count">
                    {matchCount != null ? `${matchCount} ${matchCount === 1 ? "event" : "events"} match` : "no events yet"}
                </span>
            </div>

            {/* ── Log table ──────────────────────────────── */}
            <div className="aud2-table">
                <div className="aud2-row head">
                    <div>When</div>
                    <div aria-hidden="true" />
                    <div>What happened</div>
                    <div>Scope</div>
                    <div style={{ textAlign: "right" }}>Action</div>
                </div>

                {hasRows ? (
                    rows.map((row) => (
                        <div key={row.id} className="aud2-row">
                            <div className="when">{row.whenLabel}</div>
                            <div className={`actor ${row.actorTone === "brand" ? "brand" : row.actorTone === "system" ? "system" : ""}`}>
                                {row.actorInitials}
                            </div>
                            <div className="what">
                                <strong>{row.actorName}</strong> {row.whatHappened}
                                {row.diffLine ? <span className="diff">{row.diffLine}</span> : null}
                            </div>
                            <div className="scope">{row.scopeLabel}</div>
                            <div>
                                <span className={`action-pill ${row.actionPill}`}>{row.actionPillLabel}</span>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="aud2-empty">
                        <strong>No money events yet</strong>
                        Actions appear here as you connect data sources, log expenses, or send updates.
                    </div>
                )}
            </div>

            {/* ── Engineering annotation footer ──────────── */}
            <div className="aud2-annot">
                <strong>Note</strong>
                The audit log is append-only and foundry-scoped. Every mutating Money server action
                writes one <code>audit_log</code> row with <code>section = &apos;money&apos;</code>
                {" "}and an <code>entity_type</code> tagged to the affected record. Retention is
                governed by <code>money_settings.retention_years</code> once that setting lands;
                a nightly job archives older rows.
            </div>
        </div>
    )
}
