/**
 * @file stage-glimpse-modal.tsx — click-into detail overlay for each pipeline stage.
 *
 * @description Shows the founder what the engine produced (done stage),
 * what it is currently doing (active stage), or what it will do
 * (pending stage). Data comes from the stageOutcomes + stageDetails
 * fields on the forge-status API response.
 *
 * Voice rules per CLAUDE.md / project CLAUDE.md:
 *   - No AI emphasis ("13 specialists" not "13 AI agents")
 *   - British spelling
 *   - No failure-mode framing
 *   - No acronyms — spell every term out
 */

"use client"

import { CheckCircle2, Clock, Circle, AlertTriangle, X } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { AutopilotStage } from "@/actions/forge-v2-autopilot"
import { STAGE_NARRATIVES } from "@/lib/forge-narrative/stage-narratives"
import type { StageSpec } from "./progress-timeline"

interface StageGlimpseModalProps {
    stage: AutopilotStage | null
    spec: StageSpec | null
    stageState: "done" | "active" | "pending" | "failed"
    outcomeSummary: string | null
    outcomeDetail: string | null
    onClose: () => void
}

export function StageGlimpseModal({
    stage,
    spec,
    stageState,
    outcomeSummary,
    outcomeDetail,
    onClose,
}: StageGlimpseModalProps): React.ReactElement {
    const open = stage !== null && spec !== null

    if (!stage || !spec) {
        return (
            <Dialog open={false} onOpenChange={onClose}>
                <DialogContent />
            </Dialog>
        )
    }

    const narrative = STAGE_NARRATIVES[stage]
    const specialistLabel = spec.specialistLabel

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <div className="flex items-start gap-3">
                        {/* Stage icon with specialist brand colour */}
                        <div
                            className="mt-0.5 h-8 w-8 rounded-full flex items-center justify-center shrink-0"
                            style={{ backgroundColor: `${spec.colour}20` }}
                        >
                            {stageState === "done" ? (
                                <CheckCircle2
                                    className="h-4 w-4"
                                    style={{ color: spec.colour }}
                                />
                            ) : stageState === "active" ? (
                                <Clock
                                    className="h-4 w-4 animate-pulse"
                                    style={{ color: spec.colour }}
                                />
                            ) : stageState === "failed" ? (
                                <AlertTriangle className="h-4 w-4 text-amber-500" />
                            ) : (
                                <Circle className="h-4 w-4 text-muted-foreground" />
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <DialogTitle className="text-base font-semibold leading-snug">
                                {narrative.label}
                            </DialogTitle>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-muted-foreground">
                                    {specialistLabel}
                                </span>
                                <StatusBadge state={stageState} />
                            </div>
                        </div>
                    </div>
                </DialogHeader>

                <div className="space-y-4 pt-2">
                    {/* Done: show outcome summary + detail */}
                    {stageState === "done" && (
                        <>
                            {outcomeSummary && (
                                <div
                                    className="rounded-lg px-4 py-3 text-sm font-medium"
                                    style={{ backgroundColor: `${spec.colour}10`, color: spec.colour }}
                                >
                                    {outcomeSummary}
                                </div>
                            )}
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                {narrative.narrative}
                            </p>
                            {outcomeDetail && (
                                <div className="rounded-lg border bg-muted/30 px-4 py-3">
                                    <p className="text-xs font-medium text-foreground mb-1">
                                        From this stage
                                    </p>
                                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                                        {outcomeDetail}
                                    </p>
                                </div>
                            )}
                        </>
                    )}

                    {/* Active: show in-flight narrative + animated indicator */}
                    {stageState === "active" && (
                        <>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span
                                    className="inline-block h-2 w-2 rounded-full animate-pulse"
                                    style={{ backgroundColor: spec.colour }}
                                />
                                In progress now
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                {narrative.inFlight}
                            </p>
                        </>
                    )}

                    {/* Pending: show what this stage will do */}
                    {stageState === "pending" && (
                        <>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                {narrative.narrative}
                            </p>
                            <p className="text-xs text-muted-foreground italic">
                                This stage has not started yet. It will begin automatically once the stages before it complete.
                            </p>
                        </>
                    )}

                    {/* Failed / uncertainty marker */}
                    {stageState === "failed" && (
                        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
                            <p className="text-sm text-amber-900 leading-relaxed">
                                {outcomeSummary ?? "This stage encountered an issue. The engine will retry automatically — refresh the page in a minute to see the latest state."}
                            </p>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}

function StatusBadge({ state }: { state: "done" | "active" | "pending" | "failed" }): React.ReactElement {
    if (state === "done") {
        return <Badge variant="outline" className="text-xs border-green-500/40 text-green-700 bg-green-50">Complete</Badge>
    }
    if (state === "active") {
        return <Badge variant="outline" className="text-xs border-international-orange/40 text-international-orange bg-orange-50">In progress</Badge>
    }
    if (state === "failed") {
        return <Badge variant="outline" className="text-xs border-amber-400/40 text-amber-700 bg-amber-50">Needs attention</Badge>
    }
    return <Badge variant="outline" className="text-xs text-muted-foreground">Queued</Badge>
}
