"use client"

/**
 * @file specialist-briefing-hero.tsx
 *
 * @description Reusable hero card for specialist briefings at the top of pages.
 * Shows the specialist's avatar, name/title, a loading state while the AI
 * narrative is being generated, the narrative text, and a "Discuss with" chip.
 * Severity-aware styling tints the card based on health status.
 * Collapsible with localStorage persistence per page.
 *
 * Used on: Strategy (Sage), Objectives (Sage), Tasks (Cal).
 */

import { useState, useCallback, useEffect } from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react"
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
  /** Unique key for localStorage collapse state (defaults to specialistId) */
  storageKey?: string
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

// ─── LocalStorage helpers ───────────────────────────────────────────

function getCollapseKey(key: string): string {
  return `forgeos-briefing-collapsed-${key}`
}

function getInitialCollapsed(key: string): boolean {
  if (typeof window === "undefined") return false
  try {
    return localStorage.getItem(getCollapseKey(key)) === "true"
  } catch {
    return false
  }
}

// ─── Component ──────────────────────────────────────────────────────

/**
 * SpecialistBriefingHero — prominent specialist briefing card for page tops.
 *
 * @description Shows a specialist's avatar, title, and AI-generated narrative
 * with a local-logic fallback. Matches the Today page's Cal hero card pattern.
 * Collapsible — state persisted to localStorage per storageKey.
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
  storageKey,
  className,
}: SpecialistBriefingHeroProps) {
  const key = storageKey ?? specialistId
  const [collapsed, setCollapsed] = useState(() => getInitialCollapsed(key))

  const config = severityConfig[severity]
  const SeverityIcon = config.icon

  const toggleCollapse = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev
      try {
        localStorage.setItem(getCollapseKey(key), String(next))
      } catch { /* localStorage full or unavailable */ }
      return next
    })
  }, [key])

  return (
    <Card className={cn("rounded-xl border transition-all duration-200", config.bg, config.border, className)}>
      <CardContent className={cn("pt-5", collapsed ? "pb-3" : "pb-4")}>
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
            {/* Header — clickable to collapse/expand */}
            <button
              onClick={toggleCollapse}
              className="flex items-center gap-2 group cursor-pointer w-full text-left"
              aria-expanded={!collapsed}
              aria-label={collapsed ? `Expand ${specialistName}'s briefing` : `Collapse ${specialistName}'s briefing`}
            >
              <span className="text-sm font-semibold text-foreground">
                {specialistName}, {specialistTitle}
              </span>
              <SeverityIcon className={cn("h-3.5 w-3.5", config.iconColor)} />
              <span className="ml-auto text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">
                {collapsed ? (
                  <ChevronRight className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </span>
            </button>

            {/* Collapsible content */}
            {!collapsed && (
              <>
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
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
