/**
 * MeSectionIntro — Client component for the "Me" section intro page.
 *
 * @description Wraps the shared SectionIntroPage with the "me" section data,
 * plus a personalized greeting CTA and the full dashboard widget suite
 * (Morning Briefing, Focus Cards, Priority Queue, Week Timeline,
 * Objectives Progress, Activity Heatmap, Quick Actions).
 *
 * Follows the same pattern as PlanSectionIntro and WorkshopSectionIntro:
 * SectionIntroPage hero at top, then section-specific content below.
 */

"use client"

import Link from "next/link"
import { ArrowRight, CalendarCheck, BarChart3, Zap } from "lucide-react"

import { SectionIntroPage } from "@/components/sidebar/SectionIntroPage"
import { getSectionById } from "@/lib/features/section-registry"
import { Card, CardContent } from "@/components/ui/card"
import { MeDashboardBody } from "./me-dashboard-view"

import type { MeDashboardData } from "@/actions/me-dashboard"

const section = getSectionById("me")!

/**
 * Returns a time-of-day greeting.
 *
 * @param {string} name - User's first name or display name
 * @returns {string} Greeting like "Good morning, Tristan"
 */
function getGreeting(name: string): string {
    const hour = new Date().getHours()
    if (hour < 12) return `Good morning, ${name}`
    if (hour < 17) return `Good afternoon, ${name}`
    return `Good evening, ${name}`
}

const HOW_IT_WORKS_STEPS = [
    {
        icon: CalendarCheck,
        title: "Check what's due",
        description: "See overdue tasks, today's priorities, and upcoming deadlines at a glance.",
    },
    {
        icon: BarChart3,
        title: "Track your momentum",
        description: "Activity heatmap and streak show real progress compounding over time.",
    },
    {
        icon: Zap,
        title: "Take action instantly",
        description: "Quick actions let you create tasks, objectives, and more without leaving the page.",
    },
] as const

interface MeSectionIntroProps {
    /** Dashboard data fetched server-side */
    data: MeDashboardData
}

export function MeSectionIntro({ data }: MeSectionIntroProps): React.ReactElement {
    const firstName = data.greeting.name.split(" ")[0]

    return (
        <div className="space-y-0">
            <SectionIntroPage section={section} />

            {/* Personalized greeting CTA */}
            <div className="px-4 sm:px-6 lg:px-8 pt-2">
                <Card className="border-2 border-international-orange/20 bg-gradient-to-br from-background to-international-orange/[0.03]">
                    <CardContent className="pt-6 pb-6">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-orange-50 shrink-0">
                                    <Zap className="h-6 w-6 text-international-orange" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-foreground">
                                        {getGreeting(firstName)}
                                    </h3>
                                    <p className="text-sm text-muted-foreground">
                                        Here&apos;s what needs your attention today.
                                    </p>
                                </div>
                            </div>
                            <Link
                                href="/new-tasks"
                                className="inline-flex items-center gap-2 text-sm font-medium text-international-orange hover:text-international-orange-hover transition-colors shrink-0"
                            >
                                View all tasks
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* How it works — 3-step mini-flow */}
            <div className="px-4 sm:px-6 lg:px-8 pt-8 pb-2">
                <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-6">
                    How your command center works
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {HOW_IT_WORKS_STEPS.map((step, index) => {
                        const Icon = step.icon
                        return (
                            <div key={step.title} className="flex gap-4">
                                <div className="flex flex-col items-center">
                                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-orange-50 text-international-orange font-semibold text-sm shrink-0">
                                        {index + 1}
                                    </div>
                                    {index < HOW_IT_WORKS_STEPS.length - 1 && (
                                        <div className="w-0.5 h-full bg-muted mt-2 hidden md:block" />
                                    )}
                                </div>
                                <div className="pb-2">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Icon className="h-4 w-4 text-international-orange" />
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

            {/* Dashboard widgets */}
            <div className="px-4 sm:px-6 lg:px-8 pt-8 pb-4">
                <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-6">
                    Your dashboard
                </p>
                <MeDashboardBody data={data} />
            </div>
        </div>
    )
}
