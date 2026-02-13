"use client"

/**
 * @file strategy-health-review.tsx
 *
 * @description A compact card that shows Sam's (Strategy specialist) proactive
 * assessment of the company's strategic health. Renders as a summary card
 * with a one-click "Discuss with Sam" button to dive deeper.
 *
 * This doesn't call the AI API -- it generates a local summary from
 * pillar data and invites the user to start a conversation for deeper analysis.
 */

import { useMemo } from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { AlertTriangle, TrendingUp, CheckCircle2, ArrowRight } from "lucide-react"
import { AskSpecialistButton } from "./ask-specialist-button"
import type { SpecialistContext } from "./types"

interface StrategyPillarSummary {
  title: string
  health: string
  progress: number
  overdueTasks: number
}

interface StrategyHealthReviewProps {
  pillars: StrategyPillarSummary[]
  purposeSummary?: string | null
  className?: string
}

/**
 * Generates a brief, opinionated insight from Sam based on pillar health data.
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
 * StrategyHealthReview -- Sam's proactive strategy assessment card.
 *
 * @description Shows a brief insight based on pillar data with a
 * one-click button to start a deeper conversation with Sam.
 */
export function StrategyHealthReview({ pillars, purposeSummary, className }: StrategyHealthReviewProps) {
  const insight = useMemo(() => generateInsight(pillars), [pillars])

  const context: SpecialistContext = {
    type: 'strategy',
    title: 'Strategy Health Review',
    description: 'Sam is reviewing the overall health of your strategic pillars.',
    metadata: {
      purposeSummary: purposeSummary ?? undefined,
      objectives: pillars.map(p => ({
        title: p.title,
        health: p.health,
        progress: p.progress,
      })),
      notes: insight.message,
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
          {/* Sam's avatar */}
          <div className="relative h-10 w-10 rounded-full overflow-hidden bg-muted flex-shrink-0">
            <Image
              src="/images/specialists/strategist.png"
              alt="Sam"
              fill
              className="object-cover"
              sizes="40px"
            />
          </div>

          <div className="flex-1 min-w-0 space-y-2">
            {/* Header */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">Sam&apos;s Take</span>
              <SeverityIcon className={cn('h-3.5 w-3.5', config.iconColor)} />
            </div>

            {/* Insight */}
            <p className="text-sm text-foreground leading-relaxed">
              {insight.message}
            </p>

            {/* CTA */}
            <AskSpecialistButton
              context={context}
              specialistId="strategist"
              specialistName="Sam"
              variant="chip"
              label="Discuss with Sam"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
