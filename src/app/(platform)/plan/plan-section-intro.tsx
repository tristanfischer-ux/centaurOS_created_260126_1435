/**
 * PlanSectionIntro — Client component for the "Plan" section intro page.
 *
 * @description Wraps the shared SectionIntroPage with the "plan" section data,
 * plus a "How it works" mini-flow, the "One Sentence to Full Plan" AI generator,
 * CAD Lab discovery card, and template gallery.
 */

"use client"

import Link from "next/link"
import { Boxes, ArrowRight, MessageSquare, ClipboardCheck, Rocket } from "lucide-react"

import { SectionIntroPage } from "@/components/sidebar/SectionIntroPage"
import { getSectionById } from "@/lib/features/section-registry"
import { Card, CardContent } from "@/components/ui/card"
import { OneSentencePlanner } from "./one-sentence-planner"
import { TemplateGallery } from "./template-gallery"

const section = getSectionById("plan")!

const HOW_IT_WORKS_STEPS = [
    {
        icon: MessageSquare,
        title: "Describe your goal",
        description: "One sentence is all it takes. Tell us what you want to achieve.",
    },
    {
        icon: ClipboardCheck,
        title: "Review the plan",
        description: "Get objectives, tasks, deadlines, and milestones — edit anything you like.",
    },
    {
        icon: Rocket,
        title: "Deploy to your workspace",
        description: "One click deploys everything. Start executing immediately.",
    },
] as const

export function PlanSectionIntro(): React.ReactElement {
    return (
        <div className="space-y-0">
            <SectionIntroPage section={section} />

            {/* How it works — 3-step mini-flow */}
            <div className="px-4 sm:px-6 lg:px-8 pt-2 pb-2">
                <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-6">
                    How it works
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {HOW_IT_WORKS_STEPS.map((step, index) => {
                        const Icon = step.icon
                        return (
                            <div key={step.title} className="flex gap-4">
                                <div className="flex flex-col items-center">
                                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-50 text-electric-blue font-semibold text-sm shrink-0">
                                        {index + 1}
                                    </div>
                                    {index < HOW_IT_WORKS_STEPS.length - 1 && (
                                        <div className="w-0.5 h-full bg-muted mt-2 hidden md:block" />
                                    )}
                                </div>
                                <div className="pb-2">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Icon className="h-4 w-4 text-electric-blue" />
                                        <h3 className="text-sm font-semibold text-foreground">
                                            {step.title}
                                        </h3>
                                    </div>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        {step.description}
                                    </p>
                                </div>
                            </div>
                        )
                    })}
                </div>
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
                                    Turn any product idea into manufacturing-ready 3D CAD models
                                </p>
                            </div>
                            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-electric-blue transition-colors shrink-0" />
                        </CardContent>
                    </Card>
                </Link>
            </div>

            {/* Template Gallery — quick-start plans */}
            <div className="px-4 sm:px-6 lg:px-8 pt-8 pb-4">
                <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-6">
                    Not sure where to start?
                </p>
                <TemplateGallery />
            </div>
        </div>
    )
}
