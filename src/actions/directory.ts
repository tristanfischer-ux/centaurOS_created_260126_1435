'use server'

/**
 * @file directory.ts
 *
 * @description Server actions for the public expert directory.
 * These actions query SECURITY DEFINER RPC functions that bypass RLS
 * to return only public-safe profile data. No authentication required.
 *
 * @security All data returned is intentionally public. RPC functions
 * enforce the is_public = true AND is_active = true filter. No email,
 * Stripe, or sensitive fields are ever exposed.
 *
 * @related
 * - supabase/migrations/20260216900000_public_directory_access.sql
 * - src/lib/directory/types.ts
 * - src/app/(directory)/experts/
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type {
    DirectoryExpert,
    DirectoryExpertFull,
    DirectoryCaseStudy,
    DirectoryRole,
    DirectoryLocation,
} from '@/lib/directory/types'

/**
 * Fetches public expert profiles for the directory browse page.
 *
 * @description Calls the get_directory_experts RPC function with optional
 * filters for role, location, and free-text search. Results are ordered
 * by featured status, tier, rating, and completeness.
 *
 * @param params - Optional filter and pagination params
 * @returns Array of public expert profiles
 *
 * @security No auth required. RPC returns only public-safe fields.
 */
export async function getDirectoryExperts(params?: {
    role?: string
    location?: string
    search?: string
    limit?: number
    offset?: number
}): Promise<{ experts: DirectoryExpert[]; total: number }> {
    try {
        const supabase = createAdminClient()

        const [expertsResult, countResult] = await Promise.all([
            supabase.rpc('get_directory_experts', {
                p_role: params?.role || null,
                p_location: params?.location || null,
                p_search: params?.search || null,
                p_limit: params?.limit || 50,
                p_offset: params?.offset || 0,
            }),
            supabase.rpc('get_directory_expert_count', {
                p_role: params?.role || null,
                p_location: params?.location || null,
                p_search: params?.search || null,
            }),
        ])

        if (expertsResult.error) {
            console.error('[Directory] Failed to fetch experts:', expertsResult.error)
            return { experts: [], total: 0 }
        }

        const experts = (expertsResult.data || []).map(mapExpertRow)
        const total = (countResult.data as number) || 0

        return { experts, total }
    } catch (error) {
        console.error('[Directory] Unexpected error fetching experts:', {
            error: error instanceof Error ? error.message : 'Unknown error',
        })
        return { experts: [], total: 0 }
    }
}

/**
 * Fetches a single expert's full public profile by slug.
 *
 * @param slug - Profile slug or username
 * @returns Full public profile with case studies, or null if not found
 *
 * @security No auth required. RPC returns only public-safe fields.
 */
export async function getDirectoryExpertBySlug(
    slug: string
): Promise<DirectoryExpertFull | null> {
    try {
        const supabase = createAdminClient()

        // Fetch profile
        const { data: profileRows, error: profileError } = await supabase.rpc(
            'get_directory_expert_by_slug',
            { p_slug: slug }
        )

        if (profileError) {
            console.error('[Directory] Failed to fetch expert profile:', {
                slug,
                error: profileError.message,
            })
            return null
        }

        const rows = profileRows as Record<string, unknown>[]
        if (!rows || rows.length === 0) return null

        const profile = rows[0]

        // Fetch case studies for this expert
        const { data: caseStudyRows, error: csError } = await supabase.rpc(
            'get_directory_expert_case_studies',
            { p_provider_id: profile.id as string }
        )

        if (csError) {
            console.error('[Directory] Failed to fetch case studies:', {
                slug,
                error: csError.message,
            })
        }

        const caseStudies: DirectoryCaseStudy[] = (caseStudyRows || []).map(
            (cs: Record<string, unknown>) => ({
                id: cs.id as string,
                title: cs.title as string,
                client_name: cs.client_name as string | null,
                client_industry: cs.client_industry as string | null,
                company_stage: cs.company_stage as string | null,
                challenge: cs.challenge as string,
                approach: cs.approach as string,
                outcome: cs.outcome as string,
                metrics: (cs.metrics || []) as { label: string; value: string; change_percent?: number }[],
                testimonial_quote: cs.testimonial_quote as string | null,
                testimonial_author: cs.testimonial_author as string | null,
                testimonial_role: cs.testimonial_role as string | null,
                engagement_type: cs.engagement_type as string | null,
                hours_per_week: cs.hours_per_week as number | null,
                is_featured: cs.is_featured as boolean,
            })
        )

        return {
            ...mapExpertRow(profile),
            video_url: profile.video_url as string | null,
            video_thumbnail_url: profile.video_thumbnail_url as string | null,
            linkedin_url: profile.linkedin_url as string | null,
            website_url: profile.website_url as string | null,
            timezone: (profile.timezone as string) || 'UTC',
            accepts_trial: (profile.accepts_trial as boolean) ?? true,
            trial_rate_discount: (profile.trial_rate_discount as number) || 0,
            minimum_engagement_hours: (profile.minimum_engagement_hours as number) || 10,
            case_studies: caseStudies,
        }
    } catch (error) {
        console.error('[Directory] Unexpected error fetching expert:', {
            slug,
            error: error instanceof Error ? error.message : 'Unknown error',
        })
        return null
    }
}

