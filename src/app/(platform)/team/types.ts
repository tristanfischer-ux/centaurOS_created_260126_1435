/**
 * @file types.ts
 *
 * @description Shared type definitions for the Team page orbital and list views.
 * Covers business functions, coverage model, team members, and marketplace candidates.
 */

// ─── Business Functions ──────────────────────────────────────────────────────

/** One of the 7 core business capabilities */
export interface BusinessFunction {
  id: FunctionId
  label: string
  short: string
}

export type FunctionId =
  | 'product'
  | 'sales'
  | 'marketing'
  | 'operations'
  | 'finance'
  | 'hr'
  | 'legal'

// ─── Coverage ────────────────────────────────────────────────────────────────

/** Coverage state for a single business function */
export interface FunctionCoverage {
  execs: TeamMember[]
  apprentices: TeamMember[]
  founderCovering: boolean
}

export type CoverageStatus = 'green' | 'yellow' | 'red'

// ─── Team Members ────────────────────────────────────────────────────────────

export type MemberRole = 'FOUNDER' | 'EXECUTIVE' | 'APPRENTICE'

export interface TeamMember {
  id: string
  name: string
  initials: string
  role: MemberRole
  color: string
  title?: string
  functionId?: string
  functionLabel?: string
  done: number
  active: number
  pending: number
  capacity: 'has_capacity' | 'at_capacity'
  tasksInQueue: number
}

// ─── Marketplace ─────────────────────────────────────────────────────────────

export type CandidateType = 'exec' | 'apprentice'

export interface MarketplaceCandidate {
  id: string
  name: string
  initials: string
  role: string
  type: CandidateType
  forFunction: string
  rating: number
  color: string
  tags: string[]
  hourlyRate: string
}

// ─── Status Colors ───────────────────────────────────────────────────────────

export interface StatusColorSet {
  arc: string
  fill: string
  fillH: string
  border: string
  text: string
  conn: string
}

// ─── Orbit Data Props (real Supabase data passed through) ────────────────────

/** Real Supabase profile data for orbit consumption */
export interface OrbitProfile {
  id: string
  full_name: string
  role: string
  avatar_url?: string | null
  primary_function_id?: string | null
  activeTasks: number
  completedTasks: number
  pendingTasks: number
}

/** Marketplace People listing from Supabase */
export interface MarketplacePersonListing {
  id: string
  title: string
  subcategory: string
  description: string | null
  attributes: Record<string, unknown>
}

/** Coverage summary entry per function category */
export interface CoverageSummaryEntry {
  category: string
  hasPartialOrCovered: boolean
}

// ─── View State ──────────────────────────────────────────────────────────────

export type TeamViewMode = 'list' | 'orbit'

// ─── Computed Slice Data (for orbit) ─────────────────────────────────────────

export interface SliceData {
  fn: BusinessFunction
  s0: number
  s1: number
  mid: number
  comp: FunctionCoverage
  hasExec: boolean
  status: CoverageStatus
  mktAll: MarketplaceCandidate[]
}
