import { Suspense } from 'react'
import { Metadata } from 'next'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * /blog - Public blog index page.
 *
 * @description SEO-optimized, server-rendered listing of published blog posts
 * from ForgeOS specialists. No authentication required.
 *
 * @security All data comes from SECURITY DEFINER RPC (list_published_content)
 * that only returns posts with publish_status = 'published'.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://fractionalforge.app'

export const metadata: Metadata = {
    title: 'Blog | Fractional Forge',
    description:
        'Insights from fractional executives on strategy, operations, fundraising, and scaling hardware startups. Expert perspectives from the Fractional Forge team.',
    openGraph: {
        title: 'Blog | Fractional Forge',
        description:
            'Insights from fractional executives on strategy, operations, fundraising, and scaling hardware startups.',
        type: 'website',
        url: `${APP_URL}/blog`,
        siteName: 'Fractional Forge',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Blog | Fractional Forge',
        description:
            'Insights from fractional executives on strategy, operations, fundraising, and scaling hardware startups.',
    },
    alternates: {
        canonical: `${APP_URL}/blog`,
    },
}

/**
 * Shape returned by the list_published_content RPC.
 * Note: this RPC intentionally omits the full content field for index performance.
 */
interface PublishedPostSummary {
    id: string
    title: string
    content_type: string
    publish_metadata: {
        slug: string
        meta_title?: string
        meta_description?: string
        og_image_url?: string
        tags?: string[]
        published_at?: string
        published_by?: string
    }
    created_by: string | null
    created_at: string
    foundry_id: string
}

function BlogGridSkeleton() {
    return (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-72 rounded-xl" />
            ))}
        </div>
    )
}

/**
 * Formats a date string into a human-readable format.
 */
function formatDate(dateString: string): string {
    try {
        return new Date(dateString).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        })
    } catch {
        return dateString
    }
}


async function BlogContent() {
    // SECURITY: admin client — public content via SECURITY DEFINER RPC
    const supabase = createAdminClient()

    const { data: posts, error } = await supabase.rpc('list_published_content', {
        p_content_type: 'blog',
        p_limit: 20,
        p_offset: 0,
    })

    if (error) {
        console.error('Failed to fetch published blog posts:', error)
        return (
            <div className="flex flex-col items-center justify-center py-16 text-center">
                <h3 className="text-lg font-semibold text-foreground">
                    Unable to load posts
                </h3>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                    Something went wrong. Please try again later.
                </p>
            </div>
        )
    }

    const typedPosts = (posts as PublishedPostSummary[] | null) ?? []

    if (typedPosts.length === 0) {
        return (
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
                            d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                        />
                    </svg>
                </div>
                <h3 className="text-lg font-semibold text-foreground">
                    No posts yet
                </h3>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                    Our specialists are working on insightful content. Check back soon.
                </p>
            </div>
        )
    }

    return (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {typedPosts.map((post) => {
                const slug = post.publish_metadata?.slug
                if (!slug) return null

                const publishedDate = post.publish_metadata?.published_at || post.created_at
                const tags = post.publish_metadata?.tags ?? []

                return (
                    <Link
                        key={post.id}
                        href={`/blog/${slug}`}
                        className="group"
                    >
                        <Card className="h-full hover:-translate-y-0.5 active:scale-[0.99] duration-200">
                            <CardHeader>
                                <div className="space-y-2">
                                    <time
                                        dateTime={publishedDate}
                                        className="text-xs text-muted-foreground"
                                    >
                                        {formatDate(publishedDate)}
                                    </time>
                                    <h2 className="text-lg font-semibold text-foreground leading-snug group-hover:text-international-orange transition-colors">
                                        {post.title}
                                    </h2>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                    {post.publish_metadata?.meta_description || 'Read more...'}
                                </p>
                            </CardContent>
                            <CardFooter>
                                <div className="flex flex-wrap items-center gap-2">
                                    {tags.slice(0, 3).map((tag) => (
                                        <Badge
                                            key={tag}
                                            variant="secondary"
                                            size="sm"
                                        >
                                            {tag}
                                        </Badge>
                                    ))}
                                </div>
                            </CardFooter>
                        </Card>
                    </Link>
                )
            })}
        </div>
    )
}

export default function BlogPage() {
    return (
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
            {/* Page header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    Blog
                </h1>
                <p className="mt-2 max-w-2xl text-lg text-muted-foreground leading-relaxed">
                    Insights from fractional executives on strategy, operations,
                    fundraising, and building hardware companies.
                </p>
            </div>

            {/* Content */}
            <div className="space-y-8">
                <Suspense fallback={<BlogGridSkeleton />}>
                    <BlogContent />
                </Suspense>
            </div>
        </div>
    )
}
