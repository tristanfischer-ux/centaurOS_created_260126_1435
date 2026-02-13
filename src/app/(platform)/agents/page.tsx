import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { getAgentWorkflows, getAgentCustomPrompts } from "@/actions/agent-workflows"
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

    return (
        <SpecialistsPageClient
            initialWorkflows={savedWorkflows}
            initialCustomPrompts={savedCustomPrompts}
        />
    )
}
