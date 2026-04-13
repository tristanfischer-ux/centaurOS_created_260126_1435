import { cache } from 'react'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { Badge } from '@/components/ui/badge'
import { Markdown } from '@/components/ui/markdown'
import { ChevronLeft, Clock } from 'lucide-react'

/**
 * /blog/[slug] - Public individual blog post page.
 *
 * @description SEO-optimized blog post page with JSON-LD structured data,
 * dynamic metadata, reading time, and view tracking. No authentication required.
 *
 * @security All data comes from SECURITY DEFINER RPC (get_published_content)
 * that only returns posts with publish_status = 'published'.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://fractionalforge.app'

/**
 * Shape returned by the get_published_content RPC.
 */
/**
 * Shape returned by the get_published_content SECURITY DEFINER RPC.
 * Matches the SELECT in the migration: id, title, content, content_type,
 * publish_metadata, created_by, created_at, updated_at, foundry_id.
 */
interface PublishedPost {
    id: string
    title: string
    content: string
    content_type: string
    publish_metadata: {
        slug: string
        meta_title?: string
        meta_description?: string
        og_image_url?: string
        tags?: string[]
        published_at?: string
        published_by?: string
        view_count?: number
    }
    created_by: string | null
    created_at: string
    updated_at: string
    foundry_id: string
}

interface PageProps {
    params: Promise<{ slug: string }>
}

/**
 * Estimates reading time based on word count.
 *
 * @param content - Markdown content string
 * @returns Human-readable reading time (e.g. "5 min read")
 */
function estimateReadingTime(content: string): string {
    const words = content.trim().split(/\s+/).length
    const minutes = Math.max(1, Math.ceil(words / 230))
    return `${minutes} min read`
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

/**
 * Fetches a published blog post by slug.
 * Returns null if not found or not published.
 */
// PERF: Deduplicate RPC calls — getPost is called from both generateMetadata and the page component (#R4-6)
const getPost = cache(async function getPost(slug: string): Promise<PublishedPost | null> {
    // SECURITY: admin client — public content via SECURITY DEFINER RPC
    const supabase = createAdminClient()

    const { data, error } = await supabase.rpc('get_published_content', {
        p_slug: slug,
    })

    if (error) {
        console.error('Failed to fetch blog post:', error)
        return null
    }

    // RPC returns a single row or null
    if (!data || (Array.isArray(data) && data.length === 0)) return null

    return Array.isArray(data) ? data[0] : data
})

/**
 * Looks up author display name from profiles table.
 * Falls back to publish_metadata.author_name if lookup fails.
 */
async function getAuthorName(profileId: string | undefined, fallback: string | undefined): Promise<string> {
    if (!profileId) return fallback || 'Fractional Forge Team'

    try {
        const supabase = createAdminClient()
        const { data } = await supabase
            .from('profiles')
            .select('user_name')
            .eq('id', profileId)
            .single()

        return data?.user_name || fallback || 'Fractional Forge Team'
    } catch {
        return fallback || 'Fractional Forge Team'
    }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params
    const post = await getPost(slug)

    if (!post) {
        return { title: 'Post Not Found' }
    }

    const meta = post.publish_metadata
    const title = meta?.meta_title || post.title
    const description = meta?.meta_description || post.content.slice(0, 160).replace(/\n/g, ' ')

    return {
        title,
        description,
        openGraph: {
            title,
            description,
            type: 'article',
            url: `${APP_URL}/blog/${slug}`,
            siteName: 'ForgeOS by Fractional Forge',
            ...(meta?.og_image_url ? { images: [{ url: meta.og_image_url }] } : {}),
            ...(meta?.published_at ? { publishedTime: meta.published_at } : {}),
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description,
            ...(meta?.og_image_url ? { images: [meta.og_image_url] } : {}),
        },
        alternates: {
            canonical: `${APP_URL}/blog/${slug}`,
        },
    }
}

/**
 * Generates JSON-LD structured data for a BlogPosting.
 *
 * @see https://schema.org/BlogPosting
 */
function generateBlogPostJsonLd(post: PublishedPost, authorName: string) {
    const meta = post.publish_metadata
    const publishedDate = meta?.published_at || post.created_at

    return {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: meta?.meta_title || post.title,
        description: meta?.meta_description || post.content.slice(0, 160).replace(/\n/g, ' '),
        url: `${APP_URL}/blog/${meta?.slug}`,
        datePublished: publishedDate,
        dateModified: publishedDate,
        author: {
            '@type': 'Person',
            name: authorName,
        },
        publisher: {
            '@type': 'Organization',
            name: 'Fractional Forge',
            url: APP_URL,
        },
        ...(meta?.og_image_url
            ? {
                  image: {
                      '@type': 'ImageObject',
                      url: meta.og_image_url,
                  },
              }
            : {}),
        ...(meta?.tags?.length
            ? { keywords: meta.tags.join(', ') }
            : {}),
        mainEntityOfPage: {
            '@type': 'WebPage',
            '@id': `${APP_URL}/blog/${meta?.slug}`,
        },
    }
}

export default async function BlogPostPage({ params }: PageProps) {
    const { slug } = await params
    const post = await getPost(slug)

    if (!post) {
        notFound()
    }

    const meta = post.publish_metadata
    const publishedDate = meta?.published_at || post.created_at
    const tags = meta?.tags ?? []
    const readingTime = estimateReadingTime(post.content)

    // FLOW: Look up author name from profiles via created_by
    const authorName = await getAuthorName(post.created_by ?? undefined, undefined)

    // Fire-and-forget: increment view count
    const supabase = createAdminClient()
    supabase.rpc('increment_content_view', { p_slug: slug }).then(({ error }) => {
        if (error) console.error('Failed to increment view count:', error)
    })

    const jsonLd = generateBlogPostJsonLd(post, authorName)

    return (
        <>
            {/* JSON-LD structured data */}
            {/* SECURITY: Escape </ sequences to prevent script injection (#5) */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
            />

            <article className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
                {/* Back link */}
                <Link
                    href="/blog"
                    className="mb-8 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="h-4 w-4" />
                    Back to Blog
                </Link>

                {/* Post header */}
                <header className="mb-8 space-y-4">
                    <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl leading-tight">
                        {post.title}
                    </h1>

                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">
                            {authorName}
                        </span>
                        <time dateTime={publishedDate}>
                            {formatDate(publishedDate)}
                        </time>
                        <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {readingTime}
                        </span>
                    </div>

                    {tags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {tags.map((tag) => (
                                <Badge
                                    key={tag}
                                    variant="secondary"
                                    size="sm"
                                >
                                    {tag}
                                </Badge>
                            ))}
                        </div>
                    )}
                </header>

                {/* Divider */}
                <hr className="mb-8 border-t border-border" />

                {/* Post content */}
                <div className="prose-forge">
                    <Markdown
                        content={post.content}
                        className="text-foreground leading-relaxed"
                    />
                </div>

                {/* Post footer */}
                <footer className="mt-12 border-t border-border pt-8">
                    <div className="flex items-center justify-between">
                        <Link
                            href="/blog"
                            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <ChevronLeft className="h-4 w-4" />
                            Back to Blog
                        </Link>
                    </div>
                </footer>
            </article>
        </>
    )
}
