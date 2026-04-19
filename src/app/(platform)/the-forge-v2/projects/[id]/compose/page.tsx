/**
 * @file compose/page.tsx — /the-forge-v2/projects/:id/compose
 *
 * @description Compose-message surface. Every &ldquo;Message X / Reply / Send
 * draft&rdquo; action across the app funnels here. No SMTP integration yet &mdash; the
 * primary CTA is a pre-filled mailto: link with subject + body populated from
 * the project context. A secondary &ldquo;Copy draft&rdquo; path ships with the client
 * enhancement in a later PR.
 *
 * @related
 * - Mockup: FORGE-MOCKUP-COMPOSE.html
 * - Data:   loadCadLabProject from @/actions/cad-lab-projects
 * - Shell:  ../../../_components/workspace-shell
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import {
    Mail,
    ArrowLeft,
    Send,
    Paperclip,
    Users,
} from "lucide-react"

import { loadCadLabProject } from "@/actions/cad-lab-projects"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import { WorkspaceShell } from "../../../_components/workspace-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
    const { id } = await params
    const result = await loadCadLabProject(id)
    if ("error" in result) return { title: "Compose · The Forge" }
    return {
        title: `Compose · ${result.project.name}`,
        description: "Draft a message with project context pre-filled.",
    }
}

export default async function ForgeV2ComposePage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>
    searchParams: Promise<{ to?: string; subject?: string; body?: string }>
}): Promise<React.ReactNode> {
    const { id } = await params
    const { to, subject, body } = await searchParams
    const result = await loadCadLabProject(id)
    if ("error" in result) notFound()
    const project = result.project

    // Defaults for first draft
    const defaultTo = to?.trim() ?? ""
    const defaultSubject = subject?.trim() || `${project.name} — update`
    const defaultBody = body?.trim() || [
        `Hi,`,
        ``,
        `Quick note on ${project.name}.`,
        ``,
        project.productOverview
            ? project.productOverview.split(/\s+/).slice(0, 40).join(" ") + (project.productOverview.split(/\s+/).length > 40 ? "…" : "")
            : project.subject,
        ``,
        `Design revision v${project.designRevision} · stage ${project.stage}.`,
        ``,
        `— Sent from ForgeOS`,
    ].join("\n")

    // Pre-build a mailto: URL for the primary CTA. Server-rendered so the
    // user can hit Enter from the keyboard without JS. The client can
    // enhance this later (tone toggles, inline send, attachments).
    const mailto = `mailto:${encodeURIComponent(defaultTo)}?subject=${encodeURIComponent(defaultSubject)}&body=${encodeURIComponent(defaultBody)}`

    const backHref = `/the-forge-v2/projects/${project.id}`

    return (
        <WorkspaceShell
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: project.name, href: backHref },
                { label: "Compose" },
            ]}
            subtitle="Draft the message &mdash; we open it in your mail client so nothing sends without your confirm."
            maxWidth="narrow"
        >
            {/* Draft card */}
            <Card className="rounded-xl border">
                <CardContent className="py-0 px-0">
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                        <h2 className="text-sm font-bold text-foreground">New message</h2>
                        <Badge variant="outline" className="text-[10.5px] font-semibold bg-muted/50 text-muted-foreground">
                            Draft
                        </Badge>
                    </div>

                    {/* Fields */}
                    <div className="px-6 py-4 space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="compose-to" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                To
                            </Label>
                            <Input
                                id="compose-to"
                                type="email"
                                defaultValue={defaultTo}
                                placeholder="name@supplier.com"
                                className="text-sm"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="compose-subject" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Subject
                            </Label>
                            <Input
                                id="compose-subject"
                                type="text"
                                defaultValue={defaultSubject}
                                className="text-sm"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="compose-body" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Message
                            </Label>
                            <Textarea
                                id="compose-body"
                                defaultValue={defaultBody}
                                className="text-sm min-h-[260px] font-sans leading-relaxed"
                            />
                        </div>

                        <div className="flex items-start gap-2 text-[11.5px] text-muted-foreground border-t border-border/60 pt-3">
                            <Paperclip className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            <p className="leading-relaxed">
                                Attachments open in your mail client &mdash; drop them in after the draft opens. We
                                pre-fill the subject + body; you confirm send.
                            </p>
                        </div>
                    </div>

                    {/* Footer strip */}
                    <div className="px-6 py-4 border-t border-border bg-muted/30 flex flex-wrap items-center justify-between gap-3">
                        <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs">
                            <Link href={backHref}>
                                <ArrowLeft className="h-3.5 w-3.5" />
                                Cancel
                            </Link>
                        </Button>
                        <div className="flex items-center gap-2">
                            <Button asChild size="sm" className="gap-1.5 text-xs bg-international-orange hover:bg-international-orange/90 text-white">
                                <a href={mailto}>
                                    <Send className="h-3.5 w-3.5" />
                                    Open in mail client
                                </a>
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Why-this-message hint */}
            <Card className="rounded-xl border">
                <CardContent className="py-5 px-6 space-y-3">
                    <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 text-international-orange" />
                        How this draft is built
                    </h3>
                    <ul className="text-sm text-foreground leading-relaxed space-y-1.5">
                        <li className="flex gap-2">
                            <span className="text-muted-foreground">1.</span>
                            Subject seeded from the project name &mdash; edit freely before sending.
                        </li>
                        <li className="flex gap-2">
                            <span className="text-muted-foreground">2.</span>
                            Body grounded in the brief / product overview when available, otherwise the project subject.
                        </li>
                        <li className="flex gap-2">
                            <span className="text-muted-foreground">3.</span>
                            Opens in whatever mail client you default to &mdash; Gmail, Outlook, Mail.app &mdash; so your signature and history travel with it.
                        </li>
                    </ul>
                </CardContent>
            </Card>

            {/* Specialist-aided alternative */}
            <Card className="rounded-xl border">
                <CardContent className="py-4 px-6 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <Users className="h-3.5 w-3.5 text-international-orange" />
                            Want a specialist to draft this?
                        </p>
                        <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                            Ask Sal or Mia to write the opening paragraph &mdash; they&rsquo;ll ground it in the project context.
                        </p>
                    </div>
                    <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs shrink-0">
                        <Link href={`/the-forge-v2/projects/${project.id}/ask?topic=Draft%20a%20message`}>
                            Ask a specialist
                        </Link>
                    </Button>
                </CardContent>
            </Card>
        </WorkspaceShell>
    )
}
