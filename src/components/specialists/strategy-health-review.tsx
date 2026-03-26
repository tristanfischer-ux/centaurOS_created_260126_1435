"use client"

/**
 * @file strategy-health-review.tsx
 *
 * @description Sage's strategic overview card. Shows an immediate local-logic
 * insight, then fetches a 1-2 paragraph AI overview in the background.
 * The AI overview replaces the local insight when ready.
 */

import { useMemo, useState, useEffect, useRef } from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertTriangle, TrendingUp, CheckCircle2 } from "lucide-react"
import { AskSpecialistButton } from "./ask-specialist-button"
import { generateStrategyOverview } from "@/actions/specialist-page-insights"
import type { SpecialistContext } from "./types"

interface StrategyPillarSummary {
  title: string
  health: string
  progress: number
  overdueTasks: number
}

interface StrategyHealthReviewProps {
  pillars: (StrategyPillarSummary & { objectiveCount?: number })[]
  purposeSummary?: string | null
  totalObjectives?: number
  unlinkedObjectiveCount?: number
  className?: string
}

/**
 * Generates a brief, opinionated insight from Sage based on pillar health data.
 */
function generateInsight(pillars: StrategyPillarSummary[]): {
  message: string
  severity: 'success' | 'warning' | 'error'
} {
  if (pillars.length === 0) {
    return {
      message: "You haven't defined strategic pillars yet. That's the first thing I'd want to fix -- without clear pillars, everything downstream is guesswork.",
      severity: 'warning',
    }
  }

  const offTrack = pillars.filter(p => p.health === 'off-track')
  const atRisk = pillars.filter(p => p.health === 'at-risk')
  const totalOverdue = pillars.reduce((sum, p) => sum + p.overdueTasks, 0)
  const avgProgress = Math.round(pillars.reduce((sum, p) => sum + p.progress, 0) / pillars.length)
  const allCompleted = pillars.every(p => p.health === 'completed')

  if (allCompleted) {
    return {
      message: "All strategic pillars are completed. Time to set the next horizon -- what's the next big bet?",
      severity: 'success',
    }
  }

  if (offTrack.length > 0) {
    const names = offTrack.map(p => `"${p.title}"`).join(' and ')
    return {
      message: `${names} ${offTrack.length === 1 ? 'is' : 'are'} off track. ${totalOverdue > 0 ? `${totalOverdue} overdue tasks are dragging things down.` : ''} Let's talk about what to cut, reprioritize, or resource differently.`,
      severity: 'error',
    }
  }

  if (atRisk.length > 0) {
    const names = atRisk.map(p => `"${p.title}"`).join(' and ')
    return {
      message: `${names} ${atRisk.length === 1 ? 'is' : 'are'} at risk with ${avgProgress}% average progress. Worth a quick check-in to prevent these from going off track.`,
      severity: 'warning',
    }
  }

  return {
    message: `Strategy is on track at ${avgProgress}% average progress across ${pillars.length} pillars. The foundations look solid -- let's talk about what to accelerate.`,
    severity: 'success',
  }
}

/**
 * StrategyHealthReview -- Sage's proactive strategy overview.
 *
 * @description Shows an immediate local insight, then fetches an AI-powered
 * 1-2 paragraph overview in the background. Falls back to local insight if
 * AI is unavailable.
 */
export function StrategyHealthReview({
  pillars,
  purposeSummary,
  totalObjectives,
  unlinkedObjectiveCount,
  className,
}: StrategyHealthReviewProps) {
  const insight = useMemo(() => generateInsight(pillars), [pillars])
  const [aiOverview, setAiOverview] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const fetchedRef = useRef(false)

  // Fetch AI overview in background
  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    setIsLoading(true)

    generateStrategyOverview({
      purposeSummary: purposeSummary ?? undefined,
      pillars: pillars.map(p => ({
        title: p.title,
        health: p.health,
        progress: p.progress,
        overdueTasks: p.overdueTasks,
        objectiveCount: (p as StrategyPillarSummary & { objectiveCount?: number }).objectiveCount ?? 0,
      })),
      totalObjectives: totalObjectives ?? 0,
      unlinkedObjectiveCount: unlinkedObjectiveCount ?? 0,
    }).then((result) => {
      if (result) setAiOverview(result)
    }).catch(() => { /* Non-critical — local insight remains */ })
      .finally(() => setIsLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const context: SpecialistContext = {
    type: 'strategy',
    title: 'Strategy Health Review',
    description: 'Sage is reviewing the overall health of your strategic pillars.',
    metadata: {
      purposeSummary: purposeSummary ?? undefined,
      objectives: pillars.map(p => ({
        title: p.title,
        health: p.health,
        progress: p.progress,
      })),
      notes: aiOverview ?? insight.message,
    },
  }

  const severityConfig = {
    success: {
      bg: 'bg-status-success/5',
      border: 'border-status-success/20',
      icon: CheckCircle2,
      iconColor: 'text-status-success',
    },
    warning: {
      bg: 'bg-status-warning/5',
      border: 'border-status-warning/20',
      icon: AlertTriangle,
      iconColor: 'text-status-warning',
    },
    error: {
      bg: 'bg-status-error/5',
      border: 'border-status-error/20',
      icon: AlertTriangle,
      iconColor: 'text-status-error',
    },
  } as const

  const config = severityConfig[insight.severity]
  const SeverityIcon = config.icon

  return (
    <Card className={cn('rounded-xl border', config.bg, config.border, className)}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start gap-4">
          {/* Sage's avatar */}
          <div className="relative h-10 w-10 rounded-full overflow-hidden bg-muted flex-shrink-0">
            <Image
              src="/images/specialists/strategist.png"
              alt="Sage"
              fill
              className="object-cover"
              sizes="40px"
            />
          </div>

          <div className="flex-1 min-w-0 space-y-2">
            {/* Header */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">Sage&apos;s Overview</span>
              <SeverityIcon className={cn('h-3.5 w-3.5', config.iconColor)} />
            </div>

            {/* Overview content */}
            {isLoading && !aiOverview ? (
              <div className="space-y-2">
                <p className="text-sm text-foreground leading-relaxed">
                  {insight.message}
                </p>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : aiOverview ? (
              <div className="space-y-2">
                {aiOverview.split('\n\n').filter(Boolean).map((paragraph, i) => (
                  <p key={i} className="text-sm text-foreground leading-relaxed">
                    {paragraph}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-foreground leading-relaxed">
                {insight.message}
              </p>
            )}

            {/* CTA */}
            <AskSpecialistButton
              context={context}
              specialistId="strategist"
              specialistName="Sage"
              variant="chip"
              label="Discuss with Sage"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
