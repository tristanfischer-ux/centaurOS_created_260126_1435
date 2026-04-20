/**
 * @file money/permissions/page.tsx — /money/permissions (Team & permissions).
 *
 * @description Money · Team &amp; permissions — mockup-faithful port of
 * MONEY-MOCKUP-PERMISSIONS.html. Lists every active member of the founder's
 * foundry with the role the DB actually holds (5-value `member_role` enum),
 * then renders the real 5-column permissions matrix beneath.
 *
 * The mockup imagines a 9-role world (Founder / Co-founder / Accountant /
 * Contractor plus Advisor / Read-only observer / CTO / Fractional exec /
 * Apprentice). Production ships the real enum today — see HANDOVER-money.md
 * §Post-schema red-team #3 and MONEY-SCHEMA §4. The 9-role expansion lives in
 * its own follow-up migration. Rendering fictional roles in the matrix would
 * let an Executive "Accountant" click appear that RLS doesn't understand —
 * this page never lies about that.
 *
 * Data sources:
 *   - `foundry_memberships` scoped to the current foundry (active = true)
 *   - `profiles` joined on user_id for display name + email
 *   - `foundries.name` for the page subtitle
 *
 * @related
 *   - View:   ./permissions-view.tsx
 *   - Styles: ./permissions-v2.css (scoped .prm2 — do NOT modify)
 *   - Mockup: MONEY-MOCKUP-PERMISSIONS.html
 *   - Schema: MONEY-SCHEMA.md §4 (target 9-role matrix)
 *   - Enum:   src/types/database.types.ts — Database["public"]["Enums"]["member_role"]
 */

import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"

import { PermissionsView, type MemberEntry, type MemberRole } from "./permissions-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Team & permissions · Money · ForgeOS",
    description: "Who can reach Money — role-by-role access across Cockpit, Plan, Raise, and admin surfaces.",
}

// ─── Helpers ───────────────────────────────────────────────────────────

/** Deterministic palette pairs for avatar gradients, keyed off user_id hash. */
const AVATAR_GRADIENTS: ReadonlyArray<{ from: string; to: string }> = [
    { from: "#ff4500", to: "#ea580c" }, // orange
    { from: "#db2777", to: "#be185d" }, // magenta
    { from: "#16a34a", to: "#15803d" }, // green
    { from: "#2563eb", to: "#1d4ed8" }, // blue
    { from: "#7c3aed", to: "#5b21b6" }, // violet
    { from: "#0891b2", to: "#0e7490" }, // teal
    { from: "#d97706", to: "#b45309" }, // amber
    { from: "#64748b", to: "#475569" }, // slate
]

/**
 * Stable-per-user avatar colour. Not a security boundary — just makes the list
 * visually parseable. Uses a tiny djb2-style hash so the same user always lands
 * on the same gradient across reloads.
 */
function gradientFor(userId: string): { from: string; to: string } {
    let hash = 5381
    for (let i = 0; i < userId.length; i++) {
        hash = ((hash << 5) + hash + userId.charCodeAt(i)) | 0
    }
    const idx = Math.abs(hash) % AVATAR_GRADIENTS.length
    return AVATAR_GRADIENTS[idx]
}

/** Two-letter initials from full name, falling back to email local-part. */
function initialsFor(name: string, email: string): string {
    const source = name.trim() || email.split("@")[0]
    const parts = source.split(/[\s._-]+/).filter(Boolean)
    if (parts.length === 0) return "?"
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// ─── Page ──────────────────────────────────────────────────────────────

export default async function MoneyPermissionsPage(): Promise<React.ReactNode> {
    const supabase = await createClient()

    // ── 1. Auth + foundry resolution ───────────────────────────────────
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
        redirect("/login?next=/money/permissions")
    }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) {
        // Mirrors the onboarding redirect pattern used across the platform.
        redirect("/onboarding/foundry")
    }

    // ── 2. Load foundry name + members in parallel ────────────────────
    // `foundry_memberships` is the source of truth for Money access.
    // Profile display fields (name + email) are fetched separately — the
    // `user_id` FK resolves to both `profiles` and the `buyer_stats` view, so
    // a PostgREST implicit join would be ambiguous. An explicit second query
    // keeps the contract unambiguous.
    const [foundryRes, membershipsRes] = await Promise.all([
        supabase.from("foundries").select("id, name").eq("id", foundryId).maybeSingle(),
        supabase
            .from("foundry_memberships")
            .select("id, user_id, role, active, joined_at")
            .eq("foundry_id", foundryId)
            .eq("active", true)
            .order("joined_at", { ascending: true, nullsFirst: true }),
    ])

    const foundryName = foundryRes.data?.name ?? "your foundry"

    type MembershipRow = {
        id: string
        user_id: string
        role: MemberRole
    }
    const rawMembers = (membershipsRes.data ?? []) as unknown as MembershipRow[]
    const userIds = rawMembers.map((m) => m.user_id)

    // Hydrate profile fields for every member in one round-trip.
    type ProfileRow = { id: string; full_name: string | null; email: string }
    const profileMap = new Map<string, ProfileRow>()
    if (userIds.length > 0) {
        const { data: profileRows } = await supabase
            .from("profiles")
            .select("id, full_name, email")
            .in("id", userIds)
        for (const p of (profileRows ?? []) as ProfileRow[]) {
            profileMap.set(p.id, p)
        }
    }

    // ── 3. Shape the view contract ────────────────────────────────────
    // Drop rows where the matching profile no longer exists (rare — usually
    // a half-deleted user). Rendering a mystery avatar would be dishonest.
    const members: MemberEntry[] = rawMembers.flatMap((m) => {
        const profile = profileMap.get(m.user_id)
        if (!profile) return []
        const name = (profile.full_name ?? "").trim() || profile.email
        return [
            {
                id: m.id,
                userId: m.user_id,
                name,
                email: profile.email,
                role: m.role,
                initials: initialsFor(name, profile.email),
                gradient: gradientFor(m.user_id),
            },
        ]
    })

    return <PermissionsView members={members} currentUserId={user.id} foundryName={foundryName} />
}
