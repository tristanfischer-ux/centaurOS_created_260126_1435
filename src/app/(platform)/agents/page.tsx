import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { AgentsWorkflowView } from "./agents-workflow-view"
import { checkHasAnyProviderKey } from "@/actions/ai-providers"

export const revalidate = 60

export default async function AgentsPage() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    const hasApiKey = await checkHasAnyProviderKey()

    return (
        <div className="flex flex-col h-[calc(100vh-2rem)] -m-4 sm:-m-6 lg:-m-8">
            {/* Page header with orange accent bar */}
            <div className="px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 lg:pt-8 pb-4 border-b border-muted">
                <div className="flex items-center gap-3">
                    <div className="h-8 w-1 bg-international-orange rounded-full shadow-[0_0_8px_rgba(234,88,12,0.6)]" />
                    <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight">
                        Agents
                    </h1>
                </div>
                <p className="text-muted-foreground text-sm mt-1 ml-4">
                    Automate your team&apos;s recurring work
                </p>
            </div>

            {/* Workflow view fills remaining space */}
            <div className="flex-1 min-h-0">
                <AgentsWorkflowView hasApiKey={hasApiKey} />
            </div>
        </div>
    )
}
