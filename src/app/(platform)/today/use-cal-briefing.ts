/**
 * @file use-cal-briefing.ts
 *
 * @description Hook that calls Cal's (Chief of Staff) AI briefing on mount.
 * Returns a narrative string for the hero card and urgency-triaged insights.
 * Gracefully degrades — if the API call fails, narrative stays null and the
 * hero card falls back to the DB-driven greeting.
 */

"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { generateTodayBriefing, type TodayInsightInput, type CalBriefingResult } from "@/actions/specialist-page-insights"
import type { AgentInsight } from "@/actions/agent-insights"

interface UseCalBriefingResult {
  calNarrative: string | null
  calInsights: AgentInsight[]
  isCalLoading: boolean
  dismissInsight: (id: string) => void
}

/**
 * Fires a single Haiku call to generate Cal's daily briefing.
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

  useEffect(() => {
    // SECURITY: Prevent duplicate AI calls from React Strict Mode double-mount
    // GOTCHA: input can start null if briefing wasn't SSR'd — including input in
    // deps lets the effect re-fire when data arrives. The ref guard prevents
    // double-calls once we've successfully started a fetch.
    if (fetched.current || !input) return

    fetched.current = true
    setIsCalLoading(true)

    const enrichedInput: TodayInsightInput = {
      ...input,
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input])

  const dismissInsight = useCallback((id: string) => {
    setCalInsights(prev => prev.filter(i => i.id !== id))
  }, [])

  return { calNarrative, calInsights, isCalLoading, dismissInsight }
}
