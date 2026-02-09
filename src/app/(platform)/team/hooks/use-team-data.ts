/**
 * @file use-team-data.ts
 *
 * @description Transforms real Supabase profile, marketplace, and coverage
 * data into the shape expected by OrbitSVG and OrbitSidePanel.
 *
 * Accepts server-fetched data as arguments. For profiles without a
 * primary_function_id, distributes them round-robin across functions
 * to give a useful initial orbit layout.
 */

import { useMemo } from 'react'
import { getCoverageStatus } from '../constants'
import type {
  TeamMember,
  MarketplaceCandidate,
  FunctionCoverage,
  CoverageStatus,
  BusinessFunction,
  FunctionId,
  OrbitProfile,
  MarketplacePersonListing,
  CoverageSummaryEntry,
} from '../types'

// ─── Constants ──────────────────────────────────────────────────

/** Deterministic colours for orbit member dots (cycle through these) */
const MEMBER_COLORS = [
  '#F97316', '#3B82F6', '#10B981', '#8B5CF6', '#EC4899',
  '#14B8A6', '#F59E0B', '#6366F1', '#06B6D4', '#F472B6',
] as const

// ─── Input Types ────────────────────────────────────────────────

interface UseTeamDataArgs {
  /** All founders from the page (already filtered by role) */
  founders: OrbitProfile[]
  /** All executives */
  executives: OrbitProfile[]
  /** All apprentices */
  apprentices: OrbitProfile[]
  /** Marketplace People listings */
  marketplacePeople: MarketplacePersonListing[]
  /** business_function.id → category mapping */
  functionCategoryMap: Record<string, string>
  /** Business function definitions (custom or default) */
  functions: BusinessFunction[]
}

// ─── Output Types ───────────────────────────────────────────────

interface GapInfo {
  fn: BusinessFunction
  status: 'yellow' | 'red'
}

export interface TeamDataResult {
  founders: TeamMember[]
  allExecs: (TeamMember & { functionId: string; functionLabel: string })[]
  allApprentices: (TeamMember & { functionId: string; functionLabel: string })[]
  gaps: GapInfo[]
  marketplaceByFunction: Record<string, MarketplaceCandidate[]>
  coverageByFunction: Record<string, FunctionCoverage>
  /** Marketplace listing IDs → original listing data (for link wiring) */
  marketplaceListingMap: Record<string, MarketplacePersonListing>
  stats: {
    totalPeople: number
    totalFunctions: number
    avgCapacity: string
    totalIdle: number
    gapCount: number
    founderCoveringCount: number
  }
}

// ─── Helpers ────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

/**
 * Converts a server-side OrbitProfile into the orbit's TeamMember shape.
 *
 * @param profile - Real profile data
 * @param memberRole - The orbit role label
 * @param colorIndex - Index for colour cycling
 * @returns TeamMember for the orbit view
 */
function profileToTeamMember(
  profile: OrbitProfile,
  memberRole: 'FOUNDER' | 'EXECUTIVE' | 'APPRENTICE',
  colorIndex: number
): TeamMember {
  return {
    id: profile.id,
    name: profile.full_name,
    initials: getInitials(profile.full_name),
    role: memberRole,
    color: MEMBER_COLORS[colorIndex % MEMBER_COLORS.length],
    title: profile.role,
    done: profile.completedTasks,
    active: profile.activeTasks,
    pending: profile.pendingTasks,
    capacity: profile.activeTasks > 3 ? 'at_capacity' : 'has_capacity',
    tasksInQueue: profile.pendingTasks,
  }
}

/**
 * Converts a marketplace People listing into the orbit's MarketplaceCandidate shape.
 *
 * @param listing - Marketplace listing from Supabase
 * @param colorIndex - Index for colour cycling
 * @returns MarketplaceCandidate for the orbit view
 */
