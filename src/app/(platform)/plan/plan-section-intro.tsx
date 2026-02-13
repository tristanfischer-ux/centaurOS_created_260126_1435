/**
 * PlanSectionIntro — Client component for the "Plan" section intro page.
 *
 * @description Wraps the shared SectionIntroPage with the "plan" section data,
 * plus the Morning Briefing, "One Sentence to Full Plan" AI generator,
 * and template gallery.
 */

"use client"

import { SectionIntroPage } from "@/components/sidebar/SectionIntroPage"
import { getSectionById } from "@/lib/features/section-registry"
import { OneSentencePlanner } from "./one-sentence-planner"
import { TemplateGallery } from "./template-gallery"
import { MorningBriefingCard } from "@/components/nudges/MorningBriefing"

const section = getSectionById("plan")!

export function PlanSectionIntro(): React.ReactElement {
    return (
        <div className="space-y-0">
            <SectionIntroPage section={section} />

            {/* Morning Briefing — personalized daily focus */}
            <div className="px-4 sm:px-6 lg:px-8 -mt-4">
                <MorningBriefingCard />
            </div>

            {/* One Sentence Planner — the "magic moment" */}
            <div className="px-4 sm:px-6 lg:px-8 pt-6">
                <OneSentencePlanner />
            </div>

            {/* Template Gallery — quick-start plans */}
            <div className="px-4 sm:px-6 lg:px-8 pt-8 pb-4">
                <TemplateGallery />
            </div>
        </div>
    )
}
