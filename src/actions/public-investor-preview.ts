/**
 * @file public-investor-preview.ts
 *
 * @description Public-safe investor preview for the marketing homepage.
 * Two modes:
 * 1. Default preview — aggregate stats + sample cards (existing)
 * 2. Search — keyword-matched anonymized results for conversion
 *
 * @security Uses admin client. Search results are ANONYMIZED — no firm names,
 * contact emails, websites, LinkedIn, investment_thesis, or portfolio data.
 * Only exposes: subcategory, firm_type, hq_city, stage_focus (first 2),
 * sectors (first 3), is_active_deploying, fund_tier, cheque_min (partial).
 */

"use server"

import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Types ───────────────────────────────────────────────────────────────────

export type PublicInvestorCard = {
  id: string
  title: string
  subcategory: string
  firm_type: string | null
  hq_city: string | null
  stage_focus: string[]
  is_active_deploying: boolean
  fund_tier: string | null
}

export type PublicInvestorPreview = {
  investors: PublicInvestorCard[]
  totalCount: number
  activeDeployingCount: number
}

export type AnonymizedInvestorResult = {
  index: number
  subcategory: string
  firm_type: string | null
  hq_city: string | null
  stage_focus: string[]
  sectors: string[]
  is_active_deploying: boolean
  fund_tier: string | null
  has_cheque_range: boolean
  cheque_min_redacted: string | null
}

