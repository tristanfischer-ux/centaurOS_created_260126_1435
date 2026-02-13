import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { checkHasAnyProviderKey } from "@/actions/ai-providers"
import { getAgentWorkflows, getAgentCustomPrompts } from "@/actions/agent-workflows"
import { SpecialistsPageClient } from "./specialists-page-client"

export const revalidate = 60

/**
 * Specialists page (formerly "Agents").
 *
 * @description Default view is the Specialist Roster -- a 3x3 grid of on-demand
 * team members organized by KNOW / GROW / RUN. The workflow builder is accessible
 * via the "Plan a Team Project" CTA.
 */
export default async function SpecialistsPage() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    // Fetch API key status, saved workflows, and custom prompts in parallel
    const [hasApiKeyResult, workflowsResult, customPromptsResult] = await Promise.allSettled([
        checkHasAnyProviderKey(),
        getAgentWorkflows(),
        getAgentCustomPrompts(),
    ])

    const hasApiKey = hasApiKeyResult.status === "fulfilled" ? hasApiKeyResult.value : false
    const savedWorkflows = workflowsResult.status === "fulfilled" ? (workflowsResult.value.data ?? []) : []
    const savedCustomPrompts = customPromptsResult.status === "fulfilled" ? (customPromptsResult.value.data ?? []) : []

    if (hasApiKeyResult.status === "rejected") {
        console.error("[SpecialistsPage] Failed to check API key status:", {
            error: hasApiKeyResult.reason instanceof Error ? hasApiKeyResult.reason.message : "Unknown error",
        })
    }

    return (
        <SpecialistsPageClient
            hasApiKey={hasApiKey}
            initialWorkflows={savedWorkflows}
            initialCustomPrompts={savedCustomPrompts}
        />
    )
}
