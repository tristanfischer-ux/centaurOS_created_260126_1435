/**
 * @file page.tsx — "Plan" section intro page
 *
 * @description High-impact visual overview of planning pages: Strategy, Objectives, Tasks.
 * Users visit this to understand the scope of the "Plan" section and see what's new.
 */

import type { Metadata } from "next"
import { PlanSectionIntro } from "./plan-section-intro"

export const metadata: Metadata = {
    title: "Plan | ForgeOS",
    description: "From vision to action — strategy, objectives, and tasks",
}

export default function PlanPage(): React.ReactNode {
    return <PlanSectionIntro />
}
