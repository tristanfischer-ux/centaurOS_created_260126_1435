/**
 * @file progress-timeline.tsx — NASA-mission-control 12-stage vertical timeline.
 *
 * @description Replaces the basic spinner list with a fully interactive timeline.
 * Each stage shows:
 *   - Done: specialist colour accent, one-line outcome, green tick, click-to-expand
 *   - Active: pulsing dot in specialist brand colour, in-flight narrative, animated indicator
 *   - Pending: greyed out, stage name only, no click target
 *   - Failed: orange uncertainty marker, surface error
 *
 * Clicking a done or active stage opens the StageGlimpseModal.
 * Pending stages are non-interactive.
 *
 * Stage specialist colours follow the ForgeOS design system. CSS variables
 * are not yet wired to individual specialists on the progress page, so we
 * embed the canonical hex values directly. These match the ForgeOS brand
 * palette established in the existing design system.
 *
 * Voice rules per CLAUDE.md / project CLAUDE.md:
 *   - No AI emphasis, no specialist names in timeline labels
 *   - British spelling
 *   - No acronyms
 */

"use client"

import { useState } from "react"
import { CheckCircle2, Circle, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AutopilotStage } from "@/actions/forge-v2-autopilot"
import {
    NARRATIVE_STAGE_ORDER,
    STAGE_NARRATIVES,
    stageIndex,
} from "@/lib/forge-narrative/stage-narratives"
import { StageGlimpseModal } from "./stage-glimpse-modal"

// ── Specialist brand colours per stage ──────────────────────────────────────
// Chase = supply chain research: teal-blue
// Autopilot = orchestration: ForgeOS orange
// Max = architecture / CTO: deep blue
// Fang = manufacturing / engineering: earthy amber-brown
// Finn = finance: green
// System illustration = warm indigo
// Proofreading = neutral slate

export interface StageSpec {
    colour: string
    specialistLabel: string
}

