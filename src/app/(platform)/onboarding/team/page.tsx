/**
 * @file onboarding/team/page.tsx — /onboarding/team (Step 4 of 7).
 *
 * @description Onboarding "Bring in your team" step — invite by email with a
 * live permissions matrix on the right. Server component: loads the current
 * foundry's profiles + any live `company_invitations` rows, merges them into
 * a roster contract, and hands it to {@link OnboardingTeamView} (client).
 *
 * @related
 *   - Mockup:  FORGE-MOCKUP-ONBOARD-TEAM.html
 *   - View:    ./onboarding-team-view.tsx
 *   - Styles:  ./onboarding-team-v2.css  (scoped .otm2 — do NOT modify)
 *   - Invite:  src/actions/invitations.ts — `createInvitation` is the wired
 *              send path, including `sendInvitationEmail`.
 */

import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"

import { OnboardingTeamView, type RosterEntry } from "./onboarding-team-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Bring in your team · ForgeOS",
    description: "Invite co-founders, engineers, advisors, or observers. Step 4 of 7 in ForgeOS onboarding.",
}

// ─── Role humaniser ────────────────────────────────────────────────────

/**
 * Maps the `member_role` enum stored in the DB to a friendly label for the
 * roster list. This is display-only; the invite form uses its own friendly
 * vocabulary (Co-founder / CTO / Engineering lead / Advisor / Contractor /
 * Read-only observer) and collapses them back to the enum on send.
 */
function roleLabel(role: string): string {
    switch (role) {
        case "Founder":
            return "Founder"
        case "Executive":
            return "Executive"
        case "Apprentice":
            return "Team member"
        case "AI_Agent":
            return "Specialist"
        case "Supplier":
            return "Supplier"
        default:
            return role
    }
}

// ─── Page ──────────────────────────────────────────────────────────────

export default async function OnboardingTeamPage(): Promise<React.ReactNode> {
    const supabase = await createClient()

    // ── 1. Auth + foundry resolution ───────────────────────────────────
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
        redirect("/login?next=/onboarding/team")
    }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) {
        // No foundry yet — user hasn't finished step 2 of onboarding.
        redirect("/onboarding/foundry")
    }

    // ── 2. Load existing profiles + live invitations in parallel ───────
    // Profiles scoped to this foundry via `foundry_id`. Invitations are
    // scoped via the `foundry_id` FK and RLS. Errors on either side fall
    // back to an empty list — the view handles the "first" empty state.
    const [profilesRes, invitationsRes] = await Promise.all([
        supabase
            .from("profiles")
            .select("id, full_name, email, role")
            .eq("foundry_id", foundryId)
            .neq("role", "AI_Agent")
            .order("full_name", { ascending: true, nullsFirst: false }),
        supabase
            .from("company_invitations")
            .select("id, email, role, expires_at, accepted_at")
            .eq("foundry_id", foundryId)
            .order("created_at", { ascending: false }),
    ])

    // ── 3. Build the roster — active members first, then invitations ──
    const nowIso = new Date().toISOString()
    const roster: RosterEntry[] = []

    for (const row of profilesRes.data ?? []) {
        // Skip the current user — they see themselves as "you" implicitly;
        // the roster is meant to show the other people on their team.
        if (row.id === user.id) continue
        roster.push({
            id: `profile:${row.id}`,
            name: row.full_name?.trim() || row.email,
            email: row.email,
            role: roleLabel(row.role),
            status: "active",
        })
    }

    for (const inv of invitationsRes.data ?? []) {
        // Accepted invitations duplicate an "active" profile row — skip them.
        if (inv.accepted_at) continue
        const expired = inv.expires_at && inv.expires_at < nowIso
        roster.push({
            id: `invite:${inv.id}`,
            name: inv.email,
            email: inv.email,
            role: roleLabel(inv.role),
            status: expired ? "expired" : "pending",
        })
    }

    return <OnboardingTeamView roster={roster} />
}
