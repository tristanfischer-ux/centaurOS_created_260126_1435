import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { AgentsWorkflowView } from "./agents-workflow-view"

export const revalidate = 60

export default async function AgentsPage() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    return <AgentsWorkflowView />
}
