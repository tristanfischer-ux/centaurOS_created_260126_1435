/**
 * @file compose/page.tsx — /the-forge-v2/compose (global Comms compose view).
 *
 * @description One composer serves every "Message X" / "Reply" / "Send
 * draft" action in the system. Sidebar-linked (Comms) and always available.
 * Server component that reads the signed-in profile's display name to seed
 * the signature block, then hands a typed props bundle to ComposeView.
 *
 * Data sources:
 *   - profiles.full_name (for the signature seed)
 *
 * What does NOT wire in this round (empty-state by contract):
 *   - recentRecipients — no comms-history action exists yet. The view
 *     renders an honest "No recent recipients" empty state. Once a
 *     getRecentRecipients action lands, it plugs in here.
 *   - Send / Schedule / Save draft — buttons render disabled with a
 *     title tooltip. Wiring ships with the comms mutation.
 *
 * If the user is not signed in we let the signed-out user still land on
 * a neutral compose screen (signatureName → "Your name"). The Platform
 * layout already redirects unauthenticated traffic, so this is belt-and-
 * braces.
 *
 * @related
 *   - View:   ./compose-view.tsx
 *   - Styles: ./compose-v2.css (scoped .cm2 — do NOT modify)
 */

import type { Metadata } from "next"

import { createClient } from "@/lib/supabase/server"

import { ComposeView, type RecentRecipient } from "./compose-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Compose · Comms · The Forge",
    description:
        "One composer for every outbound message — supplier chase, investor update, specialist request.",
}

export default async function ForgeV2ComposePage(): Promise<React.ReactNode> {
    const senderName = await safeSenderName()
    const recentRecipients = await safeRecentRecipients()

    return (
        <ComposeView
            senderName={senderName}
            recentRecipients={recentRecipients}
        />
    )
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Loads the signed-in profile's display name for the signature block.
 * Returns null when the user is signed out or the lookup fails — the
 * view then falls back to "Your name".
 */
async function safeSenderName(): Promise<string | null> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return null

        const { data, error } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", user.id)
            .maybeSingle()
        if (error || !data) return null

        const name = typeof data.full_name === "string" ? data.full_name.trim() : ""
        return name.length > 0 ? name : null
    } catch (err) {
        console.error("[COMPOSE-PAGE] sender name load failed:", err)
        return null
    }
}

/**
 * Loads recent recipients for the side "Recent recipients" card.
 *
 * Contract: there is no comms-history action in the codebase yet
 * (grep for /actions/ returned messaging.ts for in-app conversations,
 * not outbound comms). We intentionally return `[]` so the view
 * renders the honest empty state. Once a getRecentRecipients action
 * lands, swap the body of this function — do NOT fake rows here.
 */
async function safeRecentRecipients(): Promise<RecentRecipient[]> {
    return []
}
