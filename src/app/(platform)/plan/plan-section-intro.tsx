/**
 * PlanSectionIntro — Client component for the "Plan" section intro page.
 *
 * @description Wraps the shared SectionIntroPage with the "plan" section data,
 * plus a strategic cascade narrative (Strategy > Objectives > Tasks),
 * a River showcase card, the "One Sentence to Full Plan" AI generator,
 * and template gallery.
 */

"use client"

import Link from "next/link"
import {
    Boxes, ArrowRight, Waypoints, Target, CheckSquare,
    ChevronRight, Sparkles,
} from "lucide-react"

import { SectionIntroPage } from "@/components/sidebar/SectionIntroPage"
import { getSectionById } from "@/lib/features/section-registry"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { OneSentencePlanner } from "./one-sentence-planner"
import { TemplateGallery } from "./template-gallery"

const section = getSectionById("plan")!

/** The strategic cascade — Strategy > Objectives > Tasks */
const STRATEGIC_CASCADE = [
    {
        icon: Waypoints,
        title: "Define your strategy",
        description: "Set the direction with strategic goals. These become the pillars that everything else aligns to.",
        href: "/strategy",
        label: "Strategy",
        accent: "bg-international-orange/10 text-international-orange",
        ring: "ring-international-orange/20",
    },
    {
        icon: Target,
        title: "Break it into objectives",
        description: "Turn each strategic goal into measurable milestones with clear owners and deadlines.",
        href: "/new-objectives",
        label: "Objectives",
        accent: "bg-electric-blue/10 text-electric-blue",
        ring: "ring-electric-blue/20",
    },
    {
        icon: CheckSquare,
        title: "Execute with tasks",
        description: "Day-to-day work that delivers on objectives. Every task traces back to a strategic goal.",
        href: "/new-tasks",
        label: "Tasks",
        accent: "bg-status-success/10 text-status-success",
        ring: "ring-status-success/20",
    },
] as const

export function PlanSectionIntro(): React.ReactElement {
    return (
        <div className="space-y-0">
            <SectionIntroPage section={section} />

            {/* Strategic Cascade — the core narrative */}
            <div className="px-4 sm:px-6 lg:px-8 pt-2 pb-2">
                <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-6">
                    The strategic cascade
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {STRATEGIC_CASCADE.map((step, index) => {
                        const Icon = step.icon
                        return (
                            <Link key={step.label} href={step.href} className="group block">
                                <div className="flex gap-4">
                                    <div className="flex flex-col items-center">
                                        <div className={`flex items-center justify-center w-10 h-10 rounded-full ${step.accent} font-semibold text-sm shrink-0 ring-1 ${step.ring} group-hover:scale-110 transition-transform`}>
                                            <Icon className="h-5 w-5" />
                                        </div>
                                        {index < STRATEGIC_CASCADE.length - 1 && (
                                            <div className="w-0.5 flex-1 bg-muted mt-2 hidden md:block" />
                                        )}
                                    </div>
                                    <div className="pb-2">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="text-sm font-semibold text-foreground group-hover:text-international-orange transition-colors">
                                                {step.title}
                                            </h3>
                                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            {step.description}
                                        </p>
                                    </div>
                                </div>
                            </Link>
                        )
                    })}
                </div>
            </div>

            {/* Strategy River Showcase — the wow moment */}
            <div className="px-4 sm:px-6 lg:px-8 pt-8">
                <Link href="/strategy" className="block group">
                    <Card className="rounded-xl border-0 shadow-lg overflow-hidden bg-gradient-to-br from-international-orange/[0.06] via-background to-electric-blue/[0.04] hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
                        <CardContent className="pt-8 pb-8 px-8">
                            <div className="flex flex-col md:flex-row md:items-center gap-6">
                                <div className="flex-1 space-y-3">
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-international-orange/10">
                                            <Waypoints className="h-4 w-4 text-international-orange" />
                                        </div>
                                        <span className="text-xs font-mono uppercase tracking-widest text-international-orange">
                                            Showcase
                                        </span>
                                    </div>
                                    <h3 className="text-xl font-semibold text-foreground group-hover:text-international-orange transition-colors">
                                        The Strategy River
                                    </h3>
                                    <p className="text-sm text-muted-foreground leading-relaxed max-w-lg">
                                        Watch your entire strategy flow through time. Goals become rivers,
                                        milestones become confluences, and tasks become tributaries
                                        — all on a single, living timeline.
                                    </p>
                                    <div className="flex items-center gap-2 pt-2">
                                        <Button
                                            variant="default"
                                            size="sm"
                                            className="bg-international-orange hover:bg-international-orange-hover"
                                            tabIndex={-1}
                                        >
                                            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                                            View Strategy River
                                        </Button>
                                    </div>
                                </div>
                                {/* Visual preview — abstract river illustration */}
                                <div className="hidden md:flex items-center justify-center w-48 h-32">
                                    <svg viewBox="0 0 200 120" className="w-full h-full" aria-hidden="true">
                                        {/* River streams flowing left to right */}
                                        <path d="M0,30 C40,30 60,20 100,25 S160,35 200,30" stroke="hsl(var(--international-orange))" strokeWidth="4" fill="none" opacity="0.6" strokeLinecap="round" />
                                        <path d="M0,55 C30,55 70,45 110,50 S170,60 200,55" stroke="hsl(var(--electric-blue))" strokeWidth="3" fill="none" opacity="0.5" strokeLinecap="round" />
                                        <path d="M0,80 C50,80 80,70 120,75 S165,85 200,78" stroke="hsl(var(--status-success))" strokeWidth="3" fill="none" opacity="0.4" strokeLinecap="round" />
                                        {/* Confluence dots */}
                                        <circle cx="100" cy="25" r="4" fill="hsl(var(--international-orange))" opacity="0.8" />
                                        <circle cx="110" cy="50" r="3.5" fill="hsl(var(--electric-blue))" opacity="0.7" />
                                        <circle cx="120" cy="75" r="3" fill="hsl(var(--status-success))" opacity="0.6" />
                                        {/* NOW line */}
                                        <line x1="140" y1="8" x2="140" y2="112" stroke="hsl(var(--international-orange))" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.4" />
                                        <text x="142" y="16" fill="hsl(var(--international-orange))" fontSize="8" fontWeight="600" opacity="0.6">NOW</text>
                                    </svg>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </Link>
            </div>

            {/* Quick Start — shortcuts for instant planning */}
            <div className="px-4 sm:px-6 lg:px-8 pt-10">
                <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-6">
                    Quick start
                </p>
            </div>

            {/* One Sentence Planner — the "magic moment" */}
            <div className="px-4 sm:px-6 lg:px-8 pt-2">
                <OneSentencePlanner />
            </div>

            {/* The Forge Discovery — surface the most impressive feature */}
            <div className="px-4 sm:px-6 lg:px-8 pt-6">
                <Link href="/the-forge" className="block group">
                    <Card className="border border-dashed border-electric-blue/20 hover:border-electric-blue/40 hover:shadow-md hover:-translate-y-0.5 transition-all bg-gradient-to-br from-background to-electric-blue/[0.02]">
                        <CardContent className="pt-5 pb-4 flex items-center gap-4">
                            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-electric-blue/10 shrink-0 group-hover:bg-electric-blue/20 transition-colors">
                                <Boxes className="h-5 w-5 text-electric-blue" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-foreground group-hover:text-electric-blue transition-colors">
                                    Design physical products? Try The Forge
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
