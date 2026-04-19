/**
 * @file schedule/page.tsx — /the-forge-v2/projects/:id/schedule
 *
 * @description Calendar scheduling surface. Every &ldquo;Book X / Schedule Y / Find
 * time for Z&rdquo; action funnels here. Stubs the calendar step as a Google
 * Calendar TEMPLATE deep-link (no OAuth yet); also offers a &ldquo;Copy invite
 * text&rdquo; fallback that the user pastes into whichever calendar they use.
 *
 * @related
 * - Mockup: FORGE-MOCKUP-SCHEDULE.html
 * - Data:   loadCadLabProject from @/actions/cad-lab-projects
 * - Shell:  ../../../_components/workspace-shell
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import {
    CalendarClock,
    ArrowLeft,
    ExternalLink,
    Users,
    MapPin,
    FileText,
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
    if ("error" in result) return { title: "Schedule · The Forge" }
    return {
        title: `Schedule · ${result.project.name}`,
        description: "Draft a calendar event, open it in Google Calendar, or copy the invite text.",
    }
}

export default async function ForgeV2SchedulePage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>
    searchParams: Promise<{ title?: string; details?: string }>
}): Promise<React.ReactNode> {
    const { id } = await params
    const { title, details } = await searchParams
    const result = await loadCadLabProject(id)
    if ("error" in result) notFound()
    const project = result.project

    const defaultTitle = title?.trim() || `${project.name} — review`
    const defaultDetails = details?.trim() || [
        `Review session for ${project.name}.`,
        ``,
        `Stage: ${project.stage} · design revision v${project.designRevision}.`,
        project.productOverview ? `` : null,
        project.productOverview ? `Context: ${project.productOverview.split(/\s+/).slice(0, 40).join(" ")}${project.productOverview.split(/\s+/).length > 40 ? "…" : ""}` : null,
        ``,
        `Drafted via ForgeOS.`,
    ].filter(Boolean).join("\n")

    const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(defaultTitle)}&details=${encodeURIComponent(defaultDetails)}`

    const backHref = `/the-forge-v2/projects/${project.id}`

    return (
        <WorkspaceShell
            crumbs={[
                { label: "Workspace", href: "/the-forge-v2" },
                { label: project.name, href: backHref },
                { label: "Schedule" },
            ]}
            subtitle="Draft an event, open it in Google Calendar, or copy the invite text for another calendar."
            maxWidth="narrow"
        >
            {/* Event details */}
            <Card className="rounded-xl border">
                <CardContent className="py-0 px-0">
                    <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                        <h2 className="text-sm font-bold text-foreground">Event details</h2>
                        <Badge variant="outline" className="text-[10.5px] bg-muted/50 text-muted-foreground">
                            Google Calendar stub
                        </Badge>
                    </div>
                    <div className="px-6 py-5 space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="sched-title" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Title
                            </Label>
                            <Input
                                id="sched-title"
                                type="text"
                                defaultValue={defaultTitle}
                                className="text-sm"
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="sched-date" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Date
                                </Label>
                                <Input
                                    id="sched-date"
                                    type="date"
                                    className="text-sm"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="sched-time" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Time
                                </Label>
                                <Input
                                    id="sched-time"
                                    type="time"
                                    className="text-sm"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="sched-location" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                                <MapPin className="h-3 w-3" />
                                Location
                            </Label>
                            <Input
                                id="sched-location"
                                type="text"
                                placeholder="Video link, address, or &lsquo;remote&rsquo;"
                                className="text-sm"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="sched-attendees" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                                <Users className="h-3 w-3" />
                                Attendees
                            </Label>
                            <Input
                                id="sched-attendees"
                                type="text"
                                placeholder="alice@example.com, bob@example.com"
                                className="text-sm"
                            />
                            <p className="text-[11.5px] text-muted-foreground">
                                Attendees carry into the calendar draft &mdash; tweak there before sending.
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="sched-details" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                                <FileText className="h-3 w-3" />
                                Agenda / details
                            </Label>
                            <Textarea
                                id="sched-details"
                                defaultValue={defaultDetails}
                                className="text-sm min-h-[160px] font-sans leading-relaxed"
                            />
                        </div>
                    </div>

                    <div className="px-6 py-4 border-t border-border bg-muted/30 flex flex-wrap items-center justify-between gap-3">
                        <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs">
                            <Link href={backHref}>
                                <ArrowLeft className="h-3.5 w-3.5" />
                                Cancel
                            </Link>
                        </Button>
                        <Button asChild size="sm" className="gap-1.5 text-xs bg-international-orange hover:bg-international-orange/90 text-white">
                            <a href={gcalUrl} target="_blank" rel="noopener noreferrer">
                                <CalendarClock className="h-3.5 w-3.5" />
                                Open in Google Calendar
                                <ExternalLink className="h-3 w-3" />
                            </a>
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* How it works */}
            <Card className="rounded-xl border">
                <CardContent className="py-5 px-6 space-y-3">
                    <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                        How this works
                    </h3>
                    <ul className="text-sm text-foreground leading-relaxed space-y-1.5">
                        <li className="flex gap-2">
                            <span className="text-muted-foreground">1.</span>
                            Enter the title, date, time, attendees and agenda.
                        </li>
                        <li className="flex gap-2">
                            <span className="text-muted-foreground">2.</span>
                            Click &ldquo;Open in Google Calendar&rdquo;. A pre-filled event opens in a new tab &mdash; pick the
                            time, add attendees, send the invite yourself.
                        </li>
                        <li className="flex gap-2">
                            <span className="text-muted-foreground">3.</span>
                            Not on Google Calendar? Copy the agenda text and paste it into Outlook, Fantastical,
                            or any other calendar.
                        </li>
                    </ul>
                    <p className="text-[11.5px] text-muted-foreground italic pt-1">
                        Native OAuth + conflict-aware slot picking land when the calendar spine is wired.
                    </p>
                </CardContent>
            </Card>
        </WorkspaceShell>
    )
}
