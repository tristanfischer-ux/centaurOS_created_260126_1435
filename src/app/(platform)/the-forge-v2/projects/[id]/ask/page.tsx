/**
 * @file ask/page.tsx — /the-forge-v2/projects/:id/ask
 *
 * @description Ask-specialist entry surface. This is the route-level wrapper
 * around the existing client-side specialist-chat (AskSpecialistButton) so
 * every “Ask X” action across the app collapses to one URL. The button opens
 * the persistent advisor panel on desktop and the specialist dialog on mobile,
 * both pre-loaded with this project’s context.
 *
 * @related
 * - Mockup: FORGE-MOCKUP-ASK-SPECIALIST.html
 * - Client: AskSpecialistButton from @/components/specialists/ask-specialist-button
 * - Data:   loadCadLabProject from @/actions/cad-lab-projects
 * - Shell:  ../../../_components/workspace-shell
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import {
    MessageSquare,
    ArrowLeft,
    BookOpen,
    Layers,
    ListChecks,
    AlertTriangle,
} from "lucide-react"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AskSpecialistButton } from "@/components/specialists/ask-specialist-button"
import type { SpecialistContext } from "@/components/specialists/types"

import { WorkspaceShell } from "../../../_components/workspace-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) return { title: "Ask a specialist · The Forge" }
    return {
        title: `Ask a specialist · ${result.project.name}`,
        description: "Scoped specialist chat with this project\u2019s context pre-loaded.",
    }
}

export default async function ForgeV2AskPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>
    searchParams: Promise<{ topic?: string; specialist?: string }>
}): Promise<React.ReactNode> {
    const { id } = await params
    const { topic, specialist } = await searchParams
    const result = await loadCadLabProject(id)
    if ("error" in result) notFound()
    const project = result.project

    const topicLabel = topic?.trim() || null
    const specialistId = specialist?.trim() || undefined

    const modules = project.modules ?? []
    const moduleCount = modules.length
    const failureModeCount = modules.reduce((sum, m) => sum + (m.failureModes?.length ?? 0), 0)
    const unknownCount = modules.reduce((sum, m) => sum + (m.unknowns?.length ?? 0), 0)

    const specialistContext: SpecialistContext = {
        type: "general",
        title: topicLabel ? `${project.name} — ${topicLabel}` : project.name,
        description: project.productOverview ?? project.subject,
        metadata: {
            status: project.stage,
            notes: topicLabel
                ? `Scoped to: ${topicLabel}. Project has ${moduleCount} modules, ${failureModeCount} failure modes, ${unknownCount} open questions.`
                : `Project has ${moduleCount} modules, ${failureModeCount} failure modes, ${unknownCount} open questions.`,
        },
    }

    const backHref = `/the-forge-v2/projects/${project.id}`

    return (
        <WorkspaceShell
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: project.name, href: backHref },
                { label: "Ask a specialist" },
            ]}
            subtitle={topicLabel
                ? `Scoped to: ${topicLabel}. The specialist already has this project\u2019s artefacts loaded.`
                : "Pick a specialist and ask \u2014 they already have this project\u2019s artefacts loaded."}
            maxWidth="narrow"
        >
            {/* Topic card */}
            {topicLabel && (
                <Card className="rounded-xl border border-l-[3px] border-l-international-orange bg-gradient-to-br from-background to-international-orange/[0.04]">
                    <CardContent className="py-4 px-5 flex items-start gap-3">
                        <MessageSquare className="h-4 w-4 text-international-orange mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1 space-y-1">
                            <p className="text-[10.5px] font-bold uppercase tracking-widest text-international-orange">
                                Scoped question
                            </p>
                            <p className="text-sm text-foreground font-semibold leading-snug">
                                {topicLabel}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Primary CTA — launch the specialist chat */}
            <Card className="rounded-xl border">
                <CardContent className="py-6 px-6 flex flex-col items-start gap-4">
                    <div className="space-y-2">
                        <h3 className="text-base font-bold text-foreground">Start the conversation</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed max-w-prose">
                            Tap below to open the scoped specialist chat. On desktop the advisor panel slides in
                            beside this page; on mobile a dialog takes over the screen. Either way, the specialist
                            already knows the project’s brief, modules, BOM, risks and cost posture.
                        </p>
                    </div>
                    <AskSpecialistButton
                        context={specialistContext}
                        specialistId={specialistId}
                        variant="button"
                        className="text-sm"
                    />
                </CardContent>
            </Card>

            {/* What the specialist can see */}
            <Card className="rounded-xl border">
                <CardContent className="py-5 px-6 space-y-3">
                    <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                        <BookOpen className="h-3.5 w-3.5 text-international-orange" />
                        What the specialist can see
                    </h3>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-foreground">
                        <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-status-success shrink-0" />
                            Brief & design revision <span className="text-muted-foreground">(v{project.designRevision})</span>
                        </li>
                        <li className="flex items-center gap-2">
                            <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            {moduleCount} module{moduleCount === 1 ? "" : "s"} and their interfaces
                        </li>
                        <li className="flex items-center gap-2">
                            <ListChecks className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            BOM key parts & cost rollup
                        </li>
                        <li className="flex items-center gap-2">
                            <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            {failureModeCount} failure mode{failureModeCount === 1 ? "" : "s"} + {unknownCount} open question{unknownCount === 1 ? "" : "s"}
                        </li>
                    </ul>
                </CardContent>
            </Card>

            {/* Back link */}
            <div className="flex items-center justify-start pt-2">
                <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs">
                    <Link href={backHref}>
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Back to project
                    </Link>
                </Button>
            </div>
        </WorkspaceShell>
    )
}