const STAGE_SPECS: Record<string, StageSpec> = {
    waiting_chase:         { colour: "#0891b2", specialistLabel: "Market research" },
    locking_brief:         { colour: "#ff4500", specialistLabel: "Brief lock" },
    waiting_max:           { colour: "#1d4ed8", specialistLabel: "System architecture" },
    waiting_sizing:        { colour: "#92400e", specialistLabel: "Engineering sizing" },
    waiting_layout:        { colour: "#78350f", specialistLabel: "Spatial layout" },
    waiting_bom:           { colour: "#7c3aed", specialistLabel: "Bill of materials" },
    waiting_finn:          { colour: "#16a34a", specialistLabel: "Cost analysis" },
    generating_illustration: { colour: "#6366f1", specialistLabel: "System illustration" },
    matching_suppliers:    { colour: "#0891b2", specialistLabel: "Supplier matching" },
    running_fang_reviews:  { colour: "#92400e", specialistLabel: "Engineering reviews" },
    proofreading:          { colour: "#475569", specialistLabel: "Final pass" },
    generating_pdf:        { colour: "#ff4500", specialistLabel: "Report generation" },
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface StageOutcomes {
    [stage: string]: string | undefined
}

export interface StageDetails {
    [stage: string]: string | undefined
}

interface ProgressTimelineProps {
    currentStage: AutopilotStage | null
    completedStages: AutopilotStage[]
    isFinished: boolean
    stageOutcomes: StageOutcomes
    stageDetails: StageDetails
}

// ── Component ────────────────────────────────────────────────────────────────

export function ProgressTimeline({
    currentStage,
    completedStages,
    isFinished,
    stageOutcomes,
    stageDetails,
}: ProgressTimelineProps): React.ReactElement {
    const [glimpseStage, setGlimpseStage] = useState<AutopilotStage | null>(null)

    function getStageState(
        stage: AutopilotStage,
        idx: number,
    ): "done" | "active" | "pending" | "failed" {
        const isDone =
            completedStages.includes(stage) ||
            (currentStage != null && stageIndex(currentStage) > idx) ||
            (isFinished)
        if (isDone) return "done"
        if (currentStage === stage && !isFinished) return "active"
        return "pending"
    }

    const glimpseSpec =
        glimpseStage ? (STAGE_SPECS[glimpseStage] ?? null) : null
    const glimpseState =
        glimpseStage
            ? getStageState(
                  glimpseStage,
                  NARRATIVE_STAGE_ORDER.indexOf(glimpseStage),
              )
            : "pending"

    return (
        <>
            <ol className="space-y-0" aria-label="Pipeline stages">
                {NARRATIVE_STAGE_ORDER.map((stage, idx) => {
                    const narrative = STAGE_NARRATIVES[stage]
                    const spec = STAGE_SPECS[stage] ?? { colour: "#94a3b8", specialistLabel: "" }
                    const stageState = getStageState(stage, idx)
                    const isClickable = stageState === "done" || stageState === "active"
                    const outcomeLine = stageOutcomes[stage] ?? null
                    const isLast = idx === NARRATIVE_STAGE_ORDER.length - 1

                    return (
                        <li key={stage} className="relative">
                            {/* Connector line */}
                            {!isLast && (
                                <div
                                    className={cn(
                                        "absolute left-[15px] top-8 w-px bottom-0 z-0",
                                        stageState === "done"
                                            ? "bg-international-orange/30"
                                            : "bg-border",
                                    )}
                                    aria-hidden="true"
                                />
                            )}

                            {/* Row */}
                            <button
                                type="button"
                                disabled={!isClickable}
                                onClick={() => {
                                    if (isClickable) setGlimpseStage(stage)
                                }}
                                className={cn(
                                    "relative z-10 w-full text-left flex gap-4 py-3 px-1 rounded-lg transition-colors",
                                    isClickable
                                        ? "cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        : "cursor-default",
                                    stageState === "pending" && "opacity-40",
                                )}
                                aria-label={
                                    isClickable
                                        ? `View details for: ${narrative.label}`
                                        : narrative.label
                                }
                            >
                                {/* Icon column */}
                                <div className="mt-0.5 shrink-0 flex flex-col items-center">
                                    <StageIcon state={stageState} colour={spec.colour} />
                                </div>

                                {/* Content column */}
                                <div className="flex-1 min-w-0 pb-1">
                                    <div className="flex items-center gap-2">
                                        <p
                                            className={cn(
                                                "text-sm font-medium leading-snug",
                                                stageState === "done" && "text-foreground",
                                                stageState === "active" && "text-foreground",
                                                stageState === "pending" && "text-muted-foreground",
                                            )}
                                        >
                                            {narrative.label}
                                        </p>
                                        {/* Specialist label (small, muted) */}
                                        {stageState !== "pending" && spec.specialistLabel && (
                                            <span
                                                className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                                                style={{
                                                    backgroundColor: `${spec.colour}15`,
                                                    color: spec.colour,
                                                }}
                                            >
                                                {spec.specialistLabel}
                                            </span>
                                        )}
                                    </div>

                                    {/* Done: one-line outcome */}
                                    {stageState === "done" && outcomeLine && (
                                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                                            {outcomeLine}
                                        </p>
                                    )}

                                    {/* Done fallback narrative */}
                                    {stageState === "done" && !outcomeLine && (
                                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                                            {narrative.narrative}
                                        </p>
                                    )}

                                    {/* Active: in-flight copy */}
                                    {stageState === "active" && (
                                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                                            {narrative.inFlight}
                                        </p>
                                    )}

                                    {/* Click hint for interactive rows */}
                                    {isClickable && (
                                        <p
                                            className="text-[10px] mt-1"
                                            style={{ color: spec.colour }}
                                        >
                                            Tap to see details →
                                        </p>
                                    )}
                                </div>
                            </button>
                        </li>
                    )
                })}
            </ol>

            {/* Glimpse modal */}
            <StageGlimpseModal
                stage={glimpseStage}
                spec={glimpseSpec}
                stageState={glimpseState}
                outcomeSummary={glimpseStage ? (stageOutcomes[glimpseStage] ?? null) : null}
                outcomeDetail={glimpseStage ? (stageDetails[glimpseStage] ?? null) : null}
                onClose={() => setGlimpseStage(null)}
            />
        </>
    )
}

// ── Stage icon sub-component ─────────────────────────────────────────────────

function StageIcon({
    state,
    colour,
}: {
    state: "done" | "active" | "pending" | "failed"
    colour: string
}): React.ReactElement {
    if (state === "done") {
        return (
            <div
                className="h-[30px] w-[30px] rounded-full flex items-center justify-center"
                style={{ backgroundColor: `${colour}20` }}
            >
                <CheckCircle2 className="h-4 w-4" style={{ color: colour }} />
            </div>
        )
    }

    if (state === "active") {
        return (
            <div
                className="h-[30px] w-[30px] rounded-full flex items-center justify-center"
                style={{ backgroundColor: `${colour}15` }}
            >
                <span
                    className="h-3 w-3 rounded-full animate-pulse"
                    style={{ backgroundColor: colour }}
                />
            </div>
        )
    }

    if (state === "failed") {
        return (
            <div className="h-[30px] w-[30px] rounded-full flex items-center justify-center bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
            </div>
        )
    }

    // Pending
    return (
        <div className="h-[30px] w-[30px] rounded-full flex items-center justify-center bg-muted">
            <Circle className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
    )
}
