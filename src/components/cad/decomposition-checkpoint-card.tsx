"use client"

/**
 * @file decomposition-checkpoint-card.tsx — Specialist checkpoint feedback
 * shown after module decomposition but before CAD generation.
 *
 * @description Displays quick gut-level assessments from Max (CTO) and Fang
 * (VP Manufacturing) on the module decomposition. Helps catch architectural
 * and manufacturability issues before expensive generation begins.
 *
 * @related
 * - Checkpoint action: src/actions/cad-lab-reviews.ts (requestDecompositionCheckpoints)
 * - Types: src/lib/cad-lab-types.ts (DecompositionCheckpoint)
 * - Context: src/app/(platform)/the-forge/cad-lab/cad-lab-context.tsx
 */

import { useState } from "react"
import Image from "next/image"
import {
    ChevronDown,
    ChevronRight,
    Loader2,
    CheckCircle2,
    AlertTriangle,
    AlertOctagon,
    Info,
    Sparkles,
} from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getSpecialistById } from "@/lib/agents/specialists-config"
import type { DecompositionCheckpoint, CheckpointSentiment } from "@/lib/cad-lab-types"

// ─── Sentiment Config ────────────────────────────────────────────────

const SENTIMENT_CONFIG: Record<CheckpointSentiment, {
    icon: typeof CheckCircle2
    badgeVariant: "success" | "warning" | "destructive"
    label: string
}> = {
    positive: { icon: CheckCircle2, badgeVariant: "success", label: "Looks good" },
    cautious: { icon: AlertTriangle, badgeVariant: "warning", label: "Some concerns" },
    concerned: { icon: AlertOctagon, badgeVariant: "destructive", label: "Issues found" },
}

// ─── Props ────────────────────────────────────────────────────────────

interface DecompositionCheckpointCardProps {
    checkpoints: Record<string, DecompositionCheckpoint> | null
    isCheckpointing: boolean
    /** Called when the user acknowledges specialist concerns */
    onAcknowledge?: () => void
    /** Whether concerns have already been acknowledged */
    acknowledged?: boolean
    /** Whether modules are currently being revised from checkpoint feedback */
    isRevising?: boolean
    /** Number of modules that were revised */
    revisedModuleCount?: number
    /** When a specialist flagged the design as not buildable-as-specified, the
     *  founder should see a "Revise the design" CTA that opens the iteration
     *  dialog with alternative research-level changes (wider wingspan, split
     *  module, etc.). Evidence array has the specialist quotes that matched. */
    designInfeasibility?: { flagged: boolean; evidence: string[] } | null
    /** Opens the DesignIterationHost's infeasibility flow. */
    onReviseDesign?: (concernText: string, specialists: string[]) => void
}

// ─── Component ────────────────────────────────────────────────────────