/**
 * Fetches distinct role categories from public profiles.
 *
 * @returns Array of roles with expert counts
 *
 * @security No auth required. RPC aggregates public data only.
 */
export async function getDirectoryRoles(): Promise<DirectoryRole[]> {
    try {
        const supabase = createAdminClient()
        const { data, error } = await supabase.rpc('get_directory_roles')

        if (error) {
            console.error('[Directory] Failed to fetch roles:', error)
            return []
        }

        return (data || []).map((r: Record<string, unknown>) => ({
            role_name: r.role_name as string,
            expert_count: Number(r.expert_count),
        }))
    } catch (error) {
        console.error('[Directory] Unexpected error fetching roles:', {
            error: error instanceof Error ? error.message : 'Unknown error',
        })
        return []
    }
}

/**
 * Fetches distinct locations from public profiles.
 *
 * @returns Array of locations with expert counts
 *
 * @security No auth required. RPC aggregates public data only.
 */
export async function getDirectoryLocations(): Promise<DirectoryLocation[]> {
    try {
        const supabase = createAdminClient()
        const { data, error } = await supabase.rpc('get_directory_locations')

        if (error) {
            console.error('[Directory] Failed to fetch locations:', error)
            return []
        }

        return (data || []).map((l: Record<string, unknown>) => ({
            location_name: l.location_name as string,
            expert_count: Number(l.expert_count),
        }))
    } catch (error) {
        console.error('[Directory] Unexpected error fetching locations:', {
            error: error instanceof Error ? error.message : 'Unknown error',
        })
        return []
    }
}

/**
 * Fetches all expert slugs for sitemap generation.
 *
 * @returns Array of slugs for all public experts
 *
 * @security No auth required. Only returns slugs (public identifiers).
 */
export async function getDirectoryExpertSlugs(): Promise<string[]> {
    try {
        const supabase = createAdminClient()
        const { data, error } = await supabase.rpc('get_directory_experts', {
            p_role: null,
            p_location: null,
            p_search: null,
            p_limit: 10000,
            p_offset: 0,
        })

        if (error) {
            console.error('[Directory] Failed to fetch expert slugs:', error)
            return []
        }

        return (data || [])
            .map((e: Record<string, unknown>) =>
                (e.profile_slug as string) || (e.username as string) || null
            )
            .filter((s: string | null): s is string => s !== null)
    } catch (error) {
        console.error('[Directory] Unexpected error fetching slugs:', {
            error: error instanceof Error ? error.message : 'Unknown error',
        })
        return []
    }
}

/**
 * Maps a raw RPC row to the DirectoryExpert type.
 */
function mapExpertRow(row: Record<string, unknown>): DirectoryExpert {
    return {
        id: row.id as string,
        profile_slug: row.profile_slug as string | null,
        username: row.username as string | null,
        headline: row.headline as string | null,
        bio: row.bio as string | null,
        location: row.location as string | null,
        years_experience: row.years_experience as number | null,
        day_rate: row.day_rate as number | null,
        hourly_rate: row.hourly_rate as number | null,
        currency: (row.currency as string) || 'GBP',
        tier: (row.tier as string) || 'standard',
        specializations: (row.specializations as string[]) || [],
        industries: (row.industries as string[]) || [],
        company_stages: (row.company_stages as string[]) || [],
        is_verified: (row.is_verified as boolean) || false,
        profile_completeness: (row.profile_completeness as number) || 0,
        user_name: row.user_name as string | null,
        user_avatar: row.user_avatar as string | null,
        average_rating: row.average_rating as number | null,
        total_reviews: (row.total_reviews as number) || 0,
        total_transactions: (row.total_transactions as number) || 0,
        featured_until: row.featured_until as string | null,
    }
}
