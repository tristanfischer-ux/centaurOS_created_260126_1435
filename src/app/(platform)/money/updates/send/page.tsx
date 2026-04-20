/**
 * @file money/updates/send/page.tsx — /money/updates/send
 *
 * @description Investor update "preview before send" surface for Money V2.
 * Mockup-faithful port of MONEY-MOCKUP-UPDATE-SEND.html.
 *
 * The outbound delivery path (per-recipient tokenised send via Resend / SES,
 * per MONEY-SCHEMA §investor_update + §investor_update_recipient) is NOT
 * wired today — the `investor_update` migrations ship with Phase 2 build,
 * and no delivery webhook handler exists. This page therefore renders as
 * an HONEST PREVIEW: the editor fields are fully interactive, subject +
 * headline + body persist to localStorage so nothing is lost between
 * visits, but no email is sent and no `investor_update` row is written.
 *
 * Data sources (server):
 *   - profiles.full_name — seeds the "From" sender name in the email
 *     preview chrome.
 *   - auth.users.email  — seeds the "From" sender address.
 *   - foundries.name (via active membership) — seeds the email footer line.
 *
 * What does NOT wire this round (empty-state by contract):
 *   - Recipients list — needs a server action that resolves the Raise
 *     pipeline into recipient rows. Preview shows an honest "populates
 *     from your pipeline once delivery wires" empty state.
 *   - Send / Schedule / Test-send buttons — render enabled so click
 *     always produces feedback (toast + local save), never a dead button.
 *   - Headline / KPI / traction / ask content — founder types their own;
 *     no fabricated seeded copy per only-real-supabase-data rule.
 *
 * @security Requires an authenticated user. Redirects to /login otherwise.
 *   No writes to Supabase today — local draft only.
 *
 * @related
 *   - Mockup:  /MONEY-MOCKUP-UPDATE-SEND.html
 *   - View:    ./update-send-view.tsx
 *   - Styles:  ./update-send-v2.css (scoped .upd2 — do NOT modify)
 *   - Handover: /HANDOVER-money.md §Raise · investor update
 *   - Schema:  /MONEY-SCHEMA.md §investor_update + §investor_update_recipient
 */

import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

import { UpdateSendView } from "./update-send-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Send preview · Investor update · Money · ForgeOS",
    description:
        "Preview the monthly investor update before it goes out. Drafts save locally; outbound delivery wires up next round.",
}

export default async function MoneyUpdateSendPage(): Promise<React.ReactNode> {
    // AUTH: page must not be reachable to anonymous users
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect("/login")

    const senderName = await safeSenderName(user.id)
    const senderEmail = typeof user.email === "string" && user.email.length > 0
        ? user.email
        : null
    const foundryName = await safeFoundryName(user.id)

    return (
        <UpdateSendView
            senderName={senderName}
            senderEmail={senderEmail}
            foundryName={foundryName}
        />
    )
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Loads the signed-in profile's display name for the "From" row preview.
 * Returns null when the lookup fails — the view falls back to "Your name".
 */
async function safeSenderName(userId: string): Promise<string | null> {
    try {
        const supabase = await createClient()
        const { data, error } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", userId)
            .maybeSingle()
        if (error || !data) return null
        const name = typeof data.full_name === "string" ? data.full_name.trim() : ""
        return name.length > 0 ? name : null
    } catch (err) {
        console.error("[money/updates/send] sender name load failed:", err)
        return null
    }
}

/**
 * Loads the signed-in user's active foundry name for the email footer.
 * Returns null when the lookup fails — the view falls back to
 * "Your foundry".
 *
 * Uses `foundry_memberships` per SHARED-SCHEMA §1.2. Picks the first
 * active membership; multi-foundry users see their primary foundry today.
 * A future workspace-picker context will pipe the selected foundry here.
 */
async function safeFoundryName(userId: string): Promise<string | null> {
    try {
        const supabase = await createClient()
        const { data, error } = await supabase
            .from("foundry_memberships")
            .select("foundry_id, foundries(name)")
            .eq("user_id", userId)
            .eq("active", true)
            .limit(1)
            .maybeSingle()
        if (error || !data) return null
        const foundry = (data as { foundries?: { name?: string | null } | null }).foundries
        if (!foundry) return null
        const name = typeof foundry.name === "string" ? foundry.name.trim() : ""
        return name.length > 0 ? name : null
    } catch (err) {
        console.error("[money/updates/send] foundry name load failed:", err)
        return null
    }
}
