/**
 * OnboardingTeamView — /onboarding/team (Step 4 of 7).
 *
 * Mockup-faithful port of FORGE-MOCKUP-ONBOARD-TEAM.html. Two-column layout:
 * left = invite-by-email form (one row per invitee, up to N rows), right =
 * default permissions matrix (read-only reassurance, not an editor — the
 * mockup is explicit on this). Fixed foot-bar with Back · Skip · Send invites.
 *
 * Roles in the UI use friendly labels the mockup shows (Co-founder, CTO,
 * Engineering lead, Advisor, Contractor, Read-only observer). These map to
 * the {@link MemberRoleEnum} on send:
 *   - Co-founder            → Founder
 *   - CTO / Engineering lead → Executive
 *   - Advisor / Contractor / Read-only observer → Apprentice
 *
 * Email delivery is fully wired — `createInvitation` writes to
 * `company_invitations` AND calls `sendInvitationEmail` (see
 * src/actions/invitations.ts). The honest banner at the top of the form
 * confirms this — invites are real on click.
 *
 * @related
 *   - Server page: ./page.tsx
 *   - Styles:     ./onboarding-team-v2.css (scoped .otm2 — do NOT modify)
 *   - Mockup:     FORGE-MOCKUP-ONBOARD-TEAM.html
 */

"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import "./onboarding-team-v2.css"

import { createInvitation } from "@/actions/invitations"

// ─── Types ─────────────────────────────────────────────────────────────

/** Friendly role labels the mockup shows (not the DB enum). */
type FriendlyRole =
    | "Co-founder"
    | "CTO"
    | "Engineering lead"
    | "Advisor"
    | "Contractor"
    | "Read-only observer"

type MemberRoleEnum = "Founder" | "Executive" | "Apprentice" | "AI_Agent" | "Supplier"

/** Single row in the invite form. */
interface InviteRow {
    /** Stable key for React list rendering — not persisted. */
    key: string
    email: string
    role: FriendlyRole
    /** Row-level validation error (empty email, bad format, duplicate). */
    error: string | null
    /** True once this row was submitted successfully (hides the row for the next send). */
    sent: boolean
}

/** Summary of an existing team member or pending invitation shown in the roster. */
export interface RosterEntry {
    id: string
    name: string
    email: string
    /** Role label — already humanised on the server. */
    role: string
    /** Lifecycle state. "active" = real member, the rest are invitations. */
    status: "active" | "pending" | "expired" | "accepted"
}

export interface OnboardingTeamViewProps {
    /** Existing team members + live invitations, already merged on the server. */
    roster: ReadonlyArray<RosterEntry>
}

// ─── Role mapping ──────────────────────────────────────────────────────

const FRIENDLY_ROLES: ReadonlyArray<FriendlyRole> = [
    "Co-founder",
    "CTO",
    "Engineering lead",
    "Advisor",
    "Contractor",
    "Read-only observer",
]

/**
 * Maps friendly role labels → the member_role DB enum.
 * The DB enum is deliberately narrow (Founder | Executive | Apprentice | AI_Agent | Supplier)
 * so the UI labels collapse into three buckets below.
 */
function friendlyToEnum(role: FriendlyRole): MemberRoleEnum {
    switch (role) {
        case "Co-founder":
            return "Founder"
        case "CTO":
        case "Engineering lead":
            return "Executive"
        case "Advisor":
        case "Contractor":
        case "Read-only observer":
            return "Apprentice"
    }
}

// ─── Utilities ─────────────────────────────────────────────────────────

function newRow(defaultRole: FriendlyRole = "Co-founder"): InviteRow {
    return {
        key: crypto.randomUUID(),
        email: "",
        role: defaultRole,
        error: null,
        sent: false,
    }
}

function isValidEmail(email: string): boolean {
    const trimmed = email.trim()
    if (!trimmed) return false
    // Keep the regex intentionally loose — we let the server do the final check.
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
}

// ─── View ──────────────────────────────────────────────────────────────

