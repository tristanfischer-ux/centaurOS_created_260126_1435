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
} from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getSpecialistById } from "@/app/(platform)/agents/specialists-data"
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
}

// ─── Component ────────────────────────────────────────────────────────

export function DecompositionCheckpointCard({
    checkpoints,
    isCheckpointing,
}: DecompositionCheckpointCardProps) {
    const [isExpanded, setIsExpanded] = useState(true)

    const entries = checkpoints ? Object.values(checkpoints) : []
    const hasCheckpoints = entries.length > 0

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
                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Max and Fang are reviewing the decomposition...
                        </div>
                    )}

                    {entries.map((checkpoint) => (
                        <CheckpointEntry key={checkpoint.specialistId} checkpoint={checkpoint} />
                    ))}
                </CardContent>
            )}
        </Card>
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
