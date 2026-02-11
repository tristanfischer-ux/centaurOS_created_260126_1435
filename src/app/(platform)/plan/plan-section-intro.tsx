/**
 * PlanSectionIntro — Client component for the "Plan" section intro page.
 *
 * @description Wraps the shared SectionIntroPage with the "plan" section data.
 */

"use client"

import { SectionIntroPage } from "@/components/sidebar/SectionIntroPage"
import { getSectionById } from "@/lib/features/section-registry"

const section = getSectionById("plan")!

export function PlanSectionIntro(): React.ReactElement {
    return <SectionIntroPage section={section} />
}
