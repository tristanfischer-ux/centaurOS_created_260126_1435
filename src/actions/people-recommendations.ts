"use server"

import { createClient } from "@/lib/supabase/server"
import { withAuth } from '@/lib/server-action-utils'

/**
 * @file people-recommendations.ts
 *
 * @description People-specific recommendation engine that suggests talent based on
 * foundry context: industry, stage, team composition, org blueprint gaps, and what
 * similar companies hired. Creates the "this platform gets me" moment.
 *
 * @security Requires authenticated user with foundry membership.
 * @related
 * - Marketplace recommendations: src/actions/marketplace.ts
 * - Org blueprint: src/actions/blueprint-coverage.ts
 * - People marketplace: src/actions/people-marketplace.ts
 */

export interface PeopleRecommendation {
    id: string
    type: 'gap_based' | 'industry_pattern' | 'stage_based' | 'similar_company'
    title: string
    description: string
    reasoning: string
    matchedListingIds: string[]
    priority: number
    iconType: 'gap' | 'industry' | 'stage' | 'trending'
}

/**
 * Industry-specific hiring patterns for hardware startups.
 * Maps industry + stage to commonly needed roles.
 */
const INDUSTRY_HIRING_PATTERNS: Record<string, Record<string, string[]>> = {
    'aerospace': {
        'pre-seed': ['Fractional CTO', 'Systems Engineer', 'Regulatory Consultant'],
        'seed': ['VP Engineering', 'Quality Engineer', 'Supply Chain Manager'],
        'series-a': ['VP Operations', 'Program Manager', 'Test Engineer'],
    },
    'automotive': {
        'pre-seed': ['Fractional CTO', 'CAD Specialist', 'Materials Engineer'],
        'seed': ['VP Engineering', 'Quality Assurance Lead', 'Manufacturing Engineer'],
        'series-a': ['VP Manufacturing', 'Supply Chain Director', 'Compliance Officer'],
    },
    'consumer-electronics': {
        'pre-seed': ['Fractional CTO', 'Industrial Designer', 'Firmware Engineer'],
        'seed': ['VP Product', 'Manufacturing Partner Manager', 'Quality Engineer'],
        'series-a': ['VP Operations', 'Supply Chain Manager', 'Customer Support Lead'],
    },
    'medical-devices': {
        'pre-seed': ['Fractional CTO', 'Regulatory Affairs Consultant', 'Quality Consultant'],
        'seed': ['VP Quality', 'Clinical Affairs Manager', 'Manufacturing Engineer'],
        'series-a': ['VP Regulatory', 'VP Operations', 'Quality Systems Manager'],
    },
    'defense': {
        'pre-seed': ['Fractional CTO', 'Systems Engineer', 'Security Clearance Consultant'],
        'seed': ['VP Engineering', 'Program Manager', 'Compliance Officer'],
        'series-a': ['VP Programs', 'Business Development Lead', 'Contracts Manager'],
    },
}

/** Stage benchmarks: typical team roles at each stage */
const STAGE_BENCHMARKS: Record<string, string[]> = {
    'pre-seed': ['Fractional CTO', 'Fractional CFO'],
    'seed': ['VP Engineering', 'VP Operations', 'Quality Engineer'],
    'series-a': ['VP Engineering', 'VP Operations', 'VP Sales', 'VP Marketing', 'Quality Manager'],
    'series-b': ['CTO', 'COO', 'CFO', 'VP Sales', 'VP Marketing', 'VP Product'],
}

/**
 * Generate people-specific recommendations for a foundry.
 *
 * @description Analyzes the foundry's context (industry, stage, team gaps,
 * blueprint coverage) and generates targeted hiring recommendations with
 * reasoning that makes users feel understood.
 *
 * @returns {Promise<PeopleRecommendation[]>} Prioritized recommendations
 *
 * @security Requires authenticated user with foundry membership.
 */
