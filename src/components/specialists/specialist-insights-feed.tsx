/**
 * @file specialist-insights-feed.tsx
 *
 * @description Renders a feed of specialist insights relevant to the current
 * page context. Fetches insights from the server and displays them as
 * compact cards with dismiss and discuss actions.
 *
 * @example
 * <SpecialistInsightsFeed
 *   context="objectives"
 *   maxInsights={3}
 *   onDiscuss={openSpecialistDialog}
 * />
 */

'use client'

import { useEffect, useState, useCallback } from 'react'

import { SpecialistInsightCard } from './specialist-insight-card'
import { getContextualInsights, dismissInsight } from '@/actions/agent-insights'
import { cn } from '@/lib/utils'
import type { AgentInsight } from '@/actions/agent-insights'

// ─── Props ──────────────────────────────────────────────────────────

interface SpecialistInsightsFeedProps {
    /** Page context to filter insights (e.g., 'objectives', 'tasks', 'strategy') */
    context: string
    /** Maximum number of insights to show */
    maxInsights?: number
    /** Callback when user wants to discuss with a specialist */
    onDiscuss?: (specialistId: string, insightContext: string) => void
    /** Additional CSS classes */
    className?: string
}

// ─── Component ──────────────────────────────────────────────────────

/**
 * Fetches and displays contextual specialist insights for a given page.
 *
 * @description Loads insights relevant to the current page context on mount,
 * then renders them as compact insight cards. Supports dismiss (optimistic UI
 * with server sync) and discuss callbacks. Returns null when loading or empty.
 *
 * @param props - Component props
 * @returns The insights feed, or null if loading/empty
 */
export function SpecialistInsightsFeed({
    context,
    maxInsights = 3,
    onDiscuss,
    className,
}: SpecialistInsightsFeedProps): React.ReactElement | null {
    const [insights, setInsights] = useState<AgentInsight[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        let cancelled = false

        async function loadInsights(): Promise<void> {
            try {
                const data = await getContextualInsights(context, maxInsights)
                if (!cancelled) {
                    setInsights(data)
                }
            } catch (error) {
                console.error('[InsightsFeed] Failed to load insights:', {
                    context,
                    error: error instanceof Error ? error.message : 'Unknown error',
                })
            } finally {
                if (!cancelled) setIsLoading(false)
            }
        }

        loadInsights()
        return () => { cancelled = true }
    }, [context, maxInsights])

    const handleDismiss = useCallback(async (insightId: string) => {
        // Optimistic UI: remove immediately
        setInsights(prev => prev.filter(i => i.id !== insightId))

        // Sync with server
        try {
            await dismissInsight(insightId)
        } catch (error) {
            console.error('[InsightsFeed] Failed to dismiss insight:', {
                insightId,
                error: error instanceof Error ? error.message : 'Unknown error',
            })
        }
    }, [])

    if (isLoading || insights.length === 0) return null

    return (
        <div className={cn('space-y-3', className)}>
            {insights.map(insight => (
                <SpecialistInsightCard
                    key={insight.id}
                    insight={insight}
                    onDismiss={handleDismiss}
                    onDiscuss={onDiscuss}
                    compact
                />
            ))}
        </div>
    )
}
