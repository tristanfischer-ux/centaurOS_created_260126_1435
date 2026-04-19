"use client"

/**
 * @file archive-button.tsx — Real archive flow backed by archiveCadLabProject.
 *
 * Sets archived_at on the project row. No cascading deletes. Project remains
 * loadable via direct URL + appears in the Archive tab (future). Unarchive
 * reverses immediately.
 */

import Link from "next/link"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Loader2, Archive, RotateCcw } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { archiveCadLabProject } from "@/actions/cad-lab-projects"

interface ArchiveButtonProps {
    projectId: string
    projectHref: string
    initialArchivedAt: string | null
}

export function ArchiveButton({ projectId, projectHref, initialArchivedAt }: ArchiveButtonProps): React.ReactElement {
    const [archivedAt, setArchivedAt] = useState<string | null>(initialArchivedAt)
    const [isPending, startTransition] = useTransition()
    const router = useRouter()

    const handleArchive = () => {
        startTransition(async () => {
            const result = await archiveCadLabProject(projectId, true)
            if ("error" in result) {
                toast.error(result.error)
                return
            }
            setArchivedAt(result.archivedAt)
            toast.success("Project archived")
            // Give the toast a beat, then bounce to workspace
            setTimeout(() => router.push("/the-forge-v2"), 900)
        })
    }

    const handleUnarchive = () => {
        startTransition(async () => {
            const result = await archiveCadLabProject(projectId, false)
            if ("error" in result) {
                toast.error(result.error)
                return
            }
            setArchivedAt(null)
            toast.success("Project restored")
        })
    }

    if (archivedAt) {
        const dateLabel = new Date(archivedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
        return (
            <Card className="rounded-xl border border-l-[3px] border-l-status-warning bg-status-warning-light/30">
                <CardContent className="py-5 px-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">Archived {dateLabel}</p>
                        <p className="text-[12.5px] text-muted-foreground mt-1 leading-relaxed max-w-xl">
                            Hidden from the default workspace list. All artefacts preserved — use Restore to bring it back.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Button asChild size="sm" variant="secondary" disabled={isPending}>
                            <Link href={projectHref}>View archived project</Link>
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleUnarchive}
                            disabled={isPending}
                            className="gap-1.5"
                        >
                            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                            Restore
                        </Button>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className="rounded-xl border bg-muted/30">
            <CardContent className="py-5 px-5 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">Archive moves the project to the Archive tab</p>
                    <p className="text-[12.5px] text-muted-foreground mt-1 leading-relaxed max-w-xl">
                        All artefacts are preserved. The project keeps its URL + remains searchable. Unarchive any time.
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Button asChild size="sm" variant="secondary" disabled={isPending}>
                        <Link href={projectHref}>Back to project</Link>
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleArchive}
                        disabled={isPending}
                        className="gap-1.5 bg-international-orange hover:bg-international-orange/90 text-white"
                    >
                        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
                        Archive project
                        <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