export async function generatePeopleRecommendations(): Promise<PeopleRecommendation[]> {
    return withAuth(async ({ supabase, foundryId }) => {
        const recommendations: PeopleRecommendation[] = []

        // Fetch foundry context (purpose_data is JSONB, not a separate column)
        const { data: foundry } = await supabase
            .from('foundries')
            .select('name, industry, stage')
            .eq('id', foundryId)
            .single()

        if (!foundry) return []

        const industry = (foundry.industry || '').toLowerCase()
        const stage = (foundry.stage || 'pre-seed').toLowerCase()

        // Fetch current team members to understand gaps
        const { data: teamMembers } = await supabase
            .from('profiles')
            .select('full_name, role, headline, expertise_areas')
            .eq('foundry_id', foundryId)

        const currentRoles = new Set(
            (teamMembers || []).map(m => m.headline || m.role || '').filter(Boolean)
        )

        // Fetch People listings for matching
        const { data: listings } = await supabase
            .from('marketplace_listings')
            .select('id, title, subcategory, attributes')
            .eq('category', 'People')
            .limit(100)

        const listingsByRole = new Map<string, string[]>()
        for (const l of (listings || [])) {
            const role = ((l.attributes as Record<string, unknown>)?.role as string || l.subcategory || '').toLowerCase()
            const existing = listingsByRole.get(role) || []
            existing.push(l.id)
            listingsByRole.set(role, existing)
        }

        // Find matching listing IDs for a role description
        const findMatchingListings = (roleDesc: string): string[] => {
            const roleWords = roleDesc.toLowerCase().split(/\s+/)
            const matches: string[] = []
            for (const [role, ids] of listingsByRole) {
                if (roleWords.some(w => role.includes(w))) {
                    matches.push(...ids)
                }
            }
            return [...new Set(matches)].slice(0, 5)
        }

        // 1. Industry-based recommendations
        const industryKey = Object.keys(INDUSTRY_HIRING_PATTERNS).find(k => industry.includes(k))
        if (industryKey) {
            const stageKey = Object.keys(INDUSTRY_HIRING_PATTERNS[industryKey]).find(k => stage.includes(k))
            const roles = INDUSTRY_HIRING_PATTERNS[industryKey][stageKey || 'pre-seed'] || []

            for (const role of roles) {
                if (!Array.from(currentRoles).some(r => r.toLowerCase().includes(role.toLowerCase()))) {
                    const matchedIds = findMatchingListings(role)
                    recommendations.push({
                        id: `industry-${industryKey}-${role.replace(/\s+/g, '-').toLowerCase()}`,
                        type: 'industry_pattern',
                        title: role,
                        description: `Common hire for ${industryKey} companies at ${stage} stage`,
                        reasoning: `Most ${industryKey} companies at the ${stage} stage bring on a ${role}. Your team doesn't appear to have one yet.`,
                        matchedListingIds: matchedIds,
                        priority: 80,
                        iconType: 'industry',
                    })
                }
            }
        }

        // 2. Stage-based benchmarks
        const stageKey = Object.keys(STAGE_BENCHMARKS).find(k => stage.includes(k))
        const benchmarkRoles = STAGE_BENCHMARKS[stageKey || 'pre-seed'] || []

        for (const role of benchmarkRoles) {
            if (!Array.from(currentRoles).some(r => r.toLowerCase().includes(role.toLowerCase()))) {
                const alreadyRecommended = recommendations.some(r => r.title.toLowerCase() === role.toLowerCase())
                if (!alreadyRecommended) {
                    const matchedIds = findMatchingListings(role)
                    recommendations.push({
                        id: `stage-${stage}-${role.replace(/\s+/g, '-').toLowerCase()}`,
                        type: 'stage_based',
                        title: role,
                        description: `Typical role for ${stage} stage companies`,
                        reasoning: `Companies at the ${stage} stage typically have a ${role}. Consider adding one to strengthen your team.`,
                        matchedListingIds: matchedIds,
                        priority: 60,
                        iconType: 'stage',
                    })
                }
            }
        }

        // 3. Similar company pattern (based on foundry_stack of similar companies)
        if (industry) {
            const { data: similarFoundries } = await supabase
                .from('foundries')
                .select('id')
                .ilike('industry', `%${industryKey || industry}%`)
                .neq('id', foundryId)
                .limit(10)

            if (similarFoundries && similarFoundries.length > 0) {
                const similarIds = similarFoundries.map(f => f.id)
                const { data: popularHires } = await supabase
                    .from('foundry_stack')
                    .select('provider_id')
                    .in('foundry_id', similarIds)

                if (popularHires && popularHires.length > 0) {
                    // Count how often each provider appears
                    const providerCounts = new Map<string, number>()
                    for (const h of popularHires) {
                        if (h.provider_id) {
                            providerCounts.set(h.provider_id, (providerCounts.get(h.provider_id) || 0) + 1)
                        }
                    }

                    const topProviders = Array.from(providerCounts.entries())
                        .filter(([, count]) => count >= 2)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 3)

                    if (topProviders.length > 0) {
                        recommendations.push({
                            id: `similar-companies-top-hires`,
                            type: 'similar_company',
                            title: 'Popular with Similar Companies',
                            description: `${topProviders.length} experts trusted by ${similarFoundries.length} similar companies`,
                            reasoning: `${similarFoundries.length} other ${industryKey || industry} companies on ForgeOS have these experts in their team. They might be a great fit for you too.`,
                            matchedListingIds: topProviders.map(([id]) => id),
                            priority: 90,
                            iconType: 'trending',
                        })
                    }
                }
            }
        }

        // Sort by priority
        return recommendations.sort((a, b) => b.priority - a.priority).slice(0, 5)
    }) as Promise<PeopleRecommendation[]>
}
