/**
 * @file (public-discovery)/agents/page.tsx
 *
 * @description Anonymous /agents landing per RED-TEAM-PIVOT-PLAN Tier 2
 * step 16. Mirrors the anonymous /investors pattern from commit 4ca0f085.
 *
 * Unauthenticated visitors land here and see:
 * - "You are browsing anonymously" banner
 * - Council tier picker (Quick / Full / Deep / Strategy) with Quick unlocked
 *   and the rest locked behind the signup wall
 * - A hand-crafted teaser brainstorm transcript (Sage + Fiona on Series A
 *   vs runway extension) so visitors see real specialist depth before signing up
 * - Three blurred meeting cards prompting signup
 *
 * Authenticated visitors are served the real /agents page logic via the
 * (public-discovery) layout which renders full platform chrome when a user
 * session exists. The server component detects auth state, renders
 * AnonymousAgentsView for unauthenticated visitors and the authenticated
 * SpecialistsPage content for signed-in users.
 *
 * Deep-dive routes (/agents/m/<id>) stay under (platform) and require login.
 *
 * @security Public layout, no auth gate at route level. Sensitive user data
 * is never fetched when authedUser is null.
 */

import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAgentWorkflows, getAgentCustomPrompts } from "@/actions/agent-workflows"
import { getUserSubscription } from "@/lib/billing/subscriptions"
import type { SubscriptionTier } from "@/lib/billing/plans"
import { SpecialistsPageClient } from "../../(platform)/agents/specialists-page-client"
import { AnonymousAgentsView } from "./AnonymousAgentsView"
import { BrainstormingCouncilView } from "./BrainstormingCouncilView"

export const metadata: Metadata = {
    title: "Your Specialist Team",
    description:
        "Talk to your key leaders one-on-one, or join a team huddle where they have already identified what needs discussing.",
    openGraph: {
        title: "Your Specialist Team",
        description:
            "Talk to your key leaders one-on-one, or join a team huddle where they have already identified what needs discussing.",
        type: "website",
    },
}

export const dynamic = "force-dynamic"

// Brainstorming Council convenes 6 OpenRouter LLMs in parallel; the
// hosted server action can take ~80–120s wall-clock. Default Vercel
// budget killed all in-flight fetches → "operation aborted" everywhere.
export const maxDuration = 180

export default async function PublicAgentsPage() {
    const supabaseAuth = await createClient()
    const {
        data: { user: authedUser },
    } = await supabaseAuth.auth.getUser()

    // ── Anonymous visitor ──────────────────────────────────────────────────
    if (!authedUser) {
        return <AnonymousAgentsView />
    }

    // ── Authenticated visitor — mirror (platform)/agents/page.tsx logic ────
    // The (public-discovery) layout renders full platform chrome when a
    // session is present, so this content lands inside the sidebar shell.
    const [workflowsResult, customPromptsResult] = await Promise.allSettled([
        getAgentWorkflows(),
        getAgentCustomPrompts(),
    ])

    const savedWorkflows =
        workflowsResult.status === "fulfilled"
            ? (workflowsResult.value.data ?? [])
            : []
    const savedCustomPrompts =
        customPromptsResult.status === "fulfilled"
            ? (customPromptsResult.value.data ?? [])
            : []

    let userTier: SubscriptionTier = "free"
    let brainstormsUsedThisMonth = 0
    try {
        const { subscription } = await getUserSubscription(authedUser.id)
        const isActive =
            subscription?.status === "active" ||
            subscription?.status === "trialing"
        userTier = (
            subscription && isActive ? subscription.tier : "free"
        ) as SubscriptionTier

        const adminDb = createAdminClient()
        const monthStart = new Date()
        monthStart.setUTCDate(1)
        monthStart.setUTCHours(0, 0, 0, 0)
        const { count } = await adminDb
            .from("agent_artifacts")
            .select("id", { count: "exact", head: true })
            .eq("metadata->>source", "team-meeting")
            .eq("user_id", authedUser.id)
            .gte("created_at", monthStart.toISOString())
        brainstormsUsedThisMonth = count ?? 0
    } catch {
        // Non-critical — upsell falls back to default free-tier rendering
    }

    // ── Authenticated visitor — Council UI (per BRAINSTORM-COUNCIL-MOCKUP-V1.html) ──
    // The old SpecialistsPageClient ("Your Specialists / 13 specialists ready to
    // help") is replaced by the Council UI as directed. The deep-dive routes under
    // /agents/m/[id] are unaffected — they live under (platform) and are auth-gated
    // independently. savedWorkflows / savedCustomPrompts / userTier are retained
    // in scope so they can be threaded in when the Council form is wired to
    // saveMeetingThread (meeting-threads.ts).
    void savedWorkflows; void savedCustomPrompts; void userTier; void brainstormsUsedThisMonth
    return <BrainstormingCouncilView userId={authedUser.id} />
}
