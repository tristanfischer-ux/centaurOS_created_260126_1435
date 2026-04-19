"use client"

/**
 * @file lock-button.tsx — Client-side stub of the brief-lock action.
 *
 * @description Holds "locked" state in local component state because
 * `brief_locked_at timestamptz` has not yet been added to `cad_lab_projects`.
 * Clicking "Lock brief" flips to a post-lock confirmation panel in-memory,
 * which resets on hard refresh. When the migration lands, this swaps for a
 * real `lockCadLabBrief(projectId)` server action without changing the UX.
 */

import Link from "next/link"
import { useState } from "react"
import { Lock, CheckCircle2, ArrowRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

interface LockButtonProps {
    projectHref: string
    briefHref: string
}

export function LockButton({ projectHref, briefHref }: LockButtonProps): React.ReactElement {
    const [locked, setLocked] = useState(false)

    if (locked) {
        return (
            <Card className="rounded-xl border border-l-[3px] border-l-status-success bg-status-success-light/40">
                <CardContent className="py-5 px-5 flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-status-success mt-0.5 shrink-0" />
                    <div className="space-y-1.5 min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">
                            Brief lock recorded (in-memory stub)
                        </p>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            The brief is flagged as locked in this session. A persisted `brief_locked_at` timestamp lands with the queued migration — until then, hard-refresh resets this flag and no audit entry is written.
                        </p>
                        <div className="flex items-center gap-2 pt-2">
                            <Button asChild size="sm" variant="secondary">
                                <Link href={briefHref}>Open locked brief</Link>
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
                        After lock, every downstream artefact anchors to this brief revision. Changes to target cost or key requirements require a fork. Nothing in the brief body is lost — it becomes the canonical, read-only record.
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Button asChild size="sm" variant="secondary">
                        <Link href={briefHref}>Keep editing</Link>
                    </Button>
                    <Button
                        size="sm"
                        className="gap-1.5 bg-international-orange hover:bg-international-orange/90 text-white"
                        onClick={() => setLocked(true)}
                    >
                        <Lock className="h-3.5 w-3.5" />
                        Lock brief
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
