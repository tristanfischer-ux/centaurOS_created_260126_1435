/**
 * PermissionsView — /money/permissions (Team & permissions).
 *
 * Mockup-faithful port of MONEY-MOCKUP-PERMISSIONS.html, with one deliberate
 * divergence: the mockup draws a 4-role matrix using fictional labels
 * (Founder / Co-founder / Accountant / Contractor). Production uses the REAL
 * 5-value `member_role` enum that ships today:
 *   Founder · Executive · Apprentice · AI_Agent · Supplier.
 *
 * Per HANDOVER-money.md §Post-schema red-team #3 and MONEY-SCHEMA §4, the 9-role
 * expansion is a post-Phase-2 migration. Until that lands, this page renders
 * the coarse-compile matrix using the real enum values. That keeps the UI
 * honest — no role appears in the table that cannot be assigned via the DB.
 *
 * Data contract (see ./page.tsx):
 *   - `members` — one row per active `foundry_memberships`, merged with the
 *     matching `profiles` row for display name + email.
 *   - `currentUserId` — used to append the "you" pill to the matching row.
 *
 * Empty-state: if members is empty we render an honest "just you — invite
 * teammates from onboarding" note rather than faking any roster.
 */

"use client"

import Link from "next/link"
import "./permissions-v2.css"

// ─── Types ──────────────────────────────────────────────────────────────

/**
 * Real DB enum — matches `Database["public"]["Enums"]["member_role"]`.
 * Do NOT expand this without an enum migration; the matrix renders exactly
 * these 5 columns so nothing drifts out of sync with RLS.
 */
export type MemberRole = "Founder" | "Executive" | "Apprentice" | "AI_Agent" | "Supplier"

/** Shape returned by the server page — one entry per foundry_memberships row. */
export interface MemberEntry {
    /** foundry_memberships.id — stable React key. */
    id: string
    /** profiles.id (auth user id). */
    userId: string
    /** Display name — profiles.full_name, falls back to email. */
    name: string
    /** Email — profiles.email. */
    email: string
    /** The real member_role enum value. */
    role: MemberRole
    /** Initials derived server-side for the avatar. */
    initials: string
    /** Deterministic colour pair for the avatar gradient. */
    gradient: { from: string; to: string }
}

export interface PermissionsViewProps {
    members: ReadonlyArray<MemberEntry>
    currentUserId: string
    foundryName: string
}

// ─── Role metadata ──────────────────────────────────────────────────────

/** Display label for a role pill. */
function roleLabel(role: MemberRole): string {
    switch (role) {
        case "Founder":
            return "Founder"
        case "Executive":
            return "Executive"
        case "Apprentice":
            return "Apprentice"
        case "AI_Agent":
            return "Specialist"
        case "Supplier":
            return "Supplier"
    }
}

/**
 * One-line summary of what each role can see across Money. Keeps the members
 * list scannable without forcing the founder to re-read the matrix for every
 * person.
 */
function roleAccessSummary(role: MemberRole): string {
    switch (role) {
        case "Founder":
            return "Full access — Cockpit, Plan, Raise, Settings, Team"
        case "Executive":
            return "Read-only across Cockpit, Plan, and P&L"
        case "Apprentice":
            return "Read-only on Cockpit and Plan"
        case "AI_Agent":
            return "No direct access — specialists act inside Tasks only"
        case "Supplier":
            return "No access — suppliers never see Money"
    }
}

// ─── View ───────────────────────────────────────────────────────────────

