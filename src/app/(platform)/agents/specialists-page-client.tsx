"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { HelpTooltip } from "@/components/ui/help-tooltip"
import { ArrowLeft } from "lucide-react"
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
                        <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight">
                            {view === "specialists" ? "AI Team" : "Team Project"}
                            {view === "project-builder" && (
                                <HelpTooltip content="Chain multiple specialists together. Each step's output feeds into the next." />
                            )}
                        </h1>
                    </div>
                </div>
                <p className="text-muted-foreground text-sm mt-1 ml-4">
                    {view === "specialists"
                        ? "13 AI specialists ready to help — strategy, engineering, finance, legal, and more"
                        : "Chain multiple specialists together into a project"}
                </p>
            </div>

            {/* Content area */}
            {view === "specialists" ? (
                <div className="flex-1 min-h-0 overflow-y-auto">
                    <div className="px-4 sm:px-6 lg:px-8 pt-6">
                        <SpecialistsLanding
                            onOpenProjectBuilder={() => setView("project-builder")}
                        />
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
