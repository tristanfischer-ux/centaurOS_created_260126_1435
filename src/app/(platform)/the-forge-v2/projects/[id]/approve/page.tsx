/**
 * @file approve/page.tsx — /the-forge-v2/projects/:id/approve
 *
 * @description Generic approval surface for tolerance, spec, and design-decision
 * gates. Reads the project, surfaces the decision ask, trade-offs, and
 * specialist recommendations, then offers Approve / Reject (with reason) /
 * Ask-specialist actions. Action wiring is intentionally a stub — PR #1 of
 * this batch ships the UI shell; the write-path hooks ship when the decision
 * spine lands.
 *
 * @related
 * - Mockup: FORGE-MOCKUP-APPROVE.html
 * - Data:   loadCadLabProject from @/actions/cad-lab-projects
 * - Shell:  ../../../_components/workspace-shell
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import {
    CheckCircle2,
    XCircle,
    MessageSquare,
    AlertTriangle,
    Users,
    ArrowLeft,
    FileText,
    Sparkles,
} from "lucide-react"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import { WorkspaceShell } from "../../../_components/workspace-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) return { title: "Approve · The Forge" }
    return {
        title: `Approve · ${result.project.name}`,
        description: "Review the decision, trade-offs, and specialist recommendations before you commit.",
    }
}

export default async function ForgeV2ApprovePage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>
    searchParams: Promise<{ subject?: string; ask?: string }>
}): Promise<React.ReactNode> {
    const { id } = await params
    const { subject, ask } = await searchParams
    const result = await loadCadLabProject(id)
    if ("error" in result) notFound()
    const project = result.project

    // The Approve surface is driven by a decision item passed in via
    // ?subject=...&ask=... — when absent we show a generic "no pending
    // decision" placeholder so the page is still usable as a route.
    const decisionSubject = subject?.trim() || null
    const decisionAsk = ask?.trim() || null
    const hasPending = Boolean(decisionSubject || decisionAsk)

    const backHref = `/the-forge-v2/projects/${project.id}`

    return (
        <WorkspaceShell
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: project.name, href: backHref },
                { label: "Approve" },
            ]}
            subtitle={hasPending
                ? "Decide, ask a specialist, or reject with a reason."
                : "No pending decision passed — this surface handles tolerance, spec and design-decision approvals."}
            maxWidth="narrow"
        >
            {/* Decision summary */}
            <Card className="rounded-xl border border-t-[3px] border-t-status-warning">
                <CardContent className="py-5 px-6 space-y-3">
                    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                        <Sparkles className="h-3.5 w-3.5 text-international-orange" />
                        Decision waiting
                    </div>
                    <h2 className="text-lg font-bold text-foreground leading-tight">
                        {decisionSubject ?? "No decision specified"}
                    </h2>
                    {decisionAsk && (
                        <p className="text-sm text-foreground leading-relaxed">
                            {decisionAsk}
                        </p>
                    )}
                    {!hasPending && (
                        <p className="text-sm text-muted-foreground italic">
                            Approvals reach this surface from Today &rarr; Waiting on you, or from an artefact
                            drill-in (BOM tolerance, risk mitigation, design revision).
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Trade-offs */}
            <Card className="rounded-xl border">
                <CardContent className="py-5 px-6 space-y-3">
                    <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                        Trade-offs
                    </h3>
                    <ul className="space-y-2.5 text-sm text-foreground leading-relaxed">
                        <li className="flex gap-3">
                            <Badge variant="outline" className="shrink-0 text-[10px] bg-status-success-light text-status-success border-status-success/30">
                                PRO
                            </Badge>
                            <span>
                                Tightening the spec increases integration confidence and reduces rework cost downstream.
                            </span>
                        </li>
                        <li className="flex gap-3">
                            <Badge variant="outline" className="shrink-0 text-[10px] bg-status-error-light text-status-error border-status-error/30">
                                CON
                            </Badge>
                            <span>
                                Some suppliers may need re-tooling &mdash; watch for lead-time and cost impact.
                            </span>
                        </li>
                        <li className="flex gap-3">
                            <Badge variant="outline" className="shrink-0 text-[10px] bg-status-info-light text-status-info border-status-info/30">
                                NOTE
                            </Badge>
                            <span>
                                Specialist recommendations are surfaced below &mdash; each is grounded in the project artefact spine.
                            </span>
                        </li>
                    </ul>
                </CardContent>
            </Card>

            {/* Specialist recommendations */}
            <Card className="rounded-xl border">
                <CardContent className="py-5 px-6 space-y-3">
                    <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                        <Users className="h-3.5 w-3.5" />
                        Specialist recommendations
                    </h3>
                    <p className="text-sm text-muted-foreground italic leading-relaxed">
                        Recommendations will surface here once specialist reviews are attached to this decision.
                        Ask a specialist below if you need a second opinion before committing.
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                        <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
                            <Link href={`/the-forge-v2/projects/${project.id}/ask?topic=${encodeURIComponent(decisionSubject ?? "Approval")}`}>
                                <MessageSquare className="h-3.5 w-3.5" />
                                Ask a specialist
                            </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
                            <Link href={`/the-forge-v2/projects/${project.id}/review`}>
                                <FileText className="h-3.5 w-3.5" />
                                Open review roster
                            </Link>
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Rejection reason (optional) */}
            <Card className="rounded-xl border">
                <CardContent className="py-5 px-6 space-y-3">
                    <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-status-warning" />
                        If you reject
                    </h3>
                    <div className="space-y-2">
                        <Label htmlFor="approve-reason" className="text-sm">Reason (optional)</Label>
                        <Textarea
                            id="approve-reason"
                            placeholder="What&rsquo;s driving the reject? This feeds the next specialist run so they can revise."
                            className="min-h-[90px] text-sm"
                        />
                        <p className="text-[11.5px] text-muted-foreground">
                            Rejections without a reason still close the decision &mdash; but the reasons train future recommendations.
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Decision strip */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs">
                    <Link href={backHref}>
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Cancel
                    </Link>
                </Button>
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs" disabled>
                        <XCircle className="h-3.5 w-3.5" />
                        Reject
                    </Button>
                    <Button size="sm" className="gap-1.5 text-xs bg-international-orange hover:bg-international-orange/90 text-white" disabled>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Approve
                    </Button>
                </div>
            </div>

            <p className="text-[11.5px] text-muted-foreground italic">
                Approve / Reject are disabled on this route &mdash; the write-path lands when the decision spine is wired.
            </p>
        </WorkspaceShell>
    )
}