export function PermissionsView(props: PermissionsViewProps): React.ReactElement {
    const { members, currentUserId, foundryName } = props

    const memberCount = members.length
    const hasMembers = memberCount > 0

    return (
        <div className="prm2">
            {/* ── Breadcrumb ─────────────────────────────── */}
            <nav className="prm2-breadcrumb" aria-label="Breadcrumb">
                <Link href="/money/cockpit">Money</Link>
                <span className="sep" aria-hidden="true">
                    ›
                </span>
                <span className="current">Team &amp; permissions</span>
            </nav>

            {/* ── Page head ─────────────────────────────── */}
            <div className="prm2-head">
                <div className="prm2-eyebrow">
                    <span className="prm2-title-dot" aria-hidden="true" />
                    Money · Team &amp; permissions
                </div>
                <h1>Team &amp; permissions</h1>
                <p className="sub">
                    Everyone in {foundryName} who can reach Money, with the role I&apos;ve given them and what that role sees.
                    Investors never get a seat here — they receive email updates only.
                </p>
            </div>

            {/* ── Enum-honesty banner ────────────────────── */}
            <div className="prm2-banner" role="note">
                <span className="prm2-banner-icon" aria-hidden="true">
                    ⓘ
                </span>
                <span>
                    <strong>Five roles today.</strong> Money ships against the real{" "}
                    <code>member_role</code> enum — Founder, Executive, Apprentice, Specialist, Supplier. A finer 9-role split
                    (Co-founder, CTO, Advisor, Contractor, Read-only observer, Fractional exec) arrives with the next
                    permissions migration. Until then, those roles collapse into the five below, with per-user overrides
                    available on request.
                </span>
            </div>

            {/* ── Current members ───────────────────────── */}
            <section className="prm2-section" aria-labelledby="prm2-members-heading">
                <h3 id="prm2-members-heading">
                    Current members · {memberCount}
                </h3>
                <p className="prm2-section-sub">
                    Roles come straight from <code>foundry_memberships</code>. Changes take effect on next page load.
                </p>

                {hasMembers ? (
                    <ul className="prm2-members-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        {members.map((m) => {
                            const isYou = m.userId === currentUserId
                            const roleKey = m.role.toLowerCase() // founder | executive | apprentice | ai_agent | supplier
                            return (
                                <li key={m.id} className="prm2-member-row">
                                    <div
                                        className="prm2-avatar"
                                        aria-hidden="true"
                                        style={{
                                            background: `linear-gradient(135deg, ${m.gradient.from}, ${m.gradient.to})`,
                                        }}
                                    >
                                        {m.initials}
                                    </div>
                                    <div className="prm2-member-meta">
                                        <h4>
                                            {m.name}
                                            {isYou && <span className="prm2-you-pill">you</span>}
                                        </h4>
                                        <div className="prm2-member-email">{m.email}</div>
                                    </div>
                                    <span
                                        className={`prm2-role-pill ${roleKey}`}
                                        aria-label={`Role: ${roleLabel(m.role)}`}
                                    >
                                        {roleLabel(m.role)}
                                    </span>
                                    <div className="prm2-access-summary">{roleAccessSummary(m.role)}</div>
                                </li>
                            )
                        })}
                    </ul>
                ) : (
                    <div className="prm2-empty-members" role="status">
                        <strong>Just me for now.</strong>
                        No one else is on {foundryName} yet. I can invite teammates from{" "}
                        <Link href="/onboarding/team" style={{ color: "var(--prm-brand)", fontWeight: 600 }}>
                            Onboarding · Team
                        </Link>
                        .
                    </div>
                )}
            </section>

            {/* ── Role matrix — REAL 5 enum values ──────── */}
            <section className="prm2-section" aria-labelledby="prm2-matrix-heading">
                <h3 id="prm2-matrix-heading">Role permissions · what each role can do</h3>
                <p className="prm2-section-sub">
                    Defaults keep the surface area tight. Founder overrides land with the post-Phase-2 permissions migration —
                    until then, Money reads <code>foundry_memberships.role</code> straight off the enum.
                </p>

                <div style={{ overflowX: "auto" }}>
                    <table className="prm2-matrix" aria-label="Role permissions matrix">
                        <thead>
                            <tr>
                                <th scope="col" style={{ width: "30%" }}>
                                    Capability
                                </th>
                                <th scope="col">Founder</th>
                                <th scope="col">Executive</th>
                                <th scope="col">Apprentice</th>
                                <th scope="col">Specialist</th>
                                <th scope="col">Supplier</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>
                                    <strong>Cockpit</strong> · see runway &amp; burn
                                </td>
                                <td>
                                    <span className="prm2-cell-yes" aria-label="Full access">
                                        ✓
                                    </span>
                                </td>
                                <td>
                                    <span className="prm2-cell-ro">Read</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-ro">Read</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no" aria-label="No access">
                                        —
                                    </span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no" aria-label="No access">
                                        —
                                    </span>
                                </td>
                            </tr>
                            <tr>
                                <td>
                                    <strong>Plan</strong> · see line items
                                </td>
                                <td>
                                    <span className="prm2-cell-yes">✓</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-ro">Read</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-ro">Read</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                            </tr>
                            <tr>
                                <td>
                                    <strong>Plan</strong> · edit line items &amp; scenarios
                                </td>
                                <td>
                                    <span className="prm2-cell-yes">✓</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                            </tr>
                            <tr>
                                <td>
                                    <strong>Variance</strong> · see gaps vs Xero
                                </td>
                                <td>
                                    <span className="prm2-cell-yes">✓</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-ro">Read</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                            </tr>
                            <tr>
                                <td>
                                    <strong>P&amp;L</strong> · view &amp; export
                                </td>
                                <td>
                                    <span className="prm2-cell-yes">✓</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-ro">Read</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                            </tr>
                            <tr>
                                <td>
                                    <strong>Xero</strong> · connect &amp; map accounts
                                </td>
                                <td>
                                    <span className="prm2-cell-yes">✓</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                            </tr>
                            <tr>
                                <td>
                                    <strong>Raise</strong> · see pipeline &amp; investors
                                </td>
                                <td>
                                    <span className="prm2-cell-yes">✓</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                            </tr>
                            <tr>
                                <td>
                                    <strong>Raise</strong> · move stages &amp; log touches
                                </td>
                                <td>
                                    <span className="prm2-cell-yes">✓</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                            </tr>
                            <tr>
                                <td>
                                    <strong>Thesis</strong> · edit
                                </td>
                                <td>
                                    <span className="prm2-cell-yes">✓</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                            </tr>
                            <tr>
                                <td>
                                    <strong>Pitch prep &amp; investor updates</strong>
                                </td>
                                <td>
                                    <span className="prm2-cell-yes">✓</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                            </tr>
                            <tr>
                                <td>
                                    <strong>Tasks assigned to them</strong>
                                </td>
                                <td>
                                    <span className="prm2-cell-yes">✓</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-yes">✓</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-yes">✓</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-yes">✓</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                            </tr>
                            <tr>
                                <td>
                                    <strong>Settings</strong> · change foundry defaults
                                </td>
                                <td>
                                    <span className="prm2-cell-yes">✓</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                            </tr>
                            <tr>
                                <td>
                                    <strong>Permissions</strong> · invite &amp; role-change
                                </td>
                                <td>
                                    <span className="prm2-cell-yes">✓</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                            </tr>
                            <tr>
                                <td>
                                    <strong>Audit log</strong> · view (money scope)
                                </td>
                                <td>
                                    <span className="prm2-cell-yes">✓</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-ro">Read</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-ro">Read</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-ro">Read</span>
                                </td>
                                <td>
                                    <span className="prm2-cell-no">—</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div className="prm2-matrix-legend">
                    <span className="prm2-cell-yes" aria-hidden="true">
                        ✓
                    </span>{" "}
                    full access ·{" "}
                    <span className="prm2-cell-ro" aria-hidden="true">
                        Read
                    </span>{" "}
                    view only ·{" "}
                    <span className="prm2-cell-no" aria-hidden="true">
                        —
                    </span>{" "}
                    no access. Suppliers only reach Marketplace surfaces; specialists act inside Tasks, not Money directly.
                </div>
            </section>
        </div>
    )
}
