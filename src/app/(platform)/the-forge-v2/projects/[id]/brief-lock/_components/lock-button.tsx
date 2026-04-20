"use client"

/**
 * @file lock-button.tsx — Client component that fires `lockCadLabBrief`
 *       and renders the three states (idle, in-flight, done) inline.
 *
 * @description Replaces the Wave 1a in-memory stub. The button calls the
 * real server action via `useTransition`; on success the card swaps to a
 * green "Brief locked" confirmation that includes Max's auto-trigger
 * notice; on error we surface the errorCode + message with a retry CTA.
 *
 * Pattern copied from sibling client components in /the-forge-v2 (see
 * `unarchive-view.tsx`). `useTransition` keeps the button disabled while
 * the action is running without fighting the server-action's own
 * optimistic semantics.
 */

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Lock, CheckCircle2, ArrowRight, AlertTriangle } from "lucide-react"

import { lockCadLabBrief, type BriefLockErrorCode } from "@/actions/brief-lock"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

interface LockButtonProps {
    projectId: string
    projectHref: string
    briefHref: string
    modulesHref: string
    /** True when the server already sees this brief as locked (hide the CTA). */
    alreadyLocked: boolean
}

interface LockSuccess {
    revisionLabel: string
    lockedAt: string
}

export function LockButton({
    projectId,
    projectHref,
    briefHref,
    modulesHref,
    alreadyLocked,
}: LockButtonProps): React.ReactElement | null {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [success, setSuccess] = useState<LockSuccess | null>(null)
    const [error, setError] = useState<{ message: string; code?: BriefLockErrorCode } | null>(null)

    // If the server-side loader already says this brief is locked, we don't
    // render a CTA here at all — the page's AlreadyLockedBanner owns that
    // surface. Prevents a double "already locked" state reading oddly.
    if (alreadyLocked && !success) {
        return null
    }

    if (success) {
        return (
            <Card className="rounded-xl border border-l-[3px] border-l-status-success bg-status-success-light/40">
                <CardContent className="py-5 px-5 flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-status-success mt-0.5 shrink-0" />
                    <div className="space-y-1.5 min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">
                            Brief locked at {success.revisionLabel}
                        </p>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Max is decomposing your modules in the background — check the Modules tab in a minute or two. The Brief is now read-only; create a new revision to revise.
                        </p>
                        <div className="flex items-center gap-2 pt-2 flex-wrap">
                            <Button asChild size="sm" variant="secondary">
                                <Link href={modulesHref}>Open Modules →</Link>
                            </Button>
                            <Button asChild size="sm" variant="secondary">
                                <Link href={briefHref}>View locked brief</Link>
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

    const handleLock = (): void => {
        setError(null)
        startTransition(async () => {
            const result = await lockCadLabBrief(projectId)
            if (!result.ok) {
                setError({ message: result.error, code: result.errorCode })
                return
            }
            setSuccess({
                revisionLabel: revisionNumberToLabel(result.revisionNumber),
                lockedAt: result.lockedAt,
            })
            // Refresh server data so the brief-lock page re-renders with
            // the AlreadyLockedBanner on next navigation + the workspace
            // header badge flips to "locked".
            router.refresh()
        })
    }

    return (
        <div className="space-y-3">
            {error ? (
                <Card className="rounded-xl border border-l-[3px] border-l-status-danger bg-status-danger-light/30">
                    <CardContent className="py-4 px-5 flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-status-danger mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1 space-y-1">
                            <p className="text-sm font-semibold text-foreground">
                                Couldn&apos;t lock the brief
                            </p>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                {error.message}
                                {error.code ? (
                                    <span className="text-xs font-mono text-muted-foreground/70"> ({error.code})</span>
                                ) : null}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            ) : null}
            <Card className="rounded-xl border bg-muted/30">
                <CardContent className="py-5 px-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">
                            Locking is the terminal handoff
                        </p>
                        <p className="text-[12.5px] text-muted-foreground mt-1 leading-relaxed max-w-xl">
                            After lock, every downstream artefact anchors to this brief revision. Changes to target cost or key requirements require a new revision. Nothing in the brief body is lost — it becomes the canonical record and Max starts decomposing your modules in the background.
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
                            aria-busy={isPending}
                        >
                            <Lock className="h-3.5 w-3.5" />
                            {isPending ? "Locking…" : "Lock brief"}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

/** 1 → "Rev A", 2 → "Rev B", ... 26 → "Rev Z", 27+ numeric fallback. */
function revisionNumberToLabel(n: number): string {
    if (!Number.isFinite(n) || n < 1) return "Rev 1"
    if (n > 26) return `Rev ${n}`
    return `Rev ${String.fromCharCode(64 + n)}`
}
