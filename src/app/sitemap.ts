import type { MetadataRoute } from 'next'
import { getDirectoryExpertSlugs, getDirectoryLocations } from '@/actions/directory'
import { DIRECTORY_ROLE_CATEGORIES, locationToSlug } from '@/lib/directory/types'
import type { DirectoryRoleSlug } from '@/lib/directory/types'
import { createAdminClient } from '@/lib/supabase/admin'

// INTENT: Force dynamic so sitemap is generated at request time, not during build.
// Supabase calls timeout during Vercel build (60s limit) because the build
// environment has higher latency to Supabase than the runtime environment.
export const dynamic = 'force-dynamic'

/**
 * Generates a dynamic sitemap for search engine indexing.
 *
 * @description Includes:
 * 1. Static marketing pages (/, /experts, /blog)
 * 2. Role category pages (/experts/fractional-cmo, etc.)
 * 3. Long-tail role + location pages (/experts/fractional-cmo/london)
 * 4. Individual expert profile pages (/expert/[slug])
 * 5. Published blog posts (/blog/[slug])
 *
 * @security Only public pages included. No authenticated routes.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://fractionalforge.app'
    const now = new Date()

    // Static pages
    const staticPages: MetadataRoute.Sitemap = [
        {
            url: appUrl,
            lastModified: now,
            changeFrequency: 'weekly',
            priority: 1.0,
        },
        {
            url: `${appUrl}/experts`,
            lastModified: now,
            changeFrequency: 'daily',
            priority: 0.9,
        },
        {
            url: `${appUrl}/blog`,
            lastModified: now,
            changeFrequency: 'daily',
            priority: 0.8,
        },
        {
            url: `${appUrl}/pricing`,
            lastModified: now,
            changeFrequency: 'monthly',
            priority: 0.9,
        },
        {
            url: `${appUrl}/terms`,
            lastModified: now,
            changeFrequency: 'yearly',
            priority: 0.3,
        },
        {
            url: `${appUrl}/privacy`,
            lastModified: now,
            changeFrequency: 'yearly',
            priority: 0.3,
        },
    ]

    // Role category pages (known set)
    const rolePages: MetadataRoute.Sitemap = Object.keys(DIRECTORY_ROLE_CATEGORIES).map(
        (roleSlug) => ({
            url: `${appUrl}/experts/${roleSlug}`,
            lastModified: now,
            changeFrequency: 'daily' as const,
            priority: 0.8,
        })
    )

    // Dynamic: individual expert profiles
    let expertPages: MetadataRoute.Sitemap = []
    try {
        const slugs = await getDirectoryExpertSlugs()
        expertPages = slugs.map((slug) => ({
            url: `${appUrl}/expert/${slug}`,
            lastModified: now,
            changeFrequency: 'weekly' as const,
            priority: 0.7,
        }))
    } catch (error) {
        console.error('[Sitemap] Failed to fetch expert slugs:', error)
    }

    // Dynamic: long-tail role + location pages
    let locationPages: MetadataRoute.Sitemap = []
    try {
        const locations = await getDirectoryLocations()
        const roleKeys = Object.keys(DIRECTORY_ROLE_CATEGORIES) as DirectoryRoleSlug[]

        locationPages = roleKeys.flatMap((roleSlug) =>
            locations.map((loc) => ({
                url: `${appUrl}/experts/${roleSlug}/${locationToSlug(loc.location_name)}`,
                lastModified: now,
                changeFrequency: 'weekly' as const,
                priority: 0.6,
            }))
        )
    } catch (error) {
        console.error('[Sitemap] Failed to fetch locations:', error)
    }

    // Dynamic: published blog posts
    let blogPages: MetadataRoute.Sitemap = []
    try {
        const adminClient = createAdminClient()
        const { data: posts } = await adminClient.rpc('list_published_content', {
            p_content_type: 'blog',
            p_limit: 500,
            p_offset: 0,
        })
        if (posts) {
            // SECURITY: Filter out posts without slugs to prevent invalid sitemap entries (#15)
            blogPages = posts
                .filter((post: { publish_metadata: Record<string, unknown> }) =>
                    (post.publish_metadata as Record<string, unknown>)?.slug)
                .map((post: { publish_metadata: Record<string, unknown>; created_at: string }) => ({
                    url: `${appUrl}/blog/${(post.publish_metadata as Record<string, unknown>).slug}`,
                    lastModified: new Date((post.publish_metadata as Record<string, unknown>)?.published_at as string || post.created_at),
                    changeFrequency: 'weekly' as const,
                    priority: 0.7,
                }))
        }
    } catch (error) {
        console.error('[Sitemap] Failed to fetch published blog posts:', error)
    }

    return [...staticPages, ...rolePages, ...expertPages, ...locationPages, ...blogPages]
}
