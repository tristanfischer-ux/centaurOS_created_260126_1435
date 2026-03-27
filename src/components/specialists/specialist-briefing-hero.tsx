"use client"

/**
 * @file specialist-briefing-hero.tsx
 *
 * @description Reusable hero card for specialist briefings at the top of pages.
 * Shows the specialist's avatar, name/title, a loading state while the AI
 * narrative is being generated, the narrative text, and a "Discuss with" chip.
 * Severity-aware styling tints the card based on health status.
 *
 * Used on: Strategy (Sage), Objectives (Sage), Tasks (Cal).
 */

import Image from "next/image"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertTriangle, TrendingUp, CheckCircle2 } from "lucide-react"
import { AskSpecialistButton } from "./ask-specialist-button"
import type { SpecialistContext } from "./types"

// ─── Types ──────────────────────────────────────────────────────────

export type BriefingSeverity = "success" | "warning" | "error"

interface SpecialistBriefingHeroProps {
  /** Specialist slug for avatar path (e.g. "strategist", "chief-of-staff") */
  specialistId: string
  /** Display name (e.g. "Sage") */
  specialistName: string
  /** Role title (e.g. "Strategy") */
  specialistTitle: string
  /** AI-generated narrative text. Null = still loading or failed. */
  narrative: string | null
  /** Local-logic fallback message shown instantly before AI loads */
  fallbackMessage: string
  /** Whether the AI narrative is currently loading */
  isLoading: boolean
  /** Loading message (e.g. "Reviewing your strategy...") */
  loadingMessage?: string
  /** Health severity — controls card tint */
  severity: BriefingSeverity
  /** Context passed to the "Discuss with" button */
  context: SpecialistContext
  className?: string
}

// ─── Severity config ────────────────────────────────────────────────

const severityConfig = {
  success: {
    bg: "bg-status-success/5",
    border: "border-status-success/20",
    icon: CheckCircle2,
    iconColor: "text-status-success",
  },
  warning: {
    bg: "bg-status-warning/5",
    border: "border-status-warning/20",
    icon: AlertTriangle,
    iconColor: "text-status-warning",
  },
  error: {
    bg: "bg-status-error/5",
    border: "border-status-error/20",
    icon: AlertTriangle,
    iconColor: "text-status-error",
  },
} as const

// ─── Component ──────────────────────────────────────────────────────

/**
 * SpecialistBriefingHero — prominent specialist briefing card for page tops.
 *
 * @description Shows a specialist's avatar, title, and AI-generated narrative
 * with a local-logic fallback. Matches the Today page's Cal hero card pattern.
 */
export function SpecialistBriefingHero({
  specialistId,
  specialistName,
  specialistTitle,
  narrative,
  fallbackMessage,
  isLoading,
  loadingMessage = "Reviewing...",
  severity,
  context,
  className,
}: SpecialistBriefingHeroProps) {
  const config = severityConfig[severity]
  const SeverityIcon = config.icon

  return (
    <Card className={cn("rounded-xl border", config.bg, config.border, className)}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start gap-4">
          {/* Specialist avatar */}
          <div className="relative h-10 w-10 rounded-full overflow-hidden bg-muted flex-shrink-0">
            <Image
              src={`/images/specialists/${specialistId}.png`}
              alt={specialistName}
              fill
              className="object-cover"
              sizes="40px"
            />
          </div>

          <div className="flex-1 min-w-0 space-y-2">
            {/* Header */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">
                {specialistName}, {specialistTitle}
              </span>
              <SeverityIcon className={cn("h-3.5 w-3.5", config.iconColor)} />
            </div>

            {/* Narrative content */}
            {isLoading && !narrative ? (
              <div className="space-y-2">
                <p className="text-sm text-foreground leading-relaxed">
                  {fallbackMessage}
                </p>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-full" />
                </div>
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : narrative ? (
              <div className="space-y-2">
                {narrative.split("\n\n").filter(Boolean).map((paragraph, i) => (
                  <p key={i} className="text-sm text-foreground leading-relaxed">
                    {paragraph}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-foreground leading-relaxed">
                {fallbackMessage}
              </p>
            )}

            {/* CTA */}
            <AskSpecialistButton
              context={context}
              specialistId={specialistId}
              specialistName={specialistName}
              variant="chip"
              label={`Discuss with ${specialistName}`}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
