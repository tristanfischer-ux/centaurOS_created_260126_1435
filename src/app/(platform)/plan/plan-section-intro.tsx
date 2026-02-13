/**
 * PlanSectionIntro — Client component for the "Plan" section intro page.
 *
 * @description Wraps the shared SectionIntroPage with the "plan" section data,
 * plus the Morning Briefing, "One Sentence to Full Plan" AI generator,
 * CAD Lab discovery card, and template gallery.
 */

"use client"

import Link from "next/link"
import { Boxes, ArrowRight } from "lucide-react"

import { SectionIntroPage } from "@/components/sidebar/SectionIntroPage"
import { getSectionById } from "@/lib/features/section-registry"
import { Card, CardContent } from "@/components/ui/card"
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

            {/* CAD Lab Discovery — surface the most impressive feature */}
            <div className="px-4 sm:px-6 lg:px-8 pt-6">
                <Link href="/the-forge/cad-lab" className="block group">
                    <Card className="border border-dashed border-electric-blue/20 hover:border-electric-blue/40 hover:shadow-md hover:-translate-y-0.5 transition-all bg-gradient-to-br from-background to-electric-blue/[0.02]">
                        <CardContent className="pt-5 pb-4 flex items-center gap-4">
                            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-electric-blue/10 shrink-0 group-hover:bg-electric-blue/20 transition-colors">
                                <Boxes className="h-5 w-5 text-electric-blue" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-foreground group-hover:text-electric-blue transition-colors">
                                    Design physical products? Try the CAD Lab
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Turn any product idea into manufacturing-ready 3D CAD models with AI
                                </p>
                            </div>
                            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-electric-blue transition-colors shrink-0" />
                        </CardContent>
                    </Card>
                </Link>
            </div>

            {/* Template Gallery — quick-start plans */}
            <div className="px-4 sm:px-6 lg:px-8 pt-8 pb-4">
                <TemplateGallery />
            </div>
        </div>
    )
}
