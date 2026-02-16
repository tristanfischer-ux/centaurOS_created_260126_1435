import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import Link from 'next/link'
import { getDirectoryExperts } from '@/actions/directory'
import { ExpertCard } from '@/components/directory/ExpertCard'
import { DirectoryCTA } from '@/components/directory/DirectoryCTA'
import { DirectorySearch } from '@/components/directory/DirectorySearch'
import { Skeleton } from '@/components/ui/skeleton'
import {
    DIRECTORY_ROLE_CATEGORIES,
    roleSlugToSearchTerm,
    locationSlugToSearchTerm,
} from '@/lib/directory/types'
import type { DirectoryRoleSlug } from '@/lib/directory/types'
import { generateDirectoryListJsonLd } from '@/lib/directory/structured-data'

/**
 * /experts/[role]/[location] - Long-tail role + location page.
 *
 * @description Targets hyper-specific search queries like
 * "fractional CMO London" or "fractional CTO New York".
 * These pages are the core SEO play from the Isenberg playbook.
 *
 * @security All data from SECURITY DEFINER RPC functions.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://fractionalforge.app'

interface PageProps {
    params: Promise<{ role: string; location: string }>
    searchParams: Promise<{ page?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { role, location } = await params
    const category = DIRECTORY_ROLE_CATEGORIES[role as DirectoryRoleSlug]

    if (!category) {
        return { title: 'Not Found | Fractional Forge' }
    }

    const locationName = locationSlugToSearchTerm(location)
    const capitalizedLocation = locationName
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')

    const title = `${category.label} in ${capitalizedLocation}`
    const description = `Find experienced ${category.title.toLowerCase()} in ${capitalizedLocation}. ${category.description}`

    return {
        title: `${title} | Fractional Forge`,
        description,
        openGraph: {
            title,
            description,
            type: 'website',
            url: `${APP_URL}/experts/${role}/${location}`,
            siteName: 'Fractional Forge',
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description,
        },
        alternates: {
            canonical: `${APP_URL}/experts/${role}/${location}`,
        },
    }
}

function GridSkeleton() {
    return (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-64 rounded-xl" />
            ))}
        </div>
    )
}

async function LocationPageContent({
    roleSlug,
    locationSlug,
    page,
}: {
    roleSlug: string
    locationSlug: string
    page: number
}) {
    const category = DIRECTORY_ROLE_CATEGORIES[roleSlug as DirectoryRoleSlug]
    if (!category) notFound()

    const searchTerm = roleSlugToSearchTerm(roleSlug)
    const locationTerm = locationSlugToSearchTerm(locationSlug)
    const limit = 24
    const offset = (page - 1) * limit

    const { experts, total } = await getDirectoryExperts({
        role: searchTerm || undefined,
        location: locationTerm,
        limit,
        offset,
    })

    const totalPages = Math.ceil(total / limit)
    const capitalizedLocation = locationTerm
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')

    const listJsonLd = generateDirectoryListJsonLd(
        experts,
        `${category.title} in ${capitalizedLocation}`,
        `${APP_URL}/experts/${roleSlug}/${locationSlug}`
    )

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(listJsonLd) }}
            />

            <DirectorySearch
                activeRole={roleSlug}
                activeLocation={locationSlug}
                totalResults={total}
            />

            {experts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <h3 className="text-lg font-semibold text-foreground">
                        No {category.title.toLowerCase()} in {capitalizedLocation} yet
                    </h3>
                    <p className="mt-1 max-w-md text-sm text-muted-foreground">
                        We&apos;re growing our directory. Try{' '}
                        <Link
                            href={`/experts/${roleSlug}`}
                            className="text-international-orange hover:underline"
                        >
                            browsing all {category.title.toLowerCase()}
                        </Link>{' '}
                        or{' '}
                        <Link
                            href="/join/expert"
                            className="text-international-orange hover:underline"
                        >
                            list your profile
                        </Link>
                        .
                    </p>
                </div>
            ) : (
                <>
                    <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {experts.map((expert) => (
                            <ExpertCard key={expert.id} expert={expert} />
                        ))}
                    </div>

                    {totalPages > 1 && (
                        <nav
                            aria-label="Directory pagination"
                            className="mt-8 flex items-center justify-center gap-2"
                        >
                            {page > 1 && (
                                <a
                                    href={`/experts/${roleSlug}/${locationSlug}?page=${page - 1}`}
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
                                    href={`/experts/${roleSlug}/${locationSlug}?page=${page + 1}`}
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

export default async function LocationPage({ params, searchParams }: PageProps) {
    const { role, location } = await params
    const sp = await searchParams
    const page = Math.max(1, parseInt(sp.page || '1', 10) || 1)

    const category = DIRECTORY_ROLE_CATEGORIES[role as DirectoryRoleSlug]
    if (!category) notFound()

    const locationName = locationSlugToSearchTerm(location)
    const capitalizedLocation = locationName
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')

    return (
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            {/* Page header */}
            <div className="mb-8">
                <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
                    <Link href="/experts" className="hover:text-foreground transition-colors">
                        All Experts
                    </Link>
                    <span className="mx-2">/</span>
                    <Link
                        href={`/experts/${role}`}
                        className="hover:text-foreground transition-colors"
                    >
                        {category.title}
                    </Link>
                    <span className="mx-2">/</span>
                    <span className="text-foreground">{capitalizedLocation}</span>
                </nav>

                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    {category.label} in {capitalizedLocation}
                </h1>
                <p className="mt-2 max-w-3xl text-lg text-muted-foreground leading-relaxed">
                    Find experienced {category.title.toLowerCase()} based in{' '}
                    {capitalizedLocation}. {category.description}
                </p>
            </div>

            {/* Content */}
            <div className="space-y-6">
                <Suspense fallback={<GridSkeleton />}>
                    <LocationPageContent
                        roleSlug={role}
                        locationSlug={location}
                        page={page}
                    />
                </Suspense>
            </div>

            {/* Bottom CTA */}
            <div className="mt-16">
                <DirectoryCTA variant="both" />
            </div>
        </div>
    )
}
