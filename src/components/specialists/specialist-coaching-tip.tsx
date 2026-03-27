"use client"

/**
 * @file specialist-coaching-tip.tsx
 *
 * @description Minimal specialist coaching strip for section intro pages.
 * Shows the specialist's avatar, name, and a single coaching sentence.
 * No API call, no dismiss, no urgency coding — just a friendly nudge.
 * Collapsible with localStorage persistence.
 *
 * @related
 * - SpecialistBriefingHero: src/components/specialists/specialist-briefing-hero.tsx (heavier variant)
 * - SpecialistInsightCard: src/components/specialists/specialist-insight-card.tsx (API-driven variant)
 */

import { useState, useCallback } from "react"
import Image from "next/image"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface SpecialistCoachingTipProps {
  /** Specialist slug for avatar path (e.g. "strategist", "chief-of-staff") */
  specialistId: string
  /** Display name (e.g. "Sage") */
  specialistName: string
  /** Role title (e.g. "Strategy") */
  specialistTitle?: string
  /** The coaching tip text */
  tip: string
  className?: string
}

function getCollapseKey(key: string): string {
  return `forgeos-tip-collapsed-${key}`
}

function getInitialCollapsed(key: string): boolean {
  if (typeof window === "undefined") return false
  try {
    return localStorage.getItem(getCollapseKey(key)) === "true"
  } catch {
    return false
  }
}

/**
 * SpecialistCoachingTip — lightweight specialist strip for section intros.
 *
 * @description Shows a specialist's avatar, name, and one static coaching sentence.
 * Visually lighter than SpecialistInsightCard. No API call needed.
 */
export function SpecialistCoachingTip({
  specialistId,
  specialistName,
  specialistTitle,
  tip,
  className,
}: SpecialistCoachingTipProps) {
  const [collapsed, setCollapsed] = useState(() => getInitialCollapsed(specialistId))

  const toggleCollapse = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev
      try {
        localStorage.setItem(getCollapseKey(specialistId), String(next))
      } catch { /* localStorage full or unavailable */ }
      return next
    })
  }, [specialistId])

  return (
    <Card className={cn("bg-muted/30 border-border/50", className)}>
      <CardContent className={cn("py-3 px-4", collapsed ? "pb-3" : "pb-3")}>
        <button
          onClick={toggleCollapse}
          className="flex items-center gap-3 w-full text-left group cursor-pointer"
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expand ${specialistName}'s tip` : `Collapse ${specialistName}'s tip`}
        >
          {/* Specialist avatar */}
          <div className="relative h-8 w-8 rounded-full overflow-hidden bg-muted flex-shrink-0">
            <Image
              src={`/images/specialists/${specialistId}.png`}
              alt={specialistName}
              fill
              className="object-cover"
              sizes="32px"
            />
          </div>

          <div className="flex-1 min-w-0">
            <span className="text-xs font-semibold text-foreground">
              {specialistName}
              {specialistTitle && <span className="text-muted-foreground font-normal">, {specialistTitle}</span>}
            </span>
            {!collapsed && (
              <p className="text-sm text-muted-foreground leading-relaxed mt-0.5">
                {tip}
              </p>
            )}
          </div>

          <span className="text-muted-foreground/50 group-hover:text-muted-foreground transition-colors flex-shrink-0">
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </span>
        </button>
      </CardContent>
    </Card>
  )
}
