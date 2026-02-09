/**
 * @file use-team-data.ts
 *
 * @description Derives list-view aggregates from the constants data.
 * Currently backed by mock data; will integrate with Supabase once
 * capability_coverage and marketplace tables exist.
 */

import { useMemo } from 'react'
import { FUNCTIONS, TEAM_COVERAGE, FOUNDERS, MARKETPLACE_CANDIDATES, getCoverageStatus } from '../constants'
import type { TeamMember, MarketplaceCandidate, FunctionCoverage, CoverageStatus, BusinessFunction } from '../types'

interface GapInfo {
  fn: BusinessFunction
  status: 'yellow' | 'red'
}

interface TeamDataResult {
  founders: TeamMember[]
  allExecs: (TeamMember & { functionId: string; functionLabel: string })[]
  allApprentices: (TeamMember & { functionId: string; functionLabel: string })[]
  gaps: GapInfo[]
  marketplaceByFunction: Record<string, MarketplaceCandidate[]>
  coverageByFunction: Record<string, FunctionCoverage>
  stats: {
    totalPeople: number
    totalFunctions: number
    avgCapacity: string
    totalIdle: number
    gapCount: number
    founderCoveringCount: number
  }
}

/**
 * Aggregates team members, coverage, and marketplace candidates.
 *
 * @returns Computed team data for list and orbital views
 */
export function useTeamData(): TeamDataResult {
  return useMemo(() => {
    const allExecs: (TeamMember & { functionId: string; functionLabel: string })[] = []
    const allApprentices: (TeamMember & { functionId: string; functionLabel: string })[] = []
    const gaps: GapInfo[] = []

    FUNCTIONS.forEach((fn) => {
      const comp = TEAM_COVERAGE[fn.id]
      if (!comp) return
      const status = getCoverageStatus(comp)

      comp.execs.forEach((e) =>
        allExecs.push({ ...e, functionId: fn.id, functionLabel: fn.label })
      )
      comp.apprentices.forEach((a) =>
        allApprentices.push({ ...a, functionId: fn.id, functionLabel: fn.label })
      )

      if (status !== 'green') {
        gaps.push({ fn, status: status as 'yellow' | 'red' })
      }
    })

    const allPeople = [...FOUNDERS, ...allExecs, ...allApprentices]
    const totalIdle = allPeople.filter((p) => p.active === 0).length
    const founderCoveringCount = Object.values(TEAM_COVERAGE).filter(
      (t) => t.founderCovering
    ).length

    // Group marketplace by function
    const marketplaceByFunction: Record<string, MarketplaceCandidate[]> = {}
    MARKETPLACE_CANDIDATES.forEach((m) => {
      if (!marketplaceByFunction[m.forFunction]) {
        marketplaceByFunction[m.forFunction] = []
      }
      marketplaceByFunction[m.forFunction].push(m)
    })

    return {
      founders: FOUNDERS,
      allExecs,
      allApprentices,
      gaps,
      marketplaceByFunction,
      coverageByFunction: TEAM_COVERAGE,
      stats: {
        totalPeople: allPeople.length,
        totalFunctions: FUNCTIONS.length,
        avgCapacity: '87%',
        totalIdle: totalIdle,
        gapCount: gaps.length,
        founderCoveringCount,
      },
    }
  }, [])
}
