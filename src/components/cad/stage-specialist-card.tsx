"use client"

/**
 * @file stage-specialist-card.tsx — Stage entry/exit briefing card.
 *
 * INTENT: Each CAD Lab stage has an owning specialist who briefs the user on
 * entry and summarises on exit with a handoff to the next specialist.
 * This component renders both variants (entry/exit) with specialist avatar,
 * name, title, briefing text, and optional handoff section.
 *
 * @related
 * - Stage map: src/lib/cad-lab/stage-specialist-map.ts
 * - Specialists data: src/app/(platform)/agents/specialists-data.ts
 */

import Image from "next/image"
import { ArrowRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { getSpecialistById, type SpecialistId } from "@/lib/agents/specialists-config"

// DECISION: Color tokens per specialist for consistent visual identity across stages.
// Matches existing patterns: Chase=info, Fang=warning.
const SPECIALIST_COLORS: Partial<Record<SpecialistId, { text: string; border: string; bg: string; iconBg: string }>> = {
    cto: { text: "text-international-orange", border: "border-international-orange/30", bg: "from-international-orange/5", iconBg: "bg-international-orange/10" },
    "vp-manufacturing": { text: "text-warning", border: "border-warning/30", bg: "from-warning/5", iconBg: "bg-warning/10" },
    "vp-supply-chain": { text: "text-info", border: "border-info/30", bg: "from-info/5", iconBg: "bg-info/10" },
    "vp-engineering": { text: "text-primary", border: "border-primary/30", bg: "from-primary/5", iconBg: "bg-primary/10" },
}

const DEFAULT_COLORS = { text: "text-muted-foreground", border: "border-border", bg: "from-muted/5", iconBg: "bg-muted" }

interface StageSpecialistCardProps {
    specialistId: SpecialistId
    variant: "entry" | "exit"
    /** Briefing text (AI-generated or static). Null while loading. */
    briefing: string | null
    isLoading?: boolean
    /** Stage display name (e.g., "Design", "Specify") */
    stageName: string
    /** For exit variant: the next specialist to hand off to */
    nextSpecialistId?: SpecialistId
    /** For exit variant: the next stage name */
    nextStageName?: string
    /** For exit variant: proceed button callback */
    onProceed?: () => void
    /** For exit variant: custom proceed button label */
    proceedLabel?: string
}

export function StageSpecialistCard({
    specialistId,
    variant,
    briefing,
    isLoading = false,
    stageName,
    nextSpecialistId,
    nextStageName,
    onProceed,
    proceedLabel,
}: StageSpecialistCardProps) {
    const specialist = getSpecialistById(specialistId)
    if (!specialist) return null

    const colors = SPECIALIST_COLORS[specialistId] ?? DEFAULT_COLORS
    const nextSpecialist = nextSpecialistId ? getSpecialistById(nextSpecialistId) : null

    const headerLabel = variant === "entry"
        ? `${specialist.name}, ${specialist.title} — ${stageName}`
        : `${specialist.name}, ${specialist.title} — ${stageName} Complete`

    return (
        <Card className={`${colors.border} bg-gradient-to-r ${colors.bg} to-background`}>
            <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                    {/* Specialist avatar */}
                    {specialist.avatarImage ? (
                        <Image
                            src={specialist.avatarImage}
                            alt={specialist.name}
                            width={32}
                            height={32}
                            className="rounded-full flex-shrink-0"
                        />
                    ) : (
                        <div className={`shrink-0 w-8 h-8 rounded-full ${colors.iconBg} flex items-center justify-center`}>
                            <span className={`text-xs font-semibold ${colors.text}`}>
                                {specialist.name[0]}
                            </span>
                        </div>
                    )}

                    <div className="min-w-0 flex-1 space-y-2">
                        <p className={`text-xs font-semibold ${colors.text}`}>{headerLabel}</p>

                        {/* Briefing text or loading skeleton — ALWAYS shows text, never empty */}
                        {isLoading ? (
                            <div className="space-y-1.5">
                                <Skeleton className="h-3.5 w-full" />
                                <Skeleton className="h-3.5 w-3/4" />
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                {briefing ?? specialist.tagline}
                            </p>
                        )}

                        {/* Exit variant: handoff section */}
                        {variant === "exit" && nextSpecialist && nextStageName && (
                            <div className="flex items-center gap-2 pt-2 border-t border-border/50 mt-3">
                                {nextSpecialist.avatarImage ? (
                                    <Image
                                        src={nextSpecialist.avatarImage}
                                        alt={nextSpecialist.name}
                                        width={20}
                                        height={20}
                                        className="rounded-full flex-shrink-0"
                                    />
                                ) : (
                                    <div className="shrink-0 w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                                        <span className="text-[10px] font-medium text-muted-foreground">
                                            {nextSpecialist.name[0]}
                                        </span>
                                    </div>
                                )}
                                <p className="text-xs text-muted-foreground">
                                    Handing off to <span className="font-medium text-foreground">{nextSpecialist.name}</span> for {nextStageName}
                                </p>
                            </div>
                        )}

                        {/* Exit variant: proceed button */}
                        {variant === "exit" && onProceed && (
                            <div className="pt-2">
                                <Button size="sm" onClick={onProceed} className="gap-1.5">
                                    {proceedLabel ?? `Proceed to ${nextStageName ?? "Next"}`}
                                    <ArrowRight className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        )}

                        {/* Exit variant: last stage (no handoff) */}
                        {variant === "exit" && !nextSpecialist && !onProceed && (
                            <p className="text-xs text-muted-foreground italic pt-1">
                                Final stage complete. Your product is ready.
                            </p>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