export type InvestorSearchResult = {
  results: AnonymizedInvestorResult[]
  totalMatches: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * SECURITY: Sanitize a string for use in PostgREST filter expressions.
 */
function sanitizeFilterValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/[\n\r\t]/g, ' ')
    .replace(/[,()\."*:!'[\]{}]/g, '')
}

/**
 * Maps common user search terms to stage_focus values in the DB.
 */
const STAGE_KEYWORDS: Record<string, string> = {
  'pre-seed': 'Pre-Seed',
  'preseed': 'Pre-Seed',
  'seed': 'Seed',
  'series-a': 'Series A',
  'series a': 'Series A',
  'series-b': 'Series B',
  'series b': 'Series B',
  'series-c': 'Series C',
  'series c': 'Series C',
  'growth': 'Growth',
  'early': 'Early Stage',
  'early-stage': 'Early Stage',
  'late': 'Late Stage',
  'late-stage': 'Late Stage',
}

/**
 * Common sector keywords that map to DB values.
 */
const SECTOR_KEYWORDS: string[] = [
  'hardware', 'software', 'saas', 'fintech', 'healthtech', 'medtech',
  'biotech', 'cleantech', 'climate', 'energy', 'deeptech', 'deep tech',
  'robotics', 'ai', 'machine learning', 'consumer', 'electronics',
  'manufacturing', 'defence', 'defense', 'aerospace', 'space',
  'medical', 'devices', 'iot', 'semiconductor', 'automotive',
  'agriculture', 'agtech', 'foodtech', 'proptech', 'edtech',
]

/**
 * Formats a cheque value for partial display (e.g. 250000 -> "£250K")
 */
function formatChequeMin(value: number | null | undefined): string | null {
  if (!value || value <= 0) return null
  if (value >= 1_000_000) return `£${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (value >= 1_000) return `£${Math.round(value / 1_000)}K`
  return `£${value}`
}

// ─── Default Preview (no search) ────────────────────────────────────────────

/**
 * Fetches a small sample of investors for the public homepage preview.
 * Cached for 1 hour to avoid hammering the DB on every homepage visit.
 */
export const getPublicInvestorPreview = unstable_cache(
  async (): Promise<PublicInvestorPreview> => {
    // SECURITY: admin client — public preview of aggregate investor data
    const supabase = createAdminClient()

    // Get total count
    const { count } = await supabase
      .from('marketplace_listings')
      .select('id', { count: 'exact', head: true })
      .eq('category', 'Finance')

    // Get a sample of 8 high-quality investors (sorted by data quality)
    // SECURITY: Only select title, subcategory, attributes — strip everything else
    const { data } = await supabase
      .from('marketplace_listings')
      .select('id, title, subcategory, attributes')
      .eq('category', 'Finance')
      .order('created_at', { ascending: false })
      .limit(100)

    if (!data || data.length === 0) {
      return { investors: [], totalCount: count ?? 0, activeDeployingCount: 0 }
    }

    // Sort by data quality score (highest first) and pick top 8
    const sorted = data
      .filter((r) => {
        const attrs = r.attributes as Record<string, unknown> | null
        return attrs && (attrs as Record<string, unknown>).data_quality_score != null
      })
      .sort((a, b) => {
        const aScore = ((a.attributes as Record<string, unknown>)?.data_quality_score as number) ?? 0
        const bScore = ((b.attributes as Record<string, unknown>)?.data_quality_score as number) ?? 0
        return bScore - aScore
      })
      .slice(0, 8)

    // SECURITY: Strip to safe public fields only
    const investors: PublicInvestorCard[] = sorted.map((row) => {
      const attrs = (row.attributes as Record<string, unknown>) ?? {}
      return {
        id: row.id,
        title: row.title ?? 'Unknown Firm',
        subcategory: row.subcategory ?? 'Investor',
        firm_type: (attrs.firm_type as string) ?? null,
        hq_city: (attrs.hq_city as string) ?? null,
        stage_focus: ((attrs.stage_focus as string[]) ?? []).slice(0, 2),
        is_active_deploying: (attrs.is_active_deploying as boolean) ?? false,
        fund_tier: (attrs.fund_tier as string) ?? null,
      }
    })

    // Count active deploying from full dataset
    const activeDeployingCount = data.filter((r) => {
      const attrs = r.attributes as Record<string, unknown> | null
      return attrs && (attrs as Record<string, unknown>).is_active_deploying === true
    }).length

    return {
      investors,
      totalCount: count ?? data.length,
      activeDeployingCount,
    }
  },
  ['public-investor-preview'],
  { revalidate: 3600 } // Cache for 1 hour
)

// ─── Search (anonymized results) ────────────────────────────────────────────

/**
 * Searches investors by keyword and returns ANONYMIZED results.
 * Used on the public homepage to prove matching investors exist
 * without revealing identities — driving signup conversion.
 *
 * @security NEVER returns: title, firm name, contact_email, linkedin,
 * investment_thesis, portfolio details, website, or any PII.
 * Results are anonymized with random index instead of real IDs.
 *
 * @param query - Free-text search query from the visitor
 * @returns Up to 5 anonymized results + total match count
 */
export const searchPublicInvestors = unstable_cache(
  async (query: string): Promise<InvestorSearchResult> => {
    if (!query || query.trim().length < 2) {
      return { results: [], totalMatches: 0 }
    }

    const cleanQuery = query.trim().slice(0, 200).toLowerCase()
    const words = cleanQuery.split(/\s+/).filter(Boolean)

    // SECURITY: admin client — anonymized search results only
    const supabase = createAdminClient()

    // Identify stage and sector keywords from the query
    const matchedStages: string[] = []
    const matchedSectors: string[] = []
    const searchTerms: string[] = []

    // Check multi-word stage matches first
    for (const [keyword, stage] of Object.entries(STAGE_KEYWORDS)) {
      if (cleanQuery.includes(keyword)) {
        matchedStages.push(stage)
      }
    }

    // Check sector keywords
    for (const sector of SECTOR_KEYWORDS) {
      if (cleanQuery.includes(sector)) {
        matchedSectors.push(sector)
      }
    }

    // Remaining words become general search terms
    for (const word of words) {
      if (word.length >= 3 && !Object.keys(STAGE_KEYWORDS).some(k => k.includes(word))) {
        searchTerms.push(sanitizeFilterValue(word))
      }
    }

    // Build the query — start with Finance category
    let dbQuery = supabase
      .from('marketplace_listings')
      .select('id, subcategory, attributes', { count: 'exact' })
      .eq('category', 'Finance')

    // Build OR filter conditions
    const orConditions: string[] = []

    // Add text search on description for general terms
    for (const term of searchTerms.slice(0, 3)) {
      orConditions.push(`description.ilike.%${term}%`)
      orConditions.push(`title.ilike.%${term}%`)
    }

    // If we have sector keywords, also search description
    for (const sector of matchedSectors.slice(0, 3)) {
      const sanitized = sanitizeFilterValue(sector)
      orConditions.push(`description.ilike.%${sanitized}%`)
    }

    // Apply OR conditions if we have general search terms
    if (orConditions.length > 0) {
      dbQuery = dbQuery.or(orConditions.join(','))
    }

    // Execute query
    const { data, count } = await dbQuery
      .order('created_at', { ascending: false })
      .limit(200)

    if (!data || data.length === 0) {
      return { results: [], totalMatches: 0 }
    }

    // Post-filter by stage and sector in JSONB attributes
    let filtered = data

    if (matchedStages.length > 0) {
      filtered = filtered.filter((row) => {
        const attrs = row.attributes as Record<string, unknown> | null
        if (!attrs) return false
        const stages = (attrs.stage_focus as string[]) ?? []
        return matchedStages.some(s =>
          stages.some(dbStage => dbStage.toLowerCase().includes(s.toLowerCase()))
        )
      })
    }

    if (matchedSectors.length > 0 && filtered.length > 5) {
      // Only apply sector filter if we still have enough results
      const sectorFiltered = filtered.filter((row) => {
        const attrs = row.attributes as Record<string, unknown> | null
        if (!attrs) return false
        const sectors = (attrs.sectors as string[]) ?? []
        const description = ((attrs as Record<string, unknown>).description as string) ?? ''
        return matchedSectors.some(s =>
          sectors.some(dbSector => dbSector.toLowerCase().includes(s)) ||
          description.toLowerCase().includes(s)
        )
      })
      if (sectorFiltered.length >= 3) {
        filtered = sectorFiltered
      }
    }

    const totalMatches = filtered.length > 0
      ? Math.max(filtered.length, count ?? filtered.length)
      : 0

    // SECURITY: Anonymize — strip all identifying information
    const anonymized: AnonymizedInvestorResult[] = filtered.slice(0, 5).map((row, idx) => {
      const attrs = (row.attributes as Record<string, unknown>) ?? {}
      const chequeMin = attrs.cheque_size_min as number | null | undefined
      const chequeMax = attrs.cheque_size_max as number | null | undefined

      return {
        index: idx + 1,
        subcategory: row.subcategory ?? 'Investor',
        firm_type: (attrs.firm_type as string) ?? null,
        hq_city: (attrs.hq_city as string) ?? null,
        stage_focus: ((attrs.stage_focus as string[]) ?? []).slice(0, 2),
        sectors: ((attrs.sectors as string[]) ?? []).slice(0, 3),
        is_active_deploying: (attrs.is_active_deploying as boolean) ?? false,
        fund_tier: (attrs.fund_tier as string) ?? null,
        has_cheque_range: !!(chequeMin || chequeMax),
        cheque_min_redacted: formatChequeMin(chequeMin),
      }
    })

    return {
      results: anonymized,
      totalMatches,
    }
  },
  ['public-investor-search'],
  { revalidate: 1800 } // Cache for 30 minutes
)