export function OnboardingTeamView({ roster }: OnboardingTeamViewProps): React.ReactElement {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    const [rows, setRows] = useState<InviteRow[]>(() => [
        newRow("Co-founder"),
        newRow("CTO"),
        newRow("Advisor"),
    ])

    // Count only unsent, non-empty email rows for the foot-bar meta line.
    const queuedCount = rows.filter((r) => !r.sent && r.email.trim().length > 0).length

    const updateRow = (key: string, patch: Partial<InviteRow>): void => {
        setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch, error: null } : r)))
    }

    const addRow = (): void => {
        setRows((prev) => [...prev, newRow("Advisor")])
    }

    const removeRow = (key: string): void => {
        setRows((prev) => {
            // Keep at least one row visible — remove disabled when only one remains.
            if (prev.length <= 1) return prev
            return prev.filter((r) => r.key !== key)
        })
    }

    /**
     * Sends every non-empty, non-sent row in parallel. Rows with invalid
     * emails or duplicate emails are flagged inline and the send aborts
     * without calling the server. Successful rows are marked `sent` (hidden
     * from the queue) and the matching roster row appears on next reload.
     */
    const handleSend = (): void => {
        // ── Client-side validation ────────────────────────────────────
        const next = [...rows]
        const seen = new Set<string>()
        let hasError = false

        for (const row of next) {
            if (row.sent) continue
            const trimmed = row.email.trim().toLowerCase()
            if (!trimmed) continue // empty rows are simply skipped
            if (!isValidEmail(trimmed)) {
                row.error = "Enter a valid email (name@company.com)."
                hasError = true
                continue
            }
            if (seen.has(trimmed)) {
                row.error = "Duplicate of another row in this batch."
                hasError = true
                continue
            }
            seen.add(trimmed)
        }

        // If at least one row has an error, surface them and stop.
        if (hasError) {
            setRows(next)
            return
        }

        // ── Server send, one `createInvitation` per non-empty row ─────
        const toSend = next.filter((r) => !r.sent && r.email.trim().length > 0)
        if (toSend.length === 0) {
            // Nothing queued → skip straight to the next step. Matches the
            // mockup "Add later" affordance: user can breeze through without
            // inviting anyone.
            router.push("/onboarding/integrations")
            return
        }

        startTransition(async () => {
            const results = await Promise.all(
                toSend.map(async (row) => {
                    const email = row.email.trim().toLowerCase()
                    const roleEnum = friendlyToEnum(row.role)
                    try {
                        const res = await createInvitation(email, roleEnum)
                        return { key: row.key, ok: res.success, error: res.error }
                    } catch (err) {
                        return {
                            key: row.key,
                            ok: false,
                            error: err instanceof Error ? err.message : "Failed to send",
                        }
                    }
                }),
            )

            // Apply per-row result to state.
            const patched = next.map((r) => {
                const hit = results.find((x) => x.key === r.key)
                if (!hit) return r
                if (hit.ok) return { ...r, sent: true, error: null }
                return { ...r, error: hit.error ?? "Failed to send — try again." }
            })

            const anyFailed = patched.some((r) => !r.sent && r.email.trim().length > 0 && r.error)
            setRows(patched)

            // Only advance if every queued row succeeded. Partial success
            // stays on-page so the user can retry the failed ones.
            if (!anyFailed) {
                router.push("/onboarding/integrations")
            }
        })
    }

    const handleSkip = (): void => {
        router.push("/onboarding/integrations")
    }

    const handleBack = (): void => {
        router.push("/onboarding/product")
    }

    // Roster split — "active" = real members, everything else = pending/expired/accepted invites.
    const hasRoster = roster.length > 0

    return (
        <div className="otm2">
            {/* ── Skip / add-later (top right) ──────────────────────── */}
            <div className="otm2-skip-wrap">
                <button
                    type="button"
                    className="otm2-add-later"
                    onClick={handleSkip}
                    disabled={isPending}
                >
                    Add later
                </button>
            </div>

            <div className="otm2-wrap">
                {/* ── Header ────────────────────────────────────────── */}
                <div className="otm2-eyebrow">
                    <span className="otm2-title-dot" aria-hidden="true" />
                    Getting Started · Step 4 of 7
                </div>
                <h1>Bring in your team</h1>
                <p className="otm2-lead">
                    Invite co-founders, engineers, advisors, or observers now. You can invite more any time from Settings.
                </p>

                {/* ── Honest delivery banner ─────────────────────────── */}
                <div className="otm2-delivery-note" role="note">
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                    >
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                        <polyline points="22,6 12,13 2,6" />
                    </svg>
                    <span>
                        <strong>Invites go out by email as soon as you click Send.</strong> Invitees land on a simple accept page — no signup friction. Invites expire in 7 days. Billing isn&apos;t affected until they accept.
                    </span>
                </div>

                {/* ── Two-column grid ────────────────────────────────── */}
                <div className="otm2-two-col">
                    {/* ── Invite card (left) ─────────────────────────── */}
                    <div className="otm2-invite-card">
                        <h2>Invite by email</h2>

                        {rows.map((row, idx) => (
                            <div key={row.key}>
                                {!row.sent && (
                                    <div className="otm2-invite-row">
                                        <input
                                            type="email"
                                            placeholder="name@company.com"
                                            value={row.email}
                                            onChange={(e) => updateRow(row.key, { email: e.target.value })}
                                            aria-label={`Email for invite ${idx + 1}`}
                                            aria-invalid={row.error ? "true" : "false"}
                                            disabled={isPending}
                                            autoComplete="email"
                                        />
                                        <select
                                            value={row.role}
                                            onChange={(e) =>
                                                updateRow(row.key, { role: e.target.value as FriendlyRole })
                                            }
                                            aria-label={`Role for invite ${idx + 1}`}
                                            disabled={isPending}
                                        >
                                            {FRIENDLY_ROLES.map((r) => (
                                                <option key={r} value={r}>
                                                    {r}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            className="otm2-remove"
                                            onClick={() => removeRow(row.key)}
                                            disabled={rows.length <= 1 || isPending}
                                            aria-label={`Remove invite ${idx + 1}`}
                                        >
                                            ✕
                                        </button>
                                        {row.error && <div className="otm2-row-error">{row.error}</div>}
                                    </div>
                                )}
                                {row.sent && (
                                    <div className="otm2-invite-row" aria-live="polite">
                                        <div
                                            style={{
                                                gridColumn: "1 / -1",
                                                fontSize: "12px",
                                                color: "var(--otm-success)",
                                                fontWeight: 500,
                                                padding: "4px 0",
                                            }}
                                        >
                                            ✓ Invite sent to {row.email.trim().toLowerCase()}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}

                        <button
                            type="button"
                            className="otm2-add-invite"
                            onClick={addRow}
                            disabled={isPending}
                        >
                            + Add another
                        </button>

                        <div className="otm2-invite-foot">
                            Invites expire in 7 days. Invitees land on a simple accept page — no signup friction. Billing isn&apos;t affected until they accept.
                        </div>

                        {/* ── Roster (existing team + pending invites) ─── */}
                        {hasRoster ? (
                            <div className="otm2-roster">
                                <h3>Already on your team</h3>
                                <ul className="otm2-roster-list">
                                    {roster.map((entry) => (
                                        <li key={entry.id} className="otm2-roster-row">
                                            <div>
                                                <div className="otm2-roster-name">{entry.name}</div>
                                                <div className="otm2-roster-email">{entry.email}</div>
                                            </div>
                                            <div className="otm2-roster-meta">
                                                <span className="otm2-roster-role">{entry.role}</span>
                                                <span
                                                    className={`otm2-roster-status ${
                                                        entry.status === "active" || entry.status === "accepted"
                                                            ? "accepted"
                                                            : entry.status
                                                    }`}
                                                >
                                                    {entry.status === "active" && "Active"}
                                                    {entry.status === "pending" && "Invite pending"}
                                                    {entry.status === "expired" && "Invite expired"}
                                                    {entry.status === "accepted" && "Joined"}
                                                </span>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <div className="otm2-first-state">
                                <strong>You&apos;ll be the first.</strong> No one else is on your team yet — invites you send
                                above will appear here as pending until each person accepts.
                            </div>
                        )}
                    </div>

                    {/* ── Matrix card (right) ────────────────────────── */}
                    <div className="otm2-matrix-card">
                        <h2>Default permissions</h2>
                        <div className="otm2-matrix-sub">
                            What each role can see and edit. Tweak per person in Settings → Team after onboarding.
                        </div>
                        <table className="otm2-matrix">
                            <thead>
                                <tr>
                                    <th></th>
                                    <th>Co-founder</th>
                                    <th>CTO / Eng lead</th>
                                    <th>Advisor</th>
                                    <th>Observer</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>Products</td>
                                    <td><span className="otm2-badge-rw">R/W</span></td>
                                    <td><span className="otm2-badge-rw">R/W</span></td>
                                    <td><span className="otm2-badge-rw">R/W</span></td>
                                    <td><span className="otm2-badge-ro">R</span></td>
                                </tr>
                                <tr>
                                    <td>The Forge</td>
                                    <td><span className="otm2-badge-rw">R/W</span></td>
                                    <td><span className="otm2-badge-rw">R/W</span></td>
                                    <td><span className="otm2-badge-ro">R</span></td>
                                    <td><span className="otm2-badge-ro">R</span></td>
                                </tr>
                                <tr>
                                    <td>Cost &amp; BOM</td>
                                    <td><span className="otm2-badge-rw">R/W</span></td>
                                    <td><span className="otm2-badge-ro">R</span></td>
                                    <td><span className="otm2-badge-ro">R</span></td>
                                    <td><span className="otm2-badge-no">—</span></td>
                                </tr>
                                <tr>
                                    <td>Cash Burn</td>
                                    <td><span className="otm2-badge-rw">R/W</span></td>
                                    <td><span className="otm2-badge-no">—</span></td>
                                    <td><span className="otm2-badge-no">—</span></td>
                                    <td><span className="otm2-badge-no">—</span></td>
                                </tr>
                                <tr>
                                    <td>Investors / Fundraise</td>
                                    <td><span className="otm2-badge-rw">R/W</span></td>
                                    <td><span className="otm2-badge-no">—</span></td>
                                    <td><span className="otm2-badge-ro">R</span></td>
                                    <td><span className="otm2-badge-no">—</span></td>
                                </tr>
                                <tr>
                                    <td>Risks</td>
                                    <td><span className="otm2-badge-rw">R/W</span></td>
                                    <td><span className="otm2-badge-rw">R/W</span></td>
                                    <td><span className="otm2-badge-ro">R</span></td>
                                    <td><span className="otm2-badge-ro">R</span></td>
                                </tr>
                            </tbody>
                        </table>
                        <div className="otm2-matrix-foot">
                            Cost &amp; Cash Burn default to founder-only because most teams want financials held close early on.{" "}
                            <Link href="/settings/team">Open in full permissions editor →</Link>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Foot bar ─────────────────────────────────────────── */}
            <div className="otm2-foot-bar">
                <div className="otm2-foot-meta">
                    Step 4 of 7 · {queuedCount} {queuedCount === 1 ? "invite" : "invites"} queued
                </div>
                <button
                    type="button"
                    className="otm2-btn-cancel"
                    onClick={handleBack}
                    disabled={isPending}
                >
                    ← Back
                </button>
                <button
                    type="button"
                    className="otm2-btn-skip"
                    onClick={handleSkip}
                    disabled={isPending}
                >
                    Skip
                </button>
                <button
                    type="button"
                    className="otm2-btn-next"
                    onClick={handleSend}
                    disabled={isPending}
                    aria-busy={isPending ? "true" : "false"}
                >
                    {isPending ? (
                        <>
                            <span className="otm2-spinner" aria-hidden="true" /> Sending…
                        </>
                    ) : queuedCount === 0 ? (
                        "Continue →"
                    ) : (
                        "Send invites →"
                    )}
                </button>
            </div>
        </div>
    )
}
