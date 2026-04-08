import { Suspense } from 'react'
import { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { DirectorySearch } from '@/components/directory/DirectorySearch'
import { ExpertCard } from '@/components/directory/ExpertCard'
import { DirectoryCTA } from '@/components/directory/DirectoryCTA'
import { Skeleton } from '@/components/ui/skeleton'
import type { DirectoryExpert } from '@/lib/directory/types'

/**
 * /experts - Public expert directory browse page.
 *
 * @description SEO-optimized, server-rendered directory of fractional
 * executives. Searchable and filterable by role, location, and keywords.
 * No authentication required.
 *
 * @security All data comes from SECURITY DEFINER RPC functions.
 * No sensitive fields (email, Stripe) are ever exposed.
 */

// INTENT: Force dynamic rendering — this page fetches live data from Supabase
// and uses searchParams. Static rendering causes build-time failures.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
    title: 'Find Fractional Executives | Fractional Forge',
    description:
        'Browse our directory of vetted fractional CMOs, CFOs, CTOs, and more. Find the right expert for your business — part-time executive talent, on demand.',
    openGraph: {
        title: 'Find Fractional Executives | Fractional Forge',
        description:
            'Browse vetted fractional CMOs, CFOs, CTOs, and more. Part-time executive talent, on demand.',
        type: 'website',
        url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://fractionalforge.app'}/experts`,
        siteName: 'Fractional Forge',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Find Fractional Executives | Fractional Forge',
        description:
            'Browse vetted fractional CMOs, CFOs, CTOs, and more. Part-time executive talent, on demand.',
    },
    alternates: {
        canonical: `${process.env.NEXT_PUBLIC_APP_URL || 'https://fractionalforge.app'}/experts`,
    },
}

interface PageProps {
    searchParams: Promise<{ q?: string; page?: string }>
}

function ExpertsGridSkeleton() {
    return (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-64 rounded-xl" />
            ))}
        </div>
    )
}

async function ExpertsContent({ search, page }: { search?: string; page: number }) {
    // DECISION: Call Supabase directly instead of via 'use server' action.
    // The server action import was causing RSC serialization to return 500.
    const supabase = createAdminClient()
    const limit = 24
    const offset = (page - 1) * limit

    const [expertsResult, countResult] = await Promise.all([
        supabase.rpc('get_directory_experts', {
            p_role: null,
            p_location: null,
            p_search: search || null,
            p_limit: limit,
            p_offset: offset,
        }),
        supabase.rpc('get_directory_expert_count', {
            p_role: null,
            p_location: null,
            p_search: search || null,
        }),
    ])

    const rawExperts = (expertsResult.data || []) as Array<Record<string, unknown>>
    const total = (countResult.data as number) || 0

    // Map to DirectoryExpert shape
    const experts: DirectoryExpert[] = rawExperts.map(row => ({
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
    }))

    const totalPages = Math.ceil(total / 24)

    return (
        <>
            <Suspense fallback={null}>
                <DirectorySearch totalResults={total} />
            </Suspense>

            {experts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="mb-4 rounded-full bg-muted p-4">
                        <svg
                            className="h-8 w-8 text-muted-foreground"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth="1.5"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                            />
                        </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">
                        No experts found
                    </h3>
                    <p className="mt-1 max-w-md text-sm text-muted-foreground">
                        {search
                            ? `No results for "${search}". Try a different search term or browse all experts.`
                            : 'No experts are currently listed. Check back soon.'}
                    </p>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {experts.map((expert) => (
                            <ExpertCard key={expert.id} expert={expert} />
                        ))}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <nav
                            aria-label="Directory pagination"
                            className="mt-8 flex items-center justify-center gap-2"
                        >
                            {page > 1 && (
                                <a
                                    href={`/experts?${new URLSearchParams({
                                        ...(search ? { q: search } : {}),
                                        page: String(page - 1),
                                    })}`}
                                    className="rounded-md border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                                >
                                    Previous
                                </a>
                            )}
                            <span className="text-sm text-muted-foreground">
                                Page {page} of {totalPages}
                            </span>
                            {page < totalPages && (
                                <a
                                    href={`/experts?${new URLSearchParams({
                                        ...(search ? { q: search } : {}),
                                        page: String(page + 1),
                                    })}`}
                                    className="rounded-md border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                                >
                                    Next
                                </a>
                            )}
                        </nav>
                    )}
                </>
            )}
        </>
    )
}

export default async function ExpertsPage({ searchParams }: PageProps) {
    let search: string | undefined
    let page = 1

    try {
        const params = await searchParams
        search = params.q || undefined
        page = Math.max(1, parseInt(params.page || '1', 10) || 1)
    } catch (err) {
        console.error('[ExpertsPage] Failed to read searchParams:', err)
    }

    return (
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            {/* Page header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    Find Your Fractional Executive
                </h1>
                <p className="mt-2 max-w-2xl text-lg text-muted-foreground leading-relaxed">
                    Browse vetted CMOs, CFOs, CTOs, and more. Part-time executive talent
                    for startups and growing businesses.
                </p>
            </div>

            {/* Content */}
            <div className="space-y-8">
                <Suspense fallback={<ExpertsGridSkeleton />}>
                    <ExpertsContent search={search} page={page} />
                </Suspense>
            </div>

            {/* Bottom CTA */}
            <div className="mt-16">
                <DirectoryCTA variant="both" />
            </div>
        </div>
    )
}
