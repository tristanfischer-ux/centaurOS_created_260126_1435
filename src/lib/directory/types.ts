/**
 * @file directory/types.ts
 *
 * @description Type definitions for the public expert directory.
 * These types represent the public-safe subset of provider profile data
 * exposed to unauthenticated visitors via SECURITY DEFINER RPC functions.
 *
 * @related
 * - supabase/migrations/20260216900000_public_directory_access.sql
 * - src/actions/directory.ts
 * - src/app/(directory)/experts/
 */

/** Public-safe expert profile for directory grid cards */
export interface DirectoryExpert {
    id: string
    profile_slug: string | null
    username: string | null
    headline: string | null
    bio: string | null
    location: string | null
    years_experience: number | null
    day_rate: number | null
    hourly_rate: number | null
    currency: string
    tier: string
    specializations: string[]
    industries: string[]
    company_stages: string[]
    is_verified: boolean
    profile_completeness: number
    user_name: string | null
    user_avatar: string | null
    average_rating: number | null
    total_reviews: number
    total_transactions: number
    featured_until: string | null
}

/** Full public expert profile for individual profile page */
export interface DirectoryExpertFull extends DirectoryExpert {
    video_url: string | null
    video_thumbnail_url: string | null
    linkedin_url: string | null
    website_url: string | null
    timezone: string
    accepts_trial: boolean
    trial_rate_discount: number
    minimum_engagement_hours: number
    case_studies: DirectoryCaseStudy[]
}

/** Public case study for expert profile */
export interface DirectoryCaseStudy {
    id: string
    title: string
    client_name: string | null
    client_industry: string | null
    company_stage: string | null
    challenge: string
    approach: string
    outcome: string
    metrics: { label: string; value: string; change_percent?: number }[]
    testimonial_quote: string | null
    testimonial_author: string | null
    testimonial_role: string | null
    engagement_type: string | null
    hours_per_week: number | null
    is_featured: boolean
}

/** Role category for directory navigation */
export interface DirectoryRole {
    role_name: string
    expert_count: number
}

/** Location for directory navigation */
export interface DirectoryLocation {
    location_name: string
    expert_count: number
}

/**
 * Known role categories for SEO-friendly directory pages.
 * These map URL slugs to human-readable labels and search terms.
 */
export const DIRECTORY_ROLE_CATEGORIES = {
    'fractional-cmo': {
        label: 'Fractional CMO',
        title: 'Fractional CMOs',
        description: 'Experienced marketing leaders available for part-time engagements. Get senior marketing strategy without the full-time cost.',
        searchTerms: ['CMO', 'marketing', 'growth', 'brand'],
        metaTitle: 'Hire a Fractional CMO',
        metaDescription: 'Find and hire experienced Fractional CMOs for your startup or SMB. Part-time marketing leadership from vetted professionals.',
    },
    'fractional-cfo': {
        label: 'Fractional CFO',
        title: 'Fractional CFOs',
        description: 'Senior finance leaders who bring financial strategy, fundraising expertise, and fiscal discipline to growing companies.',
        searchTerms: ['CFO', 'finance', 'financial', 'accounting', 'fundraising'],
        metaTitle: 'Hire a Fractional CFO',
        metaDescription: 'Find and hire experienced Fractional CFOs. Expert financial leadership for startups and growing businesses.',
    },
    'fractional-cto': {
        label: 'Fractional CTO',
        title: 'Fractional CTOs',
        description: 'Technical leaders who architect systems, build engineering teams, and drive product development for growing companies.',
        searchTerms: ['CTO', 'technology', 'engineering', 'technical', 'architect'],
        metaTitle: 'Hire a Fractional CTO',
        metaDescription: 'Find and hire experienced Fractional CTOs. Senior technical leadership for startups and scale-ups.',
    },
    'fractional-coo': {
        label: 'Fractional COO',
        title: 'Fractional COOs',
        description: 'Operations leaders who streamline processes, scale teams, and build the systems that let companies grow efficiently.',
        searchTerms: ['COO', 'operations', 'process', 'scaling', 'efficiency'],
        metaTitle: 'Hire a Fractional COO',
        metaDescription: 'Find and hire experienced Fractional COOs. Operations leadership that scales with your business.',
    },
    'fractional-cpo': {
        label: 'Fractional CPO',
        title: 'Fractional CPOs',
        description: 'Product leaders who define strategy, prioritize roadmaps, and ship products that customers love.',
        searchTerms: ['CPO', 'product', 'product management', 'roadmap', 'strategy'],
        metaTitle: 'Hire a Fractional CPO',
        metaDescription: 'Find and hire experienced Fractional CPOs. Strategic product leadership for growing companies.',
    },
    'fractional-chro': {
        label: 'Fractional CHRO',
        title: 'Fractional CHROs',
        description: 'People leaders who build culture, hiring processes, and HR systems that attract and retain top talent.',
        searchTerms: ['CHRO', 'HR', 'human resources', 'people', 'talent', 'hiring'],
        metaTitle: 'Hire a Fractional CHRO',
        metaDescription: 'Find and hire experienced Fractional CHROs. People and culture leadership for growing teams.',
    },
    'fractional-cso': {
        label: 'Fractional CSO',
        title: 'Fractional CSOs',
        description: 'Sales leaders who build revenue engines, design sales processes, and close enterprise deals.',
        searchTerms: ['CSO', 'sales', 'revenue', 'business development', 'enterprise'],
        metaTitle: 'Hire a Fractional CSO',
        metaDescription: 'Find and hire experienced Fractional CSOs. Sales leadership to accelerate your revenue growth.',
    },
    'advisor': {
        label: 'Strategic Advisor',
        title: 'Strategic Advisors',
        description: 'Seasoned executives who provide board-level guidance, industry connections, and strategic counsel.',
        searchTerms: ['advisor', 'advisory', 'board', 'strategic', 'mentor'],
        metaTitle: 'Hire a Strategic Advisor',
        metaDescription: 'Find experienced strategic advisors and board-level consultants for your business.',
    },
} satisfies Record<string, {
    label: string
    title: string
    description: string
    searchTerms: string[]
    metaTitle: string
    metaDescription: string
}>

export type DirectoryRoleSlug = keyof typeof DIRECTORY_ROLE_CATEGORIES

/**
 * Converts a URL slug to the search term used for filtering.
 *
 * @param slug - URL slug like 'fractional-cmo'
 * @returns The primary search term like 'CMO', or null if not a known role
 */
export function roleSlugToSearchTerm(slug: string): string | null {
    const category = DIRECTORY_ROLE_CATEGORIES[slug as DirectoryRoleSlug]
    if (!category) return null
    return category.searchTerms[0]
}

/**
 * Gets the display slug for an expert (prefers profile_slug, falls back to username).
 *
 * @param expert - Expert with slug/username fields
 * @returns The slug to use in URLs, or null if neither exists
 */
export function getExpertSlug(expert: Pick<DirectoryExpert, 'profile_slug' | 'username'>): string | null {
    return expert.profile_slug || expert.username || null
}

/**
 * Normalizes a location string into a URL-safe slug.
 *
 * @param location - Raw location like "London, UK"
 * @returns URL slug like "london-uk"
 */
export function locationToSlug(location: string): string {
    return location
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim()
}

/**
 * Converts a location slug back to a search term.
 *
 * @param slug - URL slug like "london-uk"
 * @returns Search term like "london uk"
 */
export function locationSlugToSearchTerm(slug: string): string {
    return slug.replace(/-/g, ' ')
}
