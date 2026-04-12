"use client"

import { useState, useEffect, useMemo, Suspense } from "react"
import { usePageBriefing } from '@/hooks/use-page-briefing'
import { generatePageBriefing } from '@/actions/specialist-page-insights'
import { SpecialistBriefingHero } from '@/components/specialists/specialist-briefing-hero'
import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { HelpTooltip } from "@/components/ui/help-tooltip"
import { ArrowLeft, Monitor } from "lucide-react"
import { SpecialistsLanding } from "./specialists-landing"
import type { AgentWorkflowRow, AgentCustomPromptRow } from "@/actions/agent-workflows"

/**
 * Dynamically load the heavy workflow builder (ReactFlow + Dagre) only when needed.
 * This keeps the specialists landing page fast and lightweight.
 */
const AgentsWorkflowView = dynamic(
    () =>
        import("./agents-workflow-view").then((mod) => mod.AgentsWorkflowView),
    {
        ssr: false,
        loading: () => (
            <div className="flex flex-col h-full p-6 space-y-4">
                <Skeleton className="h-10 w-full" />
                <div className="flex flex-1 gap-4">
                    <Skeleton className="h-full w-64" />
                    <Skeleton className="h-full flex-1" />
                </div>
            </div>
        ),
    }
)

type PageView = "specialists" | "project-builder"

interface SpecialistsPageClientProps {
    initialWorkflows: AgentWorkflowRow[]
    initialCustomPrompts: AgentCustomPromptRow[]
}

/**
 * SpecialistsPageClient -- Client-side wrapper that toggles between the
 * Specialist Roster (default) and the Project Builder (workflow editor).
 */
export function SpecialistsPageClient({
    initialWorkflows,
    initialCustomPrompts,
}: SpecialistsPageClientProps) {
    const [view, setView] = useState<PageView>("specialists")
    const [isMobile, setIsMobile] = useState<boolean | null>(null)
    const [showBuilderAnyway, setShowBuilderAnyway] = useState(false)

    const briefingContext = useMemo(() =>
      `Workflows: ${initialWorkflows.length}, Custom prompts: ${initialCustomPrompts.length}, 13 specialists available`,
      [initialWorkflows.length, initialCustomPrompts.length]
    )

    const briefing = usePageBriefing(
      () => generatePageBriefing('chief-of-staff', briefingContext, 'success'),
      'success',
      true,
      'briefing-agents',
    )

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768)
        check()
        window.addEventListener("resize", check)
        return () => window.removeEventListener("resize", check)
    }, [])

    return (
        <div className="flex flex-col h-[calc(100dvh-2rem)] -m-4 sm:-m-6 lg:-m-8">
            {/* Page header with orange accent bar */}
            <div className="px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 lg:pt-8 pb-4 border-b border-muted">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {view === "project-builder" && (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setView("specialists")}
                                aria-label="Back to Specialists"
                                className="mr-1"
                            >
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        )}
                        <div className="h-8 w-1 bg-international-orange rounded-full shadow-[0_0_8px_rgba(234,88,12,0.6)]" />
                        <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight inline-flex items-center gap-1.5">
                            {view === "specialists" ? "AI Team" : "Team Project"}
                            {view === "project-builder" && (
                                <HelpTooltip content="Chain multiple specialists together. Each step's output feeds into the next." />
                            )}
                        </h1>
                    </div>
                </div>
                <p className="text-muted-foreground text-sm mt-1 ml-4">
                    {view === "specialists"
                        ? "13 specialists ready to help — strategy, engineering, finance, legal, and more"
                        : "Chain multiple specialists together into a project"}
                </p>
            </div>

            <div className="px-4 sm:px-6 lg:px-8 pt-4">
                <SpecialistBriefingHero
                    specialistId="chief-of-staff"
                    specialistName="Cal"
                    specialistTitle="Chief of Staff"
                    narrative={briefing.narrative}
                    fallbackMessage="This is your bench — 13 specialists across Know, Grow, and Run. Each one thinks differently about your business. You can talk to any of them directly, or build workflows that chain their expertise together. Pick the specialist closest to today's problem and start a conversation."
                    isLoading={briefing.isLoading}
                    severity={briefing.severity}
                    context={{ type: 'general', title: 'AI Team', description: 'Cal on specialists.', metadata: {} }}
                    storageKey="specialists"
                />
            </div>

            {/* Content area */}
            {view === "specialists" ? (
                <div className="flex-1 min-h-0 overflow-y-auto">
                    <div className="px-4 sm:px-6 lg:px-8 pt-6">
                        <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
                            <SpecialistsLanding
                                onOpenProjectBuilder={() => setView("project-builder")}
                            />
                        </Suspense>
                    </div>
                </div>
            ) : isMobile === null ? (
                <div className="flex-1 min-h-0 flex items-center justify-center">
                    <Skeleton className="h-full w-full m-6" />
                </div>
            ) : isMobile && !showBuilderAnyway ? (
                <div className="flex-1 min-h-0 flex items-center justify-center px-6">
                    <div className="text-center max-w-sm space-y-4">
                        <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mx-auto">
                            <Monitor className="h-7 w-7 text-muted-foreground" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground">
                            Best on a larger screen
                        </h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            The project builder uses drag-and-drop to chain specialists together.
                            It works best on a tablet or desktop.
                        </p>
                        <Button
                            variant="outline"
                            onClick={() => setShowBuilderAnyway(true)}
                            className="min-h-[44px]"
                        >
                            Show anyway
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="flex-1 min-h-0">
                    <AgentsWorkflowView
                        initialWorkflows={initialWorkflows}
                        initialCustomPrompts={initialCustomPrompts}
                    />
                </div>
            )}
        </div>
    )
}
