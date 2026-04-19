"use client"

/**
 * @file lock-button.tsx — Real brief-lock flow using the lockCadLabBrief /
 * unlockCadLabBrief server actions (shipped 2026-04-22 alongside the
 * brief_locked_at column).
 */

import Link from "next/link"
import { useState, useTransition } from "react"
import { Lock, CheckCircle2, ArrowRight, Loader2, Unlock } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { lockCadLabBrief, unlockCadLabBrief } from "@/actions/cad-lab-projects"

interface LockButtonProps {
    projectId: string
    projectHref: string
    briefHref: string
    initialLockedAt: string | null
}

export function LockButton({ projectId, projectHref, briefHref, initialLockedAt }: LockButtonProps): React.ReactElement {
    const [lockedAt, setLockedAt] = useState<string | null>(initialLockedAt)
    const [isPending, startTransition] = useTransition()

    const handleLock = () => {
        startTransition(async () => {
            const result = await lockCadLabBrief(projectId)
            if ("error" in result) {
                toast.error(result.error)
                return
            }
            setLockedAt(result.lockedAt)
            toast.success("Brief locked")
        })
    }

    const handleUnlock = () => {
        startTransition(async () => {
            const result = await unlockCadLabBrief(projectId)
            if ("error" in result) {
                toast.error(result.error)
                return
            }
            setLockedAt(null)
            toast.success("Brief unlocked")
        })
    }

    if (lockedAt) {
        const dateLabel = new Date(lockedAt).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        return (
            <Card className="rounded-xl border border-l-[3px] border-l-status-success bg-status-success-light/40">
                <CardContent className="py-5 px-5 flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-status-success mt-0.5 shrink-0" />
                    <div className="space-y-1.5 min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">
                            Brief locked on {dateLabel}
                        </p>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Every downstream artefact now anchors to this brief revision. Scope changes require an unlock or a fork.
                        </p>
                        <div className="flex items-center gap-2 pt-2 flex-wrap">
                            <Button asChild size="sm" variant="secondary">
                                <Link href={briefHref}>Open locked brief</Link>
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleUnlock}
                                disabled={isPending}
                                className="gap-1.5"
                            >
                                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />}
                                Unlock
                            </Button>
                            <Button asChild size="sm" className="gap-1.5 bg-international-orange hover:bg-international-orange/90 text-white">
                                <Link href={projectHref}>
                                    Back to project <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className="rounded-xl border bg-muted/30">
            <CardContent className="py-5 px-5 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                        Locking is the terminal handoff
                    </p>
                    <p className="text-[12.5px] text-muted-foreground mt-1 leading-relaxed max-w-xl">
                        After lock, every downstream artefact anchors to this brief revision. Changes to target cost or key requirements require an unlock or a fork. Nothing in the brief body is lost — it becomes the canonical, read-only record.
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Button asChild size="sm" variant="secondary" disabled={isPending}>
                        <Link href={briefHref}>Keep editing</Link>
                    </Button>
                    <Button
                        size="sm"
                        className="gap-1.5 bg-international-orange hover:bg-international-orange/90 text-white"
                        onClick={handleLock}
                        disabled={isPending}
                    >
                        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
                        Lock brief
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
