/**
 * @file page.tsx — Plan redesign "Report" surface stub (Phase 3, flag-gated).
 *
 * Flag on: placeholder card. Flag off: redirect to legacy /reports.
 */

import { redirect } from "next/navigation"
import { getCurrentUserFeatureFlag } from "@/lib/features/flags"
import { FLAG_NEW_PLAN_EXPERIENCE } from "@/lib/features/keys"

export default async function PlanReportPage(): Promise<React.ReactNode> {
    const enabled = await getCurrentUserFeatureFlag(FLAG_NEW_PLAN_EXPERIENCE)
    if (!enabled) redirect("/reports")

    return (
        <div className="mx-auto max-w-2xl p-8">
            <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
                <h1 className="text-2xl font-semibold tracking-tight">Plan redesign coming soon</h1>
                <p className="mt-2 text-muted-foreground">Reports surface</p>
            </div>
        </div>
    )
}
