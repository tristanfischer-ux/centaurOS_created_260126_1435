import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { redirect } from "next/navigation"
import { getAgentWorkflows, getAgentCustomPrompts } from "@/actions/agent-workflows"
import { getUserSubscription } from "@/lib/billing/subscriptions"
import type { SubscriptionTier } from "@/lib/billing/plans"
import { SpecialistsPageClient } from "./specialists-page-client"

export const revalidate = 60

/**
 * Specialists page (formerly "Agents").
 *
 * @description Default view is the Specialist Roster -- a 3x3 grid of on-demand
 * team members organized by KNOW / GROW / RUN. The workflow builder is accessible
 * via the "Plan a Team Project" CTA. AI is provided by the platform -- users
 * don't need their own API keys.
 */
export default async function SpecialistsPage() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    // Fetch saved workflows and custom prompts in parallel
    const [workflowsResult, customPromptsResult] = await Promise.allSettled([
        getAgentWorkflows(),
        getAgentCustomPrompts(),
    ])

    const savedWorkflows = workflowsResult.status === "fulfilled" ? (workflowsResult.value.data ?? []) : []
    const savedCustomPrompts = customPromptsResult.status === "fulfilled" ? (customPromptsResult.value.data ?? []) : []

    // FLOW: Resolve the user's tier + brainstorm-this-month count so the
    // post-meeting upsell knows when to render. Fail-soft: if either query
    // breaks we default to free-tier with usage=0, which keeps the dialog
    // working but would suppress the upsell — preferable to crashing the
    // page on a billing-table glitch.
    let userTier: SubscriptionTier = 'free'
    let brainstormsUsedThisMonth = 0
    try {
        const { subscription } = await getUserSubscription(user.id)
        const isActive = subscription?.status === 'active' || subscription?.status === 'trialing'
        userTier = (subscription && isActive ? subscription.tier : 'free') as SubscriptionTier

        // Brainstorm sessions this month = count of agent_artifacts for this
        // user where metadata.source = 'team-meeting' since the start of the
        // calendar month. Admin client because RLS policies on
        // agent_artifacts may not include the metadata->>'source' filter
        // path; safe because we scope the query to the requesting user_id.
        const adminDb = createAdminClient()
        const monthStart = new Date()
        monthStart.setUTCDate(1)
        monthStart.setUTCHours(0, 0, 0, 0)
        const { count } = await adminDb
            .from('agent_artifacts')
            .select('id', { count: 'exact', head: true })
            .eq('metadata->>source', 'team-meeting')
            .eq('user_id', user.id)
            .gte('created_at', monthStart.toISOString())
        brainstormsUsedThisMonth = count ?? 0
    } catch {
        // Non-critical — upsell falls back to default free-tier rendering
    }

    return (
        <SpecialistsPageClient
            initialWorkflows={savedWorkflows}
            initialCustomPrompts={savedCustomPrompts}
            userId={user.id}
            userTier={userTier}
            brainstormsUsedThisMonth={brainstormsUsedThisMonth}
        />
    )
}
