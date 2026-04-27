/**
 * @file page.tsx — Welcome page (first-login tour from Tristan)
 *
 * @description Server component that fetches the authenticated user's first
 * name for a personalised greeting, then renders the WelcomeView. This is
 * the landing page for every brand-new account — setup-new-user returns
 * `/welcome` as the post-signup redirectPath. Existing users can also reach
 * it from the "Welcome" item in the Me section of the sidebar at any time.
 *
 * @security Requires authenticated user. Redirects to /login if not.
 *
 * @related
 * - View: src/app/(platform)/welcome/welcome-view.tsx
 * - Server action: src/actions/welcome.ts
 * - Redirect source: src/lib/auth/setup-new-user.ts (redirectPath)
 */

import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { WelcomeView } from "./welcome-view"

export const metadata: Metadata = {
    title: "Welcome to Fractional Forge",
    description:
        "A welcome from Tristan Fischer, Founder of Fractional Forge — Brainstorming, the Forge, Investors, and Suppliers for hardware startups.",
}

export default async function WelcomePage(): Promise<React.ReactNode> {
    // AUTH: Verify user is authenticated
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect("/login")

    const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, foundry_id")
        .eq("id", user.id)
        .single()

    const firstName = profile?.full_name?.split(" ")[0] || undefined

    // Tristan 2026-04-27: detect missing foundry stage/sector so the
    // Welcome page can prompt for them inline. Without this, new
    // signups land with an all-null sandbox foundry and downstream
    // sections (Investors, Brainstorming match-scoring) silently
    // degrade. See drawer_forgeos_gotchas about the tour-removal cascade.
    let foundryProfileMissing = false
    if (profile?.foundry_id) {
        const { data: foundry } = await supabase
            .from("foundries")
            .select("stage, sector, industry, is_sandbox")
            .eq("id", profile.foundry_id)
            .single()
        if (foundry && !foundry.stage && !foundry.sector && !foundry.industry) {
            foundryProfileMissing = true
        }
    }

    return <WelcomeView firstName={firstName} foundryProfileMissing={foundryProfileMissing} />
}
