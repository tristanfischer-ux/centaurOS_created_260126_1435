'use client'

/**
 * @file harper-role-briefing.tsx
 *
 * @description Pre-search role briefing from Harper (hiring-team specialist).
 * On first visit, shows expanded briefing with team gap analysis.
 * On subsequent visits, shows compact chip.
 */

import { useState, useEffect, useRef } from 'react'
import { StageSpecialistCard } from '@/components/cad/stage-specialist-card'
import { generateRecruitsInsights } from '@/actions/specialist-page-insights'

interface HarperRoleBriefingProps {
  totalListings: number
  categories: string[]
}

const VISITED_KEY = 'forgeos-recruits-harper-visited'

export function HarperRoleBriefing({ totalListings, categories }: HarperRoleBriefingProps) {
  const [briefing, setBriefing] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isExpanded, setIsExpanded] = useState(true)

  const fetched = useRef(false)

  useEffect(() => {
    // SECURITY: Prevent duplicate AI calls from React Strict Mode double-mount
    if (fetched.current) return
    fetched.current = true

    // INTENT: Show compact on repeat visits
    try {
      if (typeof window !== 'undefined' && localStorage.getItem(VISITED_KEY)) {
        setIsExpanded(false)
      }
    } catch {
      // localStorage may throw in private browsing or when storage is full
    }

    generateRecruitsInsights({
      totalListings,
      categories,
      teamGaps: [],
    }).then((result) => {
      if (Array.isArray(result) && result.length > 0) {
        setBriefing(result[0].body)
      }
      setIsLoading(false)

      try {
        if (typeof window !== 'undefined') {
          localStorage.setItem(VISITED_KEY, '1')
        }
      } catch {
        // Non-critical — worst case is briefing shows expanded every visit
      }
    }).catch(() => setIsLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!isExpanded && !isLoading && briefing) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="text-xs text-international-orange hover:underline"
      >
        Harper has hiring advice →
      </button>
    )
  }

  return (
    <StageSpecialistCard
      specialistId="hiring-team"
      variant="entry"
      briefing={briefing}
      isLoading={isLoading}
      stageName="Recruits"
    />
  )
}
