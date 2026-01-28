import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { OrgBlueprintView } from "./org-blueprint-view"
import { 
    getBusinessFunctions, 
    getCoverageSummary,
    BusinessFunctionWithCoverage,
    CoverageSummary 
} from "@/actions/org-blueprint"

export const metadata = {
    title: "Org Blueprint | CentaurOS",
    description: "Map your organizational capabilities and identify coverage gaps",
}

export default async function OrgBlueprintPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    // Fetch business functions and summary
    const [functionsResult, summaryResult] = await Promise.all([
        getBusinessFunctions(),
        getCoverageSummary(),
    ])

    const functions: BusinessFunctionWithCoverage[] = functionsResult.data || []
    const summary: CoverageSummary | null = summaryResult.data

    return (
        <OrgBlueprintView
            functions={functions}
            summary={summary}
        />
    )
}
