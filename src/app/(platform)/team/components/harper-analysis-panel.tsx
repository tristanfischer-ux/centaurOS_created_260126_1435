'use client'

/**
 * @file harper-analysis-panel.tsx
 *
 * @description Prominent Harper (HR specialist) analysis panel shown at the top
 * of the Team page. Combines team stats on the left with Harper's AI-generated
 * instant analysis on the right. Visible in all view modes including orbit.
 */

import { Users, ShieldCheck, BarChart3, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { UserAvatar } from '@/components/ui/user-avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { AskSpecialistButton } from '@/components/specialists/ask-specialist-button'
import { cn } from '@/lib/utils'
import type { AgentInsight } from '@/actions/agent-insights'

// ─── Urgency dot color mapping ───────────────────────────────────────

const urgencyDot: Record<AgentInsight['urgency'], string> = {
    critical: 'bg-destructive',
    important: 'bg-warning',
    informational: 'bg-info',
}

// ─── Props ───────────────────────────────────────────────────────────

interface HarperAnalysisPanelProps {
    totalPeople: number
    totalTeams: number
    avgCapacity: number
    harperInsights: AgentInsight[]
    isLoading: boolean
    onDismissInsight?: (id: string) => void
    /** Context passed to AskSpecialistButton for follow-up */
    specialistContext: {
        totalPeople: number
        founders: number
        executives: number
        apprentices: number
        totalTeams: number
        avgCapacity: number
        overloadedNote?: string
    }
}

// ─── Component ───────────────────────────────────────────────────────

export function HarperAnalysisPanel({
    totalPeople,
    totalTeams,
    avgCapacity,
    harperInsights,
    isLoading,
    onDismissInsight,
    specialistContext,
}: HarperAnalysisPanelProps) {
    return (
        <Card className="p-4 border-border bg-card">
            <div className="flex flex-col sm:flex-row gap-4">
                {/* ── Left: Team Stats ── */}
                <div className="flex sm:flex-col gap-4 sm:gap-3 shrink-0 sm:min-w-[120px]">
                    <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-international-orange shrink-0" />
                        <span className="text-lg font-bold text-foreground leading-none">{totalPeople}</span>
                        <span className="text-xs text-muted-foreground">People</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-electric-blue shrink-0" />
                        <span className="text-lg font-bold text-foreground leading-none">{totalTeams}</span>
                        <span className="text-xs text-muted-foreground">Teams</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-success shrink-0" />
                        <span className="text-lg font-bold text-foreground leading-none">{avgCapacity}%</span>
                        <span className="text-xs text-muted-foreground">Capacity</span>
                    </div>
                </div>

                {/* ── Divider ── */}
                <div className="hidden sm:block w-px bg-border self-stretch" />
                <div className="sm:hidden h-px bg-border" />

                {/* ── Right: Harper's Analysis ── */}
                <div className="flex-1 min-w-0">
                    {/* Harper identity row */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                            <UserAvatar
                                name="Harper"
                                role="AI_Agent"
                                size="sm"
                            />
                            <div>
                                <span className="text-sm font-semibold text-foreground">Harper</span>
                                <span className="text-xs text-muted-foreground ml-1.5">HR</span>
                            </div>
                        </div>
                        <AskSpecialistButton
                            context={{
                                type: 'general',
                                title: 'Team & Hiring',
                                description: `Team overview: ${specialistContext.totalPeople} members (${specialistContext.founders} founders, ${specialistContext.executives} executives, ${specialistContext.apprentices} apprentices), ${specialistContext.totalTeams} teams, ${specialistContext.avgCapacity}% avg capacity remaining.`,
                                metadata: {
                                    notes: specialistContext.overloadedNote,
                                },
                            }}
                            specialistId="hiring-team"
                            specialistName="Harper"
                            variant="chip"
                            label="Ask Harper"
                        />
                    </div>

                    {/* Loading skeleton */}
                    {isLoading && (
                        <div className="space-y-2">
                            <p className="text-xs text-muted-foreground italic">Analysing your team composition...</p>
                            <Skeleton className="h-4 w-full rounded" />
                            <Skeleton className="h-4 w-3/4 rounded" />
                        </div>
                    )}

                    {/* Insights list */}
                    {!isLoading && harperInsights.length > 0 && (
                        <ul className="space-y-1.5">
                            {harperInsights.map((insight) => (
                                <li key={insight.id} className="flex items-start gap-2 group">
                                    <div
                                        className={cn(
                                            'mt-1.5 h-2 w-2 rounded-full shrink-0',
                                            urgencyDot[insight.urgency],
                                        )}
                                    />
                                    <div className="flex-1 min-w-0">
                                        <span className="text-sm font-medium text-foreground">
                                            {insight.title}
                                        </span>
                                        <span className="text-sm text-muted-foreground ml-1">
                                            {insight.body}
                                        </span>
                                    </div>
                                    {onDismissInsight && (
                                        <button
                                            onClick={() => onDismissInsight(insight.id)}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                                            aria-label={`Dismiss: ${insight.title}`}
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}

                    {/* Empty state — no insights and not loading */}
                    {!isLoading && harperInsights.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                            No immediate concerns. Your team looks healthy.
                        </p>
                    )}
                </div>
            </div>
        </Card>
    )
}
