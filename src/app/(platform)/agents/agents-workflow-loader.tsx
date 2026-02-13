"use client"

import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"
import type { AgentWorkflowRow, AgentCustomPromptRow } from "@/actions/agent-workflows"

/**
 * Client-side dynamic loader for the AgentsWorkflowView.
 *
 * @description ReactFlow and Dagre depend on browser APIs (ResizeObserver,
 * DOM measurements) that are unavailable during server-side rendering.
 * This wrapper uses next/dynamic with ssr:false to ensure the heavy
 * workflow component is only loaded and rendered on the client.
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

interface AgentsWorkflowViewLoaderProps {
    /** Workflows pre-fetched from the database on the server */
    initialWorkflows: AgentWorkflowRow[]
    /** Custom prompts pre-fetched from the database on the server */
    initialCustomPrompts: AgentCustomPromptRow[]
}

/**
 * Wrapper that passes props through to the dynamically loaded view.
 */
export function AgentsWorkflowViewLoader({
    initialWorkflows,
    initialCustomPrompts,
}: AgentsWorkflowViewLoaderProps) {
    return (
        <AgentsWorkflowView
            initialWorkflows={initialWorkflows}
            initialCustomPrompts={initialCustomPrompts}
        />
    )
}
