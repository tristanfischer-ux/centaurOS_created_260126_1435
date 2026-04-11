/**
 * @file public-investor-preview.ts
 *
 * @description Public-safe investor preview for the marketing homepage.
 * Returns a small sample of investors with ONLY safe public fields.
 * No contact emails, no intelligence data, no sensitive attributes.
 *
 * @security Uses admin client. Only exposes: title, subcategory, firm_type,
 * stage_focus (first 2), hq_city, is_active_deploying, fund_tier.
 * NEVER expose: contact_email, linkedin, investment_thesis, portfolio details.
 */

"use server"

import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

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
