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
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="h-8 w-1 bg-primary rounded-full shadow-[0_0_8px_rgba(234,88,12,0.6)]" />
                        <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight flex items-center gap-3">
                            Org Blueprint
                            {summary && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-orange-50 text-orange-700 text-sm font-medium rounded-full">
                                    <span className="font-semibold">{summary.overallCoveragePercentage}%</span>
                                    <span className="text-xs uppercase tracking-wider">coverage</span>
                                </span>
                            )}
                        </h1>
                    </div>
                    <p className="text-muted-foreground text-sm font-medium pl-4">Map your organizational capabilities and coverage</p>
                </div>
            </div>

            <OrgBlueprintView
                functions={functions}
                summary={summary}
            />
        </div>
    )
}
