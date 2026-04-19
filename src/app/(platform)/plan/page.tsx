/**
 * @file page.tsx — "Plan" section intro page (flag-gated).
 *
 * @description Flag off: high-impact visual overview of Plan pages (Strategy,
 * Objectives, Tasks) via <PlanSectionIntro />. Flag on: placeholder card for
 * the Phase 3 Plan redesign workspace surface.
 */

import type { Metadata } from "next"
import { getCurrentUserFeatureFlag } from "@/lib/features/flags"
import { FLAG_NEW_PLAN_EXPERIENCE } from "@/lib/features/keys"
import { PlanSectionIntro } from "./plan-section-intro"

export const metadata: Metadata = {
    title: "Plan",
    description: "From vision to action — strategy, objectives, and tasks",
}

export default async function PlanPage(): Promise<React.ReactNode> {
    const enabled = await getCurrentUserFeatureFlag(FLAG_NEW_PLAN_EXPERIENCE)
    if (!enabled) return <PlanSectionIntro />

    return (
        <div className="mx-auto max-w-2xl p-8">
            <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
                <h1 className="text-2xl font-semibold tracking-tight">Plan redesign coming soon</h1>
                <p className="mt-2 text-muted-foreground">Workspace surface</p>
            </div>
        </div>
    )
}