export function DecompositionCheckpointCard({
    checkpoints,
    isCheckpointing,
    onAcknowledge,
    acknowledged = false,
    isRevising = false,
    revisedModuleCount = 0,
    designInfeasibility = null,
    onReviseDesign,
}: DecompositionCheckpointCardProps) {
    const [isExpanded, setIsExpanded] = useState(true)

    const entries = checkpoints ? Object.values(checkpoints) : []
    const hasCheckpoints = entries.length > 0
    const hasConcerns = entries.some(
        (c) => c.sentiment === "cautious" || c.sentiment === "concerned",
    )
    const hasFlaggedModules = entries.some((c) => c.flaggedModules.length > 0)

    if (!isCheckpointing && !hasCheckpoints) return null

    return (
        <Card>
            <CardHeader className="pb-3">
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center justify-between w-full text-left"
                    aria-expanded={isExpanded}
                >
                    <div className="flex items-center gap-2">
                        {isCheckpointing ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="text-sm font-semibold text-foreground">
                            Specialist Checkpoint
                        </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                        {isCheckpointing
                            ? "Consulting specialists..."
                            : `${entries.length} specialist${entries.length === 1 ? "" : "s"} consulted`}
                    </span>
                </button>
            </CardHeader>

            {isExpanded && (
                <CardContent className="pt-0 space-y-4">
                    {isCheckpointing && !hasCheckpoints && (
                        <LoadingText />
                    )}

                    {entries.map((checkpoint) => (
                        <CheckpointEntry key={checkpoint.specialistId} checkpoint={checkpoint} />
                    ))}

                    {/* Impact messaging — shown when any modules are flagged */}
                    {hasCheckpoints && hasFlaggedModules && (
                        <div className="flex items-start gap-2 pt-2 border-t border-border">
                            <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" />
                            <p className="text-xs text-muted-foreground">
                                Flagged modules will have specialist feedback applied during CAD generation.
                            </p>
                        </div>
                    )}

                    {/* Design-level infeasibility CTA (Phase IV). Shown when
                     *  detectDesignInfeasibility matched on the checkpoint results —
                     *  i.e. a specialist said "this design won't work at stated X".
                     *  Leads the founder into the iteration flow rather than letting
                     *  them continue with a broken design. */}
                    {designInfeasibility?.flagged && onReviseDesign && (
                        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-warning/10 border border-warning/30">
                            <AlertOctagon className="h-4 w-4 mt-0.5 flex-shrink-0 text-warning" />
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-foreground">
                                    Design-level concern flagged
                                </p>
                                <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">
                                    One or more specialists said the design as specified may not be buildable. Rewriting module text won&apos;t fix this — the research-level parameters (wingspan, mass budget, power budget) need to change.
                                </p>
                                <Button
                                    size="sm"
                                    onClick={() => onReviseDesign(
                                        designInfeasibility.evidence.join("\n\n") || "Design-level concern flagged by specialists.",
                                        [],
                                    )}
                                >
                                    <Sparkles className="h-3 w-3 mr-1.5" />
                                    Revise the design
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Acknowledge button — shown when concerns exist and not yet acknowledged */}
                    {hasCheckpoints && hasConcerns && !acknowledged && onAcknowledge && (
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={onAcknowledge}
                            className="w-full mt-1"
                        >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                            I&apos;ve reviewed these concerns
                        </Button>
                    )}

                    {/* Post-acknowledgment states: revising → revised → fallback */}
                    {hasCheckpoints && hasConcerns && acknowledged && (
                        <div className="flex items-center gap-2 pt-2 border-t border-border">
                            {isRevising ? (
                                <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                    <span className="text-xs text-muted-foreground">
                                        Applying specialist feedback to flagged modules...
                                    </span>
                                </>
                            ) : revisedModuleCount > 0 ? (
                                <>
                                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                                    <span className="text-xs text-muted-foreground">
                                        Specialist feedback applied — {revisedModuleCount} module{revisedModuleCount === 1 ? "" : "s"} revised
                                    </span>
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                                    <span className="text-xs text-muted-foreground">Concerns reviewed</span>
                                </>
                            )}
                        </div>
                    )}
                </CardContent>
            )}
        </Card>
    )
}

// ─── Loading Text ────────────────────────────────────────────────────

/** IDs must match CHECKPOINT_SPECIALISTS in src/actions/cad-lab-reviews.ts */
const CHECKPOINT_SPECIALIST_IDS = ["cto", "vp-manufacturing"] as const

function LoadingText() {
    const names = CHECKPOINT_SPECIALIST_IDS.map((id) => {
        const s = getSpecialistById(id)
        return s ? `${s.name} (${s.title})` : id
    })
    const label = names.length === 2
        ? `${names[0]} and ${names[1]}`
        : names.join(", ")

    return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {label} are reviewing the decomposition...
        </div>
    )
}

// ─── Specialist Entry ─────────────────────────────────────────────────

function CheckpointEntry({ checkpoint }: { checkpoint: DecompositionCheckpoint }) {
    const specialist = getSpecialistById(checkpoint.specialistId)
    const config = SENTIMENT_CONFIG[checkpoint.sentiment]
    const SentimentIcon = config.icon

    return (
        <div className="flex gap-3">
            {/* Avatar */}
            <div className="flex-shrink-0 mt-0.5">
                {specialist?.avatarImage ? (
                    <Image
                        src={specialist.avatarImage}
                        alt={checkpoint.specialistName}
                        width={32}
                        height={32}
                        className="rounded-full"
                    />
                ) : (
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                        {checkpoint.specialistName[0]}
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                        {checkpoint.specialistName}
                        {specialist?.title && (
                            <span className="text-muted-foreground font-normal">, {specialist.title}</span>
                        )}
                    </span>
                    <Badge variant={config.badgeVariant} className="text-xs">
                        <SentimentIcon className="h-3 w-3 mr-1" />
                        {config.label}
                    </Badge>
                </div>

                <p className="text-sm text-muted-foreground">{checkpoint.summary}</p>

                {checkpoint.suggestions.length > 0 && (
                    <ul className="space-y-0.5 pl-3">
                        {checkpoint.suggestions.map((s, i) => (
                            <li key={i} className="text-xs text-muted-foreground list-disc">
                                {s}
                            </li>
                        ))}
                    </ul>
                )}

                {checkpoint.flaggedModules.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs text-muted-foreground">Flagged:</span>
                        {checkpoint.flaggedModules.map((moduleId) => (
                            <Badge key={moduleId} variant="outline" className="text-xs">
                                {moduleId}
                            </Badge>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
