import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import Link from 'next/link'
import { getDirectoryExperts, getDirectoryLocations } from '@/actions/directory'
import { DirectorySearch } from '@/components/directory/DirectorySearch'
import { ExpertCard } from '@/components/directory/ExpertCard'
import { DirectoryCTA } from '@/components/directory/DirectoryCTA'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { MapPin } from 'lucide-react'
import {
    DIRECTORY_ROLE_CATEGORIES,
    roleSlugToSearchTerm,
    locationToSlug,
} from '@/lib/directory/types'
import type { DirectoryRoleSlug } from '@/lib/directory/types'
import { generateDirectoryListJsonLd } from '@/lib/directory/structured-data'

/**
 * /experts/[role] - Role category page (e.g., /experts/fractional-cmo).
 *
 * @description SEO-optimized page targeting role-specific search queries
 * like "hire a fractional CMO". Shows filtered experts with category
 * description and links to role+location pages.
 *
 * @security All data from SECURITY DEFINER RPC functions.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://fractionalforge.app'

interface PageProps {
    params: Promise<{ role: string }>
    searchParams: Promise<{ page?: string }>
}

export async function generateStaticParams(): Promise<{ role: string }[]> {
    return Object.keys(DIRECTORY_ROLE_CATEGORIES).map((role) => ({ role }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { role } = await params
    const category = DIRECTORY_ROLE_CATEGORIES[role as DirectoryRoleSlug]

    if (!category) {
        return { title: 'Not Found | Fractional Forge' }
    }

    return {
        title: `${category.metaTitle} | Fractional Forge`,
        description: category.metaDescription,
        openGraph: {
            title: category.metaTitle,
            description: category.metaDescription,
            type: 'website',
            url: `${APP_URL}/experts/${role}`,
            siteName: 'Fractional Forge',
        },
        twitter: {
            card: 'summary_large_image',
            title: category.metaTitle,
            description: category.metaDescription,
        },
        alternates: {
            canonical: `${APP_URL}/experts/${role}`,
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

async function RolePageContent({
    roleSlug,
    page,
}: {
    roleSlug: string
    page: number
}) {
    const category = DIRECTORY_ROLE_CATEGORIES[roleSlug as DirectoryRoleSlug]
    if (!category) notFound()

    const searchTerm = roleSlugToSearchTerm(roleSlug)
    const limit = 24
    const offset = (page - 1) * limit

    const [{ experts, total }, locations] = await Promise.all([
        getDirectoryExperts({
            role: searchTerm || undefined,
            limit,
            offset,
        }),
        getDirectoryLocations(),
    ])

    const totalPages = Math.ceil(total / limit)

    const listJsonLd = generateDirectoryListJsonLd(
        experts,
        `${category.title} Directory`,
        `${APP_URL}/experts/${roleSlug}`
    )

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(listJsonLd).replace(/</g, '\\u003c') }}
            />

            <DirectorySearch activeRole={roleSlug} totalResults={total} />

            {/* Location quick links for long-tail SEO */}
            {locations.length > 0 && (
                <div className="mt-6">
                    <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                        Browse {category.title} by Location
                    </h2>
                    <div className="flex flex-wrap gap-2">
                        {locations.slice(0, 12).map((loc) => (
                            <Link
                                key={loc.location_name}
                                href={`/experts/${roleSlug}/${locationToSlug(loc.location_name)}`}
                            >
                                <Badge
                                    variant="secondary"
                                    className="cursor-pointer gap-1 transition-colors hover:bg-accent/80"
                                >
                                    <MapPin className="h-3 w-3" />
                                    {loc.location_name}
                                    <span className="text-muted-foreground">
                                        ({loc.expert_count})
                                    </span>
                                </Badge>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {experts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <h3 className="text-lg font-semibold text-foreground">
                        No {category.title.toLowerCase()} found yet
                    </h3>
                    <p className="mt-1 max-w-md text-sm text-muted-foreground">
                        We&apos;re growing our directory. Check back soon or{' '}
                        <Link
                            href="/join/expert"
                            className="text-international-orange hover:underline"
                        >
                            list your profile
                        </Link>{' '}
                        if you&apos;re a {category.label.toLowerCase()}.
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
                                    href={`/experts/${roleSlug}?page=${page - 1}`}
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
                                    href={`/experts/${roleSlug}?page=${page + 1}`}
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

export default async function RoleCategoryPage({ params, searchParams }: PageProps) {
    const { role } = await params
    const sp = await searchParams
    const page = Math.max(1, parseInt(sp.page || '1', 10) || 1)

    const category = DIRECTORY_ROLE_CATEGORIES[role as DirectoryRoleSlug]
    if (!category) notFound()

    return (
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            {/* Page header */}
            <div className="mb-8">
                <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
                    <Link href="/experts" className="hover:text-foreground transition-colors">
                        All Experts
                    </Link>
                    <span className="mx-2">/</span>
                    <span className="text-foreground">{category.title}</span>
                </nav>

                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    {category.metaTitle}
                </h1>
                <p className="mt-2 max-w-3xl text-lg text-muted-foreground leading-relaxed">
                    {category.description}
                </p>
            </div>

            {/* Content */}
            <div className="space-y-6">
                <Suspense fallback={<GridSkeleton />}>
                    <RolePageContent roleSlug={role} page={page} />
                </Suspense>
            </div>

            {/* Bottom CTA */}
            <div className="mt-16">
                <DirectoryCTA variant="both" />
            </div>
        </div>
    )
}
