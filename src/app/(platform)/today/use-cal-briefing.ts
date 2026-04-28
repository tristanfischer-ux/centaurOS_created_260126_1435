/**
 * @file use-cal-briefing.ts
 *
 * @description Hook that calls Cal's (Chief of Staff) AI briefing on mount
 * and refreshes when the user returns to the page. Returns a narrative string
 * for the hero card, urgency-triaged insights, and a manual refresh function.
 * Gracefully degrades — if the API call fails, narrative stays null and the
 * hero card falls back to the DB-driven greeting.
 */

"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { generateTodayBriefing, type TodayInsightInput, type CalBriefingResult } from "@/actions/specialist-page-insights"
import type { AgentInsight } from "@/actions/agent-insights"

// DECISION: Minimum 5 minutes between auto-refreshes to avoid burning API
// credits when users rapidly switch tabs. Manual refresh has no cooldown.
const AUTO_REFRESH_COOLDOWN_MS = 5 * 60 * 1000

interface UseCalBriefingResult {
  calNarrative: string | null
  calInsights: AgentInsight[]
  isCalLoading: boolean
  dismissInsight: (id: string) => void
  refreshBriefing: () => void
}

/**
 * Fires Cal's AI briefing on mount and auto-refreshes on page revisit.
 *
 * @param input - Aggregated Today page data (null skips the call)
 * @param isNewUser - Whether this is a new user who hasn't dismissed onboarding
 * @param onboardingSteps - Remaining onboarding step labels for new user prompt
 */
export function useCalBriefing(
  input: TodayInsightInput | null,
  isNewUser: boolean,
  onboardingSteps?: string[],
): UseCalBriefingResult {
  const [calNarrative, setCalNarrative] = useState<string | null>(null)
  const [calInsights, setCalInsights] = useState<AgentInsight[]>([])
  const [isCalLoading, setIsCalLoading] = useState(false)
  const fetched = useRef(false)
  const lastFetchedAt = useRef(0)
  const inputRef = useRef(input)
  inputRef.current = input

  const fetchBriefing = useCallback(() => {
    const currentInput = inputRef.current
    if (!currentInput) return

    lastFetchedAt.current = Date.now()
    setIsCalLoading(true)

    const enrichedInput: TodayInsightInput = {
      ...currentInput,
      isNewUser,
      onboardingStepsRemaining: onboardingSteps,
    }

    generateTodayBriefing(enrichedInput)
      .then((result: CalBriefingResult) => {
        if (result.narrative) setCalNarrative(result.narrative)
        if (Array.isArray(result.insights) && result.insights.length > 0) {
          setCalInsights(result.insights)
        }
      })
      .catch(() => { /* Non-critical — hero card falls back to DB greeting */ })
      .finally(() => setIsCalLoading(false))
  }, [isNewUser, onboardingSteps])

  // Initial fetch on mount
  useEffect(() => {
    // SECURITY: Prevent duplicate AI calls from React Strict Mode double-mount
    if (fetched.current || !input) return
    fetched.current = true
    fetchBriefing()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input])

  // Auto-refresh when user returns to the page (tab becomes visible)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return
      if (!fetched.current) return // initial fetch hasn't happened yet
      if (isCalLoading) return
      if (Date.now() - lastFetchedAt.current < AUTO_REFRESH_COOLDOWN_MS) return
      fetchBriefing()
    }

    document.addEventListener("visibilitychange", handleVisibility)
    return () => document.removeEventListener("visibilitychange", handleVisibility)
  }, [fetchBriefing, isCalLoading])

  const dismissInsight = useCallback((id: string) => {
    setCalInsights(prev => prev.filter(i => i.id !== id))
  }, [])

  // Manual refresh — no cooldown
  const refreshBriefing = useCallback(() => {
    if (isCalLoading) return
    fetchBriefing()
  }, [fetchBriefing, isCalLoading])

  return { calNarrative, calInsights, isCalLoading, dismissInsight, refreshBriefing }
}