function listingToCandidate(
  listing: MarketplacePersonListing,
  colorIndex: number
): MarketplaceCandidate {
  const attrs = listing.attributes || {}
  const isExec = listing.subcategory === 'Executive'
  const fnCategory = (attrs.function_category as string) || 'product'

  return {
    id: listing.id,
    name: listing.title,
    initials: getInitials(listing.title),
    role: (attrs.role as string) || listing.subcategory,
    type: isExec ? 'exec' : 'apprentice',
    forFunction: fnCategory,
    rating: 4.5, // Default — real ratings would come from a reviews table
    color: MEMBER_COLORS[colorIndex % MEMBER_COLORS.length],
    tags: ((attrs.expertise || attrs.skills || []) as string[]).slice(0, 3),
    hourlyRate: (attrs.rate as string) || 'Contact',
  }
}

// ─── Hook ───────────────────────────────────────────────────────

/**
 * Aggregates real Supabase data into the shape expected by orbit components.
 *
 * @param args - Real server data (profiles, marketplace, coverage)
 * @returns Computed team data for orbit and list views
 */
export function useTeamData(args: UseTeamDataArgs): TeamDataResult {
  const {
    founders: rawFounders,
    executives: rawExecutives,
    apprentices: rawApprentices,
    marketplacePeople,
    functionCategoryMap,
    functions,
  } = args

  return useMemo(() => {
    // ── Convert founders ──────────────────────────────────────
    const founderMembers: TeamMember[] = rawFounders.map((p, i) =>
      profileToTeamMember(p, 'FOUNDER', i)
    )

    // ── Resolve function category per profile ─────────────────
    const getCategory = (profile: OrbitProfile): FunctionId | null => {
      if (!profile.primary_function_id) return null
      const cat = functionCategoryMap[profile.primary_function_id]
      if (!cat) return null
      // Validate it's one of the 7 orbit categories
      if (functions.some((f) => f.id === cat)) return cat as FunctionId
      return null
    }

    // ── Build coverage map from real data ─────────────────────
    const coverageByFunction: Record<string, FunctionCoverage> = {}
    const execsByFunction: Record<string, (TeamMember & { functionId: string; functionLabel: string })[]> = {}
    const apprenticesByFunction: Record<string, (TeamMember & { functionId: string; functionLabel: string })[]> = {}

    // Initialize empty coverage for each function
    functions.forEach((fn) => {
      coverageByFunction[fn.id] = { execs: [], apprentices: [], founderCovering: false }
      execsByFunction[fn.id] = []
      apprenticesByFunction[fn.id] = []
    })

    // ── Assign executives to functions ────────────────────────
    const assignedExecs: (TeamMember & { functionId: string; functionLabel: string })[] = []
    const unassignedExecs: OrbitProfile[] = []

    rawExecutives.forEach((exec) => {
      const cat = getCategory(exec)
      if (cat) {
        const fn = functions.find((f) => f.id === cat)!
        const tm = {
          ...profileToTeamMember(exec, 'EXECUTIVE', assignedExecs.length),
          functionId: cat,
          functionLabel: fn.label,
        }
        assignedExecs.push(tm)
        execsByFunction[cat].push(tm)
        coverageByFunction[cat].execs.push(tm)
      } else {
        unassignedExecs.push(exec)
      }
    })

    // ── Assign apprentices to functions ────────────────────────
    const assignedApprentices: (TeamMember & { functionId: string; functionLabel: string })[] = []
    const unassignedApprentices: OrbitProfile[] = []

    rawApprentices.forEach((appr) => {
      const cat = getCategory(appr)
      if (cat) {
        const fn = functions.find((f) => f.id === cat)!
        const tm = {
          ...profileToTeamMember(appr, 'APPRENTICE', assignedApprentices.length),
          functionId: cat,
          functionLabel: fn.label,
        }
        assignedApprentices.push(tm)
        apprenticesByFunction[cat].push(tm)
        coverageByFunction[cat].apprentices.push(tm)
      } else {
        unassignedApprentices.push(appr)
      }
    })

    // ── Auto-distribute unassigned people (round-robin) ───────
    // This ensures the orbit shows real people even before explicit function assignment
    const functionIds = functions.map((f) => f.id)
    let fnIdx = 0

    unassignedExecs.forEach((exec) => {
      // Assign to next function that doesn't have an exec yet, or round-robin
      let targetIdx = functionIds.findIndex(
        (fid) => coverageByFunction[fid].execs.length === 0
      )
      if (targetIdx === -1) {
        targetIdx = fnIdx % functionIds.length
        fnIdx++
      }
      const cat = functionIds[targetIdx]
      const fn = functions.find((f) => f.id === cat)!
      const tm = {
        ...profileToTeamMember(exec, 'EXECUTIVE', assignedExecs.length + fnIdx),
        functionId: cat,
        functionLabel: fn.label,
      }
      assignedExecs.push(tm)
      execsByFunction[cat].push(tm)
      coverageByFunction[cat].execs.push(tm)
      // Move to next function for the next unassigned exec
      if (targetIdx === functionIds.findIndex((fid) => coverageByFunction[fid].execs.length === 0)) {
        // already advanced
      }
    })

    let apprFnIdx = 0
    unassignedApprentices.forEach((appr) => {
      const cat = functionIds[apprFnIdx % functionIds.length]
      apprFnIdx++
      const fn = functions.find((f) => f.id === cat)!
      const tm = {
        ...profileToTeamMember(appr, 'APPRENTICE', assignedApprentices.length + apprFnIdx),
        functionId: cat,
        functionLabel: fn.label,
      }
      assignedApprentices.push(tm)
      apprenticesByFunction[cat].push(tm)
      coverageByFunction[cat].apprentices.push(tm)
    })

    // ── Set founderCovering for all gaps ─────────────────────
    // Founder automatically covers all functions without executives
    functions.forEach((fn) => {
      const hasExec = coverageByFunction[fn.id].execs.length > 0
      if (!hasExec) {
        coverageByFunction[fn.id].founderCovering = true
      }
    })

    // ── Gaps ──────────────────────────────────────────────────
    const gaps: GapInfo[] = []
    functions.forEach((fn) => {
      const status = getCoverageStatus(coverageByFunction[fn.id])
      if (status !== 'green') {
        gaps.push({ fn, status: status as 'yellow' | 'red' })
      }
    })

    // ── Marketplace candidates ────────────────────────────────
    const allCandidates: MarketplaceCandidate[] = marketplacePeople.map((mp, i) =>
      listingToCandidate(mp, i)
    )

    const marketplaceByFunction: Record<string, MarketplaceCandidate[]> = {}
    allCandidates.forEach((c) => {
      if (!marketplaceByFunction[c.forFunction]) {
        marketplaceByFunction[c.forFunction] = []
      }
      marketplaceByFunction[c.forFunction].push(c)
    })

    // Build listing lookup for link wiring
    const marketplaceListingMap: Record<string, MarketplacePersonListing> = {}
    marketplacePeople.forEach((mp) => {
      marketplaceListingMap[mp.id] = mp
    })

    // ── Stats ─────────────────────────────────────────────────
    const allPeople = [...founderMembers, ...assignedExecs, ...assignedApprentices]
    const totalIdle = allPeople.filter((p) => p.active === 0).length
    const founderCoveringCount = Object.values(coverageByFunction).filter(
      (c) => c.founderCovering
    ).length

    const avgCap =
      allPeople.length > 0
        ? Math.round(
            allPeople.reduce((sum, p) => {
              const score = Math.min(100, p.active * 20 + p.pending * 10)
              return sum + (100 - score)
            }, 0) / allPeople.length
          )
        : 100

    return {
      founders: founderMembers,
      allExecs: assignedExecs,
      allApprentices: assignedApprentices,
      gaps,
      marketplaceByFunction,
      coverageByFunction,
      marketplaceListingMap,
      stats: {
        totalPeople: allPeople.length,
        totalFunctions: functions.length,
        avgCapacity: `${avgCap}%`,
        totalIdle,
        gapCount: gaps.length,
        founderCoveringCount,
      },
    }
  }, [
    rawFounders,
    rawExecutives,
    rawApprentices,
    marketplacePeople,
    functionCategoryMap,
    functions,
  ])
}
