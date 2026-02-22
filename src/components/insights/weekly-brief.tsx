/**
 * WeeklyBrief — Displays the latest weekly executive brief from Cal.
 *
 * @description Shows a prominent card with Cal's synthesized weekly brief,
 * including priorities, risks, wins, and full narrative sections.
 * Designed to be the first thing a founder sees on the Today page.
 *
 * @component
 *
 * @example
 * <WeeklyBrief />
 */

"use client"

import { useState, useEffect } from "react"
import {
  ChevronDown,
  ChevronUp,
  Crown,
  Target,
  AlertTriangle,
  Trophy,
  BookOpen,
  Calendar,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { Markdown } from "@/components/ui/markdown"
import {
  getLatestWeeklyBrief,
  markInsightRead,
  type AgentInsight,
} from "@/actions/agent-insights"
import { SPECIALISTS } from "@/app/(platform)/agents/specialists-data"

// ─── Component ──────────────────────────────────────────────────────

export function WeeklyBrief(): React.ReactElement | null {
  const [brief, setBrief] = useState<AgentInsight | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isExpanded, setIsExpanded] = useState(false)

  useEffect(() => {
    async function loadBrief(): Promise<void> {
      try {
        const result = await getLatestWeeklyBrief()
        setBrief(result)

        // Mark as read on view
        if (result && !result.is_read) {
          await markInsightRead(result.id)
        }
      } catch (err) {
        console.error("[WeeklyBrief] Failed to load:", err)
      } finally {
        setIsLoading(false)
      }
    }
    loadBrief()
  }, [])

  // Loading skeleton
  if (isLoading) {
    return (
      <Card className="border bg-muted/20">
        <CardContent className="pt-6">
          <div className="space-y-3">
            <div className="h-6 w-2/3 rounded bg-muted/50 animate-pulse" />
            <div className="h-4 w-full rounded bg-muted/50 animate-pulse" />
            <div className="h-4 w-5/6 rounded bg-muted/50 animate-pulse" />
          </div>
        </CardContent>
      </Card>
    )
  }

  // No brief available
  if (!brief) {
    return null
  }

  const calSpecialist = SPECIALISTS.find(s => s.id === "chief-of-staff")
  const domainData = brief.domain_data as Record<string, unknown>
  const priorities = (domainData?.top_priorities as string[]) ?? []
  const risks = (domainData?.risks as string[]) ?? []
  const wins = (domainData?.wins as string[]) ?? []
  const insightsAnalyzed = (domainData?.insights_analyzed as number) ?? 0
  const specialistsContributing = (domainData?.specialists_contributing as number) ?? 0
  const periodStart = domainData?.period_start as string
  const periodEnd = domainData?.period_end as string

  // Format date range
  const dateRange = formatDateRange(periodStart, periodEnd)

  return (
    <Card className="border-2 border-international-orange/20 bg-gradient-to-br from-background to-muted/30">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {calSpecialist ? (
              <UserAvatar
                name={calSpecialist.name}
                role="AI_Agent"
                size="md"
                avatarUrl={calSpecialist.avatarImage}
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-international-orange/10 flex items-center justify-center">
                <Crown className="h-5 w-5 text-international-orange" />
              </div>
            )}
            <div>
              <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
                {brief.title}
                {!brief.is_read && (
                  <span className="h-2 w-2 rounded-full bg-international-orange" />
                )}
              </CardTitle>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <Calendar className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {dateRange}
                </span>
                <span className="text-xs text-muted-foreground hidden sm:inline">·</span>
                <span className="text-xs text-muted-foreground">
                  {insightsAnalyzed} insights from {specialistsContributing} specialists
                </span>
              </div>
            </div>
          </div>

          <Badge variant="brand" className="flex-shrink-0 hidden sm:flex">
            <BookOpen className="h-3 w-3 mr-1" />
            Executive Brief
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {/* Quick summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Priorities */}
          {priorities.length > 0 && (
            <div className="rounded-lg bg-international-orange/5 border border-international-orange/10 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Target className="h-3.5 w-3.5 text-international-orange" />
                <span className="text-xs font-semibold text-foreground">Priorities</span>
              </div>
              <ul className="space-y-1">
                {priorities.slice(0, 3).map((priority, idx) => (
                  <li key={idx} className="text-xs text-muted-foreground leading-snug">
                    {idx + 1}. {priority.length > 80 ? priority.slice(0, 80) + "…" : priority}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Risks */}
          {risks.length > 0 && (
            <div className="rounded-lg bg-status-warning-light/30 border border-status-warning/10 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle className="h-3.5 w-3.5 text-status-warning" />
                <span className="text-xs font-semibold text-foreground">Risks</span>
              </div>
              <ul className="space-y-1">
                {risks.slice(0, 3).map((risk, idx) => (
                  <li key={idx} className="text-xs text-muted-foreground leading-snug">
                    {risk.length > 80 ? risk.slice(0, 80) + "…" : risk}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Wins */}
          {wins.length > 0 && (
            <div className="rounded-lg bg-status-success-light/30 border border-status-success/10 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Trophy className="h-3.5 w-3.5 text-status-success" />
                <span className="text-xs font-semibold text-foreground">Wins</span>
              </div>
              <ul className="space-y-1">
                {wins.slice(0, 3).map((win, idx) => (
                  <li key={idx} className="text-xs text-muted-foreground leading-snug">
                    {win.length > 80 ? win.slice(0, 80) + "…" : win}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Expandable full brief */}
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-muted-foreground hover:text-foreground gap-1.5 h-7 px-2"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                Collapse full brief
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                Read full brief
              </>
            )}
          </Button>

          {isExpanded && (
            <div className={cn(
              "mt-3 p-4 rounded-lg bg-card border",
              "prose prose-sm max-w-none",
              "text-foreground",
            )}>
              <Markdown content={brief.body} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Formats a date range as "Feb 6 – Feb 13" style.
 */
function formatDateRange(startStr?: string, endStr?: string): string {
  if (!startStr || !endStr) return "This week"

  try {
    const start = new Date(startStr)
    const end = new Date(endStr)
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }

    const startFormatted = start.toLocaleDateString("en-US", opts)
    const endFormatted = end.toLocaleDateString("en-US", opts)

    return `${startFormatted} – ${endFormatted}`
  } catch {
    return "This week"
  }
}
